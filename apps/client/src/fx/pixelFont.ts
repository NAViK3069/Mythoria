import { fade, mixRGB, Surface, type RGB } from './surface';

// Mythoria's own pixel font - for numbers and short shouts in battle (damage, CRIT, COMBO, VICTORY...), drawn
// pixel by pixel on our engine (fx/surface.ts) at the map's own pixel size, and for the HUD's numbers (drawn to a
// small canvas, shown pixelated). Glyphs are classic 5 x 7 strokes (easy to read); "bold" doubles every stroke sideways;
// scale 2 doubles every pixel. A text is turned into a mask once (cached), then painted: a top-to-bottom colour
// ramp, a dark outline round it, a drop shadow under it - any of it can be scaled about its middle for a pop,
// dithered away for a fade, or drawn hollow (outline only).

const G: Record<string, string[]> = {
  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '.#', '.#', '#.'],
  ':': ['.', '.', '#', '.', '.', '#', '.'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
};

/** A text as pixels: w x h, 1 where the letters are. */
export interface Mask {
  w: number;
  h: number;
  m: Uint8Array;
}

const cache = new Map<string, Mask>();

/** The text's mask (bold: strokes doubled sideways; scale: every pixel n x n). */
export function textMask(text: string, bold = false, scale = 1): Mask {
  const key = `${bold ? 'b' : 't'}${scale}|${text}`;
  let mask = cache.get(key);
  if (mask) return mask;
  // "×" is the small times sign; everything else upper case
  const glyphs = [...text].map((ch) => (ch === '×' ? G.x : G[ch.toUpperCase()]) ?? G[' ']);
  const gap = 1;
  const wOf = (g: string[]) => g[0].length + (bold ? 1 : 0);
  const w0 = glyphs.reduce((n, g) => n + wOf(g), 0) + gap * Math.max(0, glyphs.length - 1);
  const h0 = 7;
  const base = new Uint8Array(w0 * h0);
  let x = 0;
  for (const g of glyphs) {
    for (let y = 0; y < h0; y++)
      for (let i = 0; i < g[y].length; i++)
        if (g[y][i] === '#') {
          base[y * w0 + x + i] = 1;
          if (bold) base[y * w0 + x + i + 1] = 1;
        }
    x += wOf(g) + gap;
  }
  const w = w0 * scale, h = h0 * scale;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) m[y * w + xx] = base[Math.floor(y / scale) * w0 + Math.floor(xx / scale)];
  mask = { w, h, m };
  cache.set(key, mask);
  return mask;
}

export interface TextLook {
  /** Fill colours top to bottom. */
  ramp: RGB[];
  outline: RGB;
  /** A darker copy one pixel under it. */
  shadow?: RGB;
  /** A light line along the top of every stroke. */
  shine?: RGB;
}

export const LOOKS = {
  dmg: { ramp: [0xffffff, 0xffd2c8, 0xff7a68, 0xe8384a, 0xb01c3a], outline: 0x2a0812, shadow: 0x12040a } as TextLook,
  crit: { ramp: [0xfffbe0, 0xffec8a, 0xffc93a, 0xff9a1e, 0xe0601a], outline: 0x3a1206, shadow: 0x1a0804, shine: 0xffffff } as TextLook,
  heal: { ramp: [0xf4fff0, 0xb8ffb0, 0x5ee87a, 0x22b25a, 0x0e7a44], outline: 0x06281a, shadow: 0x02140c } as TextLook,
  shield: { ramp: [0xffffff, 0xd8f2ff, 0x8ad2ff, 0x4a9ae8, 0x2a60c0], outline: 0x0a1a3a, shadow: 0x040a1a } as TextLook,
  miss: { ramp: [0xffffff, 0xe6ecf4, 0xb8c4d4, 0x8a98ae], outline: 0x1a2030, shadow: 0x0a0e18 } as TextLook,
  gold: { ramp: [0xfffbe8, 0xfff0a0, 0xffd75a, 0xe8a830, 0xb8761a], outline: 0x2a1604, shadow: 0x140a02, shine: 0xffffff } as TextLook,
  combo: { ramp: [0xffffff, 0xffd0f6, 0xff7ae0, 0xe03ac0, 0x9a1a8a], outline: 0x24061e, shadow: 0x12030f } as TextLook,
  white: { ramp: [0xffffff, 0xffffff, 0xeef2ff], outline: 0x161a28 } as TextLook,
  ui: { ramp: [0xffffff, 0xf2f4ff, 0xd6dcec], outline: 0x0c1020, shadow: 0x05070e } as TextLook,
  uiGold: { ramp: [0xfffbe0, 0xffe48a, 0xffc94a, 0xe0962a], outline: 0x261404, shadow: 0x0e0802 } as TextLook,
};

/** Does pixel (x, y) show at strength k (0..1)? A 4 x 4 ordered dither mixed with opacity (surface.ts `fade`): the
 * pixel drawn next there is see-through by k - a smooth fade, not a thinning checkerboard. */
