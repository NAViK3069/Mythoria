import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL, ph } from './vfx';

// Fire and stone for the fire-wolf warrior (Kael first), in our own pixels on fx/surface.ts: flames bursting up off a
// blow with a curl of white-hot light round their foot, a starburst that blows out in rays and a ring that breaks up into
// sparks, the ground split by a heavy slam (glowing cracks that cool, a gold flash and ring), and smoke billowing out
// along the ground and piling up, stones flung out of it. As ProjectZ draws its effects: crisp pixels in a palette,
// white-hot first, soft light added over them; anything lying on the ground lies on its oval (the view looks down).

const F = PAL.fire; // white .. near-black red
/** The smoke's greys (lit from the top left), light to dark - a touch of violet, like dusk. */
const SMOKE: RGB[] = [0xbab4c8, 0x8e88a4, 0x6a6482, 0x4a4562, 0x2e2a42];
/** The ground's scars. */
const CRACK: RGB = 0x24141a;
const ROCK: RGB[] = [0x8a7660, 0x5e4c3c, 0x3a2e26];

/**
 * Flames bursting up off a blow at (x, y) - its foot: spikes of fire fanning up and out toward the foe (white-hot at
 * their roots, red at their tips), shooting out and dying back to their tips; a curl of white-gold light wrapping
 * round their foot on the ground's oval; sparks flung off.
 */
export class FireBurst implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; dir?: 1 | -1; dur?: number; delay?: number; n?: number; spread?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.6);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 0.6, k = this.t / D, R = this.o.r ?? 26, d = this.o.dir ?? 1, n = this.o.n ?? 14, spread = this.o.spread ?? 2.3;
    // the heat's light
    s.glow(this.x, this.y - R * 0.35, R * 1.1, F[4], 0.55 * (1 - k), 1.1);
    if (k < 0.3) s.glow(this.x, this.y - R * 0.15, R * 0.5, F[1], 0.7 * (1 - k / 0.3));
    // the spikes: out fast, then the root follows the tip out and they're gone
    for (let i = 0; i < n; i++) {
      const h = hash(i, this.seed), a = -Math.PI / 2 + d * 0.35 + (h - 0.5) * spread + (hash(i, this.seed, 5) - 0.5) * 0.25;
      const L = R * (0.45 + 0.55 * hash(i, this.seed, 1)), w0 = 1.2 + 2.2 * hash(i, this.seed, 2);
      const lag = hash(i, this.seed, 3) * 0.12, q = clamp((k - lag) / (1 - lag));
      if (q <= 0) continue;
      const tip = L * ease(q / 0.28), root = L * clamp((q - 0.25) / 0.6) ** 1.4;
      if (tip - root < 0.5) continue;
      const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, dark = Math.round(q * 2.2);
      for (let dd = root; dd <= tip; dd += 0.5) {
        const u = dd / L, half = w0 * (1 - u) * (q < 0.5 ? 1 : 1 - (q - 0.5));
        const idx = u < 0.14 ? 0 : u < 0.32 ? 1 : u < 0.5 ? 2 : u < 0.7 ? 3 : u < 0.86 ? 4 : 5;
        const c = F[Math.min(6, idx + dark)];
        for (let j = -Math.ceil(half); j <= Math.ceil(half); j++) {
          if (Math.abs(j) > half + 0.25) continue;
          const X = Math.round(this.x + ux * dd + nx * j), Y = Math.round(this.y + uy * dd + ny * j);
          s.px(X, Y, Math.abs(j) > half - 0.6 && idx < 3 ? F[Math.min(6, idx + 1 + dark)] : c);
        }
      }
    }
    // the curl of white-gold light round their foot (on the ground's oval): it wraps round from the back, across the
    // front, and up the far side - then fades from its tail
    const rx = R * 0.6, ry = rx * 0.34, a0 = Math.PI * 1.05 * (d > 0 ? 1 : -1), sweep = Math.PI * 1.55;
    const head = ease(k / 0.3), tail = clamp((k - 0.28) / 0.55);
    for (let u = tail; u <= head; u += 0.006) {
      const ang = d > 0 ? a0 - u * sweep : a0 + u * sweep;
      const thick = 3.2 * Math.sin(Math.PI * clamp((u - tail) / Math.max(0.01, head - tail))) * (1 - tail);
      const cx = this.x + Math.cos(ang) * rx * (1 + u * 0.25), cy = this.y + 1 + Math.sin(ang) * ry * (1 + u * 0.25) - u * u * R * 0.35;
      for (let j = 0; j <= thick; j += 0.7) {
        const X = Math.round(cx), Y = Math.round(cy - j);
        const r = j / Math.max(0.5, thick);
        s.px(X, Y, r < 0.4 ? F[0] : r < 0.75 ? F[1] : F[2]);
        s.add(X, Y, F[2], 0.25);
      }
    }
    // sparks flung off
    for (let i = 0; i < 10; i++) {
      const h = hash(i, this.seed, 9), a = -Math.PI / 2 + (h - 0.5) * 2.6 + d * 0.3, v = R * (1.4 + 1.4 * hash(i, this.seed, 10));
      const tt = this.t * 0.9, X = Math.round(this.x + Math.cos(a) * v * tt), Y = Math.round(this.y - R * 0.2 + Math.sin(a) * v * tt + 90 * tt * tt);
      if (keep(X, Y, 1 - k)) s.px(X, Y, i % 3 ? F[2] : F[1]);
    }
  }
}

