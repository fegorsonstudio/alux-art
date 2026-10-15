# Free preparation for the paid steps:
#  1. work/<stem>.jpg  full-resolution, upright working copy (HEIC decoded), q95 4:4:4
#  2. distractions: people/vehicles other than the subject, found tile by tile -> work/<stem>.boxes.json
#     and a preview with the boxes drawn -> work/<stem>.boxes.jpg
import os, json, glob
import numpy as np, cv2
from PIL import Image, ImageOps, ImageDraw
import pillow_heif; pillow_heif.register_heif_opener()
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

R = "/root/retouch-proof"
os.makedirs(f"{R}/work", exist_ok=True)
det = cv2.FaceDetectorYN.create(f"{R}/models/yunet.onnx", "", (320, 320), 0.6, 0.3, 5000)
obj = vision.ObjectDetector.create_from_options(vision.ObjectDetectorOptions(
    base_options=BaseOptions(model_asset_path=f"{R}/models/efficientdet_lite2.tflite"),
    score_threshold=0.35, category_allowlist=["person", "car", "truck", "bus", "motorcycle", "bicycle"]))

def main_face(rgb):
    H, W = rgb.shape[:2]; s = 1600 / max(H, W)
    sm = cv2.resize(rgb[:, :, ::-1], (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    det.setInputSize((sm.shape[1], sm.shape[0])); _, f = det.detect(sm)
    if f is None: return None
    f = max(f, key=lambda r: r[2] * r[3]); return [float(v / s) for v in f[:4]]

def iou(a, b):
    x0, y0 = max(a[0], b[0]), max(a[1], b[1]); x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9)

for p in sorted(glob.glob(f"{R}/in/*")):
    stem = os.path.splitext(os.path.basename(p))[0]
    im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
    im.save(f"{R}/work/{stem}.jpg", quality=95, subsampling=0)
    rgb = np.asarray(im); H, W = rgb.shape[:2]
    face = main_face(rgb)
    # Tiles small enough that a tourist 150 px tall is seen at a size the detector knows.
    boxes, T, step = [], 1100, 800
    for ty in range(0, max(1, H - T + step), step):
        for tx in range(0, max(1, W - T + step), step):
            tile = np.ascontiguousarray(rgb[ty:ty + T, tx:tx + T])
            for d in obj.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=tile)).detections:
                b = d.bounding_box
                boxes.append([tx + b.origin_x, ty + b.origin_y, tx + b.origin_x + b.width, ty + b.origin_y + b.height,
                              d.categories[0].category_name, float(d.categories[0].score)])
    # The whole frame too, for anything big (the subject, a cart).
    s = 1400 / max(H, W); sm = cv2.resize(rgb, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    for d in obj.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(sm))).detections:
        b = d.bounding_box
        boxes.append([b.origin_x / s, b.origin_y / s, (b.origin_x + b.width) / s, (b.origin_y + b.height) / s,
                      d.categories[0].category_name, float(d.categories[0].score)])
    # Merge duplicates from overlapping tiles.
    boxes.sort(key=lambda b: -b[5]); merged = []
    for b in boxes:
        if all(iou(b, m) < 0.3 for m in merged): merged.append(b)
    # The subject: the person box holding the main face, or the biggest person.
    subj = None
    if face:
        fx0, fy0, fx1, fy1 = face[0], face[1], face[0] + face[2], face[1] + face[3]
        hold = [m for m in merged if m[4] == "person" and m[0] <= fx0 + face[2] * 0.3 and m[2] >= fx1 - face[2] * 0.3 and m[1] <= fy1 and m[3] >= fy0]
        if hold: subj = max(hold, key=lambda m: (m[2] - m[0]) * (m[3] - m[1]))
    if subj is None:
        people = [m for m in merged if m[4] == "person"]
        if people: subj = max(people, key=lambda m: (m[2] - m[0]) * (m[3] - m[1]))
    def inside(m, s):   # share of box m that lies inside box s
        x0, y0 = max(m[0], s[0]), max(m[1], s[1]); x1, y1 = min(m[2], s[2]), min(m[3], s[3])
        return max(0, x1 - x0) * max(0, y1 - y0) / max(1e-9, (m[2] - m[0]) * (m[3] - m[1]))
    # Tiles see pieces of the subject as separate "people", and cushions or rock as people too.
    # A distraction is small, confident, and almost entirely outside the subject's own box.
    distract = [m for m in merged if m is not subj and m[5] >= 0.45
                and (subj is None or inside(m, subj) < 0.10)
                and (m[2] - m[0]) * (m[3] - m[1]) < 0.015 * W * H]
    json.dump({"size": [W, H], "face": face, "subject": subj, "distractions": distract},
              open(f"{R}/work/{stem}.boxes.json", "w"), default=float)
    pv = im.copy(); pv.thumbnail((900, 900)); k = pv.width / W; dr = ImageDraw.Draw(pv)
    if subj: dr.rectangle([subj[0] * k, subj[1] * k, subj[2] * k, subj[3] * k], outline=(0, 200, 255), width=3)
    for m in distract: dr.rectangle([m[0] * k, m[1] * k, m[2] * k, m[3] * k], outline=(255, 40, 40), width=3)
    pv.save(f"{R}/work/{stem}.boxes.jpg", quality=85)
    print(f"{stem}: {W}x{H}, subject {'found' if subj else 'not found'}, distractions {len(distract)}: " +
          ", ".join(f"{m[4]} {m[5]:.2f} {int(m[2]-m[0])}x{int(m[3]-m[1])}" for m in distract))
