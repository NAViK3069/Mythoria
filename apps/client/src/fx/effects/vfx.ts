import { mixRGB, type RGB, type Surface } from '../surface';
import type { Pop } from './battlePops';

// Skill effects, ported from the owner's ProjectZ (src/arena/vfx.js) onto our own engine (fx/surface.ts): crisp pixel
// shapes in a few colours - white-hot first, then the colour - with soft light added over them (Surface light),
// moving every frame and fading smoothly at the end. One Pop per effect, on a BattleLayer.
//
// The kinds (new Vfx(kind, x, y, o)):
//   ring    - a shockwave: going out thick and white, thinning, a glow round it. o: { r, pal, dur, w, sq }
//   star    - a four-point star flaring and shrinking, a glow round it. o: { r, pal, dur }
//   spikes  - a burst of sharp shards out from the middle (an impact, a crack). o: { r, n, pal, dur, a, spread }
//   lines   - speed lines bursting out from a point, more the way it faces. o: { r, dir (1 / -1 / 0), pal, n }
//   aura    - power flaring up off a body, tongues of light. (x, y): the feet. o: { r (wide), h (tall), pal }
//   dust    - a wave of dust rolling out along the ground both ways. o: { r (how far), pal }
//   roar    - waves going out from a point, fat ahead, thin behind (a taunt, a shout). o: { r, dir, pal, n }
//   slash   - a crescent cut: a white leading edge, the colour behind it, sweeping round then thinning away.
//             o: { r, a (its middle), sweep, dir (1 / -1), w, pal, dur, tilt (squash, 0..1) }
//   glitter - (glitter(): a scatter of little stars over a while round a point.)
//
// pal: a name from PAL (light to dark).

export const PAL = {
  fire: [0xffffff, 0xfff3c4, 0xffd25a, 0xff9a3a, 0xe8542c, 0xa8241c, 0x5a0e10],
  holy: [0xffffff, 0xfff6d0, 0xffe08a, 0xffc23a, 0xd88a1a, 0x8a5410, 0x3a2208],
  void: [0xffffff, 0xffd8ff, 0xe08aff, 0xb04aff, 0x7a1ad8, 0x3a0a6a, 0x16042a],
  volt: [0xffffff, 0xd8fbff, 0x8ff0ff, 0x3ac8ff, 0x1a7ae8, 0x0a3a8a, 0x041a40],
  blood: [0xffffff, 0xffd0d8, 0xff6a7a, 0xe8243a, 0xa0101e, 0x4a0610, 0x200206],
  mint: [0xffffff, 0xd8ffef, 0x7affd0, 0x2ae0a0, 0x109a6a, 0x064a34, 0x02200e],
  violet: [0xffffff, 0xefe0ff, 0xd0a8ff, 0xa06aff, 0x6a3ad8, 0x2e1a6a, 0x120a2e],
  ice: [0xffffff, 0xe0f4ff, 0xa8dcff, 0x5aa8ff, 0x2a62d8, 0x14307a, 0x081438],
  steel: [0xffffff, 0xeef4ff, 0xc4ccd8, 0x8a94a4, 0x5a6474, 0x363c48, 0x181c24],
  smoke: [0xd8d4cc, 0xa8a49c, 0x7e7a74, 0x5c5954, 0x43403d, 0x2e2c2a, 0x1a1918],
  night: [0xffd8e0, 0xff4060, 0xc8143c, 0x8a0a34, 0x4a0628, 0x220414, 0x0c0208],
  leaf: [0xffffff, 0xeaffc8, 0xb4f07a, 0x6ad04a, 0x3a9a3a, 0x1f6030, 0x0c2a14],
  spirit: [0xffffff, 0xd8fff8, 0x8ff0e8, 0x3ad0d8, 0x1a8aa8, 0x0a4a6a, 0x041a2a],
} as const;
export type PalName = keyof typeof PAL;

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const ease = (k: number) => 1 - Math.pow(1 - clamp(k), 3);
export const hash = (a: number, b: number, c = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
/** A pixel's own random number (whole numbers in). */
export const ph = (x: number, y: number, s: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s * 1000) | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** Is this pixel kept at strength k (0..1)? An ordered dither - a fade in pixels, never a faint smear. */
export const keep = (x: number, y: number, k: number) => k >= 1 || (k > 0 && k > BAYER[((y & 3) << 2) | (x & 3)]);

/** Soft light round (x, y): the palette's colour i, strength a; sq squashes it. */
export function glow(s: Surface, x: number, y: number, r: number, pal: PalName, i: number, a: number, sq = 1): void {
  if (a <= 0.01 || r < 1) return;
  s.glow(x, y, r, PAL[pal][i], a, sq);
}
/** Soft light in a band round radius r0 (a ring's glow). */
export function glowBand(s: Surface, x: number, y: number, r0: number, w: number, c: RGB, a: number, sq = 1): void {
  if (a <= 0.01) return;
  const R = r0 + w;
  for (let yy = Math.floor(y - R * sq); yy <= Math.ceil(y + R * sq); yy++)
    for (let xx = Math.floor(x - R); xx <= Math.ceil(x + R); xx++) {
      const d = Math.hypot(xx + 0.5 - x, (yy + 0.5 - y) / sq), q = 1 - Math.abs(d - r0) / w;
      if (q > 0) s.add(xx, yy, c, a * q * q);
    }
}
/** Pixels along an ellipse arc (tilted by tilt) from a0 to a1; colour / strength per point (u 0..1 along it). */
export function pixArc(s: Surface, x: number, y: number, rx: number, ry: number, a0: number, a1: number, c: RGB, a = 1, light = 0, thick = 1): void {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * 1.2));
  let lx = NaN, ly = NaN;
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n, X = Math.round(x + Math.cos(t) * rx), Y = Math.round(y + Math.sin(t) * ry);
    if (X === lx && Y === ly) continue;
    lx = X;
    ly = Y;
    if (!keep(X, Y, a)) continue;
    s.px(X, Y, c);
    if (light) s.add(X, Y, c, light);
    // thicker: the pixel inside it too (and above it, on a flat ring)
    for (let j = 1; j < thick; j++) {
      s.px(Math.round(x + Math.cos(t) * (rx - j)), Math.round(y + Math.sin(t) * (ry - j * (ry / Math.max(rx, 1)))), c);
      s.px(X, Y - j, c);
    }
  }
}

