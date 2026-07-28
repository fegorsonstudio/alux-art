// HARD RULE: never degrade an upload that fal.ai can already accept.
//
// fal-ai/nano-banana-2 accepts up to 30MB per reference image, and fal fetches
// our stored R2 file directly (generate.ts passes `image_urls`, not bytes) —
// nothing re-processes it in between. So whatever we store IS what the model
// sees, and any shrinking here is a permanent, irreversible loss of identity
// and reference fidelity. Therefore: files at or under 30MB are uploaded
// completely untouched at native resolution. ONLY a file above 30MB is
// reduced, and then only just enough to fit under fal's limit.
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

// Tried in order for oversized files: keep native resolution first and only
// start scaling down if re-encoding alone can't get under the cap.
const REDUCTION_STEPS: Array<{ scale: number; quality: number }> = [
  { scale: 1, quality: 0.95 },
  { scale: 1, quality: 0.88 },
  { scale: 0.85, quality: 0.9 },
  { scale: 0.7, quality: 0.88 },
  { scale: 0.55, quality: 0.85 },
  { scale: 0.45, quality: 0.82 },
];

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function resizeIfNeeded(file: File): Promise<File> {
  // At or under fal's per-image limit → send exactly what the user picked.
  if (file.size <= MAX_UPLOAD_BYTES) return file;

  return new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }

      let smallest: Blob | null = null;
      for (const step of REDUCTION_STEPS) {
        canvas.width = Math.round(img.width * step.scale);
        canvas.height = Math.round(img.height * step.scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await toBlob(canvas, step.quality);
        if (!blob) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        // First result that fits wins — keeps the highest quality that is legal.
        if (blob.size <= MAX_UPLOAD_BYTES) break;
      }

      // Any failure falls back to the original file — never block the upload.
      if (!smallest || smallest.size >= file.size) { resolve(file); return; }
      resolve(new File([smallest], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}
