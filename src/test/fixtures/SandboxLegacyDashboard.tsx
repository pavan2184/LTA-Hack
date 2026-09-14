import { PlannerAssistant } from "@/components/assistant/PlannerAssistant";
import { RequestInspector } from "@/components/insights/RequestInspector";
import { ViolationPanel } from "@/components/insights/ViolationPanel";
import { PlanningPanels } from "@/components/layout/PlanningPanels";
import { GeographicNetworkView } from "@/components/network/GeographicNetworkView";
import { RequestQueue } from "@/components/requests/RequestQueue";
import { BlockTimeline } from "@/components/schedule/BlockTimeline";
import { WorkforceTimeline } from "@/components/schedule/WorkforceTimeline";
import {
  PlanSignals,
  SecondaryFigures,
} from "@/components/sandbox/SandboxOverview";
import { ScenarioTesting } from "@/components/sandbox/SandboxScenarios";

/** Complete pre-split composition retained only for end-to-end regressions. */
export function SandboxLegacyDashboard() {
  return (
    <>
      <PlanSignals />
      <PlanningPanels
        preferenceKey="railplan-demo-layout"
        queue={<RequestQueue />}
        primary={<BlockTimeline />}
        workforce={<WorkforceTimeline />}
        geography={<GeographicNetworkView />}
        belowPrimary={
          <div className="grid gap-2.5 xl:grid-cols-2">
            <ViolationPanel />
            <section className="grid content-start gap-2.5">
              <SecondaryFigures />
            </section>
          </div>
        }
        inspector={
          <div className="min-w-0 space-y-2.5">
            <RequestInspector />
            <div className="min-h-[300px]">
              <PlannerAssistant />
            </div>
          </div>
        }
      />
      <ScenarioTesting />
    </>
  );
}
