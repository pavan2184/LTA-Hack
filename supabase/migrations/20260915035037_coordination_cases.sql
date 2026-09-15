-- Private, informational coordination. No confirmation gate on planning/publication.
create table railplan_private.coordination_cases (
 id uuid primary key default gen_random_uuid(),
 planning_night date not null references public.planning_nights(planning_night),
 selected_request_ids text[] not null check(cardinality(selected_request_ids) between 1 and 100),
 owner_id uuid not null,
 created_by uuid not null,
 idempotency_key uuid not null,
 creation_digest text not null,
 version integer not null default 1 check(version > 0),
 current_revision integer not null default 1 check(current_revision > 0),
 state text not null default 'open' check(state in ('open','closed')),
 deadline timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 unique(created_by,idempotency_key)
);
create table railplan_private.coordination_proposals (
 case_id uuid not null references railplan_private.coordination_cases(id),
 revision integer not null check(revision > 0),
 source_plan_id uuid not null references railplan_private.planning_runs(id),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(case_id,revision)
);
create table railplan_private.coordination_participants (
 case_id uuid not null,
 revision integer not null,
 organisation_id uuid not null references public.contractor_organisations(id),
 changes jsonb not null check(jsonb_typeof(changes)='array'),
 primary key(case_id,revision,organisation_id),
 foreign key(case_id,revision) references railplan_private.coordination_proposals(case_id,revision)
);
create table railplan_private.coordination_events (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null,
 revision integer not null,
 case_version integer not null,
 action text not null check(action in ('create','revise','approve','request-changes','apply','assign','deadline','escalate','close','reopen','withdraw')),
 actor_id uuid not null,
 organisation_id uuid,
 confirmed_at timestamptz,
 note text check(note is null or length(btrim(note)) between 1 and 1000),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(case_id,revision) references railplan_private.coordination_proposals(case_id,revision),
 unique(case_id,case_version)
);
create table railplan_private.coordination_applications (
 case_id uuid not null,
 revision integer not null,
 plan_id uuid not null unique references railplan_private.planning_runs(id),
 idempotency_key uuid not null,
 expected_version integer not null,
 actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(case_id,revision),
 unique(case_id,idempotency_key),
 foreign key(case_id,revision) references railplan_private.coordination_proposals(case_id,revision)
);
create index coordination_cases_queue on railplan_private.coordination_cases(planning_night,state,id);
create index coordination_participants_org on railplan_private.coordination_participants(organisation_id,case_id);
do $$ declare t text; begin
 foreach t in array array['coordination_cases','coordination_proposals','coordination_participants','coordination_events','coordination_applications'] loop
  execute format('alter table railplan_private.%I enable row level security',t);
  execute format('revoke all on railplan_private.%I from public,anon,authenticated',t);
  execute format('grant select on railplan_private.%I to authenticated',t);
  execute format('create policy planner_read on railplan_private.%I for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role=''planner''))',t);
  if t <> 'coordination_cases' then
   execute format('create trigger immutable_history before update or delete or truncate on railplan_private.%I for each statement execute function railplan_private.reject_plan_mutation()',t);
  end if;
 end loop;
end $$;

