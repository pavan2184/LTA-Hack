"use client";

import { useEffect, useId, useState } from "react";
import type { UserRole } from "@railplan/core/types/auth";
import {
  REQUEST_FIELD_KEYS,
  type NullableRequestFields,
  type PrivateDraftDetail,
  type RequestFieldKey,
} from "@railplan/core/types/ingestions";
import type {
  RequestCatalogue,
  RequestSubmission,
} from "@railplan/core/types/requests";
import {
  ProposalEvidence,
  ProposalHistory,
  proposalLabels,
} from "./ProposalEvidence";

const control =
  "mt-1 w-full rounded border border-rule-strong bg-surface p-2 text-sm";
const button =
  "rounded border border-rule-strong px-3 py-2 text-sm hover:bg-sunk disabled:opacity-50";
class DraftError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
async function api<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      url,
      body === undefined
        ? { cache: "no-store" }
        : {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new DraftError(
      "The server could not be reached. Your entries are still here.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new DraftError(
      data?.error?.message ?? "The proposal could not be saved.",
      data?.error?.fieldErrors ?? {},
    );
  if (!data)
    throw new DraftError(
      "The server returned an unreadable response. Your entries are still here.",
    );
  return data;
}
export function PrivateDraftEditor({
  id,
  role,
  onClose,
  onSaved,
  onSubmitted,
}: {
  id: string;
  role: UserRole;
  onClose: () => void;
  onSaved: (draft: PrivateDraftDetail) => void;
  onSubmitted?: (request: RequestSubmission) => void;
}) {
  const [draft, setDraft] = useState<PrivateDraftDetail | null>(null);
  const [fields, setFields] = useState<NullableRequestFields | null>(null);
  const [catalogue, setCatalogue] = useState<RequestCatalogue | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [organisationId, setOrganisationId] = useState("");
  const [equipmentMode, setEquipmentMode] = useState("unknown");
  const prefix = useId();
  function accept(next: PrivateDraftDetail) {
    setDraft(next);
    setFields(next.fields);
    setErrors(next.validationErrors);
    setEquipmentMode(
      next.fields.equipment === null
        ? "unknown"
        : next.fields.equipment.length
          ? "specified"
          : "none",
    );
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ draft: PrivateDraftDetail }>(`/api/ingestions/drafts/${id}`),
      api<{ catalogue: RequestCatalogue }>("/api/requests/catalogue"),
    ])
      .then(([d, c]) => {
        if (!cancelled) {
          accept(d.draft);
          setCatalogue(c.catalogue);
        }
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "The proposal could not be loaded.",
          );
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  const changed =
    draft && fields
      ? REQUEST_FIELD_KEYS.filter(
          (key) =>
            JSON.stringify(fields[key]) !== JSON.stringify(draft.fields[key]),
        )
      : [];
  const equipmentPending =
    equipmentMode === "specified" && !fields?.equipment?.length;
  const dirty = changed.length > 0 || equipmentPending;
  const messages = (key: string) =>
    Object.entries(errors)
      .filter(
        ([path]) =>
          path === key ||
          path === `fields.${key}` ||
          path.startsWith(`${key}.`) ||
          path.startsWith(`fields.${key}.`),
      )
      .map(([, message]) => message);
  const attributes = (key: string, label: string) => ({
    "aria-label": label,
    "aria-invalid": messages(key).length > 0,
    "aria-describedby": messages(key).length ? `${prefix}-${key}` : undefined,
  });
  const fieldError = (key: string) =>
    messages(key).length ? (
      <p id={`${prefix}-${key}`} className="mt-1 text-xs text-signal-red">
        {messages(key).join(" ")}
      </p>
    ) : null;
  function update<K extends RequestFieldKey>(
    key: K,
    value: NullableRequestFields[K],
  ) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
    setNotice("");
  }
  async function mutate(submit: boolean) {
    if (!draft || !fields || !reason.trim() || (submit && dirty)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api<{
        draft: PrivateDraftDetail;
        request?: RequestSubmission;
      }>(
        `/api/ingestions/drafts/${id}${submit ? "/submit" : ""}`,
        submit
          ? {
              expectedVersion: draft.version,
              reason,
              ...(role === "planner" ? { organisationId } : {}),
            }
          : { expectedVersion: draft.version, fields, reason },
        submit ? "POST" : "PATCH",
      );
      accept(data.draft);
      onSaved(data.draft);
      setReason("");
      setNotice(
        submit
          ? "Proposal submitted for human review. It is not approved or scheduled."
          : "Private changes saved.",
      );
      if (submit && data.request) onSubmitted?.(data.request);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The proposal could not be saved.",
      );
      setErrors(cause instanceof DraftError ? cause.fields : {});
    } finally {
      setBusy(false);
    }
  }
  const textInput = (key: "title" | "description") => (
    <label className="block text-sm">
      {proposalLabels[key]}
      {key === "description" ? (
        <textarea
          {...attributes(key, "Proposal description")}
          className={control}
          maxLength={4000}
          rows={3}
          value={fields?.[key] ?? ""}
          onChange={(e) => update(key, e.target.value || null)}
        />
      ) : (
        <input
          {...attributes(key, "Proposal title")}
          className={control}
          maxLength={160}
          value={fields?.[key] ?? ""}
          onChange={(e) => update(key, e.target.value || null)}
        />
      )}
      {fieldError(key)}
    </label>
  );
  return (
    <section
      aria-label="Private proposal editor"
      className="min-w-0 space-y-4 break-words border-2 border-accent bg-surface p-4 [overflow-wrap:anywhere]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">
          {draft?.status === "submitted"
            ? "Submitted proposal"
            : "Edit private proposal"}
        </h3>
        <button className={button} disabled={busy || dirty} onClick={onClose}>
          Close proposal
        </button>
      </header>
      {busy && <p role="status">Loading or saving proposal…</p>}
      {error && (
        <div role="alert" className="border border-signal-red p-3 text-sm">
          <p>{error}</p>
          <ul>
            {Object.entries(errors).map(([key, message]) => (
              <li key={key}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {draft && fields && catalogue && (
        <>
          <p className="text-sm">
            Version {draft.version} ·{" "}
            {draft.status === "private"
              ? "Visible only to you until you submit."
              : "Shared with the organisation and planners."}
          </p>
          {draft.status === "private" && (
            <>
              <p className="text-sm">
                Leave unknown facts blank. Times are minutes after midnight on
                the planning night. Private saves may be incomplete; submission
                requires complete, valid fields.
              </p>
              {Object.keys(draft.validationErrors).length > 0 && (
                <p className="text-sm">
                  Saved proposal needs information:{" "}
                  {Object.values(draft.validationErrors).join(" ")}
                </p>
              )}
              <fieldset disabled={busy} className="min-w-0 space-y-4">
                {textInput("title")}
                {textInput("description")}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm">
                    Planning night
                    <select
                      {...attributes(
                        "planningNight",
                        "Proposal planning night",
                      )}
                      className={control}
                      value={fields.planningNight ?? ""}
                      onChange={(e) =>
                        update("planningNight", e.target.value || null)
                      }
                    >
                      <option value="">Unknown</option>
                      {catalogue.nights.map((night) => (
                        <option key={night.planningNight}>
                          {night.planningNight}
                        </option>
                      ))}
                    </select>
                    {fieldError("planningNight")}
                  </label>
                  <label className="text-sm">
                    Work class
                    <select
                      {...attributes("workClass", "Proposal work class")}
                      className={control}
                      value={fields.workClass ?? ""}
                      onChange={(e) =>
                        update(
                          "workClass",
                          (e.target.value ||
                            null) as NullableRequestFields["workClass"],
                        )
                      }
                    >
                      <option value="">Unknown</option>
                      {catalogue.workClasses.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("-", " ")}
                        </option>
                      ))}
                    </select>
                    {fieldError("workClass")}
                  </label>
                  {(
                    [
                      "durationMinutes",
                      "preferredStart",
                      "earliestStart",
                      "latestEnd",
                    ] as const
                  ).map((key) => (
                    <label key={key} className="text-sm">
                      {proposalLabels[key]} (minutes)
                      <input
                        {...attributes(
                          key,
                          `Proposal ${key === "durationMinutes" ? "duration" : proposalLabels[key].toLowerCase()} (minutes)`,
                        )}
                        type="number"
                        step={1}
                        min={key === "durationMinutes" ? 1 : 0}
                        max={key === "durationMinutes" ? 1440 : 2880}
                        className={control}
                        value={fields[key] ?? ""}
                        onChange={(e) =>
                          update(
                            key,
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                      />
                      {fieldError(key)}
                    </label>
                  ))}
                </div>
                <fieldset className="space-y-2">
                  <legend>Track blocks</legend>
                  <label className="block text-sm">
                    Block information
                    <select
                      {...attributes("blockIds", "Block information")}
                      className={control}
                      value={fields.blockIds === null ? "unknown" : "specified"}
                      onChange={(e) =>
                        update(
                          "blockIds",
                          e.target.value === "unknown" ? null : [],
                        )
                      }
                    >
                      <option value="unknown">Unknown</option>
                      <option value="specified">Select blocks</option>
                    </select>
                  </label>
                  {fields.blockIds !== null &&
                    catalogue.blocks.map((block) => (
                      <label
                        key={block.id}
                        className="mr-3 inline-flex gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={fields.blockIds!.includes(block.id)}
                          onChange={(e) =>
                            update(
                              "blockIds",
                              e.target.checked
                                ? [...fields.blockIds!, block.id]
                                : fields.blockIds!.filter(
                                    (id) => id !== block.id,
                                  ),
                            )
                          }
                        />
                        {block.label}
                      </label>
                    ))}
                  {fieldError("blockIds")}
                </fieldset>
                <fieldset className="space-y-2">
                  <legend>Equipment</legend>
                  <label className="block text-sm">
                    Equipment information
                    <select
                      {...attributes("equipment", "Equipment information")}
                      className={control}
                      value={equipmentMode}
                      onChange={(e) => {
                        setEquipmentMode(e.target.value);
                        update(
                          "equipment",
                          e.target.value === "unknown" ? null : [],
                        );
                      }}
                    >
                      <option value="unknown">Unknown</option>
                      <option value="none">No equipment required</option>
                      <option value="specified">
                        Specify equipment quantities
                      </option>
                    </select>
                  </label>
                  {equipmentMode === "specified" &&
                    catalogue.equipment.map((equipment) => (
                      <label key={equipment.id} className="block text-sm">
                        {equipment.name} units
                        <input
                          type="number"
                          min={1}
                          max={equipment.capacity}
                          step={1}
                          className={control}
                          value={
                            fields.equipment?.find(
                              (r) => r.equipmentId === equipment.id,
                            )?.units ?? ""
                          }
                          onChange={(e) =>
                            update("equipment", [
                              ...(fields.equipment ?? []).filter(
                                (r) => r.equipmentId !== equipment.id,
                              ),
                              ...(e.target.value
                                ? [
                                    {
                                      equipmentId: equipment.id,
                                      units: Number(e.target.value),
                                    },
                                  ]
                                : []),
                            ])
                          }
                        />
                      </label>
                    ))}
                  {equipmentMode === "specified" &&
                    !fields.equipment?.length && (
                      <p className="text-xs">
                        Enter at least one quantity, or choose No equipment
                        required.
                      </p>
                    )}
                  {fieldError("equipment")}
                </fieldset>
                <fieldset className="space-y-2">
                  <legend>Workforce demand</legend>
                  <label className="block text-sm">
                    Workforce information
                    <select
                      {...attributes("workforce", "Workforce information")}
                      className={control}
                      value={
                        fields.workforce === null ? "unknown" : "specified"
                      }
                      onChange={(e) =>
                        update(
                          "workforce",
                          e.target.value === "unknown" ? null : [],
                        )
                      }
                    >
                      <option value="unknown">Unknown</option>
                      <option value="specified">Specify people by role</option>
                    </select>
                  </label>
                  {fields.workforce !== null &&
                    catalogue.roles.map((role) => (
                      <label key={role.id} className="block text-sm">
                        {role.name} people
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          step={1}
                          className={control}
                          value={
                            fields.workforce?.find((r) => r.roleId === role.id)
                              ?.count ?? ""
                          }
                          onChange={(e) =>
                            update("workforce", [
                              ...(fields.workforce ?? []).filter(
                                (r) => r.roleId !== role.id,
                              ),
                              ...(e.target.value
                                ? [
                                    {
                                      roleId: role.id,
                                      count: Number(e.target.value),
                                    },
                                  ]
                                : []),
                            ])
                          }
                        />
                      </label>
                    ))}
                  {fieldError("workforce")}
                </fieldset>
                {dirty && (
                  <p className="text-sm">
                    Unsaved manual changes:{" "}
                    {[
                      ...new Set([
                        ...changed.map((key) => proposalLabels[key]),
                        ...(equipmentPending ? ["Equipment"] : []),
                      ]),
                    ].join(", ")}
                    . Save before submitting.
                  </p>
                )}
                <label className="block text-sm">
                  Proposal decision reason
                  <textarea
                    {...attributes("reason", "Proposal decision reason")}
                    className={control}
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  {fieldError("reason")}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={button}
                    disabled={
                      !reason.trim() ||
                      !dirty ||
                      (equipmentMode === "specified" &&
                        !fields.equipment?.length)
                    }
                    onClick={() => mutate(false)}
                  >
                    Save private changes
                  </button>
                  <button
                    className={button}
                    disabled={!dirty}
                    onClick={() => {
                      accept(draft);
                      setError("");
                      setNotice("");
                    }}
                  >
                    Discard unsaved changes
                  </button>
                </div>
                <div className="space-y-3 border-t border-rule pt-3">
                  <p className="text-sm">
                    Submitting shares these fields, retained evidence and all
                    saved proposal revisions with the organisation and planners.
                    A planner must separately review and approve the request.
                  </p>
                  {role === "planner" && (
                    <label className="block text-sm">
                      Submission organisation
                      <select
                        {...attributes(
                          "organisationId",
                          "Submission organisation",
                        )}
                        className={control}
                        value={organisationId}
                        onChange={(e) => setOrganisationId(e.target.value)}
                      >
                        <option value="">Choose an organisation</option>
                        {catalogue.organisations?.map((org) => (
                          <option value={org.id} key={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                      {fieldError("organisationId")}
                    </label>
                  )}
                  <button
                    className={button}
                    disabled={
                      dirty ||
                      !reason.trim() ||
                      (role === "planner" &&
                        !catalogue.organisations?.some(
                          (org) => org.id === organisationId,
                        ))
                    }
                    onClick={() => mutate(true)}
                  >
                    Submit proposal for review
                  </button>
                </div>
              </fieldset>
            </>
          )}
          {draft.submittedRequestId && (
            <p className="text-sm">
              <a href="#request-intake" className="underline">
                Submitted request: {draft.submittedRequestId}. Open it in the
                request list above.
              </a>
            </p>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Current field provenance
            </summary>
            <ProposalEvidence
              proposal={{ ...draft, fields }}
              manualFields={[...new Set([...draft.manualFields, ...changed])]}
            />
          </details>
          <ProposalHistory revisions={draft.revisions} />
        </>
      )}
    </section>
  );
}
