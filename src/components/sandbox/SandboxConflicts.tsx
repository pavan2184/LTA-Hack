import { ViolationPanel } from "@/components/insights/ViolationPanel";
import { SandboxPageHeading } from "@/components/sandbox/SandboxPageHeading";

export function SandboxConflicts() {
  return (
    <section aria-label="Sandbox conflicts" className="space-y-2.5">
      <SandboxPageHeading
        title="Conflicts"
        description="Review categorized rule violations, expand the evidence and apply validated repair actions."
      />
      <ViolationPanel />
    </section>
  );
}
