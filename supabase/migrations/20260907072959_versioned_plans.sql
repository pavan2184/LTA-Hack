-- Server-only artefacts live outside the exposed Data API schema. RLS still
-- checks the verified planner on every app read; writes use narrow functions.
create table railplan_private.planning_source (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 1 check(revision > 0),
  lock_generation bigint not null default 0
);
insert into railplan_private.planning_source default values;
alter table railplan_private.planning_source enable row level security;
revoke all on railplan_private.planning_source from public, anon, authenticated;

-- Conservative global revision: all shared topology/resource and request child
-- changes stale every night. Lock BEFORE mutation to serialize with publication.
create function railplan_private.bump_planning_source() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A contractor UPDATE matching zero RLS rows must not stale planner work.
  if current_setting('role') in ('authenticated','anon') and not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then return null; end if;
  update railplan_private.planning_source set revision = revision + 1 where singleton;
  return null;
end $$;
revoke all on function railplan_private.bump_planning_source() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['stations','track_blocks','block_adjacency','conflict_zones',
    'conflict_zone_blocks','conflict_zone_work_classes','teams','team_skills',
    'equipment_types','work_class_incompatibility','planning_nights',
    'maintenance_requests','request_blocks','request_required_skills','request_equipment','request_dependencies']
  loop
    execute format('create trigger revision_before_change before insert or update or delete or truncate on public.%I for each statement execute function railplan_private.bump_planning_source()', t);
  end loop;
end $$;

