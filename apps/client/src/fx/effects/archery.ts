import type * as Phaser from 'phaser';
import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL } from './vfx';

// The forest archer's effects (Fen first), in our own pixels on fx/surface.ts: arrows in flight (the arrow picture
// itself - assets/characters/heroes/weapons/arrow.png, the one on his bowstring - with a streak of wind and green light
// behind it), leaves bursting and fluttering down, thorny vines winding up round a foe and withering, a light gathering
// on the arrow as he draws, and a great tree of light branching out over the foes. Crisp pixels, a palette from white to
// deep green, soft light added over them; things on the ground lie on its oval.

/** How big the arrow picture is shown (as on the bowstring: tools/hero_parts.py ARROW_SHOW). */
export const ARROW_SCALE = 0.45;
/** From its nock to its point (world px, at ARROW_SCALE). */
export const ARROW_LEN = 37 * ARROW_SCALE;

const L = PAL.leaf; // white .. deep forest green
/** The autumn leaves among the green ones. */
const GOLD: RGB[] = [0xfff2a8, 0xf0c850, 0xc88a2a];

/** One leaf at (x, y): two or three pixels, turning as it flutters (phase), green or (now and then) gold. */
function leaf(s: Surface, x: number, y: number, phase: number, h: number, a = 1): void {
  const X = Math.round(x), Y = Math.round(y);
  if (!keep(X, Y, a)) return;
  const P = h > 0.8 ? GOLD : [L[2], L[3], L[4]];
  const turn = Math.floor(((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 2));
  s.px(X, Y, P[1]);
  if (turn === 0) s.px(X + 1, Y, P[0]), s.px(X - 1, Y + 1, P[2]);
  else if (turn === 1) s.px(X, Y - 1, P[0]), s.px(X + 1, Y + 1, P[2]);
  else if (turn === 2) s.px(X - 1, Y, P[2]), s.px(X + 1, Y - 1, P[0]);
  else s.px(X, Y + 1, P[2]);
}

/**
 * An arrow shot from (x0, y0) to (x1, y1) - fast: the arrow picture flying (straight, or on an arc `arc` px high - a
 * volley loosed up into the sky and falling), pointing along its path, a comet of green light round its head and a
 * streak of energy behind it that ripples like a wave, leaving little rings of light and sparkles that drift and fade a
 * moment after it's gone; onHit when it gets there. `power`: 0 a plain shot, 1 a skill's, 2 the great spirit arrow (a
 * brighter head, a thicker streak, more rings). `stick`: it stays where it struck a moment, then fades (in the ground).
 */
export class FlyingArrow implements Pop {
  private t: number;
  private img: Phaser.GameObjects.Image | null = null;
  /** Where it's been (sampled every px or two along its path) and when - the streak fades by age. */
  private readonly hist: { x: number; y: number; at: number; nx: number; ny: number }[] = [];
  private lastU = 0;
  private hit = false;
  private readonly seed = Math.random() * 100;
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x0: number,
    private readonly y0: number,
    private readonly x1: number,
    private readonly y1: number,
    private readonly o: { dur?: number; delay?: number; arc?: number; size?: number; power?: number; stick?: number; onHit?: () => void; leaves?: boolean } = {},
    private readonly speed = 1,
  ) {
    this.t = -(o.delay ?? 0);
  }
  private get D(): number {
    return this.o.dur ?? 0.1;
  }
  private get life(): number {
    return 0.16 + 0.08 * (this.o.power ?? 0);
  }
  get done(): boolean {
    const end = this.D + Math.max(this.o.stick ?? 0, this.life + 0.3);
    if (this.t >= end && this.img) {
      this.img.destroy();
      this.img = null;
    }
    return this.t >= end;
  }
  private at(u: number): { x: number; y: number } {
    const arc = this.o.arc ?? 0;
    return { x: this.x0 + (this.x1 - this.x0) * u, y: this.y0 + (this.y1 - this.y0) * u - arc * 4 * u * (1 - u) };
  }
  update(dt: number): void {
    this.t += dt * this.speed;
    if (this.t < 0) return;
    const u = Math.min(1, this.t / this.D);
    if (!this.img) {
      this.img = this.scene.add.image(this.x0, this.y0, 'heroes', 'arrow').setOrigin(38 / 42, 0.5).setScale(ARROW_SCALE * (this.o.size ?? 1)).setDepth(9501);
    }
    // the streak: every px or two it passed since the last frame (it goes a long way in one)
    const len = Math.hypot(this.x1 - this.x0, this.y1 - this.y0) + (this.o.arc ?? 0) * 2;
    const step = 1.5 / Math.max(1, len);
    for (let v = this.lastU; v < u; v += step) {
      const p = this.at(v), q = this.at(Math.min(1, v + 0.01)), l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      this.hist.push({ x: p.x, y: p.y, at: this.t - (u - v) * this.D, nx: -(q.y - p.y) / l, ny: (q.x - p.x) / l });
    }
    this.lastU = u;
    while (this.hist.length && this.t - this.hist[0].at > this.life) this.hist.shift();
    if (u < 1) {
      const p = this.at(u), q = this.at(Math.min(1, u + 0.02)), b = this.at(Math.max(0, u - 0.02));
      this.img.setPosition(p.x, p.y).setRotation(Math.atan2(q.y - b.y, q.x - b.x));
    } else {
      if (!this.hit) {
        this.hit = true;
        this.o.onHit?.();
        if (!this.o.stick) this.img.setVisible(false);
      }
      const stuck = this.t - this.D;
      if (this.o.stick) this.img.setAlpha(1 - clamp((stuck - this.o.stick) / 0.25));
    }
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const pw = this.o.power ?? 0, flying = this.t < this.D;
    const thick = pw >= 2 ? 3 : pw >= 1 ? 2 : 1;
    // the streak behind it: rippling, white-hot near the head, green, thinning, fading by age
    let i = 0;
    for (const h of this.hist) {
      const f = 1 - (this.t - h.at) / this.life;
      i++;
      if (f <= 0) continue;
      const wave = Math.sin(i * 0.45 - this.t * 30 + this.seed) * (0.6 + pw * 0.6) * (1 - f * 0.5);
      const x = h.x + h.nx * wave, y = h.y + h.ny * wave;
      const w = Math.max(0, thick * f - 0.2);
      for (let j = -Math.ceil(w / 2); j <= Math.ceil(w / 2); j++) {
        const X = Math.round(x + h.nx * j * 0.8), Y = Math.round(y + h.ny * j * 0.8);
        if (!keep(X, Y, f * 1.3)) continue;
        s.px(X, Y, f > 0.8 ? L[0] : f > 0.55 ? L[1] : f > 0.3 ? L[2] : L[3]);
      }
      if (pw && i % 3 === 0) s.add(Math.round(x), Math.round(y), L[2], 0.35 * f);
      // rings of light and sparkles left behind, drifting off it
      if (i % (pw >= 2 ? 5 : 8) === 4) {
        const age = this.t - h.at, side = hash(i, this.seed) > 0.5 ? 1 : -1, drift = age * (14 + 10 * hash(i, this.seed, 1));
        const rx = h.x + h.nx * side * drift, ry = h.y + h.ny * side * drift - age * 8;
        if (hash(i, this.seed, 2) > 0.6) {
          for (const [dx, dy] of RING)
            if (keep(Math.round(rx + dx), Math.round(ry + dy), f)) s.px(Math.round(rx + dx), Math.round(ry + dy), f > 0.5 ? L[1] : L[3]);
        } else if (keep(Math.round(rx), Math.round(ry), f)) s.px(Math.round(rx), Math.round(ry), Math.sin(age * 40 + i) > 0 ? L[0] : L[2]);
      }
    }
    // the comet round its head
    if (flying) {
      const p = this.at(this.t / this.D);
      s.glow(p.x, p.y, 6 + pw * 6, L[3], 0.45 + pw * 0.15);
      s.glow(p.x, p.y, 2.5 + pw * 2.5, L[0], 0.55 + pw * 0.1);
    }
    // leaves shed off it
    if (this.o.leaves)
      for (let n = 0; n < 8; n++) {
        const h = this.hist[Math.floor(hash(n, this.seed, 3) * this.hist.length)];
        if (!h) continue;
        const q = (this.t - h.at) / (this.life + 0.3);
        if (q >= 1) continue;
        leaf(s, h.x + (hash(n, this.seed, 4) - 0.5) * 10 * q, h.y + q * 12, q * 9 + n, hash(n, this.seed, 5), 1 - q);
      }
  }
}

