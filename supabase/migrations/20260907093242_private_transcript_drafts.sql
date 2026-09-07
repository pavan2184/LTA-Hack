-- Owner-private, inert proposals. No raw transcript column or submission/source
-- mutation. No planner override: another planner's private material stays private.
create table railplan_private.private_drafts (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,
 organisation_id uuid references public.contractor_organisations(id),
 current_version integer not null default 1 check(current_version>0),
 status text not null default 'private' check(status='private'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table railplan_private.private_draft_revisions (
 draft_id uuid not null references railplan_private.private_drafts(id),version integer not null check(version>0),
 fields jsonb not null,confidence jsonb not null,missing_fields jsonb not null,evidence jsonb not null,
 model text not null,extractor_version text not null,created_at timestamptz not null default clock_timestamp(),
 primary key(draft_id,version)
);
alter table railplan_private.private_drafts add constraint private_draft_current_revision
 foreign key(id,current_version) references railplan_private.private_draft_revisions(draft_id,version) deferrable initially deferred;
create index private_drafts_owner_created on railplan_private.private_drafts(owner_id,created_at desc);
alter table railplan_private.private_drafts enable row level security;
alter table railplan_private.private_draft_revisions enable row level security;
revoke all on railplan_private.private_drafts,railplan_private.private_draft_revisions from public,anon,authenticated;
grant select on railplan_private.private_drafts,railplan_private.private_draft_revisions to authenticated;
create policy private_draft_owner_read on railplan_private.private_drafts for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid())));
create policy private_draft_revision_owner_read on railplan_private.private_draft_revisions for select to authenticated using(exists(select 1 from railplan_private.private_drafts where id=draft_id));
create trigger immutable_private_draft_history before update or delete or truncate on railplan_private.private_draft_revisions for each statement execute function railplan_private.reject_plan_mutation();

