# Learn the owner's colour grade from their own before/after pairs, as one smooth 3D LUT.
#   venv/bin/python rt_style.py            -> fits, leave-one-out test, writes style_lut.npy
import os, glob, math, json
import numpy as np, cv2
from PIL import Image, ImageOps
import pillow_heif; pillow_heif.register_heif_opener()
from scipy.sparse import csr_matrix, vstack, identity
from scipy.sparse.linalg import lsqr

T = "/root/retouch-proof/train"
N = 17                      # LUT nodes per axis
W = 700                     # working width for fitting

def load(p):
    return np.asarray(ImageOps.exif_transpose(Image.open(p)).convert("RGB"))

def edges(rgb, w):
    g = cv2.cvtColor(cv2.resize(rgb, (w, int(rgb.shape[0] * w / rgb.shape[1])), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY).astype(np.float32)
    g = np.log(g + 8)
    gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
    return cv2.GaussianBlur(np.hypot(gx, gy), (0, 0), 1)

def align(orig, edit):
    """Where does `edit` sit inside `orig`? Same scale assumed (crops), found on edge maps."""
    s = 400 / orig.shape[1]
    eo, ee = edges(orig, 400), edges(edit, int(edit.shape[1] * s))
    if ee.shape[0] > eo.shape[0] or ee.shape[1] > eo.shape[1]:
        return None, -1
    r = cv2.matchTemplate(eo, ee, cv2.TM_CCOEFF_NORMED)
    _, score, _, loc = cv2.minMaxLoc(r)
    return (int(loc[0] / s), int(loc[1] / s)), score

# Pairs: each edit with the original it best matches.
origs = {os.path.basename(p): load(p) for p in sorted(glob.glob(f"{T}/*.heic") + glob.glob(f"{T}/*.HEIC") + glob.glob(f"{T}/*-orig.jpg"))}
pairs = []
for ep in sorted(glob.glob(f"{T}/*edit*.jpg") + glob.glob(f"{T}/*.PNG")):
    edit = load(ep)
    best = None
    for name, o in origs.items():
        if abs(o.shape[1] - edit.shape[1]) > 2: continue
        off, sc = align(o, edit)
        if off is not None and (best is None or sc > best[2]): best = (name, off, sc)
    en = os.path.basename(ep)
    if best is None or best[2] < 0.5:
        print(f"{en}: no matching original here (best {best[2] if best else None})"); continue
    name, (ox, oy), sc = best
    o = origs[name][oy:oy + edit.shape[0], ox:ox + edit.shape[1]]
    print(f"{en}  <-  {name}  offset ({ox},{oy})  match {sc:.2f}")
    h = int(edit.shape[0] * W / edit.shape[1])
    a = cv2.resize(o, (W, h), interpolation=cv2.INTER_AREA).reshape(-1, 3).astype(np.float32) / 255
    b = cv2.resize(edit, (W, h), interpolation=cv2.INTER_AREA).reshape(-1, 3).astype(np.float32) / 255
    ok = (a.max(1) < 0.985) & (b.max(1) < 0.995) & (a.min(1) > 0.01)
    pairs.append({"edit": en, "orig": name, "a": a[ok], "b": b[ok]})

def weights(x):
    """Trilinear weights of colours x (n,3 in 0..1) onto an N^3 grid, as a sparse matrix."""
    g = np.clip(x, 0, 1) * (N - 1)
    i0 = np.minimum(np.floor(g).astype(int), N - 2); f = g - i0
    rows, cols, vals = [], [], []
    n = len(x); idx = np.arange(n)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                node = ((i0[:, 0] + dx) * N + (i0[:, 1] + dy)) * N + (i0[:, 2] + dz)
                rows.append(idx); cols.append(node); vals.append(w)
    return csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, N ** 3))

def smoother():
    rows, cols, vals, r = [], [], [], 0
    for i in range(N):
        for j in range(N):
            for k in range(N):
                c = (i * N + j) * N + k
                for di, dj, dk in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
                    if i + di < N and j + dj < N and k + dk < N:
                        rows += [r, r]; cols += [c, ((i + di) * N + j + dj) * N + k + dk]; vals += [1, -1]; r += 1
    return csr_matrix((vals, (rows, cols)), shape=(r, N ** 3))

L = smoother()
grid = np.stack(np.meshgrid(*[np.linspace(0, 1, N)] * 3, indexing="ij"), -1).reshape(-1, 3)

def fit(ps, lam=4.0, per=60000):
    a = np.concatenate([p["a"][np.random.default_rng(1).choice(len(p["a"]), min(per, len(p["a"])), replace=False)] for p in ps])
    b = np.concatenate([p["b"][np.random.default_rng(1).choice(len(p["b"]), min(per, len(p["b"])), replace=False)] for p in ps])
    Wm = weights(a)
    # Fit the CHANGE (edit - original) so an empty corner of the cube means "leave it alone".
    A = vstack([Wm, L * math.sqrt(lam * len(a) / L.shape[0])]).tocsr()
    lut = np.zeros((N ** 3, 3), np.float32)
    for c in range(3):
        y = np.concatenate([b[:, c] - a[:, c], np.zeros(L.shape[0])])
        lut[:, c] = lsqr(A, y, atol=1e-6, btol=1e-6, iter_lim=400)[0]
    return lut   # per-node change

def apply(rgb01, lut):
    flat = rgb01.reshape(-1, 3)
    out = flat + weights(flat) @ lut
    return np.clip(out, 0, 1).reshape(rgb01.shape)

def dE(x, y):
    lx = cv2.cvtColor(x.reshape(-1, 1, 3).astype(np.float32), cv2.COLOR_RGB2Lab).reshape(-1, 3)
    ly = cv2.cvtColor(y.reshape(-1, 1, 3).astype(np.float32), cv2.COLOR_RGB2Lab).reshape(-1, 3)
    return float(np.sqrt(((lx - ly) ** 2).sum(1)).mean())

print("\nleave-one-out: how close the learned style gets to each hand edit it never saw (colour difference, lower is closer)")
res = {}
for i, p in enumerate(pairs):
    lut = fit([q for j, q in enumerate(pairs) if j != i])
    pred = apply(p["a"], lut)
    before, after = dE(p["a"], p["b"]), dE(pred, p["b"])
    res[p["edit"]] = {"original_vs_your_edit": round(before, 1), "engine_vs_your_edit": round(after, 1), "gap_closed_pct": round((1 - after / before) * 100)}
    print(f"  {p['edit']:<24} original->your edit {before:5.1f}   engine->your edit {after:5.1f}   gap closed {res[p['edit']]['gap_closed_pct']}%")
lut = fit(pairs)
np.save("/root/retouch-proof/style_lut.npy", lut)
json.dump(res, open("/root/retouch-proof/style_test.json", "w"), indent=1)
print("style learned from", len(pairs), "pairs -> style_lut.npy")
