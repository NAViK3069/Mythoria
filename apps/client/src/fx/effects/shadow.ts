import { mixRGB, type RGB, type Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL, ph, type PalName } from './vfx';

// Dark-element effects for the assassins (Nyx first), in our own pixels on fx/surface.ts - the hero's own shape
// (MasterCharacter.snapshot) flaring white in a violet glow and squeezed into a sliver as it goes into the shadows,
// ghosts left behind a dash, straight cuts like a blade's flash, billows of dark smoke. As the owner's ProjectZ draws
// its effects: crisp pixels in a palette, white-hot first, soft light added over them.

/** A hero as pixels round its feet (MasterCharacter.snapshot: colour 0xAABBGGRR, 0 = empty). */
export interface Snap {
  pixels: Uint32Array;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** Its bounds (where pixels are), so a shape can be squeezed round its middle. */
function bounds(s: Snap): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = s.w, x1 = -1, y0 = s.h, y1 = -1;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.pixels[y * s.w + x]) (x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y));
  return { x0, x1, y0, y1 };
}

/**
 * The hero going into the shadows (out = true) or coming out of them, at its feet (x, y): its shape flares white in a
 * violet glow, sparks and slivers flying off it - and is squeezed into an upright sliver of light that thins to nothing
 * (or the other way round, the sliver opening out into the shape, which then fades as the hero shows again).
 */
export class ShadowSilhouette implements Pop {
  private t = 0;
  private readonly b: ReturnType<typeof bounds>;
  private readonly seed = Math.random() * 100;
  constructor(private readonly snap: Snap, private readonly x: number, private readonly y: number, private readonly out: boolean, private readonly o: { dur?: number; pal?: PalName; flip?: 1 | -1 } = {}, private readonly speed = 1) {
    this.b = bounds(snap);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.42);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const D = this.o.dur ?? 0.42, k0 = clamp(this.t / D), k = this.out ? k0 : 1 - k0, P = PAL[this.o.pal ?? 'violet'];
    const { x0, x1, y0, y1 } = this.b, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // squeezed sideways into a sliver, a touch taller as it goes
    const sx = Math.max(0.04, 1 - ease(k / 0.75)), sy = 1 + 0.25 * ease(k);
    const white = clamp(k * 3), fade = this.out ? 1 - clamp((k0 - 0.8) / 0.2) : clamp(k0 / 0.25) * (1 - clamp((k0 - 0.75) / 0.25));
    const flip = this.o.flip ?? 1;
    s.glow(this.x, this.y + (cy + this.snap.y) * sy, 18 + 10 * (1 - sx), P[3], 0.6 * fade, 1.3);
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const c = this.snap.pixels[yy * this.snap.w + xx];
        if (!c) continue;
        const X = Math.round(this.x + flip * (xx + this.snap.x - (cx + this.snap.x)) * sx + flip * (cx + this.snap.x)), Y = Math.round(this.y + (yy + this.snap.y) * sy);
        if (!keep(X, Y, fade)) continue;
        const own = ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
        s.px(X, Y, mixRGB(mixRGB(own, P[2], 0.6), 0xffffff, white));
        s.add(X, Y, P[2], 0.25 * fade);
      }
    // sparks and slivers flung out sideways as it's squeezed
    for (let i = 0; i < 14; i++) {
      const q = clamp((k - hash(i, this.seed) * 0.4) / 0.6);
      if (q <= 0 || q >= 1) continue;
      const side = hash(i, this.seed, 1) > 0.5 ? 1 : -1, len = 4 + 8 * hash(i, this.seed, 2);
      const yy = this.y + (y0 + this.snap.y + (y1 - y0) * hash(i, this.seed, 3)) * sy, xx = this.x + flip * (cx + this.snap.x) + side * (3 + q * 22);
      for (let j = 0; j < len * (1 - q); j++) {
        const X = Math.round(xx - side * j), Y = Math.round(yy);
        if (keep(X, Y, 1 - q)) s.px(X, Y, j < 2 ? P[0] : P[2]);
      }
    }
  }
}

/** A ghost of the hero left behind a dash: its shape in the palette's colour, fading out in dithered steps. */
export class AfterImage implements Pop {
  private t = 0;
  constructor(private readonly snap: Snap, private readonly x: number, private readonly y: number, private readonly o: { life?: number; pal?: PalName; a?: number } = {}, private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= (this.o.life ?? 0.3);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const q = clamp(this.t / (this.o.life ?? 0.3)), P = PAL[this.o.pal ?? 'violet'], A = (this.o.a ?? 0.75) * (1 - q);
    for (let yy = 0; yy < this.snap.h; yy++)
      for (let xx = 0; xx < this.snap.w; xx++) {
        const c = this.snap.pixels[yy * this.snap.w + xx];
        if (!c) continue;
        const X = Math.round(this.x + xx + this.snap.x), Y = Math.round(this.y + yy + this.snap.y);
        if (!keep(X, Y, A)) continue;
        const lum = ((c & 0xff) + ((c >> 8) & 0xff) + ((c >> 16) & 0xff)) / 765;
        s.px(X, Y, lum > 0.55 ? P[1] : lum > 0.25 ? P[3] : P[4]);
      }
  }
}

