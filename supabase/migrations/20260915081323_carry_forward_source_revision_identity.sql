-- Original intake keeps generation zero across normal reapproval. Include its
-- captured revision in preparation identity, without rewriting immutable history
-- or changing existing generations/original idempotency-key replay results.
alter table railplan_private.carry_forward_preparations
 drop constraint carry_forward_preparations_work_item_id_target_night_source_key;
create unique index carry_forward_preparations_source_identity
 on railplan_private.carry_forward_preparations
 (work_item_id,target_night,source_request_id,source_generation,(coalesce(source_submission_version,0)));
-- Approved intake revisions are positive; zero is the deterministic seeded/null
-- revision identity. The lookup below uses exactly the same identity as this index.

create or replace function railplan_private.prepare_carry_forward(wid uuid,command jsonb) returns jsonb
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
 if target is null or target<=(active->>'planningNight')::date or not exists(select 1 from public.planning_nights where planning_night=target) then return '{"error":"invalid_request"}'; end if;
 org:=coalesce(w.organisation_id,(command->>'organisationId')::uuid);
 if org is null or (w.organisation_id is not null and command ? 'organisationId' and (command->>'organisationId')::uuid is distinct from w.organisation_id)
  or not exists(select 1 from public.contractor_organisations where id=org) then return '{"error":"invalid_request"}'; end if;
 select * into prior from railplan_private.carry_forward_preparations
  where work_item_id=wid and target_night=target
   and source_request_id=active->>'requestId'
   and source_generation=(active->>'generation')::integer
   and coalesce(source_submission_version,0)=coalesce((active->>'submissionRevision')::integer,0);
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
