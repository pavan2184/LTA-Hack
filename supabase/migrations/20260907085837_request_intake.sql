-- Intake is separate from operator-owned baseline facts. No authenticated role
-- can mutate history or pointers directly; actor-derived functions own transitions.
create table railplan_private.request_submissions (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.contractor_organisations(id),
 current_version integer not null default 1 check(current_version>0),
 active_approved_version integer,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create table railplan_private.request_revisions (
 submission_id uuid not null references railplan_private.request_submissions(id),
 version integer not null check(version>0),
 status text not null check(status in ('draft','submitted','needs_info','approved','rejected','cancelled')),
 fields jsonb not null, approval jsonb,
 action text not null, from_status text, actor_id uuid not null,
 reason text not null check(length(reason)<=2000),
 created_at timestamptz not null default clock_timestamp(),
 primary key(submission_id,version),
 check(status<>'approved' or approval is not null)
);
alter table railplan_private.request_submissions add constraint request_current_revision
 foreign key(id,current_version) references railplan_private.request_revisions(submission_id,version) deferrable initially deferred;
alter table railplan_private.request_submissions add constraint request_active_revision
 foreign key(id,active_approved_version) references railplan_private.request_revisions(submission_id,version) deferrable initially deferred;
create index request_organisation_idx on railplan_private.request_submissions(organisation_id);
alter table railplan_private.request_submissions enable row level security;
alter table railplan_private.request_revisions enable row level security;
revoke all on railplan_private.request_submissions,railplan_private.request_revisions from public,anon,authenticated;
grant select on railplan_private.request_submissions,railplan_private.request_revisions to authenticated;
create policy request_scoped_read on railplan_private.request_submissions for select to authenticated
 using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (p.role='planner' or p.contractor_organisation_id=organisation_id)));
create policy request_revision_scoped_read on railplan_private.request_revisions for select to authenticated
 using(exists(select 1 from railplan_private.request_submissions s where s.id=submission_id));
create trigger immutable_request_history before update or delete or truncate on railplan_private.request_revisions
 for each statement execute function railplan_private.reject_plan_mutation();

-- Deliberate limited catalogue: no requests, supply, team assignments, global
-- planning snapshots or organisation data leak into contractor selection options.
create function railplan_private.request_catalogue() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor_role public.user_role; result jsonb;
begin
 select role into actor_role from public.profiles where id=auth.uid();
 if auth.uid() is null or actor_role is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select jsonb_build_object(
 'nights',coalesce((select jsonb_agg(jsonb_build_object('planningNight',planning_night::text,'startMinute',window_start_minute,'endMinute',window_end_minute,'slotMinutes',slot_minutes) order by planning_night) from public.planning_nights),'[]'::jsonb),
 'blocks',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',from_station||'–'||to_station) order by id) from public.track_blocks),'[]'::jsonb),
 'workClasses',to_jsonb(enum_range(null::public.work_class)),
 'equipment',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'capacity',units) order by id) from public.equipment_types),'[]'::jsonb),
 'roles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by id) from public.workforce_roles),'[]'::jsonb)
 ) into result;
 if actor_role='planner' then result:=result||jsonb_build_object(
 'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'skills',coalesce((select jsonb_agg(skill order by skill) from public.team_skills where team_id=t.id),'[]'::jsonb)) order by t.id) from public.teams t),'[]'::jsonb),
 'dependencies',coalesce((select jsonb_agg(d order by d->>'id') from (
 select jsonb_build_object('id',id,'title',title,'planningNight',planning_night::text) d from public.maintenance_requests
 union all select jsonb_build_object('id','R-'||s.id,'title',r.fields->>'title','planningNight',r.fields->>'planningNight') from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.active_approved_version
 ) q),'[]'::jsonb)); end if;
 return result;
end $$;
revoke all on function railplan_private.request_catalogue() from public,anon;
grant execute on function railplan_private.request_catalogue() to authenticated;

