-- Narrow, audited planner creation. Existing contractor creation and lifecycle
-- functions remain unchanged; drafts are not approved planning inputs.
create function railplan_private.create_planner_request(target_organisation uuid, new_fields jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; request_id uuid; errors jsonb;
begin
 select * into actor from public.profiles where id=auth.uid();
 if auth.uid() is null or actor.id is null or actor.role<>'planner' then
  return '{"code":"forbidden"}';
 end if;
 update railplan_private.planning_source set lock_generation=lock_generation+1 where singleton;
 if target_organisation is null or not exists(select 1 from public.contractor_organisations where id=target_organisation) then
  return '{"code":"invalid_request","fieldErrors":{"organisationId":"Choose an existing contractor organisation."}}';
 end if;
 errors:=railplan_private.validate_request_fields(new_fields,false);
 if errors<>'{}' then return jsonb_build_object('code','invalid_request','fieldErrors',errors); end if;
 insert into railplan_private.request_submissions(organisation_id)
 values(target_organisation) returning id into request_id;
 insert into railplan_private.request_revisions(submission_id,version,status,fields,approval,action,from_status,actor_id,reason)
 values(request_id,1,'draft',new_fields,null,'create',null,actor.id,'');
 update railplan_private.request_submissions set current_version=1 where id=request_id;
 return jsonb_build_object('id',request_id,'version',1);
end $$;
revoke all on function railplan_private.create_planner_request(uuid,jsonb) from public,anon;
grant execute on function railplan_private.create_planner_request(uuid,jsonb) to authenticated;
