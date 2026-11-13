import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL } from './vfx';

// Marin's sea, in our own pixels on fx/surface.ts (NOT water.ts - that's the town fountain): a whirlpool opening on the
// ground, rings of ripples, a geyser of water bursting up, an orb of swirling water, a crown splash with its droplets,
// raindrops, and a great wave that rises, rolls across the field, curls and crashes. White foam, sky-blue light, deep
// sea-blue shadow. Ground things lie on an oval (the view looks down).

const W = PAL.water; // white .. deep navy

/** A ring on the ground (an oval rx wide, rx * sq tall), its near half brighter. */
function oval(s: Surface, x: number, y: number, rx: number, sq: number, a: number, far: RGB = W[3], near: RGB = W[1]): void {
  const n = Math.max(12, Math.ceil(rx * 7));
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2, X = Math.round(x + Math.cos(ang) * rx), Y = Math.round(y + Math.sin(ang) * rx * sq);
    if (keep(X, Y, a)) s.px(X, Y, Math.sin(ang) > 0 ? near : far);
  }
}

/** A whirlpool opening on the ground at (x, y), R wide: spiral arms of foam winding in to a glowing eye, turning. */
export class Whirlpool implements Pop {
  private t: number;
  constructor(private readonly x: number, private readonly y: number, private readonly R: number, private readonly o: { dur?: number; delay?: number; sq?: number; spin?: number; arms?: number } = {}, private readonly speed = 1) {
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
    const t = this.t, open = ease(t / 0.3), close = 1 - clamp((t - (this.D - 0.3)) / 0.3);
    const R = this.R * (0.35 + 0.65 * open) * (0.7 + 0.3 * close), a = Math.min(1, open * 1.6) * close;
    const sq = this.o.sq ?? 0.38, arms = this.o.arms ?? 4, spin = this.o.spin ?? 6, ry = R * sq;
    for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++)
      for (let xx = -Math.ceil(R); xx <= Math.ceil(R); xx++) {
        const nx = xx / R, ny = yy / ry, r = Math.hypot(nx, ny);
        if (r > 1) continue;
        const th = Math.atan2(ny, nx), v = Math.sin(th * arms - Math.log(r + 0.04) * 6 - t * spin);
        const edge = clamp((1 - r) / 0.22), X = Math.round(this.x + xx), Y = Math.round(this.y + yy);
        let c: RGB, k: number;
        if (r < 0.13) (c = r < 0.07 ? W[0] : W[2]), (k = 1);
        else if (v > 0.78) (c = r < 0.55 ? W[0] : W[1]), (k = 1);
        else if (v > 0.35) (c = W[3]), (k = 0.85);
        else if (v > -0.35) (c = W[4]), (k = 0.7);
        else (c = W[5]), (k = 0.6);
        if (keep(X, Y, a * k * edge)) s.px(X, Y, c);
      }
    // foam round its rim
    for (let i = 0; i < 70; i++) {
      const ang = (i / 70) * Math.PI * 2 + t * spin * 0.2, rr = 1 + 0.05 * Math.sin(ang * 6 + t * 7);
      const X = Math.round(this.x + Math.cos(ang) * R * rr), Y = Math.round(this.y + Math.sin(ang) * ry * rr);
      if (keep(X, Y, a * (0.55 + 0.45 * Math.sin(ang * 5 - t * 8)))) s.px(X, Y, W[1]);
    }
    s.glow(this.x, this.y, R * 0.45, W[2], 0.45 * a, sq);
  }
}

/** Rings of ripples spreading out on the ground from (x, y), out to R wide. */
export class Ripples implements Pop {
  private t: number;
  constructor(private readonly x: number, private readonly y: number, private readonly R: number, private readonly o: { n?: number; dur?: number; delay?: number; sq?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.9);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const n = this.o.n ?? 3, D = this.o.dur ?? 0.9, gap = D * 0.18, life = D - gap * (n - 1), sq = this.o.sq ?? 0.36;
    for (let i = 0; i < n; i++) {
      const q = (this.t - i * gap) / life;
      if (q < 0 || q > 1) continue;
      const r = this.R * (0.15 + 0.85 * ease(q));
      oval(s, this.x, this.y, r, sq, 1 - q);
      if (r > 5) oval(s, this.x, this.y, r - 2, sq, (1 - q) * 0.5, W[4], W[3]);
    }
  }
}

/**
 * A geyser bursting up out of the ground at (x, y): a column of water h tall (white-streaked, foam spraying off its
 * crown) shoots up, holds wobbling, then collapses into falling droplets. onHit as it reaches full height.
 */
