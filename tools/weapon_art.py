"""Weapons drawn by hand in code (not PixelLab), FINE: two art pixels to a world pixel (RES = 2), shown at half
size in the game - smaller than the PixelLab weapons, with twice the detail (as the owner's ProjectZ draws its guns
and swords). Written to assets/characters/heroes/weapons/<name>.png for tools/hero_parts.py (which knows them by
FINE_WEAPONS there). Each is drawn upright - a blade's point up, the grip at the bottom - with a 1 px (half a world
pixel) dark outline round it.

    python tools/weapon_art.py [--preview out.png] [--overwrite]

The owner has since redrawn knightsword and knightshield by hand: their pictures are the owner's now, and this
script leaves a picture that's already there alone unless told --overwrite.
"""
import math
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "characters", "heroes", "weapons")
RES = 2
INK = (20, 16, 30, 255)


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = {}

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[(x, y)] = rgb(c) if isinstance(c, str) else c

    def get(self, x, y):
        return self.px.get((x, y))

    def image(self, outline=True):
        im = Image.new("RGBA", (self.w + 2, self.h + 2))
        q = im.load()
        for (x, y), c in self.px.items():
            q[x + 1, y + 1] = c
        if outline:
            for y in range(self.h + 2):
                for x in range(self.w + 2):
                    if q[x, y][3]:
                        continue
                    if any(0 <= x + dx < self.w + 2 and 0 <= y + dy < self.h + 2 and q[x + dx, y + dy][3] and q[x + dx, y + dy] != INK
                           for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        q[x, y] = INK
        return im


# ---------------------------------------------------------------- Bram's knight sword
# A long straight blade of bright steel: white along its lit edge, cool steel, a groove of pale gold down the middle
# (the light it carries), steel again and a dark shadow edge, a glint near the point. A wide gold cross-guard, its
# ends swept up, a blue stone set in its heart. A grip bound in blue leather with gold wire wound round it; a round
# gold pommel with a blue stone.
def knight_sword():
    W, H = 18, 38
    c = Canvas(W, H)
    cx = 8  # the blade's middle: columns cx-2 .. cx+3 (6 wide)
    BLADE = ["#ffffff", "#dfe8f4", "#ffe9a0", "#f0c860", "#aab8cc", "#6e7c96"]
    top, guard = 1, 25
    for y in range(top, guard):
        # the point: narrowing over the top rows
        taper = min(1.0, (y - top) / 6)
        half_l, half_r = 2 * taper, 3 * taper
        for i, col in enumerate(BLADE):
            x = cx - 2 + i
            if x < cx - half_l - 0.01 or x > cx + half_r + 0.01:
                continue
            k = col
            if y < top + 3:
                k = "#ffffff" if i < 3 else "#cfd8e6"
            c.set(x, y, k)
    # a glint on the blade, and the groove fading out toward the point
    for x, y in ((cx - 2, 9), (cx - 1, 9), (cx - 2, 10), (cx - 2, 8)):
        c.set(x, y, "#ffffff")
    c.set(cx, top + 4, "#ffffff")
    c.set(cx + 1, top + 4, "#e6eef8")
    # the guard: gold, lit along the top, shadowed below, its ends swept up
    for y in range(guard, guard + 4):
        for x in range(1, W - 1):
            k = "#fff0a0" if y == guard else "#ffd24a" if y == guard + 1 else "#d8961e" if y == guard + 2 else "#8a5a12"
            if x in (1, W - 2) and y == guard + 3:
                continue
            c.set(x, y, k)
    for x, y, k in ((1, guard - 1, "#ffd24a"), (1, guard - 2, "#fff0a0"), (2, guard - 1, "#ffe070"),
                    (W - 2, guard - 1, "#d8961e"), (W - 2, guard - 2, "#ffd24a"), (W - 3, guard - 1, "#d8961e")):
        c.set(x, y, k)
    # the stone in the guard
    for x, y, k in ((cx, guard + 1, "#a8c8ff"), (cx + 1, guard + 1, "#5a8aff"), (cx, guard + 2, "#3a62d8"), (cx + 1, guard + 2, "#1e3a9a"),
                    (cx - 1, guard + 1, "#c8901e"), (cx + 2, guard + 1, "#c8901e"), (cx - 1, guard + 2, "#a06a14"), (cx + 2, guard + 2, "#a06a14")):
        c.set(x, y, k)
    c.set(cx, guard + 1, "#ffffff")
    # the grip: blue leather, gold wire wound round it on the slant
    g0, g1 = guard + 4, guard + 10
    for y in range(g0, g1):
        for x in range(cx - 1, cx + 3):
            wire = (x + y) % 4 == 0
            k = "#ffd24a" if wire else ("#4a6ad8" if x == cx - 1 else "#3050b8" if x == cx else "#24409a" if x == cx + 1 else "#182a6a")
            c.set(x, y, k)
    # the pommel: a round gold knob with a blue stone
    p0 = g1
    for (dx, dy) in [(-1, 0), (0, 0), (1, 0), (2, 0), (-2, 1), (-1, 1), (0, 1), (1, 1), (2, 1), (3, 1), (-2, 2), (-1, 2), (0, 2), (1, 2), (2, 2), (3, 2), (-1, 3), (0, 3), (1, 3), (2, 3)]:
        lit = -dx * 0.6 - dy * 0.8 + 1.5
        c.set(cx + dx, p0 + dy, "#fff0a0" if lit > 2 else "#ffd24a" if lit > 0.6 else "#d8961e" if lit > -1 else "#8a5a12")
    c.set(cx, p0 + 1, "#5a8aff")
    c.set(cx + 1, p0 + 1, "#3a62d8")
    c.set(cx, p0 + 2, "#1e3a9a")
    c.set(cx + 1, p0 + 2, "#1e3a9a")
    return c.image()


# ---------------------------------------------------------------- Bram's kite shield
# A kite shield in royal blue, lit from the upper left (a smooth light across it, dithered), a gold rim with a bevel
# (bright on the lit edges, dark on the shadowed), rivets round it, a raised gold cross with a sun at its heart.
def knight_shield():
    W, H = 24, 29
    c = Canvas(W, H)
    half = (W - 1) / 2

    def hw(y):
        if y < 15:
            return half - (1.5 if y == 0 else 0.6 if y == 1 else 0)
        q = (y - 14) / (H - 14)
        return half * (1 - q ** 1.15)

    inside = lambda x, y: 0 <= y < H and abs(x - half) <= hw(y) + 0.01
    BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
    for y in range(H):
        for x in range(W):
            if not inside(x, y):
                continue
            # how far in from the edge (the rim is the outer 2)
            depth = min(d for d in range(1, 5) if any(not inside(x + dx * d, y + dy * d) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))) if any(
                not inside(x + dx * d, y + dy * d) for d in range(1, 5) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) else 5
            lit_side = (x < half and y < H * 0.62) or y <= 1
            if depth == 1:
                c.set(x, y, "#fff0a0" if lit_side else "#b8781a")
                continue
            if depth == 2:
                c.set(x, y, "#ffd24a" if lit_side else "#8a5410")
                continue
            # the blue field: a light from the upper left, dithered in four steps
            light = (half - x) / W * 1.3 + (H * 0.45 - y) / H * 1.1 + 0.55
            v = light * 4 + BAY[(y % 4) * 4 + x % 4] / 16 - 0.5
            k = ["#132662", "#1c3a92", "#2a52c0", "#3a6ad8", "#5a8af0"][max(0, min(4, int(v)))]
            c.set(x, y, k)
    # rivets round the rim
    for x, y in ((3, 3), (W - 4, 3), (3, 13), (W - 4, 13), (int(half), H - 5)):
        c.set(x, y, "#ffffff")
        c.set(x + 1, y + 1, "#8a5410")
    # the raised cross: lit on its upper-left edges, shadowed on its lower-right
    cx, cy = int(half), 11
    for y in range(4, H - 6):
        for x in (cx - 1, cx, cx + 1):
            c.set(x, y, "#fff0a0" if x == cx - 1 else "#ffd24a" if x == cx else "#a8701a")
    for x in range(4, W - 4):
        for y in (cy - 1, cy, cy + 1):
            if cx - 1 <= x <= cx + 1:
                continue
            c.set(x, y, "#fff0a0" if y == cy - 1 else "#ffd24a" if y == cy else "#a8701a")
    # the sun at its heart: a disc of light with short rays
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            d = math.hypot(dx, dy)
            if d <= 2.4:
                c.set(cx + dx, cy + dy, "#ffffff" if d < 1.2 else "#fff6c0" if d < 1.9 else "#ffd24a")
    for dx, dy in ((-3, -3), (3, -3), (-3, 3), (3, 3)):
        c.set(cx + dx, cy + dy, "#fff0a0")
    return c.image()


