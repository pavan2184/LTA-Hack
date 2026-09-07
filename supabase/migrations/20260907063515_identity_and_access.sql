-- Identity is provisioned by a trusted operator. User metadata never grants roles.
create type public.user_role as enum ('planner', 'contractor');
create table public.contractor_organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  contractor_organisation_id uuid references public.contractor_organisations(id),
  created_at timestamptz not null default now(),
  check ((role = 'contractor' and contractor_organisation_id is not null)
      or (role = 'planner' and contractor_organisation_id is null))
);
create index profiles_organisation_idx on public.profiles(contractor_organisation_id);
alter table public.profiles enable row level security;
alter table public.contractor_organisations enable row level security;
revoke all on public.profiles, public.contractor_organisations from anon, authenticated;
grant select on public.profiles, public.contractor_organisations to authenticated;
create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy organisations_read_authorized on public.contractor_organisations for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and (p.role = 'planner' or p.contractor_organisation_id = contractor_organisations.id)));

-- Only planners may read/change the existing global planning facts. Contractor
-- submissions and plan versions gain their own scoped policies in later issues.
do $$
declare table_name text;
begin
  foreach table_name in array array['stations','track_blocks','block_adjacency',
    'conflict_zones','conflict_zone_blocks','conflict_zone_work_classes','teams',
    'team_skills','equipment_types','work_class_incompatibility','planning_nights',
    'maintenance_requests','request_blocks','request_required_skills',
    'request_equipment','request_dependencies']
  loop
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy planner_access on public.%I for all to authenticated
      using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = ''planner''))
      with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = ''planner''))', table_name);
  end loop;
end $$;

create schema if not exists railplan_private;
revoke all on schema railplan_private from public, anon;
grant usage on schema railplan_private to authenticated;
create table railplan_private.assistant_buckets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tokens double precision not null check (tokens >= 0 and tokens <= 12),
  updated_at timestamptz not null
);
alter table railplan_private.assistant_buckets enable row level security;
revoke all on railplan_private.assistant_buckets from public, anon, authenticated;
-- This narrow definer function is needed to prevent clients refilling their own
-- quota. No caller-supplied identity/rate/time. Atomic row lock handles all hosts.
create function railplan_private.consume_assistant_token()
returns table (allowed boolean, retry_after_seconds integer, remaining integer)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); current_tokens double precision; stamp timestamptz;
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor and role = 'planner') then
    raise exception 'Planner authentication required' using errcode = '42501';
  end if;
  insert into railplan_private.assistant_buckets(user_id, tokens, updated_at)
    values (actor, 12, clock_timestamp()) on conflict do nothing;
  select tokens, updated_at into current_tokens, stamp
    from railplan_private.assistant_buckets where user_id = actor for update;
  current_tokens := least(12, current_tokens + greatest(0, extract(epoch from clock_timestamp() - stamp)) * 0.2);
  allowed := current_tokens >= 1;
  retry_after_seconds := case when allowed then 0 else ceil((1 - current_tokens) / 0.2)::integer end;
  if allowed then current_tokens := current_tokens - 1; end if;
  update railplan_private.assistant_buckets set tokens = current_tokens, updated_at = clock_timestamp() where user_id = actor;
  remaining := floor(current_tokens)::integer;
  return next;
end $$;
revoke all on function railplan_private.consume_assistant_token() from public, anon;
grant execute on function railplan_private.consume_assistant_token() to authenticated;