export class Geyser implements Pop {
  private t: number;
  private hit = false;
  private readonly seed = Math.random() * 100;
  static readonly RISE = 0.12;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { h?: number; w?: number; dur?: number; delay?: number; onHit?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.9;
  }
  get done(): boolean {
    return this.t >= this.D + 0.35;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (!this.hit && this.t >= Geyser.RISE) {
      this.hit = true;
      this.o.onHit?.();
    }
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, D = this.D, h = this.o.h ?? 46, w = this.o.w ?? 5, R = Geyser.RISE, fallAt = D - 0.3;
    const fq = clamp((t - fallAt) / 0.3);
    const H = t < R ? h * ease(t / R) : t < fallAt ? h * (1 + 0.05 * Math.sin(t * 28)) : h * (1 - ease(fq));
    // its foot: foam on the ground, rings
    oval(s, this.x, this.y, w * 2.2 + 2 * Math.sin(t * 20), 0.36, 0.9 * (1 - fq));
    oval(s, this.x, this.y, w * 1.4, 0.36, 0.9 * (1 - fq), W[2], W[0]);
    // the column
    for (let yy = 0; yy < H; yy++) {
      const v = yy / Math.max(1, H), hw = w * (1 - 0.3 * v) + (v > 0.82 ? ((v - 0.82) / 0.18) * w * 0.7 : 0) + Math.sin(yy * 0.45 - t * 40) * 0.7;
      for (let xx = -Math.ceil(hw); xx <= Math.ceil(hw); xx++) {
        const e = Math.abs(xx) / hw;
        if (e > 1) continue;
        const X = Math.round(this.x + xx), Y = Math.round(this.y - yy), streak = Math.sin(yy * 0.6 + xx * 1.4 - t * 46);
        const c = e < 0.3 && xx <= 0 ? W[0] : e < 0.55 ? (streak > 0.35 ? W[0] : W[1]) : e < 0.82 ? W[2] : W[3];
        if (keep(X, Y, (1 - fq * 0.6) * (v > 0.9 ? 0.85 : 1))) s.px(X, Y, c);
      }
    }
    s.glow(this.x, this.y - H * 0.5, w * 3.2, W[3], 0.3 * (1 - fq));
    // spray off its crown, arcing out and down
    if (t < fallAt + 0.1) {
      const top = this.y - H;
      for (let i = 0; i < 16; i++) {
        const q = (t * 2.2 + hash(i, this.seed)) % 1, side = hash(i, this.seed, 1) - 0.5;
        const X = Math.round(this.x + side * w * 7 * q), Y = Math.round(top - 10 * q + 34 * q * q);
        if (keep(X, Y, 1 - q)) s.px(X, Y, q < 0.4 ? W[0] : W[2]);
      }
    }
    // collapsing: droplets falling out of where it stood
    if (fq > 0) {
      for (let i = 0; i < 22; i++) {
        const v = hash(i, this.seed, 2), X = Math.round(this.x + (hash(i, this.seed, 3) - 0.5) * w * 4 * (1 + fq));
        const Y = Math.round(this.y - h * v * (1 - fq * 0.3) + 70 * fq * fq);
        if (Y > this.y) continue;
        if (keep(X, Y, 1 - fq * 0.7)) s.px(X, Y, i % 3 ? W[1] : W[0]), s.px(X, Y - 1, W[2]);
      }
    }
  }
}

/**
 * An orb of water swirling: it gathers at `from` for `hold` seconds (motes of water spiralling in), then flies to `to`
 * (an arc `arc` px high) in `dur` - its droplets trailing - and onHit as it gets there.
 */
