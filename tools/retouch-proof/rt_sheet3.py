# Before | Natural | Polished, zoomed on the face, plus the whole photo before | Polished.
import os, json
from PIL import Image, ImageDraw
R = "/root/retouch-proof"
nat, pol = json.load(open(f"{R}/out-natural/_report.json")), json.load(open(f"{R}/out-polished/_report.json"))
os.makedirs(f"{R}/compare", exist_ok=True)
S = 430
def zoom(p, frac=0.62):
    im = Image.open(p); w, h = im.size; c = int(min(w, h) * frac)
    return im.crop(((w - c) // 2, int((h - c) * 0.45), (w - c) // 2 + c, int((h - c) * 0.45) + c)).resize((S, S), Image.LANCZOS)
def label(im, text):
    d = ImageDraw.Draw(im); d.rectangle([0, 0, im.width, 22], fill=(0, 0, 0)); d.text((6, 5), text, fill=(255, 255, 255)); return im
for stem, r in nat.items():
    if "skipped" in r or "skipped" in pol.get(stem, {}): continue
    b = zoom(f"{R}/out-natural/{stem}_face_before.png")
    n = zoom(f"{R}/out-natural/{stem}_face_after.png")
    p = zoom(f"{R}/out-polished/{stem}_face_after.png")
    row = Image.new("RGB", (S * 3 + 20, S + 22), "white")
    for i, (im, t) in enumerate(((b, f"{stem}  BEFORE"), (n, f"NATURAL  same person {r['same_person_score']}"),
                                 (p, f"POLISHED  same person {pol[stem]['same_person_score']}"))):
        tile = Image.new("RGB", (S, S + 22), "black"); tile.paste(im, (0, 22)); label(tile, t); row.paste(tile, (i * (S + 10), 0))
    row.save(f"{R}/compare/{stem}_faces.jpg", quality=90)
    # whole photo, before | polished, at a viewable size
    a0 = Image.open(f"{R}/in/../out-polished/{stem}.jpg"); orig = None
    from PIL import ImageOps
    import pillow_heif; pillow_heif.register_heif_opener()
    for ext in ("heic", "HEIC", "JPG", "jpg"):
        if os.path.exists(f"{R}/in/{stem}.{ext}"): orig = ImageOps.exif_transpose(Image.open(f"{R}/in/{stem}.{ext}")).convert("RGB")
    H = 900
    o = orig.resize((int(orig.width * H / orig.height), H), Image.LANCZOS); a = a0.resize(o.size, Image.LANCZOS)
    whole = Image.new("RGB", (o.width * 2 + 10, H + 22), "white")
    whole.paste(label(Image.new("RGB", (o.width, 22)), f"{stem}  BEFORE"), (0, 0)); whole.paste(o, (0, 22))
    whole.paste(label(Image.new("RGB", (o.width, 22)), "POLISHED"), (o.width + 10, 0)); whole.paste(a, (o.width + 10, 22))
    whole.save(f"{R}/compare/{stem}_whole.jpg", quality=88)
print(sorted(os.listdir(f"{R}/compare")))
