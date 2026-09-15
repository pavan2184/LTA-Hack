"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CoordinationCasePage } from "@railplan/core/types/coordination";
import type { RequestCatalogue } from "@railplan/core/types/requests";
import { OrganisationConfirmations } from "./OrganisationConfirmations";

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(body?.error?.message ?? "Coordination status is unavailable.");
  return body as T;
}

export function CoordinationSummary({ planId }: { planId: string }) {
  const [result, setResult] = useState<{
    planId: string;
    page: CoordinationCasePage | null;
    catalogue: RequestCatalogue | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readJson<CoordinationCasePage>(
        `/api/coordination?appliedPlanId=${encodeURIComponent(planId)}`,
        controller.signal,
      ),
      readJson<{ catalogue: RequestCatalogue }>(
        "/api/requests/catalogue",
        controller.signal,
      ),
    ])
      .then(([next, response]) => {
        setResult({
          planId,
          page: next,
          catalogue: response.catalogue,
          error: "",
        });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setResult({
            planId,
            page: null,
            catalogue: null,
            error:
              cause instanceof Error
                ? cause.message
                : "Coordination status is unavailable.",
          });
      });
    return () => controller.abort();
  }, [planId]);
  const current = result?.planId === planId ? result : null;
  const names = useMemo(
    () =>
      new Map(
        (current?.catalogue?.organisations ?? []).map((organisation) => [
          organisation.id,
          organisation.name,
        ]),
      ),
    [current?.catalogue],
  );
  const coordinationCase = current?.page?.cases?.[0];
  return (
    <section
      className="rounded border border-rule bg-surface p-4"
      aria-label="Saved plan coordination"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Coordination for this saved plan</h3>
          {coordinationCase ? (
            <p className="planner-muted text-sm">
              Applied proposal revision {coordinationCase.viewedRevision}
              {coordinationCase.currentRevision !== coordinationCase.viewedRevision
                ? ` · Case now has revision ${coordinationCase.currentRevision}`
                : ""}
            </p>
          ) : (
            <p className="planner-muted text-sm">
              {current?.page
                ? "No coordination case is linked to this exact saved plan."
                : "Loading exact-plan confirmation status…"}
            </p>
          )}
        </div>
        {coordinationCase?.scope === "planner" && (
          <Link
            className="planner-link"
            href={`/plans/coordination?${new URLSearchParams({ case: coordinationCase.id, night: coordinationCase.planningNight, plan: planId })}`}
          >
            Open coordination case
          </Link>
        )}
      </div>
      {current?.error && <p role="alert">{current.error}</p>}
      {coordinationCase && (
        <div className="mt-3">
          <OrganisationConfirmations
            coordinationCase={coordinationCase}
            role="planner"
            organisationNames={names}
            disabled
            readOnly
            onAction={async () => undefined}
          />
        </div>
      )}
      <p className="planner-muted mt-3 text-xs">
        Pending approval or requested changes remain visible but do not block a
        validated publication.
      </p>
    </section>
  );
}
