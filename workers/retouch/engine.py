# Glow Retouch engine: one customer photo in, one retouched photo out.
#
#   python engine.py <in> <out.jpg> <report.json> <workdir> [--no-paid]
#
# Exit codes, read by worker.py:
#   0  retouched; the report says what was done
#   2  needs a person; report["reason"] says why (no clear face, the check failed)
#   3  a paid step (cut-out or eraser) was unavailable; worker.py retries, then
#      runs again with --no-paid
#
# Built from the proof in tools/retouch-proof (rt_engine.py, rt_prep.py, rt_v3.py),
# which was checked on the owner's own samples on 15 Oct 2026. The rule throughout:
# the face is never redrawn. Only skin pixels change, plus the areas inside an
# erase mask; every other pixel is the customer's own. Generative edits redrew
# small faces into a different person in October 2026 (see claude.md), which is
# why nothing here asks a model to produce the picture.
#
# The VPS has 3.7 GB and also runs the website. worker.py runs this inside a 1700 MB
# memory fence, and full-size work is done a strip at a time.
import os, sys, json, math, resource, subprocess
import cv2, numpy as np
from PIL import Image, ImageOps
import pillow_heif; pillow_heif.register_heif_opener()
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

Image.MAX_IMAGE_PIXELS = 120_000_000
NO_PAID = "--no-paid" in sys.argv
SRC, DST, REPORT, WORK = [a for a in sys.argv[1:] if not a.startswith("--")][:4]
MODELS = os.environ.get("RETOUCH_MODELS", "/root/retouch-proof/models")
FAL_HELPER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fal.mjs")
MAX_SIDE = 6000            # longest side worked on; larger photos are resized to this
MIN_SAME_PERSON = 0.75     # SFace cosine, original vs result; the proof scored 0.87-0.94
os.makedirs(WORK, exist_ok=True)

rep = {"steps": [], "paid": [], "peak_mb": {}}

def mem(stage):
    """Peak memory so far, by stage: the fence is 1700 MB and an earlier version was killed at 2.8 GB."""
    rep["peak_mb"][stage] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)

def finish(code, **kw):
    mem("end")
    rep.update(kw)
    with open(REPORT, "w") as f: json.dump(rep, f, indent=1, default=float)
    sys.exit(code)

class PaidUnavailable(Exception): pass

# "natural" strength from the proof
K = dict(even=0.55, bags=0.70, glab=0.65, ashy=0.80, shine=0.45, heal=True)

det = cv2.FaceDetectorYN.create(f"{MODELS}/yunet.onnx", "", (320, 320), 0.6, 0.3, 5000)
rec = cv2.FaceRecognizerSF.create(f"{MODELS}/sface.onnx", "")
lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=f"{MODELS}/face_landmarker.task"), num_faces=1))
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path=f"{MODELS}/selfie_multiclass_256x256.tflite"),
    output_category_mask=True))
obj = vision.ObjectDetector.create_from_options(vision.ObjectDetectorOptions(
    base_options=BaseOptions(model_asset_path=f"{MODELS}/efficientdet_lite2.tflite"),
    score_threshold=0.35, category_allowlist=["person", "car", "truck", "bus", "motorcycle", "bicycle"]))

FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
EYE_R = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]
EYE_L = [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466]
BROW_R = [46,53,52,65,55,70,63,105,66,107]
BROW_L = [276,283,282,295,285,300,293,334,296,336]
LIPS = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185]
NOSE_BASE = [64,98,97,2,326,327,294,278,48]
UNDER_R = [33,7,163,144,145,153,154,155,133, 244,233,232,231,230,229,228,31,226]
UNDER_L = [362,382,381,380,374,373,390,249,263, 446,261,448,449,450,451,452,453,464]
IRIS_R, IRIS_L = [468, 469, 470, 471, 472], [473, 474, 475, 476, 477]
INNER_LIPS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]

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

def face_region(rgb, face):
    """A BGR copy of the area around the face, and the face moved into it. The
    same-person check needs only this, and a full-size copy costs ~75 MB a time."""
    H, W = rgb.shape[:2]
    x, y, w, h = [float(v) for v in face[:4]]
    m = max(w, h) * 1.5
    x0, y0 = int(max(0, x - m)), int(max(0, y - m))
    x1, y1 = int(min(W, x + w + m)), int(min(H, y + h + m))
    f = np.array(face, np.float32).copy()
    f[0:14:2] -= x0; f[1:14:2] -= y0
    return np.ascontiguousarray(rgb[y0:y1, x0:x1, ::-1]), f

