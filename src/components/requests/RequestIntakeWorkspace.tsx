"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UserRole } from "@railplan/core/types/auth";
import type {
  RequestApproval,
  RequestCatalogue,
  RequestFields,
  RequestSubmission,
} from "@railplan/core/types/requests";

import { ProposalEvidence, ProposalHistory } from "./ProposalEvidence";

type ApprovalForm = Omit<RequestApproval, "safetyConfirmed"> & {
  safetyConfirmed: boolean;
};
const control =
  "w-full rounded border border-rule-strong bg-surface px-3 py-2 text-sm disabled:bg-sunk disabled:text-ink-700";
const button =
  "rounded border border-rule-strong px-3 py-2 text-sm hover:bg-sunk disabled:opacity-50";
const initialApproval: ApprovalForm = {
  teamId: "",
  priority: "medium",
  clearanceMinutes: 0,
  requiredSkills: [],
  dependencies: [],
  dependencyLagMinutes: 0,
  safetyConfirmed: false,
};
const labelStatus = (status: string) => status.replaceAll("_", " ");
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
class IntakeError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      path,
      body === undefined
        ? { cache: "no-store" }
        : {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new IntakeError(
      "We could not reach the server. Your entries are still here; try again.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new IntakeError(
      data?.error?.message ?? "The request could not be completed.",
      data?.error?.fieldErrors ?? {},
    );
  if (!data)
    throw new IntakeError(
      "The server returned an unreadable response. Refresh and try again.",
    );
  return data as T;
}
function emptyFields(catalogue: RequestCatalogue): RequestFields {
  const night = catalogue.nights[0];
  return {
    planningNight: night?.planningNight ?? "",
    title: "",
    description: "",
    workClass: catalogue.workClasses[0],
    blockIds: [],
    durationMinutes: Math.min(
      30,
      (night?.endMinute ?? 30) - (night?.startMinute ?? 0),
    ),
    preferredStart: night?.startMinute ?? 0,
    earliestStart: night?.startMinute ?? 0,
    latestEnd: night?.endMinute ?? 240,
    equipment: [],
    workforce: [],
  };
}

