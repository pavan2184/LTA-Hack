-- Contractors answer a published time: confirmed, or cannot make it with a reason.
-- Append-only. The latest answer for the current published plan is the one that
-- counts; earlier answers stay as history. Planners read every organisation's
-- answers; contractors read their own organisation's.
create table railplan_private.schedule_acknowledgements (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null references railplan_private.request_submissions(id),
 plan_id uuid not null references railplan_private.plan_publications(plan_id),
 revision integer not null,
 kind text not null check(kind in ('confirmed','cannot_comply')),
 reason text not null default '' check(length(reason)<=2000),
 actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 check(kind='confirmed' or length(reason)>=1)
);
create index schedule_acknowledgement_idx on railplan_private.schedule_acknowledgements(submission_id,plan_id,created_at desc);
alter table railplan_private.schedule_acknowledgements enable row level security;
revoke all on railplan_private.schedule_acknowledgements from public,anon,authenticated;
grant select on railplan_private.schedule_acknowledgements to authenticated;
create policy acknowledgement_scoped_read on railplan_private.schedule_acknowledgements for select to authenticated
 using(exists(select 1 from public.profiles pr join railplan_private.request_submissions s on s.id=submission_id
   where pr.id=(select auth.uid()) and (pr.role='planner' or pr.contractor_organisation_id=s.organisation_id)));
create trigger immutable_acknowledgements before update or delete or truncate on railplan_private.schedule_acknowledgements
 for each statement execute function railplan_private.reject_plan_mutation();