-- Deliberately accepts only an already evidence-verified, minimized proposal.
-- Raw source never travels to SQL. This schema guard prevents arbitrary JSON
-- persistence through authenticated direct calls; evidence authenticity against
-- the discarded source is verified by the server before this private boundary.
create function railplan_private.validate_private_draft(d jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare keys text[]:=array['planningNight','title','description','workClass','blockIds','durationMinutes','preferredStart','earliestStart','latestEnd','equipment','workforce'];
 k text;v jsonb;e jsonb;item jsonb;nonnull integer:=0;missing_count integer:=0;
begin
 if jsonb_typeof(d) is distinct from 'object' then return false;end if;
 if not(d?&array['fields','confidence','missingFields','evidence']) or (select count(*) from jsonb_object_keys(d))<>4 then return false;end if;
 if jsonb_typeof(d->'fields') is distinct from 'object' or jsonb_typeof(d->'confidence') is distinct from 'object' or jsonb_typeof(d->'missingFields') is distinct from 'array' or jsonb_typeof(d->'evidence') is distinct from 'array' then return false;end if;
 if not(d->'fields'?&keys) or not(d->'confidence'?&keys) or (select count(*) from jsonb_object_keys(d->'fields'))<>11 or (select count(*) from jsonb_object_keys(d->'confidence'))<>11 or jsonb_array_length(d->'evidence') not between 1 and 24 then return false;end if;
 foreach k in array keys loop
 v:=d->'fields'->k;
 if v='null'::jsonb then
 missing_count:=missing_count+1;if not(d->'missingFields'?k) or d->'confidence'->k is distinct from 'null'::jsonb then return false;end if;
 else
 nonnull:=nonnull+1;if d->'missingFields'?k then return false;end if;
 if d->'confidence'->k<>'null'::jsonb then
 if jsonb_typeof(d->'confidence'->k)<>'number' then return false;end if;
 if (d->'confidence'->>k)::numeric not between 0 and 1 then return false;end if;end if;
 if not exists(select 1 from jsonb_array_elements(d->'evidence') q where q->>'field'=k) then return false;end if;
 if k=any(array['planningNight','title','description','workClass']) then
 if jsonb_typeof(v)<>'string' or length(trim(v#>>'{}'))<1 or length(v#>>'{}')>(case k when 'description' then 4000 when 'title' then 160 else 64 end) then return false;end if;
 elsif k=any(array['durationMinutes','preferredStart','earliestStart','latestEnd']) then
 if jsonb_typeof(v)<>'number' or (v#>>'{}')!~'^[0-9]{1,4}$' then return false;end if;
 if (v#>>'{}')::int>2880 or (k='durationMinutes' and (v#>>'{}')::int not between 1 and 1440) then return false;end if;
 else
 if jsonb_typeof(v)<>'array' then return false;end if;
 if jsonb_array_length(v)>100 then return false;end if;
 for item in select value from jsonb_array_elements(v) loop
 if k='blockIds' then
 if jsonb_typeof(item)<>'string' or length(item#>>'{}') not between 1 and 64 then return false;end if;
 else
 if jsonb_typeof(item)<>'object' then return false;end if;
 if k='equipment' then
 if not(item?&array['equipmentId','units']) or (select count(*) from jsonb_object_keys(item))<>2 or jsonb_typeof(item->'equipmentId') is distinct from 'string' or jsonb_typeof(item->'units') is distinct from 'number' then return false;end if;
 if length(item->>'equipmentId') not between 1 and 64 or (item->>'units')!~'^[0-9]{1,5}$' then return false;end if;
 if (item->>'units')::int not between 1 and 10000 then return false;end if;
 else
 if not(item?&array['roleId','count']) or (select count(*) from jsonb_object_keys(item))<>2 or jsonb_typeof(item->'roleId') is distinct from 'string' or jsonb_typeof(item->'count') is distinct from 'number' then return false;end if;
 if length(item->>'roleId') not between 1 and 64 or (item->>'count')!~'^[0-9]{1,5}$' then return false;end if;
 if (item->>'count')::int not between 1 and 10000 then return false;end if;
 end if;end if;end loop;end if;end if;end loop;
 if nonnull=0 or jsonb_array_length(d->'missingFields')<>missing_count then return false;end if;
 for e in select value from jsonb_array_elements(d->'evidence') loop
 if jsonb_typeof(e)<>'object' then return false;end if;
 if not(e?&array['field','quote','start','end','timestamp']) or (select count(*) from jsonb_object_keys(e))<>5 then return false;end if;
 if jsonb_typeof(e->'field') is distinct from 'string' or not(coalesce(e->>'field','')=any(keys)) or d->'fields'->(e->>'field')='null'::jsonb or jsonb_typeof(e->'quote') is distinct from 'string' or length(e->>'quote') not between 1 and 256 then return false;end if;
 if jsonb_typeof(e->'start') is distinct from 'number' or jsonb_typeof(e->'end') is distinct from 'number' or (e->>'start')!~'^[0-9]{1,5}$' or (e->>'end')!~'^[0-9]{1,5}$' then return false;end if;
 -- Offsets are JS UTF-16 code units, so SQL length alone cannot establish exact
 -- quote length for astral characters; the server's exact slice is authoritative.
 if (e->>'end')::int>65536 or (e->>'end')::int<=(e->>'start')::int then return false;end if;
 if e->'timestamp'<>'null'::jsonb then
 if jsonb_typeof(e->'timestamp')<>'string' or length(e->>'timestamp') not between 1 and 32 or position(e->>'timestamp' in e->>'quote')=0 then return false;end if;end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function railplan_private.validate_private_draft(jsonb) from public,anon,authenticated;

create function railplan_private.save_private_drafts(proposals jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles;d jsonb;draft uuid;ids jsonb:='[]';
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null then raise exception 'Authentication required' using errcode='42501';end if;
 if jsonb_typeof(proposals) is distinct from 'array' then raise exception 'Invalid proposals' using errcode='22023';end if;
 if jsonb_array_length(proposals) not between 1 and 8 or octet_length(proposals::text)>65536 then raise exception 'Invalid proposals' using errcode='22023';end if;
 for d in select value from jsonb_array_elements(proposals) loop
 if not railplan_private.validate_private_draft(d) then raise exception 'Invalid proposals' using errcode='22023';end if;end loop;
 if (select coalesce(sum(length(quote)),0) from (select distinct e->>'quote' quote from jsonb_array_elements(proposals) p cross join lateral jsonb_array_elements(p->'evidence') e) q)>2048 then raise exception 'Invalid evidence budget' using errcode='22023';end if;
 for d in select value from jsonb_array_elements(proposals) loop
 insert into railplan_private.private_drafts(owner_id,organisation_id) values(actor.id,actor.contractor_organisation_id) returning id into draft;
 insert into railplan_private.private_draft_revisions(draft_id,version,fields,confidence,missing_fields,evidence,model,extractor_version)
 values(draft,1,d->'fields',d->'confidence',d->'missingFields',d->'evidence','claude-sonnet-5','transcript-v1');
 ids:=ids||jsonb_build_array(draft);end loop;return ids;
end $$;
revoke all on function railplan_private.save_private_drafts(jsonb) from public,anon;
grant execute on function railplan_private.save_private_drafts(jsonb) to authenticated;

create table railplan_private.ingestion_buckets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 tokens double precision not null check(tokens>=0 and tokens<=3),updated_at timestamptz not null
);
alter table railplan_private.ingestion_buckets enable row level security;
revoke all on railplan_private.ingestion_buckets from public,anon,authenticated;
create function railplan_private.consume_ingestion_token() returns table(allowed boolean,retry_after_seconds integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();available double precision;stamp timestamptz;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then raise exception 'Authentication required' using errcode='42501';end if;
 insert into railplan_private.ingestion_buckets(user_id,tokens,updated_at) values(actor,3,clock_timestamp()) on conflict do nothing;
 select tokens,updated_at into available,stamp from railplan_private.ingestion_buckets where user_id=actor for update;
 available:=least(3,available+greatest(0,extract(epoch from clock_timestamp()-stamp))/60);
 allowed:=available>=1;retry_after_seconds:=case when allowed then 0 else ceil((1-available)*60)::integer end;
 if allowed then available:=available-1;end if;
 update railplan_private.ingestion_buckets set tokens=available,updated_at=clock_timestamp() where user_id=actor;return next;
end $$;
revoke all on function railplan_private.consume_ingestion_token() from public,anon;
grant execute on function railplan_private.consume_ingestion_token() to authenticated;
