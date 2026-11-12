import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL, ph, pixArc, type PalName } from './vfx';

// Light-element effects for the knights (Bram first), in our own pixels on fx/surface.ts - in the spirit of the
// owner's ProjectZ (src/arena/holyfx.js: Excalibur's column of light, the motes spiralling into the blade, the gold
// halos, the crescent behind the stroke). Crisp pixels in a palette, white-hot first; soft light added over them.

/** A grip to follow (MasterCharacter.grip): where the hand is and the way its blade points, on screen. */
export interface Grip {
  x: number;
  y: number;
  angle: number;
}

/**
 * The stroke behind a blade: sampled from the hand every frame while it swings, so it is exactly where the sword
 * went - a crescent from just past the guard to beyond the point, white along its outer edge, the colour inside,
 * thickest at its head, thinning and breaking up into specks as it ages. release() when the swing is done.
 */
export class BladeTrail implements Pop {
  private readonly samples: { t: number; x: number; y: number; a: number }[] = [];
  private now = 0;
  private live = true;
  /** o.shadow: a drop shadow under the stroke, this colour, a pixel down. */
  constructor(private readonly grip: Grip, private readonly o: { rIn: number; R: number; pal?: PalName; life?: number; shadow?: number }, private readonly speed = 1) {}
  release(): void {
    this.live = false;
  }
  get done(): boolean {
    const last = this.samples[this.samples.length - 1];
    return !this.live && (!last || this.now - last.t > (this.o.life ?? 0.3));
  }
  update(dt: number): void {
    this.now += dt * this.speed;
    if (this.live) {
      const prev = this.samples[this.samples.length - 1];
      let a = this.grip.angle;
      if (prev) while (a - prev.a > Math.PI) a -= Math.PI * 2;
      if (prev) while (a - prev.a < -Math.PI) a += Math.PI * 2;
      this.samples.push({ t: this.now, x: this.grip.x, y: this.grip.y, a });
    }
    const life = this.o.life ?? 0.3;
    while (this.samples.length > 2 && this.now - this.samples[0].t > life) this.samples.shift();
  }
  draw(s: Surface): void {
    const S = this.samples, life = this.o.life ?? 0.3, P = PAL[this.o.pal ?? 'holy'], R = this.o.R, rIn = this.o.rIn;
    if (S.length < 2) return;
    for (let i = 1; i < S.length; i++) {
      const p0 = S[i - 1], p1 = S[i], q = clamp((this.now - p1.t) / life);
      if (q >= 1) continue;
      const head = i / (S.length - 1); // 0 the oldest .. 1 the newest
      const w = (R - rIn) * Math.pow(1 - q, 1.1) * (0.35 + 0.65 * Math.sqrt(head));
      if (w < 0.6) continue;
      const steps = Math.max(1, Math.ceil(Math.abs(p1.a - p0.a) * R * 1.6));
      for (let j = 0; j <= steps; j++) {
        const f = j / steps, a = p0.a + (p1.a - p0.a) * f, cx = p0.x + (p1.x - p0.x) * f, cy = p0.y + (p1.y - p0.y) * f;
        const ux = Math.cos(a), uy = Math.sin(a);
        for (let r = R; r >= R - w; r -= 0.7) {
          const X = Math.round(cx + ux * r), Y = Math.round(cy + uy * r);
          // the drop shadow: a dark pixel just below, under everything the stroke paints after it
          if (this.o.shadow !== undefined && q < 0.6) s.px(X, Y + 1, this.o.shadow, 0.7);
          // old enough: only specks left
          if (q > 0.45 && ph(X, Y, 3) > (1 - q) * 1.7) continue;
          if (!keep(X, Y, 1 - q * q)) continue;
          const v = (R - r) / Math.max(1, w);
          const idx = clamp((v < 0.2 ? 0 : v < 0.45 ? 1 : v < 0.72 ? 2 : 3) + Math.round(q * 2), 0, 5);
          s.px(X, Y, P[idx]);
          if (v < 0.5) s.add(X, Y, P[2], 0.22 * (1 - q));
        }
      }
    }
    const n = S[S.length - 1];
    if (this.live) s.glow(n.x + Math.cos(n.a) * R * 0.8, n.y + Math.sin(n.a) * R * 0.8, 12, P[2], 0.4);
  }
}

