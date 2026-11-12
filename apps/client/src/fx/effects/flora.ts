import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL } from './vfx';

// The forest guardian's effects (Sylva first), in our own pixels on fx/surface.ts: horns of wood bursting up out of the
// ground one after another, a thorny vine that grows up, winds back and lashes, a flower that sprouts, buds and blooms in
// a burst of light with healing motes rising, a whirl of wind full of green and autumn leaves, a drop of dew-light
// floating to a friend, ribbons of leaves streaming out, dark wisps drawn out of a body and breaking into light, petals
// raining down. Crisp pixels in palettes, soft light added over them; on the ground, things lie on its oval.

const L = PAL.leaf; // white .. deep forest green
/** Leaves of every season (a whirl of them is green and autumn both). */
const SEASON: RGB[][] = [
  [L[2], L[3], L[4]],
  [0xb4f07a, 0x6ad04a, 0x2e8a34],
  [0xffc070, 0xf08a3a, 0xb0501c],
  [0xff9a7a, 0xd0402a, 0x8a2414],
  [0xfff2a0, 0xf0c850, 0xb08a24],
];
const PETAL: RGB[] = [0xffe4ee, 0xffb4d0, 0xf07aa8, 0xb8406e];
const WOOD: RGB[] = [0xf0dcae, 0xd2aa70, 0xa87844, 0x74482a, 0x4a2c18];
const INK: RGB = 0x160c06;
const VINE: RGB[] = [0x9ae67a, 0x4fb04e, 0x2e7a3c, 0x174a24];
const VINE_INK: RGB = 0x0a2010;
const THORN: RGB = 0xb0582a;
const DUST: RGB[] = [0xd8ccb8, 0xa89a86, 0x7a6e5e];

/** A leaf at (x, y): a little oval of three shades turning as it flutters (phase), its outline - p is its colours. */
function leaf(s: Surface, x: number, y: number, phase: number, p: RGB[], a = 1, big = false): void {
  const X = Math.round(x), Y = Math.round(y);
  if (!keep(X, Y, a)) return;
  const turn = Math.floor(((((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)));
  const flat = turn === 1 || turn === 3; // seen edge on: thinner
  s.px(X, Y, p[1]);
  if (flat) {
    s.px(X + 1, Y - 1, p[0]);
    s.px(X - 1, Y + 1, p[2]);
  } else {
    s.px(X + 1, Y, p[0]);
    s.px(X - 1, Y, p[2]);
    s.px(X, Y - 1, p[0]);
    if (big) s.px(X, Y + 1, p[2]), s.px(X + 1, Y - 1, p[1]);
  }
}

/** A healing mote: a little diamond of light (r 1 or 2) at (x, y). */
function diamond(s: Surface, x: number, y: number, r: number, a = 1): void {
  const X = Math.round(x), Y = Math.round(y);
  if (!keep(X, Y, a)) return;
  s.px(X, Y, L[0]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) s.px(X + dx, Y + dy, r > 1 ? L[1] : L[2]);
  if (r > 1) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]]) s.px(X + dx, Y + dy, L[3]);
  s.add(X, Y, L[2], 0.4 * a);
}

/** A puff of dust (r across) at (x, y), A how solid. */
function puff(s: Surface, x: number, y: number, r: number, A: number): void {
  for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++)
    for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
      const d = Math.hypot(xx - x, yy - y) / r;
      if (d > 1 || !keep(xx, yy, A * (1 - d * d * 0.5))) continue;
      s.px(xx, yy, DUST[clamp(Math.round(d * 1.6 + ((yy - y) / r) * 0.6), 0, 2)]);
    }
}

/**
 * Horns of wood bursting up out of the ground one after another along the line from (x0, y0) to (x1, y1) - small at the
 * start, the last the tallest: a crack racing ahead along the ground, a green flash as each breaks out, leaves at their
 * feet, dust and stones thrown up; they stand a moment, then sink back into the ground, first ones first.
 */
