import type * as Phaser from 'phaser';
import type { Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL } from './vfx';

// Kuroha's storm, in our own pixels on fx/surface.ts: her giant shuriken flying (the held picture itself, spun, with a
// trail of violet after-rings and electric crackle) and coming back to her hand, the vortex burst where a star strikes
// (three crescent blades of light whirling open, spikes, shards), a bolt of violet lightning from the sky, and the
// storm vortex the giant star spins up over the foes. Violet with electric blue-white.

const V = PAL.void, E = PAL.volt;

type Pt = { x: number; y: number };

/** A jagged bolt from a to b: white core, coloured edges; a fresh shape for each `seed`. */
export function bolt(s: Surface, a: Pt, b: Pt, seed: number, k: number, jag = 6, pal: readonly number[] = E, branch = true): void {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, segs = Math.max(3, Math.round(len / 7));
  let px = a.x, py = a.y;
  for (let i = 1; i <= segs; i++) {
    const u = i / segs, off = i === segs ? 0 : (hash(i, seed) - 0.5) * 2 * jag * Math.sin(Math.PI * u);
    const qx = a.x + dx * u + nx * off, qy = a.y + dy * u + ny * off;
    s.line(px + nx, py + ny, qx + nx, qy + ny, pal[3], k * 0.7);
    s.line(px - nx, py - ny, qx - nx, qy - ny, V[2], k * 0.6);
    s.line(px, py, qx, qy, 0xffffff, k);
    if (branch && i < segs - 1 && hash(i, seed, 7) > 0.72) {
      const bl = len * 0.18, ba = Math.atan2(dy, dx) + (hash(i, seed, 8) - 0.5) * 2.2;
      s.line(qx, qy, qx + Math.cos(ba) * bl, qy + Math.sin(ba) * bl, pal[2], k * 0.8);
    }
    px = qx;
    py = qy;
  }
}

/**
 * Her shuriken thrown: the held picture (heroes#weapon_<look>) flies `from` -> `to` spinning (`spin` turns a second), an
 * arc `arc` px high, after-rings of violet light trailing and electric crackle round it; onHit there - then, if `back`,
 * it flies home to `from()` (her hand, wherever it is by then) and onBack. `hold` keeps it spinning at `to` a while
 * first (the great star over the foes).
 */
