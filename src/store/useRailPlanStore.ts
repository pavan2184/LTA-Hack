import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { buildDisruptionInputs, disruptionById } from "@railplan/core/data/disruptions";
import { requestById } from "@railplan/core/data/requests";
import { findAlternatives } from "@railplan/core/engine/alternatives";
import { explainPlacement, type PlacementExplanation } from "@railplan/core/engine/explain";
import { recommendResolution, repairPlan, type Resolution } from "@railplan/core/engine/resolutions";
import { reviewSubmittedPlan, solve } from "@railplan/core/engine/solve";
import { clusterViolations, validate, type ValidationContext } from "@railplan/core/engine/validate";
import type { AlternativeSlot, Placement, SolveResult, StrategyId, Violation } from "@railplan/core/types/railplan";

/**
 * The two things a planner can be looking at: the night as its requesters asked
 * for it, or the night as the solver would run it. The step indicator is a view
 * of these, not a fourth piece of state.
 */
export type PlanView = "submitted" | "planned";

/** Progress stages surfaced while the solver runs. Each is a real phase. */
export type SolveStage = "idle" | "validating" | "solving" | "verifying";

interface RailPlanState {
  loaded: boolean;
  view: PlanView;
  strategy: StrategyId;
  selectedRequestId: string | null;
  selectedViolationId: string | null;
  /** Planner-pinned placements. Entered as hard constraints before the solve. */
  locked: Record<string, Placement>;
  /**
   * Suggested times the planner has accepted on the requested plan, before any
   * solve. Held apart from `locked` because they are edits to the *input*, not
   * constraints on the solver.
   */
  overrides: Record<string, number>;
  /** Moves the last "apply suggested fixes" run made, for the undo affordance. */
  lastRepair: Resolution[];
  /**
   * Conflicts in the requests exactly as they arrived, fixed at load.
   *
   * The "down from" comparison has to be against what a planner was handed, not
   * against the requested plan as it stands — otherwise accepting a suggestion
   * quietly lowers the bar the schedule is later judged against.
   */
  baselineConflicts: number;
  activeDisruptionId: string | null;
  hasReplanned: boolean;
  stage: SolveStage;
  lastSolveMs: number;

  submitted: SolveResult | null;
  planned: SolveResult | null;
  /** Violations the active disruption causes in the plan as it stands. */
  disruptionImpact: Violation[];
  /**
   * Work the scenario forces into the plan — an emergency insertion, or a job
   * stretched by an overrun. Drawn alongside the plan so the cause of the
   * violations is visible, not just their effect.
   */
  disruptionPlacements: Placement[];

  load: () => Promise<void>;
  buildPlan: () => Promise<void>;
  setView: (view: PlanView) => void;
  setStrategy: (strategy: StrategyId) => Promise<void>;
  selectRequest: (id: string | null) => void;
  selectViolation: (id: string | null) => void;
  toggleLock: (requestId: string) => Promise<void>;
  moveRequest: (requestId: string, startMinute: number) => Promise<void>;
  /** Accept one suggested time on the requested plan and re-check everything. */
  applySuggestion: (requestId: string, startMinute: number) => void;
  /** Work down the conflict list, applying the recommended fix to each. */
  applyAllSuggestions: () => Promise<void>;
  clearSuggestions: () => void;
  /** The recommended fix for one conflict, or null if no single move clears it. */
  resolutionFor: (violationId: string) => Resolution | null;
  triggerDisruption: (id: string) => void;
  replan: () => Promise<void>;
  clearDisruption: () => Promise<void>;
  reset: () => void;

  activeResult: () => SolveResult | null;
  alternativesFor: (requestId: string) => { alternatives: AlternativeSlot[]; bindingRuleId: string | null };
  explanationFor: (requestId: string) => PlacementExplanation | null;
  clusters: () => ReturnType<typeof clusterViolations>;
  context: () => ValidationContext;
}

/** Lets the browser paint the progress overlay between real solver phases. */
const yieldToPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 90));