/** A little ring of light (offsets round its middle). */
const RING = [[0, -2], [1, -1], [2, 0], [1, 1], [0, 2], [-1, 1], [-2, 0], [-1, -1]];

/**
 * A spirit of the forest at the point `at()` gives: a little ring of bright light in a green glow, a crescent leaf of
 * light swinging round it, specks drifting down under it - gathering on an arrow as it's drawn.
 */
export class LeafOrb implements Pop {
  private t: number;
  constructor(private readonly at: () => { x: number; y: number }, private readonly o: { dur?: number; delay?: number; r?: number } = {}, private readonly speed = 1) {
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
    const D = this.o.dur ?? 0.8, k = this.t / D, R = this.o.r ?? 3, p = this.at();
    const A = clamp(k / 0.15) * (1 - clamp((k - 0.85) / 0.15));
    s.glow(p.x, p.y, R * 4, L[3], 0.5 * A);
    s.glow(p.x, p.y, R * 1.6, L[1], 0.5 * A);
    // the ring
    for (let a = 0; a < Math.PI * 2; a += 0.5 / R) {
      const X = Math.round(p.x + Math.cos(a) * R), Y = Math.round(p.y + Math.sin(a) * R);
      if (keep(X, Y, A)) s.px(X, Y, a > Math.PI ? L[0] : L[1]);
    }
    if (keep(Math.round(p.x), Math.round(p.y), A)) s.px(Math.round(p.x), Math.round(p.y), L[2]);
    // the crescent leaf swinging round it: an arc of light, fat in its middle, tapering to points
    const spin = this.t * 9, Rr = R * 2.6;
    for (let u = 0; u <= 1; u += 0.04) {
      const a = spin + u * 2.2, w = Math.sin(Math.PI * u) * 1.6;
      for (let j = 0; j <= w; j += 0.7) {
        const X = Math.round(p.x + Math.cos(a) * (Rr + j)), Y = Math.round(p.y + Math.sin(a) * (Rr + j) * 0.7);
        if (keep(X, Y, A)) s.px(X, Y, u > 0.6 ? L[1] : u > 0.3 ? L[2] : L[3]);
      }
    }
    // specks drifting down under it
    for (let i = 0; i < 4; i++) {
      const q = (this.t * 1.4 + i / 4) % 1, X = Math.round(p.x + (i - 1.5) * 1.5), Y = Math.round(p.y + R + 2 + q * 6);
      if (keep(X, Y, A * (1 - q))) s.px(X, Y, L[3]);
    }
  }
}

