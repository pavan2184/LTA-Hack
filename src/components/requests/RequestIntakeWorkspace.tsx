"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { UserRole } from "@railplan/core/types/auth";
import type {
  RequestApproval,
  RequestCatalogue,
  RequestFields,
  RequestSubmission,
} from "@railplan/core/types/requests";

import { ProposalEvidence, ProposalHistory } from "./ProposalEvidence";
import { useUnsavedChanges, writeSelection } from "@/lib/navigation/useUnsavedChanges";
import { ClockTimeField, readableTime } from "./ClockTimeField";
import { RequestStatusSummary } from "./RequestStatusSummary";

type ApprovalForm = Omit<RequestApproval, "safetyConfirmed"> & {
  safetyConfirmed: boolean;
};
const control =
  "w-full rounded border border-rule-strong bg-surface px-3 py-2 text-sm disabled:bg-sunk disabled:text-ink-700";
const button =
  "planner-button";
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
function emptyFields(catalogue: RequestCatalogue, planningNight?: string): RequestFields {
  const night = planningNight ? catalogue.nights.find((n) => n.planningNight === planningNight) : catalogue.nights[0];
  return {
    planningNight: night?.planningNight ?? planningNight ?? "",
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

type RequestIntakeProps = {
  role: UserRole;
  incomingRequests?: RequestSubmission[];
  planningNight?: string;
  selectedRequestId?: string;
};
export function RequestIntakeWorkspace(props: RequestIntakeProps) {
  return <RequestIntakeContent key={props.planningNight ?? "all"} {...props} />;
}
function RequestIntakeContent({
  role,
  incomingRequests = [],
  planningNight,
  selectedRequestId,
}: RequestIntakeProps) {
  const [catalogue, setCatalogue] = useState<RequestCatalogue | null>(null);
  const [requests, setRequests] = useState<RequestSubmission[]>([]);
  const newerIncoming = incomingRequests.filter(
    (incoming) =>
      !requests.some(
        (row) => row.id === incoming.id && row.version >= incoming.version,
      ),
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [nightFilter, setNightFilter] = useState("");
  const [organisationFilter, setOrganisationFilter] = useState("");
  const loadedRequests = [
    ...newerIncoming,
    ...requests.filter(
      (row) => !newerIncoming.some((incoming) => incoming.id === row.id),
    ),
  ].filter((row) => !planningNight || row.fields.planningNight === planningNight);
  const visibleRequests = loadedRequests.filter((row) =>
    (statusFilter === "all" || (statusFilter === "action"
      ? (role === "contractor" ? ["draft", "needs_info"].includes(row.status) : row.status === "submitted")
      : row.status === statusFilter)) &&
    (!nightFilter || row.fields.planningNight === nightFilter) &&
    (!organisationFilter || row.organisationId === organisationFilter) &&
    [row.id, row.fields.title, row.organisationName, ...row.fields.blockIds].join(" ").toLowerCase().includes(search.trim().toLowerCase()),
  );
  const [selected, setSelected] = useState<RequestSubmission | null>(null);
  const [fields, setFields] = useState<RequestFields | null>(null);
  const [approval, setApproval] = useState<ApprovalForm>(initialApproval);
  const [reason, setReason] = useState("");
  const [dependenciesReviewed, setDependenciesReviewed] = useState(false);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [organisationId, setOrganisationId] = useState("");
  const [working, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const busy = working || loading;
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const contractor = role === "contractor";
  const baseline = useRef("");
  const requestEpoch = useRef(0);
  const dirty = fields !== null && JSON.stringify({ fields, approval, reason, organisationId }) !== baseline.current;
  const mayLeave = useUnsavedChanges(dirty || mutating || dependenciesReviewed || publicationConfirmed);
  const listUrl = planningNight ? `/api/requests?planningNight=${encodeURIComponent(planningNight)}` : "/api/requests";
  const editable =
    (!selected || ["draft", "needs_info"].includes(selected.status));
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
      api<{ requests: RequestSubmission[] }>(listUrl),
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listUrl]);
  function select(request: RequestSubmission) {
    baseline.current = JSON.stringify({ fields: request.fields, approval: request.approval ?? initialApproval, reason: "", organisationId: request.organisationId });
    setOrganisationId(request.organisationId);
    setSelected(request);
    setFields(request.fields);
    setApproval(request.approval ?? initialApproval);
    setReason("");
    setDependenciesReviewed(false); setPublicationConfirmed(false);
    writeSelection("request", request.id);
  }
  function startNew(c: RequestCatalogue) {
    const nextFields = emptyFields(c, planningNight);
    baseline.current = JSON.stringify({ fields: nextFields, approval: initialApproval, reason: "", organisationId: "" });
    setSelected(null);
    setFields(nextFields);
    setOrganisationId("");
    setApproval(initialApproval);
    setReason("");
    setDependenciesReviewed(false); setPublicationConfirmed(false);
    setError("");
    setFieldErrors({});
    setNotice("");
    writeSelection("request", "new");
  }
  useEffect(() => {
    let cancelled = false;
    const load = (id: string | null) => {
      const epoch = ++requestEpoch.current;
      setMutating(false);
      if (!id) { setSelected(null); setFields(null); setBusy(false); return; }
      setBusy(true);
      if (id === "new") {
        api<{ catalogue: RequestCatalogue }>("/api/requests/catalogue")
          .then(({ catalogue: c }) => { if (!cancelled && epoch === requestEpoch.current) startNew(c); })
          .catch((cause) => { if (!cancelled && epoch === requestEpoch.current) { setSelected(null); setFields(null); report(cause); } })
          .finally(() => { if (!cancelled && epoch === requestEpoch.current) setBusy(false); });
        return;
      }
      api<{ request: RequestSubmission }>(`/api/requests/${encodeURIComponent(id)}`)
        .then(({ request }) => { if (!cancelled && epoch === requestEpoch.current) select(request); })
        .catch((cause) => { if (!cancelled && epoch === requestEpoch.current) { setSelected(null); setFields(null); report(cause); } })
        .finally(() => { if (!cancelled && epoch === requestEpoch.current) setBusy(false); });
    };
    load(selectedRequestId ?? null);
    const pop = () => load(new URLSearchParams(window.location.search).get("request"));
    window.addEventListener("popstate", pop);
    return () => { cancelled = true; window.removeEventListener("popstate", pop); };
  // startNew uses only the night context; form edits must not rerun selection loading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequestId, planningNight]);
  function accept(request: RequestSubmission) {
    setRequests((current) => [
      request,
      ...current.filter((row) => row.id !== request.id),
    ]);
    select(request);
  }
  async function perform(work: () => Promise<void>, mutation = true) {
    const epoch = requestEpoch.current;
    setBusy(true);
    setMutating(mutation);
    setError("");
    setFieldErrors({});
    setNotice("");
    try {
      await work();
    } catch (cause) {
      if (epoch === requestEpoch.current) report(cause);
    } finally {
      if (epoch === requestEpoch.current) { setBusy(false); setMutating(false); }
    }
  }
  async function open(id: string) {
    if (!mayLeave()) return;
    const epoch = ++requestEpoch.current;
    await perform(async () => {
      const data = await api<{ request: RequestSubmission }>(
        `/api/requests/${encodeURIComponent(id)}`,
      );
      if (epoch === requestEpoch.current) select(data.request);
    }, false);
  }
  async function refresh() {
    if (!mayLeave()) return;
    const epoch = ++requestEpoch.current;
    await perform(async () => {
      const [c, r] = await Promise.all([
        api<{ catalogue: RequestCatalogue }>("/api/requests/catalogue"),
        api<{ requests: RequestSubmission[] }>(listUrl),
      ]);
      if (epoch !== requestEpoch.current) return;
      setCatalogue(c.catalogue);
      setRequests(r.requests);
      const id = selected?.id ?? selectedRequestId ?? new URLSearchParams(window.location.search).get("request");
      if (id === "new") startNew(c.catalogue);
      else if (id) {
        const data = await api<{ request: RequestSubmission }>(`/api/requests/${encodeURIComponent(id)}`);
        if (epoch === requestEpoch.current) select(data.request);
      }
    }, false);
  }
  async function save(): Promise<RequestSubmission> {
    if (!contractor && !selected && !organisationId)
      throw new IntakeError("Choose a contractor organisation.", { organisationId: "Choose a contractor organisation." });
    const missingTimes = Object.fromEntries(
      (["preferredStart", "earliestStart", "latestEnd"] as const)
        .filter((key) => !Number.isFinite(fields?.[key]))
        .map((key) => [key, "Enter a clock time before saving."]),
    );
    if (Object.keys(missingTimes).length) throw new IntakeError("Enter a clock time for each required time field.", missingTimes);
    const epoch = requestEpoch.current;
    const data = await api<{ request: RequestSubmission }>(
      selected ? `/api/requests/${selected.id}` : "/api/requests",
      selected ? { expectedVersion: selected.version, fields } : { fields, ...(!contractor ? { organisationId } : {}) },
      selected ? "PATCH" : "POST",
    );
    if (epoch === requestEpoch.current) accept(data.request);
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
    const epoch = requestEpoch.current;
    await perform(async () => {
      // Submitting includes the current form, so unsaved corrections cannot be lost.
      const current = action === "submit" && editable ? await save() : selected;
      if (!current) throw new IntakeError("Save a draft first.");
      const carry = action === "approve" && !current.activeApprovedRevision && current.carryForward?.requiresReview !== false ? current.carryForward : null;
      if (carry && (!dependenciesReviewed || (carry.publication && !publicationConfirmed)))
        throw new IntakeError("Review target-night dependencies and confirm any published-source retirement before approval.");
      const data = await api<{ request: RequestSubmission }>(
        `/api/requests/${current.id}/actions`,
        {
          expectedVersion: current.version,
          action,
          reason,
          ...(action === "approve" ? { approval } : {}),
          ...(carry ? { carryForward: { expectedWorkVersion: carry.expectedWorkVersion, dependenciesReviewed: true, ...(carry.publication ? { publication: carry.publication } : {}) } } : {}),
        },
      );
      if (epoch === requestEpoch.current) {
        accept(data.request);
        setNotice(`Request is now ${labelStatus(data.request.status)}.`);
      }
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
      {planningNight && <p className="text-sm">Requests for engineering night {planningNight}. <Link className="underline" href="/requests">Clear night filter</Link></p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-700">
          {contractor
            ? "Propose maintenance work for your organisation. A planner reviews scheduling and safety fields before approval."
            : "Create work for a contractor organisation or review submitted requests. Only approval adds a revision to planning inputs; saving or submitting does not schedule work."}
        </p>
        <div className="flex gap-2">
          <button className={button} disabled={busy} onClick={refresh}>
            Refresh requests
          </button>
          {(
            <button
              className={button}
              disabled={busy || !catalogue?.nights.length}
              onClick={() => {
                if (!mayLeave()) return;
                ++requestEpoch.current;
                startNew(catalogue!);
              }}
            >
              New request
            </button>
          )}
        </div>
      </div>
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
      {notice && (
        <p role="status" className="text-sm text-signal-green">
          {notice}
        </p>
      )}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside aria-label="Your requests" className="min-w-0 space-y-2">
          <label className="block text-sm">Search request inbox
            <input type="search" className={control} value={search} placeholder="Title, ID, block or organisation" onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label className="block text-sm">Request status
            <select className={control} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option><option value="action">Needs your action</option>
              <option value="submitted">Awaiting review</option><option value="needs_info">Changes requested</option>
              <option value="draft">Draft</option><option value="approved">Approved</option>
              <option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
            </select>
          </label>
          {!planningNight && <label className="block text-sm">Filter by night
            <select className={control} value={nightFilter} onChange={(event) => setNightFilter(event.target.value)}>
              <option value="">All loaded nights</option>
              {[...new Set(loadedRequests.map((row) => row.fields.planningNight))].sort().map((night) => <option key={night}>{night}</option>)}
            </select>
          </label>}
          {!contractor && <label className="block text-sm">Filter by organisation
            <select className={control} value={organisationFilter} onChange={(event) => setOrganisationFilter(event.target.value)}>
              <option value="">All loaded organisations</option>
              {[...new Map(loadedRequests.map((row) => [row.organisationId, row.organisationName])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>}
          <p className="text-xs text-ink-500" aria-live="polite">Showing {visibleRequests.length} of {loadedRequests.length} loaded requests. The inbox loads up to 100 recent records.</p>
          {(search || statusFilter !== "all" || nightFilter || organisationFilter) && <button className={button} onClick={() => { setSearch(""); setStatusFilter("all"); setNightFilter(""); setOrganisationFilter(""); }}>Clear filters</button>}
          {!busy && !visibleRequests.length && (
            <p className="text-sm text-ink-500">{loadedRequests.length ? "No requests match these filters." : "No requests yet."}</p>
          )}
          {visibleRequests.map((request) => (
            <button
              key={request.id}
              className={`w-full min-w-0 break-words [overflow-wrap:anywhere] border p-3 text-left text-sm ${selected?.id === request.id ? "border-accent bg-sunk" : "border-rule bg-surface"}`}
              disabled={busy}
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
              {selected && <RequestStatusSummary request={selected} role={role} />}
              {selected && !visibleRequests.some((row) => row.id === selected.id) && <p className="text-sm text-ink-500">The selected request is outside this inbox view. Its details and any edits remain open.</p>}
            </header>
            <fieldset
              disabled={busy || !editable}
              className="min-w-0 space-y-4"
            >
              <legend className="mb-3 font-semibold">Proposed work</legend>
              {!contractor && !selected && <label className="block text-sm">
                Contractor organisation
                <select {...errorAttributes("organisationId", "Contractor organisation")} className={`${control} mt-1`} value={organisationId} onChange={(event) => setOrganisationId(event.target.value)}>
                  <option value="">Choose an organisation</option>
                  {catalogue.organisations?.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
                {errorFor("organisationId")}
                <span className="mt-1 block text-xs text-ink-500">Saved drafts are shared with this organisation. Submit for review, then approve before scheduling.</span>
              </label>}
              {selected && <p className="text-sm">Contractor organisation: {selected.organisationName}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  Planning night
                  <select
                    {...errorAttributes("planningNight", "Planning night")}
                    className={`${control} mt-1`}
                    value={fields.planningNight}
                    onChange={(e) => field("planningNight", e.target.value)}
                  >
                    {!catalogue.nights.some((n) => n.planningNight === fields.planningNight) && <option value={fields.planningNight}>{fields.planningNight} · unavailable</option>}
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
                Enter clock times (HH:MM) relative to planning date {fields.planningNight} in SGT.
                Choose “Next day” only when the time falls after that date.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {([ ["Preferred start", "preferredStart"], ["Earliest start", "earliestStart"], ["Latest end", "latestEnd"] ] as const).map(([label, key]) => <div key={key}>
                  <ClockTimeField label={label} value={fields[key]} onChange={(value) => field(key, value ?? Number.NaN)} invalid={errorsFor(key).length > 0} describedBy={errorsFor(key).length ? errorId(key) : undefined} />
                  {errorFor(key)}
                </div>)}
              </div>
              <p className="text-sm text-ink-700">Preferred {readableTime(fields.preferredStart)}–{readableTime(fields.preferredStart + fields.durationMinutes)} · Flexible between {readableTime(fields.earliestStart)} and {readableTime(fields.latestEnd)}.</p>
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
                  className={`${button} primary`}
                  disabled={busy}
                  onClick={() => action("submit")}
                >
                  Submit for review
                </button>
              </div>
            )}
            {selected?.carryForward && <section className="space-y-3 border-t border-rule pt-4" aria-label="Carry-forward review">
              <h3 className="font-semibold">Carry-forward review</h3>
              <p>Linked work from {selected.carryForward.sourceNight} for review on {selected.carryForward.targetNight}. Approval and publication are separate steps.</p>
              {!contractor && <>
                <p>Original dependencies require a target-night decision. Remove or replace incompatible references using the normal planner fields below.</p>
                {selected.carryForward.originalDependencies?.length ? <ul>{selected.carryForward.originalDependencies.map(id => <li key={id}>{id}</li>)}</ul> : <p>No original dependencies.</p>}
                {selected.status === "submitted" && !selected.activeApprovedRevision && selected.carryForward.requiresReview !== false && <>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={dependenciesReviewed} onChange={event => setDependenciesReviewed(event.target.checked)} />I reviewed and resolved target-night dependencies</label>
                  {selected.carryForward.publication && <>
                    <p>This approval retires work in published plan <a className="planner-link" href={`/plans?plan=${selected.carryForward.publication.planId}`}>{selected.carryForward.publication.planId}</a>{selected.carryForward.publication.submissionRevision ? `, request revision ${selected.carryForward.publication.submissionRevision}` : " (operator-seeded version)"}. Historical plan facts remain unchanged.</p>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={publicationConfirmed} onChange={event => setPublicationConfirmed(event.target.checked)} />I confirm retirement of this exact published source</label>
                  </>}
                </>}
              </>}
            </section>}
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
                        className={`${button} primary`}
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