export const useRailPlanStore = create<RailPlanState>()(
  persist(
    (set, get) => ({
      loaded: false,
      view: "submitted",
      strategy: "balanced",
      selectedRequestId: null,
      selectedViolationId: null,
      locked: {},
      overrides: {},
      lastRepair: [],
      baselineConflicts: 0,
      activeDisruptionId: null,
      hasReplanned: false,
      stage: "idle",
      lastSolveMs: 0,
      submitted: null,
      planned: null,
      disruptionImpact: [],
      disruptionPlacements: [],

      load: async () => {
        set({ stage: "validating" });
        await yieldToPaint();
        const submitted = reviewSubmittedPlan();
        set({
          loaded: true,
          view: "submitted",
          submitted,
          planned: null,
          overrides: {},
          lastRepair: [],
          baselineConflicts: submitted.violations.filter((v) => v.severity === "critical").length,
          stage: "idle",
          lastSolveMs: submitted.solveMs,
          selectedRequestId: null,
          selectedViolationId: null,
          activeDisruptionId: null,
          hasReplanned: false,
          disruptionImpact: [],
          disruptionPlacements: [],
        });
      },

      buildPlan: async () => {
        const state = get();
        set({ stage: "solving" });
        await yieldToPaint();

        const scenario = state.activeDisruptionId ? disruptionById[state.activeDisruptionId] : null;
        const base = state.planned?.plan.placements ?? state.submitted?.plan.placements ?? [];
        const inputs = scenario ? buildDisruptionInputs(scenario, base) : null;

        const result = solve({
          strategy: state.strategy,
          locked: [...Object.values(state.locked), ...(inputs?.locked ?? [])],
          requests: inputs?.requests,
          context: inputs?.context,
        });

        set({ stage: "verifying" });
        await yieldToPaint();

        set({
          planned: result,
          view: "planned",
          stage: "idle",
          lastSolveMs: result.solveMs,
          hasReplanned: Boolean(scenario),
          disruptionImpact: [],
          disruptionPlacements: [],
        });
      },

      setView: (view) => set({ view }),

      setStrategy: async (strategy) => {
        set({ strategy });
        if (get().planned) await get().buildPlan();
      },

      selectRequest: (id) => set({ selectedRequestId: id }),
      selectViolation: (id) => {
        const violation = [
          ...(get().submitted?.violations ?? []),
          ...(get().planned?.violations ?? []),
          ...get().disruptionImpact,
        ].find((item) => item.id === id);
        set({
          selectedViolationId: id,
          selectedRequestId: violation?.requestIds[0] ?? get().selectedRequestId,
        });
      },

      toggleLock: async (requestId) => {
        const state = get();
        const next = { ...state.locked };
        if (next[requestId]) {
          delete next[requestId];
        } else {
          const placement = state.activeResult()?.plan.placements.find(
            (item) => item.requestId === requestId,
          );
          if (!placement) return;
          next[requestId] = { ...placement, locked: true };
        }
        set({ locked: next });
        if (state.planned) await get().buildPlan();
      },

      /**
       * Move a job to a planner-chosen time.
       *
       * The move becomes a lock and the plan is solved again around it, so the
       * rest of the schedule and every metric reflect the decision. A plan is
       * never left showing a placement that the constraints have not seen.
       */
      moveRequest: async (requestId, startMinute) => {
        const request = requestById[requestId];
        if (!request) return;
        set((state) => ({
          locked: {
            ...state.locked,
            [requestId]: {
              requestId,
              startMinute,
              endMinute: startMinute + request.durationMinutes,
              teamId: request.teamId,
              locked: true,
            },
          },
        }));
        await get().buildPlan();
      },

      /**
       * Accept one suggested time on the requested plan.
       *
       * The requested plan is rebuilt from the request set plus every accepted
       * suggestion and put back through the validator, so the conflict count and
       * every figure beside it move together. There is no path here that edits a
       * placement without re-checking it.
       */
      applySuggestion: (requestId, startMinute) => {
        const state = get();
        const overrides = { ...state.overrides, [requestId]: startMinute };
        set({
          overrides,
          submitted: reviewSubmittedPlan(state.context(), overrides),
          selectedRequestId: requestId,
          lastRepair: [],
        });
      },

      /**
       * Work down the conflict list, worst first, applying the recommended fix
       * to each.
       *
       * This is greedy repair, not optimisation: it takes the cheapest move that
       * clears the worst conflict, re-validates, and looks again. It usually will
       * not reach zero — what it cannot fix is left on the board and named, and
       * the solver is the thing that goes after the rest.
       */
      applyAllSuggestions: async () => {
        const state = get();
        const current = state.submitted;
        if (!current) return;

        set({ stage: "solving" });
        await yieldToPaint();

        const context = state.context();
        const outcome = repairPlan(current.plan, context);
        const overrides = { ...state.overrides };
        outcome.moves.forEach((move) => {
          overrides[move.requestId] = move.toMinute;
        });

        set({
          overrides,
          lastRepair: outcome.moves,
          submitted: reviewSubmittedPlan(context, overrides),
          view: "submitted",
          stage: "idle",
          selectedViolationId: null,
        });
      },

      clearSuggestions: () => {
        const state = get();
        set({
          overrides: {},
          lastRepair: [],
          submitted: reviewSubmittedPlan(state.context()),
          selectedViolationId: null,
        });
      },

      resolutionFor: (violationId) => {
        const state = get();
        const result = state.activeResult();
        if (!result) return null;
        const source =
          state.activeDisruptionId && !state.hasReplanned ? state.disruptionImpact : result.violations;
        const violation = source.find((item) => item.id === violationId);
        if (!violation) return null;
        return recommendResolution(result.plan, violation, state.context());
      },

      /**
       * Apply a scenario to the current plan and report what it breaks, without
       * replanning. The planner sees the damage before the tool proposes a fix.
       */
      triggerDisruption: (id) => {
        const scenario = disruptionById[id];
        const state = get();
        const current = state.activeResult();
        if (!scenario || !current) return;

        const inputs = buildDisruptionInputs(scenario, current.plan.placements);
        // Merge rather than append: a scenario that changes an existing job (an
        // overrun) supplies a replacement for it, and appending would leave the
        // plan holding the same job twice and colliding with itself.
        const changed = new Map(inputs.locked.map((placement) => [placement.requestId, placement]));
        const affectedPlan = {
          placements: [
            ...current.plan.placements.map(
              (placement) => changed.get(placement.requestId) ?? placement,
            ),
            ...inputs.locked.filter(
              (placement) =>
                !current.plan.placements.some((item) => item.requestId === placement.requestId),
            ),
          ],
          deferred: current.plan.deferred,
        };
        const impact = validate(affectedPlan, inputs.context);

        set({
          activeDisruptionId: id,
          hasReplanned: false,
          disruptionImpact: impact,
          disruptionPlacements: inputs.locked,
          selectedViolationId: impact[0]?.id ?? null,
          selectedRequestId: impact[0]?.requestIds[0] ?? state.selectedRequestId,
        });
      },

      replan: async () => {
        if (!get().activeDisruptionId) return;
        await get().buildPlan();
      },

      clearDisruption: async () => {
        set({
          activeDisruptionId: null,
          hasReplanned: false,
          disruptionImpact: [],
          disruptionPlacements: [],
        });
        if (get().planned) await get().buildPlan();
      },

      reset: () =>
        set({
          loaded: false,
          view: "submitted",
          selectedRequestId: null,
          selectedViolationId: null,
          locked: {},
          overrides: {},
          lastRepair: [],
          baselineConflicts: 0,
          activeDisruptionId: null,
          hasReplanned: false,
          stage: "idle",
          submitted: null,
          planned: null,
          disruptionImpact: [],
          disruptionPlacements: [],
        }),

      activeResult: () => {
        const state = get();
        return state.view === "planned" ? (state.planned ?? state.submitted) : state.submitted;
      },

      alternativesFor: (requestId) => {
        const state = get();
        const result = state.activeResult();
        if (!result) return { alternatives: [], bindingRuleId: null };
        return findAlternatives(result.plan, requestId, state.context());
      },

      explanationFor: (requestId) => {
        const state = get();
        const result = state.activeResult();
        if (!result) return null;
        return explainPlacement(result.plan, requestId, state.context());
      },

      clusters: () => {
        const state = get();
        const violations = state.activeDisruptionId && !state.hasReplanned
          ? state.disruptionImpact
          : (state.activeResult()?.violations ?? []);
        return clusterViolations(violations);
      },

      context: () => {
        const state = get();
        const scenario = state.activeDisruptionId ? disruptionById[state.activeDisruptionId] : null;
        if (!scenario) return {};
        return buildDisruptionInputs(scenario, state.activeResult()?.plan.placements ?? []).context;
      },
    }),
    {
      name: "railplan-preferences",
      storage: createJSONStorage(() => localStorage),
      // Exact locked placements persist, not just their ids, so a planner's
      // pinned times survive a reload rather than silently reverting.
      partialize: (state) => ({ strategy: state.strategy, locked: state.locked }),
    },
  ),
);
