const SIX_MB = 6 * 1024 * 1024;
// The resized file is what fal.ai actually receives for generation — nothing
// server-side re-processes it afterward — so this is the real ceiling on
// identity-photo fidelity, not just an upload-speed knob. A typical 12MP
// phone JPEG is ~2500–4000px long edge and 3–6MB; capping at 3500px/6MB
// lets the vast majority of uploads pass through completely untouched at
// native resolution, while still catching the 8-24MP+ outliers (10-20MB
// HEIC-converted shots) that were timing out or dropping mid-transfer on
// mobile data.
const MAX_DIM = 3500;

export async function resizeIfNeeded(file: File): Promise<File> {
  // Small AND already reasonably sized → send as-is (also skips non-decodable edge cases)
  if (file.size <= SIX_MB) return file;
  return new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        // Any failure falls back to the original file — never block the upload.
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}
