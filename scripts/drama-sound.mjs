#!/usr/bin/env node
/**
 * Drama episode soundtracks, made automatically before each episode posts
 * (owner, 2026-10-22: "automated … I don't have to do anything … no room for errors").
 *
 *   root cron, every 10 minutes → /home/aluxart/drama-sound.sh → node --env-file=.env.local scripts/drama-sound.mjs
 *
 * Each run takes at most ONE queued drama episode due in the next 30 hours that
 * has no soundtrack yet, and:
 *   1. writes its 30-second sound script from the episode (tools/drama/sound/writer.mjs;
 *      a hand-written tools/drama/sound/<slug>-ep<n>.mjs for the same title wins),
 *      checked by hard rules;
 *   2. makes, checks and mixes the sound and the cover video (tools/drama/sound/engine.mjs);
 *   3. only if EVERY check passed, sets scheduled_carousels.cover_video_path — the
 *      publisher then posts slide 1 as that video. Anything else and the episode
 *      posts silent, as before, and the owner gets one Telegram line saying why.
 *
 * Switch: app_config drama_sound = 'on' (attach), 'preview' (make it after the vote
 * and send the owner the link, but post silent — owner, 2026-10-22: the new sound
 * must pass their listen first), anything else = off. Sound is only ever made for
 * an episode the vote has already chosen (a queued post), never for both versions.
 * Caps: one episode per run, 8 per 24 h,
 * and the engine's own per-episode call caps. --fake (test databases only)
 * makes every sound with ffmpeg instead of the paid models.
 */
import postgres from "postgres";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeSound } from "../tools/drama/sound/engine.mjs";
import { writeScript, checkScript, toScript } from "../tools/drama/sound/writer.mjs";
import { resolveVoices } from "../tools/drama/sound/cast.mjs";
import { designMissing, missingVoices } from "../tools/drama/sound/design.mjs";

const FAKE = process.argv.includes("--fake");
const DAILY_MAX = 8;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const log = (...a) => console.log(new Date().toISOString(), "[drama-sound]", ...a);
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function tellAdmin(text) {
  if (!TG_TOKEN || !TG_ADMIN) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_ADMIN, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}
const lagos = (d) => new Date(d).toLocaleString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", hour: "2-digit", minute: "2-digit" });