-- A second validator at the SQL boundary makes direct function invocation no
-- weaker than HTTP. Failures return bounded field names; input is never logged.
create function railplan_private.validate_request_fields(f jsonb, complete boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare errors jsonb:='{}'; k text; item jsonb; n public.planning_nights; i integer; seen text[]; capacity integer;
begin
 if jsonb_typeof(f) is distinct from 'object' or not(f ?& array['planningNight','title','description','workClass','blockIds','durationMinutes','preferredStart','earliestStart','latestEnd','equipment','workforce'])
 or exists(select 1 from jsonb_object_keys(f) key where key<>all(array['planningNight','title','description','workClass','blockIds','durationMinutes','preferredStart','earliestStart','latestEnd','equipment','workforce'])) then return '{"fields":"Supply only the supported request fields."}'; end if;
 foreach k in array array['planningNight','title','description','workClass'] loop
 if jsonb_typeof(f->k) is distinct from 'string' then errors:=errors||jsonb_build_object(k,'Enter text.'); end if;
 end loop;
 if errors<>'{}' then return errors; end if;
 if length(f->>'title')>160 then errors:=errors||'{"title":"Title is too long."}'; end if;
 if length(f->>'description')>4000 then errors:=errors||'{"description":"Description is too long."}'; end if;
 if complete and length(trim(f->>'title'))=0 then errors:=errors||'{"title":"Enter a title."}'; end if;
 if complete and length(trim(f->>'description'))=0 then errors:=errors||'{"description":"Describe the work."}'; end if;
 if not exists(select 1 from unnest(enum_range(null::public.work_class)) c where c::text=f->>'workClass') then errors:=errors||'{"workClass":"Choose a known work class."}'; end if;
 select * into n from public.planning_nights where planning_night::text=f->>'planningNight';
 if not found then errors:=errors||'{"planningNight":"Choose a known planning night."}'; end if;
 foreach k in array array['durationMinutes','preferredStart','earliestStart','latestEnd'] loop
 if jsonb_typeof(f->k) is distinct from 'number' or (f->>k)!~'^[0-9]{1,4}$' then return errors||jsonb_build_object(k,'Enter a bounded integer minute.'); end if;
 end loop;
 if (f->>'durationMinutes')::int not between 1 and 1440 or (f->>'durationMinutes')::int>(f->>'latestEnd')::int-(f->>'earliestStart')::int then errors:=errors||'{"durationMinutes":"Duration must fit the permitted window."}'; end if;
 if (f->>'earliestStart')::int<n.window_start_minute or (f->>'earliestStart')::int>=n.window_end_minute then errors:=errors||'{"earliestStart":"Start must be within the engineering window."}'; end if;
 if (f->>'latestEnd')::int>n.window_end_minute or (f->>'latestEnd')::int<=(f->>'earliestStart')::int then errors:=errors||'{"latestEnd":"End must follow start within the engineering window."}'; end if;
 if (f->>'preferredStart')::int<(f->>'earliestStart')::int or (f->>'preferredStart')::int+(f->>'durationMinutes')::int>(f->>'latestEnd')::int then errors:=errors||'{"preferredStart":"Preferred work must fit the permitted window."}'; end if;
 foreach k in array array['blockIds','equipment','workforce'] loop
 if jsonb_typeof(f->k) is distinct from 'array' then return errors||jsonb_build_object(k,'Use an array.'); end if;
 if jsonb_array_length(f->k)>100 then return errors||jsonb_build_object(k,'Too many entries.'); end if;
 end loop;
 if complete and jsonb_array_length(f->'blockIds')=0 then errors:=errors||'{"blockIds":"Select at least one block."}'; end if;
 if complete and jsonb_array_length(f->'workforce')=0 then errors:=errors||'{"workforce":"Add workforce demand."}'; end if;
 seen:='{}';for item in select value from jsonb_array_elements(f->'blockIds') loop
 if jsonb_typeof(item)<>'string' or length(item#>>'{}') not between 1 and 64 or item#>>'{}'=any(seen) or not exists(select 1 from public.track_blocks where id=item#>>'{}') then errors:=errors||'{"blockIds":"Select distinct known blocks."}'; end if;
 seen:=array_append(seen,item#>>'{}');end loop;
 seen:='{}';i:=0;for item in select value from jsonb_array_elements(f->'equipment') loop
 if jsonb_typeof(item) is distinct from 'object' or not(item?&array['equipmentId','units']) or (select count(*) from jsonb_object_keys(item))<>2 then return errors||jsonb_build_object('equipment.'||i,'Supply equipmentId and units.'); end if;
 select units into capacity from public.equipment_types where id=item->>'equipmentId';
 if jsonb_typeof(item->'equipmentId') is distinct from 'string' or length(item->>'equipmentId') not between 1 and 64 or capacity is null or item->>'equipmentId'=any(seen) then errors:=errors||jsonb_build_object('equipment.'||i||'.equipmentId','Select a distinct known equipment type.'); end if;
 if jsonb_typeof(item->'units') is distinct from 'number' or (item->>'units')!~'^[0-9]{1,5}$' then errors:=errors||jsonb_build_object('equipment.'||i||'.units','Enter a positive integer.');
 elsif (item->>'units')::int<1 or (item->>'units')::int>least(10000,capacity) then errors:=errors||jsonb_build_object('equipment.'||i||'.units','Requested units exceed equipment capacity.'); end if;
 seen:=array_append(seen,item->>'equipmentId');i:=i+1;end loop;
 seen:='{}';i:=0;for item in select value from jsonb_array_elements(f->'workforce') loop
 if jsonb_typeof(item) is distinct from 'object' or not(item?&array['roleId','count']) or (select count(*) from jsonb_object_keys(item))<>2 then return errors||jsonb_build_object('workforce.'||i,'Supply roleId and count.'); end if;
 if jsonb_typeof(item->'roleId') is distinct from 'string' or length(item->>'roleId') not between 1 and 64 or item->>'roleId'=any(seen) or not exists(select 1 from public.workforce_roles where id=item->>'roleId') then errors:=errors||jsonb_build_object('workforce.'||i||'.roleId','Select a distinct known role.'); end if;
 if jsonb_typeof(item->'count') is distinct from 'number' or (item->>'count')!~'^[0-9]{1,5}$' then errors:=errors||jsonb_build_object('workforce.'||i||'.count','Enter a positive integer.');
 elsif (item->>'count')::int not between 1 and 10000 then errors:=errors||jsonb_build_object('workforce.'||i||'.count','Enter a positive bounded count.'); end if;
 seen:=array_append(seen,item->>'roleId');i:=i+1;end loop;
 return errors;
end $$;
revoke all on function railplan_private.validate_request_fields(jsonb,boolean) from public,anon,authenticated;

create function railplan_private.validate_request_approval(a jsonb,f jsonb,submission uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare errors jsonb:='{}';k text;item jsonb;seen text[];dep text; target_night text;
begin
 if jsonb_typeof(a) is distinct from 'object' or not(a?&array['teamId','priority','clearanceMinutes','requiredSkills','dependencies','dependencyLagMinutes','safetyConfirmed']) or (select count(*) from jsonb_object_keys(a))<>7 then return '{"approval":"Complete all planner fields."}'; end if;
 if a->'safetyConfirmed' is distinct from 'true'::jsonb then errors:=errors||'{"safetyConfirmed":"Confirm the fabricated safety constraints."}'; end if;
 if not exists(select 1 from public.teams where id=a->>'teamId') then errors:=errors||'{"teamId":"Choose a known team."}'; end if;
 if a->>'priority' is null or a->>'priority'<>all(array['low','medium','high','critical']) then errors:=errors||'{"priority":"Choose a priority."}'; end if;
 foreach k in array array['clearanceMinutes','dependencyLagMinutes'] loop
 if jsonb_typeof(a->k) is distinct from 'number' or (a->>k)!~'^[0-9]{1,4}$' then return errors||jsonb_build_object(k,'Enter a bounded integer minute.'); end if;
 if (a->>k)::int>1440 then errors:=errors||jsonb_build_object(k,'Enter at most 1440 minutes.'); end if;
 end loop;
 if (f->>'earliestStart')::int+(f->>'durationMinutes')::int+(a->>'clearanceMinutes')::int>(select window_end_minute from public.planning_nights where planning_night::text=f->>'planningNight') then errors:=errors||'{"clearanceMinutes":"Work and clearance must fit before handback."}'; end if;
 foreach k in array array['requiredSkills','dependencies'] loop
 if jsonb_typeof(a->k) is distinct from 'array' then return errors||jsonb_build_object(k,'Use an array.'); end if;
 if jsonb_array_length(a->k)>100 then return errors||jsonb_build_object(k,'Too many entries.'); end if;
 seen:='{}';for item in select value from jsonb_array_elements(a->k) loop
 if jsonb_typeof(item)<>'string' or length(item#>>'{}') not between 1 and 64 or item#>>'{}'=any(seen) then errors:=errors||jsonb_build_object(k,'Use distinct known references.'); end if;
 seen:=array_append(seen,item#>>'{}');end loop;end loop;
 for item in select value from jsonb_array_elements(a->'requiredSkills') loop
 if not exists(select 1 from public.team_skills where team_id=a->>'teamId' and skill=item#>>'{}') then errors:=errors||'{"requiredSkills":"The selected team must cover every required skill."}'; end if;end loop;
 for dep in select jsonb_array_elements_text(a->'dependencies') loop
 target_night:=null;
 select planning_night::text into target_night from public.maintenance_requests where id=dep;
 if target_night is null then select r.fields->>'planningNight' into target_night from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.active_approved_version where 'R-'||s.id=dep;end if;
 if target_night is distinct from f->>'planningNight' or dep='R-'||submission then errors:=errors||'{"dependencies":"Choose other approved requests on the same night."}'; end if;
 -- Every active request dependency is traversed; replacement cannot introduce cycles.
 if exists(with recursive edges as (
 select request_id id,depends_on_id dependency from public.request_dependencies
 union all select 'R-'||s.id,jsonb_array_elements_text(r.approval->'dependencies') from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.active_approved_version
 ), walk(id) as (select dep union select e.dependency from edges e join walk w on e.id=w.id)
 select 1 from walk where id='R-'||submission) then errors:=errors||'{"dependencies":"Dependencies cannot form a cycle."}'; end if;
 end loop;
 return errors;
end $$;
revoke all on function railplan_private.validate_request_approval(jsonb,jsonb,uuid) from public,anon,authenticated;

create function railplan_private.mutate_request(request_id uuid,expected_version integer,operation text,new_fields jsonb,new_approval jsonb,decision_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; s railplan_private.request_submissions; r railplan_private.request_revisions;
 next_status text;f jsonb;a jsonb;errors jsonb;next_version integer;
begin
 select * into actor from public.profiles where id=auth.uid();
 if auth.uid() is null or actor.id is null then return '{"code":"forbidden"}';end if;
 if operation is null or operation<>all(array['create','edit','submit','cancel','revise','needs_info','approve','reject']) then return '{"code":"invalid_request"}';end if;
 if decision_reason is null or length(decision_reason)>2000 then return '{"code":"invalid_request","fieldErrors":{"reason":"Provide a bounded reason."}}';end if;
 if operation=any(array['cancel','needs_info','approve','reject']) and length(trim(decision_reason))=0 then return '{"code":"invalid_request","fieldErrors":{"reason":"Explain this decision."}}';end if;
 if operation<>all(array['create','edit']) and new_fields is distinct from 'null'::jsonb and new_fields is not null then return '{"code":"invalid_request"}';end if;
 if operation<>'approve' and new_approval is distinct from 'null'::jsonb and new_approval is not null then return '{"code":"invalid_request"}';end if;
 if operation=any(array['approve','needs_info','reject']) and actor.role<>'planner' then return '{"code":"forbidden"}';end if;
 -- Same first lock as generation/publication and baseline fact mutation. Even a
 -- reference-only draft validation cannot race deletion/resizing of its catalogue.
 update railplan_private.planning_source set lock_generation=lock_generation+1 where singleton;
 if operation='create' then
 if actor.role<>'contractor' or request_id is not null or expected_version is not null then return '{"code":"forbidden"}';end if;
 f:=new_fields;a:=null;next_status:='draft';next_version:=1;
 else
 select * into s from railplan_private.request_submissions where id=request_id for update;
 if s.id is null or (actor.role='contractor' and actor.contractor_organisation_id<>s.organisation_id) then return '{"code":"not_found"}';end if;
 if expected_version is distinct from s.current_version then return '{"code":"conflict"}';end if;
 select * into r from railplan_private.request_revisions where submission_id=s.id and version=s.current_version;
 f:=r.fields;a:=r.approval;next_version:=s.current_version+1;
 if operation='edit' and r.status in ('draft','needs_info') then next_status:=r.status;f:=new_fields;a:=null;
 elsif operation='submit' and r.status in ('draft','needs_info') then next_status:='submitted';a:=null;
 elsif operation='revise' and r.status in ('approved','rejected','cancelled') then next_status:='draft';a:=null;
 elsif operation='cancel' and r.status<>'cancelled' then next_status:='cancelled';
 elsif operation in ('approve','needs_info','reject') and r.status='submitted' then
 next_status:=case operation when 'approve' then 'approved' when 'reject' then 'rejected' else 'needs_info' end;
 if operation='approve' then a:=new_approval;end if;
 else return '{"code":"invalid_transition"}';end if;
 end if;
 if operation in ('create','edit','submit','approve') then
 errors:=railplan_private.validate_request_fields(f,next_status in ('submitted','approved'));
 if errors<>'{}' then return jsonb_build_object('code','invalid_request','fieldErrors',errors);end if;
 end if;
 if operation in ('cancel','approve') and s.active_approved_version is not null and exists(
 select 1 from railplan_private.request_submissions other_s join railplan_private.request_revisions other_r
 on other_r.submission_id=other_s.id and other_r.version=other_s.active_approved_version
 where other_s.id<>s.id and other_r.approval->'dependencies' ? ('R-'||s.id)
 and (operation='cancel' or other_r.fields->>'planningNight' is distinct from f->>'planningNight')
 ) then return '{"code":"invalid_request","fieldErrors":{"dependencies":"Active approved work depends on this request. Resolve those dependencies first."}}';end if;
 if next_status='approved' then
 errors:=railplan_private.validate_request_approval(a,f,s.id);
 if errors<>'{}' then return jsonb_build_object('code','invalid_request','fieldErrors',(select jsonb_object_agg('approval.'||key,value) from jsonb_each(errors)));end if;
 end if;
 if operation='create' then
 insert into railplan_private.request_submissions(organisation_id) values(actor.contractor_organisation_id) returning * into s;
 end if;
 insert into railplan_private.request_revisions(submission_id,version,status,fields,approval,action,from_status,actor_id,reason)
 values(s.id,next_version,next_status,f,a,operation,r.status,actor.id,trim(decision_reason));
 update railplan_private.request_submissions set current_version=next_version,updated_at=clock_timestamp(),
 active_approved_version=case when next_status='approved' then next_version when operation='cancel' then null else active_approved_version end where id=s.id;
 if next_status='approved' or (operation='cancel' and s.active_approved_version is not null) then
 update railplan_private.planning_source set revision=revision+1 where singleton;end if;
 return jsonb_build_object('id',s.id,'version',next_version);
end $$;
revoke all on function railplan_private.mutate_request(uuid,integer,text,jsonb,jsonb,text) from public,anon;
grant execute on function railplan_private.mutate_request(uuid,integer,text,jsonb,jsonb,text) to authenticated;

-- Scoped derived status reveals only this organisation's request placements.
create function railplan_private.request_schedule(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; s railplan_private.request_submissions; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid();
 select * into s from railplan_private.request_submissions where id=request_id;
 if actor.id is null or s.id is null or (actor.role='contractor' and actor.contractor_organisation_id<>s.organisation_id) then return null;end if;
 select jsonb_build_object('planId',p.plan_id,'revision',(fact->>'submissionRevision')::integer,'startMinute',p.start_minute,'endMinute',p.end_minute) into result
 from railplan_private.plan_placements p join railplan_private.plan_publications pub on pub.plan_id=p.plan_id
 join railplan_private.planning_runs run on run.id=p.plan_id
 cross join lateral jsonb_array_elements(run.facts->'requests') fact
 where p.request_id='R-'||s.id and fact->>'id'=p.request_id
 and not exists(select 1 from railplan_private.plan_publications later where later.supersedes=pub.plan_id)
 order by pub.created_at desc limit 1;
 return result;
end $$;
revoke all on function railplan_private.request_schedule(uuid) from public,anon;
grant execute on function railplan_private.request_schedule(uuid) to authenticated;

-- Approval dependencies are JSON snapshots, so their references need the same
-- protection against baseline planner edits as against intake cancellation.
create function railplan_private.guard_approved_baseline_dependency() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.id is not distinct from old.id and new.planning_night is not distinct from old.planning_night then return new;end if;
 if exists(select 1 from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.active_approved_version
 where r.approval->'dependencies' ? old.id) then
 raise exception 'Active approved work depends on this request. Resolve those dependencies first.' using errcode='23503';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function railplan_private.guard_approved_baseline_dependency() from public,anon,authenticated;
create trigger guard_approved_intake_dependencies before delete or update of id,planning_night on public.maintenance_requests
 for each row execute function railplan_private.guard_approved_baseline_dependency();
