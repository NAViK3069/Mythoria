import { mixRGB, Surface, type RGB } from '../fx/surface';
import { paintIcon, type Icon } from '../fx/pixelIcons';

// The battle HUD's pixel-art kit, drawn by code on our engine (fx/surface.ts) - flat and modern (dark glass, a thin
// bright edge, an accent colour), every piece its own shape: a plate with one corner cut and a cyan accent for the
// fighter's card, a slanted gold-edged plate for the turn, parallelogram bars for the teams' HP (blue leaning one
// way, red the other), square move buttons with cut corners and a polished steel rim (gold corners on a skill) and a
// hexagon badge for the cost, squares edged in the team's colour for the turn order, swallowtail ribbons.
// Frames are 9-sliced by CSS border-image (`--k-<name>` on the HUD's root), shown at `--p` CSS px per pixel - one
// whole number for the whole HUD, so every pixel on it is the same size.

export interface Frame {
  url: string;
  /** Corner size to 9-slice (px of the picture). */
  slice: number;
  w: number;
  h: number;
}

interface Rim {
  light: RGB;
  dark: RGB;
}

interface Spec {
  w: number;
  h: number;
  /** Corners cut off diagonally: top-left, top-right, bottom-right, bottom-left. */
  cut: [number, number, number, number];
  outline: RGB;
  /** Rings inside the outline, outermost first: lit on the top / left, shaded on the bottom / right. */
  rims: Rim[];
  /** The middle, top to bottom. */
  fill: [RGB, RGB];
  alpha?: number;
  /** Extra pixels on top (corner studs, gems...). */
  accent?: (s: Surface, w: number, h: number) => void;
  /** Leave a pixel out (notches). */
  hole?: (x: number, y: number, w: number, h: number) => boolean;
}

function toUrl(w: number, h: number, paint: (s: Surface) => void): string {
  const s = new Surface(w, h, 0, 0);
  paint(s);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const img = new ImageData(w, h);
  s.write(img.data);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** Paint a frame: each pixel by how far in from the edge it is (cut corners count diagonally). */
function paintFrame(s: Surface, o: Spec): void {
  const { w, h, cut } = o;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (o.hole?.(x, y, w, h)) continue;
      const R = w - 1 - x, B = h - 1 - y;
      const ds: [number, number][] = [
        [y, 1], [x, 1], [R, -1], [B, -1],
        [cut[0] ? x + y - cut[0] : 1e9, 1], [cut[1] ? R + y - cut[1] : 1e9, 0], [cut[2] ? R + B - cut[2] : 1e9, -1], [cut[3] ? x + B - cut[3] : 1e9, 0],
      ];
      let d = 1e9, side = 0;
      for (const [v, sd] of ds) if (v < d) (d = v), (side = sd);
      if (d < 0) continue;
      if (d === 0) s.px(x, y, o.outline);
      else if (d <= o.rims.length) {
        const r = o.rims[d - 1];
        s.px(x, y, side > 0 ? r.light : side < 0 ? r.dark : mixRGB(r.light, r.dark, 0.5));
      } else s.px(x, y, mixRGB(o.fill[0], o.fill[1], y / Math.max(1, h - 1)), o.alpha ?? 1);
    }
  o.accent?.(s, w, h);
}

const frame = (o: Spec, slice: number): Frame => ({ url: toUrl(o.w, o.h, (s) => paintFrame(s, o)), slice, w: o.w, h: o.h });


/** Gold L-brackets in the four corners of a w x h picture (arm length L), outlined dark. */
function brackets(s: Surface, w: number, h: number, L: number): void {
  const gold = (x: number, y: number, light: boolean) => s.px(x, y, light ? 0xfff2b0 : 0xffc93a);
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) {
    // dark outline first, then the 2 px gold arms over it
    for (let i = 0; i <= L + 1; i++)
      for (let t = 0; t <= 3; t++) {
        s.px(cx + i * sx, cy + t * sy, 0x1a1006);
        s.px(cx + t * sx, cy + i * sy, 0x1a1006);
      }
    for (let i = 1; i <= L; i++)
      for (let t = 1; t <= 2; t++) {
        gold(cx + i * sx, cy + t * sy, t === 1);
        gold(cx + t * sx, cy + i * sy, t === 1);
      }
  }
}

/**
 * A move's button, 42 x 42: corners cut off, a dark navy line, a three-step polished steel rim (lit top / left), a
 * dark line inside it round the 32 x 32 icon. gold: the rim turns gold round the top-left and bottom-right
 * corners (short gold pieces at the other two) - a skill; plain steel - the basic attack.
 */
