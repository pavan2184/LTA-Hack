/**
 * Deterministic input digest.
 *
 * FNV-1a, not SHA-256. It is a non-cryptographic hash and is labelled as such
 * wherever it is displayed — its only job is to let a planner confirm that two
 * runs saw identical inputs, and to make it obvious when they did not. Two
 * passes in opposite directions widen it to 64 bits, which is ample for
 * spotting a changed input and useless for anything adversarial.
 */
export function digest(value: unknown): string {
  const text = stableStringify(value);
  return `fnv1a:${fnv(text, 0x811c9dc5, false)}${fnv(text, 0xcbf29ce4, true)}`;
}

function fnv(text: string, seed: number, reverse: boolean): string {
  let hash = seed >>> 0;
  for (let step = 0; step < text.length; step += 1) {
    const index = reverse ? text.length - 1 - step : step;
    hash ^= text.charCodeAt(index);
    // 32-bit FNV prime, via imul so the multiply stays in 32 bits.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** JSON.stringify with sorted object keys, so key order cannot change the hash. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
