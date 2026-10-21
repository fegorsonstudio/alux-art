"""HEIC → lossless PNG with a current libheif (pillow-heif), for lib/heic.ts.

Ubuntu 24.04's libheif is 1.17.6, which refuses many iPhone photos from iOS 18
on ("Non-existing depth image referenced", libheif issue #1213, fixed in 1.18).
pillow-heif bundles a current libheif. Venv: /home/aluxart/heic-venv
(python3 -m venv, pip install pillow-heif).

    python convert.py <in.heic> <out.png>

Writes the primary image, rotated as the photo says, with its ICC profile.
Exit 0 on success; anything else is a failure, with the reason on stderr.
"""
import sys

from PIL import Image, ImageOps
import pillow_heif


def main(src: str, dst: str) -> None:
    pillow_heif.register_heif_opener()
    with Image.open(src) as im:
        icc = im.info.get("icc_profile")
        im = ImageOps.exif_transpose(im)  # no-op when libheif has already applied the rotation
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")
        im.save(dst, "PNG", compress_level=1, **({"icc_profile": icc} if icc else {}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: convert.py <in.heic> <out.png>")
    main(sys.argv[1], sys.argv[2])
