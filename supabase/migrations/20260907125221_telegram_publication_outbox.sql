-- Durable publication outbox; the external provider is called only after commit.
create table railplan_private.notification_configurations (
 organisation_id uuid primary key references public.contractor_organisations(id),
 chat_id text,
 version integer not null check(version>0),
 updated_by uuid not null,
 updated_at timestamptz not null default clock_timestamp(),
 check(chat_id is null or (chat_id ~ '^-?[1-9][0-9]{0,15}$' and abs(chat_id::numeric)<=4503599627370495))
);
create table railplan_private.notification_configuration_events (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.contractor_organisations(id),
 version integer not null, previous_chat_id text, chat_id text, actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(), unique(organisation_id,version)
);
create table railplan_private.notification_deliveries (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.contractor_organisations(id),
 plan_id uuid references railplan_private.plan_publications(plan_id), planning_night date,
 kind text not null check(kind in ('publication','test')), configuration_version integer,
 message_text text not null check(length(message_text) between 1 and 100000),
 deduplication_key text not null unique, created_by uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 check((kind='publication' and plan_id is not null and planning_night is not null and configuration_version is null)
    or (kind='test' and plan_id is null and planning_night is null and configuration_version is not null))
);
create index notification_plan_idx on railplan_private.notification_deliveries(plan_id);
create index notification_org_idx on railplan_private.notification_deliveries(organisation_id,created_at desc);
create table railplan_private.notification_attempts (
 id uuid primary key default gen_random_uuid(), delivery_id uuid not null references railplan_private.notification_deliveries(id),
 attempt_number integer not null check(attempt_number between 1 and 20), actor_id uuid not null,
 chat_id text, started_at timestamptz not null default clock_timestamp(),
 unique(delivery_id,attempt_number)
);
create table railplan_private.notification_results (
 attempt_id uuid primary key references railplan_private.notification_attempts(id),
 telegram_message_id text, error_code text, ambiguous boolean not null,
 retry_after_seconds integer check(retry_after_seconds between 0 and 86400),
 finished_at timestamptz not null default clock_timestamp(),
 check((telegram_message_id ~ '^[1-9][0-9]{0,19}$' and error_code is null and not ambiguous and retry_after_seconds is null)
   or (telegram_message_id is null and error_code in ('missing_chat','missing_credentials','invalid_chat','invalid_message','rejected','rate_limited','unavailable','ambiguous')
       and ambiguous=(error_code='ambiguous'))),
 check(telegram_message_id is not null or error_code is not null)
);
do $$ declare t text; begin
 foreach t in array array['notification_configurations','notification_configuration_events','notification_deliveries','notification_attempts','notification_results'] loop
  execute format('alter table railplan_private.%I enable row level security',t);
  execute format('revoke all on railplan_private.%I from public,anon,authenticated',t);
  execute format('grant select on railplan_private.%I to authenticated',t);
  execute format('create policy planner_read on railplan_private.%I for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role=''planner''))',t);
  if t<>'notification_configurations' then
   execute format('create trigger immutable_notification_history before update or delete or truncate on railplan_private.%I for each statement execute function railplan_private.reject_plan_mutation()',t);
  end if;
 end loop;
end $$;

