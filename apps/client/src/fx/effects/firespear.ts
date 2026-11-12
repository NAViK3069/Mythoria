import type { Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, hash, keep, PAL } from './vfx';

// Fenrir's fire, in our own pixels on fx/surface.ts: a spiral of fire coiling round his spear, and the flaming lance -
// a great spearhead of flame he drives out of his spear's point (or calls down out of the sky) that streaks along with a
// long burning tail, rings of shock peeling off it, and pierces whatever it meets. White-hot at the heart, through gold
// and orange to red at the edges.

const F = PAL.fire; // white .. near-black red

/**
 * A lance of flame flying from (x0, y0) to (x1, y1) - then on through for `over` px (0: it plunges into the ground
 * there) - `scale` its size (2 for the ult's great one). Its head a spearhead of white-hot fire, a long tail of flame
 * wavering behind it wound round by two strands of fire, rings of shock peeling off it, embers shed; where it strikes
 * (onHit, when its head reaches (x1, y1)) a spray of fire bursts on out the way it was going.
 */
export class FlameLance implements Pop {
  private t: number;
  private hit = false;
  private readonly seed = Math.random() * 100;
  private readonly ux: number;
  private readonly uy: number;
  private readonly dist: number;
  constructor(private readonly x0: number, private readonly y0: number, private readonly x1: number, private readonly y1: number, private readonly o: { dur?: number; delay?: number; scale?: number; over?: number; burst?: boolean; onHit?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    const dx = x1 - x0, dy = y1 - y0;
    this.dist = Math.max(1, Math.hypot(dx, dy));
    this.ux = dx / this.dist;
    this.uy = dy / this.dist;
  }
  private get S(): number {
    return this.o.scale ?? 1;
  }
  private get D(): number {
    return this.o.dur ?? 0.16;
  }
  /** How far along its head is (it keeps going: what passes the end of its path isn't drawn). */
  private get head(): number {
    return (this.t / this.D) * this.dist;
  }
  private get end(): number {
    return this.dist + (this.o.over ?? 0);
  }
  private get tail(): number {
    return 46 * this.S;
  }
  get done(): boolean {
    return this.head - this.tail > this.end && this.t >= this.D + 0.55;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (!this.hit && this.t >= this.D) {
      this.hit = true;
      this.o.onHit?.();
    }
  }
  /** A point d px along its path and b px out to its side. */
  private at(d: number, b: number): [number, number] {
    return [Math.round(this.x0 + this.ux * d - this.uy * b), Math.round(this.y0 + this.uy * d + this.ux * b)];
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const S = this.S, h = this.head, end = this.end, TL = this.tail, t = this.t;
    const tip = 15 * S, neck = 2.5 * S;
    // rings of shock peeling off it as it flies (each left where it was, widening and fading)
    const gap = 20 * S;
    for (let d = gap; d < Math.min(h, end); d += gap) {
      const age = (h - d) / (this.dist / this.D);
      if (age > 0.22) continue;
      const q = age / 0.22, r = (3 + 7 * q) * S;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2, [X, Y] = this.at(d - Math.cos(a) * r * 0.32, Math.sin(a) * r);
        if (keep(X, Y, 0.85 * (1 - q))) s.px(X, Y, q < 0.4 ? F[1] : F[3]);
      }
    }
    // the tail: flame wavering behind, white at its heart, cooling to red at its edges and its end
    for (let a = -TL; a < -neck; a += 0.5) {
      const d = h + a;
      if (d < 0 || d > end) continue;
      const q = -a / TL, w = 3.2 * S * Math.pow(1 - q, 0.7) * (1 + 0.28 * Math.sin(t * 46 + a * 0.55 + this.seed));
      for (let b = -w; b <= w; b += 0.6) {
        const e = Math.abs(b) / w, [X, Y] = this.at(d, b);
        if (!keep(X, Y, (1 - q * q) * (1 - e * 0.35))) continue;
        s.px(X, Y, e < 0.3 && q < 0.35 ? F[0] : e < 0.55 && q < 0.6 ? F[1] : e < 0.8 && q < 0.85 ? F[2] : q < 0.7 ? F[3] : F[4]);
      }
    }
    // two strands of fire winding round the tail
    for (const ph of [0, Math.PI])
      for (let a = -TL * 0.85; a < 0; a += 0.5) {
        const d = h + a;
        if (d < 0 || d > end) continue;
        const q = -a / TL, ang = a * 0.32 - t * 34 + ph, b = Math.sin(ang) * (4.5 * S) * (1 - q * 0.5);
        if (Math.cos(ang) < 0) continue;
        const [X, Y] = this.at(d, b);
        if (keep(X, Y, 1 - q)) s.px(X, Y, q < 0.4 ? 0xffffff : F[1]);
      }
    // the head: a spearhead of fire, white-hot inside, its edge gold and orange
    for (let a = -neck; a <= tip; a += 0.5) {
      const d = h + a;
      if (d < 0 || d > end) continue;
      const k = (a + neck) / (tip + neck), w = 4.4 * S * (k < 0.3 ? 0.55 + 0.45 * (k / 0.3) : Math.pow((1 - k) / 0.7, 0.85));
      for (let b = -w; b <= w; b += 0.5) {
        const e = Math.abs(b) / Math.max(0.5, w), [X, Y] = this.at(d, b);
        s.px(X, Y, e > 0.78 ? F[3] : e > 0.5 ? F[2] : e > 0.22 ? F[1] : 0xffffff);
      }
    }
    if (h - neck <= end) {
      const hd = Math.min(h, end), [HX, HY] = this.at(hd, 0);
      s.glow(HX, HY, 16 * S, F[3], 0.5);
      s.glow(HX, HY, 6 * S, F[0], 0.5);
    }
    // embers shed behind it, drifting down
    for (let i = 0; i < 10 * S; i++) {
      const q = (t * 2.4 + hash(i, this.seed)) % 1, d = h - TL * 0.2 - q * TL * 0.9;
      if (d < 0 || d > end) continue;
      const [X, Y] = this.at(d, (hash(i, this.seed, 1) - 0.5) * 10 * S);
      if (keep(X, Y + Math.round(q * 6), 1 - q)) s.px(X, Y + Math.round(q * 6), q < 0.4 ? F[1] : F[3]);
    }
    // where it struck: a spray of fire bursting on out the way it was going, a flash, a ring
    if (this.hit && this.o.burst !== false) {
      const q = (t - this.D) / 0.55;
      if (q >= 1) return;
      const cx = this.x1, cy = this.y1;
      if (q < 0.25) s.glow(cx, cy, 26 * S, F[2], 0.8 * (1 - q / 0.25)), s.glow(cx, cy, 9 * S, 0xffffff, 0.8 * (1 - q / 0.25));
      const R = (6 + 18 * Math.sqrt(q)) * S;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2, X = Math.round(cx + Math.cos(a) * R * 0.45), Y = Math.round(cy + Math.sin(a) * R);
        if (keep(X, Y, 0.8 * (1 - q))) s.px(X, Y, F[2]);
      }
      const base = Math.atan2(this.uy, this.ux);
      for (let i = 0; i < 16; i++) {
        const a = base + (hash(i, this.seed, 2) - 0.5) * 1.9, r0 = (4 + 30 * q * (0.5 + hash(i, this.seed, 3))) * S, r1 = r0 + 7 * S * (1 - q);
        for (let r = r0; r <= r1; r += 0.6) {
          const X = Math.round(cx + Math.cos(a) * r), Y = Math.round(cy + Math.sin(a) * r + 14 * q * q);
          if (keep(X, Y, 1 - q)) s.px(X, Y, i % 3 === 0 ? 0xffffff : i % 3 === 1 ? F[1] : F[3]);
        }
      }
    }
  }
}

