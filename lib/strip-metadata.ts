/**
 * strip-metadata.ts — remove EXIF / XMP / IPTC / C2PA from a delivered image.
 *
 * WHAT THIS DOES AND DOES NOT DO
 *
 * It removes the metadata *containers* a file carries: the EXIF block, XMP,
 * IPTC, Photoshop resource blocks, and the JUMBF box that holds C2PA content
 * credentials ("this image was generated with AI"). Those are the fields a
 * social platform, a viewer, or an inspection site reads and displays.
 *
 * It does NOT remove SynthID. Google's image models put an invisible watermark
 * into the PIXELS, not the metadata, and it survives cropping, re-encoding and
 * every kind of metadata stripping. Anyone running a SynthID detector can still
 * tell. This function makes the file say nothing; it cannot make the pixels
 * say nothing. Do not describe the toggle to buyers as making an image
 * undetectable as AI.
 *
 * DONE WITHOUT RE-ENCODING. Passing the image through sharp would strip
 * metadata too, but it would also re-compress a 4K deliverable, and the buyer
 * paid for those pixels. This walks the container and drops segments, so every
 * pixel byte is preserved exactly.
 *
 * Colour-critical segments are deliberately KEPT: the ICC profile (JPEG APP2 /
 * PNG iCCP), the JFIF header (APP0), and Adobe's colour-transform marker
 * (APP14). Dropping those does not hide anything and would shift the colour of
 * the delivered file.
 */

/** JPEG segments that carry descriptive metadata rather than image data. */
const JPEG_DROP = new Set([
  0xe1, // APP1  — EXIF and XMP
  0xeb, // APP11 — JUMBF, which is where C2PA content credentials live
  0xed, // APP13 — Photoshop image resource blocks / IPTC
  0xfe, // COM   — free-text comment
]);

function stripJpeg(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;

  const keep: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;

  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) break; // not a marker boundary — bail out unchanged
    const marker = buf[i + 1];

    // Start of Scan: everything after this is entropy-coded image data, and
    // there are no more metadata segments to find.
    if (marker === 0xda) {
      keep.push(buf.subarray(i));
      return Buffer.concat(keep);
    }
    // Standalone markers carry no length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      keep.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }

    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) break; // malformed — leave the rest alone
    if (!JPEG_DROP.has(marker)) keep.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }

  keep.push(buf.subarray(i));
  return Buffer.concat(keep);
}

/** PNG ancillary chunks that carry descriptive metadata. */
const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "caBX", "tIME"]);

function stripPng(buf: Buffer): Buffer {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) return buf;

  const keep: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;

  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const end = i + 12 + len; // length + type + data + CRC
    if (end > buf.length) break; // truncated — keep what is left verbatim
    if (!PNG_DROP.has(type)) keep.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") return Buffer.concat(keep);
  }

  keep.push(buf.subarray(i));
  return Buffer.concat(keep);
}

/**
 * Strip metadata from a JPEG or PNG buffer.
 *
 * Any unrecognised or malformed input is returned untouched. Delivering the
 * image matters more than stripping it: a buyer who ticked the box and got a
 * corrupt file would be far worse off than one whose file still carries EXIF.
 */
export function stripImageMetadata(buf: Buffer): Buffer {
  try {
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return stripJpeg(buf);
    if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return stripPng(buf);
    return buf;
  } catch {
    return buf;
  }
}