# ---------------------------------------------------------------- Fen's arrow
# Not held in a fist: nocked on the bowstring and shot (world/MasterCharacter.ts draws the string, the arrow on it;
# the flying ones are this picture too) - so drawn POINTING RIGHT, not upright. A leaf-shaped steel head (lit along its
# top, a bright ridge down the middle, dark below), a shaft of pale wood, fletching of forest-green feathers cut back at a
# slant, a dark nock. The owner may redraw it: it's kept like the others.
def arrow():
    W, H = 40, 12
    c = Canvas(W, H)
    # the shaft: two rows, lit above
    for x in range(2, 31):
        c.set(x, 5, "#d8b47a")
        c.set(x, 6, "#93643a")
    # the nock
    for y in (5, 6):
        c.set(0, y, "#3a2414")
        c.set(1, y, "#5a3820")
    # the fletching: two feathers, swept back from x 10 to x 2, cut at a slant, a darker stripe across
    for x in range(2, 11):
        f = int(round(1 + (10 - x) * 0.36))
        for j in range(1, f + 1):
            up, down = 5 - j, 6 + j
            col = "#9ae67a" if j == f else "#4fb04e" if j > 1 else "#2e7a3c"
            if x in (5, 6):
                col = "#e8f0c8" if j == f else "#c8d89a"
            c.set(x, up, col)
            c.set(x, down, "#2e7a3c" if j == f else "#21603a" if j > 1 else "#1a4a2c")
    # the head: a leaf of steel, barbed at its back, to a point
    spans = {30: (4, 7), 31: (3, 8), 32: (2, 9), 33: (3, 8), 34: (3, 8), 35: (4, 7), 36: (4, 7), 37: (5, 6), 38: (5, 6)}
    for x, (y0, y1) in spans.items():
        for y in range(y0, y1 + 1):
            col = "#f4f8ff" if y in (5,) and x > 31 else "#c4ccd8" if y < 5 else "#8a94a4" if y == 6 else "#5a6474"
            if y == y0 and y < 5:
                col = "#ffffff"
            c.set(x, y, col)
    return c.image()


