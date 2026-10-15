# Retouch proof v3: everything in v2 (face skin) plus eyes, teeth, body skin, stray hairs,
# distractions, studio backdrop and the owner's learned colour style.
#   venv/bin/python rt_v3.py <stem> [<stem> ...]         uses work/<stem>.jpg
# Paid steps go through falcall.mjs (cached, ledger-capped at $1) and only ever replace the
# pixels inside their mask; nothing outside a mask comes from a model.
import os, sys, json, math, subprocess
R = "/root/retouch-proof"
STEMS = sys.argv[1:]
sys.argv = ["rt_engine.py", "natural"]
exec(open(f"{R}/rt_engine.py").read().split("summary = {}")[0])   # face retouch + helpers + models
OUT3 = f"{R}/out-v3"; os.makedirs(OUT3, exist_ok=True)
STYLE_STRENGTH = 0.7
LUT = np.load(f"{R}/style_lut.npy"); NL = round(LUT.shape[0] ** (1 / 3))
IRIS_R, IRIS_L = [468, 469, 470, 471, 472], [473, 474, 475, 476, 477]
INNER_LIPS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
NODE = ["node", "--env-file=/home/aluxart/app/.env.local", f"{R}/falcall.mjs"]

def fal(job, endpoint, est, image, mask=None, extra=None):
    args = NODE + [job, endpoint, str(est), image] + ([mask] if mask else []) + ["--", json.dumps(extra or {})]
    r = subprocess.run(args, capture_output=True, text=True)
    line = (r.stdout.strip().splitlines() or [r.stderr.strip()[-300:]])[-1]
    print("   fal:", line)
    p = f"{R}/fal-cache/{job}.png"
    return p if os.path.exists(p) else None

# ── matte (hair-accurate cut-out of the subject) ──
def matte_for(stem, path, H, W):
    p = fal(f"{stem}-matte", "fal-ai/birefnet/v2", 0.006, path, None,
            {"model": "Matting", "operating_resolution": "2048x2048", "mask_only": True, "output_format": "png"})
    if not p: return None
    m = np.asarray(Image.open(p).convert("L")).astype(np.float32) / 255
    if m.shape != (H, W): m = cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR)
    return m

# ── erase: send a crop + mask, paste back ONLY the masked pixels ──
def erase(img, mask, job, report_key, report):
    ys, xs = np.where(mask > 0.5)
    if len(xs) == 0: return img
    H, W = mask.shape
    pad = 60
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad); y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad)
    crop, mcrop = img[y0:y1, x0:x1], (mask[y0:y1, x0:x1] > 0.5).astype(np.uint8) * 255
    s = min(1.0, 2048 / max(crop.shape[:2]))
    if s < 1:
        crop = cv2.resize(crop, (int(crop.shape[1] * s), int(crop.shape[0] * s)), interpolation=cv2.INTER_AREA)
        mcrop = cv2.resize(mcrop, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_NEAREST)
    cp, mp_ = f"{R}/work/{job}-in.jpg", f"{R}/work/{job}-mask.png"
    Image.fromarray(crop).save(cp, quality=95, subsampling=0); Image.fromarray(mcrop).save(mp_)
    p = fal(job, "fal-ai/bria/eraser", 0.04, cp, mp_, {"mask_type": "manual"})
    if not p: report[report_key] = "eraser failed"; return img
    fill = np.asarray(Image.open(p).convert("RGB"))
    fill = cv2.resize(fill, (x1 - x0, y1 - y0), interpolation=cv2.INTER_CUBIC)
    w = gb(cv2.dilate((mask[y0:y1, x0:x1] > 0.5).astype(np.float32), np.ones((3, 3), np.uint8)), 1.2)[:, :, None]
    out = img.copy()
    out[y0:y1, x0:x1] = (img[y0:y1, x0:x1] * (1 - w) + fill * w + 0.5).astype(np.uint8)
    report[report_key] = f"{int((mask > 0.5).sum())} px replaced"
    return out