/**
 * A starburst at (x, y), r across: a white star flashes with a long gold glint through it, rays of gold and red blow
 * out, a ring of gold races out and breaks apart into dashes, and sparks fall away.
 */
export class StarBurst implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; dur?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.85);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 0.85, k = this.t / D, R = this.o.r ?? 18, X0 = this.x, Y0 = this.y;
    s.glow(X0, Y0, R * 1.5, F[3], 0.6 * (1 - clamp(k / 0.6)));
    // the star and the glint through it
    if (k < 0.32) {
      const q = 1 - k / 0.32, L = R * 0.9 * q + 2;
      for (let i = -L; i <= L; i++) {
        const fade = 1 - Math.abs(i) / (L + 1);
        if (keep(X0 + i, Y0, fade + 0.2)) s.px(Math.round(X0 + i), Math.round(Y0), fade > 0.5 ? F[0] : F[1]);
        if (Math.abs(i) < L * 0.7 && keep(X0, Y0 + i, fade + 0.2)) s.px(Math.round(X0), Math.round(Y0 + i), fade > 0.5 ? F[0] : F[1]);
      }
      s.glow(X0, Y0, 6, 0xffffff, 0.8 * q);
    }
    if (k < 0.5) {
      const q = 1 - k / 0.5, G = R * 1.8;
      for (let i = -G; i <= G; i++) {
        const f = 1 - Math.abs(i) / G;
        if (keep(Math.round(X0 + i), Math.round(Y0), f * q * 1.3)) s.px(Math.round(X0 + i), Math.round(Y0), f > 0.6 ? F[1] : F[2]);
      }
    }
    // rays blowing out
    if (k > 0.04 && k < 0.5) {
      const q = (k - 0.04) / 0.46;
      for (let i = 0; i < 9; i++) {
        const a = hash(i, this.seed) * Math.PI * 2, r0 = R * (0.2 + 0.7 * ease(q)), r1 = r0 + R * 0.5 * (1 - q);
        for (let r = r0; r <= r1; r += 0.6) {
          const X = Math.round(X0 + Math.cos(a) * r), Y = Math.round(Y0 + Math.sin(a) * r);
          s.px(X, Y, i % 2 ? F[4] : F[2]);
        }
      }
    }
    // the ring: out, then broken into dashes that drift on and fade
    const Rr = R * (ease(k / 0.45) * 0.9 + 0.35 * clamp((k - 0.45) / 0.55));
    if (k > 0.08) {
      const fade = 1 - clamp((k - 0.5) / 0.5), broken = clamp((k - 0.3) / 0.5);
      for (let a = 0; a < Math.PI * 2; a += 0.7 / Math.max(4, Rr)) {
        const seg = Math.floor(a * 3.2);
        if (hash(seg, this.seed, 4) < broken * 1.1) continue;
        const X = Math.round(X0 + Math.cos(a) * Rr), Y = Math.round(Y0 + Math.sin(a) * Rr);
        if (!keep(X, Y, fade)) continue;
        s.px(X, Y, k < 0.35 ? F[1] : hash(seg, this.seed, 5) > 0.5 ? F[2] : F[4]);
        if (k < 0.4) s.px(Math.round(X0 + Math.cos(a) * (Rr - 1)), Math.round(Y0 + Math.sin(a) * (Rr - 1)), F[3]);
      }
    }
    // sparks falling away
    for (let i = 0; i < 16; i++) {
      const a = hash(i, this.seed, 6) * Math.PI * 2, v = R * (1.2 + 1.6 * hash(i, this.seed, 7)), tt = this.t;
      const sx = Math.cos(a) * v * tt, sy = Math.sin(a) * v * tt * 0.8 + 50 * tt * tt;
      const X = Math.round(X0 + sx), Y = Math.round(Y0 + sy), f = 1 - clamp((k - 0.2) / 0.8);
      if (!keep(X, Y, f)) continue;
      s.px(X, Y, i % 3 === 0 ? F[1] : i % 3 === 1 ? F[3] : F[4]);
      if (k < 0.6) s.px(Math.round(X0 + sx * 0.9), Math.round(Y0 + sy * 0.9), F[4]);
    }
  }
}

