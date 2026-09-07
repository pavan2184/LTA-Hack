-- Extend private proposal pointers without rewriting any existing immutable row.
alter table railplan_private.private_drafts drop constraint private_drafts_status_check;
alter table railplan_private.private_drafts add constraint private_drafts_status_check check(status in ('private','submitted'));
alter table railplan_private.private_drafts add column submitted_request_id uuid unique references railplan_private.request_submissions(id);
alter table railplan_private.private_drafts add constraint private_submission_state check((status='private' and submitted_request_id is null) or (status='submitted' and submitted_request_id is not null));
alter table railplan_private.private_draft_revisions
 add column manual_fields jsonb check(manual_fields is null or jsonb_typeof(manual_fields)='array'),
 add column action text check(action is null or action in ('extract','edit','submit')),
 add column actor_id uuid,
 add column from_status text check(from_status is null or from_status='private'),
 add column status text check(status is null or status in ('private','submitted')),
 add column reason text check(reason is null or length(reason)<=2000);

create table railplan_private.request_proposal_sources (
 submission_id uuid primary key references railplan_private.request_submissions(id),
 draft_id uuid not null unique references railplan_private.private_drafts(id),
 submitted_revision integer not null,
 source jsonb not null check(jsonb_typeof(source)='object'),
 foreign key(draft_id,submitted_revision) references railplan_private.private_draft_revisions(draft_id,version)
);
alter table railplan_private.request_proposal_sources enable row level security;
revoke all on railplan_private.request_proposal_sources from public,anon,authenticated;
grant select on railplan_private.request_proposal_sources to authenticated;
create policy submitted_proposal_scoped_read on railplan_private.request_proposal_sources for select to authenticated using(exists(select 1 from railplan_private.request_submissions where id=submission_id));
create trigger immutable_request_proposal_source before update or delete or truncate on railplan_private.request_proposal_sources for each statement execute function railplan_private.reject_plan_mutation();

-- Null remains null in stored fields. A synthetic validation-only envelope lets
-- the existing trusted catalogue validator check supplied textual/reference
-- fields; actual nullable times are checked separately without inventing inputs.
create function railplan_private.validate_private_review_fields(f jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare keys text[]:=array['planningNight','title','description','workClass','blockIds','durationMinutes','preferredStart','earliestStart','latestEnd','equipment','workforce'];
 errors jsonb:='{}';n public.planning_nights;base public.planning_nights;k text;check_fields jsonb;
begin
 if jsonb_typeof(f) is distinct from 'object' then return '{"fields":"Use only the supported nullable fields."}';end if;
 if not(f?&keys) or (select count(*) from jsonb_object_keys(f))<>11 then return '{"fields":"Use only the supported nullable fields."}';end if;
 select * into n from public.planning_nights where planning_night::text=f->>'planningNight';
 select * into base from public.planning_nights order by planning_night limit 1;
 check_fields:=jsonb_build_object('planningNight',coalesce(f->>'planningNight',base.planning_night::text),
 'title',coalesce(f->>'title',''),'description',coalesce(f->>'description',''),
 'workClass',coalesce(f->>'workClass',(enum_range(null::public.work_class))[1]::text),
 'blockIds',coalesce(nullif(f->'blockIds','null'::jsonb),'[]'::jsonb),
 'equipment',coalesce(nullif(f->'equipment','null'::jsonb),'[]'::jsonb),
 'workforce',coalesce(nullif(f->'workforce','null'::jsonb),'[]'::jsonb),
 'durationMinutes',1,'preferredStart',coalesce(base.window_start_minute,0),
 'earliestStart',coalesce(base.window_start_minute,0),'latestEnd',coalesce(base.window_end_minute,240));
 errors:=railplan_private.validate_request_fields(check_fields,false)-array['durationMinutes','preferredStart','earliestStart','latestEnd'];
 if f->'planningNight'='null'::jsonb then errors:=errors-'planningNight';end if;
 foreach k in array array['planningNight','title','description','workClass'] loop
 if f->k<>'null'::jsonb and jsonb_typeof(f->k)<>'string' then errors:=errors||jsonb_build_object(k,'Use text or leave unknown.');end if;end loop;
 foreach k in array array['durationMinutes','preferredStart','earliestStart','latestEnd'] loop
 if f->k='null'::jsonb then continue;end if;
 if jsonb_typeof(f->k)<>'number' or (f->>k)!~'^[0-9]{1,4}$' then return errors||jsonb_build_object(k,'Use a bounded integer or leave unknown.');end if;
 if (f->>k)::int>2880 or (k='durationMinutes' and (f->>k)::int not between 1 and 1440) then errors:=errors||jsonb_build_object(k,'Use a bounded integer minute.');end if;
 if k<>'durationMinutes' and n.planning_night is not null and ((f->>k)::int<n.window_start_minute or (f->>k)::int>n.window_end_minute or (k<>'latestEnd' and (f->>k)::int=n.window_end_minute)) then errors:=errors||jsonb_build_object(k,'The time must fit the selected planning night.');end if;
 end loop;
 if f->'durationMinutes'<>'null'::jsonb and n.planning_night is not null and (f->>'durationMinutes')::int>n.window_end_minute-n.window_start_minute then errors:=errors||'{"durationMinutes":"Duration must fit the selected planning night."}';end if;
 if f->'earliestStart'<>'null'::jsonb and f->'latestEnd'<>'null'::jsonb then
 if (f->>'latestEnd')::int<=(f->>'earliestStart')::int then errors:=errors||'{"latestEnd":"End must follow start."}';end if;
 if f->'durationMinutes'<>'null'::jsonb and (f->>'durationMinutes')::int>(f->>'latestEnd')::int-(f->>'earliestStart')::int then errors:=errors||'{"durationMinutes":"Duration must fit the permitted window."}';end if;end if;
 if f->'preferredStart'<>'null'::jsonb then
 if f->'earliestStart'<>'null'::jsonb and (f->>'preferredStart')::int<(f->>'earliestStart')::int then errors:=errors||'{"preferredStart":"Preferred start must follow earliest start."}';end if;
 if f->'latestEnd'<>'null'::jsonb and f->'durationMinutes'<>'null'::jsonb and (f->>'preferredStart')::int+(f->>'durationMinutes')::int>(f->>'latestEnd')::int then errors:=errors||'{"preferredStart":"Preferred work must fit the permitted window."}';end if;end if;
 return errors;
end $$;
revoke all on function railplan_private.validate_private_review_fields(jsonb) from public,anon,authenticated;

create function railplan_private.private_review_snapshot(proposal_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('version',r.version,'fields',r.fields,'confidence',r.confidence,'missingFields',r.missing_fields,'evidence',r.evidence,
 'manualFields',coalesce(r.manual_fields,'[]'::jsonb),'action',coalesce(r.action,'extract'),'actorId',coalesce(r.actor_id,d.owner_id),
 'fromStatus',r.from_status,'status',coalesce(r.status,'private'),'reason',coalesce(r.reason,''),'createdAt',r.created_at,'model',r.model,'extractorVersion',r.extractor_version) order by r.version),'[]'::jsonb)
 from railplan_private.private_draft_revisions r join railplan_private.private_drafts d on d.id=r.draft_id where r.draft_id=proposal_id;
