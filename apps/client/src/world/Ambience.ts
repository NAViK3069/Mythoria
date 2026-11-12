import { TEX } from '../art/texPrefix';
import * as Phaser from 'phaser';
import * as wisp from 'pixelfx/fx/critters/wisp';
import type { FxModule } from 'pixelfx';
import { makeCanvas, rng } from '../art/pixel';
import { bakeStill, FxSprite } from '../fx/FxSprite';
import { EffectSprite, type PixelEffect } from '../fx/surface';
import { chimneySmoke, fountainWater } from '../fx/effects/water';
import { brazierflame, brazierStand, campfire, cookfire, hearthfire, spiritflame, torchflame, torchStand } from '../fx/effects/fire';
import { BEYOND, T, TILE, vertexAt, type Fire, type MeadowMap } from './meadowMap';

const fxMod = (m: unknown) => m as FxModule;
const LIGHT_R = 48;

/** How each kind of fire is drawn: its effect, how far up the flames sit on their stand, and its light. */
const FIRES: Record<Fire['kind'], { fx?: FxModule; effect?: PixelEffect; stand?: FxModule; up?: number; color: number; radius: number; k: number; halo: number }> = {
  campfire: { fx: campfire, color: 0xff8a30, radius: 92, k: 0.07, halo: 1.6 },
  cookfire: { fx: cookfire, color: 0xff8a30, radius: 44, k: 0.045, halo: 0.9 },
  hearth: { fx: hearthfire, color: 0xff7a28, radius: 50, k: 0.05, halo: 1 },
  spirit: { fx: spiritflame, color: 0x5ac8ff, radius: 56, k: 0.05, halo: 1.1 },
  torch: { fx: torchflame, stand: torchStand, up: 25, color: 0xff9a40, radius: 52, k: 0.05, halo: 0.9 },
  brazier: { fx: brazierflame, stand: brazierStand, up: 17, color: 0xff8a30, radius: 54, k: 0.05, halo: 1 },
  lantern: { color: 0xffc070, radius: 34, k: 0.045, halo: 0.55 },
  // the town's: smoke (no light), the smithy's forge, the temple's crystal, the street lamps' crystals
  smoke: { effect: chimneySmoke, color: 0, radius: 0, k: 0, halo: 0 },
  forge: { fx: hearthfire, color: 0xff7a28, radius: 48, k: 0.05, halo: 0.9 },
  crystal: { color: 0x7fc8ff, radius: 90, k: 0.06, halo: 1.5 },
  lamp: { color: 0xa8dcff, radius: 40, k: 0.028, halo: 0.42 },
};

/**
 * Light and life on the map: drifting cloud shadows, glints on the water, pollen
 * in the air, our own fires (campfire, torches, braziers, a spirit flame) with
 * flickering light, fireflies in the glades, leaves falling from the trees, a
 * wisp (pixelfx), and a colour grade on the camera. Butterflies live in Critters.
 */
export class Ambience {
  private readonly fx: FxSprite[] = [];
  private readonly clouds: Phaser.GameObjects.TileSprite;
  private readonly lights: { light: Phaser.GameObjects.PointLight; base: number; radius: number; seed: number; glow?: Phaser.GameObjects.Image; halo?: number }[] = [];
  private readonly trees: { x: number; y: number }[] = [];
  /** The flames of each fire, so the scene can draw them with the thing they burn in. */
  readonly flames: { fire: Fire; image: Phaser.GameObjects.Image }[] = [];
  /** Effects drawn on our own engine (chimney smoke, the fountain's water). */
  private readonly effects: EffectSprite[] = [];
  /** Things that must sort with an object of the map: [the object, the image, how far in front]. */
  readonly followers: { owner: import('./meadowMap').Placed; image: Phaser.GameObjects.Image; offset: number }[] = [];
  private leafT = 0;
  private readonly waterSpots: { x: number; y: number }[] = [];
  private sparkleT = 0;
  private time = 0;
  private readonly r = rng(99);

  /** Its textures' name prefix (art/texPrefix.ts). */
  private readonly px = TEX;

