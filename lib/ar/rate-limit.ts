/**
 * A sliding-window counter in memory. PM2 runs the site as one process, so
 * one map is the whole picture; a restart simply forgets, which is fine for
 * what this guards (event counts, not money).
 */
const buckets = new Map<string, number[]>();
let sweepAt = 0;

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (now > sweepAt) {
    sweepAt = now + windowMs;
    for (const [k, v] of buckets) {
      const keep = v.filter((t) => now - t < windowMs);
      if (keep.length) buckets.set(k, keep); else buckets.delete(k);
    }
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) { buckets.set(key, hits); return false; }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
