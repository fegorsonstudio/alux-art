import "server-only";
import { randomBytes } from "node:crypto";
import { KEYWORDS } from "@/lib/instagram-keywords";

/**
 * A brand in an episode, beyond a picture (owner, 2026-10-21): their product in
 * a scene, "Partner: <Brand>" in the caption, and their own comment word for
 * that episode — commenting it sends the viewer a button to the brand's product
 * page, through a link of ours that counts the taps for the brand's report.
 */

/** What we never place (owner's list): the series must not get anyone scammed or hurt. */
export const NOT_PLACED = [
  "skin lightening or bleaching products",
  "gambling or betting",
  "investment schemes and \"double your money\" offers (licensed banks and fintechs are welcome)",
  "weapons",
  "adult products",
  "political campaigns",
];
/** And whatever we place, our story makes no health, slimming or money-making claims for it. */
export const NO_CLAIMS = "Our story never makes health, slimming or money-making claims for a product.";

/** Words the bot already answers, or that the game uses: a brand can never take one. */
const TAKEN = new Set<string>([
  "PLAY", "GAME", "LINK", "HELP", "STOP", "YES", "NO", "RETOUCH", "EDIT", "HI", "HELLO",
  ...KEYWORDS.flatMap((k) => [k.word, ...(k.aliases ?? [])]).map((w) => w.toUpperCase()),
]);

/** A brand's comment word: one word, 3 to 14 letters, not one the bot or the episode already uses. */
export function checkBrandWord(raw: string, alsoTaken: string[] = []): { ok: true; word: string } | { ok: false; why: string } {
  const word = raw.trim().toUpperCase().replace(/^#/, "");
  if (!/^[A-Z]{3,14}$/.test(word)) return { ok: false, why: "Your comment word must be one word of 3 to 14 letters — no spaces, numbers or signs." };
  if (TAKEN.has(word) || alsoTaken.map((w) => w.toUpperCase()).includes(word)) return { ok: false, why: `${word} is already used by the game. Choose another word.` };
  return { ok: true, word };
}

/** The brand's own product page: a real https address on the open internet. */
export async function checkProductUrl(raw: string): Promise<{ ok: true; url: string } | { ok: false; why: string }> {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, why: "Add the full link to your product, starting with https://" }; }
  if (u.protocol !== "https:") return { ok: false, why: "Your product link must start with https://" };
  if (/^(localhost|[\d.]+|\[.*\])$/i.test(u.hostname) || !u.hostname.includes(".")) return { ok: false, why: "That doesn't look like a website address." };
  if (u.toString().length > 400) return { ok: false, why: "That link is too long." };
  try {
    const r = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "AluxMicroDrama/1.0 (link check)" } });
    if (r.status >= 400 && r.status !== 403) return { ok: false, why: `We couldn't open your product page (it answered ${r.status}). Check the link.` };
  } catch {
    return { ok: false, why: "We couldn't open your product page. Check the link and try again." };
  }
  return { ok: true, url: u.toString() };
}

/** Short random codes for the tap-counting link and the brand's private report page. */
export const newLinkCode = () => randomBytes(6).toString("base64url");
export const newReportToken = () => randomBytes(18).toString("base64url");

/** The caption line for a placed brand: subtle, the object as the story knows it, then the word. */
export const brandLine = (brand: string, object: string, word: string) =>
  `Partner: ${brand} — ${object} in this episode. Comment ${word} to see it.`;
