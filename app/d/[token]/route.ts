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

const page = (token: string, mb: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your photo — Alux Art</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d2620;color:#eaf5f1;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{width:100%;max-width:460px;text-align:center}
  h1{font-size:1.3rem;font-weight:800;letter-spacing:-.02em;margin-bottom:6px}
  p{font-size:.9rem;line-height:1.5;opacity:.8;margin-bottom:18px}
  img{width:100%;border-radius:12px;display:block;margin-bottom:18px;background:#123}
  a.btn{display:block;background:#43ccb2;color:#06150f;font-weight:800;font-size:1.05rem;
        padding:16px;border-radius:12px;text-decoration:none;margin-bottom:12px}
  .hint{font-size:.78rem;opacity:.6;line-height:1.5}
  .foot{margin-top:22px;font-size:.75rem;opacity:.45}
</style></head>
<body><div class="card">
  <h1>Your photo is ready</h1>
  <p>Full size, full quality &mdash; ${mb}</p>
  <img src="/d/${token}/preview" alt="Your relit photo">
  <a class="btn" href="/d/${token}/file">Download the full-size photo</a>
  <p class="hint">
    If it opens in a viewer instead of saving, press and hold the picture above
    and choose <strong>Save to Photos</strong>. On a computer, right-click and
    choose <strong>Save image as</strong>.
  </p>
  <p class="foot">This link works for 7 days &middot; aluxartandframes.shop</p>
</div></body></html>`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) return new NextResponse("Not found", { status: 404 });

  const [row] = await sql<{ bytes: number | null; path: string | null }[]>`
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
  return new NextResponse(page(token, mb), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
