import { redirect } from "next/navigation";
import { CoordinationWorkspace } from "@/components/coordination/CoordinationWorkspace";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { workspaceActor } from "@/lib/auth/page";

type Query = Record<string, string | string[] | undefined>;

export default async function CoordinationPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const value = (key: string) =>
    typeof query[key] === "string" ? (query[key] as string) : undefined;
  const retained = new URLSearchParams();
  for (const key of ["case", "night", "plan", "request"]) {
    const entry = value(key);
    if (entry) retained.set(key, entry);
  }
  const route = `/plans/coordination${retained.size ? `?${retained}` : ""}`;
  const actor = await workspaceActor(route);
  if (!actor || actor.role !== "planner") redirect("/");
  return (
    <>
      <WorkspaceNavigation
        role="planner"
        current="coordination"
        planningNight={value("night")}
        planId={value("plan")}
        requestId={value("request")}
      />
      <main
        id="workspace"
        tabIndex={-1}
        className="workspace-page mx-auto max-w-7xl space-y-6 px-4 py-8"
      >
        <header>
          <p className="workspace-eyebrow">RailPlan · Planner workspace</p>
          <h1 className="mt-2 text-3xl font-semibold">Coordinate plan changes</h1>
          <p>
            Review versioned schedule proposals, record organisation responses
            and apply a validated proposal as a separate saved draft.
          </p>
        </header>
        <CoordinationWorkspace
          role="planner"
          initialCaseId={value("case")}
          initialPlanningNight={value("night")}
          returnPlanId={value("plan")}
          returnRequestId={value("request")}
        />
        <footer className="border-t border-rule pt-4 text-xs">
          Fabricated inputs. Not for operational decisions.
        </footer>
      </main>
    </>
  );
}
