import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL, type PalName } from './vfx';

// Pip's workshop, in our own pixels on fx/surface.ts: brass gears turning, puffs of steam, a shower of sparks off the
// hammer, chevrons of power rising round a friend, and arcs of energy crackling from his hammer to his friends.

const Br = PAL.brass, St = PAL.steam;

/**
 * A brass gear at (x, y), R wide (its teeth beyond that): it pops in, turns (`spin` turns a second, either way), and
 * fades at the end. `pal` recolours it.
 */
export class Gear implements Pop {
  private t: number;
  constructor(private readonly at: () => { x: number; y: number }, private readonly R: number, private readonly o: { teeth?: number; dur?: number; delay?: number; spin?: number; pal?: PalName } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.9;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  /** A gear drawn at (cx, cy), radius R, turned `rot`, at strength k. */
  static draw(s: Surface, cx: number, cy: number, R: number, rot: number, teeth: number, k: number, P: readonly number[] = Br): void {
    const T = Math.max(1.5, R * 0.28), hole = R * 0.32;
    for (let yy = -Math.ceil(R + T); yy <= Math.ceil(R + T); yy++)
      for (let xx = -Math.ceil(R + T); xx <= Math.ceil(R + T); xx++) {
        const r = Math.hypot(xx, yy), th = Math.atan2(yy, xx), tooth = Math.cos(teeth * (th - rot)) > 0.15;
        const outer = R + (tooth ? T : 0);
        if (r > outer || r < hole) continue;
        const X = Math.round(cx + xx), Y = Math.round(cy + yy);
        if (!keep(X, Y, k)) continue;
        // spokes cut out between the hub and the rim
        const rimIn = R * 0.7, spoke = Math.abs(Math.sin(2 * (th - rot))) < 0.38;
        if (r > hole + 1.2 && r < rimIn && !spoke) continue;
        const lit = -(xx + yy) / Math.max(1, r), edge = r > outer - 1 || r < hole + 1 || (r > rimIn - 1 && r < rimIn);
        const c: RGB = edge ? P[5] : lit > 0.5 ? P[1] : lit > -0.2 ? P[2] : P[3];
        s.px(X, Y, c);
      }
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, p = this.at(), k = Math.min(1, ease(t / 0.15)) * (1 - clamp((t - (this.D - 0.25)) / 0.25));
    const P = this.o.pal ? PAL[this.o.pal] : Br;
    Gear.draw(s, p.x, p.y, this.R * (0.5 + 0.5 * ease(t / 0.15)), t * (this.o.spin ?? 1.2) * Math.PI * 2, this.o.teeth ?? 8, k, P);
  }
}

/** Puffs of steam bursting out from (x, y) toward `dir` (radians), spreading and rising, swelling, fading. */
export class SteamPuff implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; n?: number; dur?: number; delay?: number; dir?: number; spread?: number; far?: number; rise?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.8;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const q = this.t / this.D, n = this.o.n ?? 6, R = this.o.r ?? 6, dir = this.o.dir ?? -Math.PI / 2, spread = this.o.spread ?? 0.9;
    for (let i = 0; i < n; i++) {
      const a = dir + (hash(i, this.seed) - 0.5) * spread * 2, far = (this.o.far ?? 18) * (0.5 + 0.7 * hash(i, this.seed, 1)), lag = hash(i, this.seed, 2) * 0.25;
      const u = clamp((q - lag) / (1 - lag));
      if (u <= 0) continue;
      const cx = this.x + Math.cos(a) * far * ease(u), cy = this.y + Math.sin(a) * far * ease(u) - (this.o.rise ?? 10) * u, r = R * (0.35 + 0.65 * ease(u)) * (0.7 + 0.5 * hash(i, this.seed, 3));
      for (let yy = -Math.ceil(r); yy <= Math.ceil(r); yy++)
        for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
          const d = Math.hypot(xx, yy) / r;
          if (d > 1) continue;
          const X = Math.round(cx + xx), Y = Math.round(cy + yy), lit = -(xx * 0.6 + yy) / r;
          if (keep(X, Y, (1 - u) * (1 - d * 0.4))) s.px(X, Y, lit > 0.3 ? St[0] : lit > -0.3 ? St[2] : St[3]);
        }
    }
  }
}