export class ThornRow implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x0: number, private readonly y0: number, private readonly x1: number, private readonly y1: number, private readonly o: { n?: number; gap?: number; hold?: number; delay?: number; size?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get n(): number {
    return this.o.n ?? 6;
  }
  private get gap(): number {
    return this.o.gap ?? 0.06;
  }
  /** When the last (tallest) one breaks out (s). */
  get last(): number {
    return (this.n - 1) * this.gap + 0.08;
  }
  get done(): boolean {
    return this.t >= this.last + (this.o.hold ?? 0.55) + 0.6;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const n = this.n, gap = this.gap, hold = this.o.hold ?? 0.55, size = this.o.size ?? 1, d = this.x1 >= this.x0 ? 1 : -1;
    // the crack racing ahead along the ground
    const ahead = clamp(this.t / (this.last + 0.04)), fadeC = 1 - clamp((this.t - this.last - hold) / 0.4);
    for (let u = 0; u <= ahead; u += 0.01) {
      const X = Math.round(this.x0 + (this.x1 - this.x0) * u), Y = Math.round(this.y0 + (this.y1 - this.y0) * u + Math.sin(u * 30) * 0.5);
      if (!keep(X, Y, fadeC)) continue;
      s.px(X, Y, INK);
      if (u > ahead - 0.08) s.px(X, Y - 1, L[1]), s.add(X, Y, L[2], 0.6);
    }
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 1, bx = this.x0 + (this.x1 - this.x0) * u, by = this.y0 + (this.y1 - this.y0) * u;
      const te = i * gap, tt = this.t - te;
      if (tt < 0) continue;
      const H = (8 + 16 * u) * size, W = (3 + 3.5 * u) * size;
      const sinkAt = this.last + hold - (n - 1 - i) * 0.03 + i * 0.04, sink = clamp((this.t - sinkAt) / 0.28);
      const up = ease(tt / 0.08) * (1 - ease(sink));
      // the flash as it breaks out, dust and stones
      if (tt < 0.18) {
        s.glow(bx, by - H * 0.3, W * 2.2 + 4, L[2], 0.7 * (1 - tt / 0.18));
        s.glow(bx, by - 1, W + 2, L[0], 0.5 * (1 - tt / 0.18));
      }
      for (let j = 0; j < 4; j++) {
        const q = clamp(tt / 0.6), a = hash(i * 7 + j, this.seed) * Math.PI - Math.PI, v = 18 + 18 * hash(i * 7 + j, this.seed, 1);
        const sx = bx + Math.cos(a) * v * Math.min(tt, 0.35), sy = by - Math.max(0, 40 * tt - 140 * tt * tt) * (0.6 + hash(j, i, 2));
        if (keep(Math.round(sx), Math.round(sy), 1 - q)) s.px(Math.round(sx), Math.round(sy), j % 2 ? WOOD[3] : DUST[2]);
      }
      const pq = clamp(tt / 0.9);
      if (pq < 1) for (let j = 0; j < 2; j++) puff(s, bx + (j ? 1 : -1) * (W * 0.6 + pq * 7), by - 1 - pq * 4, 1.5 + pq * 3, 0.8 * (1 - pq));
      if (up <= 0) continue;
      // the horn: pushed up out of the ground (drawn whole, slid down, cut at the ground), curving toward the foe
      const vis = H * up, top = by - vis;
      for (let r = 0; r <= H; r += 0.5) {
        const Y = Math.round(top + r);
        if (Y > by) break;
        const f = 1 - r / H; // 1 at the tip .. 0 at its foot
        const half = (W / 2) * Math.pow(1 - f, 0.75) + 0.3, cx = bx + d * f * f * W * 0.7;
        for (let xx = Math.floor(cx - half - 1); xx <= Math.ceil(cx + half + 1); xx++) {
          const dx = xx - cx;
          if (Math.abs(dx) > half + 0.9) continue;
          if (Math.abs(dx) > half) {
            s.px(xx, Y, INK);
            continue;
          }
          const lit = (dx / Math.max(0.5, half)) * -d; // the side facing back is lit
          const idx = f > 0.85 ? 0 : clamp(Math.round(2 - lit * 1.6 + (1 - f) * 0.4), 1, 4);
          s.px(xx, Y, WOOD[idx]);
        }
      }
      // leaves at its foot
      if (up > 0.5) {
        leaf(s, bx - W * 0.7, by - 1, 0, SEASON[1], 1, true);
        leaf(s, bx + W * 0.7, by, 2, SEASON[0], 1, true);
      }
    }
  }
}