create table railplan_private.planning_runs (
  id uuid primary key default gen_random_uuid(),
  planning_night date not null,
  source_revision bigint not null,
  input_digest text not null check(input_digest ~ '^sha256:[0-9a-f]{64}$'),
  facts jsonb not null check(jsonb_typeof(facts) = 'object'),
  parameters jsonb not null check(jsonb_typeof(parameters) = 'object'),
  result jsonb not null check(jsonb_typeof(result) = 'object'),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index planning_runs_night_created on railplan_private.planning_runs(planning_night, created_at desc);
create table railplan_private.plan_placements (
  plan_id uuid not null references railplan_private.planning_runs(id),
  request_id text not null,
  position integer not null check(position >= 0),
  team_id text not null,
  start_minute integer not null,
  end_minute integer not null check(end_minute > start_minute),
  locked boolean not null,
  primary key(plan_id,request_id), unique(plan_id,position)
);
create table railplan_private.plan_deferrals (
  plan_id uuid not null references railplan_private.planning_runs(id),
  request_id text not null,
  position integer not null check(position >= 0),
  binding_rule_ids jsonb not null check(jsonb_typeof(binding_rule_ids)='array'),
  reason text not null,
  primary key(plan_id,request_id), unique(plan_id,position)
);
create table railplan_private.planner_decisions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references railplan_private.planning_runs(id),
  kind text not null check(kind in ('note','accept','reject')),
  reason text not null check(length(trim(reason)) between 1 and 1000),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index planner_decisions_plan on railplan_private.planner_decisions(plan_id);
create table railplan_private.plan_publications (
  plan_id uuid primary key references railplan_private.planning_runs(id),
  supersedes uuid unique references railplan_private.plan_publications(plan_id),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  check(plan_id is distinct from supersedes)
);
create table railplan_private.plan_audit_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references railplan_private.planning_runs(id),
  action text not null check(action in ('create','decision','publish','supersede','rejected_stale')),
  actor_id uuid not null,
  related_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index plan_audit_events_plan on railplan_private.plan_audit_events(plan_id,created_at);
-- Creator UUIDs intentionally have no cascading Auth FK: deleting an account
-- must never erase the immutable historical actor or artefact.
create function railplan_private.reject_plan_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin
  raise exception 'Plan history is immutable' using errcode = '42501';
end $$;
revoke all on function railplan_private.reject_plan_mutation() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['planning_runs','plan_placements','plan_deferrals','planner_decisions','plan_publications','plan_audit_events'] loop
    execute format('alter table railplan_private.%I enable row level security',t);
    execute format('revoke all on railplan_private.%I from public, anon, authenticated',t);
    execute format('grant select on railplan_private.%I to authenticated',t);
    execute format('create policy planner_read on railplan_private.%I for select to authenticated using (exists(select 1 from public.profiles where id=(select auth.uid()) and role=''planner''))',t);
    execute format('create trigger immutable_history before update or delete or truncate on railplan_private.%I for each statement execute function railplan_private.reject_plan_mutation()',t);
  end loop;
end $$;

create function railplan_private.lock_planning_source() returns bigint
language plpgsql security definer set search_path = '' as $$
declare revision_value bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then
    raise exception 'Planner authentication required' using errcode='42501';
  end if;
  -- Updating a separate generation forces overlapping repeatable-read snapshots
  -- to retry after another create/publish commits, including the first publish.
  update railplan_private.planning_source set lock_generation=lock_generation+1 where singleton returning revision into revision_value;
  return revision_value;
end $$;
revoke all on function railplan_private.lock_planning_source() from public, anon;
grant execute on function railplan_private.lock_planning_source() to authenticated;

create function railplan_private.save_generated_plan(night date, expected_revision bigint, digest text, input_facts jsonb, input_parameters jsonb, output_result jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare run_id uuid; item jsonb; ordinal bigint;
begin
  if railplan_private.lock_planning_source() <> expected_revision then
    raise exception 'Source changed' using errcode='40001';
  end if;
  insert into railplan_private.planning_runs(planning_night,source_revision,input_digest,facts,parameters,result,created_by)
    values(night,expected_revision,digest,input_facts,input_parameters,output_result - 'plan',auth.uid()) returning id into run_id;
  for item,ordinal in select value, ordinality from jsonb_array_elements(output_result->'plan'->'placements') with ordinality loop
    insert into railplan_private.plan_placements values(run_id,item->>'requestId',ordinal-1,item->>'teamId',(item->>'startMinute')::integer,(item->>'endMinute')::integer,(item->>'locked')::boolean);
  end loop;
  for item,ordinal in select value, ordinality from jsonb_array_elements(output_result->'plan'->'deferred') with ordinality loop
    insert into railplan_private.plan_deferrals values(run_id,item->>'requestId',ordinal-1,item->'bindingRuleIds',item->>'reason');
  end loop;
  insert into railplan_private.plan_audit_events(plan_id,action,actor_id) values(run_id,'create',auth.uid());
  return run_id;
end $$;
revoke all on function railplan_private.save_generated_plan(date,bigint,text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function railplan_private.save_generated_plan(date,bigint,text,jsonb,jsonb,jsonb) to authenticated;

create function railplan_private.record_plan_decision(run_id uuid, decision_kind text, decision_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare decision_id uuid;
begin
  perform railplan_private.lock_planning_source();
  insert into railplan_private.planner_decisions(plan_id,kind,reason,created_by) values(run_id,decision_kind,decision_reason,auth.uid()) returning id into decision_id;
  insert into railplan_private.plan_audit_events(plan_id,action,actor_id,related_id) values(run_id,'decision',auth.uid(),decision_id);
  return decision_id;
end $$;
revoke all on function railplan_private.record_plan_decision(uuid,text,text) from public, anon;
grant execute on function railplan_private.record_plan_decision(uuid,text,text) to authenticated;

-- Returns a rejection value instead of throwing, so the caller can commit its
-- authenticated rejection audit and only then return HTTP 409.
create function railplan_private.publish_generated_plan(run_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; run railplan_private.planning_runs; previous_id uuid;
begin
  current_revision := railplan_private.lock_planning_source();
  select * into run from railplan_private.planning_runs where id=run_id;
  if not found then return 'not_found'; end if;
  if exists(select 1 from railplan_private.plan_publications where plan_id=run_id) then return 'ok'; end if;
  if run.source_revision <> current_revision then
    insert into railplan_private.plan_audit_events(plan_id,action,actor_id) values(run_id,'rejected_stale',auth.uid());
    return 'stale_plan';
  end if;
  if run.result->>'status' = 'INFEASIBLE' or (run.result->>'independentlyValidated')::boolean is distinct from true then return 'invalid_plan'; end if;
  select p.plan_id into previous_id from railplan_private.plan_publications p
    join railplan_private.planning_runs r on r.id=p.plan_id
    where r.planning_night=run.planning_night and not exists(select 1 from railplan_private.plan_publications later where later.supersedes=p.plan_id);
  insert into railplan_private.plan_publications(plan_id,supersedes,created_by) values(run_id,previous_id,auth.uid());
  insert into railplan_private.plan_audit_events(plan_id,action,actor_id) values(run_id,'publish',auth.uid());
  if previous_id is not null then
    insert into railplan_private.plan_audit_events(plan_id,action,actor_id,related_id) values(previous_id,'supersede',auth.uid(),run_id);
  end if;
  return 'ok';
end $$;
revoke all on function railplan_private.publish_generated_plan(uuid) from public, anon;
grant execute on function railplan_private.publish_generated_plan(uuid) to authenticated;
