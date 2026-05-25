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

export async function r2Download(bucket: string, path: string): Promise<Blob> {
  const res = await r2.send(
    new GetObjectCommand({ Bucket: bucket, Key: path })
  );
  const chunks: Uint8Array[] = [];
  const stream = res.Body as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new Blob([Buffer.concat(chunks)], {
    type: res.ContentType ?? "application/octet-stream",
  });
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

export async function r2Exists(bucket: string, path: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: path }));
    return true;
  } catch {
    return false;
  }
}
