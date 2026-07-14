import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { disruptionById } from "@/data/disruptionScenarios";
import { disruptionResponseSchedules } from "@/data/disruptionResponseSchedules";
import { conflicts, originalSchedule } from "@/data/originalSchedule";
import { scheduleVariants } from "@/data/schedules";
import type { ScheduleVariant, ScheduledJob, StrategyId } from "@/types/railplan";

type CurrentView = "original" | "optimised" | "disrupted";

interface RailPlanState {
  currentView: CurrentView;
  selectedStrategy: StrategyId;
  selectedRequestId: string | null;
  selectedConflictId: string | null;
  lockedRequestIds: string[];
  acceptedRecommendationIds: string[];
  rejectedRecommendationIds: string[];
  activeDisruptionId: string | null;
  isOptimising: boolean;
  optimisationStep: number;
  isReplanning: boolean;
  isDemoLoaded: boolean;
  hasReplanned: boolean;
  lockedPlacements: Record<string, ScheduledJob>;
  scheduleOverrides: Record<string, ScheduledJob>;
  loadDemo: () => void;
  selectRequest: (id: string | null) => void;
  selectConflict: (id: string | null) => void;
  changeStrategy: (strategy: StrategyId) => void;
  optimise: () => Promise<void>;
  toggleLock: (id: string) => void;
  acceptRecommendation: (id: string) => void;
  rejectRecommendation: (id: string) => void;
  applyAlternative: (requestId: string, alternativeId: string) => void;
  triggerDisruption: (id: string) => void;
  replan: () => Promise<void>;
  resetDemo: () => void;
  getVisibleSchedule: () => ScheduleVariant;
}

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

function mergePlannerControls(
  schedule: ScheduleVariant,
  lockedIds: string[],
  lockedPlacements: Record<string, ScheduledJob>,
  overrides: Record<string, ScheduledJob>,
): ScheduleVariant {
  const ids = new Set(schedule.jobs.map((item) => item.requestId));
  const jobs = schedule.jobs.map((item) => {
    const persistedLockFallback = lockedIds.includes(item.requestId)
      ? originalSchedule.jobs.find((originalJob) => originalJob.requestId === item.requestId)
      : undefined;
    const replacement = overrides[item.requestId] ?? lockedPlacements[item.requestId] ?? persistedLockFallback ?? item;
    return {
      ...replacement,
      locked: lockedIds.includes(item.requestId),
      status: lockedIds.includes(item.requestId) ? "locked" as const : replacement.status,
    };
  });

  Object.values(lockedPlacements).forEach((item) => {
    if (!ids.has(item.requestId)) jobs.push({ ...item, locked: true, status: "locked" });
  });

  return { ...schedule, jobs };
}

