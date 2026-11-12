"""The town's and the meadow's animals, taken apart so the game can move them.

Sources (assets/world/animals/, picked from PixelLab generations, all facing left):
  cat_stand.png  cat_sit.png  cat_sleep.png  squirrel.png
Sparrows are too small for the generator (it fills its smallest 16 px canvas), so they are drawn here by
hand as pixel grids, in the colours of the generated sparrows.

Each picture is cut into parts, every part kept on the picture's own canvas, so in game all parts share
one origin (the canvas' bottom centre) and an animation is just whole-pixel offsets between them:
  * cat, standing: body (with the head under it, so a moving head never leaves a hole), head, four legs,
    the tail baked in 5 sways (sheared: the tip moves, the root stays)
  * cat, sitting: body, head, head blinking, the tail in 5 sways
  * cat, sleeping: two breaths (the upper half rising a pixel)
  * squirrel: body (with head), head, front legs, back legs, tail; and sitting up (its front tipped up)
  * sparrow: standing, pecking, hopping, three wingbeats
The cats come in several coats: every cat picture is first put on one shared fur ramp (by how light each
pixel is among that picture's fur), then recoloured per coat, so all poses of a cat match.

Writes apps/client/public/assets/world/animals.png + animals.json (a Phaser atlas).
--preview <png> draws every frame, enlarged.

Usage:
  python tools/animal_parts.py [--preview out.png]
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "world", "animals")
OUT_PNG = os.path.join(ROOT, "apps", "client", "public", "assets", "world", "animals.png")
OUT_JSON = os.path.join(ROOT, "apps", "client", "public", "assets", "world", "animals.json")

# parts: name -> rectangles (x0, y0, x1, y1), inclusive, in the source picture's pixels
CAT_STAND = {
    "legFN": [(3, 13, 5, 15)],
    "legFF": [(6, 13, 8, 14)],
    "legBN": [(9, 13, 11, 15)],
    "legBF": [(12, 13, 14, 15)],
    "tail": [(12, 0, 16, 6), (14, 7, 16, 7)],
    "head": [(0, 2, 8, 9)],
}
CAT_STAND_TAIL_ROOT = 7  # the row the tail grows from
CAT_SIT = {
    "tail": [(14, 5, 17, 12)],
    "head": [(0, 0, 9, 8)],
}
CAT_SIT_TAIL_ROOT = 13
CAT_SIT_EYES = [(3, 6), (6, 6)]
CAT_SLEEP_TOP = 8  # rows above this rise when it breathes in
SQUIRREL = {
    "legF": [(2, 13, 6, 15)],
    "legB": [(7, 13, 11, 15)],
    "tail": [(8, 0, 15, 6), (11, 7, 15, 12)],
    "head": [(0, 3, 7, 10)],
}
SWAYS = (-2, -1, 0, 1, 2)

# cat coats: fur ramp dark -> light, and the outline
COATS = {
    "ginger": None,  # the generated colours (put on their own ramp)
    "grey": (["#3b3f4a", "#555b68", "#727a88", "#949cab", "#b9c0cc", "#dfe3ea"], "#1b1d24"),
    "black": (["#1d1b23", "#27242f", "#322e3c", "#403a4c", "#57506a", "#77708f"], "#0c0b10"),
    "cream": (["#8a7a6c", "#ad9c8b", "#cbbcaa", "#e2d6c6", "#f1eadf", "#fffaf2"], "#4a3e36"),
    "brown": (["#3d2618", "#5a3a24", "#7a5232", "#9a6c45", "#b88b5e", "#d6ad80"], "#1f130b"),
}
OUTLINE = 48  # darker than this (luminance) is outline

# sparrow, hand drawn on 9x9, facing left like the rest. K outline, B brown back, D dark streaks, C cream
# belly, G grey cheek, Y beak, L legs, W wing light
SP = {
    "K": "#2b1a12", "B": "#8c503d", "D": "#5a3324", "C": "#e8cea0", "c": "#cfb48d", "G": "#a58686",
    "Y": "#352b2f", "L": "#c08a72", "W": "#b2976f",
}
SPARROW = {
    "stand": [
        ".........",
        ".........",
        "..KKK....",
        ".KBBBK...",
        "YGKBBDKKK",
        ".KCGDBDBK",
        "..KCCDDK.",
        "...KKKK..",
        "...L.L...",
    ],
    "peck": [  # tipped forward, beak to the ground, tail up
        ".........",
        ".........",
        ".........",
        "......KKK",
        "...KKKDBK",
        "..KBBBDK.",
        ".KBGDCK..",
        "YGKCCK...",
        "...L.L...",
    ],
    "hop": [  # legs tucked (the game lifts it)
        ".........",
        ".........",
        "..KKK....",
        ".KBBBK...",
        "YGKBBDKKK",
        ".KCGDBDBK",
        "..KCCDDK.",
        "...KKKK..",
        ".........",
    ],
    "fly0": [  # wings up
        "....KK...",
        "...KWDK..",
        "..KKWDK..",
        ".KBBDDKKK",
        "YGKBBDDBK",
        ".KCGCDKK.",
        "..KCCKK..",
        "...KK....",
        ".........",
    ],
    "fly1": [  # wings level, spread back along the body
        ".........",
        ".........",
        "..KKK....",
        ".KBBBKKKK",
        "YGKBDWWWK",
        ".KCGDDDKK",
        "..KCCKK..",
        "...KK....",
        ".........",
    ],
    "fly2": [  # wings down
        ".........",
        ".........",
        "..KKK....",
        ".KBBBKKKK",
        "YGKBDDBBK",
        ".KCGDWKK.",
        "..KCDWK..",
        "...KKWK..",
        ".....K...",
    ],
}


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def in_rects(rects, x, y):
    return any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in rects)


def cut(im, rects):
    """Just the pixels inside these rectangles, on the picture's own canvas."""
    out = Image.new("RGBA", im.size)
    p, q = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            if in_rects(rects, x, y):
                q[x, y] = p[x, y]
    return out


