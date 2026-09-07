import {
  REQUEST_FIELD_KEYS,
  type DraftProposal,
  type NullableRequestFields,
  type PrivateDraftRevision,
  type RequestFieldKey,
} from "@railplan/core/types/ingestions";

export const proposalLabels: Record<RequestFieldKey, string> = {
  planningNight: "Planning night",
  title: "Title",
  description: "Description",
  workClass: "Work class",
  blockIds: "Track blocks",
  durationMinutes: "Duration",
  preferredStart: "Preferred start",
  earliestStart: "Earliest start",
  latestEnd: "Latest end",
  equipment: "Equipment",
  workforce: "Workforce",
};
function valueLabel(
  key: RequestFieldKey,
  value: NullableRequestFields[RequestFieldKey],
): string {
  if (value === null) return "Needs information";
  if (Array.isArray(value))
    return (
      value
        .map((v) =>
          typeof v === "string"
            ? v
            : "equipmentId" in v
              ? `${v.equipmentId}: ${v.units} units`
              : `${v.roleId}: ${v.count} people`,
        )
        .join(", ") || "None explicitly stated"
    );
  if (typeof value === "number")
    return `${value} minutes${key === "durationMinutes" ? "" : " after midnight"}`;
  return value;
}
export function ProposalEvidence({
  proposal,
  manualFields = [],
}: {
  proposal: Pick<DraftProposal, "fields" | "confidence" | "evidence">;
  manualFields?: RequestFieldKey[];
}) {
  return (
    <dl className="grid gap-3 md:grid-cols-2">
      {REQUEST_FIELD_KEYS.map((key) => (
        <div key={key} className="min-w-0 rounded border border-rule p-3">
          <dt className="text-sm font-semibold">{proposalLabels[key]}</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm">
            {valueLabel(key, proposal.fields[key])}
          </dd>
          {manualFields.includes(key) ? (
            <dd className="mt-1 text-xs text-ink-700">
              Manual · human supplied
            </dd>
          ) : (
            proposal.fields[key] !== null &&
            proposal.confidence[key] != null && (
              <dd className="mt-1 text-xs text-ink-500">
                {Math.round(proposal.confidence[key]! * 100)}% confidence ·
                model estimate
              </dd>
            )
          )}
          {!manualFields.includes(key) &&
            proposal.evidence
              .filter((e) => e.field === key)
              .map((e, index) => (
                <dd key={index} className="mt-2">
                  <blockquote className="border-l-2 border-accent pl-2 text-sm">
                    {e.quote}
                  </blockquote>
                  {e.timestamp && (
                    <p className="mt-1 text-xs text-ink-500">
                      Transcript timestamp: {e.timestamp}
                    </p>
                  )}
                </dd>
              ))}
        </div>
      ))}
    </dl>
  );
}
export function ProposalHistory({
  revisions,
}: {
  revisions: PrivateDraftRevision[];
}) {
  return (
    <fieldset className="min-w-0 space-y-3 border-t border-rule pt-3">
      <legend className="text-sm font-semibold">
        Saved proposal revisions
      </legend>
      {revisions.map((revision) => (
        <details
          key={revision.version}
          className="min-w-0 rounded border border-rule p-3"
        >
          <summary className="cursor-pointer text-sm">
            Revision {revision.version} · {revision.action} · {revision.status}
          </summary>
          <p className="my-2 whitespace-pre-wrap text-xs">
            {revision.createdAt} · Actor {revision.actorId} · {revision.reason}
          </p>
          <p className="mb-2 text-xs">
            Model: {revision.model} · Extractor: {revision.extractorVersion}
          </p>
          <ProposalEvidence
            proposal={revision}
            manualFields={revision.manualFields}
          />
        </details>
      ))}
    </fieldset>
  );
}
