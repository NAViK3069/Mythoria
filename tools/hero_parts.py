"""The heroes' looks, made the way the NPCs' are (tools/npc_parts.py) - the same model as the master character
and the townsfolk: the master's head (face frozen), body block and legs, no arms (the floating hands are the arms).
Each hero is one PixelLab inpaint of the master's bare figure (npc/_bald_head + plain tunic and legs): the hair /
headgear (or, for the automaton, the whole head) and the outfit inside the tunic block are redrawn, everything else
is kept byte for byte (assets/characters/heroes/<look>.png). The legs are the master's, recoloured as boots. Plus a
weapon (PixelLab, assets/characters/heroes/weapons/) held out beside the head, drawn over it.

A hero the owner has drawn (OWN_ART: an Aseprite sheet in assets/characters/heroes/<look>.aseprite with the
layers head, body, leg_1, leg_2 laid out apart, and the whole figure put together on another layer) is used as drawn
instead: each part is found in the put-together figure (that is where it sits on him), then the figure is moved so
its legs stand where the master's do. A head taller than the 32 px frame (a plume) gets a taller picture - the
frame sits at its bottom (MasterCharacter takes any part size that way).

Writes:
  apps/client/public/assets/characters/heroes.png + heroes.json - parts atlas (<look>_head/_body/_leg_l/_leg_r,
      weapon_<look>, offhand_<look>) for battle
  apps/client/public/assets/characters/heroes/<look>_full.png    - standing, weapon in hand (48x48, feet at 24,44)
  apps/client/public/assets/characters/heroes/<look>_big.png     - the same at 4x (192x192: a fine weapon's detail, whole pixels)
  apps/client/public/assets/characters/heroes/<look>_face.png    - head and shoulders (26x26), for the hero list
  apps/client/src/world/heroGear.json                            - how each hero holds its weapons (battle)
--preview <png> draws everyone, enlarged.

Usage:
  python tools/hero_parts.py [--preview out.png]
"""
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import npc_parts as P  # noqa: E402
from aseprite import read as read_aseprite  # noqa: E402

ROOT = P.ROOT
SRC = os.path.join(ROOT, "assets", "characters", "heroes")
OUT_PNG = os.path.join(ROOT, "apps", "client", "public", "assets", "characters", "heroes.png")
OUT_JSON = os.path.join(ROOT, "apps", "client", "public", "assets", "characters", "heroes.json")
OUT_DIR = os.path.join(ROOT, "apps", "client", "public", "assets", "characters", "heroes")
OUT_GEAR = os.path.join(ROOT, "apps", "client", "src", "world", "heroGear.json")

# the floating hands (as apps/client/src/art/hands.ts draws them) and where they rest (world/rig.ts)
SKIN = {"H": "#fff0ea", "I": "#f9e2db", "i": "#efc6ba", "j": "#d9ada0", "k": "#c4927f", "l": "#a8786a", "o": "#5a3028", "#": "#000000"}
# the hands (as apps/client/src/art/hands.ts draws them), shown at 3/4 (HAND_SCALE there)
HANDS = {
    "open": (["~iiII~", "iiiiIi", "iiiiii", "jiiiij", "~jjjj~"], (3, 2.5)),
    "grip": (["IiI", "kkj", "iij", "kkj", "iij", "jjj"], (1, 2.5)),
}
HAND_SHOW = {"open": 0.75, "grip": 0.75}
HAND_FRONT = (16 + 8, 32 - 8)
HAND_BACK = (16 - 7.5, 32 - 8.5)
# where a hand holding something sits in the standing picture: further out than at rest, so the weapon stands
# beside the head instead of behind it (a bow is held higher, so it doesn't reach the ground)
HOLD_FRONT = {"firespear": (16 + 11, 32 - 12), "spiritlantern": (16 + 11, 32 - 16), "bow": (16 + 10, 32 - 12), "dagger": (16 + 8, 32 - 9), "lance": (16 + 13, 32 - 9), "bloodsword": (16 + 13, 32 - 9)}
HOLD_FRONT_DEFAULT = (16 + 11, 32 - 9)
HOLD_BACK = (16 - 11, 32 - 9)

