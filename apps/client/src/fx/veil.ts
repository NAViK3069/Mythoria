import { Surface, type RGB } from './surface';

// The warp's screen transition, our own: the "arcane veil".
//
//  1. Close: the night of the void creeps in from every edge of the screen towards the hero, behind a
//     ragged front of violet-blue light - runes flickering along it, sparks flaking off it and drifting
//     ahead. Behind the front: deep indigo, stars twinkling in it.
//  2. Cross: in the dark, stars stream outward past you as if you were flying through them, and a ring of
//     runes turns in the middle. (This is when the world moves to the far pad.)
//  3. Open: the ring of runes in the middle flares and becomes a gate: a great magic circle that swells
//     out from the hero to past the edges of the screen, the new place appearing inside it. Its rim is a
//     ragged front of light carrying runes; the void outside it comes apart into sparks blown outward.
//
// No white flash anywhere - it stays dark and calm on the eyes. Drawn at a low pixel resolution (its long
// side 320 px) on our own engine (fx/surface.ts) and stretched over the game, so its pixels match the art.
// The timings are the T table; the colours are the constants next to it.

const T = { CLOSE: 0.62, CROSS: 0.38, OPEN: 0.95 };
const VOID = 0x0b0820;
const VOID_EDGE = 0x1d1448;
const FRONT = [0x2b1a6e, 0x3a35b8, 0x45b8ff, 0x9ce9ff, 0xe2fbff];
const STAR = [0x6f7bd8, 0xb9c8ff, 0xffffff];
const GOLD = 0xffd36b;

const TAU = Math.PI * 2;
/** The fronts are worked out at this many angles each frame; each pixel looks its angle up. */
const BINS = 720;
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** A hash of two whole numbers to 0..1 (for the fixed star field). */
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: RGB;
}

export interface VeilHooks {
  /** The screen is fully covered: move the world now. */
  covered(): void;
  /** The veil starts to open. */
  opening(): void;
  /** All gone. */
  done(): void;
}