interface Opts {
  r?: number;
  pal?: PalName;
  dur?: number;
  delay?: number;
  w?: number;
  sq?: number;
  n?: number;
  a?: number;
  spread?: number;
  dir?: number;
  h?: number;
  sweep?: number;
  tilt?: number;
  vy?: number;
  /** A drop shadow under it (a slash): this colour, a pixel down and to the side. */
  shadow?: number;
}
type Kind = 'ring' | 'star' | 'spikes' | 'lines' | 'aura' | 'dust' | 'roar' | 'slash';
const DUR: Record<Kind, number> = { ring: 0.45, star: 0.35, spikes: 0.45, lines: 0.5, aura: 0.7, dust: 1.0, roar: 0.7, slash: 0.32 };

/** One effect running on a layer. speed: how much faster than real time it plays (a quicker battle). */
export class Vfx implements Pop {
  private t: number;
  private readonly dur: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly kind: Kind, private x: number, private y: number, private readonly o: Opts = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    this.dur = o.dur ?? DUR[kind];
  }
  get done(): boolean {
    return this.t >= this.dur;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (this.t > 0 && this.o.vy) this.y += this.o.vy * dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const k = clamp(this.t / this.dur);
    DRAW[this.kind](s, this.x, this.y, this.o, k, this.t, this.seed);
  }
}

/** A scatter of little stars round (x, y) over dur (each its own, rising a little). */
export function glitter(layer: { add(p: Pop): unknown }, x: number, y: number, o: { r?: number; n?: number; pal?: PalName; dur?: number; size?: number; sq?: number; life?: number; rise?: number } = {}, speed = 1): void {
  const n = o.n ?? 8, r = o.r ?? 20, seed = Math.random() * 100;
  for (let i = 0; i < n; i++) {
    const a = hash(i, seed) * Math.PI * 2, d = r * Math.sqrt(hash(i, seed, 1));
    layer.add(new Vfx('star', x + Math.cos(a) * d, y + Math.sin(a) * d * (o.sq ?? 1), {
      pal: o.pal, r: (o.size ?? 4) * (0.5 + hash(i, seed, 2)), dur: (o.life ?? 0.35) * (0.7 + 0.6 * hash(i, seed, 3)),
      delay: (o.dur ?? 0.4) * hash(i, seed, 4), vy: o.rise ?? -12,
    }, speed));
  }
}

type Draw = (s: Surface, x: number, y: number, o: Opts, k: number, t: number, seed: number) => void;

