/**
 * Provisional per-instance rate limit.
 *
 * **This is not a complete answer and is not pretended to be one.** The bucket
 * lives in the memory of one server instance, so on any host that runs more
 * than one it limits per instance rather than per client, and it resets on a
 * cold start. It is here because it meaningfully blunts a flood against a warm
 * instance, and because the bounds in `schemas.ts` — not this file — are what
 * removed the CPU amplification that made a flood dangerous in the first place.
 *
 * It is replaced by a Postgres token bucket keyed on the authenticated user in
 * Phase 2, once there is a shared datastore and an identity to key on.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const BUCKETS = new Map<string, Bucket>();

/** Requests allowed in a burst. */
const CAPACITY = 12;
/** Sustained rate, in requests per minute, once the burst is spent. */
const REFILL_PER_MINUTE = 12;
/** Buckets untouched for this long are dropped, so the map cannot grow without bound. */
const IDLE_EVICTION_MS = 10 * 60 * 1000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait, for the Retry-After header. */
  retryAfterSeconds: number;
  remaining: number;
}

export function consume(key: string, now: number = Date.now()): RateLimitResult {
  evictIdle(now);

  const bucket = BUCKETS.get(key) ?? { tokens: CAPACITY, updatedAt: now };
  const elapsedMinutes = Math.max(0, now - bucket.updatedAt) / 60_000;
  const tokens = Math.min(CAPACITY, bucket.tokens + elapsedMinutes * REFILL_PER_MINUTE);

  if (tokens < 1) {
    BUCKETS.set(key, { tokens, updatedAt: now });
    const secondsToOneToken = ((1 - tokens) / REFILL_PER_MINUTE) * 60;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(secondsToOneToken)),
      remaining: 0,
    };
  }

  const next = { tokens: tokens - 1, updatedAt: now };
  BUCKETS.set(key, next);
  return { allowed: true, retryAfterSeconds: 0, remaining: Math.floor(next.tokens) };
}

/**
 * Best-effort client identity.
 *
 * Proxy headers are attacker-controlled unless the host is known to overwrite
 * them, so this is a throttle key, never an identity. Phase 2 keys on the
 * authenticated user instead.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

function evictIdle(now: number): void {
  for (const [key, bucket] of BUCKETS) {
    if (now - bucket.updatedAt > IDLE_EVICTION_MS) BUCKETS.delete(key);
  }
}

/** Test seam. Not used by the route. */
export function resetRateLimits(): void {
  BUCKETS.clear();
}