export const dither = fade;

export interface PaintOpts {
  /** 1 = as drawn; the mask is scaled about its middle (nearest pixel - stays crisp). */
  scale?: number;
  /** 0..1, fades out (a dither mixed with opacity, surface.ts `fade`). */
  show?: number;
  /** Only the outline (an empty letter shape). */
  hollow?: boolean;
  /** 0..1 flash: the fill washes to white. */
  flash?: number;
  /** Lean (x per y), for a slanted look. */
  slant?: number;
  /** Shift each row sideways (by its screen row) - a glitch. */
  rowShift?: (y: number) => number;
  /** Added light over the letters (0..1). */
  glow?: number;
  glowColour?: RGB;
}

/**
 * Paint a mask with its middle at (cx, cy) - outline, shadow, ramp, shine. Drawn where the surface's coordinates
 * say (world px in battle).
 */
export function paintMask(s: Surface, mask: Mask, cx: number, cy: number, look: TextLook, o: PaintOpts = {}): void {
  const k = o.scale ?? 1, show = o.show ?? 1, flash = o.flash ?? 0, slant = o.slant ?? 0;
  if (show <= 0 || k <= 0.05) return;
  const { w, h, m } = mask;
  // the box it covers once scaled (1 px round it for the outline, 1 more under it for the shadow)
  const sw = Math.ceil(w * k), sh = Math.ceil(h * k);
  const x0 = Math.round(cx - sw / 2), y0 = Math.round(cy - sh / 2);
  const ins = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= sw || ty >= sh) return false;
    const sx = Math.floor(((tx + 0.5) / sw) * w), sy = Math.floor(((ty + 0.5) / sh) * h);
    return m[sy * w + sx] === 1;
  };
  const shift = (ty: number) => Math.round((sh / 2 - ty) * slant) + Math.round(o.rowShift?.(y0 + ty) ?? 0);
  for (let ty = -1; ty <= sh + 1; ty++) {
    const dx = shift(ty);
    for (let tx = -1; tx <= sw; tx++) {
      const X = x0 + tx + dx, Y = y0 + ty;
      if (!dither(X, Y, show)) continue;
      const inside = ins(tx, ty);
      if (inside) {
        if (o.hollow) continue;
        const v = ty / Math.max(1, sh - 1);
        const r = look.ramp;
        const f = v * (r.length - 1), i = Math.min(r.length - 2, Math.floor(f));
        let c = mixRGB(r[i], r[i + 1], Math.round((f - i) * 2) / 2);
        if (look.shine && !ins(tx, ty - 1)) c = mixRGB(c, look.shine, 0.7);
        if (flash > 0) c = mixRGB(c, 0xffffff, flash);
        s.px(X, Y, c);
        if (o.glow) s.add(X, Y, o.glowColour ?? 0xffffff, o.glow * 0.5);
        continue;
      }
      // outline: next to a letter pixel (8 ways)
      let edge = false;
      for (let yy = -1; yy <= 1 && !edge; yy++) for (let xx = -1; xx <= 1; xx++) if ((xx || yy) && ins(tx + xx, ty + yy)) { edge = true; break; }
      if (edge) {
        s.px(X, Y, o.hollow && flash > 0 ? mixRGB(look.outline, 0xffffff, flash) : look.outline);
        continue;
      }
      // shadow: under the outline
      if (look.shadow && !o.hollow && (ins(tx, ty - 2) || ins(tx - 1, ty - 2) || ins(tx + 1, ty - 2))) s.px(X, Y, look.shadow);
    }
  }
}

/** Paint a text (its middle at cx, cy). */
export function paintText(s: Surface, text: string, cx: number, cy: number, look: TextLook, o: PaintOpts & { bold?: boolean; size?: number } = {}): Mask {
  const mask = textMask(text, o.bold, o.size ?? 1);
  paintMask(s, mask, cx, cy, look, o);
  return mask;
}

/**
 * A text drawn once onto a canvas element, for the HTML HUD: shown at `zoom` CSS px per pixel, pixelated.
 * Returns the canvas (its CSS size set).
 */
export function textCanvas(text: string, look: TextLook, opts: { bold?: boolean; size?: number; zoom?: number; className?: string } = {}): HTMLCanvasElement {
  const mask = textMask(text, opts.bold, opts.size ?? 1);
  const W = mask.w + 2, H = mask.h + 3;
  const s = new Surface(W, H, 0, 0);
  paintMask(s, mask, W / 2, (H - 1) / 2, look);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const img = new ImageData(W, H);
  s.write(img.data);
  c.getContext('2d')!.putImageData(img, 0, 0);
  // the HUD's own pixel size (--p) unless a zoom is given
  c.style.width = opts.zoom ? `${W * opts.zoom}px` : `calc(var(--p, 2px) * ${W})`;
  c.style.height = opts.zoom ? `${H * opts.zoom}px` : `calc(var(--p, 2px) * ${H})`;
  c.className = `pxt ${opts.className ?? ''}`;
  return c;
}
