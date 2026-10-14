# PROOF of the "retouch by DM" engine — no generative AI, no paid calls.
#
# The professional order (Desktop\Avoto\reports\Portrait retouching industry standard.md):
#   1. find the face and its parts        (YuNet small-face detector, MediaPipe 478 face points,
#                                           MediaPipe skin/hair/clothes map)
#   2. heal small marks                   (replace only those pixels: smooth fill + real skin texture
#                                           borrowed from right beside the mark)
#   3. even the light at blotch scale     (dodge & burn as a brightness map laid over untouched
#                                           pixels; pores and texture are never blurred)
#   4. colour                             (give grey "ashy" phone-HDR patches back the skin's own warmth)
#   5. shine                              (tone hot spots down, keep the highlight)
#   6. check                              (face-recognition similarity original vs result)
# Dark skin rule from the research: burn rather than dodge — brightening is capped hard, so skin
# never turns grey. Nothing outside the skin is touched; eyes, brows, lips, nostrils, hair,
# jewellery and clothes keep their original pixels.
#
#   venv/bin/python rt_engine.py [level]     level: natural (default) | polished
import os, sys, json, math
import cv2, numpy as np
from PIL import Image, ImageOps
import pillow_heif; pillow_heif.register_heif_opener()
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

LEVEL = sys.argv[1] if len(sys.argv) > 1 else "natural"
K = {"natural": dict(even=0.55, bags=0.70, glab=0.65, ashy=0.80, shine=0.45, heal=True),
     "polished": dict(even=0.80, bags=0.90, glab=0.85, ashy=1.00, shine=0.85, heal=True)}[LEVEL]
ROOT = "/root/retouch-proof"
IN, OUT = f"{ROOT}/in", f"{ROOT}/out-{LEVEL}"
os.makedirs(OUT, exist_ok=True)

det = cv2.FaceDetectorYN.create(f"{ROOT}/models/yunet.onnx", "", (320, 320), 0.6, 0.3, 5000)
rec = cv2.FaceRecognizerSF.create(f"{ROOT}/models/sface.onnx", "")
lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=f"{ROOT}/models/face_landmarker.task"), num_faces=1))
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path=f"{ROOT}/models/selfie_multiclass_256x256.tflite"),
    output_category_mask=True))

FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
EYE_R = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]
EYE_L = [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466]
BROW_R = [46,53,52,65,55,70,63,105,66,107]
BROW_L = [276,283,282,295,285,300,293,334,296,336]
LIPS = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185]
NOSE_BASE = [64,98,97,2,326,327,294,278,48]
UNDER_R = [33,7,163,144,145,153,154,155,133, 244,233,232,231,230,229,228,31,226]
UNDER_L = [362,382,381,380,374,373,390,249,263, 446,261,448,449,450,451,452,453,464]

def to_lin(x):  return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
def to_srgb(x): return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)
def gb(x, s):   return cv2.GaussianBlur(x, (0, 0), max(0.5, s))
def mblur(x, m, s):
    return gb(x * m, s) / np.maximum(gb(m, s), 1e-3)
def poly(shape, pts, idx, dilate=0):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.round(pts[idx]).astype(np.int32)], 255)
    if dilate > 0: m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate + 1, 2 * dilate + 1)))
    return m.astype(np.float32) / 255

