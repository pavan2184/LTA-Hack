-- Historical notes remain append-only evidence. Once this night has a current
-- publication, its deferred/scheduled/removed projection alone controls counting.
-- In particular, recording an older deferral cannot undo a scheduled correction
-- after a later publication removes the work entirely.
create or replace function railplan_private.record_work_deferral(command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior railplan_private.work_item_mutations; source railplan_private.planning_runs;
 wid uuid; current_plan uuid; prior_kind text; rid text:=command->>'requestId'; reason_text text:=command->>'reason';
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then return jsonb_build_object('error','forbidden'); end if;
 if jsonb_typeof(command) is distinct from 'object' or (command - array['planId','requestId','reason','idempotencyKey']) <> '{}'::jsonb
  or reason_text is null or length(btrim(reason_text)) not between 1 and 1000 or rid is null or length(rid) not between 1 and 64
  or command->>'planId' is null or command->>'idempotencyKey' is null then return jsonb_build_object('error','invalid_request'); end if;
 perform railplan_private.lock_planning_source();
 select * into prior from railplan_private.work_item_mutations where actor_id=auth.uid() and idempotency_key=(command->>'idempotencyKey')::uuid;
 if prior.work_item_id is not null then
  if prior.input is distinct from command then return jsonb_build_object('error','conflict'); end if;
  return jsonb_build_object('id',prior.work_item_id);
 end if;
 select * into source from railplan_private.planning_runs where id=(command->>'planId')::uuid;
 if source.id is null then return jsonb_build_object('error','not_found'); end if;
 if not exists(select 1 from railplan_private.plan_deferrals where plan_id=source.id and request_id=rid)
  or not exists(select 1 from jsonb_array_elements(source.facts->'requests') r where r->>'id'=rid) then return jsonb_build_object('error','invalid_request'); end if;
 wid:=railplan_private.resolve_work_item(source.id,rid);
 perform 1 from railplan_private.work_items where id=wid for update;
 insert into railplan_private.work_item_events(work_item_id,kind,night,plan_id,request_id,actor_id,note)
 values(wid,'record',source.planning_night,source.id,rid,auth.uid(),btrim(reason_text));
 select p.plan_id into current_plan from railplan_private.plan_publications p join railplan_private.planning_runs r on r.id=p.plan_id
 where r.planning_night=source.planning_night and not exists(select 1 from railplan_private.plan_publications later where later.supersedes=p.plan_id);
 if current_plan is not null then
  perform railplan_private.project_work_publication(wid,current_plan);
 else
  -- Only an unpublished night may derive a new occurrence from historical input.
  select kind into prior_kind from railplan_private.work_item_events where work_item_id=wid and night=source.planning_night and kind in ('deferred','scheduled') order by id desc limit 1;
  if prior_kind is distinct from 'deferred' then
   insert into railplan_private.work_item_events(work_item_id,kind,night,plan_id,request_id,actor_id) values(wid,'deferred',source.planning_night,source.id,rid,auth.uid());
  end if;
 end if;
 update railplan_private.work_items set version=version+1,updated_at=clock_timestamp() where id=wid;
 insert into railplan_private.work_item_mutations(actor_id,idempotency_key,input,work_item_id) values(auth.uid(),(command->>'idempotencyKey')::uuid,command,wid);
 return jsonb_build_object('id',wid);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('error','invalid_request');
end $$;
revoke all on function railplan_private.record_work_deferral(jsonb) from public,anon;
grant execute on function railplan_private.record_work_deferral(jsonb) to authenticated;