/** A star of light on a blade's point (following the grip), growing with k(): 0..1. */
export class TipStar implements Pop {
  private t = 0;
  private gone = false;
  constructor(private readonly grip: Grip, private readonly len: number, private readonly k: () => number, private readonly pal: PalName = 'holy') {}
  end(): void {
    this.gone = true;
  }
  get done(): boolean {
    return this.gone;
  }
  update(dt: number): void {
    this.t += dt;
  }
  draw(s: Surface): void {
    const k = clamp(this.k()), P = PAL[this.pal];
    if (k <= 0) return;
    const x = Math.round(this.grip.x + Math.cos(this.grip.angle) * this.len), y = Math.round(this.grip.y + Math.sin(this.grip.angle) * this.len);
    const L = Math.round(2 + 8 * k * k + (k > 0.85 ? Math.sin(this.t * 40) * 1.5 : 0));
    s.glow(x + 0.5, y + 0.5, 8 + 22 * k, P[2], 0.25 + 0.5 * k);
    for (let i = -L; i <= L; i++) {
      const q = Math.abs(i) / L, c = q < 0.3 ? P[0] : q < 0.65 ? P[1] : P[3];
      s.px(x + i, y, c);
      s.px(x, y + i, c);
    }
    const d = Math.round(L * 0.4);
    for (let i = 1; i <= d; i++) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) s.px(x + a * i, y + b * i, P[2]);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s.px(x + i, y + j, P[0]);
  }
}

/**
 * A column of light let down from the sky onto (x, footY): opening out, its heart white, gold to its edges, flickering,
 * motes coming down it, a pool of light where it lands - then narrowing to a thread and gone.
 */
export class LightColumn implements Pop {
  private t = 0;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly footY: number, private readonly o: { w?: number; top?: number; dur?: number; pal?: PalName } = {}, private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.9);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const D = this.o.dur ?? 0.9, k = this.t / D, P = PAL[this.o.pal ?? 'holy'];
    const open = ease(k / 0.18), close = 1 - clamp((k - 0.55) / 0.45) ** 1.6;
    const W = (this.o.w ?? 8) * open * close;
    if (W < 0.5) return;
    const X = Math.round(this.x), top = Math.round(this.footY - (this.o.top ?? 200)), bot = Math.round(this.footY);
    const cw = Math.ceil(W);
    for (let dx = -cw; dx <= cw; dx++) {
      const edge = Math.abs(dx) / (W + 0.5);
      if (edge > 1) continue;
      const flick = 0.8 + 0.2 * Math.sin(this.t * 22 + dx * 1.7);
      const a = (1 - edge * edge) * flick;
      const c = edge < 0.3 ? P[0] : edge < 0.6 ? P[1] : P[2];
      for (let y = top; y <= bot; y++) {
        // the column fades out toward the sky
        const up = clamp((bot - y) / (bot - top));
        const A = a * (1 - up * 0.65);
        if (edge < 0.8 && keep(X + dx, y, A * (edge < 0.4 ? 1 : 0.75))) s.px(X + dx, y, c, edge < 0.4 ? 1 : 0.85);
        s.add(X + dx, y, P[edge < 0.5 ? 1 : 2], 0.6 * A);
      }
    }
    // motes coming down it
    for (let i = 0; i < 14; i++) {
      const f = (this.t * (1.4 + hash(i, this.seed)) + hash(i, this.seed, 2)) % 1;
      const mx = X + Math.round((hash(i, this.seed, 4) - 0.5) * W * 2.4), my = Math.round(top + f * (bot - top));
      s.px(mx, my, hash(i, 3) > 0.5 ? P[0] : P[1]);
      s.px(mx, my - 1, P[2], 0.7);
    }
    // the pool of light where it lands
    s.glow(X + 0.5, bot, 12 + W * 2.8, P[2], 0.8 * open * close, 0.32);
    s.glow(X + 0.5, (top + bot) / 2, W * 3, P[2], 0.25 * open * close, (bot - top) / (W * 6));
    pixArc(s, X, bot, W * 1.8 + 3, (W * 1.8 + 3) * 0.32, 0, Math.PI * 2, P[1], close, 0.4, 2);
  }
}

