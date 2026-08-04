-- The planning facts: network topology, resources, and the requests for a night.
--
-- These are inputs. Nothing here records where a job ends up, whether it
-- conflicts with anything, or what any KPI is — those are computed by the
-- engine and land in the plan tables in a later phase. If a column in this file
-- ever looks like an output, it is a mistake.
--
-- Constraints live in the database rather than only in the application, because
-- the application is about to stop being the only writer: a seed script, an API
-- and eventually a Python solver service all touch this data. A rule that only
-- one of them knows is not a rule.
--
-- Row-level security is enabled on every table with no policies attached, which
-- denies everything by default. The seed and loader connect as the table owner
-- and bypass it. Phase 2 adds the planner/approver/viewer policies; until then
-- an anon or authenticated Supabase role can read nothing, which is the correct
-- posture for data that has no access model yet.

create type work_class as enum (
  'track-possession',
  'traction-power',
  'signalling',
  'communications',
  'tunnel-systems',
  'civil',
  'platform-systems'
);

create type priority as enum ('low', 'medium', 'high', 'critical');

-- --------------------------------------------------------------------------
-- Network
-- --------------------------------------------------------------------------

create table stations (
  code    text primary key,
  name    text    not null,
  line    text    not null check (line in ('NS', 'EW', 'CC')),
  ordinal integer not null,
  unique (line, ordinal)
);

-- A track block is the unit planning actually happens on. A request arrives
-- labelled with a sector like "NS10-NS12"; two such labels can be unrelated as
-- strings while sharing physical track, so the label is display only and the
-- block ids are what every rule is evaluated against.
create table track_blocks (
  id             text primary key,
  line           text    not null check (line in ('NS', 'EW', 'CC')),
  from_station   text    not null references stations (code),
  to_station     text    not null references stations (code),
  length_metres  integer not null check (length_metres > 0),
  -- 1 = exclusive possession. Left as a column because a passing loop or a
  -- twin-track section legitimately admits more than one job.
  capacity       integer not null check (capacity >= 1),
  check (from_station <> to_station)
);

-- Undirected adjacency, stored in both directions so a lookup from either end
-- is a plain index scan. Derivable from the blocks, but stored so a solver in
-- another language does not have to reimplement the derivation to model the
-- adjacent-work rule — a rule reimplemented twice is a rule that will drift.
create table block_adjacency (
  block_id     text not null references track_blocks (id) on delete cascade,
  neighbour_id text not null references track_blocks (id) on delete cascade,
  primary key (block_id, neighbour_id),
  check (block_id <> neighbour_id)
);

-- Areas whose blocks cannot be worked simultaneously by incompatible work even
-- though the blocks are distinct: junctions, crossovers, traction-power
-- isolation areas.
create table conflict_zones (
  id     text primary key,
  name   text not null,
  reason text not null
);

create table conflict_zone_blocks (
  zone_id  text not null references conflict_zones (id) on delete cascade,
  block_id text not null references track_blocks (id),
  primary key (zone_id, block_id)
);

-- Empty set for a zone means the zone constrains all work.
create table conflict_zone_work_classes (
  zone_id     text       not null references conflict_zones (id) on delete cascade,
  work_class  work_class not null,
  primary key (zone_id, work_class)
);

-- --------------------------------------------------------------------------
-- Resources
--
-- A resource is a capacity, not a name. Two jobs both listing "thermal imaging
-- unit" are only in conflict because exactly one calibrated unit exists, and
-- modelling that as a count is what lets a validator find the collision instead
-- of a human having to notice it.
-- --------------------------------------------------------------------------

create table teams (
  id             text primary key,
  name           text    not null,
  -- Crews available under this name. 1 = the crew can only be in one place.
  capacity       integer not null check (capacity >= 1),
  depot_block_id text    not null references track_blocks (id),
  shift_start    integer not null check (shift_start >= 0),
  shift_end      integer not null,
  check (shift_end > shift_start)
);

-- Skills are held by a team, never by a named person. Keeping identity out of
-- the model keeps roster data out of the privacy review.
create table team_skills (
  team_id text not null references teams (id) on delete cascade,
  skill   text not null,
  primary key (team_id, skill)
);

create table equipment_types (
  id                 text primary key,
  name               text    not null,
  -- Serviceable units available on the planning night.
  units              integer not null check (units >= 1),
  -- Minutes needed to move and re-rig the asset between jobs.
  turnaround_minutes integer not null check (turnaround_minutes >= 0)
);

