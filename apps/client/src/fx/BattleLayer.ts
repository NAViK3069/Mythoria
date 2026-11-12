import * as Phaser from 'phaser';
import { Surface } from './surface';
import type { Pop } from './effects/battlePops';

// The battle's pixel-effect layer: one canvas exactly the size of what the camera sees, in world pixels, laid over
// the field (so its pixels are the map's pixels - as crisp, as big). Each frame it is cleared, the HP bars and every
// running effect (fx/effects/battlePops.ts) paint onto it in world coordinates, and it is sent to the screen.

export class BattleLayer {
  private surface!: Surface;
  private texture!: Phaser.Textures.CanvasTexture;
  private ctx!: CanvasRenderingContext2D;
  private data!: ImageData;
  private image!: Phaser.GameObjects.Image;
  private readonly key: string;
  private blank = false;
  private vx = 0;
  private vy = 0;
  readonly pops: Pop[] = [];
  /** Things drawn every frame before the effects. */
  under: ((s: Surface) => void) | null = null;
  /** Things drawn every frame AFTER the effects, over them (the HP bars, markers: an effect never covers a bar). */
  over: ((s: Surface) => void) | null = null;

  /** depth: where it draws among the field's things (over everything by default; a ground layer goes just over the
   * ground, under the fighters); name: its texture's. */
  constructor(private readonly scene: Phaser.Scene, private readonly depth = 9500, name = 'fxlayer') {
    this.key = `bt:${name}`;
    this.fit();
  }

  /** Size it to the camera's view (call after the camera's zoom or size changes). */
  fit(): void {
    const cam = this.scene.cameras.main;
    const w = Math.ceil(cam.width / cam.zoom) + 4, h = Math.ceil(cam.height / cam.zoom) + 4;
    if (this.surface && this.surface.w === w && this.surface.h === h) return;
    this.image?.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    this.texture = this.scene.textures.createCanvas(this.key, w, h)!;
    this.ctx = (this.texture.getSourceImage() as HTMLCanvasElement).getContext('2d')!;
    this.data = new ImageData(w, h);
    this.image = this.scene.add.image(0, 0, this.key).setOrigin(0, 0).setDepth(this.depth);
    this.place(w, h);
  }

  private place(w: number, h: number): void {
    const cam = this.scene.cameras.main;
    cam.preRender();
    this.vx = Math.floor(cam.worldView.x) - 2;
    this.vy = Math.floor(cam.worldView.y) - 2;
    this.surface = new Surface(w, h, -this.vx, -this.vy);
    this.image.setPosition(this.vx, this.vy);
  }

  add<T extends Pop>(p: T): T {
    this.pops.push(p);
    return p;
  }

  update(dt: number): void {
    const cam = this.scene.cameras.main;
    // the camera was moved: follow it
    if (Math.floor(cam.worldView.x) - 2 !== this.vx || Math.floor(cam.worldView.y) - 2 !== this.vy) this.place(this.surface.w, this.surface.h);
    for (const p of this.pops) p.update(dt);
    for (let i = this.pops.length - 1; i >= 0; i--) if (this.pops[i].done) this.pops.splice(i, 1);
    // nothing on it, and it was cleared last time: leave it as it is (the ground layer is empty most of the time)
    const empty = !this.pops.length && !this.under && !this.over;
    if (empty && this.blank) return;
    this.blank = empty;
    const s = this.surface;
    s.clear();
    this.under?.(s);
    for (const p of this.pops) p.draw(s);
    this.over?.(s);
    s.write(this.data.data);
    this.ctx.putImageData(this.data, 0, 0);
    this.texture.refresh();
  }

  /** The top-left of the view, in world px (for things placed on screen rather than on the field). */
  get view(): { x: number; y: number; w: number; h: number } {
    return { x: this.vx + 2, y: this.vy + 2, w: this.surface.w - 4, h: this.surface.h - 4 };
  }

  destroy(): void {
    this.image.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