# the weapons: PixelLab pictures (assets/characters/heroes/weapons/<name>.png, 24x24, picked from 64 candidates),
# facing right, and how the hand holds each:
#   handle - the fist closes round the handle three rows above its end (so the pommel shows below the fist)
#            (a lantern is held up from below, like a torch)
#   hang   - carried from its top: the round hand over its ring, the rest hangs below (a lantern)
#   bow    - the fist holds the middle of the bow (its riser, the right-most part of the curve)
#   centre - held up in front of the hand, covering it (a shield)
WEAPONS = {
    "mace": "handle", "axe": "handle", "dagger": "handle", "staff": "handle", "wrench": "handle",
    "lantern": "handle", "spiritlantern": "hang", "shield": "centre", "bow": "bow",
    "knightsword": "handle", "knightshield": "centre",
    "lance": "handle", "firespear": "handle", "claw": "centre", "wand": "handle", "druidstaff": "handle", "bloodsword": "handle",
}
WSRC = os.path.join(SRC, "weapons")
# weapons drawn FINE (by the owner, or tools/weapon_art.py): art pixels to a world pixel (shown at 1/res size in the
# game). The claw is a clawed gauntlet: worn over the fist ("centre"), not held.
FINE_WEAPONS = {"knightsword": 2, "knightshield": 2, "bloodsword": 2, "dagger": 2, "bow": 2, "claw": 2, "lance": 2, "firespear": 2}


# held pointing forward rather than up (turned a quarter clockwise - a whole turn of the picture, no pixels lost).
# (None now: a blade held flat in an upright fist looked wrong - the daggers are TILTed instead.)
FORWARD = set()
# held leaning out from the body (degrees, clockwise = the point toward the foe): the front hand's, the back hand's.
# The fist turns with it (all the way, as a hand would), in the game and in the standing picture.
TILT = {"dagger": (40, -25), "firespear": (52, 0)}
# held in BOTH hands: the front hand grips at GRIP_ROW (art rows from the top), the back hand this many art px further down
# the shaft (Fenrir's spear: the owner's gold spear, held diagonally in two hands)
GRIP_ROW = {"firespear": 44}
TWO_HAND = {"firespear": 14}
# the standing pictures (48 x 48) have no room for the battle's lean: a long weapon stands more upright there, its hand
# placed where it fits
PIC_TILT = {"firespear": 28}
PIC_HOLD = {"firespear": (16 + 7, 32 - 14)}
# held close by the body in the back hand (a blade leaning back stays inside the picture)
NEAR_BACK = {"dagger"}
# mirrored in the front hand, so the blade's edge faces out, away from the body
FLIP_FRONT = {"dagger", "bloodsword"}


# how big a fine weapon is shown: world px per art px (0.5 came out too small, the owner says; 3/4 - whole pixels on
# the 4x hero-page picture, where an art pixel is 3)
FINE_SHOW = 0.75


def skin_of(head):
    """The hands' skin tones, read off the face: its commonest light colour is the highlight (I), the commonest a
    step darker and close to it the base (i); the rest of the ramp keeps the master's steps from i (and H from I)."""
    from collections import Counter
    q = head.load()
    x0, y0, x1, y1 = head.getbbox()
    cx, seen = (x0 + x1) // 2, Counter()
    for y in range(y1 - 8, y1):  # the face: the head's lower rows, the middle columns
        for x in range(cx - 5, cx + 5):
            c = q[x, y]
            if c[3] and sum(c[:3]) > 200:
                seen[c[:3]] += 1
    base = seen.most_common(1)[0][0]
    near = [c for c, _ in seen.most_common() if 15 < sum(base) - sum(c) and math.dist(c, base) < 70]
    shade = near[0] if near else tuple(round(v * k) for v, k in zip(base, (0.96, 0.875, 0.85)))
    rgb = lambda h: P.rgb(h)
    hexed = lambda c: "#%02x%02x%02x" % tuple(max(0, min(255, round(v))) for v in c)
    out = {}
    for key in "Hjklo":
        ref = rgb(SKIN["I"] if key == "H" else SKIN["i"])
        from_ = base if key == "H" else shade
        out[key] = hexed(f * a / max(1, b) for f, a, b in zip(from_, rgb(SKIN[key]), ref))
    out["I"], out["i"] = hexed(base), hexed(shade)
    return out