// ---------- ring ----------
const drawRing: Draw = (s, x, y, o, k) => {
  const R = o.r ?? 20, pal = o.pal ?? 'volt', P = PAL[pal], sq = o.sq ?? 1;
  const r = R * (0.12 + 0.88 * ease(k)), th = Math.max(1, (o.w ?? R * 0.2) * Math.pow(1 - k, 1.4));
  glowBand(s, x, y, r - th / 2, Math.max(3, th * 2.2), P[2], 0.75 * Math.pow(1 - k, 1.5), sq);
  const A = Math.pow(1 - k, 0.75);
  const ex = Math.ceil(r + th), ey = Math.ceil((r + th) * sq), out2 = (r + 0.5) ** 2, in2 = Math.max(0, r - th) ** 2;
  for (let yy = -ey; yy <= ey; yy++) {
    const Y = Math.round(y) + yy, py = yy / sq;
    for (let xx = -ex; xx <= ex; xx++) {
      const d2 = xx * xx + py * py;
      if (d2 > out2 || d2 < in2) continue;
      const X = Math.round(x) + xx;
      if (!keep(X, Y, A)) continue;
      const depth = (r - Math.sqrt(d2)) / th;
      const idx = k < 0.1 ? 0 : depth < 0.35 ? Math.round(k * 2) : 1 + Math.round(depth * 1.5 + k * 2.5);
      s.px(X, Y, P[clamp(idx, 0, P.length - 2)]);
    }
  }
};

// ---------- star ----------
const drawStar: Draw = (s, x0, y0, o, k) => {
  const P = PAL[o.pal ?? 'volt'], x = Math.round(x0), y = Math.round(y0), R = o.r ?? 6;
  const f = Math.sin(Math.PI * clamp(k)), L = Math.round(R * f), d = Math.round(R * 0.45 * f * (1 - k));
  s.glow(x + 0.5, y + 0.5, R * 1.6, P[2], 0.55 * f);
  if (L < 1) {
    s.px(x, y, P[2]);
    return;
  }
  for (let i = -L; i <= L; i++) {
    const q = Math.abs(i) / L, c = q < 0.35 ? P[0] : q < 0.7 ? P[1] : P[3];
    s.px(x + i, y, c);
    s.px(x, y + i, c);
  }
  for (let i = 1; i <= d; i++) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) s.px(x + sx * i, y + sy * i, P[2]);
  if (L > 3) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s.px(x + i, y + j, P[0]);
  if (L > 6 && k < 0.5) {
    for (let i = -2; i <= 2; i++) s.px(x + i, y, P[1]), s.px(x, y + i, P[1]);
    s.px(x, y, P[0]);
  }
};

// ---------- spikes ----------
const drawSpikes: Draw = (s, x, y, o, k, _t, seed) => {
  const P = PAL[o.pal ?? 'ice'], n = o.n ?? 8, R = o.r ?? 16, spread = o.spread ?? Math.PI * 2, a0 = (o.a ?? 0) - spread / 2;
  const out = ease(k / 0.3), fade = clamp((k - 0.35) / 0.65);
  glow(s, x, y, R * 0.9, o.pal ?? 'ice', 2, 0.5 * (1 - k));
  for (let i = 0; i < n; i++) {
    const a = a0 + (spread * (i + hash(i, seed) * 0.6)) / n, L = R * (0.55 + 0.45 * hash(i, seed, 1)) * out, base = Math.max(1, Math.round((2 + hash(i, seed, 2) * 2) * (1 - fade)));
    const ux = Math.cos(a), uy = Math.sin(a);
    for (let st = R * 0.15 * out; st < L; st++) {
      const q = st / L, half = Math.round(base * (1 - q));
      for (let j = -half; j <= half; j++) {
        const X = Math.round(x + ux * st - uy * j), Y = Math.round(y + uy * st + ux * j);
        if (!keep(X, Y, 1 - fade)) continue;
        s.px(X, Y, Math.abs(j) === half && half > 0 ? P[4] : q > 0.75 ? P[0] : j < 0 ? P[1] : P[2]);
      }
    }
  }
};

