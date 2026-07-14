import { balancedSchedule } from "@/data/balancedSchedule";
import { emergencyBufferSchedule } from "@/data/emergencyBufferSchedule";
import { maxCompletionSchedule } from "@/data/maxCompletionSchedule";
import { minChangesSchedule } from "@/data/minChangesSchedule";
import { minRiskSchedule } from "@/data/minRiskSchedule";
import type { ScheduleVariant, StrategyId } from "@/types/railplan";

export const scheduleVariants: Record<StrategyId, ScheduleVariant> = {
  balanced: balancedSchedule,
  "max-completion": maxCompletionSchedule,
  "min-risk": minRiskSchedule,
  "min-changes": minChangesSchedule,
  "emergency-buffer": emergencyBufferSchedule,
};
