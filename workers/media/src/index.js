/**
 * aluxart-media — serves buyer downloads from media.aluxartandframes.shop.
 *
 * Why this exists: buyers were landing on a raw *.r2.cloudflarestorage.com file
 * page. The obvious fix (proxy the file through the app) was tried and reverted —
 * measured on a real 18MB image, the buyer's link to the VPS runs at 20-47 KB/s
 * against 529 KB/s straight from R2, turning a 33 second download into 6-9
 * minutes. See app/api/shoots/[id]/images/[imageId]/route.ts.
 *
 * So the file must keep coming from Cloudflare's edge. This Worker sits on our
 * own hostname with the buckets bound directly to it: no origin trip, no public
 * bucket, and the URL reads as ours.
 *
 * Access control: the bucket stays PRIVATE. The app mints a short-lived HMAC
 * signature over (bucket, path, expiry) with a secret only it and this Worker
 * share, so a URL cannot be forged or reused after it expires. That is the same
 * guarantee the old signed R2 links gave, minus the giveaway hostname.
 */

const BUCKETS = {
  "generated-4k": "GENERATED_4K",
  "shoot-zips": "SHOOT_ZIPS",
};

const enc = new TextEncoder();

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Length-independent comparison, so a bad signature leaks no timing signal. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function signatureValid(secret, bucket, path, exp, provided) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${bucket}\n${path}\n${exp}`))
  );
  let got;
  try {
    got = base64UrlDecode(provided);
  } catch {
    return false;
  }
  return timingSafeEqual(expected, got);
}

/** Strip anything that could break out of the Content-Disposition header. */
function safeFilename(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120);
  return cleaned.length > 0 ? cleaned : null;
}

function deny(message, status) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return deny("Method not allowed", 405);
    }
    if (!env.MEDIA_SIGNING_SECRET) {
      // Fail closed: without the secret every signature would be unverifiable,
      // and serving anyway would expose every buyer's photos.
      return deny("Media service is not configured", 503);
    }

    const url = new URL(request.url);
    // /<bucket>/<object path...>
    const segments = url.pathname.replace(/^\/+/, "").split("/");
    const bucketName = segments.shift();
    const objectPath = segments.join("/");
    const binding = BUCKETS[bucketName];

    if (!binding || !objectPath) return deny("Not found", 404);
    const bucket = env[binding];
    if (!bucket) return deny("Not found", 404);

    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    if (!exp || !sig) return deny("This download link is missing its pass.", 403);

    const expiresAt = Number(exp);
    if (!Number.isFinite(expiresAt)) return deny("This download link is malformed.", 403);
    if (expiresAt * 1000 <= Date.now()) {
      return deny("This download link has expired. Open your shoot again for a fresh one.", 410);
    }
    if (!(await signatureValid(env.MEDIA_SIGNING_SECRET, bucketName, objectPath, exp, sig))) {
      return deny("This download link is not valid.", 403);
    }

    // Pass the request headers straight through so Range and If-None-Match work:
    // that is what keeps a 4K download resumable when a phone drops off wifi.
    const object = await bucket.get(objectPath, {
      range: request.headers,
      onlyIf: request.headers,
    });
    if (object === null) return deny("Not found", 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    // Buyers' photos: never let a shared cache hold them.
    headers.set("Cache-Control", "private, max-age=0, must-revalidate");
    headers.set("X-Content-Type-Options", "nosniff");

    const filename = safeFilename(url.searchParams.get("fn"));
    if (filename) headers.set("Content-Disposition", `attachment; filename="${filename}"`);

    // No body => a conditional request matched (304), or it was a HEAD.
    if (!("body" in object) || object.body === undefined) {
      return new Response(null, { status: 304, headers });
    }

    // Only answer 206 when the client actually asked for a range. R2 reports a
    // range on the object even for a plain request, and replying 206 to a request
    // that carried no Range header confuses download managers and some mobile
    // browsers into treating a complete file as a partial one.
    let status = 200;
    if (request.headers.has("range") && object.range && object.size !== undefined && "offset" in object.range) {
      const start = object.range.offset ?? 0;
      const length = object.range.length ?? object.size - start;
      headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
      status = 206;
    }

    return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
  },
};
