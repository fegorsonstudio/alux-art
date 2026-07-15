const TWO_HALF_MB = 2.5 * 1024 * 1024;
// 2560px longest edge is comfortably above what the generation engine consumes
// (it downsizes inputs internally) while cutting a phone-camera JPEG from
// 5–12MB to well under 1MB — uploads on mobile data become 10-20x faster and
// far less likely to drop mid-transfer (the "some uploads failed" complaint).
const MAX_DIM = 2560;

export async function resizeIfNeeded(file: File): Promise<File> {
  // Small AND already reasonably sized → send as-is (also skips non-decodable edge cases)
  if (file.size <= TWO_HALF_MB) return file;
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
      }, "image/jpeg", 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}
