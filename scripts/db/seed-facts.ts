import type { TransactionSql } from "postgres";
import type { PlanningInstance } from "@railplan/core/domain/instance";

/** Called only inside the guarded seed transaction. No connection or commit. */
export async function writeSeedFacts(
  tx: TransactionSql,
  instance: PlanningInstance,
): Promise<void> {
  // Idempotent: the planning facts are a snapshot, not an accumulating log.
  // Re-running the seed must leave the same rows rather than a second copy.
  await tx`
    truncate
      stations, track_blocks, block_adjacency,
      conflict_zones, conflict_zone_blocks, conflict_zone_work_classes,
      teams, team_skills, equipment_types, work_class_incompatibility,
      planning_nights, maintenance_requests, request_blocks,
      request_required_skills, request_equipment, request_dependencies,
      workforce_roles, workforce_availability, request_workforce_demand
    restart identity`;

  await tx`insert into stations ${tx(
    instance.stations.map((station) => ({
      code: station.code,
      name: station.name,
      line: station.line,
      ordinal: station.index,
    })),
  )}`;

  await tx`insert into track_blocks ${tx(
    instance.blocks.map((block) => ({
      id: block.id,
      line: block.line,
      from_station: block.from,
      to_station: block.to,
      length_metres: block.lengthMetres,
      capacity: block.capacity,
    })),
  )}`;

  await tx`insert into block_adjacency ${tx(
    instance.adjacency.map((edge) => ({
      block_id: edge.blockId,
      neighbour_id: edge.neighbourId,
    })),
  )}`;

  await tx`insert into conflict_zones ${tx(
    instance.conflictZones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      reason: zone.reason,
    })),
  )}`;

  const zoneBlocks = instance.conflictZones.flatMap((zone) =>
    zone.blockIds.map((blockId) => ({
      zone_id: zone.id,
      block_id: blockId,
    })),
  );
  if (zoneBlocks.length)
    await tx`insert into conflict_zone_blocks ${tx(zoneBlocks)}`;

  const zoneClasses = instance.conflictZones.flatMap((zone) =>
    zone.appliesToWorkClasses.map((workClass) => ({
      zone_id: zone.id,
      work_class: workClass,
    })),
  );
  if (zoneClasses.length)
    await tx`insert into conflict_zone_work_classes ${tx(zoneClasses)}`;

  await tx`insert into equipment_types ${tx(
    instance.equipment.map((item) => ({
      id: item.id,
      name: item.name,
      units: item.units,
      turnaround_minutes: item.turnaroundMinutes,
    })),
  )}`;

  await tx`insert into teams ${tx(
    instance.teams.map((team) => ({
      id: team.id,
      name: team.name,
      capacity: team.capacity,
      depot_block_id: team.depotBlockId,
      shift_start: team.shiftStart,
      shift_end: team.shiftEnd,
    })),
  )}`;

  const teamSkills = instance.teams.flatMap((team) =>
    team.skills.map((skill) => ({ team_id: team.id, skill })),
  );
  await tx`insert into team_skills ${tx(teamSkills)}`;

  await tx`insert into work_class_incompatibility ${tx(
    instance.workClassIncompatibilities.map((pair) => ({
      class_a: pair.a,
      class_b: pair.b,
      reason: pair.reason,
      extends_to_adjacent: pair.extendsToAdjacent,
    })),
  )}`;

  await tx`insert into planning_nights ${tx([
    {
      planning_night: instance.planningNight,
      window_start_minute: instance.window.startMinute,
      window_end_minute: instance.window.endMinute,
      slot_minutes: instance.window.slotMinutes,
      minutes_per_block_hop: instance.travel.minutesPerBlockHop,
      inter_line_transfer_minutes: instance.travel.interLineTransferMinutes,
    },
  ])}`;

  await tx`insert into workforce_roles ${tx(instance.workforceRoles)}`;
  if (instance.workforceAvailability.length)
    await tx`insert into workforce_availability ${tx(instance.workforceAvailability.map((row) => ({ planning_night: row.planningNight, team_id: row.teamId, role_id: row.roleId, start_minute: row.startMinute, end_minute: row.endMinute, people_count: row.count })))}`;

  // `mandatory` is a generated column and is deliberately not written here.
  await tx`insert into maintenance_requests ${tx(
    instance.requests.map((request) => ({
      id: request.id,
      planning_night: instance.planningNight,
      title: request.title,
      short_title: request.shortTitle,
      work_type: request.workType,
      work_class: request.workClass,
      sector: request.sector,
      duration_minutes: request.durationMinutes,
      clearance_minutes: request.clearanceMinutes,
      priority: request.priority,
      team_id: request.teamId,
      preferred_start: request.preferredStart,
      earliest_start: request.earliestStart,
      latest_end: request.latestEnd,
      dependency_lag_minutes: request.dependencyLagMinutes,
      description: request.description,
    })),
  )}`;

  if (instance.workforceDemand.length)
    await tx`insert into request_workforce_demand ${tx(instance.workforceDemand.map((row) => ({ request_id: row.requestId, role_id: row.roleId, people_count: row.count })))}`;

  // Atomic block ids, never the sector label. The label is display only and
  // two labels can be unrelated as strings while sharing physical track.
  const requestBlocks = instance.requests.flatMap((request) =>
    request.blockIds.map((blockId, position) => ({
      request_id: request.id,
      block_id: blockId,
      position,
    })),
  );
  await tx`insert into request_blocks ${tx(requestBlocks)}`;

  const requestSkills = instance.requests.flatMap((request) =>
    request.requiredSkills.map((skill) => ({
      request_id: request.id,
      skill,
    })),
  );
  await tx`insert into request_required_skills ${tx(requestSkills)}`;

  const requestEquipment = instance.requests.flatMap((request) =>
    request.equipment.map((demand) => ({
      request_id: request.id,
      equipment_id: demand.equipmentId,
      units: demand.units,
    })),
  );
  await tx`insert into request_equipment ${tx(requestEquipment)}`;

  const deps = instance.requests.flatMap((request) =>
    request.dependencies.map((dependsOn) => ({
      request_id: request.id,
      depends_on_id: dependsOn,
    })),
  );
  if (deps.length) await tx`insert into request_dependencies ${tx(deps)}`;
}