/**
 * Rings of light on the ground round (x, y): two of them turning their own ways, marks round the outer one, a ring
 * of dots - opening out, then fading. For a ground layer (under the fighters).
 */
export class HaloRings implements Pop {
  private t = 0;
  constructor(private readonly x: number, private readonly y: number, private readonly R: number, private readonly dur = 1.2, private readonly pal: PalName = 'holy', private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= this.dur;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const k = this.t / this.dur, P = PAL[this.pal], t = this.t;
    const open = ease(k / 0.25), A = 1 - clamp((k - 0.7) / 0.3);
    const RX = this.R * open, RY = RX * 0.3;
    if (RX < 1) return;
    s.glow(this.x, this.y, RX * 1.3, P[2], 0.6 * A, 0.3);
    for (let j = 0; j < 6; j++) {
      const a0 = t * 1.6 + (j * Math.PI) / 3;
      pixArc(s, this.x, this.y, RX, RY, a0, a0 + 0.75, P[0], A, 0.5, 2);
    }
    pixArc(s, this.x, this.y, RX * 0.72, RY * 0.72, -t * 2.2, -t * 2.2 + Math.PI * 1.6, P[2], A, 0.4, 2);
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * Math.PI * 2 - t * 1.4, X = Math.round(this.x + Math.cos(a) * RX * 0.86), Y = Math.round(this.y + Math.sin(a) * RY * 0.86);
      if (keep(X, Y, A)) s.px(X, Y, P[0]);
    }
  }
}

/**
 * Light rising off the ground all round (cx, cy) - spread wide - and drawn up in a spiral into (tx, ty) (a blade's
 * point): more of it as it goes on. tx/ty may be functions (a point that moves).
 */
export class MoteSpiral implements Pop {
  private t = 0;
  private readonly seed = Math.random() * 100;
  constructor(private readonly cx: number, private readonly cy: number, private readonly spread: number, private readonly to: () => { x: number; y: number }, private readonly dur = 1, private readonly pal: PalName = 'holy', private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= this.dur;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const k = this.t / this.dur, P = PAL[this.pal], T = this.to();
    const n = Math.round(14 + 40 * k), life = 0.7;
    for (let i = 0; i < n; i++) {
      const ph0 = ((this.t + hash(i, this.seed) * life) % life) / life, q = ph0 * ph0 * (3 - 2 * ph0);
      if (this.t < ph0 * life) continue;
      const sx = this.cx + (hash(i, this.seed, 1) - 0.5) * this.spread * 2, sy = this.cy - 1;
      const sp = (1 - q) * (6 + 8 * hash(i, 9)), ang = this.t * 7 + i;
      const X = Math.round(sx + (T.x - sx) * q + Math.cos(ang) * sp), Y = Math.round(sy + (T.y - sy) * q + Math.sin(ang) * sp * 0.35);
      const A = Math.min(1, ph0 * 4) * (1 - clamp((k - 0.9) / 0.1));
      if (!keep(X, Y, A)) continue;
      s.px(X, Y, ph0 > 0.85 ? P[0] : hash(i, 10) > 0.4 ? P[1] : P[0]);
      s.px(X, Y - 1, P[2]);
      s.add(X, Y, P[2], 0.5);
      if (hash(i, 11) > 0.6) s.px(X, Y + 1, P[3], 0.8);
    }
  }
}

