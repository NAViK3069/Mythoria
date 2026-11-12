"""Work out where each map object stands on the ground (its hitbox), from its picture.

In a 3/4 top-down view the part of a thing you can't walk into is its footprint on the ground: the
strip just above the bottom edge of its picture, as deep as its top face looks. So for every picture:

  1. read the bottom edge of its solid pixels, column by column (this follows the object's own shape:
     a bench lying corner-on gives a slanted edge, a round pot a curved one)
  2. push that edge up by the object's depth to get the back edge
  3. take the outline round both (convex), and simplify it to a few corners

Each kind of object gets its own depth and trim (RULES). Pictures where that isn't right - a house
on a patch of rubble, a tent with guy ropes, a fallen column - get an outline drawn by hand (MANUAL).
All points are in px from the picture's bottom centre (x right, y up is negative), which is where the
game stands the object.

Writes apps/client/src/world/hitboxes.json. With --preview <png>, also draws every picture with its
hitbox over it, to check by eye.

Usage:
  python tools/hitboxes.py [--preview out.png]
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS = os.path.join(ROOT, "apps", "client", "public", "assets", "world", "meadow.png")
FRAMES = os.path.join(ROOT, "apps", "client", "public", "assets", "world", "meadow.json")
OUT = os.path.join(ROOT, "apps", "client", "src", "world", "hitboxes.json")

# Things you walk through or over: no hitbox.
NONE = ("bush", "mushroom", "flower", "tuft", "pebble", "lily", "olddoor", "bedroll", "mapscroll", "kindling", "smallpit")

# Boxes seen corner-on.
DIAMOND = ("applecrate", "herbcrate")

# prefix -> rule. height: how tall the thing really stands (px, or a share of the picture's height
# if < 1). In a 3/4 view a picture is the thing's ground footprint plus its height stacked on top, so
# the footprint is the picture with that height taken off the top of each column - a low log is
# nearly all footprint, a barrel only its bottom third. That is also what makes depth order right:
# standing just behind something, it hides only as much of you as it is tall.
# inset: px trimmed off each side (overhangs). min: the thinnest a footprint gets (px).
# trunk: a tree - only the trunk blocks, as an oval this wide at most.
RULES = [
    ("tree", {"trunk": 12}),
    ("pillar1", {"height": 11}),  # fallen columns lie on the ground
    ("pillar6", {"height": 11}),
    ("pillar", {"height": 0.72, "inset": 1}),
    ("wall", {"height": 0.62, "inset": 1}),
    ("boulder", {"height": 0.5, "inset": 2}),
    ("rock", {"height": 0.5, "inset": 2}),
    ("stump", {"height": 0.5, "inset": 2}),
    ("choppedstump", {"height": 0.45, "inset": 3}),
    ("axestump", {"height": 0.5, "inset": 3}),
    ("barrel", {"height": 0.68, "inset": 1}),
    ("keg", {"height": 0.55, "inset": 2}),
    ("crate", {"height": 0.6, "inset": 1}),
    ("chest", {"height": 0.55, "inset": 1}),
    ("cauldron", {"height": 0.6, "inset": 2}),
    ("bucket", {"height": 0.6, "inset": 1}),
    ("pot", {"height": 0.65, "inset": 2}),
    ("amphora", {"height": 0.75, "inset": 2}),
    ("brokenjar", {"height": 0.7, "inset": 2}),
    ("sacks", {"height": 0.55, "inset": 2}),
    ("sack", {"height": 0.6, "inset": 2}),
    ("backpack", {"height": 0.6, "inset": 2}),
    ("stool", {"height": 0.7, "inset": 2}),
    ("anvil", {"height": 0.6, "inset": 2}),
    ("lantern", {"height": 0.8, "inset": 2}),
    ("logs", {"height": 0.45, "inset": 1}),
    ("logbundle", {"height": 0.45, "inset": 1}),
    ("logseat", {"height": 7}),
    ("log", {"height": 7}),
    ("mossylog", {"height": 7}),
    ("bench", {"height": 8}),
    ("grave", {"height": 0.7, "inset": 2}),
    ("stonepile", {"height": 0.45, "inset": 4}),
    ("haystack", {"height": 0.55, "inset": 4}),
    # the town's props
    ("t_stall", {"height": 0.72, "inset": 4}),
    ("t_questboard", {"height": 0.8, "inset": 4}),
    ("t_statue", {"height": 0.62, "inset": 2}),
    ("t_planter", {"height": 0.4, "inset": 1}),
    ("t_flowercart", {"height": 0.5, "inset": 6}),
    ("t_goods", {"height": 0.5, "inset": 2}),
    ("t_bakery", {"height": 0.6, "inset": 3}),
    ("t_bench", {"height": 0.5, "inset": 3}),
    ("t_redbench", {"height": 0.5, "inset": 2}),
    ("t_stonebench", {"height": 0.5, "inset": 2}),
    ("t_pump", {"height": 0.65, "inset": 3}),
    ("t_hay", {"height": 0.45, "inset": 1}),
    ("t_pumpkins", {"height": 0.45, "inset": 1}),
    ("t_", {"height": 0.58, "inset": 1}),
]

# Outlines drawn by hand for the pictures the rules can't read: [x, y] px from the bottom centre.
# (Filled in after looking at every picture; see the preview.)
MANUAL = {
    # ruined cottages: the walls' base, a diamond seen corner-on (gable with the door to the lower left,
    # side wall going back to the upper right) - not the rubble and grass painted round them
    "house0": [[-46, -26], [-2, -12], [50, -30], [50, -42], [8, -60], [-46, -42]],
    "house1": [[-40, -22], [0, -8], [56, -20], [56, -36], [14, -54], [-40, -40]],
    "house2": [[-42, -22], [0, -10], [46, -22], [46, -36], [6, -54], [-42, -40]],
    "house3": [[-42, -20], [0, -10], [52, -24], [52, -38], [10, -56], [-42, -38]],
    # tents, corner-on: front gable to the lower left, ridge running back up to the right (guy ropes free)
    "tent0": [[-26, -18], [2, -6], [26, -18], [-2, -31]],
    "tent1": [[-26, -18], [4, -4], [28, -16], [-2, -30]],
    # the stone ring of the fire pit, all of it (you don't walk into a fire)
    "firepit": "ellipse 0 -15 25 12",
    # racks standing corner-on: the strip between their A-frame feet
    "hiderack": [[-30, -15], [12, -1], [26, -11], [-16, -25]],
    "weaponrack": [[-26, -16], [14, 0], [28, -8], [-14, -24]],
    # posts: just the post
    "lamppost": [[5, 0], [11, 0], [11, -4], [5, -4]],
    "hangsign": [[-9.5, 0], [-5.5, 0], [-5.5, -3], [-9.5, -3]],
    "sign0": [[-1.5, 0], [2, 0], [2, -3], [-1.5, -3]],
    "sign1": [[-1.5, 0], [2, 0], [2, -3], [-1.5, -3]],
    # round things: the circle they stand on
    "well": "ellipse 0 -9 19 9",
    "haystack": "ellipse 1 -12 23 8",
    "stonepile": "ellipse -1 -15 26 10",
    "tripod": "ellipse 0 -6 12 6",  # the cooking fire's ring under it
    "wheelflat": "ellipse 0 -7 13 6",
    # things lying or standing corner-on
    "cart": [[-12, -18], [12, -4], [26, -12], [2, -28]],
    "handcart": [[-6, -5], [2, -1], [11, -4], [4, -12], [-2, -13]],
    "rubblewall": [[-26, -22], [16, -4], [21, -10], [-20, -32]],
    "fence": [[-26, -1], [18, -9], [18, -14], [-26, -6]],
    "beams": [[-30, -20], [-6, -6], [4, -2], [24, -8], [28, -20], [10, -28], [-14, -26]],
    "chimney": [[-26, -8], [-8, -3], [22, -4], [27, -12], [16, -22], [-6, -24], [-24, -18]],
    "hearth": [[-24, -8], [8, -6], [24, -10], [20, -20], [-6, -24], [-24, -18]],
    "spilledbucket": [[-10, -6], [0, -4], [3, -8], [-6, -14], [-10, -12]],
    # --- the town ---
    # front-facing halls: the walls (the guild's front steps are walkable, up to its door)
    "t_guild": [[-62, -22], [-40, -24], [-36, -30], [36, -30], [40, -24], [62, -22], [62, -74], [-62, -74]],
    "t_inn": [[-64, -4], [64, -4], [66, -56], [-66, -56]],
    # corner-on buildings: diamonds (the near corner at the bottom)
    "t_store": [[-44, -22], [0, -6], [48, -20], [4, -42]],
    "t_smithy": [[-52, -26], [2, -6], [48, -24], [0, -48]],
    "t_house0": [[-50, -18], [0, -2], [50, -18], [0, -38]],
    "t_house1": [[-44, -22], [0, -2], [44, -22], [0, -42]],
    "t_house2": [[-46, -20], [2, -4], [46, -20], [2, -38]],
    # round ones
    "t_potionshop": "ellipse 0 -20 34 14",
    "t_temple": "ellipse 0 -32 38 16",
    "t_fountain": "ellipse 0 -36 52 26",
    # posts: just the post
    "t_lamp": [[-3, 0], [3, 0], [3, -3], [-3, -3]],
    "t_banner": [[-3, 0], [2, 0], [2, -3], [-3, -3]],
    "t_signpost": [[-2, 0], [3, 0], [3, -3], [-2, -3]],
    "t_crystal_blue": [[-2, 0], [2, 0], [2, -2], [-2, -2]],
    "t_crystal_gold": [[-2, 0], [2, 0], [2, -2], [-2, -2]],
    "t_crystal_green": [[-2, 0], [2, 0], [2, -2], [-2, -2]],
    "t_lanternpost": [[-8, 0], [-4, 0], [-4, -3], [-8, -3]],
    "t_mailbox": [[-2, 0], [2, 0], [2, -3], [-2, -3]],
    # small standing things
    "wayshrine": [[-11, -4], [10, -3], [11, -11], [-10, -12]],
    "grave": [[-12, -2], [12, -2], [12, -9], [-12, -9]],
    "target": [[-9, -1], [8, -1], [8, -6], [-9, -6]],
    "wheel": [[-6, 0], [6, 0], [6, -3], [-6, -3]],
    "lantern": [[-4, 0], [4, 0], [4, -4], [-4, -4]],
    "stool": [[-6, -1], [6, -1], [6, -6], [-6, -6]],
}


def rule_for(name):
    for prefix, r in RULES:
        if name.startswith(prefix):
            return r
    return {"height": 0.5, "inset": 1}


def hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def simplify(poly, keep=8):
    """Drop the corners that matter least (smallest triangle with their neighbours) until `keep` are left."""
    poly = list(poly)
    while len(poly) > keep:
        best, bi = None, 0
        for i in range(len(poly)):
            a, b, c = poly[i - 1], poly[i], poly[(i + 1) % len(poly)]
            area = abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]))
            if best is None or area < best:
                best, bi = area, i
        poly.pop(bi)
    return poly


def auto(name, im):
    w, h = im.size
    a = im.split()[3].load()
    r = rule_for(name)
    bottom = {}
    for x in range(w):
        ys = [y for y in range(h) if a[x, y] > 100]
        if ys:
            bottom[x] = max(ys)
    if not bottom:
        return None
    cx = w / 2
    if "trunk" in r:
        near = [x for x, b in bottom.items() if b >= h - 3]
        l, rr = min(near), max(near) + 1
        mid, half = (l + rr) / 2, min((rr - l) / 2, r["trunk"] / 2)
        pts = []
        for i in range(8):
            import math
            t = i / 8 * 2 * math.pi
            pts.append((round(mid - cx + math.cos(t) * half, 1), round(-3 + math.sin(t) * 3, 1)))
        return pts
    height = r.get("height", 0.5)
    if height < 1:
        height = h * height
    inset = r.get("inset", 0)
    least = r.get("min", 3)
    # each column: its longest solid run (the body; a chip lying in front or a handle up top is not)
    run = {}
    for x in list(bottom):
        best, cur, start = (0, 0, 0), 0, 0
        for y in range(h + 1):
            if y < h and a[x, y] > 100:
                if cur == 0:
                    start = y
                cur += 1
            else:
                if cur > best[0]:
                    best = (cur, start, y - 1)
                cur = 0
        run[x], bottom[x] = best[1], best[2]
    # columns that are only a thin bit (a rope, a handle, a peg) don't stand on the ground
    cols = sorted(x for x in bottom if bottom[x] - run[x] + 1 >= min(height * 0.5, 6))
    if not cols:
        return None
    l, rr = cols[0] + inset, cols[-1] - inset
    pts = []
    for x in cols:
        if x < l or x > rr:
            continue
        b = bottom[x] + 1
        t = min(run[x] + height, b - least)
        for xx in (x, x + 1):
            pts.append((xx - cx, b - h))
            pts.append((xx - cx, t - h))
    poly = simplify(hull(pts), 8)
    return [(round(x, 1), round(y, 1)) for x, y in poly]


def shape(spec):
    """'ellipse cx cy rx ry' -> a 12-sided outline."""
    import math
    _, cx, cy, rx, ry = spec.split()
    cx, cy, rx, ry = float(cx), float(cy), float(rx), float(ry)
    return [(round(cx + math.cos(i / 12 * 2 * math.pi) * rx, 1), round(cy + math.sin(i / 12 * 2 * math.pi) * ry, 1)) for i in range(12)]


def diamond(im):
    """A box seen corner-on (crates): its base is a diamond from its bottom corner up to the side corners."""
    w = im.size[0]
    dw = w * 0.28
    return [(0, -1), (-w / 2 + 1.5, -1 - dw), (0, -1 - dw * 2), (w / 2 - 1.5, -1 - dw)]


def main():
    atlas = Image.open(ATLAS).convert("RGBA")
    frames = json.load(open(FRAMES, encoding="utf-8"))["frames"]
    out = {}
    pics = []
    for name, f in sorted(frames.items()):
        if name.startswith(NONE):
            continue
        fr = f["frame"]
        im = atlas.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"]))
        m = MANUAL.get(name)
        if isinstance(m, str):
            poly = shape(m)
        elif m:
            poly = [tuple(p) for p in m]
        elif name.startswith(DIAMOND):
            poly = diamond(im)
        else:
            poly = auto(name, im)
        if poly:
            out[name] = poly
            pics.append((name, im, poly))
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("{\n" + ",\n".join(f'  "{k}": {json.dumps(v, separators=(",", ":"))}' for k, v in out.items()) + "\n}\n")
    print(f"{len(out)} hitboxes -> {os.path.relpath(OUT, ROOT)}")

    if "--preview" in sys.argv:
        dst = sys.argv[sys.argv.index("--preview") + 1]
        only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
        if only:
            pics = [p for p in pics if p[0].startswith(tuple(only))]
        k = 4
        cell = 130 * k // 2
        cols = 6
        rows = (len(pics) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * cell, rows * cell), (58, 92, 70, 255))
        d = ImageDraw.Draw(sheet)
        for i, (name, im, poly) in enumerate(pics):
            s = k if max(im.size) <= 64 else 2
            big = im.resize((im.width * s, im.height * s), Image.NEAREST)
            ox = (i % cols) * cell + (cell - big.width) // 2
            oy = (i // cols) * cell + cell - 14 - big.height
            sheet.alpha_composite(big, (ox, oy))
            bx, by = ox + big.width / 2, oy + big.height
            pts = [(bx + x * s, by + y * s) for x, y in poly]
            over = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
            ImageDraw.Draw(over).polygon(pts, fill=(255, 40, 40, 90), outline=(255, 60, 60, 255))
            sheet.alpha_composite(over)
            d.text(((i % cols) * cell + 4, (i // cols) * cell + 2), name, fill=(255, 255, 120, 255))
        sheet.save(dst)
        print("preview ->", dst)


if __name__ == "__main__":
    main()
