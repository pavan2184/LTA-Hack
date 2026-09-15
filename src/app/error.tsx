"use client";
import Link from "next/link";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main id="workspace" className="workspace-page"><section className="workspace-card" role="alert"><h1>This view could not be loaded</h1><p className="my-4">Try again, or return to your workspace. Previously saved work remains saved.</p><div className="flex flex-wrap gap-3"><button className="planner-button primary" onClick={reset}>Try again</button><Link className="planner-button" href="/">Return to workspace</Link></div></section></main>;
}
