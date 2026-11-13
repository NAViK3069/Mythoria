import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL } from './vfx';

// Neris's light, in our own pixels on fx/surface.ts: a beam of crystal light, a burst of crystal shards, spears of
// crystal that form in the air and plunge into the ground, and the crystal star - eight points of faceted light with a
// ring circling it like a planet's - that bursts. Pale crystal blue lit white, edged with a little gold.

const C = PAL.crystal; // white .. deep blue
const G = PAL.holy; // gold

/** A small faceted shard (a diamond 2r long) at (x, y) pointing along `a`: its light side and its dark side. */
function shard(s: Surface, x: number, y: number, a: number, r: number, k: number): void {
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, w = Math.max(1, r * 0.45);
  for (let u = -r; u <= r; u += 0.5) {
    const hw = w * (1 - Math.abs(u) / r);
    for (let v = -hw; v <= hw; v += 0.5) {
      const X = Math.round(x + ux * u + nx * v), Y = Math.round(y + uy * u + ny * v);
      if (keep(X, Y, k)) s.px(X, Y, Math.abs(v) < 0.5 ? C[0] : v < 0 ? C[1] : C[3]);
    }
  }
}

/**
 * A beam of crystal light from `from` to `to`: it shoots out (0.06 s), holds `dur` - a white core, pale blue round it, a
 * thread of gold winding along it, sparkles - and fades, a flare where it leaves and a burst of light where it lands.
 */
export class PrismBeam implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly from: () => { x: number; y: number }, private readonly to: () => { x: number; y: number }, private readonly o: { dur?: number; w?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.32;
  }
  get done(): boolean {
    return this.t >= this.D + 0.18;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, a = this.from(), b = this.to(), reach = clamp(t / 0.06), fade = 1 - clamp((t - this.D) / 0.18);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const W = (this.o.w ?? 3) * (0.8 + 0.2 * Math.sin(t * 40)) * (0.4 + 0.6 * fade), L = len * reach;
    for (let d = 0; d <= L; d += 0.5) {
      const hw = W * (d < 4 ? 0.5 + d / 8 : 1);
      for (let v = -hw - 1; v <= hw + 1; v += 0.5) {
        const e = Math.abs(v) / hw, X = Math.round(a.x + ux * d + nx * v), Y = Math.round(a.y + uy * d + ny * v);
        const c: RGB = e < 0.4 ? C[0] : e < 0.75 ? C[1] : e <= 1 ? C[3] : C[4];
        if (keep(X, Y, fade * (e > 1 ? 0.5 : 1))) s.px(X, Y, c);
      }
      // a thread of gold winding along it
      const tv = Math.sin(d * 0.35 - t * 30) * (W + 1.5);
      if (Math.cos(d * 0.35 - t * 30) > 0) {
        const X = Math.round(a.x + ux * d + nx * tv), Y = Math.round(a.y + uy * d + ny * tv);
        if (keep(X, Y, fade)) s.px(X, Y, G[2]);
      }
    }
    s.glow(a.x, a.y, 9, C[2], 0.6 * fade);
    // sparkles drifting off it
    for (let i = 0; i < 12; i++) {
      const q = (t * 3 + hash(i, this.seed)) % 1, d = L * hash(i, this.seed, 1), side = hash(i, this.seed, 2) > 0.5 ? 1 : -1;
      const X = Math.round(a.x + ux * d + nx * side * (W + 2 + q * 6)), Y = Math.round(a.y + uy * d + ny * side * (W + 2 + q * 6) - q * 4);
      if (keep(X, Y, fade * (1 - q))) s.px(X, Y, i % 3 ? C[1] : G[1]);
    }
    if (reach >= 1) s.glow(b.x, b.y, 12, C[2], 0.7 * fade), s.glow(b.x, b.y, 5, C[0], 0.6 * fade);
  }
}

/** A burst of crystal light at (x, y): a flash, a four-point star, a ring, faceted shards flying out and spinning. */
export class CrystalBurst implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; dur?: number; delay?: number; n?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.6;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const q = this.t / this.D, r = this.o.r ?? 12, x = this.x, y = this.y;
    if (q < 0.25) s.glow(x, y, r * 2, C[2], 0.8 * (1 - q / 0.25)), s.glow(x, y, r * 0.7, C[0], 0.8 * (1 - q / 0.25));
    // the star: four long rays and four short, shrinking
    const sl = r * 1.6 * (1 - ease(q));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, l = k % 2 ? sl * 0.45 : sl;
      for (let d = 0; d < l; d++) {
        const X = Math.round(x + Math.cos(a) * d), Y = Math.round(y + Math.sin(a) * d);
        s.px(X, Y, d < l * 0.4 ? C[0] : k % 2 ? G[1] : C[1]);
      }
    }
    // a ring going out
    const R = r * (0.4 + 1.2 * ease(q));
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, X = Math.round(x + Math.cos(a) * R), Y = Math.round(y + Math.sin(a) * R * 0.8);
      if (keep(X, Y, 1 - q)) s.px(X, Y, C[2]);
    }
    // shards flying out, spinning
    const n = this.o.n ?? 10;
    for (let i = 0; i < n; i++) {
      const a = hash(i, this.seed) * Math.PI * 2, v = r * (1.2 + 1.8 * hash(i, this.seed, 1)) * ease(q);
      shard(s, x + Math.cos(a) * v, y + Math.sin(a) * v + 10 * q * q, a + q * 8 * (hash(i, this.seed, 2) - 0.5), 2 + 2 * hash(i, this.seed, 3), 1 - q);
    }
  }
}

