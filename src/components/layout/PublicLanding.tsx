import Link from "next/link";

/**
 * What an anonymous visitor sees at the bare domain.
 *
 * Public tools and their explanation must be discoverable from the bare domain.
 * The authenticated workspace remains a separate, clearly labelled destination.
 */
export function PublicLanding() {
  return (
    <main className="workspace-page mx-auto max-w-3xl space-y-6">
      <header>
        <p className="workspace-eyebrow">RailPlan · Non-operational prototype</p>
        <h1>Planning maintenance around the trains</h1>
        <p>
          See how scheduling decisions are made, explore the trade-offs, and plan
          the work around limited track access.
        </p>
      </header>

      <section className="workspace-card" aria-labelledby="landing-algorithm-title">
        <p className="mb-1 text-xs font-semibold text-accent">Algorithm Lab · Open, no account</p>
        <h2 id="landing-algorithm-title" className="mb-3 text-xl font-semibold">How CP-SAT works</h2>
        <p className="mb-5 text-sm leading-relaxed text-ink-500">
          Constraint programming turns work into choices and rules. SAT search rules out
          impossible combinations and helps find the best valid schedule.
        </p>
        <ol className="mb-6 grid gap-5 sm:grid-cols-3">
          <li>
            <span className="font-mono text-sm text-accent">01</span>
            <h3 className="my-1 font-semibold">Model the work</h3>
            <p className="text-sm leading-relaxed text-ink-500">Define when each job can run, the rules it must respect and the cost of delay.</p>
          </li>
          <li>
            <span className="font-mono text-sm text-accent">02</span>
            <h3 className="my-1 font-semibold">Search within the rules</h3>
            <p className="text-sm leading-relaxed text-ink-500">Eliminate impossible choices, explore alternatives and learn from conflicts.</p>
          </li>
          <li>
            <span className="font-mono text-sm text-accent">03</span>
            <h3 className="my-1 font-semibold">Prove and explain</h3>
            <p className="text-sm leading-relaxed text-ink-500">Compare the best schedule with a proven bound, then check the result independently.</p>
          </li>
        </ol>
        <a className="planner-button primary" href="/algorithm-lab">
          Explore the interactive CP-SAT lab
        </a>
        <p className="mt-2 text-xs text-ink-500">Real OR-Tools solves. Six example jobs. Change the rules and see why work moves.</p>
      </section>

      <section className="workspace-card">
        <p className="mb-1 text-xs font-semibold text-accent">NebulaX PS1 · Open, no account</p>
        <h2 className="mb-2 text-xl font-semibold">Railway track access scheduler</h2>
        <p className="mb-4 text-sm leading-relaxed text-ink-500">
          Assigns 54 contracted activities to weeks across two lines, checks its own answer
          against the nine hard rules, scores all three scenarios and writes the submission
          files. Load the published instance or upload your own.
        </p>
        <Link className="planner-button primary" href="/ps1" aria-describedby="landing-note-ps1">
          Open the PS1 scheduler
        </Link>
        <p id="landing-note-ps1" className="mt-2 text-xs text-ink-500">
          No sign-in required. The scheduler checks complete plans before display and export.
        </p>
      </section>

      <section className="workspace-card">
        <p className="mb-1 text-xs font-semibold text-accent">RailPlan workspace · Account required</p>
        <h2 className="mb-2 text-xl font-semibold">Overnight engineering planning</h2>
        <p className="mb-4 text-sm leading-relaxed text-ink-500">
          The wider prototype: contractors submit maintenance requests, a planner reviews them,
          schedules the night against the constraint engine and publishes the agreed slots.
        </p>
        <Link className="planner-button" href="/login" aria-describedby="landing-note-workspace">
          Sign in to the workspace
        </Link>
        <p id="landing-note-workspace" className="mt-2 text-xs text-ink-500">
          For provisioned planner and contractor accounts. Roles are assigned by a workspace
          administrator, so signing up is not part of this prototype.
        </p>
      </section>

      <p className="text-xs text-ink-500">
        Fabricated planning data throughout. Nothing either tool produces is an operational
        instruction or a safety approval.
      </p>
    </main>
  );
}
