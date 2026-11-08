import * as Phaser from 'phaser';
import * as brazier from 'pixelfx/fx/fire/brazier';
import * as butterfly from 'pixelfx/fx/critters/butterfly';
import * as wisp from 'pixelfx/fx/critters/wisp';
import * as godRays from 'pixelfx/fx/weather/god-rays';
import type { FxModule } from 'pixelfx';
import { makeCanvas, rng } from '../art/pixel';
import { FxSprite } from '../fx/FxSprite';
import { COLS, ROWS, T, TILE, vertexAt, type MeadowMap } from './meadowMap';

const fxMod = (m: unknown) => m as FxModule;
const LIGHT_R = 48;

/**
 * Light and life on the map: drifting cloud shadows, sun rays, glints on the
 * water, pollen in the air, braziers with flickering light, butterflies and a
 * wisp (pixelfx effects), and a warm colour grade + vignette on the camera.
 */
export class Ambience {
  private readonly fx: FxSprite[] = [];
  private readonly clouds: Phaser.GameObjects.TileSprite;
  private readonly rays: FxSprite;
  private readonly lights: { light: Phaser.GameObjects.PointLight; base: number; seed: number }[] = [];
  private readonly waterSpots: { x: number; y: number }[] = [];
  private sparkleT = 0;
  private time = 0;
  private readonly r = rng(99);

  constructor(private readonly scene: Phaser.Scene, map: MeadowMap) {
    const W = COLS * TILE;
    const H = ROWS * TILE;

    // Soft shadows of clouds sliding across the whole map.
    scene.textures.addCanvas('clouds', cloudTexture(256));
    this.clouds = scene.add.tileSprite(0, 0, W, H, 'clouds').setOrigin(0, 0).setDepth(9000).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0.4);

    // Braziers at the shrine, each throwing a warm flickering light.
    for (const b of map.braziers) {
      const f = new FxSprite(scene, fxMod(brazier), b.x, b.y + 2, { opts: { seed: Math.floor(this.r() * 99) } });
      f.image.setScale(0.5).setDepth(b.y + 1);
      this.fx.push(f);
      const light = scene.add.pointlight(b.x, b.y - 8, 0xff8a30, LIGHT_R, 0.045, 0.12).setDepth(9500);
      this.lights.push({ light, base: 0.045, seed: this.r() * 100 });
    }
    for (const w of map.wisps) {
      const f = new FxSprite(scene, fxMod(wisp), w.x, w.y, { opts: { seed: 4 } });
      f.image.setScale(0.5).setDepth(w.y + 40);
      this.fx.push(f);
      const light = scene.add.pointlight(w.x, w.y - 6, 0x6fe6ff, LIGHT_R * 0.7, 0.03, 0.12).setDepth(9500);
      this.lights.push({ light, base: 0.03, seed: this.r() * 100 });
    }
    for (const b of map.butterflies) {
      const f = new FxSprite(scene, fxMod(butterfly), b.x, b.y, { opts: { seed: Math.floor(this.r() * 99) } });
      f.image.setScale(0.5).setDepth(b.y + 30);
      this.fx.push(f);
    }

    // Sun rays over the whole view (light only, added on top).
    this.rays = new FxSprite(scene, fxMod(godRays), 0, 0, { additive: true, always: true, crop: [0, 0, 320, 150], fps: 20 });
    this.rays.image.setOrigin(0, 0).setDepth(9800).setAlpha(0.35);

    // Pollen and dust drifting in the light.
    scene.textures.addCanvas('mote', dot(3, '#fff6c8'));
    scene.add
      .particles(0, 0, 'mote', {
        x: { min: 0, max: W },
        y: { min: 0, max: H },
        lifespan: { min: 4000, max: 8000 },
        speedX: { min: 2, max: 9 },
        speedY: { min: -6, max: 2 },
        alpha: { onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.8 },
        scale: { min: 0.35, max: 0.8 },
        frequency: 25,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(9600);

    // Glints on open water.
    scene.textures.addCanvas('glint', glintTexture());
    for (let y = 1; y < ROWS; y++)
      for (let x = 1; x < COLS; x++)
        if (vertexAt(map, x, y) === T.Water && vertexAt(map, x + 1, y) === T.Water && vertexAt(map, x, y + 1) === T.Water) this.waterSpots.push({ x: x * TILE, y: y * TILE });

    // Camera: a touch warmer and richer, darker at the corners.
    const cam = scene.cameras.main;
    const grade = cam.filters.internal.addColorMatrix();
    grade.colorMatrix.saturate(0.12);
    grade.colorMatrix.contrast(0.06, true);
    cam.filters.internal.addVignette(0.5, 0.5, 0.95, 0.35);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    for (const f of this.fx) f.update(dt);

    this.clouds.tilePositionX -= dt * 5;
    this.clouds.tilePositionY -= dt * 2;

    // keep the sun rays over the camera's view
    const view = this.scene.cameras.main.worldView;
    this.rays.image.setPosition(view.x, view.y).setScale(view.width / 320, view.height / 150);
    this.rays.update(dt);

    for (const l of this.lights) {
      const n = Math.sin(t * 9 + l.seed) * 0.5 + Math.sin(t * 23 + l.seed * 2) * 0.3 + Math.sin(t * 3.1 + l.seed) * 0.2;
      l.light.intensity = l.base * (1 + n * 0.18);
      l.light.radius = LIGHT_R * (l.base < 0.04 ? 0.7 : 1) + n * 3;
    }

    // a few glints a second on water in view
    this.sparkleT -= dt;
    if (this.sparkleT <= 0 && this.waterSpots.length) {
      this.sparkleT = 0.06;
      for (let i = 0; i < 4; i++) {
        const s = this.waterSpots[Math.floor(this.r() * this.waterSpots.length)];
        if (!view.contains(s.x, s.y)) continue;
        this.glint(s.x + (this.r() - 0.5) * TILE, s.y + (this.r() - 0.5) * TILE);
        break;
      }
    }
  }

  private glint(x: number, y: number): void {
    const g = this.scene.add.image(x, y, 'glint').setBlendMode(Phaser.BlendModes.ADD).setDepth(2).setScale(0.2).setAlpha(0);
    this.scene.tweens.add({
      targets: g,
      alpha: { from: 0, to: 0.9 },
      scale: { from: 0.2, to: 1 },
      duration: 260,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onComplete: () => g.destroy(),
    });
  }
}

/** A tileable texture of soft cloud shadows (white = no shadow, for MULTIPLY). */
function cloudTexture(size: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(size, size);
  g.imageSmoothingEnabled = true;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  const r = rng(31);
  for (let i = 0; i < 9; i++) {
    const cx = r() * size, cy = r() * size, rad = 30 + r() * 45;
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        const gr = g.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad);
        gr.addColorStop(0, 'rgba(120,140,170,0.55)');
        gr.addColorStop(0.6, 'rgba(150,165,190,0.3)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2);
      }
  }
  return c;
}

/** A small round dot. */
function dot(size: number, color: string): HTMLCanvasElement {
  const [c, g] = makeCanvas(size, size);
  g.fillStyle = color;
  g.fillRect(1, 0, size - 2, size);
  g.fillRect(0, 1, size, size - 2);
  return c;
}

/** A four-pointed pixel sparkle. */
function glintTexture(): HTMLCanvasElement {
  const [c, g] = makeCanvas(7, 7);
  g.fillStyle = '#bfe9ff';
  g.fillRect(3, 0, 1, 7);
  g.fillRect(0, 3, 7, 1);
  g.fillStyle = '#ffffff';
  g.fillRect(2, 2, 3, 3);
  return c;
}
