"""Generate Android mipmap icons + splash drawables for Mochi Merge.

Reuses the mochi artwork from make_icons.py. Run after `npx cap add android`:
  python assets/make_android_assets.py
"""

import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
sys.path.insert(0, HERE)
from make_icons import radial_mochi, full_icon, foreground, CREAM  # noqa: E402

# legacy + round launcher icons
LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
# adaptive foreground (108dp base)
FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}
# splash drawables (portrait set + base fallback)
SPLASH_SIZES = {
    "drawable": (480, 320),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}


def save(img: Image.Image, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("wrote", path)


def splash(w: int, h: int) -> Image.Image:
    img = Image.new("RGBA", (w, h), CREAM)
    m = radial_mochi(int(min(w, h) * 0.5))
    img.alpha_composite(m, ((w - m.width) // 2, (h - m.height) // 2))
    return img


def round_icon(size: int) -> Image.Image:
    """Circular-cropped launcher icon."""
    base = full_icon(size)
    mask = Image.new("L", (size, size), 0)
    from PIL import ImageDraw

    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, size, size], fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out


if __name__ == "__main__":
    for folder, px in LAUNCHER_SIZES.items():
        save(full_icon(px), os.path.join(RES, folder, "ic_launcher.png"))
        save(round_icon(px), os.path.join(RES, folder, "ic_launcher_round.png"))
    for folder, px in FOREGROUND_SIZES.items():
        save(foreground(px), os.path.join(RES, folder, "ic_launcher_foreground.png"))
    for folder, (w, h) in SPLASH_SIZES.items():
        save(splash(w, h), os.path.join(RES, folder, "splash.png"))