export class WaterOrb implements Pop {
  private t: number;
  private hit = false;
  private launch: { x: number; y: number } | null = null;
  private readonly seed = Math.random() * 100;
  constructor(private readonly from: () => { x: number; y: number }, private readonly to: () => { x: number; y: number }, private readonly o: { r?: number; hold?: number; dur?: number; arc?: number; delay?: number; onHit?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get hold(): number {
    return this.o.hold ?? 0.35;
  }
  private get D(): number {
    return this.o.dur ?? 0.3;
  }
  get done(): boolean {
    return this.hit;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (this.t >= this.hold && !this.launch) this.launch = { ...this.from() };
    if (!this.hit && this.t >= this.hold + this.D) {
      this.hit = true;
      this.o.onHit?.();
    }
  }
  private at(u: number): { x: number; y: number } {
    const a = this.launch!, b = this.to(), lift = (this.o.arc ?? 14) * Math.sin(Math.PI * u);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - lift };
  }
  /** The orb itself at (cx, cy), radius r: a sphere of water, its light top-left, a swirl turning inside it. */
  static ball(s: Surface, cx: number, cy: number, r: number, t: number): void {
    s.glow(cx, cy, r * 2.4, W[3], 0.45);
    for (let yy = -Math.ceil(r); yy <= Math.ceil(r); yy++)
      for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
        const nx = xx / r, ny = yy / r, d = Math.hypot(nx, ny);
        if (d > 1) continue;
        const X = Math.round(cx + xx), Y = Math.round(cy + yy), sw = Math.sin(Math.atan2(ny, nx) * 2 + d * 5 - t * 12);
        const hl = Math.hypot(nx + 0.38, ny + 0.42);
        const c = hl < 0.28 ? W[0] : d > 0.82 ? (ny > 0.2 ? W[5] : W[4]) : sw > 0.55 ? W[1] : ny > 0.3 ? W[3] : W[2];
        s.px(X, Y, c);
      }
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const r = this.o.r ?? 6, t = this.t;
    if (t < this.hold) {
      const p = this.from(), k = ease(t / this.hold);
      // motes of water spiralling in to it
      for (let i = 0; i < 10; i++) {
        const q = (t * 2.4 + hash(i, this.seed)) % 1, ang = hash(i, this.seed, 1) * Math.PI * 2 + q * 4, rr = r * (1 + 3 * (1 - q));
        const X = Math.round(p.x + Math.cos(ang) * rr), Y = Math.round(p.y + Math.sin(ang) * rr * 0.8);
        if (keep(X, Y, q)) s.px(X, Y, q > 0.6 ? W[0] : W[2]);
      }
      WaterOrb.ball(s, p.x, p.y, Math.max(1, r * k), t);
      return;
    }
    const u = clamp((t - this.hold) / this.D), p = this.at(u);
    // droplets trailing
    for (let i = 1; i <= 7; i++) {
      const v = u - i * 0.045;
      if (v < 0) break;
      const q = this.at(v), X = Math.round(q.x + (hash(i, this.seed) - 0.5) * 4), Y = Math.round(q.y + (hash(i, this.seed, 2) - 0.5) * 4 + i * 0.6);
      if (keep(X, Y, 1 - i / 8)) s.px(X, Y, i < 3 ? W[1] : W[3]);
    }
    WaterOrb.ball(s, p.x, p.y, r, t);
  }
}

/**
 * A splash where something struck the water at (x, y - h) over the ground point (x, y): a flash, a crown of water
 * leaping up round it, droplets flung out and falling, rings spreading on the ground. r its size.
 */
export class Splash implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; h?: number; dur?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.75;
  }
  get done(): boolean {
    return this.t >= this.D;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, q = t / this.D, r = this.o.r ?? 10, h = this.o.h ?? 0, cx = this.x, cy = this.y - h;
    if (t < 0.14) s.glow(cx, cy, r * 2.2, W[2], 0.8 * (1 - t / 0.14)), s.glow(cx, cy, r * 0.8, W[0], 0.7 * (1 - t / 0.14));
    // the crown: jets leaping up round the impact, the far ones first (dimmer), then the near ones
    const cq = clamp(q / 0.6), rise = Math.sin(Math.PI * cq), rx = r * (0.45 + 0.55 * ease(cq));
    for (const nearSide of [false, true]) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + hash(i, this.seed) * 0.3;
        if (Math.sin(ang) > 0 !== nearSide) continue;
        const bx = cx + Math.cos(ang) * rx, by = cy + Math.sin(ang) * rx * 0.36, len = r * (0.9 + 0.7 * hash(i, this.seed, 1)) * rise;
        for (let k = 0; k < len; k++) {
          const X = Math.round(bx + Math.cos(ang) * k * 0.35), Y = Math.round(by - k);
          if (keep(X, Y, 1 - q * 0.6)) s.px(X, Y, k > len - 2 ? W[0] : nearSide ? W[1] : W[3]);
        }
      }
    }
    // droplets flung out, falling
    for (let i = 0; i < 18; i++) {
      const ang = -Math.PI * (0.1 + 0.8 * hash(i, this.seed, 2)), v = r * (2.2 + 2.6 * hash(i, this.seed, 3));
      const X = Math.round(cx + Math.cos(ang) * v * q * 1.4), Y = Math.round(cy + Math.sin(ang) * v * q * 1.6 + r * 5 * q * q);
      if (keep(X, Y, 1 - q)) s.px(X, Y, i % 3 ? W[1] : W[0]);
    }
    // rings on the ground
    for (let i = 0; i < 2; i++) {
      const rq = clamp((q - i * 0.2) / 0.8);
      if (rq > 0 && rq < 1) oval(s, this.x, this.y, r * (0.8 + 2.2 * ease(rq)), 0.36, 1 - rq);
    }
  }
}

