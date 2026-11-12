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
    "rocks": ("rock2", [3, 12, 15, 21, 23, 29, 35, 41, 48, 49, 50, 55], "rock"),
    "boulders": ("boulder2", [0, 2, 5, 7, 12, 14, 17, 21], "boulder"),
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
# Picks with their own names: category -> (download subfolder, {candidate index: frame name})
NAMED = {
    "houses": ("house", {0: "house0", 1: "house1", 2: "house2", 3: "house3"}),
    "camp": ("camp", {0: "tent0", 1: "tent1", 7: "lamppost", 9: "hiderack", 10: "weaponrack", 12: "firepit"}),
    "village": ("village", {
        0: "fence", 1: "well", 2: "cart", 3: "grave", 4: "haystack", 5: "chimney", 6: "olddoor", 7: "wayshrine",
        8: "beams", 10: "rubblewall", 12: "hearth", 14: "stonepile",
    }),
    # the town (the lobby): its buildings, fountain basin and props
    "town_store": ("store", {1: "t_store"}),
    "town_smithy": ("smith", {1: "t_smithy"}),
    "town_potion": ("potion", {3: "t_potionshop"}),
    "town_temple": ("temple", {2: "t_temple"}),
    "town_houses": ("houses", {1: "t_house0", 2: "t_house1", 3: "t_house2"}),
    "town_inn": ("inn", {2: "t_inn"}),
    "town_guild": ("guild", {1: "t_guild"}),
    "town_fountain": ("fountain", {3: "t_fountain"}),
    "town_plaza": ("plaza", {
        0: "t_stall_red", 1: "t_stall_fruit", 2: "t_stall_cloth", 3: "t_flowercart", 4: "t_questboard", 5: "t_lamp",
        6: "t_bench", 7: "t_planter", 8: "t_banner", 9: "t_statue", 10: "t_signpost", 13: "t_goods", 15: "t_bakery",
    }),
    "town_small": ("tiny", {
        0: "t_pot_red", 1: "t_pot_blue", 2: "t_pot_orange", 3: "t_pot_vase", 4: "t_topiary", 5: "t_pine", 6: "t_blossom",
        8: "t_box_red", 9: "t_box_yellow", 11: "t_box_stone", 12: "t_crate_apple", 13: "t_crate_green", 14: "t_crate_fish",
        15: "t_crate_carrot", 16: "t_sack", 18: "t_sacks", 19: "t_barrel", 20: "t_waterbarrel", 27: "t_lanternpost",
        29: "t_crystal_blue", 30: "t_crystal_gold", 31: "t_crystal_green", 35: "t_stonebench", 36: "t_redbench",
        38: "t_mailbox", 40: "t_hay", 44: "t_pump", 47: "t_bush_pot", 48: "t_bush_stone", 49: "t_bush_blue",
        52: "t_pumpkins", 61: "t_breadbasket",
    }),
    # small props, drawn at their real size (32 px canvas)
    "smallprops": ("small", {
        0: "backpack0", 2: "backpack1", 4: "sack0", 5: "sack1", 7: "sacks", 8: "bedroll0", 9: "bedroll1",
        12: "logseat", 13: "mossylog", 14: "bench", 15: "stool", 19: "keg", 21: "barrel2", 22: "barrel3",
        24: "logs", 25: "kindling", 26: "logbundle", 28: "axestump", 30: "choppedstump", 31: "log", 32: "bucket",
        34: "spilledbucket", 35: "cauldron", 36: "tripod", 38: "lantern", 40: "sign0", 41: "sign1", 43: "hangsign",
        44: "applecrate", 45: "herbcrate", 48: "pot0", 49: "amphora", 50: "brokenjar", 51: "pots", 52: "wheel",
        53: "wheelflat", 54: "handcart", 56: "mapscroll", 58: "smallpit", 60: "anvil", 61: "target",
    }),
}
TILESETS = {"water": "ts_water", "path": "ts_path", "dark": "ts_dark", "cobble": "ts_cobble"}