def fake_fal(endpoint, image, out):
    """RETOUCH_FAKE_FAL=1, tests only: stands in for the paid service so the whole
    chain, and its memory, can be exercised without spending. The cut-out comes from
    the free segmenter; the eraser hands the crop back unchanged."""
    im = Image.open(image).convert("RGB")
    if "birefnet" in endpoint:
        im.thumbnail((1024, 1024))
        cat = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(np.asarray(im)))).category_mask.numpy_view()
        Image.fromarray(((np.squeeze(cat) != 0) * 255).astype(np.uint8)).save(out, "PNG")
    else:
        im.save(out, "PNG")
    return out

# ── paid steps: fal.mjs makes the call under the daily cap ──────────────────────
def fal(job, endpoint, est, image, mask=None, extra=None):
    if NO_PAID: raise PaidUnavailable("paid steps switched off for this run")
    if os.environ.get("RETOUCH_FAKE_FAL") == "1":
        rep["paid"].append({"step": job, "endpoint": endpoint, "est_usd": 0, "fake": True})
        return fake_fal(endpoint, image, os.path.join(WORK, f"{job}.result"))
    out = os.path.join(WORK, f"{job}.result")
    cmd = ["node", FAL_HELPER, endpoint, str(est), out, image] + ([mask] if mask else []) + ["--", json.dumps(extra or {})]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
    except subprocess.TimeoutExpired:
        raise PaidUnavailable(f"{endpoint} gave no reply in 4 minutes")
    line = ((r.stdout.strip().splitlines() or [r.stderr.strip()[-300:]]) or [""])[-1]
    if r.returncode != 0 or not os.path.exists(out):
        raise PaidUnavailable(f"{endpoint}: {line[:300]}")
    rep["paid"].append({"step": job, "endpoint": endpoint, "est_usd": est})
    return out

