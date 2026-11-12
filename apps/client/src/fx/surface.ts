import * as Phaser from 'phaser';

// Mythoria's own little pixel-effect engine: a surface you paint pixels and light onto, and a Phaser
// image that shows it. Two layers, like real light: `color` (paint, alpha-blended) and `light` (added on
// top, so it glows). Coordinates are local to the effect's own anchor (its origin), 1 unit = 1 world px.

/** A colour as 0xRRGGBB. */
export type RGB = number;

const R = (c: RGB) => (c >> 16) & 255;
const G = (c: RGB) => (c >> 8) & 255;
const B = (c: RGB) => c & 255;

/** a..b by t, per channel. */
export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return (Math.round(R(a) + (R(b) - R(a)) * k) << 16) | (Math.round(G(a) + (G(b) - G(a)) * k) << 8) | Math.round(B(a) + (B(b) - B(a)) * k);
}

export class Surface {
  private readonly r: Float32Array;
  private readonly g: Float32Array;
  private readonly b: Float32Array;
  private readonly a: Float32Array;
  private readonly lr: Float32Array;
  private readonly lg: Float32Array;
  private readonly lb: Float32Array;

  constructor(readonly w: number, readonly h: number, readonly ox: number, readonly oy: number) {
    const n = w * h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a = new Float32Array(n);
    this.lr = new Float32Array(n);
    this.lg = new Float32Array(n);
    this.lb = new Float32Array(n);
  }

  clear(): void {
    this.r.fill(0), this.g.fill(0), this.b.fill(0), this.a.fill(0);
    this.lr.fill(0), this.lg.fill(0), this.lb.fill(0);
  }

  private at(x: number, y: number): number {
    const X = Math.floor(x + this.ox), Y = Math.floor(y + this.oy);
    return X < 0 || Y < 0 || X >= this.w || Y >= this.h ? -1 : Y * this.w + X;
  }

  /** Paint one pixel, alpha a (0..1) over what's there. */
  px(x: number, y: number, c: RGB, a = 1): void {
    const i = this.at(x, y);
    if (i < 0 || a <= 0) return;
    const k = Math.min(1, a), q = 1 - k;
    this.r[i] = R(c) * k + this.r[i] * q;
    this.g[i] = G(c) * k + this.g[i] * q;
    this.b[i] = B(c) * k + this.b[i] * q;
    this.a[i] = k + this.a[i] * q;
  }

  /** Paint the pixel at index i (y * w + x) - for effects that sweep every pixel of the canvas. */
  pxi(i: number, c: RGB, a = 1): void {
    const k = a > 1 ? 1 : a, q = 1 - k;
    this.r[i] = R(c) * k + this.r[i] * q;
    this.g[i] = G(c) * k + this.g[i] * q;
    this.b[i] = B(c) * k + this.b[i] * q;
    this.a[i] = k + this.a[i] * q;
  }

  /** Add light to the pixel at index i. */
  addi(i: number, c: RGB, k: number): void {
    this.lr[i] += R(c) * k;
    this.lg[i] += G(c) * k;
    this.lb[i] += B(c) * k;
  }

  /** Add light to one pixel (k 0..1+). */
  add(x: number, y: number, c: RGB, k: number): void {
    const i = this.at(x, y);
    if (i < 0 || k <= 0) return;
    this.lr[i] += R(c) * k;
    this.lg[i] += G(c) * k;
    this.lb[i] += B(c) * k;
  }

  /** A soft round glow of light, radius rad, strength k at its middle. sy squashes it (0.5 = a flat pool). */
  glow(x: number, y: number, rad: number, c: RGB, k: number, sy = 1): void {
    if (rad <= 0 || k <= 0.003) return;
    const ry = rad * sy;
    for (let yy = Math.floor(y - ry); yy <= Math.ceil(y + ry); yy++)
      for (let xx = Math.floor(x - rad); xx <= Math.ceil(x + rad); xx++) {
        const dx = (xx + 0.5 - x) / rad, dy = (yy + 0.5 - y) / ry, d = dx * dx + dy * dy;
        if (d < 1) this.add(xx, yy, c, k * (1 - d) * (1 - d));
      }
  }

