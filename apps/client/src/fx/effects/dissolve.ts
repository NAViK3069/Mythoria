import { mixRGB, type RGB, type Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep } from './vfx';
import type { Snap } from './shadow';

// A fighter falling in battle - hero or monster, the same for everyone: its own shape (MasterCharacter.snapshot, or
// the monster's frame) flares white in a cold blue light while specks of light gather on it, turns to a pale
// blue-grey statue as a ring opens on the ground, then crumbles from the head down - each pixel breaking off as a speck
// of blue / violet light that the wind carries up and away, twinkling, thinning out. Our own effect, drawn in our own
// pixels on fx/surface.ts.

/** The statue's stone (cold blue-grey), light to dark. */
const STONE: RGB[] = [0xeaf6ff, 0xbcd8ee, 0x8cb0d0, 0x6088ac, 0x3e5e80, 0x24384e];
/** The specks it breaks into. */
const SPECK: RGB[] = [0xffffff, 0xd4f2ff, 0x96d8ff, 0x5ab4f4, 0x3a86e0];
const VIOLET: RGB[] = [0xf0d8ff, 0xc89aff, 0x9a6af0];
const GLOW: RGB = 0x5ab8ff;

interface Px {
  /** Where it sits, round the feet. */
  x: number;
  y: number;
  own: RGB;
  lum: number;
  /** When it breaks off (seconds), and how it flies. */
  rel: number;
  vx: number;
  vy: number;
  life: number;
  h: number;
}

export class Dissolve implements Pop {
  private t = 0;
  private readonly px: Px[] = [];
  private readonly top: number;
  private readonly bottom: number;
  private readonly seed = Math.random() * 100;
  /** How long it takes, start to the last speck gone (seconds, at speed 1). */
  static readonly DUR = 3.4;
  /** When the body has gone to stone and starts to crumble. */
  static readonly CRUMBLE = 0.8;

  /**
   * At its feet (x, y); `wind` is the way the specks blow (1 right, -1 left) - away from the foe.
   */
  constructor(snap: Snap, private readonly x: number, private readonly y: number, private readonly wind: 1 | -1 = 1, private readonly speed = 1) {
    let y0 = Infinity, y1 = -Infinity;
    for (let yy = 0; yy < snap.h; yy++)
      for (let xx = 0; xx < snap.w; xx++)
        if (snap.pixels[yy * snap.w + xx]) (y0 = Math.min(y0, yy), y1 = Math.max(y1, yy));
    this.top = y0 + snap.y;
    this.bottom = y1 + snap.y;
    const span = Math.max(1, y1 - y0);
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = 0; xx < snap.w; xx++) {
        const c = snap.pixels[yy * snap.w + xx];
        if (!c) continue;
        const r = c & 0xff, g = (c >> 8) & 0xff, b = (c >> 16) & 0xff;
        const i = this.px.length, h = hash(i, this.seed);
        // the head goes first, the feet last - ragged, not a straight line
        const down = (yy - y0) / span;
        this.px.push({
          x: xx + snap.x,
          y: yy + snap.y,
          own: (r << 16) | (g << 8) | b,
          lum: (r * 0.3 + g * 0.55 + b * 0.15) / 255,
          rel: Dissolve.CRUMBLE + 1.0 * down + 0.25 * hash(i, this.seed, 1),
          vx: wind * (5 + 12 * hash(i, this.seed, 2)),
          vy: -(5 + 11 * hash(i, this.seed, 3)),
          life: 0.9 + 0.9 * hash(i, this.seed, 4),
          h,
        });
      }
  }

  get done(): boolean {
    return this.t >= Dissolve.DUR;
  }

  update(dt: number): void {
    this.t += dt * this.speed;
  }

  draw(s: Surface): void {
    const t = this.t, X0 = this.x, Y0 = this.y, mid = (this.top + this.bottom) / 2, tall = this.bottom - this.top;
    // the flare: white, in a cold blue light (strongest just before it turns to stone)
    const white = t < 0.22 ? ease(t / 0.22) : 1 - clamp((t - 0.22) / 0.3);
    const light = clamp(t / 0.14) * (1 - clamp((t - 0.45) / 0.7));
    if (light > 0) {
      s.glow(X0, Y0 + mid, tall * 1.1 + 8, GLOW, 0.85 * light, 1.25);
      s.glow(X0, Y0 + mid, tall * 0.5 + 4, 0xd8f4ff, 0.6 * light * white, 1.2);
    }
    // the ring opening on the ground (on the ground's oval - the view looks down)
    const rq = clamp((t - 0.15) / 0.8);
    if (rq > 0 && rq < 1) {
      const R = 6 + 18 * ease(rq), A = 1 - rq;
      for (let a = 0; a < Math.PI * 2; a += 0.6 / R) {
        const px = Math.round(X0 + Math.cos(a) * R), py = Math.round(Y0 + Math.sin(a) * R * 0.32);
        if (keep(px, py, A)) s.px(px, py, rq < 0.4 ? 0xd4f2ff : 0x6ac4ff);
        s.add(px, py, GLOW, 0.3 * A);
      }
    }
    // specks of light drawn in onto it first
    if (t < 0.4)
      for (let i = 0; i < 16; i++) {
        const q = clamp((t - hash(i, this.seed, 7) * 0.12) / 0.26);
        if (q <= 0 || q >= 1) continue;
        const a = hash(i, this.seed, 8) * Math.PI * 2, d = (22 + 10 * hash(i, this.seed, 9)) * (1 - ease(q));
        const px = Math.round(X0 + Math.cos(a) * d), py = Math.round(Y0 + mid + Math.sin(a) * d * 0.8);
        s.px(px, py, q > 0.7 ? 0xffffff : SPECK[1 + (i % 3)]);
        s.add(px, py, GLOW, 0.5);
      }
    // the body: its own colours going white, then stone; each pixel, once it breaks off, a speck on the wind
    const stone = clamp((t - 0.22) / 0.35);
    for (const p of this.px) {
      const tau = t - p.rel;
      if (tau < 0) {
        // still on it: stone (the darkest pixels stay the outline), lit at the edge that is about to go
        const st = p.lum < 0.12 ? 0x101a28 : STONE[clamp(Math.round((1 - p.lum) * 5.4 - 0.4), 0, 5)];
        let c = mixRGB(mixRGB(p.own, st, stone), 0xffffff, white);
        if (tau > -0.08) c = mixRGB(c, 0xd4f2ff, 1 + tau / 0.08);
        s.px(Math.round(X0 + p.x), Math.round(Y0 + p.y), c);
        continue;
      }
      if (tau > p.life || p.h > 0.8) continue; // (not every pixel flies off as a speck - most just go)
      const q = tau / p.life;
      // carried up and away, the wind picking up
      const fx = X0 + p.x + p.vx * tau + this.wind * 12 * tau * tau, fy = Y0 + p.y + p.vy * tau - 6 * tau * tau + Math.sin(tau * 9 + p.h * 20) * 1.2;
      const px = Math.round(fx), py = Math.round(fy);
      if (!keep(px, py, 1 - q * q * q)) continue;
      const twinkle = Math.sin(tau * 22 + p.h * 40) > 0.6;
      const c = twinkle ? 0xffffff : p.h < 0.3 ? VIOLET[Math.min(2, 1 + Math.floor(q * 2))] : SPECK[Math.min(4, 2 + Math.floor(q * 3))];
      s.px(px, py, c);
      s.add(px, py, p.h < 0.3 ? 0x9a6af0 : GLOW, 0.45 * (1 - q));
    }
  }
}
