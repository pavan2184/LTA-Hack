-- Durable backlog metadata. No solver inputs, publication permissions or sends.
create table railplan_private.work_items (
 id uuid primary key default gen_random_uuid(),
 source_key text not null unique,
 source_plan_id uuid not null references railplan_private.planning_runs(id),
 source_request_id text not null check(length(source_request_id) between 1 and 64),
 source_night date not null,
 title text not null,
 organisation_id uuid references public.contractor_organisations(id),
 owner_id uuid,
 due_date date check(due_date between date '2000-01-01' and date '2100-12-31'),
 priority text not null check(priority in ('critical','high','medium','low')),
 repeat_threshold integer not null default 2 check(repeat_threshold between 1 and 100),
 proposed_night date references public.planning_nights(planning_night),
 lifecycle text not null default 'open' check(lifecycle in ('open','completed','cancelled')),
 version integer not null default 1 check(version > 0),
 created_by uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
-- Reserve durable identity for subsequent reviewed carry-forward intake. These
-- links cannot grant approval; request_submissions.active_approved_version is
-- the existing source of active planning facts and of retirement status.
create table railplan_private.work_item_submissions (
 submission_id uuid primary key references railplan_private.request_submissions(id),
 work_item_id uuid not null references railplan_private.work_items(id),
 planning_night date not null references public.planning_nights(planning_night),
 kind text not null check(kind in ('source','carry-forward')),
 created_by uuid not null,
 created_at timestamptz not null default clock_timestamp()
);
create index work_item_submissions_item on railplan_private.work_item_submissions(work_item_id);
create table railplan_private.work_item_events (
 id bigint generated always as identity primary key,
 work_item_id uuid not null references railplan_private.work_items(id),
 kind text not null check(kind in ('record','deferred','scheduled','removed','update','complete','cancel','reopen','escalate','propose-night')),
 night date,
 plan_id uuid references railplan_private.planning_runs(id),
 request_id text,
 publication_id uuid references railplan_private.plan_publications(plan_id),
 actor_id uuid not null,
 note text check(note is null or length(btrim(note)) between 1 and 1000),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default clock_timestamp(),
 unique(work_item_id,publication_id),
 check(kind not in ('deferred','scheduled','removed') or (night is not null and plan_id is not null))
);
create index work_item_events_projection on railplan_private.work_item_events(work_item_id,night,id desc);
create table railplan_private.work_item_mutations (
 actor_id uuid not null,
 idempotency_key uuid not null,
 input jsonb not null,
 work_item_id uuid not null references railplan_private.work_items(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,idempotency_key)
);
create index work_items_queue on railplan_private.work_items(owner_id,source_night,id);
create index work_items_organisation on railplan_private.work_items(organisation_id,id);
do $$ declare t text; begin
 foreach t in array array['work_items','work_item_submissions','work_item_events','work_item_mutations'] loop
  execute format('alter table railplan_private.%I enable row level security',t);
  execute format('revoke all on railplan_private.%I from public,anon,authenticated',t);
  execute format('grant select on railplan_private.%I to authenticated',t);
  execute format('create policy planner_read on railplan_private.%I for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role=''planner''))',t);
  if t <> 'work_items' then
   execute format('create trigger immutable_history before update or delete or truncate on railplan_private.%I for each statement execute function railplan_private.reject_plan_mutation()',t);
  end if;
 end loop;
end $$;
revoke all on sequence railplan_private.work_item_events_id_seq from public,anon,authenticated;

-- Internal helper, called only under the planning source lock. Identity derives
-- from exact saved approved intake UUID/revision or night-qualified baseline ID.
create function railplan_private.resolve_work_item(run_id uuid, rid text) returns uuid
language plpgsql security definer set search_path='' as $$
declare run railplan_private.planning_runs; fact jsonb; sid uuid; org uuid; wid uuid; skey text;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then raise exception 'Planner required' using errcode='42501'; end if;
 select * into run from railplan_private.planning_runs where id=run_id;
 select value into fact from jsonb_array_elements(run.facts->'requests') where value->>'id'=rid;
 if fact is null then raise exception 'Missing saved request' using errcode='22023'; end if;
 if rid like 'R-%' then
  select s.id,s.organisation_id into sid,org from railplan_private.request_submissions s
   join railplan_private.request_revisions r on r.submission_id=s.id and r.version=(fact->>'submissionRevision')::integer and r.status='approved'
   where 'R-'||s.id=rid;
  if sid is null then raise exception 'Missing approved identity' using errcode='22023'; end if;
  select work_item_id into wid from railplan_private.work_item_submissions where submission_id=sid;
  if wid is not null then return wid; end if;
  skey:='intake:'||sid;
 else
  skey:='seed:'||run.planning_night||':'||rid;
 end if;
 insert into railplan_private.work_items(source_key,source_plan_id,source_request_id,source_night,title,organisation_id,owner_id,priority,created_by)
 values(skey,run.id,rid,run.planning_night,fact->>'title',org,auth.uid(),fact->>'priority',auth.uid())
 on conflict(source_key) do nothing returning id into wid;
 if wid is null then select id into wid from railplan_private.work_items where source_key=skey; end if;
 if sid is not null then
  insert into railplan_private.work_item_submissions(submission_id,work_item_id,planning_night,kind,created_by)
  values(sid,wid,run.planning_night,'source',auth.uid()) on conflict(submission_id) do nothing;
 end if;
 return wid;
end $$;
revoke all on function railplan_private.resolve_work_item(uuid,text) from public,anon,authenticated;

-- Internal matching is deliberately UUID-based. Titles never link work.
create function railplan_private.work_item_matches(wid uuid, night date, rid text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from railplan_private.work_items w where w.id=wid and
  ((w.source_key like 'seed:%' and w.source_night=night and w.source_request_id=rid)
   or exists(select 1 from railplan_private.work_item_submissions l where l.work_item_id=w.id and 'R-'||l.submission_id=rid)))
$$;
revoke all on function railplan_private.work_item_matches(uuid,date,text) from public,anon,authenticated;

-- One event per publication/item; a replacement appends a correction, preserving
-- earlier evidence. Scheduled is a projection, never a completion mutation.
create function railplan_private.project_work_publication(wid uuid, published uuid) returns void
language plpgsql security definer set search_path='' as $$
declare night date; rid text; outcome text; inserted bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then raise exception 'Planner required' using errcode='42501'; end if;
 select planning_night into night from railplan_private.planning_runs where id=published;
 select p.request_id into rid from railplan_private.plan_placements p where p.plan_id=published and railplan_private.work_item_matches(wid,night,p.request_id) order by p.position limit 1;
 if rid is not null then outcome:='scheduled';
 else
  select d.request_id into rid from railplan_private.plan_deferrals d where d.plan_id=published and railplan_private.work_item_matches(wid,night,d.request_id) order by d.position limit 1;
  outcome:=case when rid is null then 'removed' else 'deferred' end;
 end if;
 insert into railplan_private.work_item_events(work_item_id,kind,night,plan_id,request_id,publication_id,actor_id)
 values(wid,outcome,night,published,rid,published,auth.uid()) on conflict(work_item_id,publication_id) do nothing returning id into inserted;
 if inserted is not null then update railplan_private.work_items set version=version+1,updated_at=clock_timestamp() where id=wid; end if;
end $$;
revoke all on function railplan_private.project_work_publication(uuid,uuid) from public,anon,authenticated;

create function railplan_private.record_deferred_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare night date; rid text; wid uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then raise exception 'Planner required' using errcode='42501'; end if;
 -- Existing publication already owns this lock; taking it also protects direct
 -- owner INSERT paths that invoke the trigger with a verified planner context.
 perform railplan_private.lock_planning_source();
 select planning_night into night from railplan_private.planning_runs where id=new.plan_id;
 for rid in select request_id from railplan_private.plan_deferrals where plan_id=new.plan_id loop
  perform railplan_private.resolve_work_item(new.plan_id,rid);
 end loop;
 for wid in select w.id from railplan_private.work_items w where w.source_night=night
  or exists(select 1 from railplan_private.work_item_submissions l where l.work_item_id=w.id and l.planning_night=night)
 loop
  perform railplan_private.project_work_publication(wid,new.plan_id);
 end loop;
 return new;
end $$;
revoke all on function railplan_private.record_deferred_publication() from public,anon,authenticated;
create trigger record_deferred_work after insert on railplan_private.plan_publications
 for each row execute function railplan_private.record_deferred_publication();

create function railplan_private.record_work_deferral(command jsonb) returns jsonb
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
 -- Historical explicit evidence is subordinate to the current published result.
 if current_plan is not null then
  perform railplan_private.project_work_publication(wid,current_plan);
 end if;
 if current_plan is null or not exists(select 1 from railplan_private.plan_placements p where p.plan_id=current_plan and railplan_private.work_item_matches(wid,source.planning_night,p.request_id)) then
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

create function railplan_private.read_work_item(wid uuid, include_history boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; w railplan_private.work_items; state_text text; nights jsonb; history jsonb; links jsonb;
 today date:=(current_timestamp at time zone 'Asia/Singapore')::date; owner uuid; payload jsonb;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null then return null; end if;
 select * into w from railplan_private.work_items where id=wid;
 if w.id is null or (actor.role <> 'planner' and (actor.contractor_organisation_id is null or w.organisation_id is distinct from actor.contractor_organisation_id)) then return null; end if;
 select id into owner from public.profiles where id=w.owner_id and role='planner';
 state_text:=w.lifecycle;
 if state_text='open' and exists(
  select 1 from railplan_private.plan_publications pub join railplan_private.planning_runs run on run.id=pub.plan_id
  join railplan_private.plan_placements p on p.plan_id=run.id
  where not exists(select 1 from railplan_private.plan_publications later where later.supersedes=pub.plan_id)
  and railplan_private.work_item_matches(w.id,run.planning_night,p.request_id)
  and (w.source_key like 'seed:%' or exists(
   select 1 from railplan_private.work_item_submissions link
   join railplan_private.request_submissions s on s.id=link.submission_id
   join jsonb_array_elements(run.facts->'requests') f on f->>'id'='R-'||s.id
   where link.work_item_id=w.id and p.request_id='R-'||s.id and s.active_approved_version=(f->>'submissionRevision')::integer
  ))) then state_text:='scheduled'; end if;
 select coalesce(jsonb_agg(e.night::text order by e.night),'[]'::jsonb) into nights from (
  select distinct on(night) night,kind from railplan_private.work_item_events where work_item_id=w.id and kind in ('deferred','scheduled') order by night,id desc
 ) e where e.kind='deferred';
 -- Build the contractor allowlist first, inside SQL; even a direct function
 -- caller cannot retrieve source plan links, owner/actor IDs or planner history.
 payload:=jsonb_build_object('id',w.id,'scope',actor.role,'title',w.title,'sourceNight',w.source_night,'sourceRequestId',w.source_request_id,
  'organisationId',w.organisation_id,'dueDate',w.due_date,'priority',w.priority,'repeatThreshold',w.repeat_threshold,'proposedNight',w.proposed_night,
  'state',state_text,'effectiveDeferredNights',nights,'deferredCount',jsonb_array_length(nights),'createdAt',w.created_at,'updatedAt',w.updated_at,
  'flags',jsonb_build_object('overdue',coalesce(state_text in ('open','scheduled') and w.due_date<today,false),
   'repeated',state_text in ('open','scheduled') and jsonb_array_length(nights)>=w.repeat_threshold,'missingDueDate',w.due_date is null,'missingOwner',owner is null,
   'awaitingTargetNightReview',state_text in ('open','scheduled') and w.proposed_night is not null));
 if actor.role='planner' then
  payload:=payload||jsonb_build_object('sourcePlanId',w.source_plan_id,'ownerId',owner,'version',w.version);
 end if;
 if actor.role='planner' and include_history then
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'kind',e.kind,'night',e.night,'planId',e.plan_id,'requestId',e.request_id,'actorId',e.actor_id,'note',e.note,'metadata',e.metadata,'createdAt',e.created_at) order by e.id),'[]'::jsonb) into history
   from (select * from railplan_private.work_item_events where work_item_id=w.id order by id desc limit 100) e;
  select coalesce(jsonb_agg(jsonb_build_object('submissionId',l.submission_id,'planningNight',l.planning_night,'kind',l.kind) order by l.created_at,l.submission_id),'[]'::jsonb) into links
   from railplan_private.work_item_submissions l where l.work_item_id=w.id;
  payload:=payload||jsonb_build_object('events',history,'historyTruncated',(select count(*)>100 from railplan_private.work_item_events where work_item_id=w.id),'submissions',links);
 end if;
 return payload;
