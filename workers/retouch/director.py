# Glow Retouch director (owner, 15 Oct 2026).
#
# For every client photo: FIND what could need fixing (free detectors), let an AI DECIDE what
# to fix and write the brief top to bottom, turn that into Fegorson Studio settings and exact
# Remove-brush strokes within the owner's house rules, and after the studio computer has
# rendered it, CHECK the result against the brief.
#
# Why the AI does not point at spots itself: on the owner's photo (15 Oct) Gemini's words were
# good but its coordinates were not (a "forehead bump" on the hair parting, obvious strands
# above the head missed). So detectors list every candidate - pimples and marks on the skin,
# stray hairs outside the hair, the hairline - number them on zoomed views, and the AI only
# says yes or no to each. The check uses the same numbers.
#
#   python director.py offline <photo> <work dir>              find + decide, writes JSON
#   python director.py check <photo> <result> <work dir>       check a render against brief.json
import os, io, sys, json, math, time, base64, urllib.request, urllib.error
import numpy as np, cv2
from PIL import Image, ImageOps, ImageDraw, ImageFont
import pillow_heif; pillow_heif.register_heif_opener()
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

MODELS = os.environ.get("RETOUCH_MODELS", "/root/retouch-proof/models")
POSE_MODEL = "/root/fegorson-engine/app/app/vendor/models/pose_landmarker_full.task"
LEDGER = os.environ.get("RETOUCH_FAL_LEDGER", "/root/retouch-worker/fal-ledger.jsonl")
FAL_DAILY_CAP = float(os.environ.get("RETOUCH_FAL_DAILY_USD", "5"))
MAX_SIDE = 6000

# ── house rules: what the AI may set, and the limits the owner chose ──────────────────────
# Only portrait/body controls: the look (light, colour) stays the owner's preset.
ALLOWED = {
    "smooth": (0, 40), "texture": (80, 100), "bodySmooth": (0, 50), "blemish": (0, 85), "wrinkles": (0, 50),
    "evenTone": (0, 50), "shine": (0, 70), "dodgeBurn": (0, 80), "neckLines": (0, 60), "faceLight": (-30, 30),
    "darkCircles": (0, 70), "eyeBright": (0, 45), "eyeWhiten": (0, 45), "eyeSharp": (0, 50), "teeth": (0, 55),
    "stretchMarks": (0, 80), "armpit": (0, 40), "jointTone": (0, 60), "handEven": (0, 60), "handVein": (0, 60),
    "bodyWaist": (0, 20), "bodyHips": (0, 20), "bodyArms": (0, 15), "bodyLegs": (0, 15),
    "hairShine": (0, 50), "creases": (0, 50),
}
SLIDER_HELP = """smooth "Even skin" 0..40 | texture "Keep texture" 80..100 (keep high) | bodySmooth "Even body skin" 0..50 |
blemish 0..85 (strength of the automatic blemish pass) | wrinkles 0..50 | evenTone 0..50 | shine "Shine control" 0..70 |
dodgeBurn 0..80 | neckLines 0..60 | faceLight -30..30 | darkCircles 0..70 | eyeBright "Brighten iris" 0..45 |
eyeWhiten 0..45 | eyeSharp "Eye detail" 0..50 | teeth "Whiten teeth" 0..55 | stretchMarks 0..80 | armpit "Armpit touch-up" 0..40 |
jointTone "Elbows & knees" 0..60 | handEven 0..60 | handVein 0..60 | bodyWaist "Waist" 0..20 | bodyHips "Hips (fuller)" 0..20 |
bodyArms "Slim arms" 0..15 | bodyLegs "Slim legs" 0..15 | hairShine 0..50 | creases "Smooth clothing creases" 0..50"""
HOUSE_RULES = """House rules (the studio owner's, always):
- Identity is sacred: never change face shape, skin colour, body type or who she is. No face-shaping.
- Keep real skin texture; on dark skin, even tone by darkening light patches, never grey, ashy or plastic.
- Keep moles, beauty marks, freckles and tattoos.
- Always remove flyaway/stray hairs against the background, and fix a harsh hair-to-forehead (lace) line.
- Always brighten the eyes a little when they are visible (eyeWhiten and eyeBright at least 10).
- Teeth: whiten only if visible, never paper-white.
- Armpits: touch up gently (never above 40) - over-done armpits look fake.
- Body shaping is subtle (waist/hips never above 20), only where it flatters the pose, never on a slim figure.
- A natural, expensive look. Fix everything a client would notice; overdo nothing."""

# ── models ──────────────────────────────────────────────────────────────────────────────
det = cv2.FaceDetectorYN.create(f"{MODELS}/yunet.onnx", "", (320, 320), 0.6, 0.3, 5000)
lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=f"{MODELS}/face_landmarker.task"), num_faces=1))
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path=f"{MODELS}/selfie_multiclass_256x256.tflite"), output_category_mask=True))
pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=POSE_MODEL))) if os.path.exists(POSE_MODEL) else None

FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
HAIRLINE = [162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389]
EYE_R = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]
EYE_L = [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466]
BROW_R = [46,53,52,65,55,70,63,105,66,107]
BROW_L = [276,283,282,295,285,300,293,334,296,336]
LIPS = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185]
INNER_LIPS = [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191]
NOSE_BASE = [64,98,97,2,326,327,294,278,48]
IRIS_R, IRIS_L = [468,469,470,471,472], [473,474,475,476,477]

