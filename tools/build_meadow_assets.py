"""Build the meadow map assets for the client.

Source art (PixelLab generations, picked by hand) lives in assets/world/meadow/.
This script:
  1. (optional) copies the picked candidates from a PixelLab download folder into assets/
  2. trims every prop and packs them into one atlas (Phaser JSON-hash format)
  3. turns the Wang tileset metadata into a small lookup: corners -> tile position

Usage:
  python tools/build_meadow_assets.py [pixellab_download_dir]
"""
import json
import os
import shutil
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "world", "meadow")
OUT = os.path.join(ROOT, "apps", "client", "public", "assets", "world")

# Which PixelLab candidates were picked, per category: (download subfolder, [candidate indices], name prefix)
PICKS = {
    "trees": ("tree", [0, 2, 5, 9, 11, 13, 15, 7], "tree"),
    "bushes": ("bush", [0, 1, 2, 9, 10, 12, 13, 19, 22, 25, 40, 45], "bush"),
    "walls": ("ruin", [0, 2, 3, 4, 10, 11, 12, 13, 14, 16, 20], "wall"),
    "pillars": ("ruin", [5, 7, 17, 19, 21, 22, 24], "pillar"),
    "rocks": ("props", [0, 1, 3, 5, 8, 9, 10, 13], "rock"),
    "chests": ("props", [16, 17, 22], "chest"),
    "barrels": ("props", [24, 26], "barrel"),
    "crates": ("props", [32, 33, 37], "crate"),
    "mushrooms": ("props", [40, 41, 43], "mushroom"),
    "stumps": ("props", [48, 49, 50], "stump"),
    "lilies": ("props", [56, 57, 58, 61, 62], "lily"),
    "flowers": ("deco", [5, 13, 14, 20, 21, 28, 29, 43, 51], "flower"),
    "tufts": ("deco", [2, 3, 11, 18, 19, 25, 27, 44, 45, 47], "tuft"),
    "pebbles": ("deco", [4, 23, 31, 46, 52, 60], "pebble"),
}
TILESETS = {"water": "ts_water", "path": "ts_path", "dark": "ts_dark"}


def copy_from_download(dl):
    for cat, (folder, idxs, prefix) in PICKS.items():
        os.makedirs(os.path.join(SRC, cat), exist_ok=True)
        for n, i in enumerate(idxs):
            shutil.copy(os.path.join(dl, folder, f"{i}.png"), os.path.join(SRC, cat, f"{prefix}{n}.png"))
    os.makedirs(os.path.join(SRC, "tiles"), exist_ok=True)
    for name, base in TILESETS.items():
        shutil.copy(os.path.join(dl, base + ".png"), os.path.join(SRC, "tiles", name + ".png"))
        shutil.copy(os.path.join(dl, base + ".json"), os.path.join(SRC, "tiles", name + ".json"))


def pack_props():
    items = []
    for cat in PICKS:
        d = os.path.join(SRC, cat)
        for f in sorted(os.listdir(d)):
            im = Image.open(os.path.join(d, f)).convert("RGBA")
            box = im.getbbox()
            if box:
                items.append((f[:-4], im.crop(box)))
    # shelf packing, tallest first, 1px gap
    items.sort(key=lambda it: -it[1].height)
    W, x, y, shelf = 512, 0, 0, 0
    pos = {}
    for name, im in items:
        if x + im.width > W:
            x, y, shelf = 0, y + shelf + 1, 0
        pos[name] = (x, y)
        x += im.width + 1
        shelf = max(shelf, im.height)
    H = y + shelf
    atlas = Image.new("RGBA", (W, H))
    frames = {}
    for name, im in items:
        px, py = pos[name]
        atlas.paste(im, (px, py))
        frames[name] = {
            "frame": {"x": px, "y": py, "w": im.width, "h": im.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
            "sourceSize": {"w": im.width, "h": im.height},
        }
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, "meadow.png"))
    meta = {"image": "meadow.png", "size": {"w": W, "h": H}, "scale": "1"}
    with open(os.path.join(OUT, "meadow.json"), "w", encoding="utf-8") as fh:
        json.dump({"frames": frames, "meta": meta}, fh, separators=(",", ":"))
    print(f"atlas {W}x{H}, {len(items)} props")


def build_tiles():
    lookup = {}
    for name in TILESETS:
        with open(os.path.join(SRC, "tiles", name + ".json"), encoding="utf-8") as fh:
            meta = json.load(fh)
        table = {}
        for t in meta["tileset_data"]["tiles"]:
            c = t["corners"]
            # key: NW NE SW SE, 1 = upper terrain
            key = "".join("1" if c[k] == "upper" else "0" for k in ("NW", "NE", "SW", "SE"))
            b = t["bounding_box"]
            table.setdefault(key, [b["x"], b["y"]])
        lookup[name] = {"lower": meta["lower_description"], "upper": meta["upper_description"], "tiles": table}
        shutil.copy(os.path.join(SRC, "tiles", name + ".png"), os.path.join(OUT, f"tiles_{name}.png"))
    with open(os.path.join(OUT, "tiles.json"), "w", encoding="utf-8") as fh:
        json.dump(lookup, fh, separators=(",", ":"), ensure_ascii=False)
    print("tiles:", {k: len(v["tiles"]) for k, v in lookup.items()})


if __name__ == "__main__":
    if len(sys.argv) > 1:
        copy_from_download(sys.argv[1])
    pack_props()
    build_tiles()
