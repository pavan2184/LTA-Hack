import Link from "next/link";
import { SignOut } from "@/components/auth/SignOut";
import { PublicLanding } from "@/components/layout/PublicLanding";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { landingAccess } from "@/lib/auth/page";
import { safeReturnTo } from "@/lib/auth/return-path";

export default async function Home({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const access = await landingAccess();
  // Signed out lands on the public entry rather than a password box, because
  // the PS1 scheduler behind it needs no account at all.
  if (access.state === "anonymous") return <PublicLanding />;
  if (access.state === "unassigned")
    return (
      <main className="workspace-page mx-auto max-w-lg p-12">
        <h1 className="text-2xl font-semibold">Workspace access pending</h1>
        <p className="my-4">
          Your account is signed in, but a workspace administrator must assign
          your role before you can continue.
        </p>
        <p className="my-4 text-sm text-ink-500">
          The <Link className="underline" href="/ps1">PS1 track access scheduler</Link> is open to
          everyone and needs no role.
        </p>
        <SignOut />
      </main>
    );
  const actor = access.actor;
  const planner = actor.role === "planner";
  const raw = await searchParams ?? {};
  const query = new URLSearchParams(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const context = new URL(safeReturnTo(`/plans?${query}`, "planner"), "https://railplan.invalid").searchParams;
  const href = (path: string) => {
    if (!planner) return path;
    const params = new URLSearchParams();
    const intake = path.startsWith("/requests");
    for (const [key, target] of [["night", intake ? "planningNight" : "night"], ["plan", "plan"], ["request", intake ? "planRequest" : "request"]]) {
      const value = context.get(key);
      if (value) params.set(target, value);
    }
    return `${path}${params.size ? `?${params}` : ""}`;
  };
  const steps = [
    { title: "Prepare", owner: "Contractor or planner", text: "Create a request manually, or review a private proposal extracted from meeting notes. Private drafts are not submitted work." },
    { title: "Submit", owner: "Contractor or planner", text: "Check the request details and submit them for planner review. Submission alone does not reserve a work slot." },
    { title: "Review", owner: "Planner", text: "Check the submitted work, resolve missing information and approve the scheduling fields. Only approved revisions become planning inputs." },
    { title: "Schedule", owner: "Planner", text: "Generate a draft for the engineering night, inspect conflicts and workforce, compare objectives and save a revised version." },
    { title: "Publish", owner: "Planner", text: "Review a current, validated plan before publication. Notification delivery is tracked separately from publication." },
    { title: "Track", owner: "Contractor and planner", text: "Contractors see their organisation’s published slots. Planners can revisit saved versions and review delivery status." },
  ];
  return <>
    <WorkspaceNavigation role={actor.role} current="home" planningNight={planner ? context.get("night") : null} planId={planner ? context.get("plan") : null} requestId={planner ? context.get("request") : null} />
    <main id="workspace" tabIndex={-1} className="workspace-page space-y-6">
      <header>
        <p className="workspace-eyebrow">RailPlan · {planner ? "Planner" : "Contractor"} guide</p>
        <h1>How RailPlan works</h1>
        <p>Follow a maintenance request from private preparation to review, scheduling and published slot tracking.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="planner-button primary" href={href(planner ? "/plans" : "/contractor")}>{planner ? "Open night overview" : "Open your requests"}</Link>
          <Link className="planner-button" href={href(planner ? "/requests/drafts" : "/contractor/drafts")}>Prepare a private draft</Link>
        </div>
      </header>
      <section aria-labelledby="workflow-title">
        <h2 id="workflow-title" className="mb-4 text-xl font-semibold">From request to published plan</h2>
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {steps.map((step, index) => <li key={step.title} className="workspace-card">
            <p className="mb-2 text-xs font-semibold text-accent">Step {index + 1} · {step.owner}</p>
            <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
            <p className="text-sm leading-relaxed text-ink-500">{step.text}</p>
          </li>)}
        </ol>
      </section>
      <section aria-labelledby="workspace-links" className="workspace-card">
        <h2 id="workspace-links" className="mb-3 text-xl font-semibold">Where to go next</h2>
        <div className="flex flex-wrap gap-3">
          <Link className="planner-button" href={href(planner ? "/requests" : "/contractor")}>{planner ? "Review submitted requests" : "Track submitted work"}</Link>
          {planner && <><Link className="planner-button" href={href("/plans/history")}>Browse plan history</Link><Link className="planner-button" href={href("/settings/notifications")}>Manage notifications</Link></>}
        </div>
      </section>
      {planner && <section className="workspace-card" aria-labelledby="sandbox-guide">
        <h2 id="sandbox-guide" className="mb-2 text-xl font-semibold">Practise in the demo sandbox</h2>
        <p className="mb-4 text-sm text-ink-500">Explore conflict repair, alternatives, emergency work and disruptions using fabricated requests. Sandbox changes reset on reload, do not affect saved planning and cannot be published.</p>
        <Link className="planner-button" href={href("/sandbox")}>Try the demo sandbox</Link>
      </section>}
      <p className="text-xs text-ink-500">Non-operational prototype with fabricated inputs. A published plan is not an operational instruction or safety approval.</p>
    </main>
  </>;
}