/**
 * A shield of light over a fighter standing at (x, footY): a dome w across and h tall, drawn in hexagons, that builds
 * up from the ground (its rim racing up), shimmers with a band of light sweeping down it, then settles faint and fades.
 */
export class ShieldDome implements Pop {
  private t = 0;
  constructor(private readonly x: number, private readonly footY: number, private readonly w: number, private readonly h: number, private readonly o: { dur?: number; pal?: PalName; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.1);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1.1, k = this.t / D, P = PAL[this.o.pal ?? 'holy'];
    const build = ease(k / 0.3), A = 1 - clamp((k - 0.62) / 0.38);
    const RX = this.w / 2, RY = this.h, x0 = Math.round(this.x), y0 = Math.round(this.footY);
    // what has built up so far: from the ground to this height
    const reach = y0 - RY * build;
    const sweep = y0 - RY - 4 + ((this.t * 1.6) % 1.4) * (RY + 8);
    const SIZE = 4;
    for (let y = Math.floor(y0 - RY - 1); y <= y0; y++) {
      if (y < reach) continue;
      for (let x = Math.floor(x0 - RX - 1); x <= Math.ceil(x0 + RX + 1); x++) {
        const nx = (x + 0.5 - this.x) / RX, ny = (y0 - (y + 0.5)) / RY, d = nx * nx + ny * ny;
        if (d > 1.04) continue;
        const rim = d > 0.78;
        // the hexagons: pointy-top hex grid, a pixel on a cell's edge is drawn
        const hx = (x - x0) / SIZE, hy = (y - y0) / SIZE;
        const qf = (Math.sqrt(3) / 3) * hx - hy / 3, rf = (2 / 3) * hy;
        let q = Math.round(qf), r = Math.round(rf), sF = -qf - rf, sR = Math.round(sF);
        const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(sR - sF);
        if (dq > dr && dq > ds) q = -r - sR;
        else if (dr > ds) r = -q - sR;
        const edge = Math.max(Math.abs(qf - q), Math.abs(rf - r), Math.abs(-qf - rf - (-q - r)));
        const onEdge = edge > 0.38;
        const front = y >= reach && y < reach + 2 && build < 1;
        const band = Math.abs(y - sweep) < 2;
        let a = 0, c: RGB = P[2];
        if (front) (a = 1), (c = P[0]);
        else if (rim) (a = 1), (c = d > 0.93 ? P[0] : P[1]);
        else if (onEdge) (a = band ? 1 : 0.6), (c = band ? P[0] : P[2]);
        if (a > 0 && keep(x, y, a * A)) s.px(x, y, c);
        // a fill of light inside, brighter along the band
        s.add(x, y, P[2], (band ? 0.4 : 0.09) * A * (rim ? 1.5 : 1));
      }
    }
    // the base: a ring on the ground
    pixArc(s, x0, y0, RX + 1, (RX + 1) * 0.3, 0, Math.PI * 2, P[0], A * build, 0.5, 2);
    s.glow(this.x, y0 - RY * 0.45, RX * 1.6, P[2], 0.3 * A * build, RY / RX);
  }
}

/**
 * A magic circle on the ground at (x, y), radius R (flat, as if lying on it): a double ring with marks round it turning
 * one way, a six-pointed star and an inner ring turning the other, light at its heart - opening out, then fading.
 */