def gb(x, s): return cv2.GaussianBlur(x, (0, 0), max(0.5, s))
def mblur(x, m, s): return gb(x * m, s) / np.maximum(gb(m, s), 1e-3)
def poly(shape, pts, idx, dilate=0):
    m = np.zeros(shape, np.uint8); cv2.fillPoly(m, [np.round(pts[idx]).astype(np.int32)], 255)
    if dilate > 0: m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate + 1, 2 * dilate + 1)))
    return m.astype(np.float32) / 255

def load(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if max(im.size) > MAX_SIDE: im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    return im

def main_face(rgb):
    H, W = rgb.shape[:2]; s = 1600 / max(H, W)
    sm = cv2.resize(rgb[:, :, ::-1], (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    det.setInputSize((sm.shape[1], sm.shape[0])); _, f = det.detect(sm)
    if f is None: return None
    f = max(f, key=lambda r: r[2] * r[3]).copy(); f[:14] /= s
    return f

def face_points(rgb, box):
    """478 face points on the best-fitting crop (the proof's cross-check against YuNet)."""
    H, W = rgb.shape[:2]; x, y, w, h = box[:4]; cx, cy = x + w / 2, y + h / 2
    yk = np.array(box[4:14], np.float32).reshape(5, 2); best = None
    for mult in (2.0, 1.6, 2.6, 1.35):
        side = max(w, h) * mult
        x0, y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2)); x1, y1 = int(min(W, cx + side / 2)), int(min(H, cy + side / 2))
        crop = np.ascontiguousarray(rgb[y0:y1, x0:x1]); ch, cw = crop.shape[:2]
        res = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop))
        if not res.face_landmarks: continue
        pts = np.array([[p.x * cw, p.y * ch] for p in res.face_landmarks[0]], np.float32)
        mesh5 = np.array([pts[EYE_R].mean(0), pts[EYE_L].mean(0), pts[1], pts[61], pts[291]])
        ref = yk - np.array([x0, y0], np.float32); fh = float(np.linalg.norm(pts[10] - pts[152]))
        err = min(np.linalg.norm(mesh5 - ref, axis=1).mean(), np.linalg.norm(mesh5[[1, 0, 2, 4, 3]] - ref, axis=1).mean()) / max(fh, 1)
        if best is None or err < best[0]: best = (err, pts + np.array([x0, y0], np.float32))
        if err < 0.06: break
    return None if best is None or best[0] > 0.12 else best[1]

# ── paid helper: the hair-accurate cut-out (fal BiRefNet, ~$0.002) ───────────────────────
def fal_spent_today():
    day = time.strftime("%Y-%m-%d", time.gmtime()); total = 0.0
    if os.path.exists(LEDGER):
        for line in open(LEDGER):
            try:
                r = json.loads(line)
                if str(r.get("at", "")).startswith(day): total += float(r.get("est_usd", 0))
            except Exception: pass
    return total

def matte(im):
    """Subject matte at the size of `im` (pass a crop of the head for strand detail), or None
    (no key, cap reached, fal down)."""
    key = os.environ.get("FAL_KEY") or os.environ.get("FAL_API_KEY")
    if not key or fal_spent_today() + 0.003 > FAL_DAILY_CAP: return None
    sm = im.copy(); sm.thumbnail((2048, 2048), Image.LANCZOS)
    buf = io.BytesIO(); sm.save(buf, "JPEG", quality=92)
    body = json.dumps({"image_url": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(),
                       "model": "Matting", "operating_resolution": "2048x2048", "mask_only": True,
                       "output_format": "png", "sync_mode": True}).encode()
    req = urllib.request.Request("https://fal.run/fal-ai/birefnet/v2", data=body, method="POST", headers={
        "Authorization": f"Key {key}", "Content-Type": "application/json", "X-Fal-Store-IO": "0"})
    t = time.time(); ok = False
    try:
        with urllib.request.urlopen(req, timeout=120) as r: out = json.loads(r.read())
        url = out["image"]["url"]
        data = base64.b64decode(url.split(",", 1)[1]) if url.startswith("data:") else urllib.request.urlopen(url, timeout=60).read()
        m = Image.open(io.BytesIO(data)).convert("L").resize(im.size, Image.BILINEAR); ok = True
        return np.asarray(m).astype(np.float32) / 255
    except Exception:
        return None
    finally:
        with open(LEDGER, "a") as f:
            f.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "endpoint": "fal-ai/birefnet/v2",
                                "est_usd": round(max(0.001, (time.time() - t) * 0.000575), 4), "ok": ok, "by": "director"}) + "\n")