/** A raindrop falling from h px up onto the ground at (x, y), then splashing small. */
export class Droplet implements Pop {
  private t: number;
  private splash: Splash | null = null;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { h?: number; fall?: number; delay?: number; r?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return !!this.splash && this.splash.done;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    const F = this.o.fall ?? 0.28;
    if (!this.splash && this.t >= F) this.splash = new Splash(this.x, this.y, { r: this.o.r ?? 5, dur: 0.5 });
    if (this.splash) this.splash.update(dt * this.speed);
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    if (this.splash) return this.splash.draw(s);
    const F = this.o.fall ?? 0.28, q = this.t / F, H = this.o.h ?? 90, Y = this.y - H * (1 - q * q);
    for (let k = 0; k < 6; k++) {
      const X = Math.round(this.x), YY = Math.round(Y - k * 1.5);
      if (keep(X, YY, 1 - k / 6)) s.px(X, YY, k === 0 ? W[0] : W[2]);
    }
  }
}

/**
 * A great wave: rising from x0 it rolls across to x1 (in `dur`), a wall of water as deep as the field from yTop to
 * yBot and h tall - a gentle back slope, a steep dark face streaked with foam, its crest curling over in a lip of
 * white, spray flying off it - then crashes, its foam spilling out over the ground. `hits` are called as its crest
 * passes their x.
 */