export function RequestIntakeWorkspace({
  role,
  incomingRequests = [],
}: {
  role: UserRole;
  incomingRequests?: RequestSubmission[];
}) {
  const [catalogue, setCatalogue] = useState<RequestCatalogue | null>(null);
  const [requests, setRequests] = useState<RequestSubmission[]>([]);
  const newerIncoming = incomingRequests.filter(
    (incoming) =>
      !requests.some(
        (row) => row.id === incoming.id && row.version >= incoming.version,
      ),
  );
  const visibleRequests = [
    ...newerIncoming,
    ...requests.filter(
      (row) => !newerIncoming.some((incoming) => incoming.id === row.id),
    ),
  ];
  const [selected, setSelected] = useState<RequestSubmission | null>(null);
  const [fields, setFields] = useState<RequestFields | null>(null);
  const [approval, setApproval] = useState<ApprovalForm>(initialApproval);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const contractor = role === "contractor";
  const editable =
    contractor &&
    (!selected || ["draft", "needs_info"].includes(selected.status));
  const dirty = Boolean(fields && catalogue && (
    JSON.stringify(fields) !== JSON.stringify(selected?.fields ?? emptyFields(catalogue)) ||
    JSON.stringify(approval) !== JSON.stringify(selected?.approval ?? initialApproval) || reason.trim()
  ));
  function discardEdits() {
    setFields(selected?.fields ?? null);
    setApproval(selected?.approval ?? initialApproval);
    setReason(""); setError(""); setFieldErrors({});
  }
  const report = (cause: unknown) => {
    setError(
      cause instanceof Error
        ? cause.message
        : "The request could not be completed.",
    );
    setFieldErrors(cause instanceof IntakeError ? cause.fields : {});
  };
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ catalogue: RequestCatalogue }>("/api/requests/catalogue"),
      api<{ requests: RequestSubmission[] }>("/api/requests"),
    ])
      .then(([c, r]) => {
        if (!cancelled) {
          setCatalogue(c.catalogue);
          setRequests(r.requests);
        }
      })
      .catch((cause) => {
        if (!cancelled) report(cause);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  function select(request: RequestSubmission) {
    setSelected(request);
    setFields(request.fields);
    setApproval(request.approval ?? initialApproval);
    setReason("");
  }
  function accept(request: RequestSubmission) {
    setRequests((current) => [
      request,
      ...current.filter((row) => row.id !== request.id),
    ]);
    select(request);
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setFieldErrors({});
    setNotice("");
    try {
      await work();
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    await perform(async () => {
      const data = await api<{ request: RequestSubmission }>(
        `/api/requests/${id}`,
      );
      select(data.request);
    });
  }
  async function refresh() {
    await perform(async () => {
      const [c, r] = await Promise.all([
        api<{ catalogue: RequestCatalogue }>("/api/requests/catalogue"),
        api<{ requests: RequestSubmission[] }>("/api/requests"),
      ]);
      setCatalogue(c.catalogue);
      setRequests(r.requests);
      setSelected(null);
      setFields(null);
    });
  }
  async function save(): Promise<RequestSubmission> {
    const data = await api<{ request: RequestSubmission }>(
      selected ? `/api/requests/${selected.id}` : "/api/requests",
      selected ? { expectedVersion: selected.version, fields } : { fields },
      selected ? "PATCH" : "POST",
    );
    accept(data.request);
    return data.request;
  }
  async function action(
    action:
      | "submit"
      | "cancel"
      | "revise"
      | "needs_info"
      | "approve"
      | "reject",
  ) {
    await perform(async () => {
      // Submitting includes the current form, so unsaved corrections cannot be lost.
      const current = action === "submit" && editable ? await save() : selected;
      if (!current) throw new IntakeError("Save a draft first.");
      const data = await api<{ request: RequestSubmission }>(
        `/api/requests/${current.id}/actions`,
        {
          expectedVersion: current.version,
          action,
          reason,
          ...(action === "approve" ? { approval } : {}),
        },
      );
      accept(data.request);
      setNotice(`Request is now ${labelStatus(data.request.status)}.`);
    });
  }
  const field = (
    key: keyof RequestFields,
    value: RequestFields[keyof RequestFields],
  ) =>
    setFields((current) => (current ? { ...current, [key]: value } : current));
  const errorsFor = (key: string) =>
    Object.entries(fieldErrors).filter(
      ([path]) => path === key || path.startsWith(key + "."),
    );
  const errorId = (key: string) => `intake-error-${key.replaceAll(".", "-")}`;
  const errorAttributes = (key: string, label?: string) => ({
    "aria-invalid": errorsFor(key).length > 0,
    "aria-describedby": errorsFor(key).length ? errorId(key) : undefined,
    ...(label ? { "aria-label": label } : {}),
  });
  const errorFor = (key: string) =>
    errorsFor(key).length ? (
      <div id={errorId(key)}>
        {errorsFor(key).map(([path, message]) => (
          <p key={path} className="mt-1 text-sm text-signal-red">
            {message}
          </p>
        ))}
      </div>
    ) : null;
  function input(
    label: string,
    key:
      | "title"
      | "durationMinutes"
      | "preferredStart"
      | "earliestStart"
      | "latestEnd",
  ) {
    return (
      <label className="block text-sm">
        {label}
        <input
          {...errorAttributes(key, label)}
          className={`${control} mt-1`}
          type={key === "title" ? "text" : "number"}
          maxLength={key === "title" ? 160 : undefined}
          min={key === "durationMinutes" ? 1 : 0}
          max={key === "title" ? undefined : 2880}
          value={fields?.[key] ?? ""}
          onChange={(e) =>
            field(
              key,
              key === "title" ? e.target.value : Number(e.target.value),
            )
          }
        />
        {errorFor(key)}
      </label>
    );
  }
  return (
    <section className="space-y-5" aria-label="Maintenance request intake">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-700">
          {contractor
            ? "Propose maintenance work for your organisation. A planner reviews scheduling and safety fields before approval."
            : "Review submitted work and confirm the scheduling fields before approval. Approval adds an immutable revision to planning inputs."}
        </p>
        <div className="flex gap-2">
          <button className={button} disabled={busy || dirty} onClick={refresh}>
            Refresh requests
          </button>
          {contractor && (
            <button
              className={button}
              disabled={busy || dirty || !catalogue?.nights.length}
              onClick={() => {
                setSelected(null);
                setFields(emptyFields(catalogue!));
                setApproval(initialApproval);
                setError("");
                setFieldErrors({});
                setNotice("");
                setReason("");
              }}
            >
              New request
            </button>
          )}
        </div>
      </div>
      {dirty && <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-signal-amber bg-sunk p-3 text-sm" role="status">
        <p>Unsaved changes. Save or complete this request before opening another.</p>
        <button className={button} disabled={busy} onClick={discardEdits}>Discard unsaved changes</button>
      </div>}
      {busy && (
        <p role="status" className="text-sm">
          Loading request data…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="border border-signal-red p-3 text-sm text-signal-red"
        >
          <p>{error}</p>
          {Object.keys(fieldErrors).length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {Object.entries(fieldErrors).map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {selected?.status === "approved" && !contractor && <div className="rounded border border-rule bg-accent-soft p-4">
        <p className="font-semibold">Ready for scheduling</p>
        <p className="mt-1 text-sm">This request is approved. Generate a new schedule to include it.</p>
        <Link href="/plans" className="mt-2 inline-block text-sm font-medium underline underline-offset-4">Continue to scheduling →</Link>
      </div>}
      {selected?.status === "submitted" && contractor && <p className="text-sm">Sent for review. Your planner will confirm the details before scheduling; your published time will appear here.</p>}
      {notice && (
        <p role="status" className="text-sm text-signal-green">
          {notice}
        </p>
      )}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside aria-label="Your requests" className="min-w-0 space-y-2">
          {!busy && !visibleRequests.length && (
            <p className="text-sm text-ink-500">No requests yet.</p>
          )}
          {visibleRequests.map((request) => (
            <button
              key={request.id}
              className={`w-full min-w-0 break-words [overflow-wrap:anywhere] border p-3 text-left text-sm ${selected?.id === request.id ? "border-accent bg-sunk" : "border-rule bg-surface"}`}
              disabled={busy || dirty}
              aria-label={`Open ${request.fields.title || "Untitled draft"}`}
              aria-pressed={selected?.id === request.id}
              onClick={() => open(request.id)}
            >
              <span className="block font-semibold">
                {request.fields.title || "Untitled draft"}
              </span>
              <span className="block capitalize">
                {labelStatus(request.status)} · v{request.version}
              </span>
              <span className="block text-xs text-ink-500">
                {request.fields.planningNight}
                {!contractor && ` · ${request.organisationName}`}
              </span>
            </button>
          ))}
        </aside>
        {fields && catalogue ? (
          <div className="min-w-0 space-y-5 break-words [overflow-wrap:anywhere] border border-rule bg-surface p-4">
            <header>
              <h2 className="text-xl font-semibold">
                {selected
                  ? selected.fields.title || "Untitled draft"
                  : "New maintenance request"}
              </h2>
              {selected && (
                <p className="mt-1 text-sm capitalize">
                  {labelStatus(selected.status)} · Version {selected.version}
                </p>
              )}
              {selected?.activeApprovedRevision !== null &&
                selected?.activeApprovedRevision !== undefined && (
                  <p className="mt-2 text-sm">
                    Approved revision {selected.activeApprovedRevision} remains
                    the planning input until it is replaced or cancelled.
                  </p>
                )}
              {selected?.scheduled && (
                <p className="mt-2 text-sm">
                  Published time {clock(selected.scheduled.startMinute)}–
                  {clock(selected.scheduled.endMinute)}
                  {selected.scheduled.startMinute !== selected.fields.preferredStart &&
                    ` (requested ${clock(selected.fields.preferredStart)})`}
                  .{" "}
                  {selected.scheduled.acknowledgement
                    ? selected.scheduled.acknowledgement.kind === "confirmed"
                      ? "The contractor confirmed this time."
                      : `The contractor cannot make this time: ${selected.scheduled.acknowledgement.reason}`
                    : contractor
                      ? "Confirm it under Your schedule above."
                      : "The contractor has not answered yet."}
                  <span className="block text-xs text-ink-500">
                    Version {selected.scheduled.planId} · revision {selected.scheduled.revision}
                  </span>
                </p>
              )}
            </header>
            <fieldset
              disabled={busy || !editable}
              className="min-w-0 space-y-4"
            >
              <legend className="mb-3 font-semibold">Proposed work</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  Planning night
                  <select
                    {...errorAttributes("planningNight", "Planning night")}
                    className={`${control} mt-1`}
                    value={fields.planningNight}
                    onChange={(e) => field("planningNight", e.target.value)}
                  >
                    {catalogue.nights.map((n) => (
                      <option key={n.planningNight} value={n.planningNight}>
                        {n.planningNight} · {clock(n.startMinute)}–
                        {clock(n.endMinute)}
                      </option>
                    ))}
                  </select>
                  {errorFor("planningNight")}
                </label>
                {input("Title", "title")}
                <label className="block text-sm">
                  Work class
                  <select
                    {...errorAttributes("workClass", "Work class")}
                    className={`${control} mt-1`}
                    value={fields.workClass}
                    onChange={(e) =>
                      field(
                        "workClass",
                        e.target.value as RequestFields["workClass"],
                      )
                    }
                  >
                    {catalogue.workClasses.map((w) => (
                      <option key={w} value={w}>
                        {w.replaceAll("-", " ")}
                      </option>
                    ))}
                  </select>
                  {errorFor("workClass")}
                </label>
                {input("Duration (minutes)", "durationMinutes")}
              </div>
              <label className="block text-sm">
                Description
                <textarea
                  {...errorAttributes("description", "Description")}
                  className={`${control} mt-1`}
                  rows={3}
                  maxLength={4000}
                  value={fields.description}
                  onChange={(e) => field("description", e.target.value)}
                />
                {errorFor("description")}
              </label>
              <fieldset
                {...errorAttributes("blockIds")}
                className="min-w-0 rounded border border-rule p-3"
              >
                <legend className="px-1 text-sm">Track blocks</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {catalogue.blocks.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={fields.blockIds.includes(b.id)}
                        onChange={(e) =>
                          field(
                            "blockIds",
                            e.target.checked
                              ? [...fields.blockIds, b.id]
                              : fields.blockIds.filter((id) => id !== b.id),
                          )
                        }
                      />
                      {b.label}
                    </label>
                  ))}
                </div>
                {errorFor("blockIds")}
              </fieldset>
              <p className="text-xs text-ink-500">
                Times below are minutes after midnight on the planning night: 60
                = 01:00, 240 = 04:00.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {input("Preferred start (minutes)", "preferredStart")}
                {input("Earliest start (minutes)", "earliestStart")}
                {input("Latest end (minutes)", "latestEnd")}
              </div>
              <fieldset
                {...errorAttributes("equipment")}
                className="min-w-0 rounded border border-rule p-3"
              >
                <legend className="px-1 text-sm">
                  Equipment units (0 means none)
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {catalogue.equipment.map((e) => (
                    <label key={e.id} className="text-sm">
                      {e.name}
                      <input
                        {...errorAttributes("equipment", e.name)}
                        className={`${control} mt-1`}
                        type="number"
                        min={0}
                        max={e.capacity}
                        value={
                          fields.equipment.find((r) => r.equipmentId === e.id)
                            ?.units ?? 0
                        }
                        onChange={(event) => {
                          const units = Number(event.target.value);
                          field("equipment", [
                            ...fields.equipment.filter(
                              (r) => r.equipmentId !== e.id,
                            ),
                            ...(units ? [{ equipmentId: e.id, units }] : []),
                          ]);
                        }}
                      />
                    </label>
                  ))}
                </div>
                {errorFor("equipment")}
              </fieldset>
              <fieldset
                {...errorAttributes("workforce")}
                className="min-w-0 rounded border border-rule p-3"
              >
                <legend className="px-1 text-sm">
                  Workforce headcounts (anonymous roles)
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {catalogue.roles.map((r) => (
                    <label key={r.id} className="text-sm">
                      {r.name}
                      <input
                        {...errorAttributes("workforce", r.name)}
                        className={`${control} mt-1`}
                        type="number"
                        min={0}
                        max={10000}
                        value={
                          fields.workforce.find((d) => d.roleId === r.id)
                            ?.count ?? 0
                        }
                        onChange={(e) => {
                          const count = Number(e.target.value);
                          field("workforce", [
                            ...fields.workforce.filter(
                              (d) => d.roleId !== r.id,
                            ),
                            ...(count ? [{ roleId: r.id, count }] : []),
                          ]);
                        }}
                      />
                    </label>
                  ))}
                </div>
                {errorFor("workforce")}
              </fieldset>
            </fieldset>
            {editable && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await save();
                      setNotice("Draft saved.");
                    })
                  }
                >
                  Save draft
                </button>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => action("submit")}
                >
                  Submit for review
                </button>
              </div>
            )}
            {selected?.proposalSource && (
              <section
                aria-label="Submitted proposal provenance"
                className="min-w-0 space-y-3 border-t border-rule pt-4"
              >
                <h3 className="font-semibold">Submitted proposal provenance</h3>
                <p className="text-sm">
                  Immutable proposal {selected.proposalSource.draftId} ·
                  revision {selected.proposalSource.submittedRevision} · Shared{" "}
                  {selected.proposalSource.submittedAt} by{" "}
                  {selected.proposalSource.submittedBy}.
                </p>
                <p className="text-sm">
                  This records the submitted proposal. Later request changes and
                  planner decisions are separate. Model estimates and excerpts
                  do not establish feasibility or safety.
                </p>
                <ProposalEvidence
                  proposal={selected.proposalSource}
                  manualFields={selected.proposalSource.manualFields}
                />
                <ProposalHistory
                  revisions={selected.proposalSource.revisions}
                />
              </section>
            )}
            {selected && !contractor && selected.status === "submitted" && (
              <fieldset
                disabled={busy}
                className="space-y-4 border-t border-rule pt-4"
              >
                <legend className="font-semibold">Planner confirmation</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    Team assignment
                    <select
                      {...errorAttributes("approval.teamId", "Team assignment")}
                      className={`${control} mt-1`}
                      value={approval.teamId}
                      onChange={(e) =>
                        setApproval({ ...approval, teamId: e.target.value })
                      }
                    >
                      <option value="">Choose a team</option>
                      {catalogue.teams?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {errorFor("approval.teamId")}
                  </label>
                  <label className="text-sm">
                    Priority
                    <select
                      {...errorAttributes("approval.priority", "Priority")}
                      className={`${control} mt-1`}
                      value={approval.priority}
                      onChange={(e) =>
                        setApproval({
                          ...approval,
                          priority: e.target
                            .value as RequestApproval["priority"],
                        })
                      }
                    >
                      {["low", "medium", "high", "critical"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                    {errorFor("approval.priority")}
                  </label>
                  <label className="text-sm">
                    Clearance (minutes)
                    <input
                      {...errorAttributes(
                        "approval.clearanceMinutes",
                        "Clearance (minutes)",
                      )}
                      className={`${control} mt-1`}
                      type="number"
                      min={0}
                      max={1440}
                      value={approval.clearanceMinutes}
                      onChange={(e) =>
                        setApproval({
                          ...approval,
                          clearanceMinutes: Number(e.target.value),
                        })
                      }
                    />
                    {errorFor("approval.clearanceMinutes")}
                  </label>
                  <label className="text-sm">
                    Dependency gap (minutes)
                    <input
                      {...errorAttributes(
                        "approval.dependencyLagMinutes",
                        "Dependency gap (minutes)",
                      )}
                      className={`${control} mt-1`}
                      type="number"
                      min={0}
                      max={1440}
                      value={approval.dependencyLagMinutes}
                      onChange={(e) =>
                        setApproval({
                          ...approval,
                          dependencyLagMinutes: Number(e.target.value),
                        })
                      }
                    />
                    {errorFor("approval.dependencyLagMinutes")}
                  </label>
                </div>
                <fieldset
                  {...errorAttributes("approval.requiredSkills")}
                  className="min-w-0"
                >
                  <legend className="text-sm">Required team skills</legend>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {[
                      ...new Set(
                        catalogue.teams?.flatMap((t) => t.skills) ?? [],
                      ),
                    ].map((skill) => (
                      <label
                        key={skill}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={approval.requiredSkills.includes(skill)}
                          onChange={(e) =>
                            setApproval({
                              ...approval,
                              requiredSkills: e.target.checked
                                ? [...approval.requiredSkills, skill]
                                : approval.requiredSkills.filter(
                                    (s) => s !== skill,
                                  ),
                            })
                          }
                        />
                        {skill}
                      </label>
                    ))}
                  </div>
                  {errorFor("approval.requiredSkills")}
                </fieldset>
                <fieldset
                  {...errorAttributes("approval.dependencies")}
                  className="min-w-0"
                >
                  <legend className="text-sm">Predecessor requests</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {catalogue.dependencies
                      ?.filter((d) => d.planningNight === fields.planningNight)
                      .map((d) => (
                        <label
                          key={d.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={approval.dependencies.includes(d.id)}
                            onChange={(e) =>
                              setApproval({
                                ...approval,
                                dependencies: e.target.checked
                                  ? [...approval.dependencies, d.id]
                                  : approval.dependencies.filter(
                                      (id) => id !== d.id,
                                    ),
                              })
                            }
                          />
                          {d.id} · {d.title}
                        </label>
                      ))}
                  </div>
                  {errorFor("approval.dependencies")}
                </fieldset>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    {...errorAttributes("approval.safetyConfirmed")}
                    className="mt-1"
                    type="checkbox"
                    checked={approval.safetyConfirmed}
                    onChange={(e) =>
                      setApproval({
                        ...approval,
                        safetyConfirmed: e.target.checked,
                      })
                    }
                  />
                  I confirm the configured safety constraints, work class, track
                  blocks and clearance apply to this fabricated request.
                </label>
                {errorFor("approval.safetyConfirmed")}
                <p className="text-xs text-ink-500">
                  Approval admits work for planning; the shared validator still
                  determines whether a schedule is feasible. This prototype is
                  not an operational safety approval.
                </p>
              </fieldset>
            )}
            {selected && (
              <div className="space-y-3 border-t border-rule pt-4">
                <label className="block text-sm">
                  Decision reason
                  <textarea
                    {...errorAttributes("reason", "Decision reason")}
                    className={`${control} mt-1`}
                    maxLength={2000}
                    rows={2}
                    value={reason}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  {errorFor("reason")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {!contractor && selected.status === "submitted" && (
                    <>
                      <button
                        className={button}
                        disabled={
                          busy ||
                          !approval.teamId ||
                          !approval.safetyConfirmed ||
                          !reason.trim()
                        }
                        onClick={() => action("approve")}
                      >
                        Approve request
                      </button>
                      <button
                        className={button}
                        disabled={busy || !reason.trim()}
                        onClick={() => action("needs_info")}
                      >
                        Request information
                      </button>
                      <button
                        className={button}
                        disabled={busy || !reason.trim()}
                        onClick={() => action("reject")}
                      >
                        Reject request
                      </button>
                    </>
                  )}
                  {contractor &&
                    ["approved", "rejected", "cancelled"].includes(
                      selected.status,
                    ) && (
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => action("revise")}
                      >
                        Propose revision
                      </button>
                    )}
                  {!["cancelled", "rejected"].includes(selected.status) && (
                    <button
                      className={button}
                      disabled={busy || !reason.trim()}
                      onClick={() => action("cancel")}
                    >
                      Cancel request
                    </button>
                  )}
                </div>
              </div>
            )}
            {selected && (
              <details className="border-t border-rule pt-4">
                <summary className="cursor-pointer font-semibold">
                  Status and revision history
                </summary>
                <ol className="mt-3 space-y-3">
                  {selected.history.map((event) => (
                    <li key={event.version} className="text-sm">
                      <p className="capitalize">
                        v{event.version} · {event.action} ·{" "}
                        {labelStatus(event.fromStatus ?? "new")} →{" "}
                        {labelStatus(event.toStatus)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {event.createdAt} · Actor {event.actorId}
                      </p>
                      {event.reason && <p>{event.reason}</p>}
                    </li>
                  ))}
                </ol>
                <div className="mt-4 space-y-2">
                  {selected.revisions.map((revision) => (
                    <details
                      key={revision.version}
                      className="border border-rule p-3"
                    >
                      <summary className="cursor-pointer text-sm">
                        Revision {revision.version} ·{" "}
                        {labelStatus(revision.status)}
                      </summary>
                      <p className="mt-2 text-sm">
                        {revision.fields.title} ·{" "}
                        {revision.fields.planningNight}
                      </p>
                      <p className="whitespace-pre-wrap text-sm">
                        {revision.fields.description}
                      </p>
                      <p className="mt-2 text-sm">
                        Work class:{" "}
                        {revision.fields.workClass.replaceAll("-", " ")}.
                        Preferred start: {clock(revision.fields.preferredStart)}
                        .
                      </p>
                      <p className="mt-2 text-sm">
                        Blocks: {revision.fields.blockIds.join(", ") || "none"}.
                        Duration: {revision.fields.durationMinutes} minutes.
                        Permitted: {clock(revision.fields.earliestStart)}–
                        {clock(revision.fields.latestEnd)}.
                      </p>
                      <p className="text-sm">
                        Equipment:{" "}
                        {revision.fields.equipment
                          .map((e) => `${e.equipmentId}: ${e.units}`)
                          .join(", ") || "none"}
                      </p>
                      <p className="text-sm">
                        Workforce:{" "}
                        {revision.fields.workforce
                          .map((w) => `${w.roleId}: ${w.count}`)
                          .join(", ") || "not defined"}
                      </p>
                      {revision.approval && (
                        <div className="space-y-1 text-sm">
                          <p>
                            Team {revision.approval.teamId} ·{" "}
                            {revision.approval.priority} · clearance{" "}
                            {revision.approval.clearanceMinutes} minutes
                          </p>
                          <p>
                            Required skills:{" "}
                            {revision.approval.requiredSkills.join(", ") ||
                              "none"}
                          </p>
                          <p>
                            Dependencies:{" "}
                            {revision.approval.dependencies.join(", ") ||
                              "none"}
                            . Dependency gap:{" "}
                            {revision.approval.dependencyLagMinutes} minutes.
                          </p>
                          <p>
                            Safety confirmed:{" "}
                            {revision.approval.safetyConfirmed ? "yes" : "no"}
                          </p>
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              </details>
            )}
          </div>
        ) : (
          <p className="p-4 text-sm text-ink-500">
            {contractor
              ? "Open a request or create a new draft."
              : "Open a request to review its details and history."}
          </p>
        )}
      </div>
    </section>
  );
}
