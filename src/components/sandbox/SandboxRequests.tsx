import { RequestInspector } from "@/components/insights/RequestInspector";
import { PlanningPanels } from "@/components/layout/PlanningPanels";
import { RequestQueue } from "@/components/requests/RequestQueue";
import { SandboxPageHeading } from "@/components/sandbox/SandboxPageHeading";

export function SandboxRequests() {
  return (
    <section aria-label="Sandbox requests" className="space-y-2.5">
      <SandboxPageHeading
        title="Requests"
        description="Search the submitted queue, inspect supporting evidence, compare alternatives and pin placements."
      />
      <PlanningPanels
        preferenceKey="railplan-demo-layout"
        variant="requests"
        queue={<RequestQueue />}
        primary={null}
        inspector={<RequestInspector />}
        workforce={null}
        geography={null}
      />
    </section>
  );
}