def copy_from_download(dl):
    """Copy the picked candidates of every category whose subfolder is in this download."""
    for cat, (folder, names) in NAMED.items():
        if not os.path.isdir(os.path.join(dl, folder)):
            continue
        os.makedirs(os.path.join(SRC, cat), exist_ok=True)
        for i, name in names.items():
            shutil.copy(os.path.join(dl, folder, f"{i}.png"), os.path.join(SRC, cat, f"{name}.png"))
    for cat, (folder, idxs, prefix) in PICKS.items():
        if not os.path.isdir(os.path.join(dl, folder)):
            continue
        os.makedirs(os.path.join(SRC, cat), exist_ok=True)
        for n, i in enumerate(idxs):
            shutil.copy(os.path.join(dl, folder, f"{i}.png"), os.path.join(SRC, cat, f"{prefix}{n}.png"))
    os.makedirs(os.path.join(SRC, "tiles"), exist_ok=True)
    for name, base in TILESETS.items():
        if not os.path.exists(os.path.join(dl, base + ".png")):
            continue
        shutil.copy(os.path.join(dl, base + ".png"), os.path.join(SRC, "tiles", name + ".png"))
        shutil.copy(os.path.join(dl, base + ".json"), os.path.join(SRC, "tiles", name + ".json"))


def strip_ground(im):
    """Remove the patch of dirt/grass the generator painted under a rock, so it sits on our own ground.

    In each column, find the lowest pixel of real stone (grey), close the rock with one outline pixel
    under it, and clear everything below - grass blades, dirt, flowers. Edge columns that are only
    outline keep their outline. The result is a clean bottom edge that follows the rock's body.
    """
    im = im.copy()
    px = im.load()
    w, h = im.size
    OUTLINE = (24, 24, 28, 255)

    def grey(c):
        r, g, b, a = c
        hi, lo = max(r, g, b), min(r, g, b)
        greenish = g > r + 3 and g > b + 1  # mossy grass is grey-green; stone is neutral or blue-grey
        return a >= 100 and hi >= 40 and hi - lo < 22 and not greenish

    def dark(c):
        r, g, b, a = c
        hi, lo = max(r, g, b), min(r, g, b)
        return a >= 100 and hi < 40 and hi - lo < 14

    for x in range(w):
        body = max((y for y in range(h) if grey(px[x, y])), default=-1)
        if body >= 0:
            if body + 1 < h:
                px[x, body + 1] = OUTLINE
            clear_from = body + 2
        else:
            edge = max((y for y in range(h) if dark(px[x, y])), default=-1)
            clear_from = edge + 1
        for y in range(clear_from, h):
            px[x, y] = (0, 0, 0, 0)
    return im


GROUNDLESS = {"rocks"}  # boulders were redrawn with no ground under them

# Pictures that came with a patch of grass and dirt painted under them (which never matches our own
# ground): it is cut away below the line where the thing meets the ground - the front edge of its
# hand-drawn footprint in tools/hitboxes.py. Stones, beams and fallen tiles lying there stay.
GRASSY = {"house0", "house1", "house2", "house3", "well", "grave", "wayshrine", "rubblewall", "stonepile",
          "chimney", "hearth", "fence"}

# Colour, to sit with the rest of the map: the village art came out darker and duller than the trees and
# walls. (lift: brightens the darks, gain: overall brightness, sat: saturation)
TONE = {
    "houses": {"lift": 0.78, "gain": 1.0, "sat": 1.28},
    "village": {"lift": 0.84, "gain": 1.0, "sat": 1.22},
}


