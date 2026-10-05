#!/usr/bin/env node
/**
 * The carousel studio — runs on this laptop, needs nothing but Node.
 *
 *   node tools/carousel/server.mjs
 *   then open http://localhost:4300
 *
 * It builds the slides locally with sharp, keeps everything in a folder you can
 * see, and hands finished posts to the VPS to publish on schedule. Nothing here
 * calls an AI or needs a subscription: the renderer is the same arithmetic the
 * GIF compositor uses, and the design is the deck the account already posts.
 *
 * The queue is a JSON file, on purpose. A database would be one more thing to
 * install and one more thing to lose; a file can be opened, read, edited and
 * backed up by the person whose business it is.
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { textCard, photoCard, pairCard } from "./slides.mjs";
import { PLAN, scheduleFor } from "./plan.mjs";
import { PLAN2 } from "./plan-newyear.mjs";
// The microdrama experiment. Loaded and removed on its own buttons, never by
// "Load the plan", so dropping it touches nothing in the main 88.
import { PLAN3, BATCH as EXPERIMENT } from "./plan-microdrama.mjs";

// The twenty-two weeks as one list. Kept in two files because they were
// written for two different seasons — plan.mjs runs to 20 December and
// ends on Christmas; plan-newyear.mjs carries Boxing Day to Mothering
// Sunday — but the queue and the importer only ever see one plan.
const ALL = [...PLAN, ...PLAN2];
/** Week 1 of the main plan. Its dated posts are only right from here. */
const MAIN_PLAN_START = "2026-10-05";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");
const OUT = join(DATA, "posts");
const QUEUE = join(DATA, "queue.json");
const PORT = Number(process.env.CAROUSEL_PORT ?? 4300);

await mkdir(OUT, { recursive: true });

const loadQueue = async () => {
  try { return JSON.parse(await readFile(QUEUE, "utf8")); } catch { return []; }
};
const saveQueue = (q) => writeFile(QUEUE, JSON.stringify(q, null, 2));

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    // Before/after uploads arrive as base64 inside the JSON, so the ceiling has
    // to clear several full-size photographs at once.
    if (size > 120 * 1024 * 1024) { reject(new Error("too large")); req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
    catch (e) { reject(e); }
  });
  req.on("error", reject);
});

/**
 * A rendered slide, and nothing else in a post's folder: 01.jpg to 99.jpg.
 *
 * The folder also holds source-before.jpg and source-after.jpg — the
 * originals — and a filter on ".jpg" alone sent them to Instagram as two extra
 * slides at the end of the carousel.
 */
const SLIDE_FILE = /^\d{2}\.jpg$/;

/**
 * A post's time as an exact instant, in Lagos time.
 *
 * The app stores wall-clock times without a zone ("2026-10-05T19:00"), and the
 * server that publishes runs on UTC — so a time sent bare was read as 19:00
 * UTC, which is 20:00 in Lagos, and every post would have gone out an hour
 * late. Lagos is UTC+1 all year, with no daylight saving to get wrong.
 */
const lagosInstant = (s) =>
  /([zZ]|[+-]\d\d:\d\d)$/.test(String(s)) ? String(s) : `${String(s).slice(0, 16)}:00+01:00`;

/**
 * A date in the shape the date box in the page uses: local wall-clock time, no
 * zone. Lagos is UTC+1 all year; lagosInstant() adds the zone at the one point
 * a time leaves this laptop.
 */
const localStamp = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const dataUrlToBuffer = (s) => {
  const m = /^data:[^;]+;base64,(.+)$/.exec(String(s ?? ""));
  return m ? Buffer.from(m[1], "base64") : null;
};

/**
 * Build every slide of a post.
 *
 * Slide order is not the author's choice. A relight or phone-to-studio post
 * opens on the before and the after, because slide one is the thumbnail and a
 * text card there is what separated a 20,907-reach post from a 102-reach one.
 */
