"""Free check of a cast member's photo before the paid character sheet is made.

    photo_check.py <kind> <jpeg path>      kind: face | angle | body

Prints one JSON line: {"ok": bool, "problems": [...], "faces": n, "face_h": 0.0-1.0, "sharp": float, "box": [x, y, w, h]}.
Uses OpenCV's YuNet face finder (MIT, 230 KB) — no network, no paid call.
Called by lib/drama/character.ts with a memory cap (ulimit -v). Lenient on
purpose: it turns away only photos the sheet cannot use (no face, two people,
a face too small or too blurred to copy, a close-up sent as the full-body photo).
"""
import json
import os
import sys

import cv2
import numpy as np

MODEL = os.environ.get("YUNET_MODEL", "/home/aluxart/models/yunet.onnx")

# Smallest face height, as a share of the photo height, per photo.
MIN_FACE = {"face": 0.16, "angle": 0.12, "body": 0.035}
# A full-body photo whose face is taller than this is a close-up.
MAX_FACE_BODY = 0.30


def main() -> None:
    kind, path = sys.argv[1], sys.argv[2]
    out = {"ok": False, "problems": [], "faces": 0, "face_h": 0.0, "sharp": 0.0}
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        out["problems"].append("unreadable")
        print(json.dumps(out))
        return
    h, w = img.shape[:2]
    if min(h, w) < 600:
        out["problems"].append("small")

    # Find faces on a copy no wider than 1280 px (fast, and plenty for a face).
    scale = min(1.0, 1280.0 / max(w, h))
    small = cv2.resize(img, (int(w * scale), int(h * scale))) if scale < 1 else img
    det = cv2.FaceDetectorYN.create(MODEL, "", (small.shape[1], small.shape[0]), 0.80, 0.3, 50)
    _, faces = det.detect(small)
    faces = [] if faces is None else [f for f in faces if f[14] >= 0.80]
    faces.sort(key=lambda f: f[2] * f[3], reverse=True)
    out["faces"] = len(faces)
    if not faces:
        out["problems"].append("no_face")
        print(json.dumps(out))
        return
    big = faces[0]
    # A second face more than a fifth the size of the main one is a second person, not a poster on the wall.
    if len(faces) > 1 and faces[1][2] * faces[1][3] > 0.2 * big[2] * big[3]:
        out["problems"].append("two_people")

    fx, fy, fw, fh = (float(v) / scale for v in big[:4])
    face_h = fh / h
    out["face_h"] = round(face_h, 3)
    # The face box in the original image's pixels, for the real-photo sheet (lib/drama/sheet-compose.ts).
    out["box"] = [round(fx), round(fy), round(fw), round(fh)]
    if face_h < MIN_FACE.get(kind, 0.1):
        out["problems"].append("face_small")
    if kind == "body" and face_h > MAX_FACE_BODY:
        out["problems"].append("not_full_body")

    # Sharpness and light on the face itself, at a fixed size so photos compare fairly.
    x0, y0 = max(0, int(fx)), max(0, int(fy))
    x1, y1 = min(w, int(fx + fw)), min(h, int(fy + fh))
    crop = img[y0:y1, x0:x1]
    if crop.size:
        g = cv2.cvtColor(cv2.resize(crop, (256, 256)), cv2.COLOR_BGR2GRAY)
        sharp = float(cv2.Laplacian(g, cv2.CV_64F).var())
        out["sharp"] = round(sharp, 1)
        if sharp < 25 and kind != "body":
            out["problems"].append("blurry")
        mean = float(np.mean(g))
        if mean < 40:
            out["problems"].append("dark")
        elif mean > 230:
            out["problems"].append("bright")

    out["ok"] = not out["problems"]
    print(json.dumps(out))


if __name__ == "__main__":
    main()