/** The arcane veil, drawn on a canvas laid over the game (under the HUD). */
export class WarpVeil {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private s!: Surface;
  private img!: ImageData;
  private W = 0;
  private H = 0;
  private t = 0;
  private running = false;
  private hooks: VeilHooks | null = null;
  private fired = { covered: false, opening: false };
  private focus = { x: 0.5, y: 0.5 };
  private sparks: Spark[] = [];
  private streaks: { a: number; d: number; v: number; c: RGB }[] = [];
  private phase = [0, 0, 0];
  /** Per pixel, worked out once per warp: distance from the focus, its angle's bin, its star (0 = none). */
  private dist = new Float32Array(0);
  private bin = new Uint16Array(0);
  private star = new Float32Array(0);
  /** The front (closing) or the gate's rim (opening) at each angle bin, this frame. */
  private edgeAt = new Float32Array(BINS);

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'warp-veil';
    this.ctx = this.canvas.getContext('2d')!;
    document.body.appendChild(this.canvas);
  }

  get active(): boolean {
    return this.running;
  }

  /** Start: the veil closes in on (fx, fy), the hero's place on screen (0..1 of its width / height). */
  play(fx: number, fy: number, hooks: VeilHooks): void {
    // the long side of the screen is 320 pixels of veil
    const vw = window.innerWidth, vh = window.innerHeight;
    const k = 320 / Math.max(vw, vh);
    this.W = Math.max(64, Math.round(vw * k));
    this.H = Math.max(64, Math.round(vh * k));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.s = new Surface(this.W, this.H, 0, 0);
    this.img = new ImageData(this.W, this.H);
    this.focus = { x: fx * this.W, y: fy * this.H };
    this.star = new Float32Array(this.W * this.H);
    for (let y = 0; y < this.H; y++)
      for (let x = 0; x < this.W; x++) {
        const h = hash(x, y);
        if (h < 0.007) this.star[y * this.W + x] = 1 + h * 3000;
      }
    this.measure();
    this.hooks = hooks;
    this.fired = { covered: false, opening: false };
    this.t = 0;
    this.sparks = [];
    this.streaks = [];
    this.phase = [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU];
    this.running = true;
    this.canvas.classList.add('on');
    this.draw();
  }

  update(dt: number): void {
    if (!this.running) return;
    this.t += Math.min(dt, 0.05);
    const t = this.t;
    const crossAt = T.CLOSE, openAt = T.CLOSE + T.CROSS, end = openAt + T.OPEN;
    if (t >= crossAt && !this.fired.covered) {
      this.fired.covered = true;
      this.hooks?.covered();
    }
    if (t >= openAt && !this.fired.opening) {
      this.fired.opening = true;
      this.hooks?.opening();
    }
    // sparks flaking off the front: drifting in ahead of it as it closes, blown out as the gate opens
    if (t < T.CLOSE) for (let i = 0; i < 6; i++) this.flake(1);
    else if (t > openAt && t < end - 0.15) for (let i = 0; i < 9; i++) this.flake(-1);
    // stars streaming past while it's dark
    if (t > T.CLOSE * 0.6 && t < openAt + 0.25) for (let i = 0; i < 3; i++) this.streaks.push({ a: Math.random() * TAU, d: 4 + Math.random() * 10, v: 40 + Math.random() * 80, c: Math.random() < 0.15 ? GOLD : STAR[Math.floor(Math.random() * 3)] });
    for (const s of this.streaks) {
      s.v *= 1 + dt * 2.6;
      s.d += s.v * dt;
    }
    const far = Math.hypot(this.W, this.H);
    this.streaks = this.streaks.filter((s) => s.d < far);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      p.vx *= Math.exp(-1.5 * dt);
      p.vy = p.vy * Math.exp(-1.5 * dt) + 20 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.draw();
    if (t >= end) {
      this.running = false;
      this.canvas.classList.remove('on');
      this.hooks?.done();
    }
  }

  /** How far the closing front is from the focus, at this angle (ragged, licking, turning). */
  private front(a: number): number {
    const u = clamp(this.t / T.CLOSE);
    const far = Math.hypot(Math.max(this.focus.x, this.W - this.focus.x), Math.max(this.focus.y, this.H - this.focus.y)) + 14;
    const r = far * (1 - u * u * (3 - 2 * u)) - 2;
    const [p1, p2, p3] = this.phase, t = this.t;
    return r + Math.sin(a * 7 + p1 + t * 2.3) * 4 + Math.sin(a * 13 + p2 - t * 3.1) * 2.5 + Math.sin(a * 29 + p3 + t * 6) * 1.2;
  }

  /** How far the opening gate's rim is from the focus, at this angle (swelling out, ragged, turning). */
  private gate(a: number): number {
    const u = clamp((this.t - T.CLOSE - T.CROSS) / T.OPEN);
    const far = Math.hypot(Math.max(this.focus.x, this.W - this.focus.x), Math.max(this.focus.y, this.H - this.focus.y)) + 30;
    // a quick first swell (the gate bursting open), then a long glide out past the corners
    const e = 1 - Math.pow(1 - u, 2.6);
    const [p1, p2, p3] = this.phase, t = this.t;
    return 22 + (far - 22) * e + Math.sin(a * 8 + p1 - t * 2.5) * 3.5 * e + Math.sin(a * 15 + p2 + t * 3.3) * 2 * e + Math.sin(a * 31 + p3 - t * 6) * 1;
  }

  /** dir 1: a spark off the closing front, drifting inward; -1: off the opening gate, blown outward. */
  private flake(dir: 1 | -1): void {
    const a = Math.random() * TAU;
    const r = dir > 0 ? this.front(a) : this.gate(a) + 2;
    if (r < 2) return;
    const x = this.focus.x + Math.cos(a) * r, y = this.focus.y + Math.sin(a) * r * 0.85;
    const sp = (10 + Math.random() * 30) * (dir > 0 ? 1 : 2);
    this.sparks.push({ x, y, vx: -Math.cos(a) * sp * dir, vy: -Math.sin(a) * sp * dir, life: 0.3 + Math.random() * 0.5, max: 0.8, c: Math.random() < 0.15 ? GOLD : FRONT[2 + Math.floor(Math.random() * 3)] });
  }

  private draw(): void {
    const { s, t } = this;
    s.clear();
    const openAt = T.CLOSE + T.CROSS;
    if (t < openAt) this.drawClosing();
    else this.drawOpening(t - openAt);
    // stars streaming outward from the middle while it's dark
    for (const st of this.streaks) {
      const ca = Math.cos(st.a), sa = Math.sin(st.a), len = Math.min(18, st.v * 0.05);
      const x0 = this.focus.x + ca * st.d, y0 = this.focus.y + sa * st.d * 0.85;
      const fade = t < openAt ? 1 : 1 - clamp((t - openAt) / 0.25);
      if (!this.covered(x0, y0) || (t > openAt && st.d < this.edgeAt[Math.min(BINS - 1, Math.floor((((st.a > Math.PI ? st.a - TAU : st.a) + Math.PI) / TAU) * BINS))])) continue;
      s.line(x0, y0, x0 - ca * len, y0 - sa * len * 0.85, (u) => (u < 0.2 ? st.c : STAR[0]), (u) => (1 - u) * 0.9 * fade);
    }
    for (const p of this.sparks) {
      const k = p.life / p.max;
      s.px(p.x, p.y, p.c, Math.min(1, k * 2));
      s.add(p.x, p.y, FRONT[2], 0.4 * k);
    }
    s.write(this.img.data);
    this.ctx.putImageData(this.img, 0, 0);
  }

  /** Hand what happens next (when it opens, when it's done) to someone else - a scene started on another map. */
  rebind(hooks: VeilHooks): void {
    this.hooks = hooks;
  }

  /** Move the middle of the veil (where it opens) to the hero's new place on screen. */
  refocus(fx: number, fy: number): void {
    this.focus = { x: fx * this.W, y: fy * this.H };
    this.measure();
  }

  /** Each pixel's distance from the focus and the bin of its angle (once per focus, not every frame). */
  private measure(): void {
    const { W, H } = this, n = W * H;
    if (this.dist.length !== n) {
      this.dist = new Float32Array(n);
      this.bin = new Uint16Array(n);
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - this.focus.x, dy = (y + 0.5 - this.focus.y) / 0.85;
        const i = y * W + x;
        this.dist[i] = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        this.bin[i] = Math.min(BINS - 1, Math.floor(((a + Math.PI) / TAU) * BINS));
      }
  }

  /** Fill the edge table with fn(angle) at every bin. */
  private table(fn: (a: number) => number): void {
    for (let b = 0; b < BINS; b++) this.edgeAt[b] = fn(((b + 0.5) / BINS) * TAU - Math.PI);
  }

  /** The void at pixel i: deep indigo, lighter near the front, its stars twinkling. */
  private voidI(i: number, edge: number): RGB {
    const st = this.star[i];
    if (st) {
      const tw = 0.5 + 0.5 * Math.sin(this.t * 9 + st);
      return tw > 0.75 ? STAR[2] : tw > 0.35 ? STAR[1] : STAR[0];
    }
    return edge < 10 ? (edge < 4 ? VOID_EDGE : 0x140e34) : VOID;
  }

  /** Sweep every pixel against the edge table: void past it (lit along it), light thrown ahead of it. */
  private sweep(ahead: number, aheadK: number): void {
    const s = this.s, n = this.W * this.H, dist = this.dist, bin = this.bin, edgeAt = this.edgeAt;
    for (let i = 0; i < n; i++) {
      const edge = dist[i] - edgeAt[bin[i]];
      if (edge > 0) {
        s.pxi(i, edge < 1.5 ? FRONT[4] : edge < 3 ? FRONT[3] : edge < 5 ? FRONT[2] : this.voidI(i, edge));
        if (edge < 6) s.addi(i, FRONT[2], 0.5 * (1 - edge / 6));
      } else if (edge > -ahead) {
        s.addi(i, FRONT[1], aheadK * (1 + edge / ahead));
      }
    }
  }

  /** Is (x, y) behind the closing front (in the dark)? */
  private covered(x: number, y: number): boolean {
    if (this.t >= T.CLOSE) return true;
    const dx = x - this.focus.x, dy = (y - this.focus.y) / 0.85;
    return Math.hypot(dx, dy) > this.front(Math.atan2(dy, dx));
  }

  private drawClosing(): void {
    const { W, H, t } = this;
    const fx = this.focus.x, fy = this.focus.y;
    this.table((a) => this.front(a));
    // the void behind the front, and light thrown ahead of it onto the world
    this.sweep(10, 0.35);
    // runes riding the front, flickering
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + t * 0.4;
      const r = this.front(a) + 7;
      const x = fx + Math.cos(a) * r, y = fy + Math.sin(a) * r * 0.85;
      if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
      const on = 0.5 + 0.5 * Math.sin(t * 14 + i * 2.1);
      this.glyph(x, y, i, on);
    }
    // the rune ring in the middle once it's dark
    const ring = smooth(T.CLOSE * 0.85, T.CLOSE + 0.15, t);
    if (ring > 0) this.ringOfRunes(ring, t);
  }

  /**
   * The gate opening: inside its rim the new place shows; the rim is a band of light with runes riding it
   * and a second ring of ticks just outside; past it the void lingers, lit along the edge, until the rim has
   * swept past the corners.
   */
  private drawOpening(u: number): void {
    const { s, W, H } = this;
    const t = this.t;
    const fx = this.focus.x, fy = this.focus.y;
    this.table((a) => this.gate(a));
    // the void outside the rim, and light spilling in over the new place just inside it
    this.sweep(12, 0.4);
    // the gate's rim: runes riding it, turning, and a ring of ticks round its outside
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU - t * 0.6;
      const r = this.gate(a);
      const gx = fx + Math.cos(a) * (r - 5), gy = fy + Math.sin(a) * (r - 5) * 0.85;
      if (gx > -4 && gy > -4 && gx < W + 4 && gy < H + 4) this.glyph(gx, gy, i, 0.6 + 0.4 * Math.sin(t * 12 + i * 1.7));
      const tx = fx + Math.cos(a + 0.087) * (r + 9), ty = fy + Math.sin(a + 0.087) * (r + 9) * 0.85;
      s.px(tx, ty, FRONT[3], 0.8);
      s.px(tx + Math.cos(a), ty + Math.sin(a) * 0.85, FRONT[2], 0.6);
    }
    // the ring of runes flares as the gate bursts open, and is carried out with it
    const flare = Math.exp(-u * 7);
    if (flare > 0.03) this.ringOfRunes(1.5 * flare, t, 26 + (this.gate(0) - 26) * 0.5);
    // a soft wave of blue light running out ahead of the rim
    const w = u / 0.7;
    if (w < 1) {
      const r = this.gate(0) + 6 + w * 40;
      for (let g = 0; g < TAU; g += 1 / r) s.add(fx + Math.cos(g) * r, fy + Math.sin(g) * r * 0.85, FRONT[2], 0.45 * (1 - w));
    }
  }

  /** A turning ring of runes round the focus: the gate the hero passes through. */
  private ringOfRunes(k: number, t: number, R = 26): void {
    const { s } = this;
    const n = Math.ceil(R * 5);
    for (let i = 0; i < n; i++) {
      const g = (i / n) * TAU;
      const x = this.focus.x + Math.cos(g) * R, y = this.focus.y + Math.sin(g) * R * 0.85;
      const chase = Math.cos(g - t * 4);
      s.px(x, y, chase > 0.85 ? FRONT[4] : FRONT[2], Math.min(1, k) * (0.6 + 0.4 * chase));
      if (chase > 0.85) s.add(x, y, FRONT[3], 0.5 * k);
    }
    for (let i = 0; i < 10; i++) {
      const g = (i / 10) * TAU - t * 1.3;
      this.glyph(this.focus.x + Math.cos(g) * (R - 6), this.focus.y + Math.sin(g) * (R - 6) * 0.85, i, Math.min(1, k));
    }
    s.glow(this.focus.x, this.focus.y, R * 1.3, FRONT[1], 0.25 * k, 0.85);
  }

  /** A small rune glyph (one of a few shapes) at (x, y). */
  private glyph(x: number, y: number, i: number, k: number): void {
    const shapes = [
      [[0, -1], [0, 0], [0, 1], [-1, -1], [1, 1]],
      [[-1, 0], [0, 0], [1, 0], [0, -1]],
      [[-1, -1], [1, -1], [0, 0], [0, 1]],
      [[0, -1], [-1, 0], [1, 0], [0, 1]],
      [[-1, 1], [0, 0], [1, -1], [1, 1]],
    ];
    for (const [dx, dy] of shapes[i % shapes.length]) this.s.px(x + dx, y + dy, k > 0.7 ? FRONT[4] : FRONT[3], k);
    this.s.add(x, y, FRONT[2], 0.6 * k);
  }
}