/**
 * The ground split by a heavy slam at (x, y), w across (draw it on the ground layer): a gold flash along the ground and a
 * gold ring racing out on its oval, then jagged cracks shooting out from the middle - glowing like lava, cooling to dark
 * scars, fading.
 */
export class GroundCracks implements Pop {
  private t: number;
  private readonly cracks: { x: number; y: number }[][] = [];
  constructor(private readonly x: number, private readonly y: number, private readonly o: { w?: number; dur?: number; delay?: number; n?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    const W = o.w ?? 40, n = o.n ?? 8, seed = Math.random() * 100;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + (hash(i, seed) - 0.5) * 0.6, L = W * (0.45 + 0.55 * hash(i, seed, 1));
      const path = [{ x: 0, y: 0 }];
      let a = a0, px = 0, py = 0;
      for (let d = 0; d < L; d += 3) {
        a += (hash(i * 31 + d, seed, 2) - 0.5) * 0.9;
        px += Math.cos(a) * 3;
        py += Math.sin(a) * 3 * 0.34;
        path.push({ x: px, y: py });
        // a branch off it, once
        if (d > L * 0.35 && d < L * 0.35 + 3 && hash(i, seed, 3) > 0.35) {
          const b = [{ x: px, y: py }];
          let ba = a + (hash(i, seed, 4) > 0.5 ? 0.8 : -0.8), bx = px, by = py;
          for (let e = 0; e < L * 0.4; e += 3) {
            ba += (hash(i * 17 + e, seed, 5) - 0.5) * 0.8;
            bx += Math.cos(ba) * 3;
            by += Math.sin(ba) * 3 * 0.34;
            b.push({ x: bx, y: by });
          }
          this.cracks.push(b);
        }
      }
      this.cracks.push(path);
    }
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 2);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 2, k = this.t / D, W = this.o.w ?? 40, X0 = this.x, Y0 = this.y;
    // the gold flash along the ground, and the ring racing out
    if (k < 0.12) {
      const q = 1 - k / 0.12;
      s.glow(X0, Y0, W * 0.9, F[2], 0.7 * q, 0.3);
      for (let i = -W; i <= W; i++) {
        const f = 1 - Math.abs(i) / W;
        if (keep(X0 + i, Y0, f * q * 1.5)) s.px(Math.round(X0 + i), Math.round(Y0), f > 0.6 ? F[0] : F[1]);
      }
    }
    const rq = clamp(k / 0.22);
    if (rq < 1) {
      const R = W * 1.15 * ease(rq), f = 1 - rq;
      for (let a = 0; a < Math.PI * 2; a += 0.6 / Math.max(4, R)) {
        const X = Math.round(X0 + Math.cos(a) * R), Y = Math.round(Y0 + Math.sin(a) * R * 0.34);
        if (keep(X, Y, f)) s.px(X, Y, rq < 0.4 ? F[1] : F[2]);
        s.add(X, Y, F[3], 0.3 * f);
      }
    }
    // the cracks: out fast, glowing, cooling, gone
    const grow = ease(k / 0.1), hot = 1 - clamp((k - 0.05) / 0.45), fade = 1 - clamp((k - 0.6) / 0.4);
    for (const path of this.cracks) {
      const m = Math.max(1, Math.floor((path.length - 1) * grow));
      for (let i = 0; i < m; i++) {
        const p = path[i], q = path[i + 1], steps = 4;
        for (let j = 0; j < steps; j++) {
          const u = j / steps, X = Math.round(X0 + p.x + (q.x - p.x) * u), Y = Math.round(Y0 + p.y + (q.y - p.y) * u);
          if (!keep(X, Y, fade)) continue;
          const near = 1 - i / path.length;
          s.px(X, Y, hot > 0.15 ? F[Math.min(6, 2 + Math.round((1 - hot) * 3 + (1 - near) * 1.5))] : CRACK);
          if (hot > 0.2) s.add(X, Y, F[3], 0.5 * hot * near);
          // the scar's dark lip below it
          if (ph(X, Y + 1, 5) > 0.3) s.px(X, Y + 1, CRACK, 0.7 * fade);
        }
      }
    }
    if (hot > 0) s.glow(X0, Y0, W * 0.5, F[4], 0.35 * hot, 0.34);
  }
}