/**
 * A thorny vine bursting up out of the ground at (x, y) - it grows up, winds back, and lashes down onto (tx, ty) with a
 * flash of green light (onHit), holds a moment, and draws back down into the ground. Thorns and little leaves along it.
 */
export class VineLash implements Pop {
  private t: number;
  private hit = false;
  /** When it strikes (of its time). */
  static readonly LASH = 0.46;
  constructor(private readonly x: number, private readonly y: number, private readonly tx: number, private readonly ty: number, private readonly o: { dur?: number; delay?: number; onHit?: () => void; w?: number } = {}, private readonly speed = 1) {
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
    if (!this.hit && this.t >= VineLash.LASH * this.D) {
      this.hit = true;
      this.o.onHit?.();
    }
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const k = this.t / this.D, d = this.tx >= this.x ? 1 : -1;
    const dist = Math.hypot(this.tx - this.x, this.ty - this.y);
    const aim = Math.atan2(d * (this.tx - this.x), -(this.ty - this.y)); // from straight up, toward the foe
    const H = Math.max(dist * 1.05, 20);
    // its length and its lean (0 straight up, + toward the foe), through the phases
    let len: number, lean: number;
    if (k < 0.18) (len = H * 0.75 * ease(k / 0.18)), (lean = -0.1);
    else if (k < 0.36) (len = H * 0.75), (lean = -0.1 - 0.8 * ease((k - 0.18) / 0.18));
    else if (k < VineLash.LASH) {
      const q = (k - 0.36) / (VineLash.LASH - 0.36);
      len = H * (0.75 + 0.25 * q);
      lean = -0.9 + (aim + 0.9) * q * q;
    } else if (k < 0.7) (len = H), (lean = aim + Math.sin((k - VineLash.LASH) * 40) * 0.06 * (1 - (k - VineLash.LASH) / 0.24));
    else (len = H * (1 - ease((k - 0.7) / 0.3))), (lean = aim * (1 - (k - 0.7) / 0.3));
    if (len < 1) return;
    // a curve: from its foot, bending more toward its tip
    const at = (u: number) => {
      const a = lean * u * 1.3, r = len * u;
      // (integrated roughly: each bit leaning a little more)
      return { x: this.x + d * Math.sin(a * 0.75) * r, y: this.y - Math.cos(a * 0.75) * r };
    };
    const W = this.o.w ?? 2.2, steps = Math.ceil(len * 1.5);
    let prev = at(0);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, p = at(u), tl = Math.hypot(p.x - prev.x, p.y - prev.y) || 1, nx = -(p.y - prev.y) / tl, ny = (p.x - prev.x) / tl;
      const half = W * (1 - u * 0.65);
      for (let j = -Math.ceil(half) - 1; j <= Math.ceil(half) + 1; j++) {
        const X = Math.round(p.x + nx * j), Y = Math.round(p.y + ny * j);
        if (Math.abs(j) > half + 0.6) {
          s.px(X, Y, VINE_INK);
          continue;
        }
        const lit = (j / Math.max(0.5, half) + 1) / 2;
        s.px(X, Y, VINE[clamp(Math.round(lit * 2.6), 0, 3)]);
      }
      // thorns and leaves along it
      if (i % 6 === 3) {
        const side = (i / 6) % 2 < 1 ? 1 : -1;
        s.px(Math.round(p.x + nx * side * (half + 1.6)), Math.round(p.y + ny * side * (half + 1.6)), THORN);
      }
      if (i % 11 === 7) leaf(s, p.x - nx * (half + 2.5), p.y - ny * (half + 2.5), i, SEASON[1], 1, true);
      prev = p;
    }
    // where it strikes: a flash of green, splinters of light
    const hq = (k - VineLash.LASH) / 0.2;
    if (hq >= 0 && hq < 1) {
      s.glow(this.tx, this.ty, 18, L[2], 0.8 * (1 - hq));
      s.glow(this.tx, this.ty, 6, L[0], 0.8 * (1 - hq));
      for (let i = 0; i < 10; i++) {
        const a = hash(i, 3) * Math.PI * 2, r0 = 3 + 14 * ease(hq), r1 = r0 + 5 * (1 - hq);
        for (let r = r0; r <= r1; r += 0.7) s.px(Math.round(this.tx + Math.cos(a) * r), Math.round(this.ty + Math.sin(a) * r), i % 2 ? L[1] : L[0]);
      }
    }
    // its foot: a scatter of earth where it broke out
    if (k < 0.3) puff(s, this.x, this.y - 1, 2 + k * 10, 0.8 * (1 - k / 0.3));
  }
}

