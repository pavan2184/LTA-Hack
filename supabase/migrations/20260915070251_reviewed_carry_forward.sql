-- Reviewed carry-forward preserves baseline facts and immutable request/plan history.
-- Only approval changes the active occurrence; preparation creates an ordinary draft.
create table railplan_private.work_item_active_occurrences (
 work_item_id uuid primary key references railplan_private.work_items(id),
 request_id text,
 planning_night date references public.planning_nights(planning_night),
 submission_id uuid references railplan_private.request_submissions(id),
 submission_version integer,
 generation integer not null check(generation>0),
 check ((request_id is null and planning_night is null and submission_id is null and submission_version is null)
   or (request_id is not null and submission_id is not null and submission_version is not null
       and request_id='R-'||submission_id and planning_night is not null and submission_version>0))
);
create table railplan_private.carry_forward_preparations (
 submission_id uuid primary key references railplan_private.request_submissions(id),
 work_item_id uuid not null references railplan_private.work_items(id),
 target_night date not null references public.planning_nights(planning_night),
 source_request_id text not null,
 source_night date not null,
 source_submission_version integer,
 source_generation integer not null,
 original_dependencies jsonb not null check(jsonb_typeof(original_dependencies)='array'),
 original_fields jsonb not null check(jsonb_typeof(original_fields)='object'),
 actor_id uuid not null,
 idempotency_key uuid not null,
 input jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(actor_id,idempotency_key),
 unique(work_item_id,target_night,source_generation)
);
do $$ declare t text; begin
 foreach t in array array['work_item_active_occurrences','carry_forward_preparations'] loop
  execute format('alter table railplan_private.%I enable row level security',t);
  execute format('revoke all on railplan_private.%I from public,anon,authenticated',t);
  execute format('grant select on railplan_private.%I to authenticated',t);
  execute format('create policy planner_read on railplan_private.%I for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role=''planner''))',t);
 end loop;
end $$;
create trigger immutable_history before update or delete or truncate on railplan_private.carry_forward_preparations
 for each statement execute function railplan_private.reject_plan_mutation();

create function railplan_private.invalidate_work_occurrence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update railplan_private.planning_source set revision=revision+1,lock_generation=lock_generation+1 where singleton;
 return null;
end $$;
revoke all on function railplan_private.invalidate_work_occurrence() from public,anon,authenticated;
create trigger invalidate_source before insert or update or delete or truncate on railplan_private.work_item_active_occurrences
 for each statement execute function railplan_private.invalidate_work_occurrence();