# ── FIND ────────────────────────────────────────────────────────────────────────────────
def find(im):
    """Every candidate the director may approve, plus measurements. Coordinates are fractions
    of the photo (Fegorson Studio's stroke convention), radii fractions of its long side."""
    a = np.asarray(im); H, W = a.shape[:2]; L = max(W, H)
    out = {"W": W, "H": H, "candidates": {}, "measure": {}, "face_box": None, "body_box": None, "skin_box": None}
    face = main_face(a); pts = face_points(a, face) if face is not None else None
    fr = lambda x, y: [round(float(x) / W, 5), round(float(y) / H, 5)]
    if face is not None:
        x, y, w, h = [float(v) for v in face[:4]]; m = 0.9 * max(w, h)
        out["face_box"] = [int(max(0, x - m)), int(max(0, y - 1.1 * m)), int(min(W, x + w + m)), int(min(H, y + h + 0.6 * m))]
    if pts is not None:
        fh = float(np.linalg.norm(pts[10] - pts[152]))
        # Work in a crop around the face at full detail.
        x0, y0 = int(max(0, pts[:, 0].min() - 0.5 * fh)), int(max(0, pts[:, 1].min() - 0.6 * fh))
        x1, y1 = int(min(W, pts[:, 0].max() + 0.5 * fh)), int(min(H, pts[:, 1].max() + 0.4 * fh))
        crop = np.ascontiguousarray(a[y0:y1, x0:x1]); ch, cw = crop.shape[:2]; p = pts - np.array([x0, y0], np.float32)
        cat = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop)).category_mask.numpy_view()
        cat = cv2.resize(np.squeeze(cat).astype(np.uint8), (cw, ch), interpolation=cv2.INTER_NEAREST)
        # Wide guards around the features: on the owner's photo the AI once approved the edge of a
        # nostril and the corner of an eye, so those never reach it as candidates.
        g = lambda f: max(2, int(f * fh))
        keep_out = np.maximum.reduce([poly((ch, cw), p, EYE_R, g(0.06)), poly((ch, cw), p, EYE_L, g(0.06)),
                                      poly((ch, cw), p, BROW_R, g(0.025)), poly((ch, cw), p, BROW_L, g(0.025)),
                                      poly((ch, cw), p, LIPS, g(0.035)), poly((ch, cw), p, NOSE_BASE, g(0.045))])
        out["skin_box"] = [int(max(0, pts[:, 0].min() - 0.03 * fh)), int(max(0, pts[10][1] - 0.22 * fh)),
                           int(min(W, pts[:, 0].max() + 0.03 * fh)), int(min(H, pts[152][1] + 0.02 * fh))]
        oval = cv2.dilate(poly((ch, cw), p, FACE_OVAL), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.06 * fh) | 1,) * 2))
        skin = ((cat == 3).astype(np.float32) * oval * (1 - keep_out) * (1 - cv2.dilate((cat == 1).astype(np.float32), np.ones((3, 3), np.uint8))))
        lab = cv2.cvtColor(crop.astype(np.float32) / 255, cv2.COLOR_RGB2Lab); Lc, A, B = lab[:, :, 0], lab[:, :, 1], lab[:, :, 2]
        # Pimples and marks: small, round, sharp spots darker or redder than the skin right
        # around them. Band-pass, so a shadow (under the eye, a smile line, the temples) is
        # not a spot: on the owner's photo the first version marked exactly those.
        s_spot = max(1.2, 0.012 * fh)
        Ls = gb(Lc, 0.5 * s_spot); As = gb(A, 0.5 * s_spot)
        dL = Ls - mblur(Lc, skin, 2.5 * s_spot); dA = As - mblur(A, skin, 2.5 * s_spot)
        inner = cv2.erode((skin > 0.5).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.03 * fh) | 1,) * 2))
        cand = (((dL < -4.0) | ((dA > 3.5) & (dL < -1.0))) & (inner > 0)).astype(np.uint8)
        cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        n, cc, st, cen = cv2.connectedComponentsWithStats(cand)
        amax = math.pi * (0.016 * fh) ** 2; spots = []
        for i in range(1, n):
            area = st[i, cv2.CC_STAT_AREA]; bw, bh = st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT]
            if area < 4 or area > amax or max(bw, bh) > 2.6 * max(1, min(bw, bh)): continue   # round-ish only
            comp = cc == i; depth = float(-dL[comp].mean()); red = float(dA[comp].mean())
            spots.append((depth * math.sqrt(area) + 3 * max(0, red), cen[i], math.sqrt(area / math.pi), depth, red))
        spots.sort(key=lambda s: -s[0])
        for k, (score, c, rad, depth, red) in enumerate(spots[:40], 1):
            gx, gy = c[0] + x0, c[1] + y0
            out["candidates"][f"F{k}"] = {"kind": "face spot", "xy": fr(gx, gy), "r": round(max(rad * 1.8, 3) / L, 5),
                                         "darker_by": round(depth, 1), "redder_by": round(red, 1),
                                         "stroke": {"q": 0, "r": round(max(rad * 1.8, 3) / L, 5), "p": fr(gx, gy)}}
        # The hairline: where hair meets forehead skin in the segmenter's map, above the brows.
        # (The face points' top contour sits on the forehead, well below the real hairline:
        # a stroke along it fixed nothing on the owner's photo.) Offered as one candidate; the
        # director decides whether a harsh or lace line shows.
        hair = (cat == 1).astype(np.uint8); fskin = (cat == 3).astype(np.uint8)
        edge = (cv2.dilate(hair, np.ones((5, 5), np.uint8)) & fskin).astype(bool)
        brow_y = float(min(p[BROW_R][:, 1].min(), p[BROW_L][:, 1].min()))
        fx0, fx1 = float(p[FACE_OVAL][:, 0].min()), float(p[FACE_OVAL][:, 0].max())
        ys_, xs_ = np.nonzero(edge)
        sel = (ys_ < brow_y - 0.04 * fh) & (xs_ > fx0) & (xs_ < fx1)
        ys_, xs_ = ys_[sel], xs_[sel]; hl = []
        if len(xs_) > 20:
            bins = np.linspace(fx0, fx1, 17)
            for b0, b1 in zip(bins[:-1], bins[1:]):
                m_ = (xs_ >= b0) & (xs_ < b1)
                if m_.sum() >= 3: hl.append(((b0 + b1) / 2 + x0, float(np.median(ys_[m_])) + y0))
        if len(hl) >= 4:
            out["candidates"]["H"] = {"kind": "hairline", "points": [fr(*q) for q in hl],
                                      "stroke": {"q": 0, "r": round(0.010 * fh / L, 5), "p": [v for q in hl for v in fr(*q)]}}
        # Eyes and teeth, measured, so the director's numbers rest on more than a glance.
        sk = skin > 0.5
        out["measure"]["face_skin_L"] = round(float(np.median(Lc[sk])), 1) if sk.any() else None
        def eye(EYE, IRIS):
            e = poly((ch, cw), p, EYE); c = p[IRIS[0]]; r = float(np.linalg.norm(p[IRIS[1:]] - c, axis=1).mean())
            ir = np.zeros((ch, cw), np.float32); cv2.circle(ir, (int(c[0]), int(c[1])), max(2, int(r)), 1.0, -1)
            scl = (e * (1 - ir)) > 0.5; iris = (e * ir) > 0.5
            if scl.sum() < 20: return None
            return {"white_L": round(float(np.median(Lc[scl])), 1), "white_red": round(float(np.median(A[scl])), 1),
                    "white_yellow": round(float(np.median(B[scl])), 1), "iris_L": round(float(np.median(Lc[iris])), 1) if iris.any() else None}
        out["measure"]["eyes"] = [e for e in (eye(EYE_R, IRIS_R), eye(EYE_L, IRIS_L)) if e]
        mouth = poly((ch, cw), p, INNER_LIPS) > 0.5
        teeth = mouth & (Lc > np.median(Lc[mouth]) if mouth.any() else mouth) & (np.hypot(A, B) < 25)
        out["measure"]["teeth_visible"] = bool(teeth.sum() > (0.02 * fh) ** 2 * 3)
        if out["measure"]["teeth_visible"]:
            out["measure"]["teeth_yellow"] = round(float(np.median(B[teeth])), 1)
        out["measure"]["face_height_px"] = int(fh)
    # Stray hairs: thin strands sticking out from the hair against the background. The matte
    # is made from a crop of the head at full detail: from the whole photo shrunk to 2048 px the
    # finest strands vanish (3 found on the owner's photo, which has dozens).
    M = None
    if face is not None:
        x, y, w, h = [float(v) for v in face[:4]]; fh = h * 0.95
        hx0, hx1 = int(max(0, x - 1.8 * w)), int(min(W, x + w + 1.8 * w)); hy0, hy1 = int(max(0, y - 1.6 * h)), int(min(H, y + h + 1.2 * h))
        M = matte(im.crop((hx0, hy0, hx1, hy1)))
    if M is not None and face is not None:
        aa = M; k = max(5, int(0.06 * fh)) | 1
        solid = cv2.morphologyEx((aa > 0.5).astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        # Loose on purpose: the director approves strands one by one, so a candidate too many
        # costs nothing, while one missed stays in the client's photo.
        near = cv2.dilate(solid, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.03 * fh) | 1,) * 2))
        thin = ((aa > 0.06) & (near == 0)).astype(np.uint8)
        n, cc, st, _ = cv2.connectedComponentsWithStats(thin); strands = []
        for i in range(1, n):
            bw, bh, area = st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT], st[i, cv2.CC_STAT_AREA]
            length = math.hypot(bw, bh)
            if length > 0.035 * fh and area / max(length, 1) < 0.025 * fh:
                ys, xs = np.nonzero(cc == i); P = np.stack([xs, ys], 1).astype(np.float32); mu = P.mean(0)
                axis = np.linalg.svd(P - mu, full_matrices=False)[2][0]; t = (P - mu) @ axis
                order = np.argsort(t); idx = order[np.linspace(0, len(order) - 1, min(14, len(order))).astype(int)]
                path = [fr(P[j, 0] + hx0, P[j, 1] + hy0) for j in idx]
                strands.append((length, path, max(2.0, area / max(length, 1))))
        strands.sort(key=lambda s: -s[0])
        for k2, (length, path, thick) in enumerate(strands[:30], 1):
            out["candidates"][f"S{k2}"] = {"kind": "stray hair", "points": path,
                                           "stroke": {"q": 0, "r": round(max(thick * 1.6, 3) / L, 5), "p": [v for q in path for v in q]}}
    out["measure"]["matte"] = M is not None
    # The body, for body spots and the director's view.
    if pose is not None:
        s2 = 1024 / L; small = cv2.resize(a, (int(W * s2), int(H * s2)), interpolation=cv2.INTER_AREA)
        res = pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(small)))
        if res.pose_landmarks:
            q = np.array([[pp.x * W, pp.y * H] for pp in res.pose_landmarks[0][11:25]])
            bx0, by0 = q.min(0); bx1, by1 = q.max(0); pad = 0.18 * (bx1 - bx0)
            out["body_box"] = [int(max(0, bx0 - pad)), int(max(0, by0 - pad)), int(min(W, bx1 + pad)), int(min(H, by1 + 1.2 * pad))]
    if out["body_box"]:
        bx0, by0, bx1, by1 = out["body_box"]; bs = min(1.0, 2048 / max(bx1 - bx0, by1 - by0))
        bc = cv2.resize(np.ascontiguousarray(a[by0:by1, bx0:bx1]), None, fx=bs, fy=bs, interpolation=cv2.INTER_AREA)
        cat = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=bc)).category_mask.numpy_view()
        cat = cv2.resize(np.squeeze(cat).astype(np.uint8), (bc.shape[1], bc.shape[0]), interpolation=cv2.INTER_NEAREST)
        body = (cat == 2).astype(np.float32)
        lab = cv2.cvtColor(bc.astype(np.float32) / 255, cv2.COLOR_RGB2Lab); Lc, A = lab[:, :, 0], lab[:, :, 1]
        dL = Lc - mblur(Lc, body, 6); dA = A - mblur(A, body, 6)
        cand = (((dL < -6.0) | ((dA > 5) & (dL < -2))) & (cv2.erode(body, np.ones((5, 5), np.uint8)) > 0.5)).astype(np.uint8)
        n, cc, st, cen = cv2.connectedComponentsWithStats(cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)))
        spots = []
        for i in range(1, n):
            area = st[i, cv2.CC_STAT_AREA]; bw, bh = st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT]
            if area < 6 or area > 400 or max(bw, bh) > 2.6 * max(1, min(bw, bh)): continue   # round-ish only
            comp = cc == i; spots.append((float(-dL[comp].mean()) * math.sqrt(area), cen[i], math.sqrt(area / math.pi)))
        spots.sort(key=lambda s: -s[0])
        for k3, (score, c, rad) in enumerate(spots[:25], 1):
            gx, gy = c[0] / bs + bx0, c[1] / bs + by0; rr = max(rad * 1.8 / bs, 3)
            out["candidates"][f"B{k3}"] = {"kind": "body spot", "xy": fr(gx, gy), "r": round(rr / L, 5),
                                          "stroke": {"q": 0, "r": round(rr / L, 5), "p": fr(gx, gy)}}
    return out