  constructor(private readonly scene: Phaser.Scene, map: MeadowMap) {
    const W = map.cols * TILE;
    const H = map.rows * TILE;

    // Soft shadows of clouds sliding across the whole map - and past its edges, as far as the ground goes.
    scene.textures.addCanvas(this.px + 'clouds', cloudTexture(256));
    this.clouds = scene.add
      .tileSprite(-BEYOND, -BEYOND, W + 2 * BEYOND, H + 2 * BEYOND, this.px + 'clouds')
      .setOrigin(0, 0)
      .setDepth(8990)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setAlpha(0.4);

    // Fires: our own effects (fx/effects/fire.ts), each throwing a warm flickering light.
    scene.textures.addCanvas(this.px + 'lamp_glow', softDot(32));
    for (const f of map.fires) {
      const def = FIRES[f.kind];
      let fy = f.y;
      if (def.stand) {
        const key = `stand_${f.kind}`;
        const [ox, oy] = bakeStill(scene, key, def.stand);
        scene.add.image(f.x, f.y, key).setOrigin(ox, oy).setDepth(f.y);
        fy = f.y - (def.up ?? 0);
      }
      if (def.fx) {
        const fx = new FxSprite(scene, def.fx, f.x, fy, { opts: { seed: 1 + Math.floor(this.r() * 99) } });
        fx.image.setDepth(f.depth);
        this.fx.push(fx);
        this.flames.push({ fire: f, image: fx.image });
      }
      if (def.effect) {
        const e = new EffectSprite(scene, def.effect, f.x, fy);
        e.image.setDepth(f.depth);
        this.effects.push(e);
      }
      if (!def.radius) continue; // smoke throws no light
      // a soft halo of light round the flames (a lantern is only this: a glass of steady light)
      const glow = scene.add
        .image(f.x, fy - (def.fx ? 6 : 0), this.px + 'lamp_glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(def.color)
        .setScale(def.halo)
        .setAlpha(def.fx ? 0.16 : f.kind === 'lamp' ? 0.3 : 0.5)
        .setDepth(9550);
      const light = scene.add.pointlight(f.x, fy - 6, def.color, def.radius, def.k, 0.12).setDepth(9500);
      this.lights.push({ light, base: def.k, radius: def.radius, seed: this.r() * 100, glow, halo: def.halo });
    }
    // the fountain's water, drawn over its basin and sorting with it
    if (map.fountain) {
      const e = new EffectSprite(scene, fountainWater, map.fountain.x, map.fountain.y);
      e.image.setDepth(map.fountain.y + 0.2);
      this.effects.push(e);
      this.followers.push({ owner: map.fountain.owner, image: e.image, offset: 0.2 });
    }
    for (const f of this.flames) if (f.fire.owner) this.followers.push({ owner: f.fire.owner, image: f.image, offset: 0.5 });
    for (const w of map.wisps) {
      const f = new FxSprite(scene, fxMod(wisp), w.x, w.y, { opts: { seed: 4 } });
      f.image.setScale(0.5).setDepth(w.y + 40);
      this.fx.push(f);
      const light = scene.add.pointlight(w.x, w.y - 6, 0x6fe6ff, LIGHT_R * 0.7, 0.03, 0.12).setDepth(9500);
      this.lights.push({ light, base: 0.03, radius: LIGHT_R * 0.7, seed: this.r() * 100 });
    }

    // Fireflies and spirit motes drifting in the glades (the village, the shrine, the camp).
    scene.textures.addCanvas(this.px + 'firefly', dot(3, '#ffffff'));
    for (const g of map.glades) {
      scene.add
        .particles(0, 0, this.px + 'firefly', {
          emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(g.x, g.y, g.r * 2, g.r * 1.4), quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
          lifespan: { min: 3000, max: 6000 },
          speedX: { min: -8, max: 8 },
          speedY: { min: -9, max: 3 },
          tint: [0xd8ff7a, 0xfff2a0, 0x9af0ff],
          scale: { min: 0.5, max: 0.9 },
          alpha: { onUpdate: (_p: unknown, _k: string, t: number) => Math.max(0, Math.sin(t * Math.PI) * (0.55 + 0.45 * Math.sin(t * 30))) },
          frequency: Math.max(60, 26000 / g.r),
          blendMode: Phaser.BlendModes.ADD,
        })
        .setDepth(9600);
    }

    // Leaves now and then let go of the trees in view and see-saw down.
    for (const o of map.objects) if (o.kind === 'tree') this.trees.push({ x: o.x, y: o.y });
    ['#4f9a3a', '#7cc04a', '#c9b24a'].forEach((c, i) => {
      const [lc, lg] = makeCanvas(3, 2);
      lg.fillStyle = c;
      lg.fillRect(0, 0, 2, 1);
      lg.fillRect(1, 1, 2, 1);
      scene.textures.addCanvas(`${this.px}leaf${i}`, lc);
    });

    // Pollen and dust drifting in the light.
    scene.textures.addCanvas(this.px + 'mote', dot(3, '#fff6c8'));
    scene.add
      .particles(0, 0, this.px + 'mote', {
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
    scene.textures.addCanvas(this.px + 'glint', glintTexture());
    for (let y = 1; y < map.rows; y++)
      for (let x = 1; x < map.cols; x++)
        if (vertexAt(map, x, y) === T.Water && vertexAt(map, x + 1, y) === T.Water && vertexAt(map, x, y + 1) === T.Water) this.waterSpots.push({ x: x * TILE, y: y * TILE });

    // Overall colour: a touch richer. (No screen-space lighting: all light belongs to the level.)
    const grade = scene.cameras.main.filters.internal.addColorMatrix();
    grade.colorMatrix.saturate(0.08);
    grade.colorMatrix.contrast(0.1, true);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    for (const f of this.fx) f.update(dt);
    for (const e of this.effects) e.update(dt);

    this.clouds.tilePositionX -= dt * 5;
    this.clouds.tilePositionY -= dt * 2;

    const view = this.scene.cameras.main.worldView;

    for (const l of this.lights) {
      const n = Math.sin(t * 9 + l.seed) * 0.5 + Math.sin(t * 23 + l.seed * 2) * 0.3 + Math.sin(t * 3.1 + l.seed) * 0.2;
      l.light.intensity = l.base * (1 + n * 0.18);
      l.light.radius = l.radius + n * 3;
      if (l.glow && l.halo) l.glow.setScale(l.halo * (1 + n * 0.05));
    }

    // a leaf every so often from a tree in view
    this.leafT -= dt;
    if (this.leafT <= 0) {
      this.leafT = 0.35 + this.r() * 0.5;
      for (let i = 0; i < 6; i++) {
        const tr = this.trees[Math.floor(this.r() * this.trees.length)];
        if (!tr || !view.contains(tr.x, tr.y - 30)) continue;
        this.leaf(tr.x + (this.r() - 0.5) * 34, tr.y - 30 - this.r() * 14, tr.y + 4 + this.r() * 16);
        break;
      }
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

  /** A leaf see-sawing down from (x, y) to the ground at gy, then fading. */
  private leaf(x: number, y: number, gy: number): void {
    const s = this.scene;
    const leaf = s.add.image(x, y, `${this.px}leaf${Math.floor(this.r() * 3)}`).setDepth(gy + 1);
    const drift = (this.r() - 0.5) * 30;
    const fall = 1800 + this.r() * 1400;
    s.tweens.add({ targets: leaf, y: gy, duration: fall, ease: 'Sine.easeIn' });
    s.tweens.add({ targets: leaf, x: x + drift, duration: fall, ease: 'Linear' });
    s.tweens.add({ targets: leaf, angle: { from: -40, to: 40 }, duration: 380 + this.r() * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    s.tweens.add({
      targets: leaf,
      alpha: 0,
      delay: fall + 600,
      duration: 900,
      onComplete: () => {
        s.tweens.killTweensOf(leaf);
        leaf.destroy();
      },
    });
  }

  private glint(x: number, y: number): void {
    const g = this.scene.add.image(x, y, this.px + 'glint').setBlendMode(Phaser.BlendModes.ADD).setDepth(2).setScale(0.2).setAlpha(0);
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

/** A soft round glow, bright in the middle (for additive light). */
function softDot(size: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(size, size);
  g.imageSmoothingEnabled = true;
  const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
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