function squareFrame(gold: boolean, S = 48): string {
  const cut = 6;
  const STEEL = [{ light: 0xf6f9fe, dark: 0x9aa6c0 }, { light: 0xc8d2e4, dark: 0x6a7690 }, { light: 0x8a96b0, dark: 0x3e4862 }];
  const GOLDS = [{ light: 0xfffbe0, dark: 0xf0b848 }, { light: 0xffd860, dark: 0xc0841e }, { light: 0xb07a20, dark: 0x6a4210 }];
  return toUrl(S, S, (s) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const R = S - 1 - x, B = S - 1 - y;
        const ds: [number, number][] = [[y, 1], [x, 1], [R, -1], [B, -1], [x + y - cut, 1], [R + y - cut, 0], [R + B - cut, -1], [x + B - cut, 0]];
        let d = 1e9, side = 0;
        for (const [v, sd] of ds) if (v < d) (d = v), (side = sd);
        if (d < 0) continue;
        if (d === 0 || d === 4) {
          s.px(x, y, 0x0c1430);
          continue;
        }
        if (d > 4) {
          s.px(x, y, mixRGB(0x1a2442, 0x0a0f20, y / S));
          continue;
        }
        // which corner zone it's in: gold there on a skill's frame
        const zone = gold;
        const r = (zone ? GOLDS : STEEL)[d - 1];
        s.px(x, y, side > 0 ? r.light : side < 0 ? r.dark : mixRGB(r.light, r.dark, 0.5));
      }
  });
}

/** A pointy-topped hexagon badge 15 x 17 (the cost on a move): outlined, a lit rim, a fill shading downwards. */
function hexBadge(fill: [RGB, RGB], rim: [RGB, RGB], line: RGB): string {
  const W = 15, H = 17;
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const dx = Math.abs(x + 0.5 - W / 2), dy = Math.abs(y + 0.5 - H / 2);
    return dx <= W / 2 && dy <= H / 2 - dx * 0.55;
  };
  const edge = (x: number, y: number) => !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
  return toUrl(W, H, (s) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!inside(x, y)) continue;
        if (edge(x, y)) s.px(x, y, line);
        else if ([[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => edge(x + a, y + b))) s.px(x, y, y < H / 2 ? rim[0] : rim[1]);
        else s.px(x, y, mixRGB(fill[0], fill[1], y / H));
      }
  });
}