# ── 1. face skin (rt_engine.py) ──────────────────────────────────────────────────
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
    if best is None: return None, (0, 0), {"skipped": "the face's features could not be found (turned away or covered)"}
    err, crop, pts, x0, y0 = best
    if err > 0.10: return None, (x0, y0), {"skipped": f"the face's features did not line up (error {err:.2f})"}
    ch, cw = crop.shape[:2]
    fh = float(np.linalg.norm(pts[10] - pts[152]))        # forehead top to chin

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
    if (skin > 0.5).sum() < 200:
        return None, (x0, y0), {"skipped": "too little face skin visible to retouch"}
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
    # Piercings sit on the nose wings and nostrils. Elsewhere a small bright spot is shine
    # on skin, and shielding it left pale blotches when the skin around it was toned down.
    piercing_zone = poly((ch, cw), pts, [129, 49, 64, 98, 97, 2, 326, 327, 294, 279, 358, 4], int(0.04 * fh))
    foreign = foreign * piercing_zone
    skin = skin * (1 - foreign)
    keep_out = np.maximum(keep_out, foreign)
    feather = np.clip(gb(skin, 0.012 * fh) * 1.4, 0, 1) * (1 - gb(keep_out, 0.006 * fh))
    under = np.maximum(poly((ch, cw), pts, UNDER_R), poly((ch, cw), pts, UNDER_L)) * (1 - keep_out)
    under = gb(under, 0.02 * fh)
    gl_c = (pts[107] + pts[336]) / 2 * 0.5 + (pts[168] + pts[151]) / 2 * 0.5
    glab = np.zeros((ch, cw), np.float32)
    cv2.ellipse(glab, (int(gl_c[0]), int(gl_c[1])), (int(0.09 * fh), int(0.11 * fh)), 0, 0, 360, 1.0, -1)
    glab = gb(glab * skin, 0.02 * fh)

    src = crop.astype(np.float32) / 255
    lab = cv2.cvtColor(src, cv2.COLOR_RGB2Lab)
    Lc, A, B = [lab[:, :, i].copy() for i in range(3)]
    report = {"face_px": int(fh)}

    # heal small marks: smooth fill + real texture borrowed from beside the mark.
    # Each mark is judged on its own. The proof chose ONE texture source direction for
    # every mark at once and healed inside eyeshadow, which copied eyeshadow sparkle and
    # dark specks onto the skin by the inner eye corner (seen at 100% on IMG_1245,
    # 15 Oct 2026). Now a mark is healed only when it, the skin the fill reads from and
    # the patch its texture is borrowed from are all plain skin, clear of the eyes and
    # eyelids, brows, lips, nostrils, hair and jewellery. Anything else is left as it was.
    healed, left_alone = 0, 0
    if K["heal"]:
        s_spot = max(1.2, 0.012 * fh)
        r = max(2, int(2.5 * s_spot))
        lids = np.zeros((ch, cw), np.uint8)
        for side in (BROW_R + EYE_R, BROW_L + EYE_L):
            cv2.fillConvexPoly(lids, cv2.convexHull(np.round(pts[side]).astype(np.int32)), 1)
        lids = cv2.dilate(lids, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * d + 1, 2 * d + 1)))
        safe = cv2.erode(((skin > 0.5) & (lids == 0)).astype(np.uint8),
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))).astype(bool)
        dL = Lc - mblur(Lc, skin, 3 * s_spot)
        dA = A - mblur(A, skin, 3 * s_spot)
        hf_L = Lc - gb(Lc, s_spot)        # the texture itself, to judge where to borrow it from
        cand = (((dL < -5.0) | ((dA > 4.0) & (dL < -1.5))) & (skin > 0.5)).astype(np.uint8)
        cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        n, lab_cc, stats, cents = cv2.connectedComponentsWithStats(cand)
        amax = math.pi * (0.035 * fh) ** 2
        heal_mask = np.zeros((ch, cw), np.float32)
        sources = []          # (rows, cols, dy, dx) per healed mark, its 3x3-grown area
        shifts = [(int(round(k * math.cos(a))), int(round(k * math.sin(a))))
                  for k in (2 * r, 3 * r) for a in np.arange(8) * math.pi / 4]
        grow = np.ones((3, 3), np.uint8)
        for i in range(1, n):
            area = stats[i, cv2.CC_STAT_AREA]
            if area < 4 or area > amax: continue
            comp = lab_cc == i
            # A very dark, sharp, not-red spot is most likely a mole: kept, as portrait retouchers do.
            if dL[comp].mean() < -12 and dA[comp].mean() < 1.0: continue
            bx, by, bw, bh = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP], stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
            ya, yb, xa, xb = max(0, by - 1), min(ch, by + bh + 1), max(0, bx - 1), min(cw, bx + bw + 1)
            ys, xs = np.nonzero(cv2.dilate(comp[ya:yb, xa:xb].astype(np.uint8), grow))
            ys, xs = ys + ya, xs + xa
            if not safe[ys, xs].all():
                left_alone += 1; continue
            # The smoothest nearby patch of plain skin. A patch holding an edge (the side
            # of the nose, a crease) pasted its dark line in as a new mark on IMG_0195.
            pick, edge = None, None
            for dx, dy in shifts:
                sy, sx = ys - dy, xs - dx
                if sy.min() < 0 or sx.min() < 0 or sy.max() >= ch or sx.max() >= cw: continue
                if not safe[sy, sx].all() or heal_mask[sy, sx].any(): continue
                e = float(np.abs(hf_L[sy, sx]).max())
                if edge is None or e < edge: pick, edge = (dy, dx), e
            if pick is None or edge > 6.0:
                left_alone += 1; continue
            heal_mask[ys, xs] = 1; healed += 1
            sources.append((ys, xs) + pick)
        if healed:
            before = (Lc.copy(), A.copy(), B.copy())
            hm8 = (heal_mask > 0).astype(np.uint8)
            wgt = gb(heal_mask, 0.6)
            for chn in (Lc, A, B):
                LF = gb(chn, s_spot); HF = chn - LF
                LFf = cv2.inpaint(LF.astype(np.float32), hm8, r, cv2.INPAINT_TELEA)
                HFs = HF.copy()
                for ys, xs, dy, dx in sources:
                    HFs[ys, xs] = HF[ys - dy, xs - dx]
                chn[:] = chn * (1 - wgt) + (LFf + HFs) * wgt
            # A heal lifts a dark mark. One that leaves any pixel clearly darker than it
            # found it has made a new mark, so that mark goes back exactly as it was.
            for ys, xs, dy, dx in sources:
                ya, yb = max(0, ys.min() - 3), min(ch, ys.max() + 4)
                xa, xb = max(0, xs.min() - 3), min(cw, xs.max() + 4)
                if (before[0][ya:yb, xa:xb] - Lc[ya:yb, xa:xb]).max() > 6.0:
                    for now, was in zip((Lc, A, B), before): now[ya:yb, xa:xb] = was[ya:yb, xa:xb]
                    healed -= 1; left_alone += 1
    report["marks_healed"] = healed
    report["marks_left_alone"] = left_alone

    # even the light at blotch scale (dodge & burn map on untouched pixels)
    rgb_lin = to_lin(cv2.cvtColor(np.clip(np.dstack([Lc, A, B]), [0, -128, -128], [100, 127, 127]).astype(np.float32), cv2.COLOR_Lab2RGB))
    Y = 0.2126 * rgb_lin[:, :, 0] + 0.7152 * rgb_lin[:, :, 1] + 0.0722 * rgb_lin[:, :, 2]
    lg = np.log(Y + 1e-4)
    s_small, s_mid, s_bag = 0.012 * fh, 0.06 * fh, 0.10 * fh
    band = mblur(lg, skin, s_small) - mblur(lg, skin, s_mid)
    bagband = mblur(lg, skin, s_small) - mblur(lg, skin, s_bag)
    k = K["even"] + (K["glab"] - K["even"]) * glab
    corr = -k * band - (K["bags"] - K["even"]) * under * np.minimum(bagband, 0)
    corr = np.clip(corr, math.log(0.80), math.log(1.06))                  # burn freely, dodge very little
    corr = gb(corr, 0.4) * feather
    rgb_lin = rgb_lin * np.exp(corr)[:, :, None]

    # colour: ashy grey patches get the skin's own warmth back; shine toned down
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

    out = cv2.cvtColor(np.dstack([L2, A2, B2]).astype(np.float32), cv2.COLOR_Lab2RGB)
    out = np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)
    # Only skin changes: everything else is the original crop, pixel for pixel.
    wfin = np.maximum(feather, gb((skin > 0).astype(np.float32), 0.004 * fh) * (skin > 0))[:, :, None]
    out = (crop * (1 - wfin) + out * wfin + 0.5).astype(np.uint8)
    return out, (x0, y0), report