/**
 * Smoke billowing out of a slam at (x, y), w across: puffs rolling out along the ground's oval and a heap of them piling
 * up in the middle, lit from the top left and touched by the fire's glow at first; stones flung out of it; thinning away
 * slowly in dithered steps.
 */
export class SmokeBillow implements Pop {
  private t: number;
  private readonly puffs: { a: number; d: number; up: number; r0: number; r1: number; lag: number; h: number }[] = [];
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { w?: number; dur?: number; delay?: number; n?: number; heap?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    const W = o.w ?? 40, n = o.n ?? 16, heap = o.heap ?? 5, seed = this.seed;
    for (let i = 0; i < n; i++)
      this.puffs.push({
        a: (i / n) * Math.PI * 2 + (hash(i, seed) - 0.5) * 0.5,
        d: W * (0.45 + 0.55 * hash(i, seed, 1)),
        up: 2 + 4 * hash(i, seed, 2),
        r0: 1.5,
        r1: 3 + 4 * hash(i, seed, 3),
        lag: hash(i, seed, 4) * 0.08,
        h: hash(i, seed, 5),
      });
    // the heap in the middle: rising one over another
    for (let i = 0; i < heap; i++)
      this.puffs.push({ a: Math.PI * 1.5 + (hash(i, seed, 6) - 0.5) * 1.2, d: W * 0.12 * hash(i, seed, 7), up: W * (0.12 + 0.3 * (i / heap)), r0: 2, r1: 4 + 4 * hash(i, seed, 8), lag: 0.04 + i * 0.03, h: hash(i, seed, 9) });
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.8);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1.8, k = this.t / D, X0 = this.x, Y0 = this.y;
    const A = 0.95 * (1 - clamp((k - 0.45) / 0.55)), fire = 1 - clamp(k / 0.3);
    // far ones first
    const order = this.puffs.map((p, i) => ({ p, i, y: Math.sin(p.a) * p.d })).sort((a, b) => a.y - b.y);
    for (const { p } of order) {
      const q = clamp((k - p.lag) / 0.5);
      if (q <= 0) continue;
      const e = ease(q), d = p.d * e, bx = X0 + Math.cos(p.a) * d, by = Y0 + Math.sin(p.a) * d * 0.34 - p.up * e - k * 4 * p.h;
      const br = p.r0 + (p.r1 - p.r0) * ease(q * 1.2);
      for (let yy = Math.floor(by - br); yy <= Math.ceil(by + br); yy++)
        for (let xx = Math.floor(bx - br); xx <= Math.ceil(bx + br); xx++) {
          const dd = Math.hypot(xx - bx, yy - by) / br;
          if (dd > 1 || !keep(xx, yy, A * (1 - dd * dd * 0.5))) continue;
          const lit = -(xx - bx) * 0.35 - (yy - by) * 0.7;
          s.px(xx, yy, SMOKE[clamp(Math.round(2 - (lit / br) * 1.7 + dd), 0, 4)]);
          // the fire's glow under it at first
          if (fire > 0 && yy > by) s.add(xx, yy, F[3], 0.35 * fire);
        }
    }
    // stones flung out
    for (let i = 0; i < 9; i++) {
      const a = hash(i, this.seed, 11) * Math.PI * 2, v = 30 + 30 * hash(i, this.seed, 12), tt = Math.min(this.t, 0.55);
      const gx = Math.cos(a) * v * tt, gy = Math.sin(a) * v * tt * 0.34, hgt = Math.max(0, (50 + 40 * hash(i, this.seed, 13)) * tt - 160 * tt * tt);
      const X = Math.round(X0 + gx), Y = Math.round(Y0 + gy - hgt);
      if (!keep(X, Y, 1 - clamp((k - 0.5) / 0.5))) continue;
      s.px(X, Y, ROCK[1]);
      s.px(X + 1, Y, ROCK[2]);
      if (i % 2) s.px(X, Y - 1, ROCK[0]);
    }
  }
}