export class FlyingStar implements Pop {
  private t: number;
  private img: Phaser.GameObjects.Image | null = null;
  private hit = false;
  private home = false;
  private readonly hist: { x: number; y: number; at: number }[] = [];
  private launch: Pt | null = null;
  private turnAt: Pt | null = null;
  private readonly seed = Math.random() * 100;
  constructor(private readonly scene: Phaser.Scene, private readonly frame: string, private readonly from: () => Pt, private readonly to: () => Pt, private readonly o: { dur?: number; delay?: number; size?: number; spin?: number; arc?: number; back?: boolean; backDur?: number; hold?: number; onHit?: () => void; onBack?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.22;
  }
  private get H(): number {
    return this.o.hold ?? 0;
  }
  private get B(): number {
    return this.o.back ? this.o.backDur ?? 0.26 : 0;
  }
  /** Where it is now (null before it's thrown). */
  get pos(): Pt | null {
    return this.img ? { x: this.img.x, y: this.img.y } : null;
  }
  get done(): boolean {
    const end = this.D + this.H + this.B + 0.25;
    if (this.t >= end && this.img) {
      this.img.destroy();
      this.img = null;
    }
    return this.t >= end;
  }
  private path(a: Pt, b: Pt, u: number, arc: number): Pt {
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - arc * 4 * u * (1 - u) };
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (this.t < 0) return;
    const S = this.o.size ?? 1;
    if (!this.img) {
      this.launch = { ...this.from() };
      this.img = this.scene.add.image(this.launch.x, this.launch.y, 'heroes', this.frame).setScale(0.5 * S).setDepth(9501);
    }
    const t = this.t, D = this.D, H = this.H, B = this.B;
    let p: Pt;
    if (t < D) p = this.path(this.launch!, this.to(), ease(t / D) * 0.25 + (t / D) * 0.75, this.o.arc ?? 0);
    else if (t < D + H || !this.o.back) {
      p = this.to();
      if (H) p = { x: p.x, y: p.y + Math.sin(t * 6) * 1.5 };
    } else {
      if (!this.turnAt) this.turnAt = { x: this.img.x, y: this.img.y };
      const u = clamp((t - D - H) / B);
      p = this.path(this.turnAt, this.from(), u * u * 0.4 + u * 0.6, -(this.o.arc ?? 0) * 0.6);
      if (u >= 1 && !this.home) {
        this.home = true;
        this.img.setVisible(false);
        this.o.onBack?.();
      }
    }
    if (!this.hit && t >= D) {
      this.hit = true;
      this.o.onHit?.();
      if (!this.o.back && !H) this.img.setVisible(false);
    }
    if (!this.o.back && H && t >= D + H) this.img.setVisible(false);
    const spin = (this.o.spin ?? 4) * Math.PI * 2 * (t >= D && t < D + H ? 1.6 : 1);
    this.img.setPosition(p.x, p.y).setRotation(this.img.rotation + spin * dt * this.speed);
    if (this.img.visible) this.hist.push({ x: p.x, y: p.y, at: t });
    while (this.hist.length && t - this.hist[0].at > 0.14) this.hist.shift();
  }
  draw(s: Surface): void {
    if (this.t < 0 || !this.img) return;
    const S = this.o.size ?? 1, R = 9 * S, t = this.t, rot = this.img.rotation;
    // after-rings of violet light where it's been, a bright arc for each blade's tip
    this.hist.forEach((h, i) => {
      if (i % 2) return;
      const f = 1 - (t - h.at) / 0.14;
      if (f <= 0) return;
      for (let j = 0; j < 36; j++) {
        const a = (j / 36) * Math.PI * 2, tip = Math.cos(3 * (a - rot)) > 0.75;
        const X = Math.round(h.x + Math.cos(a) * R), Y = Math.round(h.y + Math.sin(a) * R);
        if (keep(X, Y, f * (tip ? 0.9 : 0.35))) s.px(X, Y, tip ? (f > 0.6 ? E[1] : V[2]) : V[3]);
      }
    });
    if (!this.img.visible) return;
    const p = { x: this.img.x, y: this.img.y };
    s.glow(p.x, p.y, R * 1.8, V[3], 0.35);
    // electric crackle off it
    const fr = Math.floor(t / 0.05);
    for (let i = 0; i < 2 + Math.round(S); i++) {
      const a = hash(i, fr, this.seed) * Math.PI * 2, l = R * (1.1 + 0.6 * hash(i, fr, this.seed + 1));
      bolt(s, { x: p.x + Math.cos(a) * R * 0.5, y: p.y + Math.sin(a) * R * 0.5 }, { x: p.x + Math.cos(a) * l, y: p.y + Math.sin(a) * l }, fr * 7 + i, 0.8, 2, E, false);
    }
  }
}

/**
 * Where a star strikes (x, y): a flash, three crescent blades of light whirling open, long spikes shooting out and
 * shrinking, a ring, shards flung off - violet and electric blue, cooling to deep violet. r its size.
 */
export class VortexBurst implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; dur?: number; delay?: number } = {}, private readonly speed = 1) {
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
    if (q < 0.25) s.glow(x, y, r * 2.2, V[2], 0.8 * (1 - q / 0.25)), s.glow(x, y, r * 0.8, 0xffffff, 0.8 * (1 - q / 0.25));
    // three crescents whirling open
    const rot = this.seed + q * 7, R = r * (0.35 + 0.75 * ease(q));
    for (let c = 0; c < 3; c++) {
      const a0 = rot + (c / 3) * Math.PI * 2;
      for (let a = 0; a < 1.7; a += 0.03) {
        const f = a / 1.7, w = Math.max(0.6, 2.6 * (r / 12) * Math.sin(Math.PI * f) * (1 - q * 0.6)), rr = R * (1 - 0.25 * f);
        for (let k = -w; k <= w; k += 0.6) {
          const X = Math.round(x + Math.cos(a0 + a) * (rr + k)), Y = Math.round(y + Math.sin(a0 + a) * (rr + k) * 0.85);
          if (!keep(X, Y, 1 - q * q)) continue;
          s.px(X, Y, q < 0.3 ? (Math.abs(k) < 0.8 ? 0xffffff : E[1]) : q < 0.6 ? (Math.abs(k) < 0.8 ? E[1] : V[2]) : V[3]);
        }
      }
    }
    // spikes shooting out and shrinking
    for (let i = 0; i < 5; i++) {
      const a = hash(i, this.seed) * Math.PI * 2, L = r * (1.4 + hash(i, this.seed, 1)) * Math.sin(Math.PI * clamp(q * 1.6));
      for (let d = r * 0.4; d < r * 0.4 + L; d += 0.6) {
        const f = (d - r * 0.4) / Math.max(1, L), X = Math.round(x + Math.cos(a) * d), Y = Math.round(y + Math.sin(a) * d * 0.85);
        if (keep(X, Y, 1 - f)) s.px(X, Y, f < 0.4 ? 0xffffff : E[2]);
      }
    }
    // a ring, shards
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, X = Math.round(x + Math.cos(a) * R * 1.25), Y = Math.round(y + Math.sin(a) * R * 1.05);
      if (keep(X, Y, (1 - q) * 0.6)) s.px(X, Y, V[2]);
    }
    for (let i = 0; i < 10; i++) {
      const a = hash(i, this.seed, 2) * Math.PI * 2, v = r * (1.2 + 2 * hash(i, this.seed, 3)) * ease(q);
      const X = Math.round(x + Math.cos(a) * v), Y = Math.round(y + Math.sin(a) * v + 14 * q * q);
      if (keep(X, Y, 1 - q)) s.px(X, Y, i % 2 ? E[1] : V[1]), s.px(X + 1, Y, V[3]);
    }
  }
}

