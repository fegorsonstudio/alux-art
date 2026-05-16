const BASE_ID = process.env.AIRTABLE_BASE_ID ?? "";
const PAT = process.env.AIRTABLE_PAT ?? "";
const TABLE_FAL = process.env.AIRTABLE_TABLE_FAL ?? "Fal Payloads";
const TABLE_REFS = process.env.AIRTABLE_TABLE_REFS ?? "Reference Uploads";

async function createRecord(
  table: string,
  fields: Record<string, unknown>
): Promise<void> {
  if (!BASE_ID || !PAT) return;
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );
    if (res.ok) {
      console.log(`[airtable] ✓ ${table}`);
    } else {
      const body = await res.text().catch(() => "");
      console.error(`[airtable] ${table} write failed ${res.status}:`, body.slice(0, 300));
    }
  } catch (err) {
    console.error("[airtable] network error:", err);
  }
}

export async function logFalPayload(params: {
  shootId: string;
  slot: number;
  mode: string;
  aspectRatio: string;
  prompt: string;
  identityUrls: string[];
  inspirationUrls: string[];
  taggedRefs: Array<{ tag?: string | null; url: string }>;
  imageUrls: string[];
  identityProfile: string;
  shootBrief: string;
  quoteText?: string;
  status: "dry_run" | "sent_to_fal";
}): Promise<void> {
  await createRecord(TABLE_FAL, {
    "Shoot ID": params.shootId,
    "Slot": params.slot,
    "Mode": params.mode,
    "Aspect Ratio": params.aspectRatio,
    "Prompt": params.prompt,
    "Identity URLs": params.identityUrls.join("\n"),
    "Inspiration URLs": params.inspirationUrls.join("\n"),
    "Tagged References": params.taggedRefs
      .map((r) => `[${r.tag ?? "untagged"}]: ${r.url}`)
      .join("\n"),
    "Tags Applied": params.taggedRefs
      .map((r) => r.tag)
      .filter(Boolean)
      .join(", "),
    "Image URLs": params.imageUrls.join("\n"),
    "Reference Count": params.imageUrls.length,
    "Identity Profile": params.identityProfile,
    "Shoot Brief": params.shootBrief,
    "Quote Text": params.quoteText ?? "",
    "Status": params.status,
    "Timestamp": new Date().toISOString(),
  });
}

export async function logReferenceUpload(params: {
  shootId: string;
  fileName: string;
  purpose: string;
  tag?: string | null;
  storageBucket: string;
  storagePath: string;
  fileSizeKB: number;
  contentType: string;
  signedUrl: string;
}): Promise<void> {
  await createRecord(TABLE_REFS, {
    "Shoot ID": params.shootId,
    "File Name": params.fileName,
    "Purpose": params.purpose,
    "Tag": params.tag ?? "",
    "Storage Bucket": params.storageBucket,
    "Storage Path": params.storagePath,
    "File Size KB": Math.round(params.fileSizeKB * 10) / 10,
    "Content Type": params.contentType,
    "Upload Status": "complete",
    "Signed URL": params.signedUrl,
    "Uploaded At": new Date().toISOString(),
  });
}