export class Wave implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  private readonly done_: boolean[] = [];
  constructor(private readonly x0: number, private readonly x1: number, private readonly yTop: number, private readonly yBot: number, private readonly o: { h?: number; dur?: number; delay?: number; hits?: { x: number; cb: () => void }[] } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.9;
  }
  get done(): boolean {
    return this.t >= this.D + 0.5;
  }
  /** Where its crest is now. */
  get crest(): number {
    return this.x0 + (this.x1 - this.x0) * clamp(this.t / this.D);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    const d = this.x1 >= this.x0 ? 1 : -1, X = this.crest;
    (this.o.hits ?? []).forEach((h, i) => {
      if (!this.done_[i] && this.t >= 0 && d * (X - h.x) >= 0) {
        this.done_[i] = true;
        h.cb();
      }
    });
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const t = this.t, D = this.D, d = this.x1 >= this.x0 ? 1 : -1, u = t / D, X = this.crest;
    const crash = clamp((t - D) / 0.5), h0 = this.o.h ?? 40;
    // it rises out of the ground as it starts rolling, and falls as it crashes
    const Hm = h0 * (u < 0.35 ? 0.2 + 0.8 * ease(u / 0.35) : 1) * (1 - ease(crash));
    const L = h0 * 1.5, F = h0 * 0.36, yTop = Math.round(this.yTop), yBot = Math.round(this.yBot);
    const span = Math.max(1, yBot - yTop), yMid = (yTop + yBot) / 2;
    // its crest bends across the field (the near end ahead, rolling in a curve) and its height swells and dips along it
    const off = (y: number) => d * (((y - yMid) / span) * h0 * 0.55 - Math.pow((y - yMid) / span, 2) * h0 * 0.5) + Math.sin(y * 0.07 + t * 2.5) * 3;
    const rowH = (y: number) => Hm * (0.84 + 0.16 * Math.sin(y * 0.09 + t * 2));
    const height = (sd: number, H: number) => (sd <= 0 ? H * Math.pow(Math.max(0, 1 + sd / L), 1.5) : H * Math.sqrt(Math.max(0, 1 - sd / F)));
    if (Hm > 1) {
      // row by row, far to near: each row of the wall's top (a band, so the rows join up), the nearest one side-on
      for (let yr = yTop; yr <= yBot; yr++) {
        const H = rowH(yr), Xr = X + off(yr), start = this.x0 + off(yr), last = yr === yBot;
        for (let sd = -L; sd <= F; sd++) {
          const x = Math.round(Xr + d * sd);
          if (d * (x - start) < 0) continue; // (it grows out of the ground where it started)
          const hc = height(sd, H);
          if (hc < 0.8) continue;
          const back = sd < 0 ? -sd / L : 0, yt = Math.round(yr - hc), band = last ? yr - yt : 2;
          const fade = (1 - clamp((back - 0.6) / 0.4)) * (1 - crash * 0.6);
          for (let k = 0; k <= band; k++) {
            const y = yt + k, ridge = Math.sin(x * 0.45 + y * 0.22 - t * 14 * d) + 0.6 * Math.sin(x * 0.17 - y * 0.6 + t * 5);
            let c: RGB;
            if (last) {
              // the near end side-on: deep inside, lighter as it rises, white along its top and where it meets the ground
              const hy = (yr - y) / Math.max(1, hc);
              c = y >= yr - 1 ? W[1] : k < 1.5 ? W[0] : sd > 0 ? (hy > 0.7 ? W[3] : W[4]) : hy > 0.75 ? W[2] : ridge > 1.1 ? W[2] : hy < 0.35 ? W[5] : W[4];
            } else if (sd > 0) c = ridge > 1.15 ? W[1] : sd < 2 ? W[2] : W[4]; // its steep dark face, foam running down it
            else if (sd > -2.5) c = W[0]; // the crest's line of foam
            else c = ridge > 1.25 ? W[1] : back < 0.25 ? W[2] : back < 0.6 ? W[3] : W[4]; // its back slope
            if (fade >= 1 || keep(x, y, fade)) s.px(x, y, c);
          }
        }
        // the lip curling forward over the face along the crest
        const lip = 1.5 + Math.sin(yr * 0.7 + t * 12);
        for (let k = 0; k < lip; k++) {
          const Xp = Math.round(Xr + d * (1 + k)), Yp = Math.round(yr - H + k * 0.6);
          if (keep(Xp, Yp, 0.9 * (1 - crash))) s.px(Xp, Yp, k < 1 ? W[0] : W[1]);
        }
      }
      // the curl at the near end, a tube of white foam
      const Hn = rowH(yBot), cx = X + off(yBot) + d * F * 0.4, cy = yBot - Hn * 0.8, rr = Hn * 0.3;
      for (let th = 0; th <= Math.PI * 0.9; th += 0.035) {
        const px = cx + d * rr * Math.sin(th), py = cy - rr * Math.cos(th) + rr * 0.15;
        for (let k = 0; k < 3; k++) {
          const Xp = Math.round(px - d * k * 0.5), Yp = Math.round(py + k * 0.7);
          if (keep(Xp, Yp, 1 - crash)) s.px(Xp, Yp, k === 0 ? W[0] : k === 1 ? W[1] : W[2]);
        }
      }
      // spray flying off the crest
      for (let i = 0; i < 30; i++) {
        const q = (t * 2.6 + hash(i, this.seed)) % 1, yy = yTop + span * hash(i, this.seed, 1);
        const Xs = Math.round(X + off(yy) + d * (F * 0.3 + q * h0 * 0.6)), Ys = Math.round(yy - rowH(yy) - 3 - 12 * q + 30 * q * q);
        if (keep(Xs, Ys, (1 - q) * (1 - crash))) s.px(Xs, Ys, q < 0.4 ? W[0] : W[2]);
      }
      s.glow(X, yMid - Hm * 0.5, h0 * 0.9, W[3], 0.08 * (1 - crash));
    }
    // the crash: water thrown up and forward, foam spilling out over the ground
    if (crash > 0) {
      for (let i = 0; i < 56; i++) {
        const yy = yTop + span * hash(i, this.seed, 4), ang = -Math.PI * (0.15 + 0.6 * hash(i, this.seed, 5)), v = h0 * (1.0 + 1.4 * hash(i, this.seed, 6));
        const Xs = Math.round(this.x1 + off(yy) + d * Math.cos(ang) * v * crash), Ys = Math.round(yy - h0 * 0.6 + Math.sin(ang) * v * crash + h0 * 3 * crash * crash);
        if (Ys > yy + 2) continue;
        if (keep(Xs, Ys, 1 - crash)) s.px(Xs, Ys, i % 3 ? W[1] : W[0]);
      }
      for (let i = 0; i < 90; i++) {
        const yy = yTop + span * hash(i, this.seed, 7), Xs = Math.round(this.x1 + off(yy) - d * h0 * 0.8 + d * hash(i, this.seed, 8) * h0 * (1 + crash * 1.4));
        if (keep(Xs, Math.round(yy), (1 - crash) * 0.8)) s.px(Xs, Math.round(yy), i % 4 ? W[1] : W[2]);
      }
    }
  }
}
