"use client";
import { useState } from "react";
import type { RequestSubmission } from "@railplan/core/types/requests";
import type { UserRole } from "@railplan/core/types/auth";
import { RequestIntakeWorkspace } from "./RequestIntakeWorkspace";
import { TranscriptDraftWorkspace } from "./TranscriptDraftWorkspace";

export function RequestWorkspaces({ role }: { role: UserRole }) {
  const [submittedRequests, setSubmittedRequests] = useState<
    RequestSubmission[]
  >([]);
  const [view, setView] = useState<"requests" | "notes">("requests");
  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" aria-label="Request workflow">
          {([['requests', role === 'planner' ? 'Review requests' : 'Your requests'], ['notes', 'From meeting notes']] as const).map(([id, label]) =>
            <button key={id} aria-pressed={view === id} onClick={() => setView(id)}
              className="rounded border border-rule-strong px-4 py-2 text-sm font-medium aria-pressed:border-accent aria-pressed:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">{label}</button>)}
        </div>
        <p className="text-sm text-ink-700">{view === 'notes' ? 'Extract draft requests from meeting notes, check the details, then submit them for review.' : role === 'planner' ? 'Review incoming work, approve it for planning, then continue to the schedule.' : 'Create a request, submit it for review, and return here for your confirmed time.'}</p>
      </div>
      <div id="request-intake" hidden={view !== "requests"}>
        <RequestIntakeWorkspace
          role={role}
          incomingRequests={submittedRequests}
        />
      </div>
      <div hidden={view !== "notes"}>
      <TranscriptDraftWorkspace
        role={role}
        manualIntake={role === "contractor"}
        onViewRequests={() => setView("requests")}
        onSubmitted={(request) =>
          setSubmittedRequests((current) => [
            request,
            ...current.filter((row) => row.id !== request.id),
          ])
        }
      />
      </div>
    </>
  );
}