$$;
revoke all on function railplan_private.private_review_snapshot(uuid) from public,anon,authenticated;

create function railplan_private.review_private_draft(proposal_id uuid,expected_version integer,operation text,new_fields jsonb,decision_reason text,selected_organisation uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles;d railplan_private.private_drafts;r railplan_private.private_draft_revisions;
 f jsonb;c jsonb;e jsonb;manual jsonb;missing jsonb;errors jsonb;k text;next_version integer;request_id uuid;org uuid;stamp timestamptz;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null then return '{"code":"forbidden"}';end if;
 if operation is null or operation not in ('edit','submit') or decision_reason is null or length(trim(decision_reason)) not between 1 and 2000 then return '{"code":"invalid_request","fieldErrors":{"reason":"Explain this change."}}';end if;
 if operation='submit' and new_fields is not null and new_fields<>'null'::jsonb then return '{"code":"invalid_request"}';end if;
 if operation='edit' and selected_organisation is not null then return '{"code":"invalid_request"}';end if;
 update railplan_private.planning_source set lock_generation=lock_generation+1 where singleton;
 select * into d from railplan_private.private_drafts where id=proposal_id and owner_id=actor.id for update;
 if d.id is null then return '{"code":"not_found"}';end if;
 if expected_version is distinct from d.current_version then return '{"code":"conflict"}';end if;
 if d.status<>'private' then return '{"code":"invalid_transition"}';end if;
 if d.current_version>=100 then return '{"code":"invalid_request","fieldErrors":{"fields":"This draft has reached its revision limit."}}';end if;
 select * into r from railplan_private.private_draft_revisions where draft_id=d.id and version=d.current_version;
 f:=r.fields;c:=r.confidence;e:=r.evidence;manual:=coalesce(r.manual_fields,'[]'::jsonb);next_version:=d.current_version+1;
 if operation='edit' then
 f:=new_fields;
 if jsonb_typeof(f)='object' then
 foreach k in array array['title','description'] loop
 if jsonb_typeof(f->k)='string' then f:=jsonb_set(f,array[k],case when length(trim(f->>k))=0 then 'null'::jsonb else to_jsonb(trim(f->>k)) end);end if;end loop;end if;
 errors:=railplan_private.validate_private_review_fields(f);
 if errors<>'{}' then return jsonb_build_object('code','invalid_request','fieldErrors',errors);end if;
 for k in select jsonb_object_keys(f) loop
 if f->k is distinct from r.fields->k then
 c:=jsonb_set(c,array[k],'null'::jsonb);
 select coalesce(jsonb_agg(value),'[]'::jsonb) into e from jsonb_array_elements(e) where value->>'field'<>k;
 if not(manual?k) then manual:=manual||jsonb_build_array(k);end if;
 end if;end loop;
 else
 if actor.role='contractor' then
 if selected_organisation is not null or (d.organisation_id is not null and d.organisation_id is distinct from actor.contractor_organisation_id) then return '{"code":"forbidden"}';end if;
 org:=actor.contractor_organisation_id;
 else
 if selected_organisation is null or not exists(select 1 from public.contractor_organisations where id=selected_organisation) then return '{"code":"invalid_request","fieldErrors":{"organisationId":"Choose a known organisation before sharing."}}';end if;
 org:=selected_organisation;end if;
 errors:='{}';for k in select jsonb_object_keys(f) loop
 if f->k='null'::jsonb then errors:=errors||jsonb_build_object(k,'Complete this field before submitting.');end if;end loop;
 if errors<>'{}' then return jsonb_build_object('code','invalid_request','fieldErrors',errors);end if;
 errors:=railplan_private.validate_request_fields(f,true);
 if errors<>'{}' then return jsonb_build_object('code','invalid_request','fieldErrors',errors);end if;
 end if;
 select coalesce(jsonb_agg(key order by key),'[]'::jsonb) into missing from jsonb_each(f) where value='null'::jsonb or (key in ('title','description') and length(trim(value#>>'{}'))=0) or (key in ('blockIds','workforce') and value='[]'::jsonb);
 select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into manual from jsonb_array_elements(manual);
 stamp:=clock_timestamp();
 insert into railplan_private.private_draft_revisions(draft_id,version,fields,confidence,missing_fields,evidence,model,extractor_version,manual_fields,action,actor_id,from_status,status,reason,created_at)
 values(d.id,next_version,f,c,missing,e,r.model,r.extractor_version,manual,operation,actor.id,'private',case when operation='submit' then 'submitted' else 'private' end,trim(decision_reason),stamp);
 if operation='submit' then
 insert into railplan_private.request_submissions(organisation_id) values(org) returning id into request_id;
 insert into railplan_private.request_revisions(submission_id,version,status,fields,approval,action,from_status,actor_id,reason,created_at)
 values(request_id,1,'submitted',f,null,'submit_proposal',null,actor.id,trim(decision_reason),stamp);
 insert into railplan_private.request_proposal_sources(submission_id,draft_id,submitted_revision,source)
 values(request_id,d.id,next_version,jsonb_build_object('draftId',d.id,'submittedRevision',next_version,'submittedAt',stamp,'submittedBy',actor.id,
 'fields',f,'confidence',c,'evidence',e,'manualFields',manual,'model',r.model,'extractorVersion',r.extractor_version,'revisions',railplan_private.private_review_snapshot(d.id)));
 end if;
 update railplan_private.private_drafts set current_version=next_version,updated_at=stamp,status=case when operation='submit' then 'submitted' else 'private' end,submitted_request_id=request_id where id=d.id;
 return jsonb_build_object('id',d.id,'version',next_version,'requestId',request_id);
end $$;
revoke all on function railplan_private.review_private_draft(uuid,integer,text,jsonb,text,uuid) from public,anon;
grant execute on function railplan_private.review_private_draft(uuid,integer,text,jsonb,text,uuid) to authenticated;

-- Only planner owners select an organisation when explicitly sharing a proposal.
create or replace function railplan_private.request_catalogue() returns jsonb
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
 'organisations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from public.contractor_organisations),'[]'::jsonb),
 'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'skills',coalesce((select jsonb_agg(skill order by skill) from public.team_skills where team_id=t.id),'[]'::jsonb)) order by t.id) from public.teams t),'[]'::jsonb),
 'dependencies',coalesce((select jsonb_agg(d order by d->>'id') from (
 select jsonb_build_object('id',id,'title',title,'planningNight',planning_night::text) d from public.maintenance_requests
 union all select jsonb_build_object('id','R-'||s.id,'title',r.fields->>'title','planningNight',r.fields->>'planningNight') from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.active_approved_version
 ) q),'[]'::jsonb)); end if;
 return result;
end $$;
revoke all on function railplan_private.request_catalogue() from public,anon;
grant execute on function railplan_private.request_catalogue() to authenticated;


-- Conservative issue #11 provenance: every cancellation and rejection reversal
-- invalidates prior source attestations, in addition to approvals/replacements.
create or replace function railplan_private.mutate_request(request_id uuid,expected_version integer,operation text,new_fields jsonb,new_approval jsonb,decision_reason text) returns jsonb
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
 if next_status='approved' or operation='cancel' or (operation='revise' and r.status='rejected') then
 update railplan_private.planning_source set revision=revision+1 where singleton;end if;
 return jsonb_build_object('id',s.id,'version',next_version);
end $$;
revoke all on function railplan_private.mutate_request(uuid,integer,text,jsonb,jsonb,text) from public,anon;
grant execute on function railplan_private.mutate_request(uuid,integer,text,jsonb,jsonb,text) to authenticated;