# ── views for the AI, with the candidates numbered on them ──────────────────────────────
def views(im, found, prefix, work, marked=True):
    W, H = im.size; L = max(W, H); paths = {}
    try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    except Exception: font = None
    def view(name, box, long_edge, kinds):
        x0, y0, x1, y1 = box; c = im.crop((x0, y0, x1, y1)); s = min(1.0, long_edge / max(c.size))
        if s < 1: c = c.resize((int(c.width * s), int(c.height * s)), Image.LANCZOS)
        if marked and kinds:
            d = ImageDraw.Draw(c)
            for cid, cd in found["candidates"].items():
                if cd["kind"] not in kinds: continue
                col = {"face spot": (255, 230, 0), "body spot": (255, 230, 0), "stray hair": (0, 230, 255), "hairline": (255, 0, 200)}[cd["kind"]]
                tx = lambda q: ((q[0] * W - x0) * s, (q[1] * H - y0) * s)
                if "xy" in cd:
                    px, py = tx(cd["xy"]); rr = max(9, cd["r"] * L * s * 2.2)
                    if not (0 <= px < c.width and 0 <= py < c.height): continue
                    d.ellipse([px - rr, py - rr, px + rr, py + rr], outline=col, width=2)
                    d.text((px + rr + 2, py - rr - 4), cid, fill=col, font=font)
                else:
                    line = [tx(q) for q in cd["points"]]
                    d.line(line, fill=col, width=3); d.text((line[0][0] + 4, line[0][1] - 26), cid, fill=col, font=font)
        f = os.path.join(work, f"{prefix}-{name}.jpg"); c.save(f, quality=90); paths[name] = f
    view("whole", (0, 0, W, H), 1600, {"stray hair"})
    if found["face_box"]:
        view("face", tuple(found["face_box"]), 1600, {"face spot", "hairline"})
    if found["body_box"]:
        view("body", tuple(found["body_box"]), 1600, {"body spot"})
    return paths

