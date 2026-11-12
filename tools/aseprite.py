"""Read an Aseprite file (.aseprite / .ase) without Aseprite: its canvas size and, for frame 0, each layer's picture
on the full canvas. Enough for the owner's character sheets (RGBA, indexed or grayscale; raw or zlib cels).

    from aseprite import read
    w, h, layers = read(path)          # layers: {name: PIL RGBA image the canvas's size}, bottom layer first
"""
import struct
import zlib

from PIL import Image


def read(path):
    data = open(path, "rb").read()
    _size, magic, frames, W, H, depth = struct.unpack_from("<IHHHHH", data, 0)
    if magic != 0xA5E0:
        raise ValueError(f"{path}: not an Aseprite file")
    pos = 128
    names = []
    palette = {}
    cels = []
    for f in range(frames):
        fsize, _fmagic, old_chunks, _dur = struct.unpack_from("<IHHH", data, pos)
        new_chunks = struct.unpack_from("<I", data, pos + 12)[0]
        p = pos + 16
        for _ in range(new_chunks or old_chunks):
            csize, ctype = struct.unpack_from("<IH", data, p)
            body = data[p + 6:p + csize]
            if ctype == 0x2004:  # layer
                n = struct.unpack_from("<H", body, 16)[0]
                names.append(body[18:18 + n].decode("utf-8", "replace"))
            elif ctype == 0x2019:  # palette
                _ps, first, last = struct.unpack_from("<III", body, 0)
                q = 20
                for i in range(first, last + 1):
                    fl, r, g, b, a = struct.unpack_from("<HBBBB", body, q)
                    q += 6
                    if fl & 1:
                        q += 2 + struct.unpack_from("<H", body, q)[0]
                    palette[i] = (r, g, b, a)
            elif ctype == 0x2005 and f == 0:  # a cel of the first frame
                li, x, y, _op, ct = struct.unpack_from("<HhhBH", body, 0)
                if ct in (0, 2):
                    w, h = struct.unpack_from("<HH", body, 16)
                    raw = body[20:] if ct == 0 else zlib.decompress(body[20:])
                    if depth == 32:
                        img = Image.frombytes("RGBA", (w, h), raw[:w * h * 4])
                    elif depth == 8:
                        img = Image.new("RGBA", (w, h))
                        img.putdata([palette.get(v, (0, 0, 0, 0)) for v in raw[:w * h]])
                    else:
                        img = Image.frombytes("LA", (w, h), raw[:w * h * 2]).convert("RGBA")
                    cels.append((li, x, y, img))
            p += csize
        pos += fsize
    layers = {}
    for li, x, y, img in sorted(cels):
        canvas = Image.new("RGBA", (W, H))
        canvas.alpha_composite(img.crop((max(0, -x), max(0, -y), img.width, img.height)), (max(0, x), max(0, y)))
        layers[names[li]] = canvas
    return W, H, layers
