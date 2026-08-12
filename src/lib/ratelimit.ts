/**
 * Per-IP token bucket held in module memory.
 *
 * This is deliberately the simple version: on serverless it limits per warm
 * instance rather than globally, which blunts casual abuse but is not a real
 * quota. Swap the two map operations for Upstash Redis when this stops being
 * a demo — the call signature is meant to survive that change unchanged.
 */

type Bucket = { tokens: number; last: number };

const buckets = new Map<string, Bucket>();

const CAPACITY = 20; // burst
const REFILL_PER_MS = 20 / (60 * 60 * 1000); // 20 messages/hour sustained

export function takeToken(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: CAPACITY, last: now };

  b.tokens = Math.min(CAPACITY, b.tokens + (now - b.last) * REFILL_PER_MS);
  b.last = now;

  if (b.tokens < 1) {
    buckets.set(ip, b);
    return { ok: false, retryAfter: Math.ceil((1 - b.tokens) / REFILL_PER_MS / 1000) };
  }

  b.tokens -= 1;
  buckets.set(ip, b);

  // Keep the map from growing without bound on a long-lived instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now - v.last > 2 * 60 * 60 * 1000) buckets.delete(k);
    }
  }

  return { ok: true, retryAfter: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
