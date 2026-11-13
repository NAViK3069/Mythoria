import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL } from './vfx';

// Astraea's sakura and stars, in our own pixels on fx/surface.ts: petals tumbling (each one turning over as it falls),
// a blossom of light bursting open where her blade lands, a gale of petals sweeping the field, the night sky's stars
// joining into a sakura constellation, and the thousand frozen cuts of her ultimate that hang in the air until she
// sheathes her blade - then all burst at once. Pale pink lit white, deep plum shadow, a little starlight gold.

const K = PAL.sakura; // white .. deep plum
const GOLD = 0xffe7a0;

type Pt = { x: number; y: number };

/** One petal at (x, y), turning over as it falls (`spin` 0..1 picks how it faces), strength a. */
export function petal(s: Surface, x: number, y: number, spin: number, a: number, big = false): void {
  const X = Math.round(x), Y = Math.round(y), f = Math.floor(((spin % 1) + 1) % 1 * 4);
  if (!keep(X, Y, a)) return;
  // four faces: broad side on, edge on (thin), tilted one way, the other
  const shapes: [number, number, RGB][][] = [
    [[0, 0, K[1]], [1, 0, K[2]], [0, 1, K[3]], [1, 1, K[3]]],
    [[0, 0, K[2]], [0, 1, K[3]]],
    [[0, 0, K[1]], [1, 1, K[3]], [1, 0, K[2]]],
    [[1, 0, K[1]], [0, 1, K[3]], [0, 0, K[2]]],
  ];
  for (const [dx, dy, c] of shapes[f]) s.px(X + dx, Y + dy, c);
  if (big) s.px(X - 1, Y, K[2]), s.px(X + 2, Y + 1, K[4]);
}

/** A whole blossom at (x, y): five petals round a gold heart, r 1..3. */
export function blossom(s: Surface, x: number, y: number, r: number, rot: number, a: number): void {
  for (let i = 0; i < 5; i++) {
    const ang = rot + (i * Math.PI * 2) / 5;
    for (let d = 1; d <= r + 1; d++) {
      const X = Math.round(x + Math.cos(ang) * d), Y = Math.round(y + Math.sin(ang) * d);
      if (keep(X, Y, a)) s.px(X, Y, d <= r * 0.5 + 0.5 ? K[1] : d <= r ? K[2] : K[4]);
    }
  }
  const X = Math.round(x), Y = Math.round(y);
  if (keep(X, Y, a)) s.px(X, Y, GOLD);
}

/**
 * A burst of petals from (x, y): flung out (`dir` favoured, `spread` wide), then caught by the air - drifting down and
 * sideways on the wind, turning over, fading. n petals over `dur`.
 */
export class SakuraPetals implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { n?: number; dur?: number; delay?: number; v?: number; dir?: number; spread?: number; wind?: number; blossoms?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 1.2;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const n = this.o.n ?? 18, v = this.o.v ?? 40, wind = this.o.wind ?? 10;
    for (let i = 0; i < n; i++) {
      const life = this.D * (0.6 + 0.4 * hash(i, this.seed)), t = Math.min(this.t, life), q = t / life;
      if (this.t > life) continue;
      const a = (this.o.dir ?? -Math.PI / 2) + (hash(i, this.seed, 1) - 0.5) * (this.o.spread ?? Math.PI * 2), sp = v * (0.4 + 0.8 * hash(i, this.seed, 2));
      // flung out, slowed by the air (1 - e^-4t), then drifting down on the wind and swaying
      const fling = (1 - Math.exp(-4 * t)) / 4;
      const x = this.x + Math.cos(a) * sp * fling + wind * t + Math.sin(t * 5 + i) * 3, y = this.y + Math.sin(a) * sp * fling + 14 * t * t;
      const k = 1 - clamp((q - 0.65) / 0.35);
      if (i < (this.o.blossoms ?? 2)) blossom(s, x, y, 1.6, t * 3 + i, k);
      else petal(s, x, y, t * (2 + hash(i, this.seed, 3) * 3) + i * 0.3, k, i % 4 === 0);
    }
  }
}

