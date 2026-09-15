import type { PlanExport } from "@railplan/core/types/exports";
import { comparePlans } from "@/lib/plans/comparison";

export function PlanComparison({ base, target }: { base: PlanExport; target: PlanExport }) {
  if (base.provenance.planningNight !== target.provenance.planningNight) return <p role="alert">Choose two versions of the same engineering night.</p>;
  const comparison = comparePlans(base, target);
  return <section className="space-y-4" aria-label="Saved version comparison">
    <h2 className="text-lg font-semibold">Saved version comparison</h2>
    <p className="break-all text-sm">{base.provenance.planId} → {target.provenance.planId} · {base.provenance.planningNight}</p>
    <p className="text-sm text-ink-700">Changes are target minus baseline, using immutable saved facts. Added and removed describe schedule membership as well as requests entering or leaving the saved inputs. Times are minutes from midnight. This comparison does not establish feasibility.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Saved metric differences</caption><thead><tr><th>Metric</th><th>Baseline</th><th>Target</th><th>Change</th></tr></thead><tbody>{comparison.metrics.map((metric) => <tr key={metric.key} className="border-t border-rule"><th className="py-2 font-normal">{metric.label} ({metric.unit})</th><td>{metric.before}</td><td>{metric.after}</td><td>{metric.delta > 0 ? "+" : ""}{Number(metric.delta.toFixed(3))}{metric.unit === "percent" ? " pp" : ""}</td></tr>)}</tbody></table></div>
    <h3 className="font-semibold">Request differences ({comparison.changes.length})</h3>
    {!comparison.changes.length ? <p className="text-sm">No request or placement differences.</p> : <ul className="space-y-3">{comparison.changes.map((change) => <li key={change.requestId} className="rounded border border-rule p-3 text-sm"><p className="font-medium">{change.requestId} · {change.title}</p><p className="capitalize">{change.kinds.join(" · ")}</p><p>Baseline: {change.before}</p><p>Target: {change.after}</p>{change.changedFacts.length > 0 && <p>Revised saved fields: {change.changedFacts.join(", ")}</p>}</li>)}</ul>}
  </section>;
}
