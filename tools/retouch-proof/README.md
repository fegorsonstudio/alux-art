# Retouch proof (14 Oct 2026)

A first, free proof of the "retouch by DM" engine: no generative AI and no paid calls.
It only changes skin pixels. Eyes, brows, lips, nostrils, hair, jewellery and clothes keep
their original pixels, and the AI never redraws the face. That rule exists because generative
edits redrew small faces into a different person in October 2026; see `claude.md`.

The order follows the owner's research report (`Desktop\Avoto\reports\Portrait retouching
industry standard.md`):

1. **Find the face.** YuNet small-face detector, then MediaPipe's 478 face points on a crop.
   The points are checked against YuNet's eyes, nose and mouth. If they disagree, the face is
   skipped and sent to a person.
2. **Heal small marks.** Only marks clearly darker or redder than the skin around them; moles
   are kept. Each is filled smoothly, plus real skin texture from right beside it.
3. **Even the light at blotch scale.** A dodge-and-burn brightness map laid over untouched
   pixels. Dark skin rule: burn rather than dodge (lift capped at +6%).
4. **Colour.** Grey "ashy" phone-HDR patches get the skin's own warmth back.
5. **Shine.** Hot spots are toned down while the highlight is kept.
6. **Check.** OpenCV SFace face-recognition similarity between original and result.

Results on the owner's 10 samples (all full-length shots, faces 250–450 px):

- **7 faces retouched:** same-person score 0.91–0.96.
- **3 photos flagged for a person:** turned away, or face covered by a scarf.

Changes are modest on faces this small.

Run on the VPS in `/root/retouch-proof` (Python venv with opencv-python-headless, mediapipe,
pillow-heif; models in `models/`; MediaPipe needs `libegl1 libgles2`):

    venv/bin/python rt_engine.py natural|polished   # reads in/, writes out-<level>/
    venv/bin/python rt_sheet3.py                     # Before | Natural | Polished sheets

Customer photos are deleted from the server after each proof run. Check the model licences
(YuNet, SFace, MediaPipe face landmarker and selfie multiclass segmenter) before any paid use.

Not done yet:

- stray hairs, eyes and teeth
- background clean-up
- body skin (arms and legs)
- a trained skin model on the owner's own before/after pairs