-- Pairs of work classes that must not run concurrently. The pair is unordered,
-- and the check constraint is what stops the same rule being stored twice in
-- opposite orders and then only half-enforced.
create table work_class_incompatibility (
  class_a             work_class not null,
  class_b             work_class not null,
  reason              text       not null,
  -- Most incompatibilities only bite on a shared block, which exclusive
  -- possession already prevents. A few reach one block further, because the
  -- hazard travels: an energised section does not stop at the block boundary.
  extends_to_adjacent boolean    not null,
  primary key (class_a, class_b),
  check (class_a < class_b)
);

-- --------------------------------------------------------------------------
-- The planning night
-- --------------------------------------------------------------------------

create table planning_nights (
  planning_night              date primary key,
  window_start_minute         integer not null check (window_start_minute >= 0),
  window_end_minute           integer not null,
  -- Planning resolution. Every candidate start is a multiple of this.
  slot_minutes                integer not null check (slot_minutes > 0),
  minutes_per_block_hop       integer not null check (minutes_per_block_hop >= 0),
  inter_line_transfer_minutes integer not null check (inter_line_transfer_minutes >= 0),
  check (window_end_minute > window_start_minute)
);

create table maintenance_requests (
  id                     text primary key,
  planning_night         date       not null references planning_nights (planning_night),
  title                  text       not null,
  short_title            text       not null,
  work_type              text       not null,
  work_class             work_class not null,
  -- Display label only, derived from the block set at ingest. Never planned on.
  sector                 text       not null,
  duration_minutes       integer    not null check (duration_minutes > 0),
  -- Minutes of block occupation after the work ends, before handback.
  clearance_minutes      integer    not null check (clearance_minutes >= 0),
  priority               priority   not null,
  -- The solver keeps the requested crew; it moves work in time, not between
  -- teams, because crew substitution would need qualification data we do not
  -- model.
  team_id                text       not null references teams (id),
  preferred_start        integer    not null check (preferred_start >= 0),
  earliest_start         integer    not null check (earliest_start >= 0),
  latest_end             integer    not null,
  -- Generated rather than stored: critical work must be placed, and a column a
  -- writer could set independently of the priority is a column that will
  -- eventually disagree with it.
  mandatory              boolean generated always as (priority = 'critical') stored,
  -- Minimum gap between a predecessor ending and this starting.
  dependency_lag_minutes integer    not null check (dependency_lag_minutes >= 0),
  description            text       not null,
  check (earliest_start <= preferred_start),
  check (latest_end > earliest_start + duration_minutes - 1)
);

-- Position is kept because block order runs along the line and is meaningful;
-- the unique constraint stops two blocks claiming the same place in it.
create table request_blocks (
  request_id text    not null references maintenance_requests (id) on delete cascade,
  block_id   text    not null references track_blocks (id),
  position   integer not null check (position >= 0),
  primary key (request_id, block_id),
  unique (request_id, position)
);

create table request_required_skills (
  request_id text not null references maintenance_requests (id) on delete cascade,
  skill      text not null,
  primary key (request_id, skill)
);

create table request_equipment (
  request_id   text    not null references maintenance_requests (id) on delete cascade,
  equipment_id text    not null references equipment_types (id),
  units        integer not null check (units > 0),
  primary key (request_id, equipment_id)
);

create table request_dependencies (
  request_id    text not null references maintenance_requests (id) on delete cascade,
  depends_on_id text not null references maintenance_requests (id),
  primary key (request_id, depends_on_id),
  -- Catches the one-step cycle. Longer cycles are the validator's job; it
  -- reports them rather than refusing the data.
  check (request_id <> depends_on_id)
);

create index request_blocks_block_id_idx on request_blocks (block_id);
create index maintenance_requests_team_id_idx on maintenance_requests (team_id);
create index maintenance_requests_night_idx on maintenance_requests (planning_night);

-- --------------------------------------------------------------------------
-- Deny by default until Phase 2 defines who may read what.
-- --------------------------------------------------------------------------

alter table stations                    enable row level security;
alter table track_blocks                enable row level security;
alter table block_adjacency             enable row level security;
alter table conflict_zones              enable row level security;
alter table conflict_zone_blocks        enable row level security;
alter table conflict_zone_work_classes  enable row level security;
alter table teams                       enable row level security;
alter table team_skills                 enable row level security;
alter table equipment_types             enable row level security;
alter table work_class_incompatibility  enable row level security;
alter table planning_nights             enable row level security;
alter table maintenance_requests        enable row level security;
alter table request_blocks              enable row level security;
alter table request_required_skills     enable row level security;
alter table request_equipment           enable row level security;
alter table request_dependencies        enable row level security;