/** Leaves bursting out from (x, y) and fluttering down - r across, n of them; a green flash at the heart. */
export class LeafBurst implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly o: { r?: number; n?: number; dur?: number; delay?: number; ground?: number } = {}, private readonly speed = 1) {
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
    const D = this.o.dur ?? 1, k = this.t / D, R = this.o.r ?? 18, n = this.o.n ?? 12, floor = this.o.ground ?? this.y + 14;
    if (k < 0.25) s.glow(this.x, this.y, R * 0.8, L[3], 0.6 * (1 - k / 0.25));
    for (let i = 0; i < n; i++) {
      const a = hash(i, this.seed) * Math.PI * 2, out = R * (0.4 + 0.6 * hash(i, this.seed, 1)) * ease(k / 0.35);
      const fall = Math.max(0, k - 0.25) * 24 * (0.6 + hash(i, this.seed, 2));
      const x = this.x + Math.cos(a) * out + Math.sin(this.t * 6 + i) * 2 * k, y = Math.min(floor, this.y + Math.sin(a) * out * 0.7 + fall);
      leaf(s, x, y, this.t * 9 + i * 1.7, hash(i, this.seed, 3), 1 - clamp((k - 0.6) / 0.4));
    }
  }
}

/** Wood (lit edge .. dark), its outline; dust. */
const WOOD: RGB[] = [0xe0bc78, 0xb48a50, 0x84582e, 0x56361c];
const WOOD_LINE: RGB = 0x1e1008;
const DUST: RGB[] = [0xc8b49a, 0x9a8670, 0x6e5e4c];

