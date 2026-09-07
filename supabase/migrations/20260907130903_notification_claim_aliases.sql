-- Repair runtime PL/pgSQL variable/alias ambiguity without changing claim semantics.
create or replace function railplan_private.claim_notification(delivery uuid,allow_retry boolean,acknowledge_risk boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d railplan_private.notification_deliveries%rowtype; a railplan_private.notification_attempts%rowtype;
 r railplan_private.notification_results%rowtype; config railplan_private.notification_configurations%rowtype; claim_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then raise exception 'Planner authentication required' using errcode='42501'; end if;
 select * into d from railplan_private.notification_deliveries where id=delivery for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 if exists(select 1 from railplan_private.notification_attempts prior_attempt join railplan_private.notification_results prior_result on prior_result.attempt_id=prior_attempt.id where prior_attempt.delivery_id=d.id and prior_result.telegram_message_id is not null) then return jsonb_build_object('skip',true); end if;
 if d.plan_id is not null and exists(select 1 from railplan_private.plan_publications where supersedes=d.plan_id) then return jsonb_build_object('error','superseded_plan'); end if;
 select * into a from railplan_private.notification_attempts where delivery_id=d.id order by attempt_number desc limit 1;
 if a.id is not null then
  if allow_retry is distinct from true then return jsonb_build_object('skip',true); end if;
  select * into r from railplan_private.notification_results where attempt_id=a.id;
  if r.attempt_id is null and a.started_at>clock_timestamp()-interval '60 seconds' then return jsonb_build_object('error','delivery_in_progress'); end if;
  if (r.attempt_id is null or r.ambiguous) and acknowledge_risk is distinct from true then return jsonb_build_object('error','duplicate_risk'); end if;
  if r.retry_after_seconds is not null and r.finished_at+make_interval(secs=>r.retry_after_seconds)>clock_timestamp() then return jsonb_build_object('error','retry_later'); end if;
  if a.attempt_number>=20 then return jsonb_build_object('error','attempt_limit'); end if;
 end if;
 select * into config from railplan_private.notification_configurations where organisation_id=d.organisation_id;
 if d.kind='test' and d.configuration_version<>coalesce(config.version,0) then return jsonb_build_object('error','configuration_changed'); end if;
 insert into railplan_private.notification_attempts(delivery_id,attempt_number,actor_id,chat_id)
 values(d.id,coalesce(a.attempt_number,0)+1,auth.uid(),config.chat_id) returning id into claim_id;
 return jsonb_build_object('claimId',claim_id,'chatId',config.chat_id,'text',d.message_text);
end $$;