def _hitbox_outlines():
    import importlib.util
    spec = importlib.util.spec_from_file_location("hitboxes", os.path.join(ROOT, "tools", "hitboxes.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.MANUAL, mod.shape


def _edge(poly, x, front):
    """The front (lowest) or back edge of an outline at x, x held inside it."""
    xs = [p[0] for p in poly]
    x = min(max(x, min(xs) + 0.01), max(xs) - 0.01)
    best = None
    for i in range(len(poly)):
        (ax, ay), (bx, by) = poly[i - 1], poly[i]
        if (ax <= x <= bx) or (bx <= x <= ax):
            y = ay if bx == ax else ay + (by - ay) * (x - ax) / (bx - ax)
            best = y if best is None else (max(best, y) if front else min(best, y))
    return best


def strip_grass(im, poly):
    """Cut the painted grass and dirt away below where the thing meets the ground (see GRASSY)."""
    import colorsys
    im = im.copy()
    px = im.load()
    w, h = im.size
    l, t, r, b = im.getbbox()
    cx = (r - l) / 2
    xs = [p[0] for p in poly]
    lo, hi = min(xs), max(xs)

    def kind(c):
        rr, gg, bb, a = c
        if a < 100:
            return "clear"
        hh, ss, vv = colorsys.rgb_to_hsv(rr / 255, gg / 255, bb / 255)
        if vv < 0.16:
            return "ink"
        if ss < 0.2 or (0.5 < hh < 0.75):
            return "stone"
        if 0.11 < hh < 0.45:
            return "grass"  # greens and olive dirt
        if (hh <= 0.11 or hh > 0.9) and ss > 0.28:
            return "wood"  # beams, fallen roof tiles: keep
        return "dirt"

    def below(x, y):
        """Is (x, y) under where the thing meets the ground - where the painted patch is?"""
        lx = x - l - cx + 0.5
        # under the walls: below their front edge; beside them: below the level of their back corner
        line = _edge(poly, lx, True) - 1 if lo <= lx <= hi else _edge(poly, lx, False)
        return y - b + 0.5 > line

    cut = set()
    for x in range(l, r):
        for y in range(t, b):
            if below(x, y) and kind(px[x, y]) in ("grass", "dirt"):
                cut.add((x, y))
    for x, y in cut:
        px[x, y] = (0, 0, 0, 0)
    # the patch's own outline, left hanging where the grass was: only there, and only dark pixels
    # that no longer touch anything they outlined. (Dark shadows inside a doorway or a broken wall
    # sit above the line and are never touched.)
    for _ in range(2):
        for x in range(l, r):
            for y in range(t, b):
                if px[x, y][3] < 100 or kind(px[x, y]) != "ink" or not below(x, y):
                    continue
                if not any(0 <= x + dx < w and 0 <= y + dy < h and kind(px[x + dx, y + dy]) in ("stone", "wood")
                           for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    px[x, y] = (0, 0, 0, 0)
                    cut.add((x, y))
    INK = (24, 26, 22, 255)
    for x, y in cut:
        if px[x, y][3] >= 100:
            continue
        if any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] >= 100 and kind(px[x + dx, y + dy]) in ("stone", "wood")
               for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1))):
            px[x, y] = INK
    return im


def tone(im, lift, gain, sat):
    """Brighten the darks (lift < 1 is a gamma), raise the overall level and the saturation; outlines stay dark."""
    import colorsys
    im = im.copy()
    px = im.load()
    for x in range(im.width):
        for y in range(im.height):
            r, g, b, a = px[x, y]
            if a < 100:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if vv < 0.13:
                continue
            vv = min(1, (vv ** lift) * gain)
            ss = min(1, ss * sat)
            r2, g2, b2 = colorsys.hsv_to_rgb(hh, ss, vv)
            px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return im


def pack_props():
    items = []
    outlines, shape = _hitbox_outlines()
    for cat in [*PICKS, *NAMED]:
        d = os.path.join(SRC, cat)
        for f in sorted(os.listdir(d)):
            name = f[:-4]
            im = Image.open(os.path.join(d, f)).convert("RGBA")
            if cat in GROUNDLESS:
                im = strip_ground(im)
            box = im.getbbox()
            if name in GRASSY:
                o = outlines[name]
                im = strip_grass(im, shape(o) if isinstance(o, str) else o)
            if cat in TONE:
                im = tone(im, **TONE[cat])
            if box:
                # keep the original box, so the picture still stands where its hitbox says
                items.append((name, im.crop(box)))
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