export function buildKit(): Record<string, Frame> {
  const EDGE: Rim = { light: 0x8fb4e8, dark: 0x26324c };
  return {
    // the chosen move: four gold corner brackets (the middle left empty)
    select: { url: toUrl(52, 52, (s) => brackets(s, 52, 52, 9)), slice: 0, w: 52, h: 52 },
    // the fighter's card, the result, the menu: a flat dark glass plate, one corner sliced off, a thin bright
    // edge, a cyan accent down the left and along the top-left
    panel: frame({
      w: 28, h: 28, cut: [0, 8, 0, 0], outline: 0x03050a, rims: [EDGE], fill: [0x141d33, 0x0a0f1c], alpha: 0.9,
      accent: (s, _w, h) => {
        for (let y = 2; y < h - 2; y++) s.px(1, y, 0x5ad0ff);
        for (let x = 1; x < 10; x++) (s.px(x, 1, 0x9ae6ff), s.px(x, 2, 0x3a9ad8));
      },
    }, 10),
    // the turn: a slanted dark plate with a gold edge
    badge: frame({ w: 20, h: 20, cut: [0, 6, 0, 6], outline: 0x03050a, rims: [{ light: 0xffd75a, dark: 0x6a4a14 }], fill: [0x201c2c, 0x0c0b14], alpha: 0.92 }, 7),
    // the teams' HP: parallelograms leaning apart from the VS
    barAlly: frame({
      w: 26, h: 13, cut: [6, 0, 6, 0], outline: 0x03050a,
      rims: [{ light: 0xbff0ff, dark: 0x3a8ad0 }, { light: 0x0a1424, dark: 0x0a1424 }],
      fill: [0x0a0d16, 0x0a0d16],
    }, 9),
    barFoe: frame({
      w: 26, h: 13, cut: [0, 6, 0, 6], outline: 0x03050a,
      rims: [{ light: 0xffc8bc, dark: 0xc03a46 }, { light: 0x240a10, dark: 0x240a10 }],
      fill: [0x0a0d16, 0x0a0d16],
    }, 9),
    // small buttons, the HP bar's frame, number plates: flat, a thin edge
    btn: frame({ w: 14, h: 14, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0x7a90b8, dark: 0x2a3450 }], fill: [0x18223a, 0x0c1220], alpha: 0.92 }, 5),
    btnOn: frame({ w: 14, h: 14, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0xffe27a, dark: 0x8a5a18 }], fill: [0x3a2a10, 0x1c1408], alpha: 0.95 }, 5),
    hp: frame({ w: 10, h: 9, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0x4a5a7a, dark: 0x1e2638 }], fill: [0x080b12, 0x080b12] }, 3),
    plate: frame({ w: 8, h: 8, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0x34446a, dark: 0x1a2236 }], fill: [0x0e1424, 0x0a0e1a], alpha: 0.9 }, 3),
    // the moves: round - a thin steel ring for the basic attack, a gold ring with four gems for a skill
    basic: { url: squareFrame(false), slice: 0, w: 48, h: 48 },
    skill: { url: squareFrame(true), slice: 0, w: 48, h: 48 },
    // a dock tile: flat dark glass, a thin bright edge, a corner nicked off
    tile: frame({ w: 10, h: 10, cut: [2, 0, 2, 0], outline: 0x03050a, rims: [{ light: 0x6a84b4, dark: 0x26324c }], fill: [0x162038, 0x0a0f1c], alpha: 0.92 }, 4),
    // the cost badges: blue (energy it takes), green (energy it gives), grey (waiting / not enough)
    hexBlue: { url: hexBadge([0x5ab4ff, 0x1a4aa8], [0xc8ecff, 0x3a7ad0], 0x081430), slice: 0, w: 15, h: 17 },
    hexGreen: { url: hexBadge([0x6ae88a, 0x1a7a46], [0xd0ffd0, 0x2aa858], 0x061a10), slice: 0, w: 15, h: 17 },
    hexGrey: { url: hexBadge([0x7a8498, 0x343a4c], [0xc0c8d8, 0x5a6478], 0x0a0e18), slice: 0, w: 15, h: 17 },
    // the turn order: flat squares edged in the team's colour, the next one gold
    chipAlly: frame({ w: 28, h: 28, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0x7ad4ff, dark: 0x2a6aa8 }, { light: 0x0e1830, dark: 0x0e1830 }], fill: [0x24406a, 0x0e1830] }, 0),
    chipFoe: frame({ w: 28, h: 28, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0xff9a8a, dark: 0xa82a3a }, { light: 0x200a10, dark: 0x200a10 }], fill: [0x5a2430, 0x1c0a10] }, 0),
    chipAssist: frame({ w: 28, h: 28, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0xc8a8ff, dark: 0x6a3ac0 }, { light: 0x180c30, dark: 0x180c30 }], fill: [0x3a2a6a, 0x120a26] }, 0),
    chipNext: frame({ w: 34, h: 34, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0xfff2b0, dark: 0xc08a2a }, { light: 0x2a1a08, dark: 0x2a1a08 }], fill: [0x3e3258, 0x141026] }, 0),
    // the hover cards (a fighter's info, a move's description): dark glass edged in the team's colour, corners cut
    tipAlly: frame({ w: 12, h: 12, cut: [2, 2, 2, 2], outline: 0x03050a, rims: [{ light: 0x7ad4ff, dark: 0x2a6aa8 }, { light: 0x0a1426, dark: 0x0a1426 }], fill: [0x111a2e, 0x080c18], alpha: 0.95 }, 4),
    tipFoe: frame({ w: 12, h: 12, cut: [2, 2, 2, 2], outline: 0x03050a, rims: [{ light: 0xff9a8a, dark: 0xa82a3a }, { light: 0x1c0a10, dark: 0x1c0a10 }], fill: [0x1c1018, 0x0c070c], alpha: 0.95 }, 4),
    tipSkill: frame({ w: 12, h: 12, cut: [2, 2, 2, 2], outline: 0x03050a, rims: [{ light: 0xffe27a, dark: 0x8a5a18 }, { light: 0x1a1408, dark: 0x1a1408 }], fill: [0x161a2a, 0x0a0c16], alpha: 0.95 }, 4),
    // the fighter's picture window
    window: frame({ w: 48, h: 48, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [EDGE, { light: 0x0a1020, dark: 0x0a1020 }], fill: [0x2a4a7a, 0x0c1426] }, 0),
    windowAssist: frame({ w: 48, h: 48, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0xc8a8ff, dark: 0x6a3ac0 }, { light: 0x140a28, dark: 0x140a28 }], fill: [0x3a2a6a, 0x120a26] }, 0),
    windowFoe: frame({ w: 48, h: 48, cut: [1, 1, 1, 1], outline: 0x03050a, rims: [{ light: 0xff9a8a, dark: 0x6a2030 }, { light: 0x1a0608, dark: 0x1a0608 }], fill: [0x5a2430, 0x1a080c] }, 0),
  };
}