GRID = 10
COLS = "ABCDEFGHIJ"

def grid_view(im, box, path, long_edge=1600):
    """The face at full detail with a lettered grid: an AI names the squares that hold a
    pimple far more reliably than it gives coordinates; a finder then pinpoints it inside."""
    x0, y0, x1, y1 = box; c = im.crop((x0, y0, x1, y1)); s = min(1.0, long_edge / max(c.size))
    if s < 1: c = c.resize((int(c.width * s), int(c.height * s)), Image.LANCZOS)
    d = ImageDraw.Draw(c); W, H = c.size
    try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    except Exception: font = None
    for i in range(1, GRID):
        d.line([(W * i / GRID, 0), (W * i / GRID, H)], fill=(0, 255, 120), width=1)
        d.line([(0, H * i / GRID), (W, H * i / GRID)], fill=(0, 255, 120), width=1)
    for r in range(GRID):
        for q in range(GRID):
            d.text((W * q / GRID + 3, H * r / GRID + 2), f"{COLS[q]}{r + 1}", fill=(0, 255, 120), font=font)
    c.save(path, quality=90)
    return path

def spots_in_cell(im, box, cell, face_px):
    """The clearest 1-2 spots (darker marks or raised bumps) inside one grid square."""
    x0, y0, x1, y1 = box; q, r = COLS.index(cell[0]), int(cell[1:]) - 1
    cw, ch = (x1 - x0) / GRID, (y1 - y0) / GRID
    cx0, cy0 = int(x0 + q * cw), int(y0 + r * ch); cx1, cy1 = int(cx0 + cw), int(cy0 + ch)
    a = np.asarray(im.crop((cx0, cy0, cx1, cy1))).astype(np.float32) / 255
    if a.size == 0: return []
    lab = cv2.cvtColor(a, cv2.COLOR_RGB2Lab); Lc = lab[:, :, 0]
    s = max(1.2, 0.010 * face_px)
    band = gb(Lc, 0.5 * s) - gb(Lc, 3 * s)           # a mark is darker, a bump has a bright top and dark rim
    score = np.abs(band) * (1 + (band < 0))          # darker marks count double
    m = (score > max(3.0, float(np.percentile(score, 97)))).astype(np.uint8)
    n, cc, st, cen = cv2.connectedComponentsWithStats(cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)))
    found = []
    for i in range(1, n):
        area = st[i, cv2.CC_STAT_AREA]
        if area < 4 or area > math.pi * (0.02 * face_px) ** 2: continue
        found.append((float(score[cc == i].mean()) * math.sqrt(area), cen[i][0] + cx0, cen[i][1] + cy0, math.sqrt(area / math.pi)))
    found.sort(key=lambda t: -t[0])
    return found[:2]