# a bow's string (drawn by the game - world/MasterCharacter.ts pulls it back to the other hand - and on the standing
# pictures, straight) and the arrow nocked on it: assets/characters/heroes/weapons/arrow.png (tools/weapon_art.py,
# pointing right, fine like the bow; the owner may redraw it), its nock 1 px in from its left end, between its middle rows
STRING_COLOUR = (232, 223, 196, 255)
ARROW = "arrow"
# how big the arrow is shown (world px per art px): 42 art px long - at the bow's 3/4 it would be as tall as the hero
ARROW_SHOW = 0.45


def bow_tips(im):
    """Where the string is tied: the top-most and bottom-most coloured (not outline) pixels of the bow - pixel centres."""
    p = im.load()
    pts = [(x, y) for y in range(im.height) for x in range(im.width) if p[x, y][3] and sum(p[x, y][:3]) > 30]
    top = min(pts, key=lambda q: (q[1], q[0]))
    bottom = max(pts, key=lambda q: (q[1], -q[0]))
    return (top[0] + 0.5, top[1] + 0.5), (bottom[0] + 0.5, bottom[1] + 0.5)


def strung(im):
    """The bow with its string straight between its tips (for the standing pictures)."""
    out = im.copy()
    (x0, y0), (x1, y1) = bow_tips(im)
    q = out.load()
    n = int(max(abs(x1 - x0), abs(y1 - y0)))
    for i in range(n + 1):
        u = i / max(1, n)
        x, y = int(x0 + (x1 - x0) * u), int(y0 + (y1 - y0) * u)
        if not q[x, y][3] or sum(q[x, y][:3]) < 30:
            q[x, y] = STRING_COLOUR
    return out


def res_of(name):
    return FINE_WEAPONS.get(name, 1)


# (any weapon shown at another size than FINE_SHOW)
SHOW = {}


def show_of(name):
    """World px per art px for this weapon."""
    return SHOW.get(name, FINE_SHOW if name in FINE_WEAPONS else 1)


def weapon(name, back=False):
    """(picture cropped to the item, the point the hand holds - in put()'s coordinates, in the picture's own (art)
    pixels, covers the hand?)"""
    im = Image.open(os.path.join(WSRC, f"{name}.png")).convert("RGBA")
    im = im.crop(im.getbbox())
    p = im.load()
    w, h = im.size
    solid = lambda x, y: p[x, y][3] > 0
    mode = WEAPONS[name]
    r = res_of(name)
    if mode == "handle":
        # the fist round the handle, three rows above its end (so the pommel shows below it); a fine weapon's grip is
        # longer: four world rows
        y = GRIP_ROW.get(name, h - (4 if r == 1 else 4 * r))
        xs = [x for yy in range(y - 1, y + 2) for x in range(w) if solid(x, yy)]
        x = sum(xs) / len(xs)
    elif mode == "hang":
        # its ring: three rows down from its top, the middle of what's there
        y = 2
        xs = [x for yy in range(1, 4) for x in range(w) if solid(x, yy)]
        x = sum(xs) / len(xs)
    elif mode == "bow":
        y = h // 2
        x = max(x for x in range(w) if solid(x, y)) - 1.5
    else:
        x, y = (w - 1) / 2, (h - 1) / 2
    if name in FLIP_FRONT and not back:
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        x = w - 1 - x
    if name in FORWARD and not back:
        # a quarter turn clockwise: the point that was up now points ahead, the grip goes with it
        im = im.transpose(Image.Transpose.ROTATE_270)
        x, y = h - 1 - y, x
    elif name in FORWARD:
        # in the back hand the other way: pointing behind (a pair of blades, one ahead, one back)
        im = im.transpose(Image.Transpose.ROTATE_90)
        x, y = y, w - 1 - x
    return im, (x - 1, y - 1), mode == "centre"