// ---------- lines ----------
const drawLines: Draw = (s, x, y, o, k, _t, seed) => {
  const P = PAL[o.pal ?? 'holy'], R = o.r ?? 30, n = o.n ?? 24, dir = o.dir ?? 0;
  for (let i = 0; i < n; i++) {
    const h = hash(i, seed), a = dir ? (dir > 0 ? 0 : Math.PI) + (h - 0.5) * Math.PI * (hash(i, seed, 5) < 0.75 ? 1.1 : 2) : h * Math.PI * 2;
    const fw = dir ? Math.max(0, Math.cos(a) * dir) : 1, delay = hash(i, seed, 1) * 0.25, q = (k - delay) / (1 - delay);
    if (q <= 0 || q >= 1) continue;
    const r0 = 6 + R * ease(q) * (0.5 + 0.5 * fw), L = (6 + 16 * fw) * (1 - q * 0.6), ux = Math.cos(a), uy = Math.sin(a) * 0.85;
    const A = Math.pow(1 - q, 0.8);
    for (let j = 0; j < L; j++) {
      const X = Math.round(x + ux * (r0 - j)), Y = Math.round(y + uy * (r0 - j));
      if (!keep(X, Y, A)) continue;
      s.px(X, Y, j < 2 ? P[0] : j < L * 0.4 ? P[1] : j < L * 0.75 ? P[2] : P[3]);
    }
  }
};

// ---------- aura ----------
const drawAura: Draw = (s, x, y, o, k, t, seed) => {
  const P = PAL[o.pal ?? 'holy'], w = o.r ?? 12, H = (o.h ?? 40) * Math.sin(Math.PI * Math.min(1, k * 1.4));
  if (H < 1) return;
  glow(s, x, y - H * 0.4, w + H * 0.5, o.pal ?? 'holy', 2, 0.7 * (1 - k));
  const A = Math.min(1, (1 - k) * 1.6), tick = Math.floor(t * 24), ry = w * 0.32;
  // rooted round an oval on the ground (seen from above, as the field is): the far half first, then the near half
  // in front of it - not along a flat line
  for (const near of [false, true])
    for (let xx = -w; xx <= w; xx++) {
      const u = xx / w, edge = Math.abs(u), foot = y + (near ? 1 : -1) * ry * Math.sqrt(Math.max(0, 1 - u * u));
      const tall = H * (near ? 0.85 : 1) * (0.55 + 0.45 * edge * 0.6 + 0.4 * (1 - edge * edge)) * (0.55 + 0.45 * hash(xx, tick + (near ? 7 : 0), seed)) + Math.sin(xx * 0.9 + t * 18 + (near ? 2 : 0)) * 3;
      for (let yy = 0; yy < tall; yy++) {
        const q = yy / Math.max(1, tall), inner = 1 - edge;
        if (q > 0.6 && hash(xx, yy + tick, seed + (near ? 3 : 0)) < (q - 0.6) * 1.4) continue;
        const X = Math.round(x + xx), Y = Math.round(foot - yy);
        if (!keep(X, Y, A * (1 - q * 0.5) * (near ? 1 : 0.8))) continue;
        const idx = q > 0.85 ? 4 : q > 0.6 ? 3 : inner > 0.6 && q < 0.4 ? (near ? 0 : 1) : inner > 0.3 ? 1 : 2;
        s.px(X, Y, P[idx]);
      }
    }
};

// ---------- dust ----------
const drawDust: Draw = (s, x, y, o, k, _t, seed) => {
  const P = PAL[o.pal ?? 'smoke'], R = o.r ?? 30;
  // rolling out round an oval on the ground (the far ones first): not along a flat line
  const puffs: { a: number; i: number; side: number }[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) puffs.push({ a: (side < 0 ? Math.PI : 0) + (hash(i, seed, side + 5) - 0.5) * 2.2, i, side });
  puffs.sort((p1, p2) => Math.sin(p1.a) - Math.sin(p2.a));
  for (const { a, i, side } of puffs) {
    const lag = i / 7, q = Math.max(0, ease(k * 1.25 - lag * 0.35));
    if (q <= 0) continue;
    const d = 4 + (R - 4) * q * (0.55 + 0.45 * hash(i, seed, side)), r = (2 + 3 * q) * (0.7 + 0.5 * hash(i, seed, 3));
    const bx = Math.cos(a) * d, by = Math.sin(a) * d * 0.32 - r * 0.7 - q * 4 * hash(i, seed, 4);
    const A = 0.85 * Math.pow(1 - k, 0.9) * (1 - lag * 0.4);
    for (let yy = Math.floor(by - r); yy <= Math.ceil(by + r); yy++) for (let xx = Math.floor(bx - r); xx <= Math.ceil(bx + r); xx++) {
      const d = Math.hypot(xx - bx, (yy - by) * 1.3) / r;
      if (d > 1) continue;
      const X = Math.round(x) + xx, Y = Math.round(y) + yy;
      if (!keep(X, Y, A * (1 - d * d))) continue;
      const lit = -(xx - bx) * 0.2 - (yy - by) * 0.6;
      s.px(X, Y, P[clamp(Math.round(1.5 - (lit / r) * 2 + d * 1.5), 0, 4)]);
    }
  }
};

