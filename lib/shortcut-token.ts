import crypto from "crypto";

export function generateToken(): string {
  return "alux_siri_" + crypto.randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Constant-time comparison of two same-length hex strings.
// Falls back to false immediately if lengths differ (safe — hashes are fixed length).
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
