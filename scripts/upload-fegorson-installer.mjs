// Puts a Fegorson Studio Windows installer on R2 (template-images bucket, never
// purged) so /d/fegorson can hand it out. Multipart, 16 MB parts, retried, so a
// slow laptop connection gets there.
//
//   node --env-file=.env.local scripts/upload-fegorson-installer.mjs "C:/.../Fegorson Studio Setup 0.32.0.exe" 0.32.0
import fs from "node:fs";
import crypto from "node:crypto";
import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const [file, version] = process.argv.slice(2);
if (!file || !version) { console.error("usage: upload-fegorson-installer.mjs <installer.exe> <version>"); process.exit(1); }
const BUCKET = "template-images";
const KEY = `fegorson/Fegorson-Studio-Setup-${version}.exe`;
const PART = 16 * 1024 * 1024;

const r2 = new S3Client({
  region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
});

const size = fs.statSync(file).size;
const sha = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
console.log(`uploading ${file} (${(size / 1e6).toFixed(1)} MB, sha256 ${sha}) → ${BUCKET}/${KEY}`);

const { UploadId } = await r2.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: KEY, ContentType: "application/octet-stream", Metadata: { sha256: sha, version } }));
const parts = [];
try {
  const fd = fs.openSync(file, "r");
  const total = Math.ceil(size / PART);
  for (let n = 0; n < total; n++) {
    const len = Math.min(PART, size - n * PART);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, n * PART);
    let done = false;
    for (let attempt = 1; attempt <= 4 && !done; attempt++) {
      try {
        const r = await r2.send(new UploadPartCommand({ Bucket: BUCKET, Key: KEY, UploadId, PartNumber: n + 1, Body: buf, ContentLength: len }));
        parts.push({ ETag: r.ETag, PartNumber: n + 1 });
        done = true;
        process.stdout.write(`part ${n + 1}/${total} ok\n`);
      } catch (e) {
        console.warn(`part ${n + 1} attempt ${attempt} failed: ${e.message}`);
        await new Promise((res) => setTimeout(res, 2000 * attempt));
      }
    }
    if (!done) throw new Error(`part ${n + 1} failed four times`);
  }
  fs.closeSync(fd);
  await r2.send(new CompleteMultipartUploadCommand({ Bucket: BUCKET, Key: KEY, UploadId, MultipartUpload: { Parts: parts } }));
  const head = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: KEY }));
  console.log(`done: ${KEY} ${head.ContentLength} bytes (local ${size}) ${head.ContentLength === size ? "SIZE MATCH" : "SIZE MISMATCH"}`);
} catch (e) {
  await r2.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: KEY, UploadId })).catch(() => {});
  console.error("upload failed:", e.message);
  process.exit(1);
}
