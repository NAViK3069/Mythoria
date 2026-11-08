import * as Phaser from 'phaser';
import { clearFrame, composite, createFrame, createFx, type FxInstance, type FxModule } from 'pixelfx';

let nextId = 0;

export interface FxSpriteOptions {
  /** Options passed to the effect (palette, seed, light, ...). */
  opts?: Record<string, unknown>;
  /** Only draw this part of the effect's frame: [x, y, w, h]. */
  crop?: [number, number, number, number];
  /** Redraw rate; the simulation itself always runs smoothly. Default: the effect's own fps (30). */
  fps?: number;
  /** Additive blending - for pure light (rays, glows). */
  additive?: boolean;
  /** Keep running when off screen (default false: paused while not visible). */
  always?: boolean;
}

/**
 * A pixelfx effect (https://github.com/patch-gg/pixelfx, MIT) as a Phaser image.
 * The effect draws into its own small pixel frame, which is copied into a
 * canvas texture a few dozen times a second.
 */
export class FxSprite {
  readonly image: Phaser.GameObjects.Image;
  private readonly fx: FxInstance;
  private readonly frame;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly data: ImageData;
  private readonly full: ImageData | null;
  private readonly crop: [number, number, number, number];
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly interval: number;
  private acc = 0;
  private readonly always: boolean;

  constructor(private readonly scene: Phaser.Scene, mod: FxModule, x: number, y: number, o: FxSpriteOptions = {}) {
    const meta = mod.meta;
    const [w, h] = meta.size;
    const [ox, oy] = meta.origin ?? [w / 2, h / 2];
    this.fx = createFx(mod, { ...o.opts, x: ox, y: oy });
    this.frame = createFrame(w, h);
    this.crop = o.crop ?? [0, 0, w, h];
    const [, , cw, ch] = this.crop;
    this.full = o.crop ? new ImageData(w, h) : null;
    this.data = new ImageData(cw, ch);
    const key = `fx_${nextId++}`;
    this.texture = scene.textures.createCanvas(key, cw, ch)!;
    this.canvas = this.texture.getSourceImage() as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.interval = 1 / (o.fps ?? meta.fps ?? 30);
    this.always = !!o.always;
    this.image = scene.add.image(x, y, key).setOrigin((ox - this.crop[0]) / cw, (oy - this.crop[1]) / ch);
    if (o.additive) this.image.setBlendMode(Phaser.BlendModes.ADD);
    // warm it up so it doesn't start from an empty first frame
    this.fx.update(Math.random() * (meta.duration ?? 1));
    this.redraw();
  }

  update(dt: number): void {
    if (!this.always && !this.onScreen()) return;
    this.fx.update(dt);
    this.acc += dt;
    if (this.acc >= this.interval) {
      this.acc %= this.interval;
      this.redraw();
    }
  }

  private onScreen(): boolean {
    if (this.image.scrollFactorX === 0) return true;
    const view = this.scene.cameras.main.worldView;
    const b = this.image.getBounds();
    return Phaser.Geom.Intersects.RectangleToRectangle(view, b);
  }

  private redraw(): void {
    clearFrame(this.frame);
    this.fx.draw(this.frame);
    if (this.full) {
      composite(this.frame, this.full.data, null);
      // copy the cropped rows
      const [cx, cy, cw, ch] = this.crop;
      const W = this.frame.w;
      for (let y = 0; y < ch; y++) {
        const from = ((cy + y) * W + cx) * 4;
        this.data.data.set(this.full.data.subarray(from, from + cw * 4), y * cw * 4);
      }
    } else {
      composite(this.frame, this.data.data, null);
    }
    this.ctx.putImageData(this.data, 0, 0);
    this.texture.refresh();
  }

  destroy(): void {
    this.image.destroy();
    this.texture.destroy();
  }
}
