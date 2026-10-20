/**
 * The middleware's sign-in check: is the aa_session cookie signed by us?
 * Web Crypto only (the middleware runs on the edge runtime, no database), and
 * the same signature as lib/auth-session.ts signValue(): HMAC-SHA256(AUTH_SECRET, "v1:" + value),
 * base64url. Whether the session was ended is checked by currentUser() on the
 * server; this only decides where a page request may go.
 *
 * The signature is made with subtle.sign and compared as text on purpose: in
 * Next's edge sandbox, Node's crypto refuses an ArrayBuffer built inside the
 * sandbox ("3rd argument is not instance of ArrayBuffer"), so subtle.verify on
 * the decoded cookie said "not signed in" to every valid session.
 */

export const SESSION_COOKIE = "aa_session";

let keyPromise: Promise<CryptoKey> | null = null;

function key(): Promise<CryptoKey> | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  keyPromise ??= crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return keyPromise;
}

export async function hasSignedSession(raw: string | undefined): Promise<boolean> {
  if (!raw || raw.length > 200) return false;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const k = key();
  if (!k) return false;
  try {
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await k, new TextEncoder().encode(`v1:${raw.slice(0, dot)}`)));
    let bin = "";
    for (let i = 0; i < mac.length; i++) bin += String.fromCharCode(mac[i]);
    const want = btoa(bin).split("+").join("-").split("/").join("_").split("=").join("");
    const got = raw.slice(dot + 1);
    if (got.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}
