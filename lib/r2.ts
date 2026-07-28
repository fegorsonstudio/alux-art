import "server-only";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  // R2 doesn't support AWS SDK v3's automatic checksum headers — disable them
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// Returns a proxy URL served through the app (avoids R2 CORS/ORB restrictions).
// Use this for images displayed in <img> tags.
export function r2ProxyUrl(bucket: string, path: string): string {
  return `/api/media?b=${encodeURIComponent(bucket)}&p=${encodeURIComponent(path)}`;
}

// Returns a signed R2 URL for direct file downloads (where CORS doesn't apply).
// Use this for download buttons and ZIP files.
export async function r2SignedDownloadUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
  downloadFilename?: string
): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: bucket,
      Key: path,
      ...(downloadFilename
        ? { ResponseContentDisposition: `attachment; filename="${downloadFilename}"` }
        : {}),
    }),
    { expiresIn }
  );
}

export async function r2SignedUploadUrl(
  bucket: string,
  path: string,
  contentType?: string,
  expiresIn = 3600
): Promise<string> {
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: bucket,
      Key: path,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

export async function r2Upload(
  bucket: string,
  path: string,
  body: Buffer | Uint8Array | ReadableStream | Blob,
  contentType?: string
): Promise<void> {
  let uploadBody: Buffer | Uint8Array;
  if (body instanceof Blob) {
    uploadBody = Buffer.from(await body.arrayBuffer());
  } else if (body instanceof ReadableStream) {
    const chunks: Uint8Array[] = [];
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    uploadBody = Buffer.concat(chunks);
  } else {
    uploadBody = body as Buffer | Uint8Array;
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: path,
      Body: uploadBody,
      ContentType: contentType,
    })
  );
}

// Reads a Web ReadableStream into a Buffer and uploads to R2.
// Previously used Readable.fromWeb for streaming, but node:stream is stubbed by
// the Next.js/webpack bundler even with indirect imports, causing runtime errors.
// On VPS (no Vercel timeout) buffering is safe for 20-50MB images.
export async function r2StreamUpload(
  bucket: string,
  path: string,
  webStream: ReadableStream<Uint8Array>,
  contentType?: string,
  contentLength?: number
): Promise<void> {
  const chunks: Uint8Array[] = [];
  const reader = webStream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: path,
      Body: buffer,
      ContentType: contentType,
      ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
    })
  );
}

export async function r2Download(bucket: string, path: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: path }));
  const bytes = await (res.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
  return { buffer: Buffer.from(bytes), contentType: res.ContentType ?? "application/octet-stream" };
}


export async function r2Delete(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  await r2.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: paths.map((Key) => ({ Key })) },
    })
  );
}

// Copies an object within (or across) buckets by downloading then re-uploading.
// Used for "import" flows where a resource must land under a NEW owner's own
// storage prefix — never point two owners' records at the same object, so
// deleting one owner's copy never breaks the other's.
export async function r2Copy(
  fromBucket: string,
  fromPath: string,
  toBucket: string,
  toPath: string
): Promise<void> {
  const { buffer, contentType } = await r2Download(fromBucket, fromPath);
  await r2Upload(toBucket, toPath, buffer, contentType);
}

export async function r2Exists(bucket: string, path: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: path }));
    return true;
  } catch {
    return false;
  }
}