/**
 * A flower growing at (x, y): a sprout that climbs into a stem, two leaves unfurling, a pink bud swelling - it opens in a
 * burst of light, healing motes (little diamonds of green light) rising round it; then its petals drift off and it
 * withers back into the ground. `scale` sizes it.
 */
export class Bloom implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  /** When it opens (of its time). */
  static readonly OPEN = 0.46;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { scale?: number; dur?: number; delay?: number; motes?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.9);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1.9, k = this.t / D, S = this.o.scale ?? 1, O = Bloom.OPEN;
    const wither = clamp((k - 0.78) / 0.22);
    const H = 14 * S * ease(k / 0.24) * (1 - wither * 0.9), sway = Math.sin(this.t * 3) * 0.8 * S;
    const stemAt = (u: number) => ({ x: this.x + sway * u * u, y: this.y - H * u });
    // the stem
    for (let u = 0; u <= 1; u += 0.5 / Math.max(1, H)) {
      const p = stemAt(u), X = Math.round(p.x), Y = Math.round(p.y);
      s.px(X, Y, wither > 0.4 ? VINE[3] : VINE[1]);
      s.px(X + 1, Y, VINE[2]);
    }
    // two leaves unfurling off it
    for (const [hu, side, t0] of [[0.38, -1, 0.12], [0.62, 1, 0.18]] as const) {
      const g = clamp((k - t0) / 0.14) * (1 - wither);
      if (g <= 0) continue;
      const p = stemAt(hu), len = 4 * S * g;
      for (let i = 1; i <= len; i++) {
        const X = Math.round(p.x + side * i), Y = Math.round(p.y - i * 0.5), w = Math.sin((i / (len + 1)) * Math.PI) * 1.4 * S;
        for (let j = 0; j <= w; j++) s.px(X, Y - j, j === 0 ? VINE[2] : VINE[0]);
        s.px(X, Y + 1, VINE_INK);
      }
    }
    // the bud, then the flower
    const top = stemAt(1);
    const bud = clamp((k - 0.24) / 0.16), open = clamp((k - O + 0.06) / 0.08);
    if (bud > 0 && open < 1 && wither < 0.5) {
      const bh = (2 + 2 * bud) * S;
      for (let i = 0; i <= bh; i++) {
        const w = Math.sin(((i + 0.5) / (bh + 1)) * Math.PI) * 1.4 * S;
        for (let j = -Math.round(w); j <= Math.round(w); j++) s.px(Math.round(top.x + j), Math.round(top.y - i), j < 0 ? PETAL[1] : PETAL[2]);
      }
    }
    if (open > 0) {
      const R = 3.6 * S * ease(open), drop = clamp((k - 0.74) / 0.2);
      for (let p = 0; p < 5; p++) {
        const a = -Math.PI / 2 + (p / 5) * Math.PI * 2 + this.seed;
        // each petal drifts off and falls once it's over
        const fx = drop * (6 + 6 * hash(p, this.seed)) * (hash(p, this.seed, 1) - 0.5) * 2, fy = drop * drop * 18;
        const px0 = top.x + Math.cos(a) * R * 0.8 + fx, py0 = top.y - 1 + Math.sin(a) * R * 0.6 + fy;
        if (!keep(Math.round(px0), Math.round(py0), 1 - drop)) continue;
        for (let r = 0; r <= 1.4 * S; r += 0.7) {
          s.px(Math.round(px0 + Math.cos(a) * r), Math.round(py0 + Math.sin(a) * r * 0.7), r < 0.7 ? PETAL[0] : PETAL[1]);
          s.px(Math.round(px0 + Math.cos(a) * r) + 1, Math.round(py0 + Math.sin(a) * r * 0.7), PETAL[2]);
        }
      }
      if (drop < 0.5) s.px(Math.round(top.x), Math.round(top.y - 1), 0xfff2a8), s.px(Math.round(top.x) + 1, Math.round(top.y - 1), 0xf0c850);
    }
    // the burst of light as it opens
    const fq = (k - O) / 0.16;
    if (fq >= 0 && fq < 1) {
      s.glow(top.x, top.y, 18 * S, 0xf8ffc0, 0.8 * (1 - fq));
      s.glow(top.x, top.y, 6 * S, 0xffffff, 0.8 * (1 - fq));
      const R = 4 + 16 * S * ease(fq);
      for (let a = 0; a < Math.PI * 2; a += 0.6 / R) {
        const X = Math.round(top.x + Math.cos(a) * R), Y = Math.round(this.y + Math.sin(a) * R * 0.34);
        if (keep(X, Y, 1 - fq)) s.px(X, Y, L[1]);
      }
    }
    // healing motes rising round it
    const n = this.o.motes ?? 10;
    for (let i = 0; i < n; i++) {
      const q = clamp((k - O - hash(i, this.seed, 2) * 0.25) / 0.45);
      if (q <= 0 || q >= 1) continue;
      const a = hash(i, this.seed, 3) * Math.PI * 2, r = (6 + 8 * hash(i, this.seed, 4)) * S;
      diamond(s, top.x + Math.cos(a) * r + Math.sin(q * 6 + i) * 1.5, this.y - 4 + Math.sin(a) * r * 0.34 - q * 26 * S, hash(i, this.seed, 5) > 0.6 ? 2 : 1, 1 - q * q);
    }
  }
}