-- The derived schedule now carries the latest answer for the current published plan.
create or replace function railplan_private.request_schedule(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; s railplan_private.request_submissions; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid();
 select * into s from railplan_private.request_submissions where id=request_id;
 if actor.id is null or s.id is null or (actor.role='contractor' and actor.contractor_organisation_id<>s.organisation_id) then return null;end if;
 select jsonb_build_object('planId',p.plan_id,'revision',(fact->>'submissionRevision')::integer,'startMinute',p.start_minute,'endMinute',p.end_minute,
   'acknowledgement',(select jsonb_build_object('kind',a.kind,'reason',a.reason,'createdAt',a.created_at)
     from railplan_private.schedule_acknowledgements a where a.submission_id=s.id and a.plan_id=p.plan_id order by a.created_at desc limit 1)) into result
 from railplan_private.plan_placements p join railplan_private.plan_publications pub on pub.plan_id=p.plan_id
 join railplan_private.planning_runs run on run.id=p.plan_id
 cross join lateral jsonb_array_elements(run.facts->'requests') fact
 where p.request_id='R-'||s.id and fact->>'id'=p.request_id
 and not exists(select 1 from railplan_private.plan_publications later where later.supersedes=pub.plan_id)
 order by pub.created_at desc limit 1;
 return result;
end $$;

-- Only the owning contractor answers, and only about the plan that is current.
-- A stale plan id is a conflict: the schedule moved on before the answer arrived.
create function railplan_private.acknowledge_schedule(request_id uuid,plan uuid,ack_kind text,ack_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; s railplan_private.request_submissions; current jsonb; row_id uuid; clean_reason text;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null then return jsonb_build_object('code','forbidden'); end if;
 select * into s from railplan_private.request_submissions where id=request_id;
 if s.id is null or (actor.role='contractor' and actor.contractor_organisation_id<>s.organisation_id) then return jsonb_build_object('code','not_found'); end if;
 if actor.role<>'contractor' then return jsonb_build_object('code','forbidden'); end if;
 if ack_kind not in ('confirmed','cannot_comply') then return jsonb_build_object('code','invalid_request','fieldErrors',jsonb_build_object('kind','Choose confirmed or cannot comply.')); end if;
 clean_reason:=btrim(coalesce(ack_reason,''));
 if length(clean_reason)>2000 then return jsonb_build_object('code','invalid_request','fieldErrors',jsonb_build_object('reason','Keep the reason within 2000 characters.')); end if;
 if ack_kind='cannot_comply' and length(clean_reason)<1 then return jsonb_build_object('code','invalid_request','fieldErrors',jsonb_build_object('reason','Say what prevents this time so the planner can act on it.')); end if;
 current:=railplan_private.request_schedule(request_id);
 if current is null or (current->>'planId')::uuid<>plan then return jsonb_build_object('code','conflict'); end if;
 insert into railplan_private.schedule_acknowledgements(submission_id,plan_id,revision,kind,reason,actor_id)
 values(request_id,plan,coalesce((current->>'revision')::integer,0),ack_kind,clean_reason,actor.id) returning id into row_id;
 return jsonb_build_object('id',row_id);
end $$;
revoke all on function railplan_private.acknowledge_schedule(uuid,uuid,text,text) from public,anon;
grant execute on function railplan_private.acknowledge_schedule(uuid,uuid,text,text) to authenticated;

-- Notifications name the work and its times in the contractor's words, not IDs.
create or replace function railplan_private.notification_plan_requests(run_id uuid)
returns table(organisation_id uuid,request_id text,snapshot jsonb)
language sql stable security definer set search_path='' as $$
 select s.organisation_id,r->>'id',jsonb_build_object(
  'revision',r->'submissionRevision','sector',r->>'sector','teamId',r->>'teamId',
  'title',r->>'title','requestedStart',r->'preferredStart',
  'state',case when p.request_id is not null then 'scheduled' else 'deferred' end,
  'start',p.start_minute,'end',p.end_minute)
 from railplan_private.planning_runs run cross join lateral jsonb_array_elements(run.facts->'requests') r
 join railplan_private.request_submissions s on 'R-'||s.id::text=r->>'id'
 join railplan_private.request_revisions rev on rev.submission_id=s.id and rev.version=(r->>'submissionRevision')::integer and rev.status='approved'
 left join railplan_private.plan_placements p on p.plan_id=run.id and p.request_id=r->>'id'
 where run.id=run_id
$$;
create or replace function railplan_private.queue_publication_notifications() returns trigger
language plpgsql security definer set search_path='' as $$
declare org record; night date; body text;
begin
 select planning_night into night from railplan_private.planning_runs where id=new.plan_id;
 for org in
  with current_requests as (select * from railplan_private.notification_plan_requests(new.plan_id)),
       previous_requests as (select * from railplan_private.notification_plan_requests(new.supersedes))
  select coalesce(c.organisation_id,p.organisation_id) organisation_id,
   string_agg(
    regexp_replace(coalesce(nullif(c.snapshot->>'title',''),nullif(p.snapshot->>'title',''),coalesce(c.request_id,p.request_id)),'[[:cntrl:]]',' ','g')
    ||' ('||regexp_replace(coalesce(c.snapshot->>'sector',p.snapshot->>'sector'),'[[:cntrl:]]',' ','g')||'): '||
    case when c.request_id is null then case when p.snapshot->>'state'='scheduled'
       then 'removed from this night; previous time '||railplan_private.notification_time((p.snapshot->>'start')::integer)||'-'||railplan_private.notification_time((p.snapshot->>'end')::integer)
       else 'removed from this night; it had no time' end
      when c.snapshot->>'state'='deferred' then 'no time this night; the planner will follow up'
      else railplan_private.notification_time((c.snapshot->>'start')::integer)||'-'||railplan_private.notification_time((c.snapshot->>'end')::integer)
       ||case when (c.snapshot->>'requestedStart') is not null and (c.snapshot->>'requestedStart')::integer<>(c.snapshot->>'start')::integer
          then ' (you asked for '||railplan_private.notification_time((c.snapshot->>'requestedStart')::integer)||')' else ' (as requested)' end end,
    E'\n' order by coalesce(c.request_id,p.request_id) collate "C") lines
  from current_requests c full join previous_requests p on c.request_id=p.request_id and c.organisation_id=p.organisation_id
  where c.snapshot is distinct from p.snapshot
  group by coalesce(c.organisation_id,p.organisation_id)
 loop
  body:='RailPlan: the schedule for the night of '||night::text||' has been published.'
   ||E'\n\nYour work that changed:\n'||org.lines
   ||E'\n\nPlease confirm each time, or tell us you cannot make it, in RailPlan under Your requests, Your schedule.'
   ||E'\n\nPrototype only. Fabricated planning inputs; not an operational instruction or safety approval. Version '||new.plan_id::text||'.';
  insert into railplan_private.notification_deliveries(organisation_id,plan_id,planning_night,kind,message_text,deduplication_key,created_by)
  values(org.organisation_id,new.plan_id,night,'publication',body,'publication:'||new.plan_id::text||':'||org.organisation_id::text,new.created_by);
 end loop;
 return new;
end $$;
