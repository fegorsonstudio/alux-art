# Retouch proof (14–15 Oct 2026)

This proves the "retouch by DM" engine on the owner's sample photos. It is not wired into
the website. The rule throughout: the AI never redraws the face. Only skin pixels, and the
areas inside an erase mask, change; everything else keeps the original pixels. That rule
exists because generative edits redrew small faces into a different person in October 2026;
see `claude.md`.

## Files

| File | What it does | Paid? |
|---|---|---|
| `rt_engine.py` | Face skin, following the owner's research report (`Desktop\Avoto\reports\Portrait retouching industry standard.md`). | Free |
| `rt_prep.py` | Full-quality working copies (HEIC decoded with pillow-heif). Finds tourists and vehicles: MediaPipe EfficientDet, tiled, and a box only counts if it is small, confident and outside the subject. | Free |
| `rt_style.py` | Learns the owner's colour style from their own before/after edits as a smooth 17³ 3D LUT, with a leave-one-out test. | Free |
| `rt_v3.py` | The full chain, listed below. | Two steps |
| `falcall.mjs` | Makes every paid fal.ai call. Results are cached, so nothing is paid twice, and every call is logged in `fal-ledger.json`. It refuses any call that would take the total past the approved $1. | Gate |
| `rt_sheet_v3.py` | Before/after sheets: whole photo, face, body, erased areas. | Free |

`rt_engine.py`, step by step:

- **Find the face.** YuNet small-face detector, then MediaPipe's 478 face points on a crop. The
  points are cross-checked against YuNet's eyes, nose and mouth; if they disagree, the face goes
  to a person.
- **Heal marks.** Smooth fill plus real texture from right beside the mark; moles are kept.
- **Even the tone.** A dodge-and-burn map at blotch scale. On dark skin it burns rather than
  dodges.
- **Colour and shine.** Grey "ashy" patches get their warmth back, and shine is toned down.
  Jewellery is shielded only where piercings sit, on the nose wings and nostrils.

`rt_v3.py`, in order:

1. **Hair-accurate cut-out.** fal.ai `fal-ai/birefnet/v2` (Matting, 2048). About 3 s per photo,
   roughly $0.003.
2. **Tourists and stray hairs.** fal.ai `fal-ai/bria/eraser`, $0.04 each. Only pixels inside the
   mask are pasted back. A stray hair is a long, thin strand away from the hair's solid shape, so
   the natural edge of an afro is left alone.
3. **Face skin, eyes and teeth** (free). The eyes get whiter, less red whites and a touch of iris
   clarity; teeth only when visible.
4. **Body skin** (free). Tone, ash and shine maps are made on a small copy and applied at full
   size.
5. **Studio backdrop** (free). Only plain wall in the wall's own colour is cleaned, keeping the
   camera's grain; stools and props keep their pixels.
6. **The owner's colour style** (free). Applied at 70%, outdoor photos only: it was learned from
   Petra edits and tinted grey studio walls pink.
7. **Check** (free). OpenCV SFace same-person score.

## Results on the owner's samples (15 Oct)

**Spend and scores**

- 7 photos processed with 13 paid calls, an estimated $0.28 of the $1 approved.
- Same-person score 0.87–0.94 with the colour style applied.
- Tourists erased in IMG_0195 and IMG_0205. Stray hairs removed in IMG_0164, IMG_1212,
  IMG_1245 and IMG_1250, with the afro edges intact.

**How close the style gets**

- Blind test, the share of the gap to the owner's hand edit that the engine closed: 54%, 59%
  and 26%.
- On the owner's gentler IMG_0190 edit it overshot. They grade each photo differently, and 4
  pairs is a small sample.

## Running it — READ THIS FIRST

The VPS has 3.7 GB of RAM and also runs the live website.

**Always run inside a memory fence:**

    systemd-run --scope --quiet -p MemoryMax=1700M -p MemorySwapMax=0 nice -n 10 venv/bin/python rt_v3.py IMG_0195

On 15 Oct an unfenced run reached 2.8 GB and the kernel's out-of-memory killer stopped it three
times. The website survived only because the killer picked the biggest process. Work at full
size a strip at a time.

**Setup on the VPS:** `/root/retouch-proof` holds a Python venv with opencv-python-headless,
mediapipe, pillow-heif and scipy. The models are in `models/`: yunet, sface, face_landmarker,
selfie_multiclass, efficientdet_lite2. MediaPipe also needs the system packages `libegl1` and
`libgles2`. Customer photos are deleted from the server after every proof run.

**Licences:** check YuNet, SFace, the MediaPipe models, BiRefNet (MIT) and Bria Eraser
(commercial terms) before charging customers.