# look -> eye colour (None: the head has no face of ours - the automaton), boots (dark, light), front item, back item
HEROES = {
    # Bram's sword and shield are drawn by hand (tools/weapon_art.py), not PixelLab
    "bram": ("#3a6ad8", ("#3c4048", "#646a76"), "knightsword", "knightshield"),
    "kael": ("#d08a20", ("#2a1a10", "#4a2c1a"), "axe", None),
    "nyx": ("#e0304a", ("#140c1c", "#2a1c3e"), "dagger", "dagger"),
    "fen": ("#3a9a4a", ("#3a2414", "#5a3a20"), "bow", None),
    "marin": ("#2aa8b8", ("#14306a", "#1f4a96"), "staff", None),
    # Sira's lantern: drawn by hand (tools/weapon_art.py) at the heroes' own pixel size, smaller than the PixelLab one
    "sira": ("#5ad8f0", ("#7a8a9a", "#b0c0d0"), "spiritlantern", None),
    "pip": (None, ("#5a3a1a", "#8a5a28"), "wrench", None),
    # the owner's new heroes (eye / boots unused: their art is used as drawn)
    "dravik": (None, None, "lance", None),
    # Fenrir: the owner's spear (the blue-and-gold one, its blade recoloured to fire), in two hands (was twin claws)
    "fenrir": (None, None, "firespear", None),
    "neris": (None, None, "wand", None),
    "sylva": (None, None, "druidstaff", None),
    "valdris": (None, None, "bloodsword", None),
}

# looks the owner drew (an Aseprite sheet each) - used as drawn, not inpainted. All of them now: the seven starters
# were redrawn by the owner (the inpainted <look>.png pictures are only the fallback for a look missing here).
OWN_ART = {look: f"{look}.aseprite" for look in HEROES}

FULL = (48, 48)
AT = (8, 12)  # where the 32x32 frame sits on the full picture


