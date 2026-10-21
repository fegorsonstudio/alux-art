import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

/**
 * iPhone photos (HEIC) turned into JPEGs on the server (owner, 2026-10-22).
 *
 * Chrome on Windows can neither show a HEIC nor say it is a picture (it sends
 * it with no type), and this server's sharp reads a HEIC's header but cannot
 * decode its pixels ("bad seek", checked 14 Oct) — the HEVC decoder is not in
 * sharp's own build. So the decode is done by libheif — a current one through
 * pillow-heif first, Ubuntu's `heif-convert` (apt libheif-examples +
 * libheif-plugin-libde265, installed 2026-10-22) as the fallback — losslessly
 * to PNG, and sharp makes the JPEG from that: full resolution,
 * quality 95, 4:4:4 colour, the colour profile kept, EXIF (and its GPS)
 * dropped. libheif has already applied the photo's rotation.
 *
 * The 30 MB rule still holds: the resolution is never reduced; if the JPEG
 * would pass fal's 30 MB per-image limit, only the JPEG quality steps down.
 */

const run = promisify(execFile);
const MAX_BYTES = 30 * 1024 * 1024;
const HEVC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);

/** True when the bytes are an HEVC-coded HEIF (an iPhone HEIC), not AVIF, which sharp reads itself. */
export function isHeic(buf: Buffer): boolean {
  if (buf.length < 16 || buf.toString("latin1", 4, 8) !== "ftyp") return false;
  const boxSize = Math.min(buf.readUInt32BE(0), buf.length, 256);
  const brands: string[] = [buf.toString("latin1", 8, 12)];
  for (let o = 16; o + 4 <= boxSize; o += 4) brands.push(buf.toString("latin1", o, o + 4));
  return brands.some((b) => HEVC_BRANDS.has(b));
}

/** The type a raster image's first bytes say it is, for uploads that arrive with no type. */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 6 && buf.toString("latin1", 0, 3) === "GIF") return "image/gif";
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp" && /avi[fs]/.test(buf.toString("latin1", 8, 32))) return "image/avif";
  return null;
}

// The decoders. Ubuntu's libheif (1.17.6) refuses many iPhone photos from iOS 18
// on — "Non-existing depth image referenced" (libheif #1213, fixed in 1.18) —
// which is how the owner's Portrait-mode photos failed on 22 Oct. So a current
// libheif (pillow-heif in its own venv, tools/heic/convert.py) goes first and
// heif-convert stays as the fallback. Both memory-capped and time-limited.
const PY = process.env.HEIC_PY || "/home/aluxart/heic-venv/bin/python";
const decoders = (src: string, out: string): Array<[string, string[]]> => [
  ["bash", ["-c", 'ulimit -v 2500000; exec "$0" "$1" "$2" "$3"', PY, path.join(process.cwd(), "tools", "heic", "convert.py"), src, out]],
  ["sh", ["-c", 'ulimit -v 1500000; exec heif-convert --quiet --png-compression-level 1 "$1" "$2"', "sh", src, out]],
];

// About 250 MB of memory per photo while it decodes: a customer sending ten at
// once must not take that much from the site, so two run at a time.
let running = 0;
const waiting: Array<() => void> = [];
async function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((go) => waiting.push(go));
  running++;
  try { return await job(); } finally { running--; waiting.shift()?.(); }
}

/** HEIC bytes → a full-resolution JPEG. Throws when the file cannot be decoded. */
export async function heicToJpeg(heic: Buffer): Promise<Buffer> {
  return oneAtATime(() => convert(heic));
}

async function convert(heic: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "heic-"));
  try {
    const src = path.join(dir, "in.heic");
    await writeFile(src, heic);
    const errors: string[] = [];
    for (const [cmd, args] of decoders(src, path.join(dir, "out.png"))) {
      // Nothing a failed attempt left behind may be mistaken for the picture.
      for (const f of await readdir(dir)) if (/^out(-\d+)?\.png$/.test(f)) await rm(path.join(dir, f), { force: true });
      try {
        await run(cmd, args, { timeout: 60_000 });
        if ((await readdir(dir)).some((f) => /^out(-\d+)?\.png$/.test(f))) break;
        errors.push(`${cmd}: no picture written`);
      } catch (e) {
        const err = e as { stderr?: string; message?: string };
        errors.push(`${cmd}: ${String(err.stderr || err.message || e).trim().split("\n").pop()?.slice(0, 200)}`);
      }
    }
    if (errors.length === 2) throw new Error(errors.join(" | "));
    // A HEIC can hold several pictures (out-1.png, out-2.png …): the photo is the largest.
    const outs = (await readdir(dir)).filter((f) => /^out(-\d+)?\.png$/.test(f));
    if (!outs.length) throw new Error("no picture was written");
    let best: { file: string; px: number } | null = null;
    for (const f of outs) {
      const m = await sharp(path.join(dir, f)).metadata();
      const px = (m.width ?? 0) * (m.height ?? 0);
      if (!best || px > best.px) best = { file: f, px };
    }
    const png = await readFile(path.join(dir, best!.file));
    let jpeg: Buffer | null = null;
    for (const [quality, chromaSubsampling] of [[95, "4:4:4"], [92, "4:4:4"], [88, "4:4:4"], [85, "4:2:0"]] as const) {
      jpeg = await sharp(png, { limitInputPixels: 120_000_000 }).keepIccProfile().jpeg({ quality, chromaSubsampling }).toBuffer();
      if (jpeg.byteLength <= MAX_BYTES) break;
    }
    return jpeg!;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
