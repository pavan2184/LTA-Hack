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
  return (
    <>
      <div id="request-intake">
        <RequestIntakeWorkspace
          role={role}
          incomingRequests={submittedRequests}
        />
      </div>
      <TranscriptDraftWorkspace
        role={role}
        manualIntake={role === "contractor"}
        onSubmitted={(request) =>
          setSubmittedRequests((current) => [
            request,
            ...current.filter((row) => row.id !== request.id),
          ])
        }
      />
    </>
  );
}