/** Sparks flying off a struck point (x, y): bright streaks thrown up and out (`dir` favoured), falling, cooling. */
export class Sparks implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { n?: number; dur?: number; delay?: number; dir?: number; spread?: number; v?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.55;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const q = this.t / this.D, n = this.o.n ?? 16, F = PAL.fire;
    for (let i = 0; i < n; i++) {
      const a = (this.o.dir ?? -Math.PI / 2) + (hash(i, this.seed) - 0.5) * (this.o.spread ?? 2.6), v = (this.o.v ?? 60) * (0.5 + hash(i, this.seed, 1));
      const t = this.t * (0.8 + 0.4 * hash(i, this.seed, 2));
      const X = this.x + Math.cos(a) * v * t, Y = this.y + Math.sin(a) * v * t + 140 * t * t;
      const vx = Math.cos(a) * v, vy = Math.sin(a) * v + 280 * t, sp = Math.hypot(vx, vy) || 1;
      for (let k = 0; k < 3; k++) {
        const PX = Math.round(X - (vx / sp) * k), PY = Math.round(Y - (vy / sp) * k);
        if (keep(PX, PY, (1 - q) * (1 - k * 0.25))) s.px(PX, PY, k === 0 ? (q < 0.4 ? 0xffffff : F[1]) : q < 0.5 ? F[2] : F[3]);
      }
    }
  }
}

/** Chevrons of power rising round a friend standing at (x, footY), w wide, h tall - in `pal`. */
export class PowerArrows implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly footY: number, private readonly w: number, private readonly h: number, private readonly o: { dur?: number; delay?: number; pal?: PalName; n?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 1.0;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const P = PAL[this.o.pal ?? 'fire'], n = this.o.n ?? 5;
    for (let i = 0; i < n; i++) {
      const q = clamp((this.t / this.D) * 1.4 - hash(i, this.seed) * 0.4);
      if (q <= 0 || q >= 1) continue;
      const cx = Math.round(this.x + (hash(i, this.seed, 1) - 0.5) * this.w), cy = Math.round(this.footY - 4 - this.h * ease(q)), sz = 2 + Math.round(hash(i, this.seed, 2) * 2);
      const a = q < 0.2 ? q / 0.2 : 1 - (q - 0.2) / 0.8;
      for (let k = -sz; k <= sz; k++) {
        const Y = cy + Math.abs(k);
        if (keep(cx + k, Y, a)) s.px(cx + k, Y, P[1]);
        if (keep(cx + k, Y + 1, a)) s.px(cx + k, Y + 1, P[3]);
      }
    }
  }
}

/** An arc of energy crackling from `from` to `to`: a jagged bolt that re-forms every few frames, white at its core. */
export class EnergyArc implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly from: () => { x: number; y: number }, private readonly to: () => { x: number; y: number }, private readonly o: { dur?: number; delay?: number; pal?: PalName; jag?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.35;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const P = PAL[this.o.pal ?? 'fire'], a = this.from(), b = this.to(), frame = Math.floor(this.t / 0.05), fade = 1 - clamp((this.t - this.D * 0.6) / (this.D * 0.4));
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, segs = Math.max(4, Math.round(len / 9)), jag = this.o.jag ?? 6;
    let px = a.x, py = a.y;
    for (let i = 1; i <= segs; i++) {
      const u = i / segs, off = i === segs ? 0 : (hash(i, frame, this.seed) - 0.5) * 2 * jag * Math.sin(Math.PI * u);
      const qx = a.x + dx * u + nx * off, qy = a.y + dy * u + ny * off;
      s.line(px, py, qx, qy, 0xffffff, fade);
      s.line(px + nx, py + ny, qx + nx, qy + ny, P[2], fade * 0.8);
      s.line(px - nx, py - ny, qx - nx, qy - ny, P[3], fade * 0.6);
      px = qx;
      py = qy;
    }
    s.glow(a.x, a.y, 8, P[2], 0.5 * fade);
    s.glow(b.x, b.y, 10, P[2], 0.6 * fade);
  }
}