export const useRailPlanStore = create<RailPlanState>()(
  persist(
    (set, get) => ({
      currentView: "original",
      selectedStrategy: "balanced",
      selectedRequestId: null,
      selectedConflictId: null,
      lockedRequestIds: [],
      acceptedRecommendationIds: [],
      rejectedRecommendationIds: [],
      activeDisruptionId: null,
      isOptimising: false,
      optimisationStep: 0,
      isReplanning: false,
      isDemoLoaded: false,
      hasReplanned: false,
      lockedPlacements: {},
      scheduleOverrides: {},

      loadDemo: () => set({ currentView: "original", isDemoLoaded: true, selectedRequestId: null, selectedConflictId: null, activeDisruptionId: null, hasReplanned: false, scheduleOverrides: {} }),
      selectRequest: (id) => set({ selectedRequestId: id, selectedConflictId: id ? get().selectedConflictId : null }),
      selectConflict: (id) => set({ selectedConflictId: id, selectedRequestId: id ? conflicts.find((item) => item.id === id)?.requestIds[0] ?? null : null }),
      changeStrategy: (selectedStrategy) => set((state) => ({ selectedStrategy, currentView: state.currentView === "original" ? "original" : "optimised", activeDisruptionId: state.currentView === "disrupted" ? null : state.activeDisruptionId, hasReplanned: false })),
      optimise: async () => {
        set({ isOptimising: true, optimisationStep: 0, isDemoLoaded: true });
        await wait(350);
        set({ optimisationStep: 1 });
        await wait(350);
        set({ optimisationStep: 2 });
        await wait(350);
        set({ currentView: "optimised", isOptimising: false, optimisationStep: 0, selectedConflictId: null, activeDisruptionId: null, hasReplanned: false });
      },
      toggleLock: (id) => {
        const state = get();
        const isLocked = state.lockedRequestIds.includes(id);
        if (isLocked) {
          const { [id]: _removed, ...lockedPlacements } = state.lockedPlacements;
          void _removed;
          set({ lockedRequestIds: state.lockedRequestIds.filter((item) => item !== id), lockedPlacements });
          return;
        }
        const placement = state.getVisibleSchedule().jobs.find((item) => item.requestId === id);
        set({
          lockedRequestIds: [...state.lockedRequestIds, id],
          lockedPlacements: placement ? { ...state.lockedPlacements, [id]: placement } : state.lockedPlacements,
        });
      },
      acceptRecommendation: (id) => set((state) => ({ acceptedRecommendationIds: [...new Set([...state.acceptedRecommendationIds, id])], rejectedRecommendationIds: state.rejectedRecommendationIds.filter((item) => item !== id) })),
      rejectRecommendation: (id) => set((state) => ({ rejectedRecommendationIds: [...new Set([...state.rejectedRecommendationIds, id])], acceptedRecommendationIds: state.acceptedRecommendationIds.filter((item) => item !== id) })),
      applyAlternative: (requestId, alternativeId) => {
        const current = get().getVisibleSchedule().jobs.find((item) => item.requestId === requestId);
        const alternative = current?.alternativeSlots.find((item) => item.id === alternativeId);
        if (!current || !alternative) return;
        set((state) => ({ scheduleOverrides: { ...state.scheduleOverrides, [requestId]: { ...current, startTime: alternative.startTime, endTime: alternative.endTime, status: "moved", movedMinutes: undefined } } }));
      },
      triggerDisruption: (id) => {
        const scenario = disruptionById[id];
        if (!scenario) return;
        set({ currentView: "disrupted", activeDisruptionId: id, isDemoLoaded: true, hasReplanned: false, selectedRequestId: scenario.affectedRequestIds[0] ?? null, selectedConflictId: null });
      },
      replan: async () => {
        if (!get().activeDisruptionId) return;
        set({ isReplanning: true });
        await wait(850);
        set({ isReplanning: false, hasReplanned: true });
      },
      resetDemo: () => set({ currentView: "original", selectedRequestId: null, selectedConflictId: null, acceptedRecommendationIds: [], rejectedRecommendationIds: [], activeDisruptionId: null, isOptimising: false, optimisationStep: 0, isReplanning: false, isDemoLoaded: false, hasReplanned: false, lockedPlacements: {}, scheduleOverrides: {} }),
      getVisibleSchedule: () => {
        const state = get();
        let schedule: ScheduleVariant;
        if (state.currentView === "original") {
          schedule = originalSchedule;
        } else if (state.currentView === "disrupted" && state.activeDisruptionId && state.hasReplanned) {
          schedule = disruptionResponseSchedules[state.activeDisruptionId]?.schedule ?? scheduleVariants[state.selectedStrategy];
        } else {
          schedule = scheduleVariants[state.selectedStrategy];
        }

        if (state.currentView === "disrupted" && state.activeDisruptionId && !state.hasReplanned) {
          const scenario = disruptionById[state.activeDisruptionId];
          schedule = {
            ...schedule,
            metrics: {
              ...schedule.metrics,
              activeConflicts: scenario.affectedRequestIds.length,
              robustness: scenario.degradedRobustness,
              emergencyCapacity: Math.max(20, scenario.degradedRobustness - 15),
            },
          };
        }

        return mergePlannerControls(schedule, state.lockedRequestIds, state.lockedPlacements, state.scheduleOverrides);
      },
    }),
    {
      name: "railplan-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ selectedStrategy: state.selectedStrategy, lockedRequestIds: state.lockedRequestIds }),
    },
  ),
);
