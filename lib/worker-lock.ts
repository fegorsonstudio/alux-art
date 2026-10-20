import sql from "@/lib/db";

/**
 * One generation worker per shoot at a time.
 *
 * Several things can start a worker on the same shoot within seconds of each
 * other: the payment webhook, the buyer's "verify payment" button, the studio
 * page reopening mid-shoot, a per-image retry and the stalled-shoot restarter.
 * Without this they each ran the paid setup (identity analysis, the brief) and
 * could write two different briefs into one shoot, so outfits drifted between
 * slots. The slot claim in lib/generate.ts already stops two workers making the
 * SAME image; this stops two workers running at all.
 *
 * A Postgres advisory lock on a reserved connection: if the process dies the
 * connection closes and the lock goes with it, so a crash can never leave a
 * shoot locked forever.
 */
export async function withShootLock<T>(
  shootId: string,
  fn: () => Promise<T>,
): Promise<{ locked: true; value: T } | { locked: false }> {
  const conn = await sql.reserve();
  try {
    const [row] = await conn<{ ok: boolean }[]>`
      SELECT pg_try_advisory_lock(hashtextextended(${shootId}, 0)) AS ok`;
    if (!row?.ok) return { locked: false };
    try {
      return { locked: true, value: await fn() };
    } finally {
      await conn`SELECT pg_advisory_unlock(hashtextextended(${shootId}, 0))`.catch(() => {});
    }
  } finally {
    conn.release();
  }
}