create function railplan_private.configure_notification(org_id uuid,expected_version integer,destination text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous railplan_private.notification_configurations%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then raise exception 'Planner authentication required' using errcode='42501'; end if;
 perform 1 from public.contractor_organisations where id=org_id for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 if destination is not null then
  if destination !~ '^-?[1-9][0-9]{0,15}$' then return jsonb_build_object('error','invalid_request'); end if;
  if abs(destination::numeric)>4503599627370495 then return jsonb_build_object('error','invalid_request'); end if;
 end if;
 select * into previous from railplan_private.notification_configurations where organisation_id=org_id;
 if expected_version is null or expected_version<>coalesce(previous.version,0) or expected_version>=2147483647 then return jsonb_build_object('error','conflict'); end if;
 insert into railplan_private.notification_configurations(organisation_id,chat_id,version,updated_by)
 values(org_id,destination,expected_version+1,auth.uid())
 on conflict(organisation_id) do update set chat_id=excluded.chat_id,version=excluded.version,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into railplan_private.notification_configuration_events(organisation_id,version,previous_chat_id,chat_id,actor_id)
 values(org_id,expected_version+1,previous.chat_id,destination,auth.uid());
 return jsonb_build_object('ok',true);
end $$;

-- Snapshot only the organisation's own request ID, approved revision, sector,
-- assigned team and schedule state. Baseline operator facts have no contractor.
create function railplan_private.notification_plan_requests(run_id uuid)
returns table(organisation_id uuid,request_id text,snapshot jsonb)
language sql stable security definer set search_path='' as $$
 select s.organisation_id,r->>'id',jsonb_build_object(
  'revision',r->'submissionRevision','sector',r->>'sector','teamId',r->>'teamId',
  'state',case when p.request_id is not null then 'scheduled' else 'deferred' end,
  'start',p.start_minute,'end',p.end_minute)
 from railplan_private.planning_runs run cross join lateral jsonb_array_elements(run.facts->'requests') r
 join railplan_private.request_submissions s on 'R-'||s.id::text=r->>'id'
 join railplan_private.request_revisions rev on rev.submission_id=s.id and rev.version=(r->>'submissionRevision')::integer and rev.status='approved'
 left join railplan_private.plan_placements p on p.plan_id=run.id and p.request_id=r->>'id'
 where run.id=run_id
$$;
create function railplan_private.notification_time(minute integer) returns text
language sql immutable set search_path='' as $$
 select lpad((minute/60)::text,2,'0')||':'||lpad((minute%60)::text,2,'0')
$$;
create function railplan_private.queue_publication_notifications() returns trigger
language plpgsql security definer set search_path='' as $$
declare org record; night date; body text;
begin
 select planning_night into night from railplan_private.planning_runs where id=new.plan_id;
 for org in
  with current_requests as (select * from railplan_private.notification_plan_requests(new.plan_id)),
       previous_requests as (select * from railplan_private.notification_plan_requests(new.supersedes))
  select coalesce(c.organisation_id,p.organisation_id) organisation_id,
   string_agg(coalesce(c.request_id,p.request_id)||' | '||
    case when c.request_id is null then case when p.snapshot->>'state'='scheduled'
       then 'removed; previous time '||railplan_private.notification_time((p.snapshot->>'start')::integer)||'-'||railplan_private.notification_time((p.snapshot->>'end')::integer)
       else 'removed; previously deferred' end
      when c.snapshot->>'state'='deferred' then 'deferred; no assigned time'
      else 'scheduled '||railplan_private.notification_time((c.snapshot->>'start')::integer)||'-'||railplan_private.notification_time((c.snapshot->>'end')::integer) end
    ||' | '||regexp_replace(coalesce(c.snapshot->>'sector',p.snapshot->>'sector'),'[[:cntrl:]]',' ','g'), E'\n' order by coalesce(c.request_id,p.request_id) collate "C") lines
  from current_requests c full join previous_requests p on c.request_id=p.request_id and c.organisation_id=p.organisation_id
  where c.snapshot is distinct from p.snapshot
  group by coalesce(c.organisation_id,p.organisation_id)
 loop
  body:='RailPlan published version '||new.plan_id::text||E'\nNight '||night::text||E'\nChanged requests:\n'||org.lines||E'\nPrototype only — fabricated planning inputs; not an operational instruction or safety approval.';
  insert into railplan_private.notification_deliveries(organisation_id,plan_id,planning_night,kind,message_text,deduplication_key,created_by)
  values(org.organisation_id,new.plan_id,night,'publication',body,'publication:'||new.plan_id::text||':'||org.organisation_id::text,new.created_by);
 end loop;
 return new;
end $$;
create trigger publication_notification_outbox after insert on railplan_private.plan_publications
 for each row execute function railplan_private.queue_publication_notifications();

create function railplan_private.queue_notification_test(org_id uuid,expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare config railplan_private.notification_configurations%rowtype; result_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then raise exception 'Planner authentication required' using errcode='42501'; end if;
 perform 1 from public.contractor_organisations where id=org_id for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 select * into config from railplan_private.notification_configurations where organisation_id=org_id;
 if expected_version is null or expected_version<>coalesce(config.version,0) then return jsonb_build_object('error','conflict'); end if;
 insert into railplan_private.notification_deliveries(organisation_id,kind,configuration_version,message_text,deduplication_key,created_by)
 values(org_id,'test',expected_version,'RailPlan Telegram destination test. Prototype only — this is not a published schedule or operational instruction.','test:'||org_id::text||':'||expected_version::text,auth.uid())
 on conflict(deduplication_key) do nothing;
 select id into result_id from railplan_private.notification_deliveries where deduplication_key='test:'||org_id::text||':'||expected_version::text;
 return jsonb_build_object('id',result_id);
end $$;

create function railplan_private.claim_notification(delivery uuid,allow_retry boolean,acknowledge_risk boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d railplan_private.notification_deliveries%rowtype; a railplan_private.notification_attempts%rowtype;
 r railplan_private.notification_results%rowtype; config railplan_private.notification_configurations%rowtype; claim_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then raise exception 'Planner authentication required' using errcode='42501'; end if;
 select * into d from railplan_private.notification_deliveries where id=delivery for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 if exists(select 1 from railplan_private.notification_attempts a join railplan_private.notification_results r on r.attempt_id=a.id where a.delivery_id=d.id and r.telegram_message_id is not null) then return jsonb_build_object('skip',true); end if;
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

create function railplan_private.finish_notification(claim uuid,message_id text,failure_code text,is_ambiguous boolean,retry_seconds integer) returns void
language plpgsql security definer set search_path='' as $$
declare a railplan_private.notification_attempts%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then raise exception 'Planner authentication required' using errcode='42501'; end if;
 select * into a from railplan_private.notification_attempts where id=claim;
 if not found or a.actor_id<>auth.uid() then raise exception 'Notification claim unavailable' using errcode='42501'; end if;
 perform 1 from railplan_private.notification_deliveries where id=a.delivery_id for update;
 insert into railplan_private.notification_results(attempt_id,telegram_message_id,error_code,ambiguous,retry_after_seconds)
 values(claim,message_id,failure_code,is_ambiguous,retry_seconds) on conflict(attempt_id) do nothing;
end $$;

revoke all on function railplan_private.notification_plan_requests(uuid),railplan_private.notification_time(integer),railplan_private.queue_publication_notifications() from public,anon,authenticated;
revoke all on function railplan_private.configure_notification(uuid,integer,text),railplan_private.queue_notification_test(uuid,integer),railplan_private.claim_notification(uuid,boolean,boolean),railplan_private.finish_notification(uuid,text,text,boolean,integer) from public,anon;
grant execute on function railplan_private.configure_notification(uuid,integer,text),railplan_private.queue_notification_test(uuid,integer),railplan_private.claim_notification(uuid,boolean,boolean),railplan_private.finish_notification(uuid,text,text,boolean,integer) to authenticated;