/** A swallowtail ribbon in a colour (9-sliced, ends 6 px). */
const ribbons = new Map<string, Frame>();
export function ribbon(hex: string): Frame {
  let f = ribbons.get(hex);
  if (f) return f;
  const c = parseInt(hex.replace('#', ''), 16);
  f = frame({
    w: 16, h: 9, cut: [0, 0, 0, 0], outline: 0x04060c,
    rims: [{ light: mixRGB(c, 0xffffff, 0.45), dark: mixRGB(c, 0x000000, 0.45) }],
    fill: [mixRGB(c, 0xffffff, 0.1), mixRGB(c, 0x000000, 0.25)],
    // a V cut into each end
    hole: (x, y, w, h) => Math.abs(y - (h - 1) / 2) < 3 - Math.min(x, w - 1 - x) && Math.min(x, w - 1 - x) < 3,
  }, 6);
  ribbons.set(hex, f);
  return f;
}

/**
 * The glow behind a move's icon, S x S in pixels (the inside of the move's frame): rings of the element's colour from bright in the middle to deep
 * at the edges, dithered between them (pixel art, not a smooth gradient). Cached per colour.
 */
const glows = new Map<string, string>();
export function glowUrl(hex: string, S = 38): string {
  const key = `${hex}/${S}`;
  let url = glows.get(key);
  if (url) return url;
  const c = parseInt(hex.replace('#', ''), 16);
  const tones = [mixRGB(c, 0xffffff, 0.55), mixRGB(c, 0xffffff, 0.15), c, mixRGB(c, 0x1a0a30, 0.45), mixRGB(c, 0x0a0618, 0.75)];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  url = toUrl(S, S, (s) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const d = Math.min(1, Math.hypot(x + 0.5 - S / 2, (y + 0.5 - S * 0.44) * 1.05) / (S * 0.62)) * (tones.length - 1);
        const i = Math.floor(d), f = d - i;
        const step = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < f ? 1 : 0;
        s.px(x, y, tones[Math.min(tones.length - 1, i + step)]);
      }
  });
  glows.set(key, url);
  return url;
}

/** An icon as a picture (outlined). */
export function iconUrl(icon: Icon): { url: string; w: number; h: number } {
  const w = icon.rows[0].length + 2, h = icon.rows.length + 2;
  return { url: toUrl(w, h, (s) => paintIcon(s, 1, 1, icon)), w, h };
}

/**
 * A hero's picture window, 48 x 48, in its rarity's theme (the owner's: Rare blue, Epic violet, Legend gold, Mythic
 * crimson-violet-black): a metal rim in the theme (lit top / left), a gem on each corner (and a crest on top for
 * Legend and Mythic), and inside a dithered glow of the theme's colours - light rays for Legend, dark flames
 * licking up for Mythic, sparkles for all. The hero stands over the inside.
 */