def gallery(im, found, kinds, path, cols=6, tile=200):
    """Every candidate of these kinds, cut from the full-size photo and enlarged, numbered:
    a shadow and a pimple look alike on a whole face and nothing alike up close."""
    W, H = im.size; L = max(W, H)
    items = [(cid, cd) for cid, cd in found["candidates"].items() if cd["kind"] in kinds and "xy" in cd]
    if not items: return None
    try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    except Exception: font = None
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tile + 6), rows * (tile + 30)), (20, 20, 20)); d = ImageDraw.Draw(sheet)
    for i, (cid, cd) in enumerate(items):
        cx, cy = cd["xy"][0] * W, cd["xy"][1] * H; half = max(24, cd["r"] * L * 5)
        c = im.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half))).resize((tile, tile), Image.LANCZOS)
        cd2 = ImageDraw.Draw(c); rr = tile * (cd["r"] * L) / (2 * half) * 1.6 + 4
        cd2.ellipse([tile / 2 - rr, tile / 2 - rr, tile / 2 + rr, tile / 2 + rr], outline=(255, 230, 0), width=1)
        x, y = (i % cols) * (tile + 6), (i // cols) * (tile + 30)
        sheet.paste(c, (x, y + 26)); d.text((x + 4, y + 2), cid, fill=(255, 230, 0), font=font)
    sheet.save(path, quality=90)
    return path

# ── the AI (Gemini) ─────────────────────────────────────────────────────────────────────
PRICES = {"in": 2.0 / 1e6, "out": 12.0 / 1e6}   # gemini-3.1-pro-preview, USD per token (Oct 2026)

def gemini(model, text, images, max_out=16000):
    parts = [{"text": text}]
    for label, path in images:
        parts.append({"text": label})
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(open(path, "rb").read()).decode()}})
    body = json.dumps({"contents": [{"role": "user", "parts": parts}],
                       "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2, "maxOutputTokens": max_out}}).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={os.environ['GEMINI_API_KEY']}"
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=240) as r: j = json.loads(r.read())
    txt = "".join(p.get("text", "") for p in j["candidates"][0]["content"]["parts"])
    u = j.get("usageMetadata", {})
    cost = u.get("promptTokenCount", 0) * PRICES["in"] + (u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)) * PRICES["out"]
    s = txt.strip()
    if s.startswith("```"): s = s.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(s), round(cost, 4)

def legend(found):
    rows = []
    for cid, cd in found["candidates"].items():
        if cd["kind"] == "face spot": rows.append(f"{cid}: face spot, darker by {cd['darker_by']}, redder by {cd['redder_by']}")
        elif cd["kind"] == "body spot": rows.append(f"{cid}: body spot")
        elif cd["kind"] == "stray hair": rows.append(f"{cid}: possible stray hair ({len(cd['points'])} points)")
        else: rows.append(f"{cid}: the hairline (magenta line)")
    return "\n".join(rows) or "(none found)"