-- Only internal mutation routines invoke this helper. Ownership is derived from
-- the exact saved UUID/revision, never from proposal organisationId fields.
create function railplan_private.insert_coordination_proposal(cid uuid, rev integer, proposal jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare source railplan_private.planning_runs; item jsonb;
begin
 select * into source from railplan_private.planning_runs where id=(proposal->>'sourcePlanId')::uuid;
 if source.id is null or source.source_revision::text is distinct from proposal->>'sourceRevision'
  or source.input_digest is distinct from proposal->>'sourceDigest'
  or source.planning_night::text is distinct from proposal->'parameters'->>'planningNight'
  or proposal->'result'->>'independentlyValidated' is distinct from 'true'
  or proposal->'result'->>'status'='INFEASIBLE'
  or coalesce(proposal->>'resultDigest','') !~ '^sha256:[0-9a-f]{64}$'
  or coalesce(proposal->>'impactDigest','') !~ '^sha256:[0-9a-f]{64}$'
  or jsonb_typeof(proposal->'changes') is distinct from 'array' then
  raise exception 'Invalid proposal evidence' using errcode='22023';
 end if;
 if source.source_revision <> (select revision from railplan_private.planning_source where singleton) then
  raise exception 'Stale proposal source' using errcode='40001';
 end if;
 for item in select value from jsonb_array_elements(proposal->'changes') loop
  if not exists(select 1 from jsonb_array_elements(source.facts->'requests') r where r->>'id'=item->>'requestId') then
   raise exception 'Unknown impact request' using errcode='22023';
  end if;
 end loop;
 insert into railplan_private.coordination_proposals(case_id,revision,source_plan_id,payload) values(cid,rev,source.id,proposal);
 insert into railplan_private.coordination_participants(case_id,revision,organisation_id,changes)
 select cid,rev,s.organisation_id,jsonb_agg(ch.value || jsonb_build_object('organisationId',s.organisation_id,'submissionRevision',r.version) order by ch.value->>'requestId')
 from jsonb_array_elements(proposal->'changes') ch
 join jsonb_array_elements(source.facts->'requests') fact on fact->>'id'=ch.value->>'requestId'
 join railplan_private.request_submissions s on 'R-'||s.id= fact->>'id'
 join railplan_private.request_revisions r on r.submission_id=s.id and r.version=(fact->>'submissionRevision')::integer and r.status='approved'
 group by s.organisation_id;
end $$;
revoke all on function railplan_private.insert_coordination_proposal(uuid,integer,jsonb) from public,anon,authenticated;

create function railplan_private.create_coordination_case(source_id uuid, selected_ids text[], idem uuid, digest text, response_deadline timestamptz, proposal jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c railplan_private.coordination_cases; source railplan_private.planning_runs;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then return jsonb_build_object('error','forbidden'); end if;
 perform railplan_private.lock_planning_source();
 select * into c from railplan_private.coordination_cases where created_by=auth.uid() and idempotency_key=idem;
 if c.id is not null then
  if c.creation_digest is distinct from digest then return jsonb_build_object('error','conflict'); end if;
  return jsonb_build_object('id',c.id);
 end if;
 select * into source from railplan_private.planning_runs where id=source_id;
 if source.id is null then return jsonb_build_object('error','not_found'); end if;
 if source_id::text is distinct from proposal->>'sourcePlanId' or idem is null or digest is null
  or cardinality(selected_ids) not between 1 and 100
  or exists(select 1 from unnest(selected_ids) id where length(id) not between 1 and 64 or not exists(select 1 from jsonb_array_elements(source.facts->'requests') r where r->>'id'=id)) then
  return jsonb_build_object('error','invalid_request');
 end if;
 insert into railplan_private.coordination_cases(planning_night,selected_request_ids,owner_id,created_by,idempotency_key,creation_digest,deadline)
 values(source.planning_night,selected_ids,auth.uid(),auth.uid(),idem,digest,response_deadline) returning * into c;
 perform railplan_private.insert_coordination_proposal(c.id,1,proposal);
 insert into railplan_private.coordination_events(case_id,revision,case_version,action,actor_id) values(c.id,1,1,'create',auth.uid());
 return jsonb_build_object('id',c.id);
end $$;
revoke all on function railplan_private.create_coordination_case(uuid,text[],uuid,text,timestamptz,jsonb) from public,anon;
grant execute on function railplan_private.create_coordination_case(uuid,text[],uuid,text,timestamptz,jsonb) to authenticated;

-- All state/version checks live under the case lock. Source-affecting paths
-- take the source lock first, matching generation/publication/intake lock order.
create function railplan_private.mutate_coordination_case(cid uuid, command jsonb, proposal jsonb default null, applied_plan uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; c railplan_private.coordination_cases; app railplan_private.coordination_applications;
 action text:=command->>'action'; rev integer; org uuid; next_version integer; note_text text:=command->>'note';
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or (actor.role <> 'planner' and action <> 'request-changes') then return jsonb_build_object('error','forbidden'); end if;
 if action in ('apply','revise') then perform railplan_private.lock_planning_source(); end if;
 select * into c from railplan_private.coordination_cases where id=cid for update;
 if c.id is null then return jsonb_build_object('error','not_found'); end if;
 if actor.role <> 'planner' and not exists(select 1 from railplan_private.coordination_participants where case_id=cid and revision=c.current_revision and organisation_id=actor.contractor_organisation_id) then return jsonb_build_object('error','not_found'); end if;
 if action='apply' then
  select * into app from railplan_private.coordination_applications where case_id=cid and idempotency_key=(command->>'idempotencyKey')::uuid;
  if app.plan_id is not null then
   if app.revision is distinct from (command->>'revision')::integer or app.expected_version is distinct from (command->>'expectedVersion')::integer or app.actor_id <> auth.uid() then return jsonb_build_object('error','conflict'); end if;
   return jsonb_build_object('id',cid,'appliedPlanId',app.plan_id);
  end if;
 end if;
 if c.version is distinct from (command->>'expectedVersion')::integer then return jsonb_build_object('error','conflict'); end if;
 if action not in ('revise','approve','request-changes','apply','assign','deadline','escalate','close','reopen','withdraw') or action is null then return jsonb_build_object('error','invalid_request'); end if;
 if (c.state='closed' and action <> 'reopen') or (c.state='open' and action='reopen') then return jsonb_build_object('error','conflict'); end if;
 if action in ('approve','request-changes','escalate','close','reopen','withdraw') and (note_text is null or length(btrim(note_text)) not between 1 and 1000) then return jsonb_build_object('error','invalid_request'); end if;
 rev:=c.current_revision; next_version:=c.version+1;
 if action in ('approve','request-changes','apply') and rev is distinct from (command->>'revision')::integer then return jsonb_build_object('error','conflict'); end if;
 if action in ('approve','request-changes','apply','withdraw') and exists(select 1 from railplan_private.coordination_events e where e.case_id=cid and e.revision=rev and e.action='withdraw') then return jsonb_build_object('error','conflict'); end if;
 if action in ('approve','request-changes') then
  org:=case when action='approve' then (command->>'organisationId')::uuid else actor.contractor_organisation_id end;
  if org is null or not exists(select 1 from railplan_private.coordination_participants where case_id=cid and revision=rev and organisation_id=org) then return jsonb_build_object('error','forbidden'); end if;
  if action='approve' and ((command->>'confirmedAt') is null or (command->>'confirmedAt')::timestamptz > clock_timestamp()) then return jsonb_build_object('error','invalid_request'); end if;
 elsif action='revise' then
  if not exists(select 1 from railplan_private.planning_runs where id=(proposal->>'sourcePlanId')::uuid and planning_night=c.planning_night) then return jsonb_build_object('error','invalid_request'); end if;
  rev:=rev+1;
  perform railplan_private.insert_coordination_proposal(cid,rev,proposal);
 elsif action='assign' then
  if not exists(select 1 from public.profiles where id=(command->>'ownerId')::uuid and role='planner') then return jsonb_build_object('error','invalid_request'); end if;
 elsif action='withdraw' then
  if exists(select 1 from railplan_private.coordination_applications where case_id=cid and revision=rev) then return jsonb_build_object('error','conflict'); end if;
 elsif action='apply' then
  if (command->>'idempotencyKey') is null or exists(select 1 from railplan_private.coordination_applications where case_id=cid and revision=rev) then return jsonb_build_object('error','conflict'); end if;
  if applied_plan is null or not exists(select 1 from railplan_private.planning_runs run join railplan_private.coordination_proposals p on p.case_id=cid and p.revision=rev where run.id=applied_plan and run.created_by=auth.uid() and run.source_revision=(p.payload->>'sourceRevision')::bigint and run.source_revision=(select revision from railplan_private.planning_source where singleton) and run.input_digest=p.payload->>'inputDigest' and run.result->>'independentlyValidated'='true' and run.result->>'status'<>'INFEASIBLE'
   and run.result-'solveMs'=p.payload->'result'-'solveMs'-'plan'
   and coalesce((select jsonb_agg(jsonb_build_object('requestId',q.request_id,'teamId',q.team_id,'startMinute',q.start_minute,'endMinute',q.end_minute,'locked',q.locked) order by q.position) from railplan_private.plan_placements q where q.plan_id=run.id),'[]'::jsonb)=p.payload->'result'->'plan'->'placements'
   and coalesce((select jsonb_agg(jsonb_build_object('requestId',q.request_id,'bindingRuleIds',q.binding_rule_ids,'reason',q.reason) order by q.position) from railplan_private.plan_deferrals q where q.plan_id=run.id),'[]'::jsonb)=p.payload->'result'->'plan'->'deferred'
  ) then return jsonb_build_object('error','invalid_plan'); end if;
  insert into railplan_private.coordination_applications(case_id,revision,plan_id,idempotency_key,expected_version,actor_id) values(cid,rev,applied_plan,(command->>'idempotencyKey')::uuid,c.version,auth.uid());
 end if;
 update railplan_private.coordination_cases set version=next_version,current_revision=rev,
  owner_id=case when action='assign' then (command->>'ownerId')::uuid else owner_id end,
  deadline=case when action='deadline' then (command->>'deadline')::timestamptz else deadline end,
  state=case when action='close' then 'closed' when action='reopen' then 'open' else state end where id=cid;
 insert into railplan_private.coordination_events(case_id,revision,case_version,action,actor_id,organisation_id,confirmed_at,note)
 values(cid,rev,next_version,action,auth.uid(),org,case when action='approve' then (command->>'confirmedAt')::timestamptz else null end,note_text);
 return jsonb_build_object('id',cid,'appliedPlanId',applied_plan);
end $$;
revoke all on function railplan_private.mutate_coordination_case(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function railplan_private.mutate_coordination_case(uuid,jsonb,jsonb,uuid) to authenticated;

-- Full proposal tables are planner-only under RLS. This is the only contractor
-- read path: an explicit DTO containing that organisation's own change snapshots.
create function railplan_private.read_coordination_case(cid uuid, selected_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; c railplan_private.coordination_cases; result jsonb; confirmations jsonb; changes jsonb; proposal_state text; view_rev integer;
begin
 select * into actor from public.profiles where id=auth.uid();
 select * into c from railplan_private.coordination_cases where id=cid;
 if actor.id is null or c.id is null then return null; end if;
 view_rev:=coalesce(selected_revision,c.current_revision);
 if not exists(select 1 from railplan_private.coordination_proposals where case_id=cid and revision=view_rev) then return null; end if;
 if actor.role <> 'planner' and not exists(select 1 from railplan_private.coordination_participants where case_id=cid and revision=view_rev and organisation_id=actor.contractor_organisation_id) then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object('organisationId',p.organisation_id,'revision',p.revision,'status',case e.action when 'approve' then 'approved' when 'request-changes' then 'changes-requested' else 'pending' end) || case when e.id is null then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object('note',case when actor.role='planner' or e.action='request-changes' then e.note else null end,'confirmedAt',e.confirmed_at)) end order by p.organisation_id),'[]'::jsonb) into confirmations
 from railplan_private.coordination_participants p
 left join lateral(select * from railplan_private.coordination_events where case_id=cid and revision=p.revision and organisation_id=p.organisation_id and action in ('approve','request-changes') order by case_version desc limit 1) e on true
 where p.case_id=cid and p.revision=view_rev and (actor.role='planner' or p.organisation_id=actor.contractor_organisation_id);
 if actor.role='planner' then select payload->'changes' into changes from railplan_private.coordination_proposals where case_id=cid and revision=view_rev;
 else
  -- Deferral explanations may name other work. Contractors get an explicit
  -- own-request projection and a generic deferral label, never global prose.
  select jsonb_agg(jsonb_build_object('requestId',ch->>'requestId','organisationId',p.organisation_id,'submissionRevision',ch->'submissionRevision','kind',ch->>'kind',
   'before',case when ch->'before'='null'::jsonb then null else jsonb_build_object('requestId',ch->>'requestId','teamId',ch->'before'->>'teamId','startMinute',ch->'before'->'startMinute','endMinute',ch->'before'->'endMinute','locked',ch->'before'->'locked') end,
   'after',case when ch->'after'='null'::jsonb then null else jsonb_build_object('requestId',ch->>'requestId','teamId',ch->'after'->>'teamId','startMinute',ch->'after'->'startMinute','endMinute',ch->'after'->'endMinute','locked',ch->'after'->'locked') end,
   'beforeDeferral',case when ch->'beforeDeferral'='null'::jsonb then null else jsonb_build_object('requestId',ch->>'requestId','bindingRuleIds','[]'::jsonb,'reason','Deferred') end,
   'afterDeferral',case when ch->'afterDeferral'='null'::jsonb then null else jsonb_build_object('requestId',ch->>'requestId','bindingRuleIds','[]'::jsonb,'reason','Deferred') end
  ) order by ch->>'requestId') into changes from railplan_private.coordination_participants p cross join lateral jsonb_array_elements(p.changes) ch where case_id=cid and revision=view_rev and organisation_id=actor.contractor_organisation_id;
 end if;
 result:=jsonb_build_object('id',c.id,'version',c.version,'planningNight',c.planning_night,'state',c.state,'deadline',c.deadline,'currentRevision',c.current_revision,'viewedRevision',view_rev,'confirmations',confirmations,'changes',changes,'createdAt',c.created_at,'overdue',coalesce(c.deadline<clock_timestamp() and exists(select 1 from jsonb_array_elements(confirmations) x where x->>'status'<>'approved'),false));
 if actor.role='planner' then
  return result || jsonb_build_object('scope','planner','ownerId',c.owner_id,'selectedRequestIds',c.selected_request_ids,
   'proposals',(select jsonb_agg(p.payload || jsonb_build_object('revision',p.revision,'createdAt',p.created_at,'appliedPlanId',a.plan_id,'stale',(p.payload->>'sourceRevision')::bigint<>(select revision from railplan_private.planning_source where singleton),'state',case when a.plan_id is not null then 'applied' when exists(select 1 from railplan_private.coordination_events where case_id=cid and revision=p.revision and action='withdraw') then 'withdrawn' when p.revision<c.current_revision then 'superseded' else 'proposed' end) order by p.revision) from railplan_private.coordination_proposals p left join railplan_private.coordination_applications a on a.case_id=cid and a.revision=p.revision where p.case_id=cid),
   'events',(select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'revision',e.revision,'actorId',e.actor_id,'createdAt',e.created_at,'note',e.note,'organisationId',e.organisation_id,'confirmedAt',e.confirmed_at) order by e.case_version) from railplan_private.coordination_events e where e.case_id=cid));
 end if;
 proposal_state:=case when exists(select 1 from railplan_private.coordination_applications where case_id=cid and revision=view_rev) then 'applied' when exists(select 1 from railplan_private.coordination_events where case_id=cid and revision=view_rev and action='withdraw') then 'withdrawn' else 'proposed' end;
 return result || jsonb_build_object('scope','contractor','proposalState',proposal_state);
