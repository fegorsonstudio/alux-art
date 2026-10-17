#!/usr/bin/env node
/**
 * Bounty Run stage 2, the server rules, against the live app on this box:
 *
 *   node --env-file=.env.local scripts/test-bounty.mjs [campaign id]
 *
 * Takes the newest campaign (or the one given), makes sure it has prizes,
 * then: start a hunt → a finish that is too fast is refused → start again →
 * a plausible finish wins the next prize → finishing the same hunt twice is
 * refused → the leaderboard shows the win. Leaves the hunts in the table
 * (they are real test hunts) and the prize it claimed as claimed.
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const BASE = process.env.AR_TEST_BASE || "http://127.0.0.1:3000";
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY2345679";
const code = () => { let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; return `${s.slice(0, 4)}-${s.slice(4)}`; };

const main = async () => {
  const id = process.argv[2];
  const [c] = id
    ? await sql`SELECT * FROM ar_campaigns WHERE id = ${id}`
    : await sql`SELECT * FROM ar_campaigns WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`;
  if (!c) throw new Error("no campaign");
  const [p] = await sql`SELECT count(*)::int AS n FROM race_prizes WHERE campaign_id = ${c.id}`;
  if (p.n === 0) {
    await sql`UPDATE ar_campaigns SET prize_label = 'Test prize: ₦1,000 off' WHERE id = ${c.id} AND prize_label = ''`;
    const rows = Array.from({ length: 10 }, () => ({ campaign_id: c.id, code: code(), label: "Test prize: ₦1,000 off" }));
    await sql`INSERT INTO race_prizes ${sql(rows)}`;
    console.log("added 10 test prizes");
  }
  const post = async (path, body) => { const r = await fetch(`${BASE}/api/race/${c.token}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

  // 1. start (poll while the tile is being fetched)
  let s;
  for (let i = 0; i < 40; i++) { s = await post("start", { player: "Test hunter" }); if (s.status !== 202) break; await new Promise((r) => setTimeout(r, 5000)); }
  console.log("start:", s.status, JSON.stringify(s.json).slice(0, 200));
  if (s.status !== 200) throw new Error("start failed");
  const routeM = s.json.routeM;

  // 2. too fast
  const fast = await post("finish", { raceId: s.json.raceId, elapsedMs: Math.round(routeM / 70 * 1000 * 0.5) });
  console.log("too fast:", fast.status, fast.json.error ?? JSON.stringify(fast.json));
  if (fast.status !== 409) throw new Error("a too-fast finish was accepted");

  // 3. a real one
  const s2 = await post("start", { player: "Test hunter" });
  console.log("start 2:", s2.status, "route", Math.round(s2.json.routeM), "m");
  // The server also refuses a clock that runs ahead of its own, so wait for
  // (almost) the fastest possible time before claiming it.
  const ms = Math.round(s2.json.routeM / 70 * 1000) + 800;
  await new Promise((r) => setTimeout(r, Math.max(0, ms - 12_000)));
  const fin = await post("finish", { raceId: s2.json.raceId, elapsedMs: ms });
  console.log("finish:", fin.status, JSON.stringify(fin.json));
  if (fin.status !== 200 || !fin.json.prize) throw new Error("a plausible finish did not win a prize");

  // 4. twice
  const again = await post("finish", { raceId: s2.json.raceId, elapsedMs: ms + 1000 });
  console.log("again:", again.status, again.json.error ?? JSON.stringify(again.json));
  if (again.status !== 409) throw new Error("finishing twice was accepted");

  // 5. the board
  const lb = await fetch(`${BASE}/api/race/${c.token}/leaderboard`).then((r) => r.json());
  console.log("board:", JSON.stringify(lb).slice(0, 300));
  const [claimed] = await sql`SELECT count(*)::int AS n FROM race_prizes WHERE campaign_id = ${c.id} AND claimed_at IS NOT NULL`;
  console.log("prizes claimed in db:", claimed.n, "code won:", fin.json.prize.code);
  console.log(`\nrace link  https://aluxartandframes.shop/d/race/${c.token}`);
  await sql.end();
};

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