def without(im, rects):
    out = im.copy()
    q = out.load()
    for y in range(im.height):
        for x in range(im.width):
            if in_rects(rects, x, y):
                q[x, y] = (0, 0, 0, 0)
    return out


def shear(im, root, s, top=None):
    """Sway a tail: each row moves sideways in proportion to how far above its root it is; the tip by s."""
    p = im.load()
    ys = [y for y in range(im.height) for x in range(im.width) if p[x, y][3] > 0]
    if not ys:
        return im.copy()
    top = min(ys) if top is None else top
    out = Image.new("RGBA", im.size)
    q = out.load()
    for y in range(im.height):
        k = 0 if root == top else max(0.0, (root - y) / (root - top))
        dx = round(s * k)
        for x in range(im.width):
            if p[x, y][3] > 0 and 0 <= x + dx < im.width:
                q[x + dx, y] = p[x, y]
    return out


def over(*ims):
    out = Image.new("RGBA", ims[0].size)
    for im in ims:
        out.alpha_composite(im)
    return out


def fur_ramp(im, n=6):
    """The picture's own fur colours as n levels, dark to light."""
    px = [c[:3] for c in im.getdata() if c[3] > 100 and lum(c) >= OUTLINE]
    px.sort(key=lum)
    return [tuple(sum(c[i] for c in px[len(px) * k // n:len(px) * (k + 1) // n]) // max(1, len(px[len(px) * k // n:len(px) * (k + 1) // n])) for i in range(3)) for k in range(n)]


def recolour(im, ramp, outline):
    """Put a picture on a fur ramp: each fur pixel takes the level of its lightness among this picture's fur."""
    data = [c for c in im.getdata()]
    fur = sorted(lum(c) for c in data if c[3] > 100 and lum(c) >= OUTLINE)
    out = Image.new("RGBA", im.size)
    q = out.load()
    w = im.width
    for i, c in enumerate(data):
        if c[3] <= 100:
            continue
        x, y = i % w, i // w
        if lum(c) < OUTLINE:
            q[x, y] = outline + (255,)
            continue
        rank = sum(1 for v in fur if v < lum(c)) / max(1, len(fur))
        q[x, y] = ramp[min(len(ramp) - 1, int(rank * len(ramp)))] + (255,)
    return out


def blink(im, eyes, ramp):
    out = im.copy()
    q = out.load()
    for x, y in eyes:
        q[x, y] = ramp[2] + (255,)
        if q[x, y - 1][3] > 0:
            q[x, y - 1] = ramp[1] + (255,)
    return out


def grid(rows):
    im = Image.new("RGBA", (len(rows[0]), len(rows)))
    q = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                q[x, y] = hexrgb(SP[ch]) + (255,)
    return im


def frames():
    out = {}
    stand, sit, sleep, squirrel = load("cat_stand.png"), load("cat_sit.png"), load("cat_sleep.png"), load("squirrel.png")
    base_ramp = fur_ramp(stand)
    base_outline = (42, 22, 14)
    for coat, spec in COATS.items():
        ramp, outline = (base_ramp, base_outline) if spec is None else ([hexrgb(h) for h in spec[0]], hexrgb(spec[1]))
        st, si, sl = (recolour(im, ramp, outline) for im in (stand, sit, sleep))
        c = f"cat_{coat}"
        legs = [r for k, v in CAT_STAND.items() if k.startswith("leg") for r in v]
        out[f"{c}_body"] = without(st, legs + CAT_STAND["tail"])
        out[f"{c}_head"] = cut(st, CAT_STAND["head"])
        for k in ("legFN", "legFF", "legBN", "legBF"):
            out[f"{c}_{k}"] = cut(st, CAT_STAND[k])
        tail = cut(st, CAT_STAND["tail"])
        for s in SWAYS:
            out[f"{c}_tail{s}"] = shear(tail, CAT_STAND_TAIL_ROOT, s)
        out[f"{c}_sit_body"] = without(si, CAT_SIT["tail"])
        head = cut(si, CAT_SIT["head"])
        out[f"{c}_sit_head"] = head
        out[f"{c}_sit_blink"] = blink(head, CAT_SIT_EYES, ramp)
        stail = cut(si, CAT_SIT["tail"])
        for s in SWAYS:
            out[f"{c}_sit_tail{s}"] = shear(stail, CAT_SIT_TAIL_ROOT, s)
        out[f"{c}_sleep0"] = sl
        top = cut(sl, [(0, 0, sl.width - 1, CAT_SLEEP_TOP - 1)])
        lifted = Image.new("RGBA", sl.size)
        lifted.alpha_composite(top, (0, -1))
        out[f"{c}_sleep1"] = over(sl, lifted)

    legs = SQUIRREL["legF"] + SQUIRREL["legB"]
    out["sq_body"] = without(squirrel, legs + SQUIRREL["tail"])
    out["sq_head"] = cut(squirrel, SQUIRREL["head"])
    out["sq_legF"] = cut(squirrel, SQUIRREL["legF"])
    out["sq_legB"] = cut(squirrel, SQUIRREL["legB"])
    out["sq_tail"] = cut(squirrel, SQUIRREL["tail"])
    # sitting up: the front half tips up (columns lift more the further forward), the tail stays
    front = without(squirrel, SQUIRREL["tail"] + SQUIRREL["legB"])
    tipped = Image.new("RGBA", squirrel.size)
    p, q = front.load(), tipped.load()
    for x in range(squirrel.width):
        lift = max(0, round((8 - x) * 0.45))
        for y in range(squirrel.height):
            if p[x, y][3] > 0 and y - lift >= 0:
                q[x, y - lift] = p[x, y]
    out["sq_sit"] = over(cut(squirrel, SQUIRREL["tail"]), cut(squirrel, SQUIRREL["legB"]), tipped)
    nib = Image.new("RGBA", squirrel.size)
    head_t = cut(tipped, [(0, 0, 6, 9)])
    nib.alpha_composite(head_t, (0, 1))
    out["sq_nibble"] = over(out["sq_sit"], nib)

    for k, rows in SPARROW.items():
        out[f"sp_{k}"] = grid(rows)
    return out


def pack(fr):
    names = list(fr)
    pad = 1
    width = 256
    x = y = row_h = 0
    pos = {}
    for n in names:
        w, h = fr[n].size
        if x + w + pad > width:
            x, y, row_h = 0, y + row_h + pad, 0
        pos[n] = (x, y)
        x += w + pad
        row_h = max(row_h, h)
    height = y + row_h
    sheet = Image.new("RGBA", (width, height))
    meta = {}
    for n in names:
        sheet.alpha_composite(fr[n], pos[n])
        w, h = fr[n].size
        meta[n] = {"frame": {"x": pos[n][0], "y": pos[n][1], "w": w, "h": h}, "rotated": False, "trimmed": False,
                   "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h}}
    return sheet, {"frames": meta, "meta": {"image": "animals.png", "size": {"w": width, "h": height}, "scale": "1"}}


def preview(fr, dst, k=6):
    names = list(fr)
    cols = 10
    cell = 18 * k + 8
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * (cell + 12)), (74, 120, 70, 255))
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        x, y = (i % cols) * cell, (i // cols) * (cell + 12)
        im = fr[n]
        sheet.alpha_composite(im.resize((im.width * k, im.height * k), Image.NEAREST), (x + 4, y + 12))
        d.text((x + 2, y), n.replace("cat_", "").replace("_", " ")[:18], fill=(255, 255, 0, 255))
    sheet.save(dst)


def main():
    fr = frames()
    sheet, meta = pack(fr)
    sheet.save(OUT_PNG)
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    print(f"animals -> {os.path.relpath(OUT_PNG, ROOT)} ({sheet.width}x{sheet.height}, {len(fr)} frames)")
    if "--preview" in sys.argv:
        dst = sys.argv[sys.argv.index("--preview") + 1]
        preview(fr, dst)
        print("preview ->", dst)


if __name__ == "__main__":
    main()
