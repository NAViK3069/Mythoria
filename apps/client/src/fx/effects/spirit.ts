import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL } from './vfx';

// The spirit healer's effects (Sira first), in our own pixels on fx/surface.ts: wisps of spirit-fire that leave her
// lantern, swing out wide and home in on a mark, a ring that marks where they'll strike, a burst of spirit light with
// rings and sparks, a cool spirit flame that wraps a friend with little spirits circling it, a crystal of light trailing
// long streamers out to every friend with spirals of light running down them, a crescent moon. Cyan spirit-light with
// sky-blue in it, crisp pixels, soft light added over them; things on the ground lie on its oval.

const S = PAL.spirit; // white .. deep sea-blue
/** The sky-blue in it (the owner's choice) - its crystal, some of its wisps, rings and sparks. */
const V = PAL.ice; // white .. deep sky-blue
const GOLD: RGB[] = [0xfffbe0, 0xfff0a0, 0xf0c850, 0xc8962a, 0x8a5a14];

/** Where along a swinging path from a to b we are (u 0..1): a cubic curve bulging `bend` px to one side. */
function swing(ax: number, ay: number, bx: number, by: number, bend: number, u: number): { x: number; y: number } {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const c1x = ax + dx * 0.25 + nx * bend * 1.3, c1y = ay + dy * 0.25 + ny * bend * 1.3;
  const c2x = ax + dx * 0.7 + nx * bend * 0.6, c2y = ay + dy * 0.7 + ny * bend * 0.6;
  const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
  return { x: a * ax + b * c1x + c * c2x + d * bx, y: a * ay + b * c1y + c * c2y + d * by };
}

/**
 * A wisp of spirit-fire from (x0, y0) homing in on `to()`: it swings out wide (`bend` px to one side) and curves in, a
 * white-hot core in a cyan (or sky-blue) glow, a flickering tail of flame behind it and specks trailing off; onHit when it
 * gets there.
 */
export class SpiritWisp implements Pop {
  private t: number;
  private hit = false;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x0: number, private readonly y0: number, private readonly to: () => { x: number; y: number }, private readonly o: { bend?: number; dur?: number; delay?: number; blue?: boolean; size?: number; onHit?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.5;
  }
  get done(): boolean {
    return this.t >= this.D + 0.05;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (!this.hit && this.t >= this.D) {
      this.hit = true;
      this.o.onHit?.();
    }
  }
  draw(s: Surface): void {
    if (this.t < 0 || this.t >= this.D) return;
    const P = this.o.blue ? V : S, T = this.to(), u = this.t / this.D, e = u * u * (3 - 2 * u), z = this.o.size ?? 1;
    const at = (v: number) => swing(this.x0, this.y0, T.x, T.y, this.o.bend ?? 0, v);
    // the tail: back along the path, a tongue of flame narrowing, flickering
    for (let i = 14; i >= 1; i--) {
      const v = Math.max(0, e - i * 0.018);
      const p = at(v), f = 1 - i / 15, wob = Math.sin(this.t * 40 + i) * (1 - f);
      const X = Math.round(p.x + wob), Y = Math.round(p.y + wob * 0.6);
      if (!keep(X, Y, f * 1.2)) continue;
      s.px(X, Y, f > 0.7 ? P[1] : f > 0.4 ? P[2] : P[3]);
      if (f > 0.5 && z > 1) s.px(X, Y + 1, P[3]);
      // specks thrown off it
      if (i % 4 === 0) {
        const sx = Math.round(p.x + (hash(i, this.seed) - 0.5) * 6), sy = Math.round(p.y + (hash(i, this.seed, 1) - 0.5) * 6);
        if (keep(sx, sy, f)) s.px(sx, sy, P[1]);
      }
    }
    // the head
    const h = at(e);
    s.glow(h.x, h.y, 9 * z, P[3], 0.6);
    s.glow(h.x, h.y, 3.5 * z, 0xffffff, 0.7);
    const X = Math.round(h.x), Y = Math.round(h.y);
    s.px(X, Y, 0xffffff);
    s.px(X + 1, Y, P[0]);
    s.px(X, Y + 1, P[1]);
    s.px(X - 1, Y, P[1]);
    s.px(X, Y - 1, P[0]);
    if (z > 1) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) s.px(X + dx, Y + dy, P[2]);
  }
}

