import Link from "next/link";
export default function NotFound() {
  return <main id="workspace" className="workspace-page"><section className="workspace-card"><h1>Page not found</h1><p className="my-4">This link is no longer available. Return to your workspace to continue.</p><Link className="planner-button" href="/">Return to workspace</Link></section></main>;
}