-- Null mapping identity is deliberately retired, never a fallback to old baseline.
create function railplan_private.active_work_occurrence(wid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare w railplan_private.work_items; m railplan_private.work_item_active_occurrences; s railplan_private.request_submissions; f jsonb;
begin
 select * into w from railplan_private.work_items where id=wid;
 select * into m from railplan_private.work_item_active_occurrences where work_item_id=wid;
 if m.work_item_id is not null then
  return jsonb_build_object('requestId',m.request_id,'planningNight',m.planning_night,'submissionId',m.submission_id,'submissionRevision',m.submission_version,'generation',m.generation);
 end if;
 if w.source_key like 'seed:%' then
  if not exists(select 1 from public.maintenance_requests where id=w.source_request_id and planning_night=w.source_night) then return null; end if;
  return jsonb_build_object('requestId',w.source_request_id,'planningNight',w.source_night,'submissionId',null,'submissionRevision',null,'generation',0);
 end if;
 select rs.* into s from railplan_private.request_submissions rs where 'R-'||rs.id=w.source_request_id;
 if s.active_approved_version is null then return null; end if;
 select fields into f from railplan_private.request_revisions where submission_id=s.id and version=s.active_approved_version;
 return jsonb_build_object('requestId','R-'||s.id,'planningNight',f->>'planningNight','submissionId',s.id,'submissionRevision',s.active_approved_version,'generation',0);
end $$;
revoke all on function railplan_private.active_work_occurrence(uuid) from public,anon,authenticated;

create function railplan_private.baseline_occurrence_active(night date,rid text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='planner') and not exists(
  select 1 from railplan_private.work_items w join railplan_private.work_item_active_occurrences m on m.work_item_id=w.id
  where w.source_key like 'seed:%' and w.source_night=night and w.source_request_id=rid)
$$;
-- Maintenance loader also runs as the database owner without JWT. RLS-protected
-- mapping reads below are used by that loader; this helper serves SQL validators.
revoke all on function railplan_private.baseline_occurrence_active(date,text) from public,anon,authenticated;

create function railplan_private.work_source_publication(wid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare active jsonb; pub uuid;
begin
 active:=railplan_private.active_work_occurrence(wid);
 select p.plan_id into pub from railplan_private.plan_publications p join railplan_private.planning_runs r on r.id=p.plan_id
 where r.planning_night::text=active->>'planningNight'
 and not exists(select 1 from railplan_private.plan_publications later where later.supersedes=p.plan_id)
 and exists(select 1 from jsonb_array_elements(r.facts->'requests') f where f->>'id'=active->>'requestId'
   and (f->>'submissionRevision')::integer is not distinct from (active->>'submissionRevision')::integer);
 if pub is null then return null; end if;
 return jsonb_build_object('planId',pub,'submissionRevision',active->'submissionRevision');
end $$;
revoke all on function railplan_private.work_source_publication(uuid) from public,anon,authenticated;

create function railplan_private.prepare_carry_forward(wid uuid,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w railplan_private.work_items; prior railplan_private.carry_forward_preparations; active jsonb; fact jsonb; fields jsonb;
 deps jsonb; org uuid; target date; made jsonb; source_fields jsonb;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then return '{"error":"forbidden"}'; end if;
 if jsonb_typeof(command) is distinct from 'object' or command-array['expectedVersion','targetNight','organisationId','idempotencyKey']<>'{}'
  or not command ?& array['expectedVersion','targetNight','idempotencyKey'] then return '{"error":"invalid_request"}'; end if;
 perform railplan_private.lock_planning_source();
 select * into prior from railplan_private.carry_forward_preparations where actor_id=auth.uid() and idempotency_key=(command->>'idempotencyKey')::uuid;
 if prior.submission_id is not null then
  if prior.work_item_id<>wid or prior.input is distinct from command then return '{"error":"conflict"}'; end if;
  return jsonb_build_object('requestId',prior.submission_id);
 end if;
 select * into w from railplan_private.work_items where id=wid for update;
 if w.id is null then return '{"error":"not_found"}'; end if;
 if w.version is distinct from (command->>'expectedVersion')::integer or w.lifecycle<>'open' then return '{"error":"conflict"}'; end if;
 active:=railplan_private.active_work_occurrence(wid);
 if active->>'requestId' is null then return '{"error":"conflict"}'; end if;
 target:=(command->>'targetNight')::date;
 if target is null or target::text=active->>'planningNight' or not exists(select 1 from public.planning_nights where planning_night=target) then return '{"error":"invalid_request"}'; end if;
 org:=coalesce(w.organisation_id,(command->>'organisationId')::uuid);
 if org is null or (w.organisation_id is not null and command ? 'organisationId' and (command->>'organisationId')::uuid is distinct from w.organisation_id)
  or not exists(select 1 from public.contractor_organisations where id=org) then return '{"error":"invalid_request"}'; end if;
 select * into prior from railplan_private.carry_forward_preparations where work_item_id=wid and target_night=target and source_generation=(active->>'generation')::integer;
 if prior.submission_id is not null then return jsonb_build_object('requestId',prior.submission_id); end if;
 if active->>'submissionId' is not null then
  select r.fields,r.approval->'dependencies' into source_fields,deps from railplan_private.request_revisions r
   where submission_id=(active->>'submissionId')::uuid and version=(active->>'submissionRevision')::integer;
 else
  select f into fact from railplan_private.planning_runs r,jsonb_array_elements(r.facts->'requests') f where r.id=w.source_plan_id and f->>'id'=w.source_request_id;
  select jsonb_build_object('planningNight',w.source_night,'title',fact->'title','description',fact->'description','workClass',fact->'workClass',
   'blockIds',fact->'blockIds','durationMinutes',fact->'durationMinutes','preferredStart',fact->'preferredStart','earliestStart',fact->'earliestStart','latestEnd',fact->'latestEnd',
   'equipment',fact->'equipment','workforce',coalesce((select jsonb_agg(d-'requestId') from railplan_private.planning_runs r,jsonb_array_elements(r.facts->'workforceDemand') d where r.id=w.source_plan_id and d->>'requestId'=w.source_request_id),'[]'::jsonb)) into source_fields;
  deps:=fact->'dependencies';
 end if;
 fields:=source_fields||jsonb_build_object('planningNight',target);
 -- The existing create path validates configured target bounds and references.
 made:=railplan_private.create_planner_request(org,fields);
 if made ? 'code' then return jsonb_build_object('error',made->>'code'); end if;
 insert into railplan_private.work_item_submissions(submission_id,work_item_id,planning_night,kind,created_by)
 values((made->>'id')::uuid,wid,target,'carry-forward',auth.uid());
 insert into railplan_private.carry_forward_preparations(submission_id,work_item_id,target_night,source_request_id,source_night,source_submission_version,source_generation,original_dependencies,original_fields,actor_id,idempotency_key,input)
 values((made->>'id')::uuid,wid,target,active->>'requestId',(active->>'planningNight')::date,(active->>'submissionRevision')::integer,(active->>'generation')::integer,coalesce(deps,'[]'),source_fields,auth.uid(),(command->>'idempotencyKey')::uuid,command);
 update railplan_private.work_items set organisation_id=org,proposed_night=target,version=version+1,updated_at=clock_timestamp() where id=wid;
 insert into railplan_private.work_item_events(work_item_id,kind,actor_id,metadata)
 values(wid,'update',auth.uid(),jsonb_build_object('preparedRequestId',made->>'id','targetNight',target));
 return jsonb_build_object('requestId',made->>'id');
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range or not_null_violation then return '{"error":"invalid_request"}';
end $$;
revoke all on function railplan_private.prepare_carry_forward(uuid,jsonb) from public,anon;
grant execute on function railplan_private.prepare_carry_forward(uuid,jsonb) to authenticated;

-- Keep one public application approval entry point. The old implementation is
-- callable only by this guarded definer, never by authenticated/anonymous SQL.
alter function railplan_private.mutate_request(uuid,integer,text,jsonb,jsonb,text) rename to mutate_request_before_carry_forward;
revoke all on function railplan_private.mutate_request_before_carry_forward(uuid,integer,text,jsonb,jsonb,text) from public,anon,authenticated;
create function railplan_private.mutate_request(request_id uuid,expected_version integer,operation text,new_fields jsonb,new_approval jsonb,decision_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare wid uuid; w railplan_private.work_items; prep railplan_private.carry_forward_preparations; active jsonb; review jsonb; pub jsonb;
 result jsonb; target_fields jsonb; dep text; moving boolean:=false; current_actor public.profiles;
begin
 select * into current_actor from public.profiles where id=auth.uid();
 if current_actor.id is null then return '{"code":"forbidden"}'; end if;
 if operation='approve' and current_actor.role<>'planner' then return '{"code":"forbidden"}'; end if;
 perform railplan_private.lock_planning_source();
 select work_item_id into wid from railplan_private.work_item_submissions where submission_id=request_id;
 if wid is not null then
  select * into w from railplan_private.work_items where id=wid for update;
  perform 1 from railplan_private.request_submissions where id in(select submission_id from railplan_private.work_item_submissions where work_item_id=wid) order by id for update;
  active:=railplan_private.active_work_occurrence(wid);
 end if;
 if operation='approve' then
  review:=new_approval->'carryForward';
  select * into prep from railplan_private.carry_forward_preparations where submission_id=request_id;
  if prep.submission_id is not null and active->>'requestId' is distinct from 'R-'||request_id then
   moving:=true;
   if w.lifecycle<>'open' or active->>'requestId' is null
    or prep.source_generation is distinct from (active->>'generation')::integer
    or prep.source_request_id is distinct from active->>'requestId'
    or prep.source_submission_version is distinct from (active->>'submissionRevision')::integer then return '{"code":"conflict"}'; end if;
   if jsonb_typeof(review) is distinct from 'object' or review-array['expectedWorkVersion','dependenciesReviewed','publication']<>'{}'
    or review->'dependenciesReviewed' is distinct from 'true'::jsonb then return '{"code":"invalid_request","fieldErrors":{"carryForward":"Review target-night dependencies before approval."}}'; end if;
   if (review->>'expectedWorkVersion')::integer is distinct from w.version then return '{"code":"conflict"}'; end if;
   select r.fields into target_fields from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.current_version where s.id=request_id;
   if target_fields->>'planningNight' is distinct from prep.target_night::text then return '{"code":"invalid_request","fieldErrors":{"planningNight":"Use the prepared target night."}}'; end if;
   -- Acknowledgement cannot clear actual inbound dependencies.
   if exists(select 1 from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.active_approved_version
     where s.id<>request_id and r.approval->'dependencies' ? (active->>'requestId'))
    or exists(select 1 from public.request_dependencies d join public.maintenance_requests r on r.id=d.request_id
      where d.depends_on_id=active->>'requestId' and railplan_private.baseline_occurrence_active(r.planning_night,r.id)) then
    return '{"code":"invalid_request","fieldErrors":{"dependencies":"Active work depends on the earlier occurrence. Resolve those dependencies first."}}';
   end if;
   pub:=railplan_private.work_source_publication(wid);
   if pub is not null and review->'publication' is null then return '{"code":"invalid_request","fieldErrors":{"carryForward":"Explicitly confirm retirement of the current published source."}}'; end if;
   if coalesce(review->'publication','null'::jsonb) is distinct from coalesce(pub,'null'::jsonb) then return '{"code":"conflict"}'; end if;
  elsif wid is not null and active->>'requestId' is distinct from 'R-'||request_id
    and not (active is null and w.source_request_id='R-'||request_id
      and not exists(select 1 from railplan_private.work_item_active_occurrences where work_item_id=wid)) then
   -- An old source revision or stale linked draft cannot revive duplicate work.
   return '{"code":"conflict"}';
  elsif review is not null then return '{"code":"invalid_request"}';
  end if;
  -- Existing validator checks all target dependencies and safety/skills/windows.
  for dep in select jsonb_array_elements_text(new_approval->'dependencies') loop
   if exists(select 1 from public.maintenance_requests r where id=dep and not railplan_private.baseline_occurrence_active(r.planning_night,r.id)) then
    return '{"code":"invalid_request","fieldErrors":{"approval.dependencies":"Choose active dependencies on the target night."}}';
   end if;
  end loop;
 end if;
 result:=railplan_private.mutate_request_before_carry_forward(request_id,expected_version,operation,new_fields,new_approval-'carryForward',decision_reason);
 if result ? 'code' then return result; end if;
 if moving then
  if active->>'submissionId' is not null then
   update railplan_private.request_submissions set active_approved_version=null where id=(active->>'submissionId')::uuid;
  end if;
  insert into railplan_private.work_item_active_occurrences(work_item_id,request_id,planning_night,submission_id,submission_version,generation)
  values(wid,'R-'||request_id,prep.target_night,request_id,(result->>'version')::integer,(active->>'generation')::integer+1)
  on conflict(work_item_id) do update set request_id=excluded.request_id,planning_night=excluded.planning_night,submission_id=excluded.submission_id,submission_version=excluded.submission_version,generation=excluded.generation;
  update railplan_private.work_items set proposed_night=null,version=version+1,updated_at=clock_timestamp() where id=wid;
  insert into railplan_private.work_item_events(work_item_id,kind,actor_id,note,metadata)
  values(wid,'update',auth.uid(),left(btrim(decision_reason),1000),jsonb_build_object('approvedCarryForwardRequestId',request_id,'retiredOccurrence',active,'confirmedPublication',pub));
 elsif wid is not null and operation in ('approve','cancel') then
  if exists(select 1 from railplan_private.work_item_active_occurrences where work_item_id=wid) and active->>'requestId'='R-'||request_id then
   update railplan_private.work_item_active_occurrences as occurrence set request_id=case when operation='approve' then occurrence.request_id else null end,
    planning_night=case when operation='approve' then (select fields->>'planningNight' from railplan_private.request_revisions where submission_id=mutate_request.request_id and version=(result->>'version')::integer)::date else null end,
    submission_id=case when operation='approve' then occurrence.submission_id else null end,submission_version=case when operation='approve' then (result->>'version')::integer else null end,generation=occurrence.generation+1 where occurrence.work_item_id=wid;
  end if;
  update railplan_private.work_items set version=version+1,updated_at=clock_timestamp() where id=wid;
 end if;
 return result;
exception when invalid_text_representation or numeric_value_out_of_range then return '{"code":"invalid_request"}';
end $$;
revoke all on function railplan_private.mutate_request(uuid,integer,text,jsonb,jsonb,text) from public,anon;
grant execute on function railplan_private.mutate_request(uuid,integer,text,jsonb,jsonb,text) to authenticated;

create function railplan_private.read_carry_forward(request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; prep railplan_private.carry_forward_preparations; w railplan_private.work_items; s railplan_private.request_submissions; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid();
 select * into s from railplan_private.request_submissions where id=request_id;
 if actor.id is null or s.id is null or (actor.role<>'planner' and (actor.contractor_organisation_id is null or s.organisation_id is distinct from actor.contractor_organisation_id)) then return null; end if;
 select * into prep from railplan_private.carry_forward_preparations where submission_id=request_id;
 if prep.submission_id is null then return null; end if;
 select * into w from railplan_private.work_items where id=prep.work_item_id;
 result:=jsonb_build_object('workItemId',w.id,'sourceNight',prep.source_night,'targetNight',prep.target_night);
 if actor.role='planner' then result:=result||jsonb_build_object('expectedWorkVersion',w.version,'originalDependencies',prep.original_dependencies,'originalFields',prep.original_fields,'publication',railplan_private.work_source_publication(w.id)); end if;
 return result;
end $$;
revoke all on function railplan_private.read_carry_forward(uuid) from public,anon;
grant execute on function railplan_private.read_carry_forward(uuid) to authenticated;

-- Preserve the reviewed contractor allowlist and full history projection. The
-- wrapper changes only the scheduled observation for a retired baseline source.
alter function railplan_private.read_work_item(uuid,boolean) rename to read_work_item_before_carry_forward;
revoke all on function railplan_private.read_work_item_before_carry_forward(uuid,boolean) from public,anon,authenticated;
create function railplan_private.read_work_item(wid uuid,include_history boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; active jsonb; scheduled boolean;
begin
 payload:=railplan_private.read_work_item_before_carry_forward(wid,include_history);
 if payload is null then return null; end if;
 if payload->>'state'='scheduled' then
  active:=railplan_private.active_work_occurrence(wid);
  select exists(select 1 from railplan_private.plan_publications p join railplan_private.planning_runs r on r.id=p.plan_id
   join railplan_private.plan_placements slot on slot.plan_id=p.plan_id and slot.request_id=active->>'requestId'
   join jsonb_array_elements(r.facts->'requests') f on f->>'id'=slot.request_id
   where r.planning_night::text=active->>'planningNight' and not exists(select 1 from railplan_private.plan_publications later where later.supersedes=p.plan_id)
   and (f->>'submissionRevision')::integer is not distinct from (active->>'submissionRevision')::integer) into scheduled;
  if not scheduled then payload:=jsonb_set(payload,'{state}','"open"'); end if;
 end if;
 return payload;
end $$;
revoke all on function railplan_private.read_work_item(uuid,boolean) from public,anon;
grant execute on function railplan_private.read_work_item(uuid,boolean) to authenticated;

alter function railplan_private.request_catalogue() rename to request_catalogue_before_carry_forward;
revoke all on function railplan_private.request_catalogue_before_carry_forward() from public,anon,authenticated;
create function railplan_private.request_catalogue() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=railplan_private.request_catalogue_before_carry_forward();
 if result ? 'dependencies' then
  result:=jsonb_set(result,'{dependencies}',coalesce((select jsonb_agg(d) from jsonb_array_elements(result->'dependencies') d
   where not exists(select 1 from public.maintenance_requests r where r.id=d->>'id' and not railplan_private.baseline_occurrence_active(r.planning_night,r.id))),'[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on function railplan_private.request_catalogue() from public,anon;
grant execute on function railplan_private.request_catalogue() to authenticated;
