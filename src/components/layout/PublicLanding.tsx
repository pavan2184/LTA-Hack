import Link from "next/link";

/**
 * What an anonymous visitor sees at the bare domain.
 *
 * The PS1 scheduler is deliberately public — no account, no database, solved in
 * the browser — but it was reachable only by typing `/ps1`, behind a workspace
 * that redirects everyone else to a password box. Someone handed the domain and
 * nothing else would have found a sign-in form and stopped. This page exists so
 * the open thing is the first thing, and the workspace is the door you take if
 * you have a key.
 */
export function PublicLanding() {
  return (
    <main className="workspace-page mx-auto max-w-3xl space-y-6">
      <header>
        <p className="workspace-eyebrow">RailPlan · Non-operational prototype</p>
        <h1>Planning maintenance around the trains</h1>
        <p>
          Two tools over the same problem: deciding which work gets the track, and proving the
          answer is one someone could actually run.
        </p>
      </header>

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
          No sign-in and no server: the instance is read and solved in your browser, and nothing
          you load is uploaded anywhere.
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
