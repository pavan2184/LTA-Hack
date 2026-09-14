import { PlanningPanels } from "@/components/layout/PlanningPanels";
import { GeographicNetworkView } from "@/components/network/GeographicNetworkView";
import { WorkforceTimeline } from "@/components/schedule/WorkforceTimeline";
import { SandboxPageHeading } from "@/components/sandbox/SandboxPageHeading";

export function SandboxResources() {
  return (
    <section aria-label="Sandbox resources" className="space-y-2.5">
      <SandboxPageHeading
        title="Resources"
        description="Compare workforce demand with availability and inspect the plan against the network geography."
      />
      <PlanningPanels
        preferenceKey="railplan-demo-layout"
        variant="resources"
        queue={null}
        primary={null}
        inspector={null}
        workforce={<WorkforceTimeline />}
        geography={<GeographicNetworkView />}
      />
    </section>
  );
}