# ── 2. tourists and vehicles (rt_prep.py) ────────────────────────────────────────
def iou(a, b):
    x0, y0 = max(a[0], b[0]), max(a[1], b[1]); x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x1 - x0) * max(0, y1 - y0)
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9)

def find_distractions(rgb, face):
    H, W = rgb.shape[:2]
    # Tiles small enough that a tourist 150 px tall is seen at a size the detector knows.
    boxes, T, step = [], 1100, 800
    for ty in range(0, max(1, H - T + step), step):
        for tx in range(0, max(1, W - T + step), step):
            tile = np.ascontiguousarray(rgb[ty:ty + T, tx:tx + T])
            for dd in obj.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=tile)).detections:
                b = dd.bounding_box
                boxes.append([tx + b.origin_x, ty + b.origin_y, tx + b.origin_x + b.width, ty + b.origin_y + b.height,
                              dd.categories[0].category_name, float(dd.categories[0].score)])
    s = 1400 / max(H, W); sm = cv2.resize(rgb, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    for dd in obj.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(sm))).detections:
        b = dd.bounding_box
        boxes.append([b.origin_x / s, b.origin_y / s, (b.origin_x + b.width) / s, (b.origin_y + b.height) / s,
                      dd.categories[0].category_name, float(dd.categories[0].score)])
    boxes.sort(key=lambda b: -b[5]); merged = []
    for b in boxes:
        if all(iou(b, m) < 0.3 for m in merged): merged.append(b)
    subj = None
    if face is not None:
        fx0, fy0, fw, fhh = [float(v) for v in face[:4]]; fx1, fy1 = fx0 + fw, fy0 + fhh
        hold = [m for m in merged if m[4] == "person" and m[0] <= fx0 + fw * 0.3 and m[2] >= fx1 - fw * 0.3 and m[1] <= fy1 and m[3] >= fy0]
        if hold: subj = max(hold, key=lambda m: (m[2] - m[0]) * (m[3] - m[1]))
    if subj is None:
        people = [m for m in merged if m[4] == "person"]
        if people: subj = max(people, key=lambda m: (m[2] - m[0]) * (m[3] - m[1]))
    def inside(m, s_):
        x0, y0 = max(m[0], s_[0]), max(m[1], s_[1]); x1, y1 = min(m[2], s_[2]), min(m[3], s_[3])
        return max(0, x1 - x0) * max(0, y1 - y0) / max(1e-9, (m[2] - m[0]) * (m[3] - m[1]))
    # A distraction is small, confident, and almost entirely outside the subject's own box.
    return [m for m in merged if m is not subj and m[5] >= 0.45
            and (subj is None or inside(m, subj) < 0.10)
            and (m[2] - m[0]) * (m[3] - m[1]) < 0.015 * W * H]

# ── 3. paid: hair-accurate cut-out, and the eraser (rt_v3.py) ─────────────────────
def matte_for(path, H, W):
    p = fal("matte", "fal-ai/birefnet/v2", 0.006, path, None,
            {"model": "Matting", "operating_resolution": "2048x2048", "mask_only": True, "output_format": "png"})
    m = np.asarray(Image.open(p).convert("L")).astype(np.float32) / 255
    if m.shape != (H, W): m = cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR)
    return m