/** A ring that marks where they'll strike (x, y), r across: dashed, turning, drawing in a little - until it's gone. */
export class Reticle implements Pop {
  private t: number;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; dur?: number; delay?: number; blue?: boolean } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.8);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 0.8, k = this.t / D, P = this.o.blue ? V : S;
    const A = clamp(k / 0.15) * (1 - clamp((k - 0.8) / 0.2)), R = (this.o.r ?? 9) * (1.4 - 0.4 * ease(k / 0.4));
    for (let a = 0; a < Math.PI * 2; a += 0.5 / R) {
      const seg = Math.floor(((a + this.t * 3) / (Math.PI * 2)) * 8);
      if (seg % 2) continue;
      const X = Math.round(this.x + Math.cos(a) * R), Y = Math.round(this.y + Math.sin(a) * R);
      if (keep(X, Y, A)) s.px(X, Y, P[1]);
    }
    // four ticks pointing in
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4 - this.t * 2;
      for (let r = R + 1; r <= R + 3; r++) {
        const X = Math.round(this.x + Math.cos(a) * r), Y = Math.round(this.y + Math.sin(a) * r);
        if (keep(X, Y, A)) s.px(X, Y, P[2]);
      }
    }
    if (keep(Math.round(this.x), Math.round(this.y), A)) s.px(Math.round(this.x), Math.round(this.y), P[0]);
  }
}

/** A burst of spirit light at (x, y), r across: a white flash, rings racing out one after another, sparks flying, specks. */
export class SpiritBurst implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; dur?: number; delay?: number; blue?: boolean } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.8);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 0.8, k = this.t / D, R = this.o.r ?? 16, P = this.o.blue ? V : S, X0 = this.x, Y0 = this.y;
    s.glow(X0, Y0, R * 1.6, P[3], 0.7 * (1 - k));
    if (k < 0.3) {
      const q = 1 - k / 0.3;
      s.glow(X0, Y0, R * 0.6, 0xffffff, 0.9 * q);
      const r = R * 0.35 * q + 1;
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) s.px(Math.round(X0 + xx), Math.round(Y0 + yy), 0xffffff);
    }
    // rings, one after another
    for (let j = 0; j < 3; j++) {
      const q = clamp((k - j * 0.1) / 0.55);
      if (q <= 0 || q >= 1) continue;
      const Rr = R * (0.3 + ease(q) * (0.9 + j * 0.25));
      for (let a = 0; a < Math.PI * 2; a += 0.5 / Rr) {
        const X = Math.round(X0 + Math.cos(a) * Rr), Y = Math.round(Y0 + Math.sin(a) * Rr);
        if (keep(X, Y, 1 - q)) s.px(X, Y, j === 0 ? P[1] : j === 1 ? P[2] : V[2]);
      }
    }
    // sparks flying out
    for (let i = 0; i < 14; i++) {
      const a = hash(i, this.seed) * Math.PI * 2, r0 = R * (0.3 + 0.9 * ease(k / 0.6)) * (0.7 + 0.5 * hash(i, this.seed, 1)), len = R * 0.35 * (1 - k);
      for (let r = r0; r <= r0 + len; r += 0.7) {
        const X = Math.round(X0 + Math.cos(a) * r), Y = Math.round(Y0 + Math.sin(a) * r);
        if (keep(X, Y, 1 - k)) s.px(X, Y, i % 3 === 0 ? V[1] : P[1]);
      }
    }
  }
}

/**
 * A cool spirit flame wrapping a friend standing at (x, y), w across, h tall: tongues of white-cyan fire rising and
 * flickering round them (see-through, so they still show), little spirits - bright motes with a tail - circling it on
 * its oval; it swells, holds, and dies down.
 */