def main_face(bgr):
    H, W = bgr.shape[:2]; s = 1600 / max(H, W)
    sm = cv2.resize(bgr, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    det.setInputSize((sm.shape[1], sm.shape[0])); _, f = det.detect(sm)
    if f is None: return None
    f = max(f, key=lambda r: r[2] * r[3]).copy()
    f[:14] /= s
    return f

def identity(bgr, face):
    return rec.feature(rec.alignCrop(bgr, face))

def retouch_face(rgb, box):
    """Returns the retouched crop, its origin and a report of what was done."""
    H, W = rgb.shape[:2]
    x, y, w, h = box[:4]; cx, cy = x + w / 2, y + h / 2
    yk = np.array(box[4:14], np.float32).reshape(5, 2)    # YuNet: eyes, nose tip, mouth corners
    best = None
    for mult in (2.0, 1.6, 2.6, 1.35):
        side = max(w, h) * mult
        x0, y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
        x1, y1 = int(min(W, cx + side / 2)), int(min(H, cy + side / 2))
        crop = np.ascontiguousarray(rgb[y0:y1, x0:x1])
        ch, cw = crop.shape[:2]
        res = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop))
        if not res.face_landmarks: continue
        pts = np.array([[p.x * cw, p.y * ch] for p in res.face_landmarks[0]], np.float32)
        mesh5 = np.array([pts[EYE_R].mean(0), pts[EYE_L].mean(0), pts[1], pts[61], pts[291]])
        ref = yk - np.array([x0, y0], np.float32)
        fh_ = float(np.linalg.norm(pts[10] - pts[152]))
        err = min(np.linalg.norm(mesh5 - ref, axis=1).mean(), np.linalg.norm(mesh5[[1, 0, 2, 4, 3]] - ref, axis=1).mean()) / max(fh_, 1)
        if best is None or err < best[0]: best = (err, crop, pts, x0, y0)
        if err < 0.06: break
    if best is None: return None, (0, 0), {"skipped": "face points not found (face turned away or covered) - send to a person"}
    err, crop, pts, x0, y0 = best
    if err > 0.10: return None, (x0, y0), {"skipped": f"face points did not line up with the face (error {err:.2f}) - send to a person"}
    ch, cw = crop.shape[:2]
    fh = float(np.linalg.norm(pts[10] - pts[152]))        # forehead top to chin

    # ── masks ──
    cat = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop)).category_mask.numpy_view()
    cat = cv2.resize(cat.astype(np.uint8), (cw, ch), interpolation=cv2.INTER_NEAREST)
    face_skin = (cat == 3).astype(np.float32)
    d = max(2, int(0.015 * fh))
    keep_out = np.maximum.reduce([poly((ch, cw), pts, EYE_R, 2 * d), poly((ch, cw), pts, EYE_L, 2 * d),
                                  poly((ch, cw), pts, BROW_R, d), poly((ch, cw), pts, BROW_L, d),
                                  poly((ch, cw), pts, LIPS, d), poly((ch, cw), pts, NOSE_BASE, d)])
    oval = poly((ch, cw), pts, FACE_OVAL)
    hair = (cat == 1).astype(np.float32)
    oval = cv2.dilate(oval, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.10 * fh) | 1, int(0.10 * fh) | 1)))
    skin = oval * face_skin * (1 - keep_out) * (1 - cv2.dilate(hair, np.ones((3, 3), np.uint8)))
    skin = cv2.erode(skin, np.ones((3, 3), np.uint8))
    # Small things far from skin colour inside the face are jewellery or glints: never retouched.
    lab0 = cv2.cvtColor(crop.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
    sk0 = skin > 0.5
    med = np.array([np.median(lab0[:, :, i][sk0]) for i in range(3)], np.float32)
    dE = np.sqrt(((lab0 - med) ** 2).sum(axis=2))
    far = ((dE > 30) & (lab0[:, :, 0] > med[0] + 28)).astype(np.uint8)
    n_f, cc_f, st_f, _ = cv2.connectedComponentsWithStats(far)
    foreign = np.zeros((ch, cw), np.uint8)
    for i in range(1, n_f):
        if st_f[i, cv2.CC_STAT_AREA] < math.pi * (0.018 * fh) ** 2: foreign[cc_f == i] = 1
    foreign = cv2.dilate(foreign, np.ones((5, 5), np.uint8)).astype(np.float32)
    skin = skin * (1 - foreign)
    keep_out = np.maximum(keep_out, foreign)
    soft = gb(skin, 0.006 * fh) * skin + 0 * skin           # hard inside, used for statistics
    feather = np.clip(gb(skin, 0.012 * fh) * 1.4, 0, 1) * (1 - gb(keep_out, 0.006 * fh))
    under = np.maximum(poly((ch, cw), pts, UNDER_R), poly((ch, cw), pts, UNDER_L)) * (1 - keep_out)
    under = gb(under, 0.02 * fh)
    gl_c = (pts[107] + pts[336]) / 2 * 0.5 + (pts[168] + pts[151]) / 2 * 0.5
    glab = np.zeros((ch, cw), np.float32)
    cv2.ellipse(glab, (int(gl_c[0]), int(gl_c[1])), (int(0.09 * fh), int(0.11 * fh)), 0, 0, 360, 1.0, -1)
    glab = gb(glab * skin, 0.02 * fh)

    src = crop.astype(np.float32) / 255
    lab = cv2.cvtColor(src, cv2.COLOR_RGB2Lab)               # L 0..100, a/b ±
    Lc, A, B = [lab[:, :, i].copy() for i in range(3)]
    report = {"face_px": int(fh)}

    # ── 2. heal small marks: smooth fill + borrowed real texture ──
    healed = 0
    if K["heal"]:
        s_spot = max(1.2, 0.012 * fh)
        dL = Lc - mblur(Lc, skin, 3 * s_spot)
        dA = A - mblur(A, skin, 3 * s_spot)
        cand = (((dL < -5.0) | ((dA > 4.0) & (dL < -1.5))) & (skin > 0.5)).astype(np.uint8)
        cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        n, lab_cc, stats, cents = cv2.connectedComponentsWithStats(cand)
        amax = math.pi * (0.035 * fh) ** 2
        heal_mask = np.zeros((ch, cw), np.float32)
        for i in range(1, n):
            area = stats[i, cv2.CC_STAT_AREA]
            if area < 4 or area > amax: continue
            comp = lab_cc == i
            # A very dark, sharp, not-red spot is most likely a mole: kept, as portrait retouchers do.
            if dL[comp].mean() < -12 and dA[comp].mean() < 1.0: continue
            heal_mask[comp] = 1; healed += 1
        heal_mask = cv2.dilate(heal_mask, np.ones((3, 3), np.uint8))
        if healed:
            r = max(2, int(2.5 * s_spot))
            hm8 = (heal_mask > 0).astype(np.uint8)
            for chn in (Lc, A, B):
                LF = gb(chn, s_spot); HF = chn - LF
                LFf = cv2.inpaint(LF.astype(np.float32), hm8, r, cv2.INPAINT_TELEA)
                # texture from beside the mark: pick the shift whose source is most skin
                best, cover = None, -1
                for dx, dy in ((2 * r, 0), (-2 * r, 0), (0, 2 * r), (0, -2 * r)):
                    sh = np.roll(np.roll(skin, dy, 0), dx, 1)
                    c = (sh[hm8 > 0]).mean()
                    if c > cover: best, cover = (dx, dy), c
                HFs = np.roll(np.roll(HF, best[1], 0), best[0], 1)
                wgt = gb(heal_mask, 0.6)
                chn[:] = chn * (1 - wgt) + (LFf + HFs) * wgt
    report["marks_healed"] = healed

    # ── 3. even the light at blotch scale (dodge & burn map on untouched pixels) ──
    rgb_lin = to_lin(cv2.cvtColor(np.clip(np.dstack([Lc, A, B]), [0, -128, -128], [100, 127, 127]).astype(np.float32), cv2.COLOR_Lab2RGB))
    Y = 0.2126 * rgb_lin[:, :, 0] + 0.7152 * rgb_lin[:, :, 1] + 0.0722 * rgb_lin[:, :, 2]
    lg = np.log(Y + 1e-4)
    s_small, s_mid, s_bag = 0.012 * fh, 0.06 * fh, 0.10 * fh
    band = mblur(lg, skin, s_small) - mblur(lg, skin, s_mid)              # blotches, creases, small shadows
    bagband = mblur(lg, skin, s_small) - mblur(lg, skin, s_bag)           # under-eye darkness is a bit wider
    k = K["even"] + (K["glab"] - K["even"]) * glab
    corr = -k * band - (K["bags"] - K["even"]) * under * np.minimum(bagband, 0)
    corr = np.clip(corr, math.log(0.80), math.log(1.06))                  # burn freely, dodge very little
    corr = gb(corr, 0.4) * feather
    report["even_max_lift_pct"] = round(float((np.exp(corr.max()) - 1) * 100), 1)
    report["even_max_burn_pct"] = round(float((1 - np.exp(corr.min())) * 100), 1)
    rgb_lin = rgb_lin * np.exp(corr)[:, :, None]

    # ── 4 + 5. colour: ashy grey patches get the skin's own warmth back; shine toned down ──
    lab2 = cv2.cvtColor(to_srgb(np.clip(rgb_lin, 0, 1)).astype(np.float32), cv2.COLOR_RGB2Lab)
    L2, A2, B2 = lab2[:, :, 0], lab2[:, :, 1], lab2[:, :, 2]
    sk = skin > 0.5
    C2 = np.hypot(A2, B2)
    c_med = float(np.median(C2[sk])); l_med = float(np.median(L2[sk]))
    hue = math.atan2(float(np.median(B2[sk])), float(np.median(A2[sk])))
    ashy = np.clip((c_med - mblur(C2, skin, 0.03 * fh)) / max(c_med, 1e-3), 0, 1) * np.clip((mblur(L2, skin, 0.03 * fh) - l_med) / 12, 0, 1)
    ashy = gb(ashy, 0.02 * fh) * feather * K["ashy"]
    target_a, target_b = c_med * math.cos(hue), c_med * math.sin(hue)
    A2 = A2 + (target_a - A2) * np.clip(ashy * 1.2, 0, 0.9)
    B2 = B2 + (target_b - B2) * np.clip(ashy * 1.2, 0, 0.9)
    L2 = L2 - np.clip(L2 - l_med, 0, None) * ashy * 0.55
    shine = np.clip((mblur(L2, skin, 0.015 * fh) - mblur(L2, skin, 0.08 * fh) - 6) / 10, 0, 1) * np.clip((c_med * 0.85 - C2) / max(c_med, 1e-3) + 0.5, 0, 1)
    shine = gb(shine, 0.012 * fh) * feather * K["shine"]
    L2 = L2 - (mblur(L2, skin, 0.015 * fh) - mblur(L2, skin, 0.08 * fh) - 6).clip(0) * shine * 0.6
    report["ashy_area_pct"] = round(float((ashy > 0.15).sum() / max(sk.sum(), 1) * 100), 1)
    report["shine_area_pct"] = round(float((shine > 0.15).sum() / max(sk.sum(), 1) * 100), 1)

    out = cv2.cvtColor(np.dstack([L2, A2, B2]).astype(np.float32), cv2.COLOR_Lab2RGB)
    out = np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)
    # Only skin changes: everything else is the original crop, pixel for pixel.
    wfin = np.maximum(feather, gb((skin > 0).astype(np.float32), 0.004 * fh) * (skin > 0))[:, :, None]
    out = (crop * (1 - wfin) + out * wfin + 0.5).astype(np.uint8)
    report["skin_pct_of_crop"] = round(float(sk.mean() * 100), 1)
    return out, (x0, y0), report

