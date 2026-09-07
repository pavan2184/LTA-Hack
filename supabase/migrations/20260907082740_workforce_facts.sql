-- Anonymous role-based people supply/demand, separate from team crew capacity.
-- GiST equality operators make overlapping absolute availability unambiguous.
create extension if not exists btree_gist with schema extensions;
create table public.workforce_roles (
  id text primary key check(length(id) between 1 and 64 and id=btrim(id)),
  name text not null check(length(btrim(name)) between 1 and 120 and length(name)<=120)
);
create table public.workforce_availability (
  planning_night date not null references public.planning_nights(planning_night) on delete cascade,
  team_id text not null references public.teams(id),
  role_id text not null references public.workforce_roles(id),
  start_minute integer not null check(start_minute between 0 and 1440),
  end_minute integer not null check(end_minute between 1 and 2880),
  people_count integer not null check(people_count between 0 and 10000),
  primary key(planning_night,team_id,role_id,start_minute),
  check(end_minute>start_minute),
  exclude using gist (planning_night with =,team_id with =,role_id with =,
    int4range(start_minute,end_minute,'[)') with &&)
);
create index workforce_availability_team on public.workforce_availability(team_id);
create index workforce_availability_role on public.workforce_availability(role_id);
create table public.request_workforce_demand (
  request_id text not null references public.maintenance_requests(id) on delete cascade,
  role_id text not null references public.workforce_roles(id),
  people_count integer not null check(people_count between 1 and 10000),
  primary key(request_id,role_id)
);
create index request_workforce_demand_role on public.request_workforce_demand(role_id);

do $$ declare t text; begin
  foreach t in array array['workforce_roles','workforce_availability','request_workforce_demand'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('create policy planner_access on public.%I for all to authenticated
      using(exists(select 1 from public.profiles where id=(select auth.uid()) and role=''planner''))
      with check(exists(select 1 from public.profiles where id=(select auth.uid()) and role=''planner''))',t);
    execute format('create trigger revision_before_change before insert or update or delete or truncate on public.%I for each statement execute function railplan_private.bump_planning_source()',t);
  end loop;
end $$;

-- Statement-level source mutation runs before these row checks, serializing
-- availability with planning-night writes. READ COMMITTED trigger queries see
-- the latest committed parent/children; repeatable-read waiters fail/retry when
-- the shared source row changed rather than checking an obsolete snapshot.
-- Parent resize is checked too: valid child inserts alone cannot ensure bounds.
create function railplan_private.check_workforce_night_window() returns trigger
language plpgsql security invoker set search_path='' as $$
declare window_start integer; window_end integer;
begin
  if tg_table_name='workforce_availability' then
    select window_start_minute,window_end_minute into window_start,window_end
      from public.planning_nights where planning_night=new.planning_night;
    if not found then raise exception 'Unknown workforce planning night' using errcode='23503'; end if;
    if new.start_minute<window_start or new.end_minute>window_end then
      raise exception 'Workforce availability must fit the planning night' using errcode='23514';
    end if;
  else
    if exists(select 1 from public.workforce_availability where planning_night=old.planning_night
      and (start_minute<new.window_start_minute or end_minute>new.window_end_minute)) then
      raise exception 'Planning night would exclude workforce availability' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function railplan_private.check_workforce_night_window() from public,anon,authenticated;
create trigger workforce_window before insert or update on public.workforce_availability
  for each row execute function railplan_private.check_workforce_night_window();
create trigger workforce_window before update of window_start_minute,window_end_minute,planning_night on public.planning_nights
  for each row execute function railplan_private.check_workforce_night_window();

-- Schema/provenance changed even before the separately verified demo seed runs.
update railplan_private.planning_source set revision=revision+1 where singleton;