end $$;
revoke all on function railplan_private.read_coordination_case(uuid,integer) from public,anon;
grant execute on function railplan_private.read_coordination_case(uuid,integer) to authenticated;

create function railplan_private.list_coordination_cases(filters jsonb) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null then return; end if;
 return query select dto from railplan_private.coordination_cases c
 cross join lateral(select railplan_private.read_coordination_case(c.id,case when filters->>'appliedPlanId' is not null then (select a.revision from railplan_private.coordination_applications a where a.case_id=c.id and a.plan_id=(filters->>'appliedPlanId')::uuid) else null end) dto) scoped
 where dto is not null and (filters->>'planningNight' is null or c.planning_night=(filters->>'planningNight')::date)
 and (filters->>'state' is null or c.state=filters->>'state')
 and (filters->>'ownerId' is null or (actor.role='planner' and c.owner_id=(filters->>'ownerId')::uuid))
 and (filters->>'appliedPlanId' is null or (actor.role='planner' and exists(select 1 from railplan_private.coordination_applications a where a.case_id=c.id and a.plan_id=(filters->>'appliedPlanId')::uuid)))
 and (filters->>'cursor' is null or c.id<(filters->>'cursor')::uuid)
 and (filters->>'overdue' is null or (dto->>'overdue')::boolean=(filters->>'overdue')::boolean)
 and (filters->>'pending' is null or exists(select 1 from jsonb_array_elements(dto->'confirmations') x where x->>'status'<>'approved')=(filters->>'pending')::boolean)
 order by c.id desc limit least(greatest(coalesce((filters->>'limit')::integer,20),1),50)+1;
end $$;
revoke all on function railplan_private.list_coordination_cases(jsonb) from public,anon;
grant execute on function railplan_private.list_coordination_cases(jsonb) to authenticated;

create function railplan_private.coordination_owners() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then return null; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'isCurrentUser',id=auth.uid()) order by id),'[]'::jsonb) from (select id from public.profiles where role='planner' order by id limit 100) p);
end $$;
revoke all on function railplan_private.coordination_owners() from public,anon;
grant execute on function railplan_private.coordination_owners() to authenticated;

-- SELECT FOR UPDATE requires UPDATE privilege, which authenticated callers must
-- never receive on cases. This narrow lock keeps the existing source→case order.
create function railplan_private.lock_coordination_case(cid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform railplan_private.lock_planning_source();
 perform 1 from railplan_private.coordination_cases where id=cid for update;
end $$;
revoke all on function railplan_private.lock_coordination_case(uuid) from public,anon;
grant execute on function railplan_private.lock_coordination_case(uuid) to authenticated;