def decide(im, found, work, model="gemini-3.1-pro-preview"):
    v = views(im, found, "before", work)
    clean = views(im, found, "clean", work, marked=False)
    prompt = f"""You are the senior retoucher at a Lagos portrait studio; most clients are Black women. A client sent this photo.
Decide exactly how it is retouched so NOTHING a client would notice is left and nothing is overdone.

{HOUSE_RULES}

Measurements from our detectors: {json.dumps(found['measure'])}
(face_skin_L / white_L / iris_L are CIE L 0-100; white_red > 4 or white_yellow > 12 means discoloured whites;
a dull, dark iris has iris_L well below the skin.)

Our spot-finder marked every CANDIDATE (yellow numbered circles = skin spots, cyan lines = possible stray hairs, magenta
line = the hairline). The GALLERY images show each skin-spot candidate up close, cut from the full-size photo: judge them
there. Candidates:
{legend(found)}
The finder is deliberately over-eager: MOST candidates are pores, shadows, skin texture, freckles or hair, and must be
kept. Fix a candidate only if it is clearly a pimple, spot, blemish, scar mark or dark mark a client would want gone, a
flyaway hair against the background, or lint. NEVER fix moles, beauty marks, freckles, pores, nostrils, eyelashes,
jewellery, shadows, or a hair that is part of the hairstyle. "H": fix only if a harsh or visible wig/lace line
between hair and forehead shows.
Give a verdict for EVERY candidate id in "verdicts": "fix: <what it is>" or "keep: <what it is>" (look at its close-up
first; e.g. "keep: shadow by the nose", "fix: raised pimple"), and put the "fix" ones in "approve".
The finder misses some blemishes, especially small raised bumps on dark skin. Look at the GRID view (the face with a
lettered grid, A-J across, 1-10 down) and list in "cells" every square that still holds a pimple, bump, spot or dark
mark to remove which is NOT one of the candidates you approved (e.g. "C4"). Skin only - not hair, eyes, lips or moles.

Then choose the retouch strengths. Sliders (key, meaning, allowed range): {SLIDER_HELP}
List only sliders you want above 0 (texture is kept at 100 unless you say).

Return ONLY JSON:
{{"summary": "one sentence",
 "keep": ["moles, marks, tattoos to keep, and where"],
 "brief": [{{"area": "1 hair" ... "12 background", "found": "...", "do": "...", "priority": "high|medium|low|none"}}],
 "verdicts": {{"F1": "keep: shadow", "F2": "fix: pimple", ...every candidate...}},
 "approve": ["F2", "S1", ...only the fix ones],
 "cells": ["C4", ...squares on the GRID view with blemishes the finder missed],
 "sliders": {{"key": number}},
 "body": {{"shape": "none|subtle", "why": "..."}},
 "check_after": ["..."]}}
Cover the 12 areas top to bottom: 1 hair, 2 forehead, 3 brows, 4 eyes, 5 nose and cheeks, 6 mouth and teeth,
7 chin, jaw and neck, 8 shoulders, chest, arms and armpits, 9 tummy, waist, hips and back, 10 hands, elbows, knees, legs,
11 clothing, 12 background."""
    imgs = [("Image: whole photo (cyan = possible stray hairs)", v["whole"])]
    if "face" in v: imgs += [("Image: face, MARKED", v["face"]), ("Image: face, CLEAN (same view, no marks)", clean["face"])]
    g = gallery(im, found, {"face spot"}, os.path.join(work, "gallery-face.jpg"))
    if g: imgs.append(("Image: GALLERY of face-spot candidates, each up close", g))
    if found["skin_box"]:
        imgs.append(("Image: GRID view of the face skin, hairline to chin (name squares with blemishes the finder missed)",
                     grid_view(im, tuple(found["skin_box"]), os.path.join(work, "grid-face.jpg"), long_edge=2048)))
    if "body" in v: imgs += [("Image: body, MARKED", v["body"]), ("Image: body, CLEAN", clean["body"])]
    g = gallery(im, found, {"body spot"}, os.path.join(work, "gallery-body.jpg"))
    if g: imgs.append(("Image: GALLERY of body-spot candidates, each up close", g))
    brief, cost = gemini(model, prompt, imgs)
    # The approvals follow the verdicts when both are given, so a list cannot drift from them.
    verdicts = brief.get("verdicts") or {}
    if verdicts:
        brief["approve"] = [c for c, v2 in verdicts.items() if str(v2).strip().lower().startswith("fix") and c in found["candidates"]]
    # Squares the AI named: pinpoint the spot inside each and add it as an approved candidate.
    W, H = im.size; L = max(W, H); fpx = found["measure"].get("face_height_px") or 400; k = 0
    for cell in (brief.get("cells") or [])[:30]:
        cell = str(cell).strip().upper()
        if not (len(cell) >= 2 and cell[0] in COLS and cell[1:].isdigit() and 1 <= int(cell[1:]) <= GRID): continue
        if not found["skin_box"]: break
        for score, gx, gy, rad in spots_in_cell(im, tuple(found["skin_box"]), cell, fpx):
            k += 1; cid = f"G{k}"; rr = max(rad * 1.8, 3) / L
            found["candidates"][cid] = {"kind": "grid spot", "cell": cell, "xy": [round(gx / W, 5), round(gy / H, 5)], "r": round(rr, 5),
                                        "stroke": {"q": 0, "r": round(rr, 5), "p": [round(gx / W, 5), round(gy / H, 5)]}}
            brief.setdefault("approve", []).append(cid)
    return brief, cost

# How the studio computer combines these with the owner's preset (tools/glow-retouch-worker):
#   start from the preset; "max" sliders raise it, never lower it (the preset is the floor);
#   "set" sliders replace it (body shaping, face light, and the checker's corrections);
#   then every slider is held inside "caps" (armpit at most 40 even if the preset says 100).
SET_KEYS = {"bodyWaist", "bodyHips", "bodyArms", "bodyLegs", "faceLight"}

def recipe_from(brief, found):
    """The AI's choices inside the house rules: Fegorson Studio settings plus Remove-brush strokes."""
    mx, st = {}, {}
    for k, v in (brief.get("sliders") or {}).items():
        if k in ALLOWED and isinstance(v, (int, float)):
            lo, hi = ALLOWED[k]; (st if k in SET_KEYS else mx)[k] = int(max(lo, min(hi, round(v))))
    if found["measure"].get("eyes"):
        mx["eyeWhiten"] = max(mx.get("eyeWhiten", 0), 10); mx["eyeBright"] = max(mx.get("eyeBright", 0), 10)
    if not found["measure"].get("teeth_visible"): mx.pop("teeth", None)
    if (brief.get("body") or {}).get("shape") != "subtle":
        for k in ("bodyWaist", "bodyHips", "bodyArms", "bodyLegs"): st[k] = 0
    strokes = [found["candidates"][c]["stroke"] for c in (brief.get("approve") or []) if c in found["candidates"]]
    return {"max": mx, "set": st, "caps": {k: list(v) for k, v in ALLOWED.items()}, "healStrokes": strokes[:200]}