end $$;
revoke all on function railplan_private.read_work_item(uuid,boolean) from public,anon;
grant execute on function railplan_private.read_work_item(uuid,boolean) to authenticated;

create function railplan_private.mutate_work_item(wid uuid, command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w railplan_private.work_items; action text:=command->>'action'; note_text text:=command->>'note'; allowed text[];
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then return jsonb_build_object('error','forbidden'); end if;
 if action is null or action not in ('update','complete','cancel','reopen','escalate','propose-night') or jsonb_typeof(command) is distinct from 'object' then return jsonb_build_object('error','invalid_request'); end if;
 allowed:=case when action='update' then array['action','expectedVersion','ownerId','dueDate','priority','repeatThreshold'] when action='propose-night' then array['action','expectedVersion','planningNight','note'] else array['action','expectedVersion','note'] end;
 if (command-allowed)<>'{}'::jsonb or command->>'expectedVersion' is null then return jsonb_build_object('error','invalid_request'); end if;
 if action<>'update' and (note_text is null or length(btrim(note_text)) not between 1 and 1000) then return jsonb_build_object('error','invalid_request'); end if;
 select * into w from railplan_private.work_items where id=wid for update;
 if w.id is null then return jsonb_build_object('error','not_found'); end if;
 if w.version is distinct from (command->>'expectedVersion')::integer then return jsonb_build_object('error','conflict'); end if;
 if (action='reopen' and w.lifecycle='open') or (action<>'reopen' and w.lifecycle<>'open') then return jsonb_build_object('error','conflict'); end if;
 if action='update' then
  if not command ?| array['ownerId','dueDate','priority','repeatThreshold'] then return jsonb_build_object('error','invalid_request'); end if;
  if command->>'ownerId' is not null and not exists(select 1 from public.profiles where id=(command->>'ownerId')::uuid and role='planner') then return jsonb_build_object('error','invalid_request'); end if;
  if command ? 'priority' and (command->>'priority' is null or command->>'priority' not in ('low','medium','high','critical')) then return jsonb_build_object('error','invalid_request'); end if;
  if command ? 'repeatThreshold' and (command->>'repeatThreshold' is null or (command->>'repeatThreshold')::integer not between 1 and 100) then return jsonb_build_object('error','invalid_request'); end if;
  if command->>'dueDate' is not null and (command->>'dueDate' !~ '^\d{4}-\d{2}-\d{2}$' or (command->>'dueDate')::date not between date '2000-01-01' and date '2100-12-31') then return jsonb_build_object('error','invalid_request'); end if;
 elsif action='propose-night' then
  if not exists(select 1 from public.planning_nights where planning_night=(command->>'planningNight')::date) then return jsonb_build_object('error','invalid_request'); end if;
 end if;
 update railplan_private.work_items set
  owner_id=case when command ? 'ownerId' then (command->>'ownerId')::uuid else owner_id end,
  due_date=case when command ? 'dueDate' then (command->>'dueDate')::date else due_date end,
  priority=coalesce(command->>'priority',priority),repeat_threshold=coalesce((command->>'repeatThreshold')::integer,repeat_threshold),
  proposed_night=case when action='propose-night' then (command->>'planningNight')::date else proposed_night end,
  lifecycle=case action when 'complete' then 'completed' when 'cancel' then 'cancelled' when 'reopen' then 'open' else lifecycle end,
  version=version+1,updated_at=clock_timestamp() where id=wid;
 insert into railplan_private.work_item_events(work_item_id,kind,actor_id,note,metadata)
 values(wid,action,auth.uid(),case when action='update' then null else btrim(note_text) end,command-array['action','expectedVersion','note']);
 return jsonb_build_object('id',wid);
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then return jsonb_build_object('error','invalid_request');
end $$;
revoke all on function railplan_private.mutate_work_item(uuid,jsonb) from public,anon;
grant execute on function railplan_private.mutate_work_item(uuid,jsonb) to authenticated;

create function railplan_private.list_work_items(filters jsonb) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; amount integer:=coalesce((filters->>'limit')::integer,20);
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null then raise exception 'Assigned account required' using errcode='42501'; end if;
 if actor.role<>'planner' and filters ? 'ownerId' then raise exception 'Planner filter' using errcode='42501'; end if;
 if amount not between 1 and 50 then raise exception 'Invalid limit' using errcode='22023'; end if;
 return query select value from (
  select w.id,railplan_private.read_work_item(w.id,false) as value from railplan_private.work_items w
  where (actor.role='planner' or w.organisation_id=actor.contractor_organisation_id)
   and (filters->>'ownerId' is null or w.owner_id=(filters->>'ownerId')::uuid)
   and (filters->>'cursor' is null or w.id<(filters->>'cursor')::uuid)
   and (filters->>'planningNight' is null or w.source_night=(filters->>'planningNight')::date or w.proposed_night=(filters->>'planningNight')::date
    or exists(select 1 from railplan_private.work_item_events e where e.work_item_id=w.id and e.night=(filters->>'planningNight')::date)
    or exists(select 1 from railplan_private.work_item_submissions l where l.work_item_id=w.id and l.planning_night=(filters->>'planningNight')::date))
 ) q where value is not null
  and (filters->>'state' is null or value->>'state'=filters->>'state')
  and (filters->>'overdue' is null or value->'flags'->>'overdue'=filters->>'overdue')
  and (filters->>'repeated' is null or value->'flags'->>'repeated'=filters->>'repeated')
  and (filters->>'missingDue' is null or value->'flags'->>'missingDueDate'=filters->>'missingDue')
 order by id desc limit amount+1;
end $$;
revoke all on function railplan_private.list_work_items(jsonb) from public,anon;
grant execute on function railplan_private.list_work_items(jsonb) to authenticated;

create function railplan_private.work_item_catalogue() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null then raise exception 'Assigned account required' using errcode='42501'; end if;
 select jsonb_build_object('today',(current_timestamp at time zone 'Asia/Singapore')::date,'nights',coalesce(jsonb_agg(jsonb_build_object('planningNight',n.planning_night,'startMinute',n.window_start_minute,'endMinute',n.window_end_minute) order by n.planning_night),'[]'::jsonb)) into result
 from (select * from public.planning_nights order by planning_night desc limit 100) n;
 if actor.role='planner' then
  result:=result||jsonb_build_object('owners',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'isCurrentUser',p.id=auth.uid()) order by p.id),'[]'::jsonb) from (select id from public.profiles where role='planner' order by (id=auth.uid()) desc,id limit 100) p));
 end if;
 return result;
end $$;
revoke all on function railplan_private.work_item_catalogue() from public,anon;
grant execute on function railplan_private.work_item_catalogue() to authenticated;