async function main() {
  if (FAKE && !/_test|test_|fixtest|runagain|soundtest/.test(String(process.env.DATABASE_URL))) {
    throw new Error("--fake runs only against a test database");
  }
  const [cfg] = await sql`SELECT value FROM app_config WHERE key = 'drama_sound'`;
  const MODE = cfg?.value;
  if (MODE !== "on" && MODE !== "preview") { log("switched off (app_config drama_sound)"); return; }
  const [{ n: today }] = await sql`SELECT count(*)::int AS n FROM drama_sound WHERE created_at > now() - interval '24 hours'`;
  if (today >= DAILY_MAX) { log(`daily cap reached (${today})`); return; }

  // The next queued episode with time to spare and no soundtrack yet.
  const [due] = await sql`
    SELECT c.id AS carousel_id, c.slide_paths, c.scheduled_for, e.id AS episode_id, e.n, e.content,
           s.id AS story_id, s.slug, s.title, s.genre, s.city, s.logline, s.content AS story_content
    FROM scheduled_carousels c
    JOIN drama_episodes e ON c.local_id = 'drama-' || e.id::text
    JOIN drama_stories s ON s.id = e.story_id
    LEFT JOIN drama_sound d ON d.episode_id = e.id
    WHERE c.status = 'queued' AND c.cover_video_path IS NULL AND d.episode_id IS NULL
      AND c.scheduled_for > now() + interval '20 minutes' AND c.scheduled_for < now() + interval '30 hours'
    ORDER BY c.scheduled_for LIMIT 1`;
  if (!due) { log("nothing due"); return; }
  const [claimed] = await sql`INSERT INTO drama_sound (episode_id, status) VALUES (${due.episode_id}, 'making') ON CONFLICT DO NOTHING RETURNING episode_id`;
  if (!claimed) { log("already taken"); return; }

  const story = { slug: due.slug, title: due.title, genre: due.genre, city: due.city, logline: due.logline, cast: due.story_content?.cast ?? [] };
  const episode = due.content;
  const name = `${due.title} Ep ${episode.n ?? due.n}`;
  log(`making the soundtrack for ${name} (posts ${new Date(due.scheduled_for).toISOString()})`);
  const finish = async (status, fields = {}) => {
    await sql`UPDATE drama_sound SET status = ${status}, script = ${fields.script ? sql.json(fields.script) : null},
      report = ${fields.report ? sql.json(fields.report) : null}, video_path = ${fields.video ?? null},
      problems = ${fields.problems ?? null}, usd = ${fields.usd ?? 0}, updated_at = now()
      WHERE episode_id = ${due.episode_id}`;
  };

  try {
    // 0. The cover picture must be there before anything is spent.
    const coverKey = due.slide_paths?.[0];
    const s3 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
    const coverThere = coverKey && await s3.send(new HeadObjectCommand({ Bucket: "generated-4k", Key: coverKey })).then(() => true, () => false);
    if (!coverThere) {
      await finish("failed", { problems: [`the cover slide is missing: ${coverKey ?? "none"}`] });
      await tellAdmin(`🔇 <b>${esc(name)}</b> will post without sound — its cover slide could not be found.`);
      return;
    }

    // 1. The voices (standard or designed Nigerian ones), then the script: a
    // hand-written one for this very episode wins, if it passes the rules.
    // A fan who recorded their voice plays their role with it (lib/drama/voice.ts); the
    // story's designed voices are made here if any is still missing.
    let voices;
    try {
      const fans = await sql`SELECT role_key, voice_id FROM drama_cast WHERE story_id = ${due.story_id} AND voice_id IS NOT NULL AND status IN ('sheet_ready', 'accepted', 'approved')`;
      const overrides = Object.fromEntries(fans.map((f) => [f.role_key, f.voice_id]));
      const missing = missingVoices(due.slug).filter((r) => !overrides[r]);
      if (missing.length && !FAKE) {
        log(`designing voices for ${due.slug}: ${missing.join(", ")}`);
        const made = await designMissing(due.slug, { log, only: missing });
        if (made.length) await tellAdmin(`🎙 <b>${esc(due.title)}</b> — ${made.length} voice(s) designed by the sound job: ${esc(made.map((m) => `${m.role} (${m.heard?.accent ?? "accent unknown"})`).join(", "))}.`);
      }
      voices = resolveVoices(due.slug, overrides);
    } catch (e) {
      await finish("failed", { problems: [String(e.message)] });
      await tellAdmin(`🔇 <b>${esc(name)}</b> will post without sound — ${esc(e.message)}`);
      return;
    }
    let script = null, problems = [];
    const hand = path.join(HERE, "..", "tools", "drama", "sound", `${due.slug}-ep${episode.n ?? due.n}.mjs`);
    if (existsSync(hand)) {
      const h = (await import(pathToFileURL(hand).href)).default;
      if (h.title === episode.title) {
        const s = toScript(h, { story, episode, voices });
        const p = checkScript(s, { episode, cast: story.cast, story });
        if (!p.length) { script = s; log("using the hand-written script"); }
        else log(`hand-written script set aside: ${p.join(" | ")}`);
      }
    }
    if (!script) ({ script, problems } = await writeScript({ story, episode, voices, fake: FAKE, log }));
    if (!script) {
      await finish("failed", { problems });
      await tellAdmin(`🔇 <b>${esc(name)}</b> will post without sound — the sound script could not be written.\n${esc(problems.slice(0, 4).join("; "))}`);
      return;
    }

    // 2. Make, check, mix, and the cover video next to the episode's slides.
    const outBase = `${path.posix.dirname(coverKey)}/sound`;
    const res = await makeSound(script, { coverKey, outBase, fake: FAKE, log: (m) => log(m) });

    // 3. Only a soundtrack that passed everything goes on the post.
    if (!res.ok) {
      await finish("failed", { script, report: res.report, problems: res.problems, usd: res.report.usd });
      await tellAdmin(`🔇 <b>${esc(name)}</b> will post without sound (it posts ${esc(lagos(due.scheduled_for))} as usual).\nWhy: ${esc(res.problems.slice(0, 3).join("; "))}`);
      return;
    }
    const s = res.report.supervisor ?? {};
    if (MODE === "preview") {
      // Made after the vote, for the owner's ear only: the post goes out silent.
      await finish("skipped", { script, report: res.report, video: res.keys.video, problems: ["preview only — not attached to the post"], usd: res.report.usd });
      await tellAdmin(`🎧 <b>${esc(name)}</b> — the NEW soundtrack (preview, not on the post; it posts ${esc(lagos(due.scheduled_for))} silent).\nRelease check ${esc(s.overall ?? "?")}/10. About $${res.report.usd}.\n<a href="${res.keys.preview}">Hear it</a>`);
      log(`preview made: ${res.keys.video}`);
      return;
    }
    const attached = await sql`
      UPDATE scheduled_carousels SET cover_video_path = ${res.keys.video}, updated_at = now()
      WHERE id = ${due.carousel_id} AND status = 'queued' AND cover_video_path IS NULL RETURNING id`;
    if (!attached.length) {
      await finish("skipped", { script, report: res.report, video: res.keys.video, problems: ["the post changed or went out while the sound was being made"], usd: res.report.usd });
      log("the post changed meanwhile: soundtrack not attached");
      return;
    }
    await finish("ready", { script, report: res.report, video: res.keys.video, usd: res.report.usd });
    await tellAdmin(`🔊 <b>${esc(name)}</b> has its soundtrack — it posts ${esc(lagos(due.scheduled_for))} with the sound on the cover.\nRelease check ${esc(s.overall ?? "?")}/10. About $${res.report.usd}.\n<a href="${res.keys.preview}">Hear it</a>`);
    log(`ready: ${res.keys.video}`);
  } catch (e) {
    await finish("failed", { problems: [String(e.message).slice(0, 400)] }).catch(() => {});
    await tellAdmin(`🔇 <b>${esc(name)}</b> will post without sound — the sound job stopped: ${esc(String(e.message).slice(0, 200))}`);
    throw e;
  }
}

main()
  .catch((e) => { log(`STOPPED: ${e.message}`); process.exitCode = 1; })
  .finally(() => sql.end());