/**
 * A spear of crystal for (x, groundY): it forms in the air `h` px up (light gathering into it), hangs a moment, then
 * plunges point-first into the ground (onHit), stays there shining, and shatters into shards. len its length.
 */
export class CrystalSpear implements Pop {
  private t: number;
  private hit = false;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly gy: number, private readonly o: { h?: number; len?: number; w?: number; form?: number; fall?: number; stay?: number; delay?: number; lean?: number; onHit?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get F(): number {
    return this.o.form ?? 0.28;
  }
  private get Fa(): number {
    return this.o.fall ?? 0.1;
  }
  private get S(): number {
    return this.o.stay ?? 0.35;
  }
  get done(): boolean {
    return this.t >= this.F + this.Fa + this.S + 0.4;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (!this.hit && this.t >= this.F + this.Fa) {
      this.hit = true;
      this.o.onHit?.();
    }
  }
  /** The crystal itself, its point at (px, py), pointing down (leaning `lean` px sideways along its length). */
  private crystal(s: Surface, px: number, py: number, k: number, glowK: number): void {
    const L = this.o.len ?? 24, w = this.o.w ?? 4, lean = this.o.lean ?? 0;
    for (let a = 0; a <= L; a += 0.5) {
      const f = a / L, hw = w * (f < 0.65 ? f / 0.65 : 1 - ((f - 0.65) / 0.35) * 0.75), cx = px - (lean * a) / L, cy = py - a;
      for (let v = -hw; v <= hw; v += 0.5) {
        const X = Math.round(cx + v), Y = Math.round(cy);
        if (!keep(X, Y, k)) continue;
        const e = Math.abs(v) / Math.max(0.5, hw);
        s.px(X, Y, e > 0.85 ? C[4] : Math.abs(v) < 0.5 ? C[0] : v < 0 ? (f > 0.65 ? C[1] : C[2]) : f > 0.65 ? C[3] : C[4]);
      }
    }
    s.glow(px - lean * 0.5, py - L * 0.5, w * 3.5, C[3], 0.35 * glowK);
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, F = this.F, Fa = this.Fa, S = this.S, h = this.o.h ?? 60, L = this.o.len ?? 24;
    if (t < F) {
      // forming: light drawn into it, it fades in
      const k = ease(t / F), y = this.gy - h;
      for (let i = 0; i < 8; i++) {
        const q = (t * 3 + hash(i, this.seed)) % 1, ang = hash(i, this.seed, 1) * Math.PI * 2, rr = 12 * (1 - q);
        const X = Math.round(this.x + Math.cos(ang) * rr), Y = Math.round(y - L * 0.5 + Math.sin(ang) * rr);
        if (keep(X, Y, q)) s.px(X, Y, C[1]);
      }
      this.crystal(s, this.x, y, k, k);
    } else if (t < F + Fa) {
      // plunging, a streak of light behind
      const q = (t - F) / Fa, y = this.gy - h + (h + 4) * q * q;
      for (let k = 0; k < 14; k++) {
        const Y = Math.round(y - L - k * 2), X = Math.round(this.x);
        if (keep(X, Y, 1 - k / 14)) s.px(X, Y, C[1]), s.px(X - 1, Y, C[3]), s.px(X + 1, Y, C[3]);
      }
      this.crystal(s, this.x, y, 1, 1);
    } else if (t < F + Fa + S) {
      // stuck in the ground, shining; a crack of light round its foot
      const q = (t - F - Fa) / S;
      this.crystal(s, this.x, this.gy + 4, 1, 1 - q * 0.5);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, rr = 5 + 9 * ease(q), X = Math.round(this.x + Math.cos(a) * rr), Y = Math.round(this.gy + Math.sin(a) * rr * 0.36);
        if (keep(X, Y, 1 - q)) s.px(X, Y, C[2]);
      }
    } else {
      // shattering into shards
      const q = (t - F - Fa - S) / 0.4;
      if (q < 0.2) s.glow(this.x, this.gy - L * 0.5, 14, C[2], 0.7 * (1 - q / 0.2));
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI * hash(i, this.seed, 2), v = 10 + 22 * hash(i, this.seed, 3);
        shard(s, this.x + Math.cos(a) * v * q, this.gy - L * hash(i, this.seed, 4) + Math.sin(a) * v * q + 30 * q * q, a + q * 6, 2 + 1.5 * hash(i, this.seed, 5), 1 - q);
      }
    }
  }
}