/**
 * A straight cut, like a blade's flash, from (x0, y0) to (x1, y1): it races across (thick in the middle, pointed at both
 * ends, white at its heart, the colour round it), holds a moment, then thins and breaks up into specks.
 */
export class CutLine implements Pop {
  private t: number;
  /** o.shadow: a drop shadow under it, this colour, a pixel down. */
  constructor(private readonly x0: number, private readonly y0: number, private readonly x1: number, private readonly y1: number, private readonly o: { w?: number; pal?: PalName; dur?: number; delay?: number; shadow?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.36);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 0.36, k = this.t / D, P = PAL[this.o.pal ?? 'violet'], W = this.o.w ?? 3;
    const head = ease(k / 0.22), thin = 1 - clamp((k - 0.3) / 0.7);
    const dx = this.x1 - this.x0, dy = this.y1 - this.y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    if (thin <= 0) return;
    for (const shade of this.o.shadow !== undefined ? [true, false] : [false])
      for (let i = 0; i <= L * head; i += 0.5) {
        const u = i / L, taper = Math.pow(Math.sin(Math.PI * u), 0.6), half = W * taper * thin;
        const cx = this.x0 + ux * i, cy = this.y0 + uy * i + (shade ? 1.5 : 0);
        for (let j = -Math.ceil(half); j <= Math.ceil(half); j++) {
          if (Math.abs(j) > half + 0.3) continue;
          const X = Math.round(cx - uy * j), Y = Math.round(cy + ux * j);
          if (k > 0.45 && ph(X, Y, 7) > thin * 1.4) continue;
          if (shade) {
            s.px(X, Y, this.o.shadow!, 0.85);
            continue;
          }
          const r = Math.abs(j) / Math.max(0.5, half);
          s.px(X, Y, r < 0.35 ? P[0] : r < 0.7 ? P[1] : P[3]);
          if (r < 0.5) s.add(X, Y, P[2], 0.3 * thin);
        }
      }
    // the light along it
    for (let i = 0; i <= 4; i++) s.glow(this.x0 + dx * (i / 4) * head, this.y0 + dy * (i / 4) * head, 8 + W * 2, P[2], 0.25 * thin);
  }
}

/** Billows of dark smoke round (x, y), r across: bursting out, swelling, thinning away - a veil of night. */
export class ShadowSmoke implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly r: number, private readonly o: { dur?: number; n?: number; delay?: number; up?: number } = {}, private readonly speed = 1) {
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
    const D = this.o.dur ?? 0.9, k = this.t / D, n = this.o.n ?? 12;
    const SM: RGB[] = [0x6a4aa0, 0x4a2c7a, 0x341c5a, 0x241240, 0x160a28];
    s.glow(this.x, this.y, this.r * 1.2, 0x7a3ad8, 0.3 * (1 - k), 0.6);
    for (let i = 0; i < n; i++) {
      const a = hash(i, this.seed) * Math.PI * 2, d = this.r * (0.2 + 0.8 * Math.sqrt(hash(i, this.seed, 1))) * ease(k * 1.6);
      const bx = this.x + Math.cos(a) * d, by = this.y + Math.sin(a) * d * 0.55 - k * (this.o.up ?? 10) * hash(i, this.seed, 2);
      const br = (3 + 5 * hash(i, this.seed, 3)) * (0.6 + 0.8 * ease(k * 1.4));
      const A = 0.92 * (1 - clamp((k - 0.45) / 0.55));
      for (let yy = Math.floor(by - br); yy <= Math.ceil(by + br); yy++)
        for (let xx = Math.floor(bx - br); xx <= Math.ceil(bx + br); xx++) {
          const dd = Math.hypot(xx - bx, yy - by) / br;
          if (dd > 1 || !keep(xx, yy, A * (1 - dd * dd * 0.6))) continue;
          const lit = -(xx - bx) * 0.3 - (yy - by) * 0.7;
          s.px(xx, yy, SM[clamp(Math.round(2 - (lit / br) * 1.6 + dd * 1.2), 0, 4)]);
        }
    }
  }
}