/**
 * A whirl of wind at (x, y) - its foot - w across at the top, h tall: pale streaks of wind spiralling round in rings that
 * widen as they rise (the far side fainter), and leaves of every season - green, gold, orange, red - swept round and up in
 * it. Gathers, spins, thins away.
 */
export class LeafTornado implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly w: number, private readonly h: number, private readonly o: { dur?: number; delay?: number; n?: number; spin?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.4);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  private radius(hf: number): number {
    return this.w * (0.3 + 0.3 * hf);
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1.4, k = this.t / D, spin = this.o.spin ?? 7;
    const A = clamp(k / 0.15) * (1 - clamp((k - 0.78) / 0.22)), grow = ease(k / 0.25);
    const H = this.h * (0.4 + 0.6 * grow);
    // a breath of green light through it
    s.glow(this.x, this.y - H * 0.5, this.w * 0.7, L[3], 0.3 * A, 1.4);
    // the streaks of wind: rings that widen as they rise, two sweeping arcs on each, thick and bright at their heads
    const rings = 8;
    for (let j = 0; j < rings; j++) {
      const hf = (j + 0.5) / rings, R = this.radius(hf) * grow, cy = this.y - H * hf;
      for (const off of [0, Math.PI]) {
        const a0 = this.t * spin * (1.4 - hf * 0.5) + j * 1.7 + off, span = Math.PI * 1.1;
        for (let a = 0; a < span; a += 0.45 / Math.max(3, R)) {
          const ang = a0 + a, front = Math.sin(ang) > 0, head = a / span;
          const X = Math.round(this.x + Math.cos(ang) * R), Y = Math.round(cy + Math.sin(ang) * R * 0.32);
          const fade = A * Math.sqrt(head) * (front ? 1 : 0.55);
          if (!keep(X, Y, fade)) continue;
          s.px(X, Y, front ? (head > 0.75 ? 0xffffff : 0xe4fae8) : 0xa8c8b4);
          if (head > 0.45) s.px(X, Y - 1, front ? 0xf0fff2 : 0xc0dccb);
          if (front && head > 0.7) s.add(X, Y, L[2], 0.35 * A);
        }
      }
    }
    // dust at its foot
    for (let i = 0; i < 5; i++) {
      const ang = this.t * spin * 1.4 + i * 1.3, R = this.radius(0) * 1.3;
      puff(s, this.x + Math.cos(ang) * R, this.y - 1 + Math.sin(ang) * R * 0.32, 2.5, 0.55 * A);
    }
    // the leaves swept round and up - the near ones over it all
    const n = this.o.n ?? 26, list: { X: number; Y: number; i: number; ang: number; hf: number }[] = [];
    for (let i = 0; i < n; i++) {
      const hf = (hash(i, this.seed) + this.t * (0.35 + 0.3 * hash(i, this.seed, 1))) % 1;
      const ang = hash(i, this.seed, 2) * Math.PI * 2 + this.t * spin * (1.5 - hf * 0.5);
      const R = this.radius(hf) * grow * (0.85 + 0.35 * hash(i, this.seed, 3));
      list.push({ X: this.x + Math.cos(ang) * R, Y: this.y - H * hf + Math.sin(ang) * R * 0.32, i, ang, hf });
    }
    list.sort((p, q) => Math.sin(p.ang) - Math.sin(q.ang));
    for (const l of list) {
      const pal = SEASON[Math.floor(hash(l.i, this.seed, 4) * SEASON.length)];
      leaf(s, l.X, l.Y, l.ang * 2 + l.i, pal, A * (Math.sin(l.ang) > 0 ? 1 : 0.7) * (1 - clamp((l.hf - 0.88) / 0.12)), true);
    }
  }
}