async function renderPost(post) {
  const slides = [];
  const before = dataUrlToBuffer(post.beforeImage);
  const after = dataUrlToBuffer(post.afterImage);
  const cards = (post.cards ?? []).filter((c) => (c.headline ?? "").trim());
  const total = cards.length;

  if (before) slides.push(await photoCard({ file: before, pill: "Before" }));
  if (after) slides.push(await photoCard({ file: after, pill: "After" }));

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const common = { index: i + 1, total, site: post.site };
    if (i === 0 && before && after) {
      slides.push(await pairCard({ before, after, headline: c.headline, body: c.body, ...common }));
    } else {
      slides.push(await textCard({
        eyebrow: c.eyebrow, headline: c.headline, body: c.body,
        cta: i === cards.length - 1 ? (post.buttonText || null) : null,
        ...common,
      }));
    }
  }
  return slides;
}

const routes = {
  async "POST /api/preview"(req, res) {
    const post = await readBody(req);
    const slides = await renderPost(post);
    json(res, 200, { slides: slides.map((b) => `data:image/jpeg;base64,${b.toString("base64")}`) });
  },

  async "POST /api/save"(req, res) {
    const post = await readBody(req);
    if (!post.title?.trim()) return json(res, 400, { error: "Give the post a name so you can find it again." });

    const slides = await renderPost(post);
    if (slides.length === 0) return json(res, 400, { error: "Nothing to save — add a photo or a card first." });

    const id = post.id || `${Date.now()}`;
    const dir = join(OUT, id);
    await mkdir(dir, { recursive: true });
    // Clear the previous render first. A post re-saved with fewer slides left
    // its old 08.jpg behind, and the scheduler sends every numbered slide in the
    // folder — so a cut slide would still have gone out on Instagram.
    for (const f of await readdir(dir)) {
      if (SLIDE_FILE.test(f)) await rm(join(dir, f), { force: true });
    }
    for (let i = 0; i < slides.length; i++) {
      await writeFile(join(dir, `${String(i + 1).padStart(2, "0")}.jpg`), slides[i]);
    }
    await writeFile(join(dir, "caption.txt"), post.caption ?? "");

    // The originals go beside the slides as real files, and the record keeps
    // their names. Writing the photographs INTO post.json as base64 made it
    // 28MB for one post — a month of those is gigabytes of text nobody can
    // open, to store pictures twice.
    const sources = {};
    for (const [key, name] of [["beforeImage", "source-before.jpg"], ["afterImage", "source-after.jpg"]]) {
      const buf = dataUrlToBuffer(post[key]);
      if (buf) { await writeFile(join(dir, name), buf); sources[key] = name; }
    }
    await writeFile(join(dir, "post.json"),
      JSON.stringify({ ...post, beforeImage: sources.beforeImage ?? null,
                       afterImage: sources.afterImage ?? null,
                       // Once a post has been saved by hand, its date is the
                       // owner's and a later re-import of the plan leaves it
                       // alone.
                       scheduledForEdited: Boolean(post.scheduledFor) }, null, 2));

    const queue = await loadQueue();
    const row = {
      id, title: post.title, scheduledFor: post.scheduledFor || null,
      account: post.account || "fegorson_studio",
      slides: slides.length, caption: post.caption ?? "",
      // A post with no photographs is not ready, however finished the words
      // are: slide one is the thumbnail, and a text card there is the
      // difference between 20,907 people and 102. Saying so in the queue is
      // how the owner can see at a glance which of the twelve weeks still
      // needs pictures.
      status: (sources.beforeImage && sources.afterImage) ? "draft" : "needs-photos",
      photos: post.photos ?? null,
      folder: dir, createdAt: new Date().toISOString(),
    };
    const at = queue.findIndex((q) => q.id === id);
    if (at >= 0) queue[at] = { ...queue[at], ...row }; else queue.push(row);
    await saveQueue(queue);
    json(res, 200, { id, folder: dir, slides: slides.length });
  },

  async "GET /api/queue"(_req, res) {
    json(res, 200, { queue: await loadQueue() });
  },

  /**
   * Load the twelve weeks of written posts into the queue as drafts.
   *
   * The words come from plan.mjs; the photographs do not exist yet and cannot,
   * because they are the owner's own before-and-afters. So each post lands with
   * its cards, its caption and its date already set, and sits at
   * `needs-photos` until two pictures are dropped on it.
   *
   * Safe to run more than once. Each post keeps a fixed id, so a second import
   * refreshes the words in place instead of making a second copy of every
   * post — and it deliberately never overwrites photographs that have already
   * been attached, which is what makes it safe to re-run after an edit.
   */
  async "POST /api/import"(req, res) {
    const { startMonday, account, batch } = await readBody(req);
    // The main plan is a calendar, not a list. Its Christmas Day, New Year's
    // Day, Valentine's and Mothering Sunday posts — and the weeks leading up to
    // each — were written for the exact days they land on from 5 October, so a
    // later start would post "Merry Christmas" on New Year's Day. Only the
    // experiment, which has no holidays in it, takes a start date.
    const start = new Date(`${batch === EXPERIMENT ? startMonday : MAIN_PLAN_START}T00:00:00`);
    if (Number.isNaN(start.getTime())) return json(res, 400, { error: "Pick the Monday the experiment should start on." });
    // The experiment's slides name the next episode's day ("Ep 2 on
    // Wednesday"), which is only true when its week starts on a Monday.
    if (batch === EXPERIMENT && start.getDay() !== 1) {
      return json(res, 400, { error: "The experiment has to start on a Monday — its episodes say which day the next one comes out." });
    }

    const posts = batch === EXPERIMENT ? PLAN3 : ALL;
    const queue = await loadQueue();
    let added = 0, refreshed = 0;

    for (const p of posts) {
      const id = `plan-${p.id}`;
      const dir = join(OUT, id);
      await mkdir(dir, { recursive: true });

      const existing = JSON.parse(await readFile(join(dir, "post.json"), "utf8").catch(() => "null"));
      const when = scheduleFor(start, p.week, p.slot);
      // The experiment posts at lunchtime, so it never lands on the main
      // plan's 19:00 slot on the same day.
      if (p.hour != null) when.setHours(p.hour, 0, 0, 0);

      const post = {
        id, title: `${p.id.toUpperCase()} ${p.title}`,
        account: account || existing?.account || "fegorson_studio",
        cards: p.cards,
        caption: p.caption,
        buttonText: existing?.buttonText ?? "aluxartandframes.shop",
        // The date is recomputed on every import so moving the start Monday
        // moves the whole plan, and a post whose date was changed by hand in
        // the app keeps that change.
        scheduledFor: existing?.scheduledForEdited ? existing.scheduledFor : localStamp(when),
        // Kept so the app can tell the owner which photographs this one wants.
        photos: p.photos, product: p.product, trigger: p.trigger,
        week: p.week, slot: p.slot, batch: p.batch ?? "main",
        // Never clobber pictures already attached.
        beforeImage: existing?.beforeImage ?? null,
        afterImage: existing?.afterImage ?? null,
      };
      await writeFile(join(dir, "post.json"), JSON.stringify(post, null, 2));
      await writeFile(join(dir, "caption.txt"), post.caption);

      const row = {
        id, title: post.title, scheduledFor: post.scheduledFor,
        account: post.account, caption: post.caption,
        slides: 0, status: "needs-photos", photos: p.photos,
        batch: p.batch ?? "main",
        folder: dir, createdAt: new Date().toISOString(),
      };
      const at = queue.findIndex((q) => q.id === id);
      if (at >= 0) {
        // An already-finished post keeps its rendered slide count and status.
        queue[at] = { ...queue[at], ...row, slides: queue[at].slides || 0, status: queue[at].status };
        refreshed++;
      } else { queue.push(row); added++; }
    }

    await saveQueue(queue);
    json(res, 200, { added, refreshed, total: posts.length });
  },

  /**
   * Drop the microdrama experiment: every draft, every folder, and every
   * episode already handed to the server.
   *
   * The server goes first. If an episode was already scheduled and the server
   * cannot be told to withdraw it, NOTHING is removed here: a post that
   * vanished from this list while it still went out on Instagram would be worse
   * than a button that refused. Episodes the server reports as already
   * published come back by name, because Instagram's API cannot delete them —
   * those have to come down by hand.
   *
   * Identified by the batch tag, and by the `plan-m` id as a fallback, since a
   * row saved before the tag existed would otherwise be left behind.
   */
  async "POST /api/remove-batch"(req, res) {
    const { batch } = await readBody(req);
    if (batch !== EXPERIMENT) return json(res, 400, { error: "Only the microdrama experiment can be removed this way." });

    const queue = await loadQueue();
    const isExperiment = (q) => q.batch === EXPERIMENT || /^plan-m\d+$/.test(String(q.id));
    const mine = queue.filter(isExperiment);
    if (mine.length === 0) return json(res, 200, { removed: 0, cancelled: 0, live: [] });

    const sent = mine.filter((q) => q.status === "scheduled").map((q) => q.id);
    let cancelled = [], live = [];
    if (sent.length) {
      const site = process.env.CAROUSEL_SITE ?? "https://aluxartandframes.shop";
      const secret = process.env.INTERNAL_API_SECRET;
      if (!secret) {
        return json(res, 400, {
          error: `${sent.length} of these are already on the server, and this app was started without ` +
                 "the server password, so it cannot withdraw them. Nothing was removed. " +
                 "Start the app with start-carousel.cmd and try again.",
        });
      }
      try {
        const r = await fetch(`${site}/api/carousel/schedule`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", "x-internal-secret": secret },
          body: JSON.stringify({ localIds: sent }),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          return json(res, 502, { error: `The server would not withdraw them (${body.error ?? r.status}). Nothing was removed.` });
        }
        cancelled = body.cancelled ?? [];
        live = body.live ?? [];
      } catch (e) {
        return json(res, 502, { error: `Could not reach the server, so nothing was removed: ${String(e).slice(0, 120)}` });
      }
    }

    for (const q of mine) await rm(join(OUT, String(q.id)), { recursive: true, force: true });
    await saveQueue(queue.filter((q) => !isExperiment(q)));
    json(res, 200, { removed: mine.length, cancelled: cancelled.length, live });
  },

  async "POST /api/open"(req, res) {
    const { id } = await readBody(req);
    const dir = join(OUT, String(id));
    if (!existsSync(dir)) return json(res, 404, { error: "Not found" });
    const files = (await readdir(dir)).filter((f) => SLIDE_FILE.test(f)).sort();
    const post = JSON.parse(await readFile(join(dir, "post.json"), "utf8").catch(() => "{}"));
    // Turn the stored file names back into something the page can display.
    for (const key of ["beforeImage", "afterImage"]) {
      if (typeof post[key] === "string" && !post[key].startsWith("data:")) {
        const buf = await readFile(join(dir, post[key])).catch(() => null);
        post[key] = buf ? `data:image/jpeg;base64,${buf.toString("base64")}` : null;
      }
    }
    json(res, 200, { post, files });
  },

  /**
   * Hand the post to the VPS, which publishes it on time whether or not this
   * laptop is awake. The slides travel as base64 because the server cannot
   * reach a folder on a laptop.
   */
  async "POST /api/schedule"(req, res) {
    const { id } = await readBody(req);
    const dir = join(OUT, String(id));
    if (!existsSync(dir)) return json(res, 404, { error: "Save the post first." });

    const queue = await loadQueue();
    const row = queue.find((q) => q.id === String(id));
    if (!row) return json(res, 404, { error: "Not in the queue." });
    if (!row.scheduledFor) return json(res, 400, { error: "Set a date and time first." });
    // The server publishes anything whose time has come on its next run, so a
    // post sent with a date already behind it goes out within minutes. That is
    // never what "schedule" means.
    if (new Date(lagosInstant(row.scheduledFor)).getTime() < Date.now()) {
      return json(res, 400, {
        error: "This post's date has already passed, so the server would publish it the moment it arrived. " +
               "Give it a new date, press Save, then schedule it.",
      });
    }
    // An imported post has a folder and a date before it has a single slide in
    // it, so without this the server would happily accept a carousel of
    // nothing.
    if (!row.slides) {
      return json(res, 400, {
        error: "This one has no slides yet — add the before and after photos, then press Save.",
      });
    }

    const site = process.env.CAROUSEL_SITE ?? "https://aluxartandframes.shop";
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      return json(res, 400, {
        error: "INTERNAL_API_SECRET is not set, so the server will not accept the post. " +
               "Start the app with it, or use Save and post by hand.",
      });
    }

    const files = (await readdir(dir)).filter((f) => SLIDE_FILE.test(f)).sort();
    const images = [];
    for (const f of files) images.push((await readFile(join(dir, f))).toString("base64"));

    try {
      const r = await fetch(`${site}/api/carousel/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify({
          localId: row.id, account: row.account, caption: row.caption,
          scheduledFor: lagosInstant(row.scheduledFor), images,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return json(res, 502, { error: body.error ?? `Server said ${r.status}` });

      row.status = "scheduled";
      row.remoteId = body.id ?? null;
      await saveQueue(queue);
      json(res, 200, { ok: true, remoteId: row.remoteId });
    } catch (e) {
      json(res, 502, { error: `Could not reach the server: ${String(e).slice(0, 120)}` });
    }
  },
};

const server = createServer(async (req, res) => {
  const key = `${req.method} ${req.url.split("?")[0]}`;
  try {
    if (routes[key]) return await routes[key](req, res);
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const html = await readFile(join(HERE, "ui.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    res.writeHead(404); res.end("Not found");
  } catch (e) {
    console.error(e);
    json(res, 500, { error: String(e).slice(0, 300) });
  }
});

/**
 * The browser is opened from here, once the port is actually accepting.
 *
 * The launcher used to open it on the line before it started Node, so the
 * browser always arrived a second or two early and showed "this site can't be
 * reached" — which looks exactly like a broken app. Opening it from the listen
 * callback cannot lose that race.
 */
function openBrowser(url) {
  if (process.env.CAROUSEL_NO_OPEN) return;
  const [cmd, args] = process.platform === "win32"
    ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(cmd, args, { detached: true, stdio: "ignore" }).unref(); }
  catch { /* no browser is not a reason to stop the server */ }
}

server.on("error", (e) => {
  // Said in words rather than as a stack trace: the person reading this window
  // is the owner of the business, not a developer, and the fix is one sentence.
  if (e.code === "EADDRINUSE") {
    console.error(`\n  Carousel Studio is ALREADY RUNNING on port ${PORT}.`);
    console.error(`\n  Open it here:  http://localhost:${PORT}`);
    console.error(`\n  If that page does not work, close the other black Carousel`);
    console.error(`  window that is still open, then start this one again.\n`);
  } else {
    console.error(`\n  Could not start: ${e.message}\n`);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Carousel studio  ->  ${url}`);
  console.log(`  Posts are saved in  ${OUT}`);
  console.log(`  ${process.env.INTERNAL_API_SECRET ? "Scheduling to the server is ON" : "Scheduling is OFF (no INTERNAL_API_SECRET) — Save still works"}`);
  console.log(`\n  Opening your browser. Leave this window open while you work.\n`);
  openBrowser(url);
});
