import { canonicalise, type PlanningInstance } from "@railplan/core/domain/instance";
import type { LineId } from "@railplan/core/domain/network";
import type { WorkClass } from "@railplan/core/domain/resources";
import type { EquipmentDemand, MaintenanceRequest, Priority } from "@railplan/core/types/railplan";

import type { TransactionSql } from "postgres";

import type { Sql } from "./client";

/**
 * Read one night's planning facts out of Postgres as a `PlanningInstance`.
 *
 * The point of returning the same type the literals build is that the two can
 * be compared: `instanceDigest` of this and of `buildInstanceFromLiterals()`
 * must match for seeded data. That equality is what lets the rest of the system
 * stop caring which source it came from.
 */
export async function loadPlanningInstance(
  sql: Sql | TransactionSql,
  planningNight: string,
): Promise<PlanningInstance> {
  // A transaction both binds Supavisor to one backend for this multi-query
  // read and prevents a concurrent writer from producing a mixed snapshot.
  if ("begin" in sql) {
    return sql.begin("isolation level repeatable read read only", (tx) =>
      loadPlanningInstance(tx, planningNight),
    ) as Promise<PlanningInstance>;
  }
  const [night] = await sql<
    {
      planning_night: Date;
      window_start_minute: number;
      window_end_minute: number;
      slot_minutes: number;
      minutes_per_block_hop: number;
      inter_line_transfer_minutes: number;
    }[]
  >`select * from planning_nights where planning_night = ${planningNight}`;

  if (!night) throw new Error(`No planning night seeded for ${planningNight}`);

  const [
    stationRows,
    blockRows,
    adjacencyRows,
    zoneRows,
    zoneBlockRows,
    zoneClassRows,
    teamRows,
    teamSkillRows,
    equipmentRows,
    incompatibilityRows,
    requestRows,
    requestBlockRows,
    requestSkillRows,
    requestEquipmentRows,
    dependencyRows,
  ] = await Promise.all([
    sql<{ code: string; name: string; line: LineId; ordinal: number }[]>`
      select code, name, line, ordinal from stations`,
    sql<
      {
        id: string;
        line: LineId;
        from_station: string;
        to_station: string;
        length_metres: number;
        capacity: number;
      }[]
    >`select * from track_blocks`,
    sql<{ block_id: string; neighbour_id: string }[]>`select * from block_adjacency`,
    sql<{ id: string; name: string; reason: string }[]>`select * from conflict_zones`,
    sql<{ zone_id: string; block_id: string }[]>`select * from conflict_zone_blocks`,
    sql<{ zone_id: string; work_class: string }[]>`select * from conflict_zone_work_classes`,
    sql<
      {
        id: string;
        name: string;
        capacity: number;
        depot_block_id: string;
        shift_start: number;
        shift_end: number;
      }[]
    >`select * from teams`,
    sql<{ team_id: string; skill: string }[]>`select * from team_skills`,
    sql<
      { id: string; name: string; units: number; turnaround_minutes: number }[]
    >`select * from equipment_types`,
    sql<
      { class_a: WorkClass; class_b: WorkClass; reason: string; extends_to_adjacent: boolean }[]
    >`select * from work_class_incompatibility`,
    sql<
      {
        id: string;
        title: string;
        short_title: string;
        work_type: string;
        work_class: WorkClass;
        sector: string;
        duration_minutes: number;
        clearance_minutes: number;
        priority: Priority;
        team_id: string;
        preferred_start: number;
        earliest_start: number;
        latest_end: number;
        mandatory: boolean;
        dependency_lag_minutes: number;
        description: string;
      }[]
    >`select * from maintenance_requests where planning_night = ${planningNight}`,
    // Ordered by position: block order runs along the line and is meaningful,
    // unlike the skill and dependency sets below.
    sql<{ request_id: string; block_id: string }[]>`
      select request_id, block_id from request_blocks order by request_id, position`,
    sql<{ request_id: string; skill: string }[]>`select * from request_required_skills`,
    sql<
      { request_id: string; equipment_id: string; units: number }[]
    >`select * from request_equipment`,
    sql<{ request_id: string; depends_on_id: string }[]>`select * from request_dependencies`,
  ]);

  const group = <T, V>(rows: T[], key: (row: T) => string, value: (row: T) => V) => {
    const map = new Map<string, V[]>();
    rows.forEach((row) => {
      const list = map.get(key(row));
      if (list) list.push(value(row));
      else map.set(key(row), [value(row)]);
    });
    return map;
  };

  const zoneBlocks = group(zoneBlockRows, (r) => r.zone_id, (r) => r.block_id);
  const zoneClasses = group(zoneClassRows, (r) => r.zone_id, (r) => r.work_class);
  const teamSkills = group(teamSkillRows, (r) => r.team_id, (r) => r.skill);
  const requestBlocks = group(requestBlockRows, (r) => r.request_id, (r) => r.block_id);
  const requestSkills = group(requestSkillRows, (r) => r.request_id, (r) => r.skill);
  const requestEquipment = group(
    requestEquipmentRows,
    (r) => r.request_id,
    (r): EquipmentDemand => ({ equipmentId: r.equipment_id, units: r.units }),
  );
  const dependencies = group(dependencyRows, (r) => r.request_id, (r) => r.depends_on_id);

  const requests: MaintenanceRequest[] = requestRows.map((row) => ({
    id: row.id,
    title: row.title,
    shortTitle: row.short_title,
    workType: row.work_type,
    workClass: row.work_class,
    blockIds: requestBlocks.get(row.id) ?? [],
    sector: row.sector,
    durationMinutes: row.duration_minutes,
    clearanceMinutes: row.clearance_minutes,
    priority: row.priority,
    teamId: row.team_id,
    requiredSkills: requestSkills.get(row.id) ?? [],
    equipment: requestEquipment.get(row.id) ?? [],
    preferredStart: row.preferred_start,
    earliestStart: row.earliest_start,
    latestEnd: row.latest_end,
    mandatory: row.mandatory,
    dependencies: dependencies.get(row.id) ?? [],
    dependencyLagMinutes: row.dependency_lag_minutes,
    description: row.description,
  }));

  return canonicalise({
    planningNight,
    window: {
      startMinute: night.window_start_minute,
      endMinute: night.window_end_minute,
      slotMinutes: night.slot_minutes,
    },
    stations: stationRows.map((row) => ({
      code: row.code,
      name: row.name,
      line: row.line,
      index: row.ordinal,
    })),
    blocks: blockRows.map((row) => ({
      id: row.id,
      line: row.line,
      from: row.from_station,
      to: row.to_station,
      lengthMetres: row.length_metres,
      capacity: row.capacity,
    })),
    adjacency: adjacencyRows.map((row) => ({
      blockId: row.block_id,
      neighbourId: row.neighbour_id,
    })),
    conflictZones: zoneRows.map((row) => ({
      id: row.id,
      name: row.name,
      blockIds: zoneBlocks.get(row.id) ?? [],
      appliesToWorkClasses: zoneClasses.get(row.id) ?? [],
      reason: row.reason,
    })),
    teams: teamRows.map((row) => ({
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      skills: teamSkills.get(row.id) ?? [],
      depotBlockId: row.depot_block_id,
      shiftStart: row.shift_start,
      shiftEnd: row.shift_end,
    })),
    equipment: equipmentRows.map((row) => ({
      id: row.id,
      name: row.name,
      units: row.units,
      turnaroundMinutes: row.turnaround_minutes,
    })),
    workClassIncompatibilities: incompatibilityRows.map((row) => ({
      a: row.class_a,
      b: row.class_b,
      reason: row.reason,
      extendsToAdjacent: row.extends_to_adjacent,
    })),
    requests,
    travel: {
      minutesPerBlockHop: night.minutes_per_block_hop,
      interLineTransferMinutes: night.inter_line_transfer_minutes,
    },
  });
}