/**
 * A blossom of light bursting open where her blade lands (x, y): a white flash, five great petals of light opening
 * out and fading, a ring, a cross-glint of starlight, petals flung everywhere. r its size.
 */
export class SakuraBloom implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  private readonly petals: SakuraPetals;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; dur?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    const r = o.r ?? 14;
    this.petals = new SakuraPetals(x, y, { n: Math.round(r * 1.6), v: r * 4, dur: 1.2, wind: 8, blossoms: 3 });
  }
  private get D(): number {
    return this.o.dur ?? 0.7;
  }
  get done(): boolean {
    return this.t >= Math.max(this.D, 1.2);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (this.t >= 0) this.petals.update(dt * this.speed);
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const q = clamp(this.t / this.D), r = this.o.r ?? 14, x = this.x, y = this.y;
    if (q < 1) {
      if (q < 0.25) s.glow(x, y, r * 2.2, K[2], 0.8 * (1 - q / 0.25)), s.glow(x, y, r * 0.8, 0xffffff, 0.85 * (1 - q / 0.25));
      // the five petals of light, opening out (each a teardrop pointing outward), turning a little
      const R = r * (0.3 + 0.9 * ease(q)), rot = this.seed + q * 0.6, A = 1 - q * q;
      for (let i = 0; i < 5; i++) {
        const ang = rot + (i * Math.PI * 2) / 5;
        for (let d = 0; d < R; d += 0.5) {
          const f = d / R, hw = R * 0.42 * Math.sin(Math.PI * Math.min(1, f * 1.15)) * (f > 0.9 ? 0.5 : 1);
          for (let w = -hw; w <= hw; w += 0.6) {
            const X = Math.round(x + Math.cos(ang) * d - Math.sin(ang) * w), Y = Math.round(y + (Math.sin(ang) * d + Math.cos(ang) * w) * 0.85);
            const e = Math.abs(w) / Math.max(0.5, hw);
            if (keep(X, Y, A * (e > 0.8 ? 1 : 0.55))) s.px(X, Y, e > 0.8 ? (q < 0.4 ? 0xffffff : K[3]) : f < 0.35 ? K[1] : K[2]);
          }
        }
      }
      // a cross-glint of starlight
      const gl = r * 1.8 * (1 - ease(q));
      for (let d = -gl; d <= gl; d++) {
        const k2 = 1 - Math.abs(d) / (gl + 1);
        if (keep(Math.round(x + d), Math.round(y), k2)) s.px(Math.round(x + d), Math.round(y), 0xffffff);
        if (keep(Math.round(x), Math.round(y + d * 0.7), k2)) s.px(Math.round(x), Math.round(y + d * 0.7), GOLD);
      }
      // a ring
      for (let i = 0; i < 44; i++) {
        const a = (i / 44) * Math.PI * 2, X = Math.round(x + Math.cos(a) * R * 1.3), Y = Math.round(y + Math.sin(a) * R * 1.1);
        if (keep(X, Y, (1 - q) * 0.7)) s.px(X, Y, K[2]);
      }
    }
    this.petals.draw(s);
  }
}

/**
 * A gale of petals sweeping from x0 to x1 over a field (yTop..yBot) in `dur`: a front of wind streaks and a thick
 * swirl of petals and blossoms; `hits` are called as the front passes their x; the petals settle behind it.
 */