def erase(img, mask, job):
    """Send a crop + mask, paste back ONLY the masked pixels."""
    ys, xs = np.where(mask > 0.5)
    if len(xs) == 0: return img, 0
    H, W = mask.shape
    pad = 60
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad); y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
    crop, mcrop = img[y0:y1, x0:x1], (mask[y0:y1, x0:x1] > 0.5).astype(np.uint8) * 255
    s = min(1.0, 2048 / max(crop.shape[:2]))
    if s < 1:
        crop = cv2.resize(crop, (int(crop.shape[1] * s), int(crop.shape[0] * s)), interpolation=cv2.INTER_AREA)
        mcrop = cv2.resize(mcrop, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_NEAREST)
    cp, mp_ = os.path.join(WORK, f"{job}-in.jpg"), os.path.join(WORK, f"{job}-mask.png")
    Image.fromarray(crop).save(cp, quality=95, subsampling=0); Image.fromarray(mcrop).save(mp_)
    p = fal(job, "fal-ai/bria/eraser", 0.04, cp, mp_, {"mask_type": "manual"})
    fill = np.asarray(Image.open(p).convert("RGB"))
    fill = cv2.resize(fill, (x1 - x0, y1 - y0), interpolation=cv2.INTER_CUBIC)
    w = gb(cv2.dilate((mask[y0:y1, x0:x1] > 0.5).astype(np.float32), np.ones((3, 3), np.uint8)), 1.2)[:, :, None]
    out = img.copy()
    out[y0:y1, x0:x1] = (img[y0:y1, x0:x1] * (1 - w) + fill * w + 0.5).astype(np.uint8)
    return out, int((mask > 0.5).sum())

def distraction_mask(boxes, matte, H, W):
    m = np.zeros((H, W), np.float32)
    for b in boxes:
        x0, y0, x1, y1 = [int(v) for v in b[:4]]
        dx, dy = int((x1 - x0) * 0.12), int((y1 - y0) * 0.08)
        cv2.ellipse(m, ((x0 + x1) // 2, (y0 + y1) // 2), ((x1 - x0) // 2 + dx, (y1 - y0) // 2 + dy), 0, 0, 360, 1.0, -1)
    m *= 1 - cv2.dilate((matte > 0.08).astype(np.float32), np.ones((25, 25), np.uint8))   # never touch the subject
    return m

def strand_mask(matte, face, fh):
    """Loose strands sticking out from the hair against the background — not the hair's own texture."""
    H, W = matte.shape
    x, y, w, h = face[:4]
    hx0, hx1 = int(max(0, x - 1.6 * w)), int(min(W, x + w + 1.6 * w))
    hy0, hy1 = int(max(0, y - 1.6 * h)), int(min(H, y + h + 0.6 * h))
    a = matte[hy0:hy1, hx0:hx1]
    k = max(5, int(0.06 * fh)) | 1
    solid = cv2.morphologyEx((a > 0.5).astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    near = cv2.dilate(solid, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.08 * fh) | 1, int(0.08 * fh) | 1)))
    thin = ((a > 0.12) & (near == 0)).astype(np.uint8)
    n, cc, st, _ = cv2.connectedComponentsWithStats(thin)
    keep = np.zeros_like(thin)
    for i in range(1, n):
        bw, bh, area = st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT], st[i, cv2.CC_STAT_AREA]
        length = math.hypot(bw, bh)
        if length > 0.08 * fh and area / max(length, 1) < 0.02 * fh:   # long and thin = a strand
            keep[cc == i] = 1
    m = np.zeros((H, W), np.float32)
    m[hy0:hy1, hx0:hx1] = cv2.dilate(keep, np.ones((5, 5), np.uint8)).astype(np.float32)
    return m

