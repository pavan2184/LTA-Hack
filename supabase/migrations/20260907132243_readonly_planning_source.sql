-- Export freshness is a read-only observation; it must not acquire the publication
-- mutation lock or advance its generation. Keep the underlying table private.
create function railplan_private.read_current_planning_source() returns bigint
language plpgsql stable security definer set search_path='' as $$
declare source_revision bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='planner') then
  raise exception 'Planner authentication required' using errcode='42501';
 end if;
 select revision into strict source_revision from railplan_private.planning_source where singleton;
 return source_revision;
end $$;
revoke all on function railplan_private.read_current_planning_source() from public,anon;
grant execute on function railplan_private.read_current_planning_source() to authenticated;