/**
 * Roots bursting out of the ground round a foe standing at (x, y), w across, h tall: a line of green light splits the
 * ground, thick roots of wood shoot up all round it and coil in over it (thorns on them), a yellow-green light swelling
 * in them as they hold it - then they burst apart in a green flash: chips of wood flung out to land round it, puffs of
 * dust rolling up, all fading.
 */
export class RootBurst implements Pop {
  private t: number;
  private readonly roots: { a: number; bend: number; hgt: number; w: number }[] = [];
  private readonly seed = Math.random() * 100;
  /** When it bursts (of its time). */
  static readonly BURST = 0.62;
  constructor(private readonly x: number, private readonly y: number, private readonly w: number, private readonly h: number, private readonly o: { dur?: number; delay?: number; n?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    const n = o.n ?? 5;
    // thick roots that spiral round it as they rise (each its own way round), their tips curling in over it
    for (let i = 0; i < n; i++)
      this.roots.push({ a: (i / n) * Math.PI * 2 + (hash(i, this.seed) - 0.5) * 0.5, bend: (i % 2 ? 1 : -1) * (1.8 + 1.2 * hash(i, this.seed, 1)), hgt: 0.75 + 0.3 * hash(i, this.seed, 2), w: 2 + hash(i, this.seed, 3) * 1.4 });
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.8);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  /** A root's spine at u (0 its foot on the ground .. 1 its tip, curled in over the foe). */
  private spine(r: { a: number; bend: number; hgt: number }, u: number): { x: number; y: number } {
    const R = this.w / 2 + 5, rr = R * (1 - u * 0.55) + Math.sin(u * Math.PI) * 2, a = r.a + r.bend * u;
    // up, slowing as it goes, the last of it curling over and down a little
    const up = this.h * r.hgt * Math.sin(u * Math.PI * 0.7);
    return { x: this.x + Math.cos(a) * rr, y: this.y + Math.sin(a) * rr * 0.34 - up };
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1.8, k = this.t / D, B = RootBurst.BURST;
    // the ground splitting: a line of green light along it
    if (k < 0.3) {
      const q = ease(k / 0.12), f = 1 - clamp((k - 0.15) / 0.15), W = this.w * 0.9 + 8;
      for (let i = -W * q; i <= W * q; i++) {
        const X = Math.round(this.x + i), Y = Math.round(this.y + Math.sin(i * 0.4) * 0.6);
        if (!keep(X, Y, f)) continue;
        s.px(X, Y, Math.abs(i) < W * 0.4 ? L[1] : L[3]);
        s.px(X, Y + 1, 0x1a3010, 0.8 * f);
      }
    }
    // the roots: up, coiling in; held, glowing; then gone in the burst
    if (k < B + 0.04) {
      const grow = ease((k - 0.08) / 0.3), glow = clamp((k - 0.3) / (B - 0.3));
      if (glow > 0) s.glow(this.x, this.y - this.h * 0.45, this.w * 0.8 + 10, 0xd8f070, 0.45 * glow);
      // far ones first, the near ones over them
      const order = this.roots.slice().sort((p, q) => Math.sin(p.a) - Math.sin(q.a));
      for (const r of order) {
        const steps = 40;
        for (let i = 0; i < steps * grow; i++) {
          const u = i / steps, p = this.spine(r, u), q = this.spine(r, Math.min(1, u + 0.03));
          const tl = Math.hypot(q.x - p.x, q.y - p.y) || 1, nx = -(q.y - p.y) / tl, ny = (q.x - p.x) / tl;
          const half = r.w * (1 - u * 0.75);
          for (let j = -Math.ceil(half) - 1; j <= Math.ceil(half) + 1; j++) {
            const X = Math.round(p.x + nx * j), Y = Math.round(p.y + ny * j);
            if (Math.abs(j) > half + 0.6) {
              s.px(X, Y, WOOD_LINE);
              continue;
            }
            const lit = (j / Math.max(0.5, half) + 1) / 2;
            // the light swelling in it runs along its middle (the wood still shows round it)
            const vein = glow > 0.3 && Math.abs(lit - 0.45) < 0.12 && Math.sin(u * 20 - this.t * 14) > -0.2;
            s.px(X, Y, vein ? (glow > 0.7 ? 0xf4ffb0 : 0xc8e870) : WOOD[Math.min(3, Math.floor(lit * 3.99))]);
          }
          // a thorn now and then
          if (i % 7 === 3) s.px(Math.round(p.x + nx * (half + 1.5)), Math.round(p.y + ny * (half + 1.5)), WOOD[0]);
        }
      }
    }
    // the burst: a green flash, chips of wood flung out to land round it, dust rolling up
    if (k >= B) {
      const q = (k - B) / (1 - B), tt = this.t - B * D;
      if (q < 0.2) {
        s.glow(this.x, this.y - this.h * 0.4, this.w + 14, L[2], 0.8 * (1 - q / 0.2));
        s.glow(this.x, this.y - this.h * 0.4, 8, L[0], 0.7 * (1 - q / 0.2));
      }
      for (let i = 0; i < 22; i++) {
        const a = hash(i, this.seed, 4) * Math.PI * 2, v = 30 + 40 * hash(i, this.seed, 5);
        const gx = Math.cos(a) * v * Math.min(tt, 0.45), gy = Math.sin(a) * v * Math.min(tt, 0.45) * 0.34;
        const up = this.h * 0.4 * hash(i, this.seed, 6), hgt = Math.max(0, up + 60 * hash(i, this.seed, 7) * tt - 200 * tt * tt);
        const X = Math.round(this.x + gx), Y = Math.round(this.y + gy - hgt), f = 1 - clamp((q - 0.6) / 0.4);
        if (!keep(X, Y, f)) continue;
        s.px(X, Y, WOOD[1 + (i % 3)]);
        s.px(X + 1, Y, WOOD_LINE);
        if (i % 2) s.px(X, Y - 1, WOOD[0]);
      }
      for (let i = 0; i < 7; i++) {
        const a = hash(i, this.seed, 8) * Math.PI * 2, d = (this.w / 2 + 4) * (0.3 + 0.7 * ease(q * 1.5));
        const bx = this.x + Math.cos(a) * d, by = this.y + Math.sin(a) * d * 0.34 - q * 10 - this.h * 0.15, br = 2.5 + 3 * hash(i, this.seed, 9) * ease(q * 2);
        const A = 0.85 * (1 - clamp((q - 0.3) / 0.7));
        for (let yy = Math.floor(by - br); yy <= Math.ceil(by + br); yy++)
          for (let xx = Math.floor(bx - br); xx <= Math.ceil(bx + br); xx++) {
            const dd = Math.hypot(xx - bx, yy - by) / br;
            if (dd > 1 || !keep(xx, yy, A * (1 - dd * dd * 0.5))) continue;
            s.px(xx, yy, DUST[clamp(Math.round(dd * 2 + ((yy - by) / br) * 0.6), 0, 2)]);
          }
      }
    }
  }
}

/** Light gathering on an arrow as the string is drawn: motes drawn in to the point `at()` gives, a growing green glow. */
export class ChargeGlow implements Pop {
  private t = 0;
  private readonly seed = Math.random() * 100;
  constructor(private readonly at: () => { x: number; y: number }, private readonly dur = 0.6, private readonly r = 10, private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= this.dur;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const k = this.t / this.dur, p = this.at();
    s.glow(p.x, p.y, this.r * (0.4 + 0.6 * k), L[3], 0.6 * k);
    s.glow(p.x, p.y, this.r * 0.35, L[0], 0.5 * k);
    for (let i = 0; i < 12; i++) {
      const q = ((this.t * 1.6 + hash(i, this.seed)) % 1);
      const a = hash(i, this.seed, 1) * Math.PI * 2, d = this.r * 2.2 * (1 - q);
      const X = Math.round(p.x + Math.cos(a) * d), Y = Math.round(p.y + Math.sin(a) * d * 0.8);
      if (keep(X, Y, q * k * 1.5)) s.px(X, Y, q > 0.7 ? L[0] : L[2]);
    }
  }
}

/**
 * A tree of light growing out of (x, y) over the foes: branches of green-gold light racing out to each of `to` (forking
 * on the way), a burst at each end, blossoms of light along them - then it all breaks into leaves and fades.
 */
export class TreeBloom implements Pop {
  private t: number;
  private readonly branches: { x: number; y: number }[][] = [];
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, to: { x: number; y: number }[], private readonly o: { dur?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    const seed = this.seed;
    const grow = (x0: number, y0: number, x1: number, y1: number, depth: number, id: number) => {
      const path = [{ x: x0, y: y0 }], n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6));
      for (let i = 1; i <= n; i++) {
        const u = i / n, wob = (hash(id * 13 + i, seed) - 0.5) * 8 * Math.sin(Math.PI * u);
        const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
        path.push({ x: x0 + dx * u - (dy / l) * wob, y: y0 + dy * u + (dx / l) * wob });
        if (depth < 2 && i === Math.round(n * 0.5) && hash(id, seed, depth) > 0.25) {
          const p = path[path.length - 1], a = Math.atan2(dy, dx) + (hash(id, seed, 5) > 0.5 ? 0.7 : -0.7), len = l * 0.35;
          grow(p.x, p.y, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len, depth + 1, id * 7 + 3);
        }
      }
      this.branches.push(path);
    };
    to.forEach((p, i) => grow(x, y, p.x, p.y, 0, i + 1));
    // and a few just for the crown
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (hash(i, seed, 9) - 0.5) * 2.4, len = 22 + 18 * hash(i, seed, 10);
      grow(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.8, 1, 100 + i);
    }
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.6);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1.6, k = this.t / D, grow = ease(k / 0.25), fade = 1 - clamp((k - 0.55) / 0.45);
    // (a modest light at its heart - the branches are what should read)
    s.glow(this.x, this.y, 18, L[3], 0.35 * fade);
    s.glow(this.x, this.y, 7, L[0], 0.45 * fade * (1 - k));
    for (const path of this.branches) {
      const m = (path.length - 1) * grow;
      for (let i = 0; i < m; i++) {
        const a = path[i], b = path[Math.min(path.length - 1, i + 1)], frac = Math.min(1, m - i);
        const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2 * frac);
        for (let j = 0; j <= n; j++) {
          const x = a.x + (b.x - a.x) * (j / Math.max(1, n)) * frac, y = a.y + (b.y - a.y) * (j / Math.max(1, n)) * frac;
          const X = Math.round(x), Y = Math.round(y);
          if (!keep(X, Y, fade)) continue;
          const near = 1 - i / path.length;
          s.px(X, Y, near > 0.75 ? L[0] : i % 4 === 0 ? GOLD[0] : L[1]);
          s.add(X, Y, L[3], 0.2 * fade);
          // a darker edge under it, so the branch stands out from the light round it
          s.px(X, Y + 1, near > 0.5 ? L[2] : L[3]);
          s.px(X, Y + 2, L[5], 0.6 * fade);
        }
        // a blossom of light at each joint, as it grows past
        if (i % 3 === 2 && i < m - 1) s.glow(path[i].x, path[i].y, 4, GOLD[1], 0.5 * fade);
      }
      // the tip: a burst where it ends
      if (grow >= 1) {
        const e = path[path.length - 1];
        s.glow(e.x, e.y, 8, L[2], 0.6 * fade);
      }
    }
    // breaking into leaves as it fades
    if (k > 0.45)
      for (let i = 0; i < 26; i++) {
        const path = this.branches[i % this.branches.length], p = path[Math.floor(hash(i, this.seed) * (path.length - 1))];
        const u = clamp((k - 0.45) / 0.55);
        leaf(s, p.x + Math.sin(this.t * 5 + i) * 3, p.y + u * 22 * (0.5 + hash(i, this.seed, 2)), this.t * 8 + i, hash(i, this.seed, 3), 1 - u);
      }
  }
}
