"""The monsters' frames, packed for the game.

Sources (assets/monsters/):
  <look>.png                       the picked still (PixelLab create_image_pro, flipped where needed to face RIGHT)
  anim/<look>_<anim>/NN.png        in-place animations made from that still by PixelLab animate_image
                                   (00 = the still itself, padded 4 px all round, then the generated frames)

Not every generated frame is kept: some redraw the monster a little differently (a horn flipping, a cap's
spots changing) and would flicker, so ANIMS lists the frames that hold together, and idle loops play back
and forth (ping-pong) so they never jump from the last frame to the first. Movement across the ground (a
slime's or a rabbit's hops, a bee's flight) is done in code; these are only the in-place loops.

All frames of a look are cropped to the same box, so they share one origin: the middle of the bottom edge,
where the monster stands.

Writes apps/client/public/assets/world/monsters.png + monsters.json (a Phaser atlas, frames <look>_<anim><i>)
and apps/client/src/world/monsters.json (per look: frame size, how many frames each animation has, fps).
--preview <png> draws every animation, enlarged.

Usage:
  python tools/monster_parts.py [--preview out.png]
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "monsters")
OUT_PNG = os.path.join(ROOT, "apps", "client", "public", "assets", "world", "monsters.png")
OUT_JSON = os.path.join(ROOT, "apps", "client", "public", "assets", "world", "monsters.json")
OUT_META = os.path.join(ROOT, "apps", "client", "src", "world", "monsters.json")

# look -> anim -> (source animation, frames kept, ping-pong, frames per second)
ANIMS = {
    "slime": {"idle": ("slime_idle", range(0, 7), True, 7)},
    "slime_king": {"idle": ("slime_king_idle", range(0, 7), True, 5)},
    "hornbun": {"idle": ("hornbun_idle", range(0, 7), True, 7)},
    "hornbun_chief": {"idle": ("hornbun_chief_idle", [0, 1, 6], True, 4)},
    "shroom": {"idle": ("shroom_idle", [0, 1, 2, 6], True, 6), "move": ("shroom_walk", range(1, 9), False, 10)},
    "shroom_king": {"idle": ("shroom_king_walk", [0], False, 1), "move": ("shroom_king_walk", range(1, 9), False, 7)},
    "sapling": {"idle": ("sapling_idle", range(0, 7), True, 6), "move": ("sapling_walk", range(1, 9), False, 10)},
    "treant_elder": {"idle": ("treant_elder_idle", range(1, 7), True, 5), "move": ("treant_elder_walk", range(1, 9), False, 7)},
    "bee": {"idle": ("bee_fly", range(1, 5), False, 16)},
    "bee_queen": {"idle": ("bee_queen_fly", range(1, 5), False, 14)},
}


def frames_of(look):
    out = {}
    for anim, (src, keep, pingpong, fps) in ANIMS[look].items():
        ims = [Image.open(os.path.join(SRC, "anim", src, f"{i:02d}.png")).convert("RGBA") for i in keep]
        if pingpong and len(ims) > 2:
            ims = ims + ims[-2:0:-1]
        out[anim] = (ims, fps)
    return out


def build():
    frames, meta = {}, {}
    for look in ANIMS:
        anims = frames_of(look)
        box = None
        for ims, _ in anims.values():
            for im in ims:
                b = im.getbbox()
                if b:
                    box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        # keep the middle of the canvas as the middle of the crop, so frames stay put
        cw = ims[0].width
        half = max(cw / 2 - box[0], box[2] - cw / 2)
        x0, x1 = int(cw / 2 - half), int(cw / 2 + half + 0.5)
        crop = (x0, box[1], x1, box[3])
        meta[look] = {"w": crop[2] - crop[0], "h": crop[3] - crop[1], "anims": {}}
        for anim, (ims, fps) in anims.items():
            for i, im in enumerate(ims):
                frames[f"{look}_{anim}{i}"] = im.crop(crop)
            meta[look]["anims"][anim] = {"n": len(ims), "fps": fps}
    return frames, meta


def pack(frames):
    names = sorted(frames, key=lambda n: -frames[n].height)
    width, x, y, row = 512, 0, 0, 0
    pos = {}
    for n in names:
        w, h = frames[n].size
        if x + w > width:
            x, y, row = 0, y + row + 1, 0
        pos[n] = (x, y)
        x += w + 1
        row = max(row, h)
    sheet = Image.new("RGBA", (width, y + row))
    meta = {}
    for n in names:
        sheet.alpha_composite(frames[n], pos[n])
        w, h = frames[n].size
        meta[n] = {"frame": {"x": pos[n][0], "y": pos[n][1], "w": w, "h": h}, "rotated": False, "trimmed": False,
                   "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h}}
    return sheet, {"frames": meta, "meta": {"image": "monsters.png", "size": {"w": width, "h": sheet.height}, "scale": "1"}}


def preview(frames, meta, dst, k=4):
    rows = [(look, anim) for look in meta for anim in meta[look]["anims"]]
    w = max(meta[l]["w"] * k * meta[l]["anims"][a]["n"] + 8 * meta[l]["anims"][a]["n"] for l, a in rows) + 130
    h = sum(meta[l]["h"] * k + 10 for l, _ in rows)
    out = Image.new("RGBA", (w, h), (74, 120, 70, 255))
    d = ImageDraw.Draw(out)
    y = 0
    for look, anim in rows:
        d.text((4, y + 4), f"{look} {anim}", fill=(255, 255, 0, 255))
        for i in range(meta[look]["anims"][anim]["n"]):
            im = frames[f"{look}_{anim}{i}"]
            out.alpha_composite(im.resize((im.width * k, im.height * k), Image.NEAREST), (130 + i * (im.width * k + 8), y))
        y += meta[look]["h"] * k + 10
    out.save(dst)


def main():
    frames, meta = build()
    sheet, atlas = pack(frames)
    sheet.save(OUT_PNG)
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(atlas, fh, separators=(",", ":"))
    with open(OUT_META, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1)
    print(f"monsters -> {len(meta)} looks, {len(frames)} frames, sheet {sheet.width}x{sheet.height}")
    if "--preview" in sys.argv:
        dst = sys.argv[sys.argv.index("--preview") + 1]
        preview(frames, meta, dst)
        print("preview ->", dst)


if __name__ == "__main__":
    main()