# ── CHECK ───────────────────────────────────────────────────────────────────────────────
def check(im_before, im_after, found, brief, work, model="gemini-3.1-pro-preview", recipe=None):
    if im_after.size != im_before.size: im_after = im_after.resize(im_before.size, Image.LANCZOS)
    b = views(im_before, found, "qa-before", work, marked=False); a = views(im_after, found, "qa-after", work, marked=False)
    m = views(im_before, found, "qa-marked", work)
    shaping = {k: (recipe or {}).get("set", {}).get(k, 0) for k in ("bodyWaist", "bodyHips", "bodyArms", "bodyLegs")}
    prompt = f"""You check a retoucher's work before it goes to a paying client. Compare BEFORE and AFTER of each view.
The brief they were given: {json.dumps(brief.get('brief', []))}
Spots they were told to remove: {json.dumps(brief.get('approve', []))} (numbered on the MARKED view).
Body-shaping settings actually used: {json.dumps(shaping)} (0 = none). The body's outline can only change where one of
these is above 0; a smoother or warmer body is not a shape change. Report a shape change only if you can see the
outline itself has moved.
{HOUSE_RULES}

The studio's house look deliberately makes the WHOLE photo warmer (about +20 temperature), adds contrast and a slight
vignette. That is intended: do not fail a warmer overall colour. Fail skin colour only if the skin itself looks blotchy,
grey, ashy, plastic or no longer like this person.
Fail it if a client would notice anything: a pimple, mark or flyaway the brief said to remove is still there; eyes still
dull when the brief said brighten; anything overdone (plastic or grey skin, over-white eyes or teeth, over-retouched
armpits, a warped body or background); any smear, halo, blur patch or repeated texture from the Remove brush; the
person no longer looks exactly like themselves.

Return ONLY JSON:
{{"pass": true or false,
 "score": 0-10,
 "problems": [{{"area": "...", "kind": "left|overdone|artifact|identity", "what": "...", "severity": "high|medium|low"}}],
 "adjust": {{"sliders": {{"key": new value}}, "add": ["candidate ids to remove too"], "drop": ["ids whose removal caused damage"]}}}}
Sliders and ranges for "adjust": {SLIDER_HELP}"""
    imgs = []
    for name in ("face", "whole", "body"):
        if name in b:
            imgs += [(f"Image: {name}, BEFORE", b[name]), (f"Image: {name}, AFTER", a[name])]
    if "face" in m: imgs.append(("Image: face BEFORE with the numbered candidates", m["face"]))
    qa, cost = gemini(model, prompt, imgs)
    high = any(p.get("severity") == "high" for p in qa.get("problems") or [])
    qa["passed"] = bool(qa.get("pass")) and not high
    return qa, cost

def next_recipe(recipe, qa, found):
    """Pass 2: the first recipe with the checker's adjustments, still inside the house rules.
    The checker's values are final ("set"): it saw the result, so it may also lower a slider."""
    st = dict(recipe.get("set") or {})
    for k, v in ((qa.get("adjust") or {}).get("sliders") or {}).items():
        if k in ALLOWED and isinstance(v, (int, float)):
            lo, hi = ALLOWED[k]; st[k] = int(max(lo, min(hi, round(v))))
    drop = set((qa.get("adjust") or {}).get("drop") or [])
    add = [c for c in ((qa.get("adjust") or {}).get("add") or []) if c in found["candidates"]]
    by_stroke = {json.dumps(cd["stroke"], sort_keys=True): cid for cid, cd in found["candidates"].items()}
    kept = [s for s in recipe.get("healStrokes") or [] if by_stroke.get(json.dumps(s, sort_keys=True)) not in drop]
    have = {json.dumps(s, sort_keys=True) for s in kept}
    kept += [found["candidates"][c]["stroke"] for c in add if json.dumps(found["candidates"][c]["stroke"], sort_keys=True) not in have]
    return {"max": dict(recipe.get("max") or {}), "set": st, "caps": recipe.get("caps") or {k: list(v) for k, v in ALLOWED.items()},
            "healStrokes": kept[:200]}

def load_env(path="/home/aluxart/app/.env.local"):
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1); v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"": v = v[1:-1]
        os.environ.setdefault(k.strip(), v)

if __name__ == "__main__":
    load_env()
    mode = sys.argv[1]
    if mode == "offline":
        photo, work = sys.argv[2], sys.argv[3]; os.makedirs(work, exist_ok=True)
        im = load(photo); t = time.time(); found = find(im); t_find = time.time() - t
        brief, cost = decide(im, found, work)
        rec = recipe_from(brief, found)
        json.dump(found, open(os.path.join(work, "found.json"), "w")); json.dump(brief, open(os.path.join(work, "brief.json"), "w"), indent=1)
        json.dump(rec, open(os.path.join(work, "recipe.json"), "w"), indent=1)
        print(json.dumps({"find_secs": round(t_find, 1), "candidates": len(found["candidates"]), "approved": len(brief.get("approve") or []),
                          "max": rec["max"], "set": rec["set"], "strokes": len(rec["healStrokes"]), "cost_usd": cost,
                          "cells": brief.get("cells"), "measure": found["measure"]}))
    elif mode == "check":
        photo, result, work = sys.argv[2], sys.argv[3], sys.argv[4]
        found = json.load(open(os.path.join(work, "found.json"))); brief = json.load(open(os.path.join(work, "brief.json")))
        rec = json.load(open(os.path.join(work, "recipe.json"))) if os.path.exists(os.path.join(work, "recipe.json")) else None
        qa, cost = check(load(photo), load(result), found, brief, work, recipe=rec)
        json.dump(qa, open(os.path.join(work, "qa.json"), "w"), indent=1)
        print(json.dumps({"passed": qa["passed"], "score": qa.get("score"), "cost_usd": cost, "problems": qa.get("problems")}, indent=1))
