import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

/**
 * The download page.
 *
 * This used to redirect straight to the file with Content-Disposition:
 * attachment, which is correct and does not work: Instagram's in-app browser
 * ignores the header and renders the PNG, so a customer saw their photo and no
 * way to keep it. A page with a real button survives that, and gives somewhere
 * to put the "press and hold" instructions that iOS needs anyway.
 *
 * No login, by design. A buyer who came through Instagram or WhatsApp has a
 * synthetic account with no password, so this is the only route they have to
 * the 4K file they paid for. The token in the path is the authorisation and it
 * grants exactly one photograph.
 *
 * Plain HTML with inline styles: it has to render on a four-year-old Android
 * inside a webview, on a slow connection, with no framework and no fonts to
 * fetch.
 */

export const dynamic = "force-dynamic";

/**
 * A token can point at a shoot image or at a RETOUCHED image.
 *
 * Retouched files are paywalled: the retouch is done by hand and the customer
 * pays to unlock it, so a token whose order is neither paid nor free resolves
 * to nothing at all. That check lives here, in the routes that actually serve
 * bytes, rather than only at the point the link is sent — a link that leaks
 * or is forwarded must still be worthless until the money lands.
 */
async function resolveToken(token: string): Promise<
  { bucket: string; path: string; slot: number; shootId: string; retouched: boolean } | null
> {
  const [img] = await sql<{
    bucket: string | null; path: string | null; slot: number; shoot_id: string;
  }[]>`
    SELECT COALESCE(download_storage_bucket, preview_storage_bucket) AS bucket,
           COALESCE(download_storage_path,   preview_storage_path)   AS path,
           slot, shoot_id
    FROM shoot_images WHERE download_token = ${token} LIMIT 1`.catch(() => []);
  if (img?.path && img.bucket) {
    return { bucket: img.bucket, path: img.path, slot: img.slot, shootId: img.shoot_id, retouched: false };
  }

  const [re] = await sql<{
    bucket: string | null; path: string | null; slot: number | null;
    shoot_id: string; paid: boolean | null; free: boolean | null;
  }[]>`
    SELECT r.storage_bucket AS bucket, r.storage_path AS path, r.slot, r.shoot_id,
           o.paid, o.free
    FROM shoot_retouched_images r
    LEFT JOIN shoot_retouch o ON o.shoot_id = r.shoot_id
    WHERE r.download_token = ${token} LIMIT 1`.catch(() => []);
  if (!re?.path || !re.bucket) return null;
  if (!re.paid && !re.free) return null;   // unpaid: the link is inert

  return { bucket: re.bucket, path: re.path, slot: re.slot ?? 1, shootId: re.shoot_id, retouched: true };
}


