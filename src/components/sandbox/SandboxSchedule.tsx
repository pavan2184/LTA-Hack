import { BlockTimeline } from "@/components/schedule/BlockTimeline";
import { SandboxPageHeading } from "@/components/sandbox/SandboxPageHeading";

export function SandboxSchedule() {
  return (
    <section aria-label="Sandbox schedule" className="space-y-2.5">
      <SandboxPageHeading
        title="Schedule"
        description="Inspect every block occupation across the full overnight engineering window."
      />
      <BlockTimeline />
    </section>
  );
}