def outlined(rows, pal):
    """Rows of palette keys (and '~' = empty inside a hand) with a 1 px black outline round them."""
    w, h = max(len(r) for r in rows), len(rows)
    im = Image.new("RGBA", (w + 2, h + 2))
    q = im.load()
    at = lambda x, y: rows[y][x] if 0 <= y < h and 0 <= x < len(rows[y]) else "."
    for y in range(-1, h + 1):
        for x in range(-1, w + 1):
            c = at(x, y)
            if c not in ".~":
                q[x + 1, y + 1] = P.rgb(pal[c]) + (255,)
            elif any(at(x + dx, y + dy) not in ".~" for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                q[x + 1, y + 1] = (0, 0, 0, 255)
    return im


def half(im):
    """A fine (2x) picture brought down to world pixels: each 2x2 block one pixel - its colour where it has colour,
    the outline where it's only outline."""
    w, h = (im.width + 1) // 2, (im.height + 1) // 2
    out = Image.new("RGBA", (w, h))
    p, q = im.load(), out.load()
    for y in range(h):
        for x in range(w):
            block = [p[x * 2 + dx, y * 2 + dy] for dy in (0, 1) for dx in (0, 1) if x * 2 + dx < im.width and y * 2 + dy < im.height]
            solid = [c for c in block if c[3] > 0]
            if not solid:
                continue
            colour = [c for c in solid if not is_line(c)]
            pick = colour if len(colour) >= 2 or len(colour) == len(solid) else [c for c in solid if is_line(c)]
            q[x, y] = tuple(sum(c[i] for c in pick) // len(pick) for i in range(3)) + (255,)
    return out


def put(canvas, im, anchor, point, s=1, show=1, tilt=0):
    """Put `im` (shown at `show` world px per art px) on a picture of s pixels to a world pixel, so its pixel `anchor`
    (rows coordinates, outline excluded) lands on `point` of the frame - turned `tilt` degrees clockwise round it."""
    k = s * show
    if k == 0.5:
        im = half(im)
    elif k != 1:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST)
    ax, ay = (anchor[0] + 1) * k, (anchor[1] + 1) * k
    if tilt:
        # on a square round the grip, turned round its middle (nothing cut off), then the middle is the grip
        R = math.ceil(max(math.hypot(cx - ax, cy - ay) for cx in (0, im.width) for cy in (0, im.height))) + 1
        pad = Image.new("RGBA", (R * 2, R * 2))
        pad.alpha_composite(im, (round(R - ax), round(R - ay)))
        im = pad.rotate(-tilt, resample=Image.NEAREST, center=(R, R))
        ax = ay = R
    x = round((AT[0] + point[0]) * s - ax)
    y = round((AT[1] + point[1]) * s - ay)
    canvas.alpha_composite(im, (x, y))


def is_line(c):
    return c[3] and c[0] + c[1] + c[2] < 90


def reoutline(im):
    """Black outline back on any coloured pixel left at an edge (after erasing)."""
    p = im.load()
    w, h = im.size
    add = []
    for y in range(h):
        for x in range(w):
            if p[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and p[nx, ny][3] and not is_line(p[nx, ny]):
                    add.append((x, y))
                    break
    for x, y in add:
        p[x, y] = (0, 0, 0, 255)


def specks(im, keep=4):
    """Drop tiny islands (fewer than `keep` pixels) and islands of outline only - stray pixels / lines PixelLab left
    in the masked side columns."""
    p = im.load()
    w, h = im.size
    seen = set()
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or not p[x, y][3]:
                continue
            group, todo = [], [(x, y)]
            seen.add((x, y))
            while todo:
                cx, cy = todo.pop()
                group.append((cx, cy))
                for nx in range(cx - 1, cx + 2):
                    for ny in range(cy - 1, cy + 2):
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and p[nx, ny][3]:
                            seen.add((nx, ny))
                            todo.append((nx, ny))
            if len(group) < keep or all(is_line(p[gx, gy]) for gx, gy in group):
                for gx, gy in group:
                    p[gx, gy] = (0, 0, 0, 0)


def cut(pic, bald, eye, boots):
    """The parts, the NPCs' way (tools/npc_parts.py): the head is the redrawn hair / headgear plus the face (eyes
    recoloured); the body is the master's tunic block (x 10-22, y 18-27) with the outfit PixelLab drew inside it;
    the legs are the master's own, recoloured."""
    head = P.head_of(pic, bald)
    p, q = pic.load(), head.load()
    for y in range(20, 28):  # the body block belongs to the body, not to the head's side columns
        for x in range(10, 23):
            q[x, y] = (0, 0, 0, 0)
    specks(head)
    if eye:
        for x, y in P.EYES:
            if q[x, y][3]:
                q[x, y] = P.rgb(eye) + (255,)
    body = Image.new("RGBA", (32, 32))
    b = body.load()
    for y in range(18, 28):
        for x in range(10, 23):
            # rows 18-19 sit under the chin: the outfit's top row again, so no gap opens when the head bobs
            src = p[x, max(y, 20)] if y >= 20 else p[x, 21]
            b[x, y] = src if src[3] else (0, 0, 0, 255)
    for x in range(10, 23):
        b[x, 18] = (0, 0, 0, 255)
    leg_l, leg_r = P.legs_of(boots)
    return head, body, leg_l, leg_r


def find(whole, part, hide=None):
    """Where `part` (cropped to its pixels) sits on `whole`: the offset with the fewest differing pixels, counting
    only pixels not under `hide` (a mask of what's drawn over it) - and at least a third of it showing."""
    import numpy as np
    W = np.asarray(whole, dtype=int)
    A = np.asarray(part, dtype=int)
    h, w = A.shape[:2]
    solid = A[..., 3] > 0
    best = None
    for y in range(W.shape[0] - h + 1):
        for x in range(W.shape[1] - w + 1):
            m = solid if hide is None else solid & ~hide[y:y + h, x:x + w]
            if m.sum() * 3 < solid.sum():
                continue
            d = int((np.abs(W[y:y + h, x:x + w] - A).sum(-1) * m).sum())
            if best is None or d < best[0]:
                best = (d, x, y)
    return best


def find_legs(whole, leg1, leg2):
    """Where the two legs sit on `whole`: the pair of spots (feet on the figure's bottom row, give or take a pixel,
    not overlapping) that matches best, left one first."""
    import numpy as np
    W = np.asarray(whole, dtype=int)
    bottom = whole.getbbox()[3] - 1

    def scores(part):
        A = np.asarray(part, dtype=int)
        h, w = A.shape[:2]
        solid = A[..., 3] > 0
        out = []
        for y in range(max(0, bottom - h - 1), min(W.shape[0] - h, bottom - h + 2) + 1):
            if abs(y + h - 1 - bottom) > 1:
                continue
            for x in range(W.shape[1] - w + 1):
                d = int((np.abs(W[y:y + h, x:x + w] - A).sum(-1) * solid).sum())
                out.append((d, x, y))
        return sorted(out)[:40], w

    s1, w1 = scores(leg1)
    s2, w2 = scores(leg2)
    best = None
    for d1, x1, y1 in s1:
        for d2, x2, y2 in s2:
            if abs(x1 - x2) < max(w1, w2):
                continue
            if best is None or d1 + d2 < best[0]:
                best = (d1 + d2, (x1, y1), (x2, y2))
    return sorted([best[1], best[2]])


def own_parts(path):
    """The parts of a hero the owner drew: found on the put-together figure, moved so the legs stand where the
    master's do (left leg's left edge at x 10, feet on the frame's bottom row)."""
    import numpy as np
    _, _, layers = read_aseprite(path)
    named = {k.lower(): v for k, v in layers.items()}
    whole = next(v for k, v in layers.items() if k.lower() not in ("head", "body", "leg_1", "leg_2", "head_back"))
    crop = {n: named[n].crop(named[n].getbbox()) for n in ("head", "body", "leg_1", "leg_2")}
    at = {}
    _, *at["head"] = find(whole, crop["head"])
    # the legs: both stand on the figure's bottom row, side by side and apart (they are the same shape, so a plain
    # best match can find the second one on top of the first) - the best pair that doesn't overlap
    (at["leg_1"], at["leg_2"]) = find_legs(whole, crop["leg_1"], crop["leg_2"])
    # the body: partly under the head
    hx, hy = at["head"]
    hide = np.zeros((whole.height, whole.width), bool)
    hide[hy:hy + crop["head"].height, hx:hx + crop["head"].width] = np.asarray(crop["head"])[..., 3] > 0
    _, *at["body"] = find(whole, crop["body"], hide)
    # hair hanging down behind (head_back, optional): behind the head and the body - found where it shows round them
    back = named.get("head_back")
    if back is not None and back.getbbox():
        crop["head_back"] = back.crop(back.getbbox())
        bx, by = at["body"]
        hide[by:by + crop["body"].height, bx:bx + crop["body"].width] |= np.asarray(crop["body"])[..., 3] > 0
        _, *at["head_back"] = find(whole, crop["head_back"], hide)
    # move the figure: left leg's left edge to x 10, the feet onto row 31
    dx = 10 - at["leg_1"][0]
    dy = 31 - (max(at["leg_1"][1], at["leg_2"][1]) + crop["leg_1"].height - 1)
    top = min(y + dy for _, y in at.values())
    extra = max(0, -top)  # rows above the frame (a plume): the head's picture is that much taller
    out = {}
    for n, im in crop.items():
        x, y = at[n][0] + dx, at[n][1] + dy
        tall = extra if n == "head" else 0
        canvas = Image.new("RGBA", (32, 32 + tall))
        canvas.alpha_composite(im, (x, y + tall))
        out[n] = canvas
    if "head_back" in out:
        # the back hair goes on the body's picture, under the body (the parts are head / body / legs only)
        body = out.pop("head_back")
        body.alpha_composite(out["body"])
        out["body"] = body
    return out["head"], out["body"], out["leg_1"], out["leg_2"]


def place(canvas, part, at, s=1):
    """Composite a part whose picture may be taller than the 32 px frame (the frame at its bottom) at frame `at`
    (on a picture of s pixels to a world pixel)."""
    x, y = at[0] - (part.width - 32) // 2, at[1] - (part.height - 32)
    if s != 1:
        part = part.resize((part.width * s, part.height * s), Image.NEAREST)
    canvas.alpha_composite(part, (x * s, y * s))


def build():
    parts, pictures = {}, {}
    global skins
    skins = {}
    bald = Image.open(os.path.join(P.SRC, "_bald_head.png")).convert("RGBA")
    for look, (eye, boots, front, back) in HEROES.items():
        if look in OWN_ART:
            head, body, leg_l, leg_r = own_parts(os.path.join(SRC, OWN_ART[look]))
        else:
            pic = Image.open(os.path.join(SRC, f"{look}.png")).convert("RGBA")
            head, body, leg_l, leg_r = cut(pic, bald, eye, boots)
        parts[f"{look}_head"], parts[f"{look}_body"] = head, body
        parts[f"{look}_leg_l"], parts[f"{look}_leg_r"] = leg_l, leg_r

        wpic, fgrip, fover = weapon(front)
        parts[f"weapon_{look}"] = wpic
        if WEAPONS[front] == "bow":
            parts[ARROW] = Image.open(os.path.join(WSRC, f"{ARROW}.png")).convert("RGBA")
            wpic = strung(wpic)  # (the standing pictures show the string; the game draws its own)
        skin = skins[look] = skin_of(head)
        hand = lambda pose: outlined(HANDS[pose][0], {**SKIN, **skin})
        item = bgrip = None
        bover = False
        if back:
            item, bgrip, bover = weapon(back, back=True)
            parts[f"offhand_{look}"] = item
        front_at = HOLD_FRONT.get(front, HOLD_FRONT_DEFAULT)
        # (a blade pointing behind stays by the body, or it runs off the picture)
        back_at = HOLD_BACK if item is not None and not bover and back not in NEAR_BACK else HAND_BACK
        fres, bres = show_of(front), (show_of(back) if back else 1)
        ftilt = TILT.get(front, (0, 0))[0]
        btilt = TILT.get(back, (0, 0))[1] if back else 0

        def standing(s):
            """The standing picture at s pixels to a world pixel. Layers, back to front (as MasterCharacter stacks
            them): legs and body, the head, then each hand with what it holds over the head - the back one first: its
            item, its fist; then the front weapon, its fist. A shield is held up over its hand."""
            full = Image.new("RGBA", (FULL[0] * s, FULL[1] * s))
            for part in (leg_l, leg_r, body, head):
                place(full, part, AT, s)
            if item is not None and not bover:
                put(full, item, bgrip, back_at, s, bres, btilt)
            two = TWO_HAND.get(front)
            pt, pat = PIC_TILT.get(front, ftilt), PIC_HOLD.get(front, front_at)
            if not two:
                bpose = "grip" if item is not None and not bover else "open"
                # (the fist turns with what it holds)
                put(full, hand(bpose), HANDS[bpose][1], back_at, s, HAND_SHOW[bpose], btilt if bpose == "grip" else 0)
            if bover:
                put(full, item, bgrip, back_at, s, bres)
            if not fover:
                put(full, wpic, fgrip, pat, s, fres, pt)
            if two:
                # the back hand further down the same shaft, over it
                d, a = two * fres, math.radians(pt)
                put(full, hand("grip"), HANDS["grip"][1], (pat[0] - math.sin(a) * d, pat[1] + math.cos(a) * d), s, HAND_SHOW["grip"], pt)
            fpose = "open" if WEAPONS[front] == "hang" else "grip"
            put(full, hand(fpose), HANDS[fpose][1], pat, s, HAND_SHOW[fpose], pt)
            if fover:
                put(full, wpic, fgrip, front_at, s, fres)
            return full

        full = standing(1)
        big = standing(4)
        # the hero list's picture: the head and shoulders, without hands or weapons
        bare = Image.new("RGBA", (32, 40))
        for part in (leg_l, leg_r, body, head):
            place(bare, part, (0, 8))
        hx0, hy0, hx1, _ = head.getbbox()
        hy0 += 8 - (head.height - 32)
        cx = (hx0 + hx1) // 2
        # 30 x 30: wide enough for the owner's widest heads (a hat brim, elf ears, a plume)
        face = bare.crop((cx - 15, max(0, hy0 - 1), cx + 15, max(0, hy0 - 1) + 30))
        pictures[look] = (full, face, big)
    return parts, pictures


def pack(parts):
    names = list(parts)
    x = y = row_h = 0
    width = 256
    pos = {}
    for n in names:
        w, h = parts[n].size
        if x + w + 1 > width:
            x, y, row_h = 0, y + row_h + 1, 0
        pos[n] = (x, y)
        x += w + 1
        row_h = max(row_h, h)
    sheet = Image.new("RGBA", (width, y + row_h))
    meta = {}
    for n in names:
        sheet.alpha_composite(parts[n], pos[n])
        w, h = parts[n].size
        meta[n] = {"frame": {"x": pos[n][0], "y": pos[n][1], "w": w, "h": h}, "rotated": False, "trimmed": False,
                   "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h}}
    return sheet, {"frames": meta, "meta": {"image": "heroes.png", "size": {"w": width, "h": sheet.height}, "scale": "1"}}


def main():
    import json
    parts, pictures = build()
    sheet, meta = pack(parts)
    sheet.save(OUT_PNG)
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    os.makedirs(OUT_DIR, exist_ok=True)
    for look, (full, face, big) in pictures.items():
        full.save(os.path.join(OUT_DIR, f"{look}_full.png"))
        # the same at 4x, for the hero page (a fine weapon shows its detail there, in whole pixels)
        big.save(os.path.join(OUT_DIR, f"{look}_big.png"))
        face.save(os.path.join(OUT_DIR, f"{look}_face.png"))
    # how the game holds each hero's weapons (MasterCharacter.setGear): the atlas frame, the pixel the hand holds,
    # whether it covers the hand, and where the hand holding it rests (feet-local, facing right)
    gear = {}
    for look, (_, _, front, back) in HEROES.items():
        def held(name, frame, at, back=False):
            im, (ax, ay), over = weapon(name, back)
            g = {"frame": frame, "x": ax + 1, "y": ay + 1, "w": im.width, "h": im.height, "over": over,
                 "rest": [at[0] - 16, at[1] - 32]}
            if show_of(name) != 1:
                g["scale"] = show_of(name)  # drawn fine: shown at this size
            t = TILT.get(name, (0, 0))[1 if back else 0]
            if t:
                g["tilt"] = round(math.radians(t), 4)  # held leaning out (radians, clockwise)
            return g
        g = {"front": held(front, f"weapon_{look}", HOLD_FRONT.get(front, HOLD_FRONT_DEFAULT))}
        if front in TWO_HAND:
            g["front"]["twoHand"] = TWO_HAND[front] * show_of(front)  # world px down the shaft to the back hand
        if WEAPONS[front] == "hang":
            g["front"]["pose"] = "open"  # carried from its top: the round hand over its ring
        if WEAPONS[front] == "bow":
            # the string's ends (picture px) and the arrow nocked on it (its nock: 1 px in, between the middle rows)
            (tx0, ty0), (tx1, ty1) = bow_tips(weapon(front)[0])
            arrow = Image.open(os.path.join(WSRC, f"{ARROW}.png"))
            g["front"]["string"] = [tx0, ty0, tx1, ty1]
            g["front"]["arrow"] = {"frame": ARROW, "x": 1, "y": arrow.height / 2, "w": arrow.width, "h": arrow.height, "scale": ARROW_SHOW}
        if back:
            _, _, bover = weapon(back, True)
            g["back"] = held(back, f"offhand_{look}", HAND_BACK if bover or back in NEAR_BACK else HOLD_BACK, True)
        g["skin"] = skins[look]  # the hands in its own skin (art/hands.ts Skin)
        gear[look] = g
    with open(OUT_GEAR, "w", encoding="utf-8") as fh:
        json.dump(gear, fh, indent=1)
    print(f"heroes -> {len(pictures)} looks, {len(parts)} parts")
    if "--preview" in sys.argv:
        dst = sys.argv[sys.argv.index("--preview") + 1]
        k = 6
        out = Image.new("RGBA", (len(pictures) * (FULL[0] * k + 8), FULL[1] * k + 18), (74, 120, 70, 255))
        d = ImageDraw.Draw(out)
        for i, (look, (full, _, _)) in enumerate(pictures.items()):
            out.alpha_composite(full.resize((FULL[0] * k, FULL[1] * k), Image.NEAREST), (i * (FULL[0] * k + 8), 16))
            d.text((i * (FULL[0] * k + 8) + 4, 2), look, fill=(255, 255, 0, 255))
        out.save(dst)
        print("preview ->", dst)


if __name__ == "__main__":
    main()