/**
 * A drop of dew-light floating from (x0, y0) to (x1, y1) on a soft arc: a bright drop in a green glow, a trail of
 * sparkles behind it; it splashes where it lands (a ring, droplets) and onHit.
 */
export class DewDrop implements Pop {
  private t: number;
  private hit = false;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x0: number, private readonly y0: number, private readonly x1: number, private readonly y1: number, private readonly o: { dur?: number; delay?: number; arc?: number; onHit?: () => void; big?: boolean } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.45;
  }
  get done(): boolean {
    return this.t >= this.D + 0.5;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (!this.hit && this.t >= this.D) {
      this.hit = true;
      this.o.onHit?.();
    }
  }
  private at(u: number): { x: number; y: number } {
    const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u), arc = this.o.arc ?? 20;
    return { x: this.x0 + (this.x1 - this.x0) * e, y: this.y0 + (this.y1 - this.y0) * e - arc * Math.sin(Math.PI * e) };
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const u = this.t / this.D, big = this.o.big;
    if (u < 1) {
      // the trail of sparkles
      for (let i = 1; i <= 12; i++) {
        const v = u - i * 0.03;
        if (v <= 0) break;
        const p = this.at(v), X = Math.round(p.x + (hash(i, this.seed) - 0.5) * 3), Y = Math.round(p.y + (hash(i, this.seed, 1) - 0.5) * 3 + i * 0.3);
        if (keep(X, Y, 1 - i / 12)) s.px(X, Y, i < 4 ? L[0] : i % 2 ? L[1] : L[2]);
      }
      // the drop: a tear of light pointing the way it goes
      const p = this.at(u), q = this.at(Math.min(1, u + 0.02)), a = Math.atan2(q.y - p.y, q.x - p.x);
      s.glow(p.x, p.y, big ? 12 : 8, L[3], 0.6);
      s.glow(p.x, p.y, big ? 5 : 3, 0xe8fff0, 0.7);
      const X = Math.round(p.x), Y = Math.round(p.y);
      s.px(X, Y, 0xffffff);
      s.px(X + 1, Y, 0xd8fff0);
      s.px(X, Y + 1, L[1]);
      s.px(X + 1, Y + 1, L[2]);
      s.px(Math.round(p.x - Math.cos(a) * 2), Math.round(p.y - Math.sin(a) * 2), L[2]);
      if (big) s.px(X - 1, Y, L[1]), s.px(X, Y - 1, 0xffffff);
    } else {
      // the splash
      const q = (this.t - this.D) / 0.5, R = 3 + 12 * ease(q);
      for (let a = 0; a < Math.PI * 2; a += 0.6 / R) {
        const X = Math.round(this.x1 + Math.cos(a) * R), Y = Math.round(this.y1 + Math.sin(a) * R * 0.6);
        if (keep(X, Y, 1 - q)) s.px(X, Y, q < 0.4 ? L[0] : L[2]);
      }
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (hash(i, this.seed, 2) - 0.5) * 2.4, v = 14 + 10 * hash(i, this.seed, 3), tt = this.t - this.D;
        const X = Math.round(this.x1 + Math.cos(a) * v * tt), Y = Math.round(this.y1 + Math.sin(a) * v * tt + 60 * tt * tt);
        if (keep(X, Y, 1 - q)) s.px(X, Y, i % 2 ? 0xd8fff0 : L[2]);
      }
      if (q < 0.3) s.glow(this.x1, this.y1, 12, L[2], 0.6 * (1 - q / 0.3));
    }
  }
}

