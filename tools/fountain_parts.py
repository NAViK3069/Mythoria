"""The town fountain taken apart, so its water can be drawn in between its pieces.

The fountain's picture (t_fountain) is drawn dry. In game it is put back together in layers, bottom to top:

  1. the picture itself: the dry basin (placed on the map like any other picture)
  2. the lower pool's water                          ┐
  3. the far half of the falling curtain             │
  4. the pillar and the upper bowl, above the water  │ drawn by the fountain effect
  5. the upper bowl's water                          │ (apps/client/src/fx/effects/water.ts)
  6. the statue, above the bowl's water              │
  7. the near half of the curtain, splashes, the jet ┘

Everything is measured off the picture:
  * the pools: the basin's inner gold ring and the bowl's gold ring are found in the picture (connected gold
    pixels) and an oval fitted to each; the water fills the inside of each ring up to the ring.
  * the bowl's outer lip (where its water brims over and falls) is the bowl's gold ring plus its outline.
  * the pillar and the statue: their outlines, row by row, read off the picture (PILLAR, STATUE below).
  * the waterlines: the pillar and the statue stand in the water; only what is above the water is drawn
    over it (the rest is seen faintly through the water).

Writes apps/client/src/world/fountain_parts.json (px from the picture's bottom centre; runs are
[y, x0, x1] with x1 inclusive; pixels are [y, x, 0xRRGGBB]). --preview <png> draws the pieces over the
picture, enlarged, to check by eye.

Usage:
  python tools/fountain_parts.py [--preview out.png]
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS = os.path.join(ROOT, "apps", "client", "public", "assets", "world", "meadow.png")
FRAMES = os.path.join(ROOT, "apps", "client", "public", "assets", "world", "meadow.json")
OUT = os.path.join(ROOT, "apps", "client", "src", "world", "fountain_parts.json")
FRAME = "t_fountain"

# The pillar (with the underside of the upper bowl) and the statue, row by row: y -> (x0, x1), its outline
# included, read off the picture.
PILLAR = {
    -66: (-16, 15), -65: (-15, 14), -64: (-14, 13), -63: (-13, 12), -62: (-11, 10), -61: (-10, 9),
    -60: (-11, 10), -59: (-11, 10), -58: (-10, 9), -57: (-10, 9), -56: (-10, 9), -55: (-10, 9),
    -54: (-11, 10), -53: (-12, 11), -52: (-13, 12), -51: (-14, 13), -50: (-14, 13), -49: (-14, 13),
    -48: (-15, 14), -47: (-16, 15), -46: (-16, 15), -45: (-16, 15), -44: (-16, 15), -43: (-16, 15),
    -42: (-16, 15), -41: (-16, 15), -40: (-16, 15), -39: (-15, 14), -38: (-15, 14), -37: (-14, 13),
    -36: (-14, 13), -35: (-13, 12), -34: (-11, 10), -33: (-10, 9), -32: (-7, 6), -31: (-3, 2),
}
STATUE = {
    -88: (-4, 6), -87: (-4, 5), -86: (-5, 5), -85: (-5, 6), -84: (-5, 6), -83: (-6, 7), -82: (-6, 7),
    -81: (-6, 7), -80: (-6, 7), -79: (-5, 5), -78: (-5, 6), -77: (-6, 5), -76: (-6, 5), -75: (-6, 5),
    -74: (-5, 4), -73: (-3, 3),
}
# the top of the statue, where the jet springs from
SPOUT = (0.5, -106)
# a pool's water stops this far (px) inside its gold ring; the bowl's lip is this far outside its ring
INSET = 1.2
LIP = 1.5


def gold(px):
    r, g, b, a = px
    return a > 100 and r - b > 55 and r > 120


def rings(im):
    """The gold rings: connected gold pixels, biggest first, as (x, y) from the bottom centre."""
    w, h = im.size
    p = im.load()
    cx = w // 2
    seen, comps = set(), []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or not gold(p[x, y]):
                continue
            stack, pts = [(x, y)], []
            seen.add((x, y))
            while stack:
                a, b = stack.pop()
                pts.append((a - cx, b - h))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        n = (a + dx, b + dy)
                        if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and gold(p[n]):
                            seen.add(n)
                            stack.append(n)
            comps.append(pts)
    comps.sort(key=len, reverse=True)
    return comps


def fit(pts):
    """An oval through these pixels (centred at x = 0): (cy, rx, ry), through the pixels' centres."""
    m = np.array([[(x + 0.5) ** 2, (y + 0.5) ** 2, y + 0.5] for x, y in pts])
    a, b, c = np.linalg.lstsq(m, np.ones(len(pts)), rcond=None)[0]
    cy = -c / (2 * b)
    k = 1 + b * cy * cy
    return float(cy), float(np.sqrt(k / a)), float(np.sqrt(k / b))


def ring_of(comps, box):
    """The ring whose pixels fill this box (x0, x1, y0, y1) best."""
    x0, x1, y0, y1 = box
    return max(comps, key=lambda c: sum(1 for x, y in c if x0 <= x <= x1 and y0 <= y <= y1))


def inside(ov, x, y, inset=0.0):
    cy, rx, ry = ov
    return ((x + 0.5) / (rx - inset)) ** 2 + ((y + 0.5 - cy) / (ry - inset)) ** 2 < 1


def below_line(ov, x, y):
    """Is the pixel below (in front of) the near half of a waterline oval - i.e. under the water?"""
    cy, rx, ry = ov
    u = (x + 0.5) / rx
    if abs(u) >= 1:
        return y + 0.5 > cy
    return y + 0.5 > cy + ry * np.sqrt(1 - u * u)