export class SoulFlame implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly w: number, private readonly h: number, private readonly o: { dur?: number; delay?: number; spirits?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.5);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1.5, k = this.t / D, A = clamp(k / 0.15) * (1 - clamp((k - 0.7) / 0.3));
    const W = this.w / 2 + 4, H = this.h * (0.6 + 0.5 * ease(k / 0.25));
    s.glow(this.x, this.y - H * 0.45, W * 2.2, S[3], 0.45 * A, 1.5);
    // the little spirits circling it - the far ones first (behind the fire)
    const n = this.o.spirits ?? 4;
    const spirit = (front: boolean) => {
      for (let i = 0; i < n; i++) {
        const ang = this.t * 3.2 + (i / n) * Math.PI * 2, fr = Math.sin(ang) > 0;
        if (fr !== front) continue;
        const R = W + 4, cy = this.y - H * (0.3 + 0.35 * ((i % 2) ? 1 : 0)) + Math.sin(this.t * 4 + i) * 2;
        for (let j = 5; j >= 0; j--) {
          const a = ang - j * 0.16, X = Math.round(this.x + Math.cos(a) * R), Y = Math.round(cy + Math.sin(a) * R * 0.32);
          if (!keep(X, Y, A * (1 - j / 6) * (fr ? 1 : 0.6))) continue;
          s.px(X, Y, j === 0 ? 0xffffff : j < 3 ? S[1] : S[3]);
          if (j === 0) s.px(X, Y - 1, S[0]), s.glow(X, Y, 4, S[2], 0.5 * A);
        }
      }
    };
    spirit(false);
    // the tongues of fire: columns rising round them, a lick of flame each, white at the heart
    for (let xx = -W; xx <= W; xx += 1) {
      const edge = 1 - Math.abs(xx) / (W + 1);
      // separate tongues of flame (each rising to a point), swaying, licking up and down
      const tongue = Math.abs(Math.sin(xx * 0.5 + this.seed + this.t * 2.5));
      const lick = H * edge ** 0.8 * (0.35 + 0.65 * tongue ** 1.5) * (0.88 + 0.12 * Math.sin(this.t * 17 + xx * 2.3));
      for (let r = 0; r < lick; r += 1) {
        const X = Math.round(this.x + xx + Math.sin(this.t * 6 + r * 0.25 + xx) * (r / H) * 3), Y = Math.round(this.y - r);
        const f = r / lick; // 0 at its foot .. 1 at its tip
        const a = A * (0.48 - f * 0.3) * (0.4 + edge * 0.6);
        if (!keep(X, Y, a)) continue;
        s.px(X, Y, f > 0.8 ? S[3] : edge > 0.6 && f < 0.5 ? S[0] : f < 0.6 ? S[1] : S[2]);
        s.add(X, Y, S[2], 0.15 * A);
      }
    }
    spirit(true);
    // sparks of spirit-fire drifting up off it
    for (let i = 0; i < 10; i++) {
      const q = (hash(i, this.seed) + this.t * 0.9) % 1, X = Math.round(this.x + (hash(i, this.seed, 1) - 0.5) * W * 2 + Math.sin(this.t * 5 + i) * 2), Y = Math.round(this.y - H * 0.5 - q * H * 0.8);
      if (keep(X, Y, A * (1 - q))) s.px(X, Y, i % 2 ? S[0] : S[2]);
    }
  }
}

/**
 * A crystal of light floating at `at()`, trailing long streamers out to each of `to` like a comet's tail - swaying, sky-blue
 * fading to cyan - with spirals of light running down them from the crystal to each friend (they get there at
 * CrystalStreamers.TRAVEL of its time); rings pulse off the crystal now and then. Comes and goes.
 */
