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
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { textCard, photoCard, pairCard } from "./slides.mjs";

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
                       afterImage: sources.afterImage ?? null }, null, 2));

    const queue = await loadQueue();
    const row = {
      id, title: post.title, scheduledFor: post.scheduledFor || null,
      account: post.account || "fegorson_studio",
      slides: slides.length, caption: post.caption ?? "",
      status: "draft", folder: dir, createdAt: new Date().toISOString(),
    };
    const at = queue.findIndex((q) => q.id === id);
    if (at >= 0) queue[at] = { ...queue[at], ...row }; else queue.push(row);
    await saveQueue(queue);
    json(res, 200, { id, folder: dir, slides: slides.length });
  },

  async "GET /api/queue"(_req, res) {
    json(res, 200, { queue: await loadQueue() });
  },

  async "POST /api/open"(req, res) {
    const { id } = await readBody(req);
    const dir = join(OUT, String(id));
    if (!existsSync(dir)) return json(res, 404, { error: "Not found" });
    const files = (await readdir(dir)).filter((f) => extname(f) === ".jpg").sort();
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

    const site = process.env.CAROUSEL_SITE ?? "https://aluxartandframes.shop";
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      return json(res, 400, {
        error: "INTERNAL_API_SECRET is not set, so the server will not accept the post. " +
               "Start the app with it, or use Save and post by hand.",
      });
    }

    const files = (await readdir(dir)).filter((f) => extname(f) === ".jpg").sort();
    const images = [];
    for (const f of files) images.push((await readFile(join(dir, f))).toString("base64"));

    try {
      const r = await fetch(`${site}/api/carousel/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify({
          localId: row.id, account: row.account, caption: row.caption,
          scheduledFor: row.scheduledFor, images,
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

createServer(async (req, res) => {
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
}).listen(PORT, () => {
  console.log(`\n  Carousel studio  ->  http://localhost:${PORT}`);
  console.log(`  Posts are saved in  ${OUT}`);
  console.log(`  ${process.env.INTERNAL_API_SECRET ? "Scheduling to the server is ON" : "Scheduling is OFF (no INTERNAL_API_SECRET) — Save still works"}\n`);
});
