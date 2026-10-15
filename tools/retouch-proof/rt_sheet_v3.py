# v3 comparison sheets: whole photo before|after, and zooms (face, body, erased areas) before|after.
import os, sys, json, glob
import numpy as np, cv2
from PIL import Image, ImageDraw
R = "/root/retouch-proof"; OUT = f"{R}/out-v3"; CMP = f"{R}/compare-v3"; os.makedirs(CMP, exist_ok=True)
det = cv2.FaceDetectorYN.create(f"{R}/models/yunet.onnx", "", (320, 320), 0.6, 0.3, 5000)
def face_box(rgb):
    H, W = rgb.shape[:2]; s = 1600 / max(H, W)
    sm = cv2.resize(rgb[:, :, ::-1], (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    det.setInputSize((sm.shape[1], sm.shape[0])); _, f = det.detect(sm)
    return None if f is None else [v / s for v in max(f, key=lambda r: r[2] * r[3])[:4]]
def tag(im, t):
    d = ImageDraw.Draw(im); d.rectangle([0, 0, im.width, 22], fill=(0, 0, 0)); d.text((6, 5), t, fill=(255, 255, 255)); return im
def pair(a, b, box, label, size=520):
    x0, y0, x1, y1 = [int(v) for v in box]
    A = Image.fromarray(a[y0:y1, x0:x1]); B = Image.fromarray(b[y0:y1, x0:x1])
    k = size / max(A.size); A = A.resize((int(A.width * k), int(A.height * k)), Image.LANCZOS); B = B.resize(A.size, Image.LANCZOS)
    row = Image.new("RGB", (A.width * 2 + 10, A.height + 22), "white")
    row.paste(tag(Image.new("RGB", (A.width, 22)), f"{label}: BEFORE"), (0, 0)); row.paste(A, (0, 22))
    row.paste(tag(Image.new("RGB", (A.width, 22)), "AFTER"), (A.width + 10, 0)); row.paste(B, (A.width + 10, 22))
    return row
for stem in (sys.argv[1:] or [os.path.splitext(os.path.basename(p))[0] for p in glob.glob(f"{OUT}/IMG_*.jpg")]):
    a = np.asarray(Image.open(f"{R}/work/{stem}.jpg").convert("RGB")); b = np.asarray(Image.open(f"{OUT}/{stem}.jpg").convert("RGB"))
    H, W = a.shape[:2]; boxes = json.load(open(f"{R}/work/{stem}.boxes.json"))
    rows = [pair(a, b, (0, 0, W, H), f"{stem} whole", 700)]
    f = face_box(a)
    if f:
        x, y, w, h = f; c = (x + w / 2, y + h / 2); s = max(w, h) * 1.4
        rows.append(pair(a, b, (max(0, c[0] - s), max(0, c[1] - s * 0.95), min(W, c[0] + s), min(H, c[1] + s * 1.05)), "face"))
    if boxes.get("subject"):
        sx0, sy0, sx1, sy1 = boxes["subject"][:4]; mid = sy0 + (sy1 - sy0) * 0.55
        rows.append(pair(a, b, (sx0, mid, sx1, min(H, mid + (sx1 - sx0) * 1.1)), "body skin"))
    if boxes["distractions"]:
        xs = [v for d in boxes["distractions"] for v in (d[0], d[2])]; ys = [v for d in boxes["distractions"] for v in (d[1], d[3])]
        pad = 150; rows.append(pair(a, b, (max(0, min(xs) - pad), max(0, min(ys) - pad), min(W, max(xs) + pad), min(H, max(ys) + pad)), "tourists"))
    if os.path.exists(f"{R}/work/{stem}-strands-mask.png") and f:
        m = np.asarray(Image.open(f"{R}/work/{stem}-strands-mask.png"))
        x, y, w, h = f; rows.append(pair(a, b, (max(0, x - 1.6 * w), max(0, y - 1.6 * h), min(W, x + 2.6 * w), min(H, y + 1.6 * h)), "stray hairs"))
    for i in range(0, len(rows), 2):
        part = rows[i:i + 2]; wd = max(p.width for p in part)
        sheet = Image.new("RGB", (wd, sum(p.height for p in part) + 10), "white"); yy = 0
        for p in part: sheet.paste(p, (0, yy)); yy += p.height + 10
        sheet.save(f"{CMP}/{stem}_{i // 2 + 1}.jpg", quality=88)
    print(stem, "sheets:", (len(rows) + 1) // 2)