export class CrystalStreamers implements Pop {
  private t: number;
  /** When the first spirals reach the ends of the streamers (of its time). */
  static readonly TRAVEL = 0.42;
  constructor(private readonly at: () => { x: number; y: number }, private readonly to: { x: number; y: number }[], private readonly o: { dur?: number; delay?: number; size?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 2);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 2, k = this.t / D, z = this.o.size ?? 1, C = this.at();
    const A = clamp(k / 0.12) * (1 - clamp((k - 0.82) / 0.18)), reach = ease(k / 0.25);
    // the streamers: three strands to each friend, each its own sway, sky-blue near the crystal, cyan out at the end
    this.to.forEach((T, ti) => {
      for (let st = 0; st < 3; st++) {
        const bend = (st - 1) * 10 + Math.sin(this.t * 2 + ti + st) * 5;
        for (let u = 0; u <= reach; u += 0.01) {
          const p = swing(C.x, C.y, T.x, T.y, bend, u);
          if (((u * 100) | 0) % 2 && st !== 1) continue; // the outer strands dotted
          const X = Math.round(p.x), Y = Math.round(p.y);
          if (!keep(X, Y, A * (1 - u * 0.4))) continue;
          s.px(X, Y, u < 0.3 ? V[st === 1 ? 2 : 3] : u < 0.7 ? V[2] : S[2]);
        }
      }
      // spirals of light running down the middle strand
      for (let m = 0; m < 3; m++) {
        const q = (this.t / (CrystalStreamers.TRAVEL * D) - m * 0.35) % 1.3;
        if (q < 0 || q > 1 || k < 0.08) continue;
        const p = swing(C.x, C.y, T.x, T.y, Math.sin(this.t * 2 + ti + 1) * 5, q), X = Math.round(p.x), Y = Math.round(p.y - 1);
        for (let a = 0; a < Math.PI * 2; a += 0.5) {
          const r = 1 + a / Math.PI, x2 = Math.round(X + Math.cos(a + this.t * 12) * r), y2 = Math.round(Y + Math.sin(a + this.t * 12) * r);
          if (keep(x2, y2, A)) s.px(x2, y2, a < 2 ? 0xffffff : S[1]);
        }
        s.glow(X, Y, 5, S[2], 0.5 * A);
      }
    });
    // rings pulsing off the crystal
    for (let j = 0; j < 3; j++) {
      const q = ((this.t * 1.4 + j / 3) % 1);
      const R = (4 + 14 * q) * z;
      for (let a = 0; a < Math.PI * 2; a += 0.5 / R) {
        const X = Math.round(C.x + Math.cos(a) * R), Y = Math.round(C.y + Math.sin(a) * R);
        if (keep(X, Y, A * (1 - q) * 0.8)) s.px(X, Y, q < 0.3 ? V[1] : V[3]);
      }
    }
    // the crystal: a diamond of sky-blue, lit on its left, a white glint
    s.glow(C.x, C.y, 12 * z, V[3], 0.6 * A);
    const hw = 3.5 * z, hh = 6 * z;
    for (let yy = -hh; yy <= hh; yy++) {
      const w = hw * (1 - Math.abs(yy) / hh);
      for (let xx = -Math.ceil(w); xx <= Math.ceil(w); xx++) {
        if (Math.abs(xx) > w + 0.4) continue;
        const X = Math.round(C.x + xx), Y = Math.round(C.y + yy);
        if (!keep(X, Y, A)) continue;
        const edge = Math.abs(xx) > w - 0.6 || Math.abs(yy) > hh - 0.6;
        s.px(X, Y, edge ? V[5] : xx < 0 ? (yy < 0 ? V[1] : V[2]) : yy < 0 ? V[3] : V[4]);
      }
    }
    if (keep(Math.round(C.x - 1), Math.round(C.y - 2), A)) s.px(Math.round(C.x - 1), Math.round(C.y - 2), 0xffffff);
  }
}

/** A crescent moon of gold light at (x, y), R across - rising into view, glowing, then fading (her moon, in the dawn). */
export class Crescent implements Pop {
  private t: number;
  constructor(private readonly x: number, private readonly y: number, private readonly R: number, private readonly o: { dur?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 2);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 2, k = this.t / D, A = clamp(k / 0.2) * (1 - clamp((k - 0.75) / 0.25)), R = this.R, rise = (1 - ease(k / 0.3)) * 8;
    const cx = this.x, cy = this.y + rise;
    s.glow(cx, cy, R * 2, GOLD[2], 0.45 * A);
    // a disc less a disc offset to one side
    for (let yy = -R; yy <= R; yy++)
      for (let xx = -R; xx <= R; xx++) {
        const d = Math.hypot(xx, yy);
        if (d > R) continue;
        const d2 = Math.hypot(xx - R * 0.45, yy - R * 0.2);
        if (d2 < R * 0.85) continue;
        const X = Math.round(cx + xx), Y = Math.round(cy + yy);
        if (!keep(X, Y, A)) continue;
        const rim = d > R - 1.2 || d2 < R * 0.85 + 1.2;
        s.px(X, Y, rim ? GOLD[1] : xx + yy < -R * 0.4 ? GOLD[0] : GOLD[2]);
      }
    // its sparkle
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this.t, r = R + 3 + Math.sin(this.t * 4 + i) * 2, X = Math.round(cx + Math.cos(a) * r), Y = Math.round(cy + Math.sin(a) * r);
      if (keep(X, Y, A * 0.8)) s.px(X, Y, GOLD[0]);
    }
  }
}