/** A ribbon of leaves streaming from (x0, y0) to `to()` along a swinging arc, each a moment after the last; onHit as the first gets there. */
export class LeafStream implements Pop {
  private t: number;
  private hit = false;
  constructor(private readonly x0: number, private readonly y0: number, private readonly to: () => { x: number; y: number }, private readonly o: { n?: number; dur?: number; delay?: number; arc?: number; onHit?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.55) + 0.45;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (!this.hit && this.t >= (this.o.dur ?? 0.55)) {
      this.hit = true;
      this.o.onHit?.();
    }
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 0.55, n = this.o.n ?? 10, T = this.to(), arc = this.o.arc ?? 24;
    for (let i = 0; i < n; i++) {
      const u = clamp((this.t - i * 0.035) / D);
      if (u <= 0 || u >= 1) continue;
      const e = ease(u), wob = Math.sin(u * 9 + i) * 3;
      const x = this.x0 + (T.x - this.x0) * e + wob, y = this.y0 + (T.y - this.y0) * e - arc * Math.sin(Math.PI * e) + Math.cos(u * 7 + i) * 2;
      leaf(s, x, y, u * 14 + i, SEASON[i % SEASON.length], 1, i % 2 === 0);
      if (i % 3 === 0) s.add(Math.round(x), Math.round(y), L[2], 0.4);
    }
  }
}

/** Dark wisps (violet, or deep blue - `blue`) drawn up out of a body standing at (x, y), h tall (its ailments) - curling up, breaking into specks of light. */
export class CleanseWisps implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly h: number, private readonly o: { dur?: number; delay?: number; n?: number; blue?: boolean } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1, k = this.t / D, n = this.o.n ?? 5;
    for (let i = 0; i < n; i++) {
      const ox = (hash(i, this.seed) - 0.5) * 12, rise = ease(k) * (this.h * 0.8 + 10);
      for (let j = 0; j < 8; j++) {
        const u = j / 8, y = this.y - this.h * 0.4 - rise + u * 10, x = this.x + ox + Math.sin(u * 5 + this.t * 8 + i) * 2.5;
        const light = k > 0.5 && j < 3; // its head turning to light
        if (keep(Math.round(x), Math.round(y), (1 - u) * (1 - clamp((k - 0.7) / 0.3)))) s.px(Math.round(x), Math.round(y), light ? L[0] : j < 4 ? (this.o.blue ? 0x5a9ae8 : 0x9a5ad8) : this.o.blue ? 0x1a3a8a : 0x4a2470);
      }
      if (k > 0.55) {
        const q = (k - 0.55) / 0.45;
        for (let m = 0; m < 3; m++) {
          const a = hash(i * 3 + m, this.seed, 1) * Math.PI * 2, X = Math.round(this.x + ox + Math.cos(a) * q * 8), Y = Math.round(this.y - this.h * 0.4 - rise + Math.sin(a) * q * 6);
          if (keep(X, Y, 1 - q)) s.px(X, Y, m % 2 ? L[0] : 0xfff2a8);
        }
      }
    }
  }
}

/** Petals and motes of light drifting down over the box (x, y, w, h) - fluttering, catching the light. */
export class PetalRain implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly w: number, private readonly h: number, private readonly o: { dur?: number; delay?: number; n?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.8);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1.8, k = this.t / D, n = this.o.n ?? 40, A = clamp(k / 0.15) * (1 - clamp((k - 0.75) / 0.25));
    for (let i = 0; i < n; i++) {
      const fall = (hash(i, this.seed) + this.t * (0.35 + 0.25 * hash(i, this.seed, 1))) % 1;
      const x = this.x + hash(i, this.seed, 2) * this.w + Math.sin(this.t * 2.5 + i) * 4 + fall * 10, y = this.y + fall * this.h;
      const a = A * (1 - clamp((fall - 0.85) / 0.15));
      if (i % 3 === 0) diamond(s, x, y, 1, a);
      else {
        const X = Math.round(x), Y = Math.round(y);
        if (!keep(X, Y, a)) continue;
        const flip = Math.sin(this.t * 6 + i) > 0;
        s.px(X, Y, PETAL[1]);
        s.px(X + (flip ? 1 : 0), Y + (flip ? 0 : 1), PETAL[0]);
        s.px(X - 1, Y, PETAL[2]);
      }
    }
  }
}