const RARITY_THEME: Record<string, { rim: [RGB, RGB]; glow: RGB[]; gem: RGB; spark: RGB }> = {
  rare: { rim: [0xe8f6ff, 0x3a6aa8], glow: [0xd8f4ff, 0x7ac8ff, 0x3a8ae0, 0x1a4a9a, 0x0a1c44], gem: 0x6ad8ff, spark: 0xffffff },
  epic: { rim: [0xf4e0ff, 0x6a2ab0], glow: [0xf4dcff, 0xc88aff, 0x8a3ae0, 0x4a1a9a, 0x1a0a3a], gem: 0xd8a0ff, spark: 0xfff0ff },
  legend: { rim: [0xfff4b0, 0xa8701a], glow: [0xfffbe0, 0xffe27a, 0xf0a830, 0xa8641a, 0x3a2208], gem: 0xfff0a0, spark: 0xffffff },
  mythic: { rim: [0xff9ab8, 0x5a0828], glow: [0xff8aa8, 0xe0306a, 0x9a1a6a, 0x3a0a3a, 0x0a0208], gem: 0xff5a8a, spark: 0xffd0e0 },
};
const windows = new Map<string, string>();
export function rarityWindow(rarity: string): string {
  let url = windows.get(rarity);
  if (url) return url;
  const th = RARITY_THEME[rarity] ?? RARITY_THEME.rare;
  const S = 48, BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const tone = (d: number, x: number, y: number) => {
    const f = Math.max(0, Math.min(1, d)) * (th.glow.length - 1), i = Math.floor(f);
    return th.glow[Math.min(th.glow.length - 1, i + ((BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < f - i ? 1 : 0))];
  };
  url = toUrl(S, S, (s) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const e = Math.min(x, y, S - 1 - x, S - 1 - y);
        if (e === 0) {
          s.px(x, y, 0x03050a);
          continue;
        }
        if (e <= 2) {
          const lit = x + y < S - 1;
          s.px(x, y, e === 1 ? (lit ? th.rim[0] : th.rim[1]) : mixRGB(th.rim[0], th.rim[1], lit ? 0.35 : 0.75));
          continue;
        }
        if (e === 3) {
          s.px(x, y, 0x05070d);
          continue;
        }
        // inside: the glow, brightest a little above the middle
        let d = Math.hypot(x + 0.5 - S / 2, (y + 0.5 - S * 0.4) * 1.1) / (S * 0.62);
        if (rarity === 'legend') {
          // rays turning out of the middle
          const a = Math.atan2(y - S * 0.4, x - S / 2);
          if (Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16) % 2 === 0) d -= 0.16;
        }
        if (rarity === 'mythic') {
          // dark flames licking up from the bottom
          const lick = Math.sin(x * 0.7) * 3 + Math.sin(x * 1.9 + 1) * 2;
          if (y > S - 14 + lick) d += 0.25;
        }
        s.px(x, y, tone(d, x, y));
      }
    // sparkles
    const twinkle = (x: number, y: number, r: number) => {
      s.px(x, y, th.spark);
      for (let i = 1; i <= r; i++) {
        s.px(x + i, y, th.spark, 1 - i / (r + 1));
        s.px(x - i, y, th.spark, 1 - i / (r + 1));
        s.px(x, y + i, th.spark, 1 - i / (r + 1));
        s.px(x, y - i, th.spark, 1 - i / (r + 1));
      }
    };
    twinkle(9, 10, 2);
    twinkle(38, 14, 1);
    twinkle(36, 34, 2);
    twinkle(11, 36, 1);
    s.px(22, 7, th.spark);
    s.px(30, 40, th.spark);
    // a gem on each corner
    const gem = (cx: number, cy: number, r: number) => {
      for (let y = -r - 1; y <= r + 1; y++)
        for (let x = -r - 1; x <= r + 1; x++) {
          const m = Math.abs(x) + Math.abs(y);
          if (m === r + 1) s.px(cx + x, cy + y, 0x05070d);
          else if (m <= r) s.px(cx + x, cy + y, m === 0 || (y < 0 && m < r) ? mixRGB(th.gem, 0xffffff, 0.55) : y > 0 ? mixRGB(th.gem, 0x000000, 0.3) : th.gem);
        }
    };
    gem(2, 2, 2);
    gem(S - 3, 2, 2);
    gem(2, S - 3, 2);
    gem(S - 3, S - 3, 2);
    if (rarity === 'legend' || rarity === 'mythic') gem(S / 2, 1, 3);
  });
  windows.set(rarity, url);
  return url;
}

/** A five-point pixel star (lit or not), 15 x 15. */
export function starUrl(on: boolean): string {
  return toUrl(15, 15, (s) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 3.1 : 7.2;
      pts.push([7.5 + Math.cos(a) * r, 7.9 + Math.sin(a) * r]);
    }
    const inside = (x: number, y: number) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const ramp = on ? [0xfffbe0, 0xffe27a, 0xffc93a, 0xe08a1a] : [0x5a6478, 0x46506a, 0x343c52, 0x262c3e];
    for (let y = 0; y < 15; y++)
      for (let x = 0; x < 15; x++) {
        if (inside(x + 0.5, y + 0.5)) s.px(x, y, ramp[Math.min(3, Math.floor((y / 14) * 4))]);
        else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + 0.5 + dx, y + 0.5 + dy))) s.px(x, y, on ? 0x3a1a04 : 0x0a0e18);
      }
    if (on) (s.px(6, 5, 0xffffff), s.px(7, 4, 0xffffff));
  });
}

/** Put the kit on an element as CSS variables: --k-<name> (its picture) for border-image. */
export function installKit(root: HTMLElement): void {
  for (const [name, f] of Object.entries(buildKit())) root.style.setProperty(`--k-${name}`, `url(${f.url})`);
}
