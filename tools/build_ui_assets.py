"""Copy the picked PixelLab UI art into the project.

Usage: python tools/build_ui_assets.py <download_dir>
  <download_dir>/icA, icB, icC  - the icon candidates (index.png), one PixelLab job each
  <download_dir>/panel.png      - the window frame (PixelLab UI panel "mythoria_panel_v2a":
                                  gold filigree corners, transparent centre); cropped and its
                                  inside filled with dark glass so the 9-slice centre stretches
  <download_dir>/art/<name>_<i>.png - key-art candidates (Create Image Pro, 160x90, 4 per job)

Sources are kept in assets/ui/, the game loads apps/client/public/assets/ui/.
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "ui")
OUT = os.path.join(ROOT, "apps", "client", "public", "assets", "ui")

# icon name -> (candidate set, index)
ICONS = {
    "gold": ("icA", 0), "gem": ("icA", 8), "energy": ("icA", 16), "settings": ("icA", 24),
    "announce": ("icA", 37), "mail": ("icA", 45), "shop": ("icA", 48), "bag": ("icA", 61),
    "heroes": ("icB", 0), "team": ("icB", 14), "summon": ("icB", 22), "friends": ("icB", 27),
    "event": ("icB", 38), "quest": ("icB", 44), "guild": ("icB", 50), "battle": ("icB", 57),
    "chat": ("icC", 1), "trophy": ("icC", 11), "potion": ("icC", 17), "chest": ("icC", 29),
    "book": ("icC", 33), "medal": ("icC", 45), "map": ("icC", 49), "key": ("icC", 63),
}

# key art behind the play-mode cards and banners: name -> picked candidate
ART = {"explore": 0, "story": 2, "arena": 1, "raid": 1, "dungeon": 1, "summon": 0}


def trim_padding(im):
    """Cut the flat grey bars PixelLab sometimes leaves round a scene."""
    w, h = im.size
    px = im.load()
    grey = lambda p: abs(p[0] - 176) < 6 and abs(p[1] - 176) < 6 and abs(p[2] - 177) < 6
    col = lambda x: sum(grey(px[x, y]) for y in range(h)) > h * 0.8
    row = lambda y: sum(grey(px[x, y]) for x in range(w)) > w * 0.8
    l, r, t, b = 0, w, 0, h
    while l < r and col(l): l += 1
    while r > l and col(r - 1): r -= 1
    while t < b and row(t): t += 1
    while b > t and row(b - 1): b -= 1
    return im.crop((l, t, r, b))


def fill_inside(im, colour=(9, 27, 33, 245)):
    """Crop the frame to its pixels and flood its transparent centre with the panel colour."""
    from collections import deque
    im = im.crop(im.getbbox())
    w, h = im.size
    px = im.load()
    todo, seen = deque([(w // 2, h // 2)]), set()
    while todo:
        x, y = todo.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or px[x, y][3] > 0:
            continue
        seen.add((x, y))
        px[x, y] = colour
        todo.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


if __name__ == "__main__":
    dl = sys.argv[1]
    for d in (os.path.join(SRC, "icons"), os.path.join(OUT, "icons")):
        os.makedirs(d, exist_ok=True)
    for name, (folder, idx) in ICONS.items():
        src = os.path.join(dl, folder, f"{idx}.png")
        for d in (os.path.join(SRC, "icons"), os.path.join(OUT, "icons")):
            shutil.copy(src, os.path.join(d, f"{name}.png"))
    from PIL import Image
    panel = fill_inside(Image.open(os.path.join(dl, "panel.png")).convert("RGBA"))
    for d in (SRC, OUT):
        panel.save(os.path.join(d, "panel.png"), optimize=True)
    art_dir = os.path.join(dl, "art")
    if os.path.isdir(art_dir):
        from PIL import Image
        for d in (os.path.join(SRC, "art"), os.path.join(OUT, "art")):
            os.makedirs(d, exist_ok=True)
        for name, idx in ART.items():
            im = trim_padding(Image.open(os.path.join(art_dir, f"{name}_{idx}.png")).convert("RGBA"))
            for d in (os.path.join(SRC, "art"), os.path.join(OUT, "art")):
                im.save(os.path.join(d, f"{name}.png"), optimize=True)
    print(f"{len(ICONS)} icons + panel frame + {len(ART)} key art")
