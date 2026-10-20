// Restarts shoots whose generation chain broke.
//
// Each photo is made by one request that then calls the next. A server restart
// (every deploy is one) in the middle of a photo ends that chain: the slot sits
// at "generating", nothing calls the next request, and the order freezes. The
// studio page could nudge it, but only if the buyer had it open — and chat
// customers never do. Three orders froze like this in May and July.
//
// Every 5 minutes this finds paid orders that have not moved for 10 minutes
// (in the last 24 hours only), and calls /start on this server, which resets
// a stuck slot and carries on. /start holds a per-shoot lock, so a worker that
// is in fact still running is never doubled. After three restarts without any
// progress the order is left alone and the studio is told on Telegram.
//
//   cd /home/aluxart/app && node --env-file=.env.local scripts/resume-stalled-shoots.mjs [--dry-run]
//   cron: */5 * * * * cd /home/aluxart/app && flock -n /tmp/aluxart-resume.lock /usr/bin/node --env-file=.env.local scripts/resume-stalled-shoots.mjs >> /home/aluxart/resume-stalled.log 2>&1
import fs from "node:fs";
import postgres from "postgres";

const DRY = process.argv.includes("--dry-run");
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const INTERNAL = process.env.INTERNAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3000"}`;
const STATE = process.env.RESUME_STATE_FILE || "/home/aluxart/resume-stalled-state.json";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID;
const MAX_RESTARTS = 3;

const log = (...a) => console.log(new Date().toISOString(), "[resume]", ...a);
async function tellAdmin(text) {
  if (!TG_TOKEN || !TG_ADMIN) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_ADMIN, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}

let state = {};
try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { state = {}; }
// Forget orders older than two days.
for (const [id, s] of Object.entries(state)) if (Date.now() - (s.first ?? 0) > 2 * 864e5) delete state[id];

try {
  const rows = await sql`
    SELECT s.id, s.status, s.owner_email,
      (SELECT count(*)::int FROM shoot_images i WHERE i.shoot_id = s.id AND i.status IN ('QUEUED', 'PENDING')) AS waiting,
      (SELECT count(*)::int FROM shoot_images i WHERE i.shoot_id = s.id AND i.status = 'GENERATING') AS generating,
      (SELECT count(*)::int FROM shoot_images i WHERE i.shoot_id = s.id AND i.status = 'COMPLETE') AS done
    FROM shoots s
    LEFT JOIN templates t ON t.id = COALESCE(s.template_showcase_id, s.template_id)
    WHERE s.status IN ('PROCESSING', 'QUEUED')
      AND s.updated_at < NOW() - interval '10 minutes'
      AND s.updated_at > NOW() - interval '24 hours'
      -- Glow Retouch orders belong to the retouch worker, not to /start.
      AND COALESCE(t.category, '') <> 'photo_retouch'
      AND NOT EXISTS (SELECT 1 FROM shoot_images i WHERE i.shoot_id = s.id
                        AND i.status = 'GENERATING' AND i.updated_at > NOW() - interval '10 minutes')`;

  if (!rows.length) { log("nothing stalled"); }
  for (const r of rows) {
    if (r.waiting === 0 && r.generating === 0) continue; // nothing left to make; the next worker run settles it
    const s = state[r.id] ?? { first: Date.now(), restarts: 0, lastDone: r.done };
    if (r.done > s.lastDone) { s.restarts = 0; s.lastDone = r.done; } // it moved since last time
    if (s.restarts >= MAX_RESTARTS) {
      if (!s.gaveUp) {
        s.gaveUp = true;
        log(`${r.id}: ${MAX_RESTARTS} restarts without progress — leaving it for a person`);
        if (!DRY) await tellAdmin(`🧊 <b>Order ${r.id.slice(0, 8)} is stuck</b> (${r.owner_email ?? "unknown buyer"})\n` +
          `${r.done} photo(s) made, ${r.waiting + r.generating} left. Restarted ${MAX_RESTARTS} times without progress — it needs a look.`);
      }
      state[r.id] = s;
      continue;
    }
    s.restarts += 1;
    state[r.id] = s;
    log(`${r.id}: ${r.status}, ${r.done} done, ${r.waiting} waiting, ${r.generating} stuck — restart ${s.restarts}${DRY ? " (dry run)" : ""}`);
    if (DRY) continue;
    if (s.restarts === 1) {
      await tellAdmin(`🔁 Order ${r.id.slice(0, 8)} had stopped (${r.done} photo(s) made, ${r.waiting + r.generating} left) — restarting it.`);
    }
    const res = await fetch(`${INTERNAL}/api/shoots/${r.id}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "", "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(290_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
    const body = await res.json().catch(() => ({}));
    log(`${r.id}: /start → ${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  }
} finally {
  if (!DRY) { try { fs.writeFileSync(STATE, JSON.stringify(state)); } catch (e) { log("state not saved:", e.message); } }
  await sql.end();
}