  /** A 1 px line; colour and alpha may change along it (u 0..1). */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB | ((u: number) => RGB), a: number | ((u: number) => number) = 1): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      this.px(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, typeof c === 'function' ? c(u) : c, typeof a === 'function' ? a(u) : a);
    }
  }

  /** Into RGBA bytes: paint first, then light added on top (over nothing, light becomes glowing colour). */
  write(out: Uint8ClampedArray): void {
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const a = this.a[i];
      const lr = this.lr[i], lg = this.lg[i], lb = this.lb[i];
      const la = Math.min(1, Math.max(lr, lg, lb) / 255);
      const na = Math.max(a, la);
      const j = i * 4;
      if (na <= 0.002) {
        out[j + 3] = 0;
        continue;
      }
      out[j] = Math.min(255, (this.r[i] + lr) / na);
      out[j + 1] = Math.min(255, (this.g[i] + lg) / na);
      out[j + 2] = Math.min(255, (this.b[i] + lb) / na);
      out[j + 3] = na * 255;
    }
  }
}

/** A pixel effect: its canvas, and how to draw it at time t (seconds). */
export interface PixelEffect {
  /** Canvas size and where its anchor (0, 0) sits on it. */
  w: number;
  h: number;
  ox: number;
  oy: number;
  /** Loops repeat every `duration`; one-shots end there. */
  duration: number;
  loop: boolean;
  /** Redraw rate (default 30). */
  fps?: number;
  /** Step any state forward (particles); called before draw. */
  update?(dt: number, t: number): void;
  draw(s: Surface, t: number): void;
  /** What goes behind the hero (the far half of a ring, the glow on the ground) - drawn by a second sprite. */
  drawBack?(s: Surface, t: number): void;
}

let nextKey = 0;

/** A pixel effect shown as a Phaser image, redrawn a few dozen times a second; paused off screen. */
export class EffectSprite {
  readonly image: Phaser.GameObjects.Image;
  private readonly surface: Surface;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly data: ImageData;
  private t: number;
  private acc = 0;

  /**
   * back: this sprite shows the effect's drawBack layer (and leaves stepping its state to the front sprite,
   * so a pair of them shares one effect).
   */
  constructor(private readonly scene: Phaser.Scene, private readonly fx: PixelEffect, x: number, y: number, private readonly always = false, private readonly back = false) {
    this.surface = new Surface(fx.w, fx.h, fx.ox, fx.oy);
    const key = `pfx_${nextKey++}`;
    this.texture = scene.textures.createCanvas(key, fx.w, fx.h)!;
    this.ctx = (this.texture.getSourceImage() as HTMLCanvasElement).getContext('2d')!;
    this.data = new ImageData(fx.w, fx.h);
    this.image = scene.add.image(x, y, key).setOrigin(fx.ox / fx.w, fx.oy / fx.h);
    // loops start at a random point, so a row of them doesn't move in step
    this.t = fx.loop ? Math.random() * fx.duration : 0;
    this.redraw();
  }

  get finished(): boolean {
    return !this.fx.loop && this.t >= this.fx.duration;
  }

  update(dt: number): void {
    if (!this.always && !this.onScreen()) return;
    this.t += dt;
    if (!this.back) this.fx.update?.(dt, this.t);
    this.acc += dt;
    if (this.acc >= 1 / (this.fx.fps ?? 30)) {
      this.acc = 0;
      this.redraw();
    }
  }

  private onScreen(): boolean {
    return Phaser.Geom.Intersects.RectangleToRectangle(this.scene.cameras.main.worldView, this.image.getBounds());
  }

  private redraw(): void {
    const t = this.fx.loop ? this.t % this.fx.duration : Math.min(this.t, this.fx.duration);
    this.surface.clear();
    if (this.back) this.fx.drawBack?.(this.surface, t);
    else this.fx.draw(this.surface, t);
    this.surface.write(this.data.data);
    this.ctx.putImageData(this.data, 0, 0);
    this.texture.refresh();
  }

  destroy(): void {
    this.image.destroy();
    this.texture.destroy();
  }
}

/** Draw a still effect once into a texture; returns its origin for setOrigin(). */
export function bakeEffect(scene: Phaser.Scene, key: string, fx: PixelEffect): [number, number] {
  if (!scene.textures.exists(key)) {
    const s = new Surface(fx.w, fx.h, fx.ox, fx.oy);
    fx.draw(s, 0);
    const data = new ImageData(fx.w, fx.h);
    s.write(data.data);
    const tex = scene.textures.createCanvas(key, fx.w, fx.h)!;
    (tex.getSourceImage() as HTMLCanvasElement).getContext('2d')!.putImageData(data, 0, 0);
    tex.refresh();
  }
  return [fx.ox / fx.w, fx.oy / fx.h];
}