summary = {}
for f in sorted(os.listdir(IN)):
    stem = os.path.splitext(f)[0]
    pil = ImageOps.exif_transpose(Image.open(f"{IN}/{f}")).convert("RGB")
    rgb = np.asarray(pil).copy(); bgr = rgb[:, :, ::-1].copy()
    box = main_face(bgr)
    if box is None:
        summary[stem] = {"skipped": "no face visible"}; print(stem, summary[stem]); continue
    crop_out, (x0, y0), rep = retouch_face(rgb, box)
    if crop_out is None:
        summary[stem] = rep; print(stem, rep); continue
    result = rgb.copy(); result[y0:y0 + crop_out.shape[0], x0:x0 + crop_out.shape[1]] = crop_out
    rb = result[:, :, ::-1].copy()
    f2 = main_face(rb)
    sim = float(rec.match(identity(bgr, box), identity(rb, f2 if f2 is not None else box), cv2.FaceRecognizerSF_FR_COSINE))
    changed = np.abs(result.astype(np.int16) - rgb.astype(np.int16)).max(axis=2) > 2
    rep.update({"same_person_score": round(sim, 3), "pixels_changed_pct_of_photo": round(float(changed.mean() * 100), 2)})
    Image.fromarray(result).save(f"{OUT}/{stem}.jpg", quality=95, subsampling=0)
    Image.fromarray(rgb[y0:y0 + crop_out.shape[0], x0:x0 + crop_out.shape[1]]).save(f"{OUT}/{stem}_face_before.png")
    Image.fromarray(crop_out).save(f"{OUT}/{stem}_face_after.png")
    summary[stem] = rep; print(stem, json.dumps(rep))
json.dump(summary, open(f"{OUT}/_report.json", "w"), indent=1)
