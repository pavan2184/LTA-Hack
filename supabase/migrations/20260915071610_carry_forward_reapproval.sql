-- Retain the last active intake identity when cancellation clears its active
-- fields. Only that latest occurrence may use normal same-night reapproval.
alter table railplan_private.work_item_active_occurrences add column last_submission_id uuid references railplan_private.request_submissions(id);
update railplan_private.work_item_active_occurrences m set last_submission_id=coalesce(m.submission_id,
 (select (e.metadata->>'approvedCarryForwardRequestId')::uuid from railplan_private.work_item_events e
  where e.work_item_id=m.work_item_id and e.metadata ? 'approvedCarryForwardRequestId' order by e.id desc limit 1));
alter table railplan_private.work_item_active_occurrences alter column last_submission_id set not null;

create or replace function railplan_private.active_work_occurrence(wid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare w railplan_private.work_items; m railplan_private.work_item_active_occurrences; s railplan_private.request_submissions; f jsonb;
begin
 select * into w from railplan_private.work_items where id=wid;
 select * into m from railplan_private.work_item_active_occurrences where work_item_id=wid;
 if m.work_item_id is not null then
  return jsonb_build_object('requestId',m.request_id,'planningNight',m.planning_night,'submissionId',m.submission_id,'submissionRevision',m.submission_version,'generation',m.generation,'lastSubmissionId',m.last_submission_id);
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

create or replace function railplan_private.mutate_request(request_id uuid,expected_version integer,operation text,new_fields jsonb,new_approval jsonb,decision_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare wid uuid; w railplan_private.work_items; prep railplan_private.carry_forward_preparations; active jsonb; review jsonb; pub jsonb;
 result jsonb; target_fields jsonb; dep text; moving boolean:=false; restoring boolean:=false; current_actor public.profiles;
begin
 select * into current_actor from public.profiles where id=auth.uid();
 if current_actor.id is null then return '{"code":"forbidden"}'; end if;
 if operation='approve' and current_actor.role<>'planner' then return '{"code":"forbidden"}'; end if;
 -- Contractor draft transitions share the source lock without planner-only helper authorization.
 update railplan_private.planning_source set lock_generation=lock_generation+1 where singleton;
 select work_item_id into wid from railplan_private.work_item_submissions where submission_id=request_id;
 if wid is not null then
  select * into w from railplan_private.work_items where id=wid for update;
  perform 1 from railplan_private.request_submissions where id in(select submission_id from railplan_private.work_item_submissions where work_item_id=wid) order by id for update;
  active:=railplan_private.active_work_occurrence(wid);
 end if;
 if operation='approve' then
  review:=new_approval->'carryForward';
  restoring:=coalesce(active->>'requestId' is null and active->>'lastSubmissionId'=request_id::text,false);
  select r.fields into target_fields from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.current_version where s.id=request_id;
  if wid is not null and (active->>'requestId'='R-'||request_id or restoring or (active is null and w.source_request_id='R-'||request_id))
   and target_fields->>'planningNight' is distinct from coalesce(active->>'planningNight',
     (select r.fields->>'planningNight' from railplan_private.request_revisions r where r.submission_id=request_id and r.status='approved' order by r.version desc limit 1)) then
   return '{"code":"invalid_request","fieldErrors":{"planningNight":"Use a reviewed carry-forward request to change the active night."}}';
  end if;
  select * into prep from railplan_private.carry_forward_preparations where submission_id=request_id;
  if prep.submission_id is not null and not restoring and active->>'requestId' is distinct from 'R-'||request_id then
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
  elsif wid is not null and not restoring and active->>'requestId' is distinct from 'R-'||request_id
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
  insert into railplan_private.work_item_active_occurrences(work_item_id,request_id,planning_night,submission_id,submission_version,generation,last_submission_id)
  values(wid,'R-'||request_id,prep.target_night,request_id,(result->>'version')::integer,(active->>'generation')::integer+1,request_id)
  on conflict(work_item_id) do update set request_id=excluded.request_id,planning_night=excluded.planning_night,submission_id=excluded.submission_id,submission_version=excluded.submission_version,generation=excluded.generation,last_submission_id=excluded.last_submission_id;
  update railplan_private.work_items set proposed_night=null,version=version+1,updated_at=clock_timestamp() where id=wid;
  insert into railplan_private.work_item_events(work_item_id,kind,actor_id,note,metadata)
  values(wid,'update',auth.uid(),left(btrim(decision_reason),1000),jsonb_build_object('approvedCarryForwardRequestId',request_id,'retiredOccurrence',active,'confirmedPublication',pub));
 elsif wid is not null and operation in ('approve','cancel') then
  if exists(select 1 from railplan_private.work_item_active_occurrences where work_item_id=wid) and (active->>'requestId'='R-'||request_id or restoring) then
   update railplan_private.work_item_active_occurrences as occurrence set request_id=case when operation='approve' then 'R-'||mutate_request.request_id else null end,
    planning_night=case when operation='approve' then (select fields->>'planningNight' from railplan_private.request_revisions where submission_id=mutate_request.request_id and version=(result->>'version')::integer)::date else null end,
    submission_id=case when operation='approve' then mutate_request.request_id else null end,submission_version=case when operation='approve' then (result->>'version')::integer else null end,generation=occurrence.generation+1 where occurrence.work_item_id=wid;
  end if;
  update railplan_private.work_items set version=version+1,updated_at=clock_timestamp() where id=wid;
 end if;
 return result;
exception when invalid_text_representation or numeric_value_out_of_range then return '{"code":"invalid_request"}';
end $$;
revoke all on function railplan_private.mutate_request(uuid,integer,text,jsonb,jsonb,text) from public,anon;
grant execute on function railplan_private.mutate_request(uuid,integer,text,jsonb,jsonb,text) to authenticated;

create or replace function railplan_private.read_carry_forward(request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; prep railplan_private.carry_forward_preparations; w railplan_private.work_items; s railplan_private.request_submissions; result jsonb; active jsonb;
begin
 select * into actor from public.profiles where id=auth.uid();
 select * into s from railplan_private.request_submissions where id=request_id;
 if actor.id is null or s.id is null or (actor.role<>'planner' and (actor.contractor_organisation_id is null or s.organisation_id is distinct from actor.contractor_organisation_id)) then return null; end if;
 select * into prep from railplan_private.carry_forward_preparations where submission_id=request_id;
 if prep.submission_id is null then return null; end if;
 select * into w from railplan_private.work_items where id=prep.work_item_id;
 result:=jsonb_build_object('workItemId',w.id,'sourceNight',prep.source_night,'targetNight',prep.target_night);
 active:=railplan_private.active_work_occurrence(w.id);
 if actor.role='planner' then result:=result||jsonb_build_object('requiresReview',not(coalesce(active->>'requestId'='R-'||request_id,false) or coalesce(active->>'requestId' is null and active->>'lastSubmissionId'=request_id::text,false)),'expectedWorkVersion',w.version,'originalDependencies',prep.original_dependencies,'originalFields',prep.original_fields,'publication',railplan_private.work_source_publication(w.id)); end if;
 return result;
end $$;
revoke all on function railplan_private.read_carry_forward(uuid) from public,anon;
grant execute on function railplan_private.read_carry_forward(uuid) to authenticated;
