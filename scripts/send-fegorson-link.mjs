// Sends the Fegorson Studio download link to the Instagram people who asked
// @fegorson_studio for it (their last message mentions Evoto / the link / the
// app), once each. Messages older than 24 h go with Instagram's HUMAN_AGENT tag
// (allowed up to 7 days after the person's last message); if Instagram refuses
// the tag, that person is listed for the owner to answer by hand.
//
//   node --env-file=.env.local scripts/send-fegorson-link.mjs            # list who would get it
//   node --env-file=.env.local scripts/send-fegorson-link.mjs --send     # send
//
// Sent ids are kept in instagram-data/fegorson-link-sent.jsonl so a re-run never repeats.
import fs from "node:fs";
import postgres from "postgres";

const ACCOUNT = "17841401081427201"; // @fegorson_studio
const GRAPH = "https://graph.instagram.com/v21.0";
const DATA = process.env.INSTAGRAM_DATA_DIR || "/home/aluxart/instagram-data";
const SENT_LOG = `${DATA}/fegorson-link-sent.jsonl`;
const LINK = "https://aluxartandframes.shop/d/fegorson";
const TEXT = `Hi! Here is the link you asked for 🙂

It is not Evoto itself. It is Fegorson Studio, my own retouching app for Windows: skin, eyes, teeth, body shaping, dodge and burn, frequency separation, studio backdrops and your own colour style, all on your laptop, no subscription.

Free for 7 days, then a one-time ₦20,000 licence. When Windows shows "Windows protected your PC", click More info, then Run anyway.

Tell me what you think!`;

const send = process.argv.includes("--send");
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });

// The token Instagram last renewed first, the pasted one as a spare.
const stored = JSON.parse(fs.readFileSync(`${DATA}/tokens.json`, "utf8"));
const tokens = [stored.fegorson_studio?.token, process.env.IG_FEGORSON_STUDIO_TOKEN].filter((t, i, a) => t && a.indexOf(t) === i);
if (!tokens.length) { console.error("no token for @fegorson_studio"); process.exit(1); }

const sent = new Set(fs.existsSync(SENT_LOG) ? fs.readFileSync(SENT_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).igUserId) : []);

const rows = await sql`
  SELECT ig_user_id, ig_username, last_inbound, last_inbound_at
  FROM instagram_sessions
  WHERE ig_account_id = ${ACCOUNT}
    AND last_inbound_at > now() - interval '7 days'
    AND last_inbound ~* '(evoto|envato|kagan|without subscription|free version|test link|the link|download|install|fegorson|software|app\\M)'
  ORDER BY last_inbound_at`;

const targets = rows.filter((r) => !sent.has(r.ig_user_id));
console.log(`${rows.length} asked in the last 7 days, ${targets.length} not yet sent${send ? "" : " (dry run; add --send)"}`);
for (const r of targets) console.log(`  @${r.ig_username}  ${new Date(r.last_inbound_at).toISOString().slice(0, 16)}  "${String(r.last_inbound).replace(/\s+/g, " ").slice(0, 90)}"`);
if (!send) { await sql.end(); process.exit(0); }

async function post(token, body) {
  const res = await fetch(`${GRAPH}/${ACCOUNT}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, access_token: token }) });
  const data = await res.json().catch(() => ({}));
  return data.error ? { ok: false, error: data.error } : { ok: true, id: data.message_id };
}

const results = [];
for (const r of targets) {
  const ageH = (Date.now() - new Date(r.last_inbound_at).getTime()) / 3.6e6;
  const tagged = ageH > 23 ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {};
  const button = { attachment: { type: "template", payload: { template_type: "button", text: TEXT.slice(0, 640), buttons: [{ type: "web_url", url: LINK, title: "Download for Windows" }] } } };
  const plain = { text: `${TEXT}\n\n${LINK}` };
  let out = null;
  for (const token of tokens) {
    out = await post(token, { recipient: { id: r.ig_user_id }, message: button, ...tagged });
    if (!out.ok && out.error?.code === 190) continue;                 // bad token: try the spare
    if (!out.ok && !/window|24|outside|tag/i.test(JSON.stringify(out.error))) {
      out = await post(token, { recipient: { id: r.ig_user_id }, message: plain, ...tagged }); // buttons refused: plain text
    }
    break;
  }
  const line = { igUserId: r.ig_user_id, username: r.ig_username, tagged: !!tagged.tag, ok: out?.ok ?? false, error: out?.ok ? null : JSON.stringify(out?.error ?? "no token").slice(0, 200), at: new Date().toISOString() };
  results.push(line);
  if (line.ok) fs.appendFileSync(SENT_LOG, JSON.stringify(line) + "\n");
  console.log(`${line.ok ? "SENT " : "FAILED"} @${r.ig_username}${line.tagged ? " (human-agent tag)" : ""}${line.ok ? "" : " — " + line.error}`);
  await new Promise((res) => setTimeout(res, 1200));
}
console.log(`done: ${results.filter((x) => x.ok).length} sent, ${results.filter((x) => !x.ok).length} failed`);
await sql.end();