export class PetalGale implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  private readonly fired: boolean[] = [];
  constructor(private readonly x0: number, private readonly x1: number, private readonly yTop: number, private readonly yBot: number, private readonly o: { dur?: number; delay?: number; n?: number; hits?: { x: number; cb: () => void }[] } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.8;
  }
  get done(): boolean {
    return this.t >= this.D + 0.9;
  }
  private front(t: number): number {
    return this.x0 + (this.x1 - this.x0) * ease(clamp(t / this.D));
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    const d = this.x1 >= this.x0 ? 1 : -1, X = this.front(this.t);
    (this.o.hits ?? []).forEach((h, i) => {
      if (!this.fired[i] && this.t >= 0 && d * (X - h.x) >= 0) {
        this.fired[i] = true;
        h.cb();
      }
    });
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, d = this.x1 >= this.x0 ? 1 : -1, X = this.front(t), span = this.yBot - this.yTop, n = this.o.n ?? 90;
    const out = clamp((t - this.D) / 0.9);
    // the wind front: long bright streaks racing ahead
    if (out < 0.3) {
      for (let i = 0; i < 16; i++) {
        const y = this.yTop + span * hash(i, this.seed), len = 14 + 20 * hash(i, this.seed, 1), x = X - d * (hash(i, this.seed, 2) * 18);
        for (let k = 0; k < len; k++) {
          const px = Math.round(x - d * k), py = Math.round(y + Math.sin((px + t * 60) * 0.12) * 2);
          if (keep(px, py, (1 - k / len) * (1 - out / 0.3) * 0.8)) s.px(px, py, k < 3 ? 0xffffff : K[2]);
        }
      }
    }
    // the petals: a swirling band behind the front, thinning out and settling as it passes
    for (let i = 0; i < n; i++) {
      const lag = hash(i, this.seed, 3) * 60, y0 = this.yTop + span * hash(i, this.seed, 4);
      const px = X - d * lag + Math.sin(t * 7 + i) * 5, py = y0 - 8 + Math.cos(t * 5 + i * 1.3) * 7 + lag * 0.15;
      if (d * (px - this.x0) < 0) continue;
      const k = (1 - lag / 70) * (1 - out);
      if (i % 9 === 0) blossom(s, px, py, 1.4, t * 4 + i, k);
      else petal(s, px, py, t * 3 + i * 0.37, k, i % 5 === 0);
    }
    s.glow(X, (this.yTop + this.yBot) / 2, 34, K[3], 0.25 * (1 - out));
  }
}

/**
 * The stars coming out over the field (view: the camera's world rect) and joining into a sakura constellation over
 * `c` (R wide): stars twinkling all across the sky, then the constellation's own stars blaze up one after another and
 * lines of light draw between them - a five-petalled blossom of stars; it glows until `dur`.
 */
export class SakuraConstellation implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  private readonly pts: Pt[] = [];
  private readonly links: [number, number][] = [];
  constructor(private readonly view: { x: number; y: number; w: number; h: number }, c: Pt, R: number, private readonly o: { dur?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    // the blossom: a centre, five petal tips, and the ten points either side of each petal's waist
    this.pts.push({ ...c });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5, b1 = a - 0.42, b2 = a + 0.42;
      const tip = this.pts.push({ x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R * 0.7 }) - 1;
      const w1 = this.pts.push({ x: c.x + Math.cos(b1) * R * 0.58, y: c.y + Math.sin(b1) * R * 0.58 * 0.7 }) - 1;
      const w2 = this.pts.push({ x: c.x + Math.cos(b2) * R * 0.58, y: c.y + Math.sin(b2) * R * 0.58 * 0.7 }) - 1;
      this.links.push([0, w1], [w1, tip], [tip, w2], [w2, 0]);
    }
  }
  private get D(): number {
    return this.o.dur ?? 2.4;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  private star(s: Surface, x: number, y: number, r: number, k: number, c: RGB = 0xffffff): void {
    const X = Math.round(x), Y = Math.round(y);
    if (!keep(X, Y, k)) return;
    s.px(X, Y, c);
    for (let d = 1; d <= r; d++) {
      const f = 1 - d / (r + 1);
      for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (keep(X + dx, Y + dy, k * f)) s.px(X + dx, Y + dy, d === 1 ? K[1] : K[2]);
    }
    s.add(X, Y, K[2], 0.5 * k);
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, A = Math.min(1, t / 0.4) * (1 - clamp((t - (this.D - 0.4)) / 0.4)), v = this.view;
    // the sky's stars
    for (let i = 0; i < 70; i++) {
      const x = v.x + hash(i, this.seed) * v.w, y = v.y + hash(i, this.seed, 1) * v.h * 0.75, tw = 0.5 + 0.5 * Math.sin(t * (2 + hash(i, this.seed, 2) * 4) + i);
      const k = A * tw * clamp((t - hash(i, this.seed, 3) * 0.5) / 0.3);
      if (k > 0.05) this.star(s, x, y, i % 9 === 0 ? 1 : 0, k, i % 7 === 0 ? GOLD : 0xffffff);
    }
    // the constellation: its stars blaze up one after another, the lines draw between them
    const order = this.pts.map((_, i) => i);
    order.forEach((i, n) => {
      const k = A * clamp((t - 0.35 - n * 0.05) / 0.15), p = this.pts[i];
      if (k > 0) {
        this.star(s, p.x, p.y, i === 0 ? 3 : i % 3 === 1 ? 2 : 1, k);
        s.glow(p.x, p.y, i === 0 ? 10 : 6, K[2], 0.35 * k);
      }
    });
    this.links.forEach(([a, b], n) => {
      const q = clamp((t - 0.6 - n * 0.03) / 0.2);
      if (q <= 0) return;
      const pa = this.pts[a], pb = this.pts[b], ex = pa.x + (pb.x - pa.x) * q, ey = pa.y + (pb.y - pa.y) * q;
      s.line(pa.x, pa.y, ex, ey, (u) => (u > 0.9 ? 0xffffff : K[2]), A * 0.85);
    });
  }
}