def runs_of(cells):
    rows = {}
    for x, y in cells:
        rows.setdefault(y, []).append(x)
    out = []
    for y in sorted(rows):
        xs = sorted(rows[y])
        s = pr = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == pr + 1:
                pr = x
                continue
            out.append([y, s, pr])
            if x is not None:
                s = pr = x
    return out


def measure(im):
    w, h = im.size
    p = im.load()
    cx = w // 2
    col = lambda x, y: p[x + cx, y + h]
    rgb = lambda x, y: (col(x, y)[0] << 16) | (col(x, y)[1] << 8) | col(x, y)[2]
    comps = rings(im)
    lower_ring = ring_of(comps, (-40, 40, -60, -40))  # the basin's inner ring: widest at its sides
    upper_ring = ring_of(comps, (-20, 20, -90, -70))  # the bowl's ring
    pool = fit(lower_ring)
    bowl = fit(upper_ring)
    lip = (bowl[0], bowl[1] + LIP, bowl[2] + LIP)
    gold_px = set(lower_ring) | set(upper_ring)

    # the waterlines: where the pillar and the statue come out of the water - ovals on each pool's surface,
    # as wide as the pillar / the statue is at the pool's middle row
    def line(prof, cy, ratio):
        x0, x1 = prof[round(cy)]
        rx = (x1 + 1 - x0) / 2
        return (cy, rx, rx * ratio)

    pillar_line = line(PILLAR, pool[0], pool[2] / pool[1])
    statue_line = line(STATUE, bowl[0], bowl[2] / bowl[1])

    lower, upper = [], []
    for y in range(-h, 0):
        for x in range(-cx, w - cx):
            if col(x, y)[3] < 100 or (x, y) in gold_px:
                continue
            if inside(pool, x, y, INSET):
                lower.append((x, y))
            if inside(bowl, x, y, INSET):
                upper.append((x, y))
    lower_set, upper_set = set(lower), set(upper)

    def piece(prof, wet, wl):
        above, sunk = [], []
        for y, (x0, x1) in prof.items():
            for x in range(x0, x1 + 1):
                if (x, y) not in wet:
                    continue
                (sunk if below_line(wl, x, y) else above).append([y, x, rgb(x, y)])
        return above, sunk

    # the pillar piece: the pillar and everything of the upper bowl that stands over the lower pool
    pillar_prof = dict(PILLAR)
    for y in range(-h, -66):
        xs = [x for x, yy in upper_ring if yy == y]
        if xs:
            a = min(xs) - 1
            pillar_prof[y] = (a, -a - 1)  # the bowl is round: as wide on the right as on the left
    pillar, pillar_sunk = piece(pillar_prof, lower_set, pillar_line)
    statue, statue_sunk = piece(STATUE, upper_set, statue_line)

    r = lambda v: round(v, 2)
    return {
        "pool": [r(v) for v in pool],
        "bowl": [r(v) for v in bowl],
        "lip": [r(v) for v in lip],
        "pillarLine": [r(v) for v in pillar_line],
        "statueLine": [r(v) for v in statue_line],
        "spout": list(SPOUT),
        "inset": INSET,
        "lower": runs_of(lower),
        "upper": runs_of(upper),
        "pillar": pillar,
        "pillarSunk": pillar_sunk,
        "statue": statue,
        "statueSunk": statue_sunk,
    }


def preview(im, m, dst, k=8):
    w, h = im.size
    cx = w // 2
    big = Image.new("RGBA", (w * k, h * k), (60, 80, 70, 255))
    big.alpha_composite(im.resize((w * k, h * k), Image.NEAREST))
    over = Image.new("RGBA", big.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)

    def cell(x, y, c):
        X, Y = (x + cx) * k, (y + h) * k
        d.rectangle([X, Y, X + k - 1, Y + k - 1], fill=c)

    for y, x0, x1 in m["lower"]:
        for x in range(x0, x1 + 1):
            cell(x, y, (40, 120, 255, 110))
    for y, x0, x1 in m["upper"]:
        for x in range(x0, x1 + 1):
            cell(x, y, (40, 255, 200, 110))
    for y, x, _ in m["pillar"] + m["statue"]:
        cell(x, y, (255, 80, 40, 90))
    for y, x, _ in m["pillarSunk"] + m["statueSunk"]:
        cell(x, y, (255, 230, 40, 120))

    def oval(ov, c):
        cy, rx, ry = ov
        d.ellipse([(cx - rx) * k, (h + cy - ry) * k, (cx + rx) * k, (h + cy + ry) * k], outline=c, width=2)

    oval(m["lip"], (255, 255, 255, 255))
    oval(m["pillarLine"], (255, 0, 255, 255))
    oval(m["statueLine"], (255, 0, 255, 255))
    big.alpha_composite(over)
    big.save(dst)


def main():
    atlas = Image.open(ATLAS).convert("RGBA")
    f = json.load(open(FRAMES, encoding="utf-8"))["frames"][FRAME]["frame"]
    im = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    m = measure(im)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({FRAME: m}, fh, separators=(",", ":"))
    print("fountain parts ->", os.path.relpath(OUT, ROOT))
    for key in ("pool", "bowl", "lip", "pillarLine", "statueLine"):
        print(f"  {key}: cy {m[key][0]}, rx {m[key][1]}, ry {m[key][2]}")
    print("  pixels:", {k: len(m[k]) for k in ("pillar", "pillarSunk", "statue", "statueSunk")})
    if "--preview" in sys.argv:
        dst = sys.argv[sys.argv.index("--preview") + 1]
        preview(im, m, dst)
        print("preview ->", dst)


if __name__ == "__main__":
    main()