/**
 * The crystal star at (x, y): eight points of faceted crystal (four long, four short) forming out of light, turning
 * slowly, a ring circling it like a planet's with three little crystals riding it, glowing brighter - and at `burstAt`
 * it bursts (onBurst): a white flash, rays of light far out, its points flying off as great shards.
 */
export class CrystalStar implements Pop {
  private t: number;
  private burst = false;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly R: number, private readonly o: { burstAt?: number; delay?: number; onBurst?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get B(): number {
    return this.o.burstAt ?? 1.4;
  }
  get done(): boolean {
    return this.t >= this.B + 0.8;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (!this.burst && this.t >= this.B) {
      this.burst = true;
      this.o.onBurst?.();
    }
  }
  /** Its ring: the back half (behind the star) or the front half, with its riders. */
  private ring(s: Surface, R: number, k: number, front: boolean): void {
    const rx = R * 1.75, ry = R * 0.42, tilt = -0.22, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let i = 0; i < 260; i++) {
      const a = (i / 260) * Math.PI * 2;
      if (Math.sin(a) > 0 !== front) continue;
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry, X = Math.round(this.x + ex * ct - ey * st), Y = Math.round(this.y + ex * st + ey * ct);
      if (keep(X, Y, k * (front ? 1 : 0.75))) s.px(X, Y, front ? C[1] : C[4]);
    }
    for (let j = 0; j < 3; j++) {
      const a = this.t * 1.6 + (j / 3) * Math.PI * 2;
      if (Math.sin(a) > 0 !== front) continue;
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      shard(s, this.x + ex * ct - ey * st, this.y + ex * st + ey * ct, -Math.PI / 2, 3, k);
    }
  }
  private star(s: Surface, R: number, k: number): void {
    const rot = this.t * 0.6;
    s.glow(this.x, this.y, R * 1.8, C[4], 0.22 * k);
    for (let yy = -Math.ceil(R); yy <= Math.ceil(R); yy++)
      for (let xx = -Math.ceil(R); xx <= Math.ceil(R); xx++) {
        const r = Math.hypot(xx, yy), phi = Math.atan2(yy, xx) - rot;
        const long = Math.pow(Math.max(0, Math.cos(4 * phi)), 4), short = Math.pow(Math.max(0, Math.cos(4 * phi + Math.PI)), 4);
        const lim = R * (0.36 + 0.64 * long + 0.22 * short);
        if (r > lim) continue;
        const X = Math.round(this.x + xx), Y = Math.round(this.y + yy);
        if (!keep(X, Y, k)) continue;
        // facets: each point split along its ridge, lit from the top left
        const side = Math.sin(4 * phi) > 0, lit = -(Math.cos(phi + rot) + Math.sin(phi + rot)) > 0, e = r / lim;
        const c: RGB = r < R * 0.12 ? C[0] : e > 0.84 ? C[5] : side === lit ? (e < 0.4 ? C[1] : C[2]) : e < 0.4 ? C[3] : C[4];
        s.px(X, Y, c);
      }
    s.glow(this.x, this.y, R * 0.3, C[0], 0.25 * k);
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, B = this.B;
    if (t < B) {
      const k = ease(t / 0.5), R = this.R * (0.3 + 0.7 * k) * (1 + 0.06 * Math.sin(t * 9) + (t > B - 0.3 ? 0.15 * ((t - (B - 0.3)) / 0.3) : 0));
      // light gathering into it
      for (let i = 0; i < 16; i++) {
        const q = (t * 1.6 + hash(i, this.seed)) % 1, ang = hash(i, this.seed, 1) * Math.PI * 2 + q, rr = this.R * 3 * (1 - q);
        const X = Math.round(this.x + Math.cos(ang) * rr), Y = Math.round(this.y + Math.sin(ang) * rr * 0.8);
        if (keep(X, Y, q)) s.px(X, Y, i % 3 ? C[1] : G[1]);
      }
      this.ring(s, R, k, false);
      this.star(s, R, k);
      this.ring(s, R, k, true);
      return;
    }
    // the burst
    const q = (t - B) / 0.8, R = this.R;
    if (q < 0.3) s.glow(this.x, this.y, R * 5, C[2], 0.9 * (1 - q / 0.3)), s.glow(this.x, this.y, R * 2, C[0], 0.9 * (1 - q / 0.3));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + 0.1, l = R * (k % 2 ? 3 : 6) * ease(Math.min(1, q * 2.5));
      for (let d = R * 0.5; d < l; d += 0.7) {
        const X = Math.round(this.x + Math.cos(a) * d), Y = Math.round(this.y + Math.sin(a) * d * 0.8);
        if (keep(X, Y, (1 - q) * (1 - d / (l + 1)))) s.px(X, Y, k % 2 ? G[1] : C[0]);
      }
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + hash(i, this.seed) * 0.4, v = R * (1 + 4 * ease(q));
      shard(s, this.x + Math.cos(a) * v, this.y + Math.sin(a) * v * 0.8 + 20 * q * q, a, 3 + 3 * hash(i, this.seed, 2), 1 - q);
    }
  }
}