export class GroundSigil implements Pop {
  private t = 0;
  constructor(private readonly x: number, private readonly y: number, private readonly R: number, private readonly dur = 1.1, private readonly pal: PalName = 'holy', private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= this.dur;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const k = this.t / this.dur, P = PAL[this.pal], t = this.t, SQ = 0.36;
    const r = this.R * ease(k / 0.25), A = 1 - clamp((k - 0.68) / 0.32);
    if (r < 1) return;
    const X = this.x, Y = this.y;
    s.glow(X, Y, r * 1.4, P[2], 0.65 * A, SQ);
    pixArc(s, X, Y, r, r * SQ, 0, Math.PI * 2, P[0], A, 0.5, 2);
    pixArc(s, X, Y, r * 0.86, r * 0.86 * SQ, 0, Math.PI * 2, P[2], A, 0.3, 2);
    // marks round it, turning
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + t * 0.9, rr = r * 0.94, px = Math.round(X + Math.cos(a) * rr), py = Math.round(Y + Math.sin(a) * rr * SQ);
      if (!keep(px, py, A)) continue;
      s.px(px, py, i % 4 ? P[2] : P[0]);
      if (i % 4 === 0) s.px(px + 1, py, P[1]), s.px(px - 1, py, P[1]);
    }
    // the star: two triangles, turning the other way
    for (let tri = 0; tri < 2; tri++) {
      const pts = [0, 1, 2].map((j) => {
        const a = -t * 1.3 + tri * Math.PI + (j * Math.PI * 2) / 3;
        return [X + Math.cos(a) * r * 0.78, Y + Math.sin(a) * r * 0.78 * SQ];
      });
      for (let j = 0; j < 3; j++) {
        const [ax, ay] = pts[j], [bx, by] = pts[(j + 1) % 3], n = Math.ceil(Math.hypot(bx - ax, by - ay));
        for (let m = 0; m <= n; m++) {
          const px = Math.round(ax + ((bx - ax) * m) / n), py = Math.round(ay + ((by - ay) * m) / n);
          if (keep(px, py, A)) s.px(px, py, P[1]), s.px(px, py - 1, P[2]);
        }
      }
    }
    pixArc(s, X, Y, r * 0.42, r * 0.42 * SQ, t * 2, t * 2 + Math.PI * 1.5, P[1], A, 0.3);
    s.glow(X, Y, r * 0.35, P[0], 0.5 * A, SQ);
  }
}

/** Shafts of dawn light rising over a stretch of ground (x0..x1 across, y0..y1 deep): thin and bright, one after another. */
export class DawnRays implements Pop {
  private t = 0;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x0: number, private readonly x1: number, private readonly y0: number, private readonly y1: number, private readonly o: { n?: number; h?: number; dur?: number; pal?: PalName } = {}, private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.2);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const D = this.o.dur ?? 1.2, P = PAL[this.o.pal ?? 'holy'], n = this.o.n ?? 22, H = this.o.h ?? 70;
    for (let i = 0; i < n; i++) {
      const start = hash(i, this.seed) * D * 0.55, life = D * (0.35 + 0.25 * hash(i, this.seed, 1)), q = (this.t - start) / life;
      if (q <= 0 || q >= 1) continue;
      const X = Math.round(this.x0 + (this.x1 - this.x0) * hash(i, this.seed, 2)), foot = Math.round(this.y0 + (this.y1 - this.y0) * hash(i, this.seed, 3));
      const rise = ease(q / 0.4) * H * (0.6 + 0.4 * hash(i, this.seed, 4)), fade = 1 - clamp((q - 0.5) / 0.5);
      const wide = hash(i, this.seed, 5) > 0.45 ? 1 : 0;
      for (let y = 0; y < rise; y++) {
        const u = y / Math.max(1, rise), Y = foot - y, A = fade * (1 - u) ** 0.7;
        for (let dx = -wide; dx <= wide; dx++) {
          if (!keep(X + dx, Y, A)) continue;
          s.px(X + dx, Y, dx === 0 ? (u < 0.25 ? P[0] : u < 0.6 ? P[1] : P[2]) : P[2]);
        }
        s.add(X, Y, P[2], 0.5 * A);
      }
      s.glow(X + 0.5, foot, 9, P[2], 0.7 * fade, 0.35);
    }
  }
}