const page = (token: string, mb: string, isVideo: boolean, sticker?: { tag: string; url: string } | null) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your ${isVideo ? "video" : "photo"} — Alux Art</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d2620;color:#eaf5f1;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{width:100%;max-width:460px;text-align:center}
  h1{font-size:1.3rem;font-weight:800;letter-spacing:-.02em;margin-bottom:6px}
  p{font-size:.9rem;line-height:1.5;opacity:.8;margin-bottom:18px}
  img,video{width:100%;border-radius:12px;display:block;margin-bottom:18px;background:#123}
  a.btn{display:block;background:#43ccb2;color:#06150f;font-weight:800;font-size:1.05rem;
        padding:16px;border-radius:12px;text-decoration:none;margin-bottom:12px}
  .hint{font-size:.78rem;opacity:.6;line-height:1.5}
  .foot{margin-top:22px;font-size:.75rem;opacity:.45}
  .sticker{margin-top:18px;padding:14px;border-radius:12px;background:rgba(67,204,178,.12);
           text-align:left;font-size:.84rem;line-height:1.5}
  .sticker strong{display:block;margin-bottom:5px}
  .sticker p{margin:0;opacity:.85;font-size:.82rem}
  .sticker .tiny{margin-top:6px;opacity:.6;font-size:.74rem}
  .sticker code{background:rgba(0,0,0,.3);padding:2px 7px;border-radius:5px;font-size:.86rem}
</style></head>
<body><div class="card">
  <h1>${isVideo ? "Your video is ready" : "Your photo is ready"}</h1>
  <p>Full size, full quality &mdash; ${mb}</p>
  ${isVideo
    // Muted and playsinline or iOS refuses to autoplay at all; loop because
    // that is what the file is.
    ? `<video src="/d/${token}/preview" autoplay loop muted playsinline controls></video>`
    : `<img src="/d/${token}/preview" alt="Your relit photo">`}
  <a class="btn" href="/d/${token}/file">Download the full-size ${isVideo ? "video" : "photo"}</a>
  <p class="hint">
    ${isVideo
      ? `If it opens in a player instead of saving, press and hold the video above
         and choose <strong>Save to Photos</strong>. On a computer, right-click and
         choose <strong>Save video as</strong>.`
      : `If it opens in a viewer instead of saving, press and hold the picture above
         and choose <strong>Save to Photos</strong>. On a computer, right-click and
         choose <strong>Save image as</strong>.`}
  </p>
  ${sticker ? `<div class="sticker">
    <strong>Your sticker is live on Instagram</strong>
    <p>Open any story or post, tap the sticker button, choose GIF, and search
       <code>${sticker.tag}</code> — yours is the one that comes up.</p>
    <p class="tiny">It can take a few hours to appear while Instagram indexes it.</p>
  </div>` : ""}
  <p class="foot">This link works for 7 days &middot; aluxartandframes.shop</p>
</div></body></html>`;

/**
 * Every photo in one order, on one page. A chat order can hold up to ten photos
 * and the chat used to receive a link to the first one only. Each photo keeps
 * its own token (and its own /preview and /file), so nothing about how a single
 * file is served changes.
 */
type Sibling = { token: string; slot: number; bytes: number | null; path: string };
const listPage = (items: Sibling[]) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your ${items.length} photos — Alux Art</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d2620;color:#eaf5f1;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       min-height:100vh;padding:20px 16px}
  .wrap{width:100%;max-width:520px;margin:0 auto;text-align:center}
  h1{font-size:1.3rem;font-weight:800;letter-spacing:-.02em;margin-bottom:6px}
  p{font-size:.9rem;line-height:1.5;opacity:.8;margin-bottom:18px}
  .item{margin-bottom:26px}
  img,video{width:100%;border-radius:12px;display:block;margin-bottom:10px;background:#123}
  .meta{font-size:.78rem;opacity:.65;margin-bottom:8px}
  a.btn{display:block;background:#43ccb2;color:#06150f;font-weight:800;font-size:1rem;
        padding:14px;border-radius:12px;text-decoration:none}
  .hint{font-size:.78rem;opacity:.6;line-height:1.5;margin-bottom:22px}
  .foot{margin-top:6px;font-size:.75rem;opacity:.45}
</style></head>
<body><div class="wrap">
  <h1>Your ${items.length} photos are ready</h1>
  <p>Full size, full quality. Download each one below.</p>
  <p class="hint">If a photo opens in a viewer instead of saving, press and hold it and choose
     <strong>Save to Photos</strong>. On a computer, right-click and choose <strong>Save image as</strong>.</p>
  ${items.map((it, i) => {
    const video = /\.(mp4|webm|mov)$/i.test(it.path);
    const size = it.bytes ? ` · ${(it.bytes / 1048576).toFixed(1)} MB` : "";
    return `<div class="item">
    ${video
      ? `<video src="/d/${it.token}/preview" muted playsinline controls preload="metadata"></video>`
      : `<img src="/d/${it.token}/preview" alt="Photo ${i + 1}" loading="lazy">`}
    <div class="meta">${video ? "Video" : "Photo"} ${i + 1} of ${items.length}${size}</div>
    <a class="btn" href="/d/${it.token}/file">Download ${video ? "video" : "photo"} ${i + 1}</a>
  </div>`;
  }).join("\n  ")}
  <p class="foot">These links work for 7 days &middot; aluxartandframes.shop</p>
</div></body></html>`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) return new NextResponse("Not found", { status: 404 });

  const resolved = await resolveToken(token);

  // An order with several finished photos: show them all. Retouched files keep
  // their own single-file page and paywall check.
  if (resolved && !resolved.retouched) {
    const siblings = await sql<Sibling[]>`
      SELECT download_token AS token, slot,
             COALESCE(download_file_size, file_size) AS bytes,
             COALESCE(download_storage_path, preview_storage_path) AS path
      FROM shoot_images
      WHERE shoot_id = ${resolved.shootId} AND status = 'COMPLETE' AND download_token IS NOT NULL
        AND COALESCE(download_storage_path, preview_storage_path) IS NOT NULL
      ORDER BY slot`.catch(() => [] as Sibling[]);
    if (siblings.length > 1) {
      return new NextResponse(listPage(siblings), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
  }
  const [row] = resolved
    ? [{ bytes: null as number | null, path: resolved.path }]
    : await sql<{ bytes: number | null; path: string | null }[]>`
        SELECT COALESCE(download_file_size, file_size) AS bytes,
               COALESCE(download_storage_path, preview_storage_path) AS path
        FROM shoot_images WHERE download_token = ${token} LIMIT 1`.catch(() => []);

  if (!row?.path) {
    // Say which, rather than a bare 404: "my link stopped working" is otherwise
    // a support conversation with no answer in it.
    return new NextResponse(
      "This download link has expired. Photos are kept for 7 days after your shoot. " +
      "Message us on WhatsApp and we'll help.",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const mb = row.bytes ? `${(row.bytes / 1048576).toFixed(1)} MB` : "original quality";
  // An MP4 cannot go in an <img>, and a loop bought as video is half the
  // files this template now produces.
  const isVideo = /\.(mp4|webm|mov)$/i.test(row.path);

  // Only set when the buyer ticked the box and the upload actually succeeded,
  // so the page never promises a sticker that is not there.
  const [shoot] = await sql<{ giphy_tag: string | null; giphy_url: string | null }[]>`
    SELECT enhance->>'giphyTag' AS giphy_tag, enhance->>'giphyUrl' AS giphy_url
    FROM shoots WHERE id = ${resolved?.shootId ?? null}`.catch(() => []);
  const sticker = shoot?.giphy_tag
    ? { tag: shoot.giphy_tag, url: shoot.giphy_url ?? "" }
    : null;

  return new NextResponse(page(token, mb, isVideo, sticker), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
