"""The town's people (NPCs), built the way the hero is: head, body and two legs on one 32x32 frame, no arms
(the game gives them the hero's floating hands).

Every NPC starts from the hero's own bare figure (E:/Pixelart Hero00 → assets/characters/npcs/_bald_head.png):
  * head: its hair / hat was redrawn by PixelLab inpainting ONLY the hair area of the bald head (the face was
    frozen, so the eyes, the line and where everything sits are exactly the hero's) → assets/characters/npcs/
    <id>.png. The head is cut back out of that picture: the hair area plus the face; the eyes are recoloured.
  * body: the outfit, drawn here as a pixel grid on the hero's tunic block (x 10-22, y 18-27), shaded the way
    the hero's tunic is (darkest at the left edge, light at the front, 1 px black outline).
  * legs: the hero's boots, recoloured.

Writes apps/client/public/assets/characters/npcs.png + npcs.json (a Phaser atlas, frames <id>_head,
<id>_body, <id>_leg_l, <id>_leg_r, each the full 32x32 frame). --preview <png> draws everyone assembled.

Usage:
  python tools/npc_parts.py [--preview out.png]
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "characters", "npcs")
MASTER = os.path.join(ROOT, "apps", "client", "public", "assets", "characters", "master")
OUT_PNG = os.path.join(ROOT, "apps", "client", "public", "assets", "characters", "npcs.png")
OUT_JSON = os.path.join(ROOT, "apps", "client", "public", "assets", "characters", "npcs.json")

EYES = [(16, 16), (21, 16)]  # the hero's eye pixels
BODY = (11, 19)  # the tunic's inside starts here; 11 x 8 px, inside a 1 px outline

# id -> eye colour, boots (dark, light), outfit palette, outfit rows (y 19..26, x 11..21)
NPCS = {
    "shop": ("#7a4a26", ("#3a2414", "#5a3a20"),
             {"s": "#b8a888", "S": "#e8dcc0", "L": "#fff6e0", "a": "#2f6b3a", "A": "#3f8f4a", "H": "#62b26a"},
             ["sSSaSSSaSSL", "sSSaSSSaSSL", "sSaAAAAAHSL", "sSaAAAAAHSL", "sSaAaaaAHSL", "sSaAAAAAHSL", "sSaAAAAAHSL", "sSaAAAAAHSL"]),
    "potion": ("#8a46c8", ("#2a1838", "#3e2456"),
               {"p": "#3b2459", "P": "#5a3a86", "Q": "#7a55b0", "R": "#9a78cc", "T": "#d4a63a", "l": "#e8d8ff"},
               ["pPQQTTTQQPR", "pPQQQTQQQPR", "pPQQQlQQQPR", "pPQQQTQQQPR", "pPQQQTQQQPR", "TTTTTTTTTTT", "pPQQQTQQQPR", "pPQQQTQQQPR"]),
    "smith": ("#d08a20", ("#20140a", "#3a2414"),
              {"g": "#2a2a30", "G": "#3d3d46", "h": "#55555f", "b": "#4a2c1a", "B": "#6b4026", "n": "#8a5634"},
              ["gGGbGGGbGGh", "gGGbGGGbGGh", "gGbBBBBBnGh", "gGbBBBBBnGh", "gGbBbbbBnGh", "gGbBBBBBnGh", "gGbBBBBBnGh", "gGbBBBBBnGh"]),
    "inn": ("#3a9a4a", ("#2a1a10", "#4a2c1a"),
            {"v": "#3e2716", "V": "#5a3a22", "u": "#7a5232", "W": "#e6e0d8", "X": "#ffffff", "r": "#c8323e"},
            ["vVVWrrrWVVu", "vVVWWrWWVVu", "vVVVWWWVVVu", "vVVVWXWVVVu", "vVVVWWWVVVu", "vVVVWXWVVVu", "vVVVWWWVVVu", "vVVVWWWVVVu"]),
    "guild": ("#3a6ad8", ("#10142a", "#1e2850"),
              {"n": "#141a33", "N": "#1e2850", "M": "#2c3a70", "m": "#3d4f8f", "y": "#e0b84a", "Y": "#ffe08a"},
              ["nNyYYYYYyNm", "nNMMMyMMMNm", "nNMMMMMMMNm", "nNMMMyMMMNm", "nNMMMMMMMNm", "nNMMMyMMMNm", "nNMMMMMMMNm", "nNMMMMMMMNm"]),
    "priest": ("#d0a020", ("#6a6478", "#9a94aa"),
               {"w": "#a8a4b8", "W": "#d8d4e4", "X": "#f6f4ff", "T": "#d4a63a", "t": "#a07a20"},
               ["wWXTTTTTXWX", "wWWXXTXXWWX", "wWWXXTXXWWX", "wWWXXTXXWWX", "wWWXXTXXWWX", "wWWXXTXXWWX", "wWWXXTXXWWX", "tTTTTTTTTTT"]),
    "quest": ("#3a9a4a", ("#2a1a10", "#4a2c1a"),
              {"r": "#5a1418", "R": "#8a2028", "Q": "#b83038", "q": "#d84850", "c": "#e8d8b0", "b": "#3a2414", "y": "#e0b84a"},
              ["rRccQQQccRq", "rRQccQccQRq", "rRQQcQcQQRq", "rRQQQQQQQRq", "rRQQQQQQQRq", "bbbbbyybbbb", "rRQQQQQQQRq", "rRQQQQQQQRq"]),
    "guard": ("#5a7090", ("#2a2e36", "#4a505c"),
              {"s": "#3c4048", "S": "#646a76", "T": "#8e95a3", "U": "#c4cad6", "d": "#1a2c5a", "D": "#28428a", "y": "#e0b84a"},
              ["sSTTUUUTTSU", "sSTdDDDdTSU", "sSTdDyDdTSU", "sSTdDDDdTSU", "sSTdDDDdTSU", "sSTdDDDdTSU", "sSTdDDDdTSU", "sSTdDDDdTSU"]),
    "fruit": ("#7a4a26", ("#3a2414", "#5a3a20"),
              {"g": "#1f4a2a", "G": "#2f6b3a", "H": "#4a8f52", "h": "#6ab070", "W": "#f4eee0"},
              ["gGWWWWWWWGh", "gGHHHHHHHGh", "gGHWWWWWHGh", "gGHWWWWWHGh", "gGHWWWWWHGh", "gGHWWWWWHGh", "gGHWWWWWHGh", "gGHWWWWWHGh"]),
    "bard": ("#2a9a9a", ("#20140a", "#3a2414"),
             {"b": "#14204a", "B": "#1f3170", "C": "#2c4596", "c": "#3f5cb8", "s": "#6b4026", "y": "#e0b84a"},
             ["bByCCCCCCBc", "bBCsCCCCCBc", "bBCCsCCCCBc", "bBCCCsCCCBc", "bBCCCCsCCBc", "bBCCCCCsCBc", "bBCCCCCCsBc", "bBCCCCCCCBc"]),
    "baker": ("#3a6ad8", ("#5a5650", "#8a867e"),
              {"w": "#b0aca4", "W": "#dcd8d0", "X": "#f8f6f0", "o": "#8a8278"},
              ["wWXXXXXXXWX", "wWXoXXXoXWX", "wWXXXXXXXWX", "wWXoXXXoXWX", "wWXXXXXXXWX", "wWXoXXXoXWX", "wWXXXXXXXWX", "wWXXXXXXXWX"]),
    "adventurer": ("#3a9a4a", ("#20140a", "#3a2414"),
                   {"l": "#3a2414", "L": "#5a3a20", "M": "#7a5230", "m": "#9a6c42", "g": "#2f6b3a", "G": "#4a8f52", "b": "#20140a", "y": "#c0a040"},
                   ["lgGGGGGGGgm", "lLMgMMMMMLm", "lLMMMMMMMLm", "lLMMMMMMMLm", "lLMMMMMMMLm", "bbbbbybbbbb", "lLMMMMMMMLm", "lLMMMMMMMLm"]),
    "villager": ("#6a5a4a", ("#2a1a10", "#4a2c1a"),
                 {"d": "#4a3a2a", "D": "#6a5440", "E": "#8a7058", "e": "#a88c70", "r": "#c8b080"},
                 ["dDEEEEEEEDe", "dDEEEEEEEDe", "dDEEEEEEEDe", "dDEEEEEEEDe", "dDEEEEEEEDe", "rrrrrrrrrrr", "dDEEEEEEEDe", "dDEEEEEEEDe"]),
}


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def head_of(pic, bald):
    """The head out of an inpainted picture: the hair area that was redrawn, and the face."""
    out = Image.new("RGBA", (32, 32))
    p, b, q = pic.load(), bald.load(), out.load()
    for y in range(32):
        for x in range(32):
            hair = y <= 13 or ((x <= 8 or x >= 23) and y <= 26)
            if (hair or b[x, y][3] > 0) and p[x, y][3] > 0:
                q[x, y] = p[x, y]
    return out


def body_of(rows, pal):
    out = Image.new("RGBA", (32, 32))
    q = out.load()
    for y in range(18, 28):
        for x in range(10, 23):
            q[x, y] = (0, 0, 0, 255)
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            q[BODY[0] + i, BODY[1] + j] = rgb(pal[ch]) + (255,)
    return out


def legs_of(boots):
    out = []
    dark, light = rgb(boots[0]), rgb(boots[1])
    for f in ("leg_l.png", "leg_r.png"):
        im = Image.open(os.path.join(MASTER, f)).convert("RGBA")
        p = im.load()
        for y in range(32):
            for x in range(32):
                r, g, b, a = p[x, y]
                if a and (r, g, b) != (0, 0, 0):
                    # the hero's two boot shades, lighter one kept lighter
                    p[x, y] = (light if r + g + b > 0x15 + 0x18 + 0x24 else dark) + (255,)
        out.append(im)
    return out


def build():
    bald = Image.open(os.path.join(SRC, "_bald_head.png")).convert("RGBA")
    frames = {}
    for nid, (eye, boots, pal, rows) in NPCS.items():
        pic = Image.open(os.path.join(SRC, f"{nid}.png")).convert("RGBA")
        head = head_of(pic, bald)
        q = head.load()
        for x, y in EYES:
            if q[x, y][3]:
                q[x, y] = rgb(eye) + (255,)
        frames[f"{nid}_head"] = head
        frames[f"{nid}_body"] = body_of(rows, pal)
        frames[f"{nid}_leg_l"], frames[f"{nid}_leg_r"] = legs_of(boots)
    return frames


def pack(frames):
    names = list(frames)
    cols = 8
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * 33, rows * 33))
    meta = {}
    for i, n in enumerate(names):
        x, y = (i % cols) * 33, (i // cols) * 33
        sheet.alpha_composite(frames[n], (x, y))
        meta[n] = {"frame": {"x": x, "y": y, "w": 32, "h": 32}, "rotated": False, "trimmed": False,
                   "spriteSourceSize": {"x": 0, "y": 0, "w": 32, "h": 32}, "sourceSize": {"w": 32, "h": 32}}
    return sheet, {"frames": meta, "meta": {"image": "npcs.png", "size": {"w": sheet.width, "h": sheet.height}, "scale": "1"}}


def preview(frames, dst, k=6):
    ids = list(NPCS)
    sheet = Image.new("RGBA", (len(ids) * (32 * k + 6), 32 * k + 20), (74, 120, 70, 255))
    d = ImageDraw.Draw(sheet)
    for i, nid in enumerate(ids):
        im = Image.new("RGBA", (32, 32))
        for part in ("leg_l", "leg_r", "body", "head"):
            im.alpha_composite(frames[f"{nid}_{part}"])
        x = i * (32 * k + 6)
        sheet.alpha_composite(im.resize((32 * k, 32 * k), Image.NEAREST), (x, 18))
        d.text((x + 2, 2), nid, fill=(255, 255, 0, 255))
    sheet.save(dst)


def main():
    frames = build()
    sheet, meta = pack(frames)
    sheet.save(OUT_PNG)
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    print(f"npcs -> {os.path.relpath(OUT_PNG, ROOT)} ({len(NPCS)} people, {len(frames)} frames)")
    if "--preview" in sys.argv:
        dst = sys.argv[sys.argv.index("--preview") + 1]
        preview(frames, dst)
        print("preview ->", dst)


if __name__ == "__main__":
    main()