/**
 * Fire coiling round a spear held at `grip` (its hand, the way it points): a spiral of flame running up the shaft to
 * its head, sparks thrown off, the head blazing - for `dur` seconds.
 */
export class SpearFlame implements Pop {
  private t = 0;
  constructor(private readonly grip: { x: number; y: number; angle: number }, private readonly o: { from?: number; to?: number; dur?: number } = {}, private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.8);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const D = this.o.dur ?? 0.8, k = this.t / D, A = clamp(k / 0.15) * (1 - clamp((k - 0.8) / 0.2));
    const g = this.grip, ux = Math.cos(g.angle), uy = Math.sin(g.angle), nx = -uy, ny = ux;
    const u0 = this.o.from ?? -10, u1 = this.o.to ?? 30;
    // the spiral: two strands winding up the shaft
    for (const ph of [0, Math.PI]) {
      for (let u = u0; u <= u1; u += 0.5) {
        const w = Math.sin(u * 0.5 - this.t * 22 + ph) * 3, front = Math.cos(u * 0.5 - this.t * 22 + ph) > 0;
        const X = Math.round(g.x + ux * u + nx * w), Y = Math.round(g.y + uy * u + ny * w);
        if (!keep(X, Y, A * (front ? 1 : 0.5))) continue;
        s.px(X, Y, front ? F[1] : F[3]);
        if (front) s.add(X, Y, F[2], 0.3 * A);
      }
    }
    // the head blazing
    const hx = g.x + ux * u1, hy = g.y + uy * u1;
    s.glow(hx, hy, 10, F[3], 0.6 * A);
    s.glow(hx, hy, 4, F[0], 0.6 * A);
    for (let i = 0; i < 6; i++) {
      const q = (this.t * 2.5 + i / 6) % 1, X = Math.round(hx + (hash(i, 1) - 0.5) * 8 * q), Y = Math.round(hy - q * 12);
      if (keep(X, Y, A * (1 - q))) s.px(X, Y, q < 0.4 ? F[1] : F[3]);
    }
  }
}
