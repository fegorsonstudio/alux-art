import "server-only";

/**
 * Publishing a loop to the Alux Art GIPHY channel.
 *
 * This is what makes a loop usable as an Instagram sticker: the picker searches
 * GIPHY, so a GIF that is not on GIPHY cannot be used there at all. There is no
 * private option — anything on the channel is public and searchable by anyone,
 * which is exactly why the customer has to ask for it rather than get it by
 * default.
 *
 * Two things this learned the hard way and should not have to learn again:
 *
 *   The username is CASE-SENSITIVE. GIPHY answers a mismatch with
 *   "User 'Aluxart' is not allowed to upload on behalf of 'aluxart'", which is
 *   admirably precise but a 403 that reads like a permissions problem.
 *
 *   Tags come back in the URL slug, not in the API's `tags` field, which is
 *   empty on the single-GIF endpoint. Slug is how you verify they took.
 */

const UPLOAD = "https://upload.giphy.com/v1/gifs";

export type GiphyUpload =
  | { ok: true; id: string; url: string; tag: string }
  | { ok: false; error: string };

/**
 * A short tag unique to this shoot, so a customer can find their own loop.
 *
 * Derived from the shoot id rather than random, so it can be recomputed from
 * the shoot alone if the upload record is ever lost. Letters and digits only:
 * GIPHY tags are matched loosely and punctuation in one is a good way to make
 * it unfindable.
 */
export const giphyTagFor = (shootId: string) =>
  `aluxart${shootId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase()}`;

/**
 * Put one loop on the channel.
 *
 * Returns rather than throws: a failed upload must never fail the shoot. The
 * customer has paid for a GIF and has one — publishing it as a sticker is a
 * bonus on top, and losing the bonus is not losing the order.
 */
export async function publishLoop(
  gif: Buffer,
  opts: { shootId: string; extraTags?: string[] },
): Promise<GiphyUpload> {
  const key = process.env.GIPHY_API_KEY;
  const username = process.env.GIPHY_USERNAME || "Aluxart";
  if (!key) return { ok: false, error: "GIPHY_API_KEY is not set" };

  const tag = giphyTagFor(opts.shootId);
  // The brand tags make the channel's work findable together; the shoot tag is
  // the one the customer is given, so they can pull up their own and nobody
  // else's.
  const tags = ["aluxart", "aluxartandframes", tag, "relight", "beforeandafter",
                ...(opts.extraTags ?? [])];

  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(gif)], { type: "image/gif" }), `${tag}.gif`);
    form.append("username", username);
    form.append("tags", tags.join(","));
    form.append("source_post_url", "https://aluxartandframes.shop");

    const res = await fetch(`${UPLOAD}?api_key=${key}`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.data?.id) {
      return {
        ok: false,
        error: body?.meta?.description ?? body?.meta?.msg ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, id: body.data.id, url: `https://giphy.com/gifs/${body.data.id}`, tag };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}