/** A bolt of violet lightning down out of the sky onto (x, groundY): it flickers, branches, flashes the ground. */
export class LightningStrike implements Pop {
  private t: number;
  private hit = false;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly gy: number, private readonly o: { h?: number; dur?: number; delay?: number; onHit?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.4;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (!this.hit && this.t >= 0) {
      this.hit = true;
      this.o.onHit?.();
    }
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const q = this.t / this.D, fr = Math.floor(this.t / 0.04), on = q < 0.5 || fr % 2 === 0;
    const top = { x: this.x + (hash(fr, this.seed) - 0.5) * 10, y: this.gy - (this.o.h ?? 120) };
    if (on) bolt(s, top, { x: this.x, y: this.gy }, fr * 13 + this.seed, 1 - q * 0.6, 9, E, true);
    if (q < 0.3) s.glow(this.x, this.gy - 10, 26, V[2], 0.7 * (1 - q / 0.3)), s.glow(this.x, this.gy, 14, 0xffffff, 0.6 * (1 - q / 0.3), 0.4);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2, rr = 6 + 16 * ease(q), X = Math.round(this.x + Math.cos(a) * rr), Y = Math.round(this.gy + Math.sin(a) * rr * 0.36);
      if (keep(X, Y, 1 - q)) s.px(X, Y, E[1]);
    }
  }
}

/**
 * The storm vortex at (x, y), R wide: a disc of violet spiral arms whirling round a white-hot eye, lightning crackling
 * out of it down to `targets` again and again, for `dur`.
 */
export class StormVortex implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly R: number, private readonly targets: () => Pt[], private readonly o: { dur?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 1.6;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, k = Math.min(1, ease(t / 0.3)) * (1 - clamp((t - (this.D - 0.25)) / 0.25)), R = this.R * (0.4 + 0.6 * ease(t / 0.4)), ry = R * 0.42;
    for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++)
      for (let xx = -Math.ceil(R); xx <= Math.ceil(R); xx++) {
        const nx = xx / R, ny = yy / ry, r = Math.hypot(nx, ny);
        if (r > 1) continue;
        const v = Math.sin(Math.atan2(ny, nx) * 3 - Math.log(r + 0.05) * 5 - t * 14), X = Math.round(this.x + xx), Y = Math.round(this.y + yy);
        const edge = clamp((1 - r) / 0.25);
        if (!keep(X, Y, k * edge * (v > 0.2 ? 1 : 0.45))) continue;
        s.px(X, Y, r < 0.12 ? 0xffffff : v > 0.75 ? E[1] : v > 0.2 ? V[2] : V[4]);
      }
    s.glow(this.x, this.y, R * 0.9, V[3], 0.5 * k);
    // lightning crackling down to the foes, every few frames a fresh one to each
    const fr = Math.floor(t / 0.07);
    this.targets().forEach((p, i) => {
      if (hash(fr, i, this.seed) < 0.45) return;
      bolt(s, { x: this.x + (hash(fr, i) - 0.5) * R, y: this.y + ry * 0.3 }, p, fr * 31 + i, k, 7, E, true);
    });
  }
}