# ── 4. eyes and teeth (free; subtle by design) ───────────────────────────────────
def eyes_teeth(crop, pts, fh):
    lab = cv2.cvtColor(crop.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
    ch, cw = crop.shape[:2]; L = lab[:, :, 0].copy()
    done = []
    for EYE, IRIS in ((EYE_R, IRIS_R), (EYE_L, IRIS_L)):
        eye = cv2.erode(poly((ch, cw), pts, EYE), np.ones((3, 3), np.uint8))
        if eye.sum() < 30: continue
        c = pts[IRIS[0]]; r = float(np.linalg.norm(pts[IRIS[1:]] - c, axis=1).mean())
        iris = np.zeros((ch, cw), np.float32); cv2.circle(iris, (int(c[0]), int(c[1])), max(2, int(r * 1.05)), 1.0, -1)
        sclera = eye * (1 - iris)
        if sclera.sum() < 15: continue
        lmed = float(np.median(L[sclera > 0.5]))
        scl = gb(sclera * np.clip((L - lmed + 8) / 16, 0, 1), 0.7)
        lab[:, :, 1] -= np.clip(lab[:, :, 1], 0, None) * 0.5 * scl
        lab[:, :, 2] -= np.clip(lab[:, :, 2], 0, None) * 0.3 * scl
        lab[:, :, 0] += np.clip(78 - L, 0, None) * 0.15 * scl
        irm = gb(iris * eye, 0.7)
        lab[:, :, 0] += (L - gb(L, max(1.0, r * 0.25))) * 0.25 * irm
        done.append("eye")
    mouth = poly((ch, cw), pts, INNER_LIPS)
    if mouth.sum() > 3 * (0.02 * fh) ** 2:
        C = np.hypot(lab[:, :, 1], lab[:, :, 2]); lm = float(np.median(L[mouth > 0.5]))
        teeth = gb(cv2.erode(mouth * np.clip((L - lm - 5) / 10, 0, 1) * np.clip((40 - C) / 20, 0, 1), np.ones((3, 3), np.uint8)), 0.7)
        if (teeth > 0.5).sum() > 15:
            lab[:, :, 2] -= np.clip(lab[:, :, 2], 0, None) * 0.45 * teeth
            lab[:, :, 0] += np.clip(85 - L, 0, None) * 0.12 * teeth
            done.append("teeth")
    return np.clip(cv2.cvtColor(lab, cv2.COLOR_Lab2RGB) * 255 + 0.5, 0, 255).astype(np.uint8), done

# ── 5. body skin (free): tone, ash and shine maps made small, applied at full size ─
def body_skin(img, matte, face_skin_lab, fh):
    H, W = img.shape[:2]; s = 1400 / max(H, W)
    sm = cv2.resize(img, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    sh, sw = sm.shape[:2]
    mt = cv2.resize(matte, (sw, sh), interpolation=cv2.INTER_AREA) if matte is not None else np.ones((sh, sw), np.float32)
    ys, xs = np.where(mt > 0.5)
    if len(xs) == 0: return img, "no person found"
    bx0, bx1, by0, by1 = max(0, xs.min() - 20), min(sw, xs.max() + 20), max(0, ys.min() - 20), min(sh, ys.max() + 20)
    crop = np.ascontiguousarray(sm[by0:by1, bx0:bx1])
    cat = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop)).category_mask.numpy_view()
    cat = cv2.resize(cat.astype(np.uint8), (bx1 - bx0, by1 - by0), interpolation=cv2.INTER_NEAREST)
    body = np.zeros((sh, sw), np.float32); body[by0:by1, bx0:bx1] = (cat == 2)
    lab = cv2.cvtColor(sm.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
    dE = np.sqrt(((lab - face_skin_lab) ** 2).sum(axis=2))
    body = body * (mt > 0.5) * (dE < 30)
    body = cv2.morphologyEx(body, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if body.sum() < 200: return img, "too little visible"
    f = fh * s
    Lc, A, B = lab[:, :, 0], lab[:, :, 1], lab[:, :, 2]
    band = mblur(Lc, body, 0.04 * f) - mblur(Lc, body, 0.16 * f)
    dL = np.clip(-0.5 * band, -8, 2)                                  # burn freely, lift very little
    C = np.hypot(A, B); sk = body > 0.5
    c_med, l_med = float(np.median(C[sk])), float(np.median(Lc[sk]))
    hue = math.atan2(float(np.median(B[sk])), float(np.median(A[sk])))
    ashy = np.clip((c_med - mblur(C, body, 0.05 * f)) / max(c_med, 1e-3), 0, 1) * np.clip((mblur(Lc, body, 0.05 * f) - l_med) / 12, 0, 1)
    dA = (c_med * math.cos(hue) - A) * np.clip(ashy * 0.9, 0, 0.8)
    dB = (c_med * math.sin(hue) - B) * np.clip(ashy * 0.9, 0, 0.8)
    dL = dL - np.clip(Lc - l_med, 0, None) * ashy * 0.45
    wgt = np.clip(gb(body, 0.02 * f) * 1.3, 0, 1) * body
    note = f"{float(sk.mean() * 100):.1f}% of frame evened"
    X0, X1, Y0, Y1 = int(bx0 / s), int(bx1 / s), int(by0 / s), int(by1 / s)
    X1, Y1 = min(W, X1), min(H, Y1)
    def up(m): return cv2.resize(m[by0:by1, bx0:bx1] * wgt[by0:by1, bx0:bx1], (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_LINEAR)
    out = img.copy()
    # Applied a strip at a time so the full-size Lab copy never exists at once.
    uL, uA, uB = up(dL), up(dA), up(dB)
    for y in range(0, Y1 - Y0, 512):
        ye = min(y + 512, Y1 - Y0)
        region = img[Y0 + y:Y0 + ye, X0:X1].astype(np.float32) / 255
        rl = cv2.cvtColor(region, cv2.COLOR_RGB2Lab)
        rl[:, :, 0] += uL[y:ye]; rl[:, :, 1] += uA[y:ye]; rl[:, :, 2] += uB[y:ye]
        out[Y0 + y:Y0 + ye, X0:X1] = np.clip(cv2.cvtColor(rl, cv2.COLOR_Lab2RGB) * 255 + 0.5, 0, 255).astype(np.uint8)
    return out, note

# ── 6. studio backdrop (free): creases, dust and spill removed; grain kept ────────
def clean_backdrop(img, matte):
    H, W = img.shape[:2]; s = 900 / max(H, W)
    sm = cv2.resize(img, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    mt = cv2.resize(matte, (sm.shape[1], sm.shape[0]), interpolation=cv2.INTER_AREA)
    bg = mt < 0.05
    g = cv2.cvtColor(sm, cv2.COLOR_RGB2GRAY).astype(np.float32)
    texture = float(np.std((g - gb(g, 3))[bg])) if bg.sum() > 1000 else 99
    if texture > 4.0: return img, None   # not a plain backdrop: left alone
    hole = cv2.dilate((mt > 0.05).astype(np.uint8) * 255, np.ones((15, 15), np.uint8))
    filled = cv2.inpaint(sm, hole, 15, cv2.INPAINT_TELEA)
    clean_s = gb(filled.astype(np.float32), 0.03 * max(sm.shape))
    # Only plain wall: close to the backdrop's own colour and smooth around it. A stool,
    # a light stand or a prop is neither, so it keeps its original pixels.
    lab_s = cv2.cvtColor((sm / 255).astype(np.float32), cv2.COLOR_RGB2Lab)
    lab_cs = cv2.cvtColor((np.clip(clean_s, 0, 255) / 255).astype(np.float32), cv2.COLOR_RGB2Lab)
    near = np.sqrt(((gb(lab_s, 1) - lab_cs) ** 2).sum(axis=2))
    gl = lab_s[:, :, 0]; tex = np.sqrt(np.maximum(gb(gl * gl, 2) - gb(gl, 2) ** 2, 0))
    wall_s = np.clip((14 - near) / 8, 0, 1) * np.clip((5 - tex) / 3, 0, 1) * (mt < 0.05)
    wall_s = gb(cv2.erode(wall_s, np.ones((3, 3), np.uint8)), 1.5)
    note = f"cleaned; {float((wall_s > 0.5).mean() * 100):.0f}% of frame was plain wall"
    out = img.copy(); M = 8
    for y in range(0, H, 384):
        ya, yb = max(0, y - M), min(H, y + 384 + M)
        f = img[ya:yb].astype(np.float32)
        grain = f - gb(f, 1.5)
        sy = np.clip(((np.arange(ya, yb) + 0.5) * sm.shape[0] / H - 0.5), 0, sm.shape[0] - 1)
        sx = np.clip(((np.arange(W) + 0.5) * sm.shape[1] / W - 0.5), 0, sm.shape[1] - 1)
        mapx, mapy = np.meshgrid(sx.astype(np.float32), sy.astype(np.float32))
        clean = cv2.remap(clean_s, mapx, mapy, cv2.INTER_LINEAR)
        wall = cv2.remap(wall_s.astype(np.float32), mapx, mapy, cv2.INTER_LINEAR)[:, :, None]
        a = np.clip(matte[ya:yb], 0, 1)[:, :, None]
        keep = np.maximum(a, 1 - wall)
        strip = np.clip(f * keep + (clean + grain) * (1 - keep) + 0.5, 0, 255).astype(np.uint8)
        out[y:min(H, y + 384)] = strip[y - ya:y - ya + min(384, H - y)]
    return out, note

# ── the chain ────────────────────────────────────────────────────────────────────
pil = Image.open(SRC)
mode0 = pil.mode
icc = pil.info.get("icc_profile") if mode0 in ("RGB", "RGBA", "P", "L") else None
pil = ImageOps.exif_transpose(pil).convert("RGB")
if max(pil.size) > MAX_SIDE:
    rep["resized_from"] = list(pil.size)
    pil.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
work_jpg = os.path.join(WORK, "work.jpg")
pil.save(work_jpg, quality=95, subsampling=0)                 # what the cut-out service sees
orig = np.asarray(pil).copy(); H, W = orig.shape[:2]
rep["width"], rep["height"] = W, H
del pil
mem("loaded")

face = main_face(orig[:, :, ::-1].copy())
if face is None:
    finish(2, reason="no face found: it may be turned away, covered or very small in the frame")
fh_est = float(face[3] * 0.95)
distractions = find_distractions(orig, face)
# What the final check compares against: the original face, kept small.
orig_face_bgr, orig_face_box = face_region(orig, face)
f1 = main_face(orig_face_bgr)       # found in the region, exactly as the result's will be
before_id = identity(orig_face_bgr, f1 if f1 is not None else orig_face_box)
img = orig.copy()
mem("face found")

# 1. cut-out (paid) -> 2. tourists and stray hairs (paid, masked, pasted back)
matte = None
try:
    matte = matte_for(work_jpg, H, W)
    rep["steps"].append("hair-accurate cut-out")
    if distractions:
        img, n = erase(img, distraction_mask(distractions, matte, H, W), "distractions")
        if n: rep["steps"].append(f"{len(distractions)} background distraction(s) removed")
    sm_ = strand_mask(matte, face, fh_est)
    if sm_.sum() > 50:
        img, n = erase(img, sm_, "strands")
        if n: rep["steps"].append("stray hairs removed")
    del sm_
    mem("paid steps")
except PaidUnavailable as e:
    if not NO_PAID: finish(3, reason=str(e))
    matte = None
    img = orig.copy()
    rep["paid_steps_skipped"] = str(e)
del orig    # from here on only the small face copy above is needed

# 3. face skin, eyes and teeth
crop_out, (x0, y0), frep = retouch_face(img, face)
if crop_out is None:
    finish(2, reason=frep.get("skipped", "the face could not be retouched safely"))
rep["marks_healed"] = frep.get("marks_healed", 0)
rep["steps"].append("face skin evened" + (f", {rep['marks_healed']} blemish(es) healed" if rep["marks_healed"] else ""))
res = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(crop_out)))
if res.face_landmarks:
    ch, cw = crop_out.shape[:2]
    pts = np.array([[p.x * cw, p.y * ch] for p in res.face_landmarks[0]], np.float32)
    crop_out, et = eyes_teeth(crop_out, pts, float(np.linalg.norm(pts[10] - pts[152])))
    if et: rep["steps"].append(" and ".join(sorted(set(et))) + " brightened")
img[y0:y0 + crop_out.shape[0], x0:x0 + crop_out.shape[1]] = crop_out
fl = cv2.cvtColor(crop_out.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
cy, cx = crop_out.shape[0] // 2, crop_out.shape[1] // 2
face_lab = np.median(fl[cy - 10:cy + 10, cx - 10:cx + 10].reshape(-1, 3), axis=0)
del fl, crop_out
mem("face retouched")

# 4. body skin
img, note = body_skin(img, matte, face_lab, fh_est)
if "evened" in note: rep["steps"].append("body skin evened")
mem("body skin")

# 5. studio backdrop (needs the cut-out). The owner's learned colour style is NOT applied:
#    it was learned from their own outdoor edits, and a customer's photo keeps its colours.
if matte is not None:
    img, note = clean_backdrop(img, matte)
    if note: rep["steps"].append("studio backdrop cleaned")
del matte
mem("backdrop")

# 6. same person? The check that decides whether this goes to the customer at all.
#    Same region as the original's, so the face is found and aligned the same way.
after_bgr, _ = face_region(img, face)
f2 = main_face(after_bgr)
score = float(rec.match(before_id, identity(after_bgr, f2 if f2 is not None else orig_face_box),
                        cv2.FaceRecognizerSF_FR_COSINE))
rep["same_person_score"] = round(score, 3)
if score < MIN_SAME_PERSON:
    finish(2, reason=f"the check scored the result {score:.2f} for the same face (needs {MIN_SAME_PERSON})")

save_kw = {"quality": 95, "subsampling": 0}
if icc: save_kw["icc_profile"] = icc        # colour profile kept; EXIF (GPS, device) is not
Image.fromarray(img).save(DST, "JPEG", **save_kw)
finish(0)