// ---------- roar ----------
const drawRoar: Draw = (s, x, y, o, k) => {
  const P = PAL[o.pal ?? 'fire'], R = o.r ?? 40, n = o.n ?? 4, dir = o.dir ?? 1, x0 = Math.round(x), y0 = Math.round(y);
  glow(s, x0 + dir * 8, y0, R * 0.6, o.pal ?? 'fire', 2, 0.45 * Math.pow(1 - k, 2));
  for (let w = 0; w < n; w++) {
    const q = (k - w * 0.11) / (1 - (n - 1) * 0.11);
    if (q <= 0 || q >= 1) continue;
    const r = 6 + (R - 6) * ease(q), fade = Math.pow(1 - q, 1.2), th = Math.max(1, Math.round((4 - w) * (1 - q) + 1));
    glowBand(s, x0, y0, r, Math.max(3, th * 2.5), P[2], 0.3 * fade, 0.85);
    const steps = Math.ceil(r * 3.4);
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI + (i / steps) * Math.PI * 2, fw = Math.cos(a) * dir;
      if (fw < -0.3 && (i + w) % 3) continue;
      const tt = fw > 0.2 ? th : 1, c = fw > 0.75 ? P[q < 0.4 ? 0 : 1] : fw > 0.2 ? P[2] : P[3];
      for (let j = 0; j < tt; j++) {
        const X = Math.round(x0 + Math.cos(a) * (r - j)), Y = Math.round(y0 + Math.sin(a) * (r - j) * 0.85);
        if (keep(X, Y, fade)) s.px(X, Y, c);
      }
    }
  }
};

// ---------- slash ----------
const drawSlash: Draw = (s, x, y, o, k) => {
  const R = o.r ?? 16, pal = o.pal ?? 'steel', P = PAL[pal], dir = o.dir ?? 1, sweep = o.sweep ?? 2.2, w = o.w ?? R * 0.4, tilt = o.tilt ?? 1;
  const head = ease(k / 0.35), tail = clamp((k - 0.2) / 0.8) ** 1.3;
  if (head <= tail) return;
  const a0 = (o.a ?? 0) - (dir * sweep) / 2, mid = a0 + (dir * sweep * (head + tail)) / 2;
  glow(s, x + Math.cos(mid) * R * 0.75, y + Math.sin(mid) * R * 0.75 * tilt, R * 0.9, pal, 2, 0.45 * (1 - k));
  const A = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
  const ex = Math.ceil(R + 2), out2 = (R + 1) ** 2, in2 = Math.max(0, R - w - 1) ** 2;
  // (the drop shadow first, a pixel down and out, then the slash over it)
  for (const shade of o.shadow !== undefined ? [true, false] : [false])
    for (let yy = -ex; yy <= ex; yy++)
      for (let xx = -ex; xx <= ex; xx++) {
        const gy = yy / tilt, d2 = xx * xx + gy * gy;
        if (d2 > out2 || d2 < in2) continue;
        const d = Math.sqrt(d2);
        let rel = (Math.atan2(gy, xx) - a0) * dir;
        rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const sv = rel / sweep;
        if (sv > 1 || sv < tail || sv > head) continue;
        const span = (sv - tail) / (head - tail), thick = w * Math.sin(Math.PI * clamp(span)) ** 0.8 * (1 - tail * 0.6);
        const depth = (R - d) / Math.max(1, thick);
        if (depth < 0 || depth > 1) continue;
        const X = Math.round(x) + xx + (shade ? dir : 0), Y = Math.round(y) + yy + (shade ? 1 : 0);
        if (!keep(X, Y, A)) continue;
        if (shade) {
          s.px(X, Y, o.shadow!, 0.85);
          continue;
        }
        const idx = depth < 0.45 ? 0 : depth < 0.68 ? 1 : depth < 0.86 ? 2 : 3;
        s.px(X, Y, P[clamp(idx + Math.round(k * 2.2), 0, P.length - 2)]);
      }
};

const DRAW: Record<Kind, Draw> = { ring: drawRing, star: drawStar, spikes: drawSpikes, lines: drawLines, aura: drawAura, dust: drawDust, roar: drawRoar, slash: drawSlash };

/** A colour a little toward white (k 0..1). */
export const lift = (c: RGB, k: number) => mixRGB(c, 0xffffff, k);
