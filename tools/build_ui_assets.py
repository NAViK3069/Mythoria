"""Copy the picked PixelLab UI art into the project.

Usage: python tools/build_ui_assets.py <download_dir>
  <download_dir>/icA, icB, icC  - the icon candidates (index.png), one PixelLab job each
  <download_dir>/panel.bin      - the window frame (PixelLab UI panel)

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

if __name__ == "__main__":
    dl = sys.argv[1]
    for d in (os.path.join(SRC, "icons"), os.path.join(OUT, "icons")):
        os.makedirs(d, exist_ok=True)
    for name, (folder, idx) in ICONS.items():
        src = os.path.join(dl, folder, f"{idx}.png")
        for d in (os.path.join(SRC, "icons"), os.path.join(OUT, "icons")):
            shutil.copy(src, os.path.join(d, f"{name}.png"))
    for d in (SRC, OUT):
        shutil.copy(os.path.join(dl, "panel.bin"), os.path.join(d, "panel.png"))
    print(f"{len(ICONS)} icons + panel frame")
