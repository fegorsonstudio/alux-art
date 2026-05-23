const TEN_MB = 10 * 1024 * 1024;
const MAX_DIM = 4000;

export async function resizeIfNeeded(file: File): Promise<File> {
  if (file.size <= TEN_MB) return file;
  return new Promise<File>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error("Resize failed")); return; }
        resolve(new File([blob], file.name, { type: "image/jpeg" }));
      }, "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
    img.src = objectUrl;
  });
}