/**
 * The thousand cuts frozen in the air: lines of her blade's path appear over the foes one after another (`every` s
 * apart), thin and white, and hang there - until `releaseAt`, when every one flares thick and pink and breaks into
 * petals (onRelease).
 */
export class FrozenCuts implements Pop {
  private t: number;
  private released = false;
  private readonly cuts: { a: Pt; b: Pt; at: number }[] = [];
  private readonly seed = Math.random() * 100;
  constructor(centres: Pt[], private readonly o: { n?: number; every?: number; reach?: number; releaseAt?: number; delay?: number; onRelease?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    const n = o.n ?? 18, reach = o.reach ?? 30;
    for (let i = 0; i < n; i++) {
      const c = centres[i % centres.length], ang = hash(i, this.seed) * Math.PI, len = reach * (0.7 + 0.6 * hash(i, this.seed, 1));
      const ox = (hash(i, this.seed, 2) - 0.5) * 12, oy = (hash(i, this.seed, 3) - 0.5) * 10;
      this.cuts.push({ a: { x: c.x + ox - Math.cos(ang) * len, y: c.y + oy - Math.sin(ang) * len * 0.75 }, b: { x: c.x + ox + Math.cos(ang) * len, y: c.y + oy + Math.sin(ang) * len * 0.75 }, at: i * (o.every ?? 0.045) });
    }
  }
  private get R(): number {
    return this.o.releaseAt ?? 1.2;
  }
  get done(): boolean {
    return this.t >= this.R + 0.5;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (!this.released && this.t >= this.R) {
      this.released = true;
      this.o.onRelease?.();
    }
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, R = this.R;
    for (const c of this.cuts) {
      const q = clamp((t - c.at) / 0.06);
      if (q <= 0) continue;
      const ex = c.a.x + (c.b.x - c.a.x) * q, ey = c.a.y + (c.b.y - c.a.y) * q;
      if (t < R) {
        // frozen: a thin white line, a faint pink light beside it, shimmering
        const sh = 0.75 + 0.25 * Math.sin(t * 30 + c.at * 50);
        s.line(c.a.x, c.a.y + 1, ex, ey + 1, K[3], 0.5 * sh);
        s.line(c.a.x, c.a.y, ex, ey, 0xffffff, sh);
      } else {
        // released: flaring thick and pink, then thinning away
        const r = (t - R) / 0.5, w = Math.round(3 * (1 - r));
        const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        for (let k = -w; k <= w; k++) s.line(c.a.x + nx * k, c.a.y + ny * k, c.b.x + nx * k, c.b.y + ny * k, k === 0 ? 0xffffff : Math.abs(k) === 1 ? K[2] : K[4], (1 - r) * (k === 0 ? 1 : 0.8));
      }
    }
  }
}
