"""Deterministic Mochi Merge app icon generator (PIL, no AI services).

Outputs:
  assets/icon.png             1024x1024 full-bleed icon (cream bg + mochi)
  assets/icon-foreground.png  1024x1024 transparent, mochi at ~62% (adaptive)
  assets/splash.png           1280x1280 cream splash with centered mochi
  public/icon-192.png / public/icon-512.png / public/icon-maskable-512.png
  public/apple-touch-icon.png (180)
Run with the managed python:  python assets/make_icons.py
"""

from PIL import Image, ImageDraw
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

CREAM = (255, 246, 236, 255)      # #fff6ec
PINK_L = (255, 211, 222, 255)     # #ffd3de
PINK = (255, 158, 181, 255)       # #ff9eb5
PINK_D = (232, 126, 153, 255)     # #e87e99
INK = (91, 58, 69, 255)           # #5b3a45
BLUSH = (255, 120, 150, 140)
WHITE = (255, 255, 255, 255)


def radial_mochi(size: int) -> Image.Image:
    """A glossy pastel-pink mochi face, transparent background."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    r = size * 0.46

    # body: vertical-ish gradient PINK_L -> PINK -> PINK_D (drawn as rings)
    steps = 64
    for i in range(steps, 0, -1):
        t = i / steps
        if t > 0.55:
            k = (t - 0.55) / 0.45
            col = tuple(int(PINK_L[c] + (PINK[c] - PINK_L[c]) * k) for c in range(3)) + (255,)
        else:
            k = t / 0.55
            col = tuple(int(PINK[c] + (PINK_D[c] - PINK[c]) * (1 - k)) for c in range(3)) + (255,)
        rr = r * t
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)

    # soft outline
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(180, 110, 140, 70),
              width=max(2, size // 128))

    # glossy highlight
    hl = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse([cx - r * 0.52, cy - r * 0.68, cx - r * 0.08, cy - r * 0.40],
               fill=(255, 255, 255, 110))
    hl = hl.rotate(-24, center=(cx, cy), resample=Image.BICUBIC)
    img.alpha_composite(hl)

    # eyes
    er = r * 0.095
    for ex in (-r * 0.36, r * 0.36):
        d.ellipse([cx + ex - er, cy - r * 0.08 - er, cx + ex + er, cy - r * 0.08 + er], fill=INK)
        cr = er * 0.35
        d.ellipse([cx + ex - er * 0.3 - cr, cy - r * 0.08 - er * 0.3 - cr,
                   cx + ex - er * 0.3 + cr, cy - r * 0.08 - er * 0.3 + cr], fill=WHITE)

    # blush
    for bx in (-r * 0.52, r * 0.52):
        d.ellipse([cx + bx - r * 0.16, cy + r * 0.12, cx + bx + r * 0.16, cy + r * 0.28],
                  fill=BLUSH)

    # smile (arc)
    sw = max(3, size // 85)
    d.arc([cx - r * 0.18, cy + r * 0.06, cx + r * 0.18, cy + r * 0.34],
          start=15, end=165, fill=INK, width=sw)
    return img


def full_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), CREAM)
    m = radial_mochi(int(size * 0.92))
    img.alpha_composite(m, (int((size - m.width) / 2), int((size - m.height) / 2)))
    return img


def foreground(size: int) -> Image.Image:
    """Transparent adaptive-icon foreground, mochi inside the safe zone."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    m = radial_mochi(int(size * 0.62))
    img.alpha_composite(m, (int((size - m.width) / 2), int((size - m.height) / 2)))
    return img


def maskable(size: int) -> Image.Image:
    """Full-bleed cream with a smaller mochi (safe for circular masks)."""
    img = Image.new("RGBA", (size, size), CREAM)
    m = radial_mochi(int(size * 0.72))
    img.alpha_composite(m, (int((size - m.width) / 2), int((size - m.height) / 2)))
    return img


def save(img: Image.Image, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("wrote", path)


if __name__ == "__main__":
    save(full_icon(1024), os.path.join(HERE, "icon.png"))
    save(foreground(1024), os.path.join(HERE, "icon-foreground.png"))
    save(maskable(1280), os.path.join(HERE, "splash.png"))

    pub = os.path.join(ROOT, "public")
    save(full_icon(192), os.path.join(pub, "icon-192.png"))
    save(full_icon(512), os.path.join(pub, "icon-512.png"))
    save(maskable(512), os.path.join(pub, "icon-maskable-512.png"))
    save(full_icon(180), os.path.join(pub, "apple-touch-icon.png"))