def distraction_mask(boxes, matte, H, W):
    m = np.zeros((H, W), np.float32)
    for b in boxes["distractions"]:
        x0, y0, x1, y1 = [int(v) for v in b[:4]]
        dx, dy = int((x1 - x0) * 0.12), int((y1 - y0) * 0.08)
        cv2.ellipse(m, ((x0 + x1) // 2, (y0 + y1) // 2), ((x1 - x0) // 2 + dx, (y1 - y0) // 2 + dy), 0, 0, 360, 1.0, -1)
    if matte is not None:   # never touch the subject
        m *= 1 - cv2.dilate((matte > 0.08).astype(np.float32), np.ones((25, 25), np.uint8))
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

# ── eyes and teeth (free; subtle by design) ──
def eyes_teeth(crop, pts, fh, rep):
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
    rep["eyes_teeth"] = ", ".join(done) or "none visible"
    return np.clip(cv2.cvtColor(lab, cv2.COLOR_Lab2RGB) * 255 + 0.5, 0, 255).astype(np.uint8)

# ── body skin (free): tone, ash and shine maps made small, applied at full size ──
def body_skin(img, matte, face_skin_lab, fh, rep):
    H, W = img.shape[:2]; s = 1400 / max(H, W)
    sm = cv2.resize(img, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    sh, sw = sm.shape[:2]
    mt = cv2.resize(matte, (sw, sh), interpolation=cv2.INTER_AREA) if matte is not None else np.ones((sh, sw), np.float32)
    ys, xs = np.where(mt > 0.5)
    if len(xs) == 0: rep["body_skin"] = "no person found"; return img
    bx0, bx1, by0, by1 = max(0, xs.min() - 20), min(sw, xs.max() + 20), max(0, ys.min() - 20), min(sh, ys.max() + 20)
    crop = np.ascontiguousarray(sm[by0:by1, bx0:bx1])
    cat = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop)).category_mask.numpy_view()
    cat = cv2.resize(cat.astype(np.uint8), (bx1 - bx0, by1 - by0), interpolation=cv2.INTER_NEAREST)
    body = np.zeros((sh, sw), np.float32); body[by0:by1, bx0:bx1] = (cat == 2)
    lab = cv2.cvtColor(sm.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
    dE = np.sqrt(((lab - face_skin_lab) ** 2).sum(axis=2))
    body = body * (mt > 0.5) * (dE < 30)
    body = cv2.morphologyEx(body, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if body.sum() < 200: rep["body_skin"] = "too little visible"; return img
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
    rep["body_skin"] = f"{float(sk.mean() * 100):.1f}% of frame evened"
    # Upsample the smooth correction maps and apply at full size, only inside the person box.
    X0, X1, Y0, Y1 = int(bx0 / s), int(bx1 / s), int(by0 / s), int(by1 / s)
    def up(m): return cv2.resize(m[by0:by1, bx0:bx1] * wgt[by0:by1, bx0:bx1], (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_LINEAR)
    region = img[Y0:Y1, X0:X1].astype(np.float32) / 255
    rl = cv2.cvtColor(region, cv2.COLOR_RGB2Lab)
    rl[:, :, 0] += up(dL); rl[:, :, 1] += up(dA); rl[:, :, 2] += up(dB)
    out = img.copy()
    out[Y0:Y1, X0:X1] = np.clip(cv2.cvtColor(rl, cv2.COLOR_Lab2RGB) * 255 + 0.5, 0, 255).astype(np.uint8)
    return out

# ── studio backdrop (free): remove creases, dust and light spill; keep the grain ──
def clean_backdrop(img, matte, rep):
    H, W = img.shape[:2]; s = 900 / max(H, W)
    sm = cv2.resize(img, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
    mt = cv2.resize(matte, (sm.shape[1], sm.shape[0]), interpolation=cv2.INTER_AREA)
    bg = mt < 0.05
    g = cv2.cvtColor(sm, cv2.COLOR_RGB2GRAY).astype(np.float32)
    texture = float(np.std((g - gb(g, 3))[bg])) if bg.sum() > 1000 else 99
    if texture > 4.0: rep["backdrop"] = f"not a plain backdrop (texture {texture:.1f}), left alone"; return img
    hole = cv2.dilate((mt > 0.05).astype(np.uint8) * 255, np.ones((15, 15), np.uint8))
    filled = cv2.inpaint(sm, hole, 15, cv2.INPAINT_TELEA)
    clean_s = gb(filled.astype(np.float32), 0.03 * max(sm.shape))       # the backdrop's own colour and falloff
    # Only plain wall: close to the backdrop's own colour and smooth around it. A stool, a
    # light stand or a prop is neither, so it keeps its original pixels. Worked out on the
    # small copy — at full size these maps took the process past the server's memory.
    lab_s = cv2.cvtColor((sm / 255).astype(np.float32), cv2.COLOR_RGB2Lab)
    lab_cs = cv2.cvtColor((np.clip(clean_s, 0, 255) / 255).astype(np.float32), cv2.COLOR_RGB2Lab)
    near = np.sqrt(((gb(lab_s, 1) - lab_cs) ** 2).sum(axis=2))
    gl = lab_s[:, :, 0]; tex = np.sqrt(np.maximum(gb(gl * gl, 2) - gb(gl, 2) ** 2, 0))
    wall_s = np.clip((14 - near) / 8, 0, 1) * np.clip((5 - tex) / 3, 0, 1) * (mt < 0.05)
    wall_s = gb(cv2.erode(wall_s, np.ones((3, 3), np.uint8)), 1.5)
    rep["backdrop"] = f"cleaned (texture {texture:.1f}), {float((wall_s > 0.5).mean() * 100):.0f}% of frame was plain wall"
    rep["_studio"] = True
    # Full size, a strip at a time: new wall = clean colour + the camera's own grain.
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
    return out

# ── the owner's colour style (free): learned 3D LUT, trilinear, applied in strips ──
def style(img, strength):
    out = np.empty_like(img); H = img.shape[0]
    for y in range(0, H, 256):
        x = img[y:y + 256].reshape(-1, 3).astype(np.float32) / 255
        g = np.clip(x, 0, 1) * (NL - 1); i0 = np.minimum(np.floor(g).astype(int), NL - 2); fr = g - i0
        delta = np.zeros_like(x)
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    w = (fr[:, 0] if dx else 1 - fr[:, 0]) * (fr[:, 1] if dy else 1 - fr[:, 1]) * (fr[:, 2] if dz else 1 - fr[:, 2])
                    delta += w[:, None] * LUT[((i0[:, 0] + dx) * NL + (i0[:, 1] + dy)) * NL + (i0[:, 2] + dz)]
        out[y:y + 256] = (np.clip(x + strength * delta, 0, 1) * 255 + 0.5).astype(np.uint8).reshape(img[y:y + 256].shape)
    return out

report = {}
for stem in STEMS:
    path = f"{R}/work/{stem}.jpg"
    orig = np.asarray(Image.open(path).convert("RGB")).copy(); H, W = orig.shape[:2]
    boxes = json.load(open(f"{R}/work/{stem}.boxes.json"))
    rep = {}; img = orig.copy()
    print(stem)
    matte = matte_for(stem, path, H, W)
    face = main_face(orig[:, :, ::-1].copy())
    fh_est = (face[3] * 0.95) if face is not None else 0.06 * H
    # 1. distractions, 2. stray hairs — paid, masked, pasted back
    if boxes["distractions"]:
        img = erase(img, distraction_mask(boxes, matte, H, W), f"{stem}-distractions", "distractions", rep)
    if matte is not None and face is not None:
        sm_ = strand_mask(matte, face, fh_est)
        if sm_.sum() > 50: img = erase(img, sm_, f"{stem}-strands", "stray_hairs", rep)
        else: rep["stray_hairs"] = "none found"
    # 3. face skin (v2), eyes and teeth
    if face is not None:
        crop_out, (x0, y0), frep = retouch_face(img, face)
        rep.update({k: v for k, v in frep.items() if k in ("marks_healed", "skipped")})
        if crop_out is not None:
            res = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(crop_out)))
            if res.face_landmarks:
                ch, cw = crop_out.shape[:2]
                pts = np.array([[p.x * cw, p.y * ch] for p in res.face_landmarks[0]], np.float32)
                crop_out = eyes_teeth(crop_out, pts, float(np.linalg.norm(pts[10] - pts[152])), rep)
            img[y0:y0 + crop_out.shape[0], x0:x0 + crop_out.shape[1]] = crop_out
            fl = cv2.cvtColor(crop_out.astype(np.float32) / 255, cv2.COLOR_RGB2Lab)
            cy, cx = crop_out.shape[0] // 2, crop_out.shape[1] // 2
            face_lab = np.median(fl[cy - 10:cy + 10, cx - 10:cx + 10].reshape(-1, 3), axis=0)
            img = body_skin(img, matte, face_lab, fh_est, rep)
    # 4. studio backdrop, 5. the owner's colour style
    if matte is not None: img = clean_backdrop(img, matte, rep)
    # The style was learned from outdoor Petra edits: warm rock, deep sky. On a plain studio
    # backdrop it tinted the grey wall pink-brown, so studio photos keep their own colour.
    if rep.pop("_studio", False):
        rep["colour_style"] = "skipped: studio photo (your style was learned from outdoor edits)"
    else:
        img = style(img, STYLE_STRENGTH); rep["colour_style"] = f"learned from 4 of your edits, at {int(STYLE_STRENGTH * 100)}%"
    # 6. same person?
    if face is not None:
        f2 = main_face(img[:, :, ::-1].copy())
        rep["same_person_score"] = round(float(rec.match(identity(orig[:, :, ::-1].copy(), face),
                                                        identity(img[:, :, ::-1].copy(), f2 if f2 is not None else face),
                                                        cv2.FaceRecognizerSF_FR_COSINE)), 3)
    Image.fromarray(img).save(f"{OUT3}/{stem}.jpg", quality=95, subsampling=0)
    report[stem] = rep; print("  ", json.dumps(rep))
prev = json.load(open(f"{OUT3}/_report.json")) if os.path.exists(f"{OUT3}/_report.json") else {}
prev.update(report); json.dump(prev, open(f"{OUT3}/_report.json", "w"), indent=1)