# ---------------------------------------------------------------- Sira's spirit lantern
# Smaller than the PixelLab lantern it replaces - DRAWN smaller at the same pixel size as the heroes (the owner's wish:
# not a fine picture shrunk): carried from the ring at its top (hero_parts.py mode 'hang', her round hand over it), a
# silver cap with gold eaves, silver posts round a pane of pale sea-glass (lit on the left, deep on the right), a blue
# spirit flame inside (white at its heart - the game lights it, auras.ts), a silver band, gold trim, a little base and a
# gold drop at the foot. Upright, the ring at the top.
LANTERN = [
    "..gGg..",
    ".d...d.",
    "..dgd..",
    ".SSssk.",
    "GgggggD",
    "kCcccbk",
    "kCcFcbk",
    "kCFWFbk",
    "kCFWFbk",
    "kCfffbk",
    "kCcccbk",
    "ksssssk",
    ".dgggd.",
    "..ksk..",
    "...g...",
]
LANTERN_COLOURS = {
    "G": "#fff0a0", "g": "#f0c850", "d": "#b08a24", "D": "#8a6418",
    "S": "#eef4ff", "s": "#a8b4c8", "k": "#5a6478",
    "C": "#d8f8ff", "c": "#8ae0f4", "b": "#3a9ac8",
    "W": "#ffffff", "F": "#6ae8ff", "f": "#2aa8e8",
}


def spirit_lantern():
    c = Canvas(len(LANTERN[0]), len(LANTERN))
    for y, row in enumerate(LANTERN):
        for x, ch in enumerate(row):
            if ch != ".":
                c.set(x, y, LANTERN_COLOURS[ch])
    return c.image()


ART = {"knightsword": knight_sword, "knightshield": knight_shield, "arrow": arrow, "spiritlantern": spirit_lantern}


def main():
    os.makedirs(OUT, exist_ok=True)
    pics = {}
    for name, make in ART.items():
        path = os.path.join(OUT, f"{name}.png")
        # the owner has since redrawn these by hand: never write over a picture that's there (--overwrite to)
        if os.path.exists(path) and "--overwrite" not in sys.argv:
            print(name, "kept (already there; --overwrite to redraw)")
            continue
        im = make()
        im.save(path)
        pics[name] = im
        print(name, im.size, "->", os.path.join(OUT, f"{name}.png"))
    if "--preview" in sys.argv:
        dst = sys.argv[sys.argv.index("--preview") + 1]
        k = 8
        w = sum(im.width * k + 12 for im in pics.values())
        out = Image.new("RGBA", (w, max(im.height for im in pics.values()) * k), (74, 120, 70, 255))
        x = 0
        for im in pics.values():
            out.alpha_composite(im.resize((im.width * k, im.height * k), Image.NEAREST), (x, 0))
            x += im.width * k + 12
        out.save(dst)


if __name__ == "__main__":
    main()
