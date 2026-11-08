import * as Phaser from 'phaser';
import { makeCanvas, rng } from '../art/pixel';
import { COLS, ROWS, T, TILE, vertexAt, type MeadowMap, type Placed } from './meadowMap';

interface TileTable {
  tiles: Record<string, [number, number]>;
}
export type TileLookup = Record<'water' | 'path' | 'dark', TileTable>;

/** An object standing on the map (tree, wall, ...) that can fade when the player walks behind it. */
export interface StandingThing {
  data: Placed;
  image: Phaser.GameObjects.Image;
  bounds: Phaser.Geom.Rectangle;
}

/** Sun from the upper left: shadows fall down and to the right. */
const SHADOW_SKEW = 0.55;
const SHADOW_SQUASH = 0.42;

/**
 * Draws the meadow: the ground (autotiled terrain + ground decals) and the cast
 * shadows are baked into two big textures once; the objects are sprites so
 * they sort by depth with the characters.
 */
export class MeadowView {
  readonly things: StandingThing[] = [];
  readonly lilies: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly map: MeadowMap) {
    const lookup = scene.cache.json.get('tiles') as TileLookup;
    scene.textures.addCanvas('ground', this.bakeGround(lookup));
    scene.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(0);
    scene.textures.addCanvas('shadows', this.bakeShadows());
    scene.add.image(0, 0, 'shadows').setOrigin(0, 0).setDepth(1).setAlpha(0.3);
    this.placeObjects();
  }

  private sourceOf(key: string): CanvasImageSource {
    return this.scene.textures.get(key).getSourceImage() as CanvasImageSource;
  }

  private bakeGround(lookup: TileLookup): HTMLCanvasElement {
    const [c, g] = makeCanvas(COLS * TILE, ROWS * TILE);
    const r = rng(77);
    const src = { water: this.sourceOf('tiles_water'), path: this.sourceOf('tiles_path'), dark: this.sourceOf('tiles_dark') };
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const corners = [vertexAt(this.map, x, y), vertexAt(this.map, x + 1, y), vertexAt(this.map, x, y + 1), vertexAt(this.map, x + 1, y + 1)];
        let set: 'water' | 'path' | 'dark' = 'water';
        let key = '1111'; // plain grass (grass is the water set's upper terrain)
        if (corners.includes(T.Water)) key = corners.map((t) => (t === T.Water ? '0' : '1')).join('');
        else if (corners.includes(T.Path)) (set = 'path'), (key = corners.map((t) => (t === T.Path ? '1' : '0')).join(''));
        else if (corners.includes(T.Dark)) (set = 'dark'), (key = corners.map((t) => (t === T.Dark ? '1' : '0')).join(''));
        const pos = lookup[set].tiles[key];
        if (!pos) continue;
        // Plain tiles get mirrored at random so the repeat doesn't show.
        const plain = key === '1111' || key === '0000';
        const flip = plain && r() < 0.5;
        g.save();
        g.translate(x * TILE + (flip ? TILE : 0), y * TILE);
        if (flip) g.scale(-1, 1);
        g.drawImage(src[set], pos[0], pos[1], TILE, TILE, 0, 0, TILE, TILE);
        g.restore();
      }
    }
    // ground decals (flowers, tufts, pebbles), pixel aligned
    for (const d of this.map.decals) {
      const f = this.scene.textures.getFrame('meadow', d.frame);
      g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, Math.round(d.x - f.cutWidth / 2), Math.round(d.y - f.cutHeight / 2), f.cutWidth, f.cutHeight);
    }
    return c;
  }

  /** Each object's silhouette, flattened and slanted away from the sun, baked into one texture. */
  private bakeShadows(): HTMLCanvasElement {
    const [c, g] = makeCanvas(COLS * TILE, ROWS * TILE);
    const sil = new Map<string, HTMLCanvasElement>();
    const silhouette = (name: string) => {
      let s = sil.get(name);
      if (!s) {
        const f = this.scene.textures.getFrame('meadow', name);
        const [sc, sg] = makeCanvas(f.cutWidth, f.cutHeight);
        sg.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
        sg.globalCompositeOperation = 'source-in';
        sg.fillStyle = '#0c1d14';
        sg.fillRect(0, 0, f.cutWidth, f.cutHeight);
        sil.set(name, (s = sc));
      }
      return s;
    };
    for (const o of this.map.objects) {
      if (!o.shadow || !o.frame) continue;
      const s = silhouette(o.frame);
      // flip the silhouette down from the base, squash it and lean it to the right
      g.setTransform(1, 0, -SHADOW_SKEW * SHADOW_SQUASH, -SHADOW_SQUASH, Math.round(o.x), Math.round(o.y) - 1);
      g.drawImage(s, -s.width / 2, -s.height);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  private placeObjects(): void {
    for (const o of this.map.objects) {
      if (!o.frame) continue;
      const img = this.scene.add.image(Math.round(o.x), Math.round(o.y), 'meadow', o.frame).setOrigin(0.5, 1);
      if (o.kind === 'lily') {
        img.setOrigin(0.5, 0.5).setDepth(1.5);
        this.lilies.push(img);
        continue;
      }
      img.setDepth(o.y);
      if (o.kind === 'tree' || o.kind === 'wall' || o.kind === 'pillar') {
        this.things.push({ data: o, image: img, bounds: img.getBounds() });
      }
    }
  }

  /** Fade trees and walls the player is standing behind, so they never vanish from view. */
  update(dt: number, px: number, py: number, time: number): void {
    for (const t of this.things) {
      const behind = py < t.data.y - 2 && Phaser.Geom.Rectangle.Contains(t.bounds, px, py - 10);
      const target = behind ? 0.45 : 1;
      t.image.alpha += (target - t.image.alpha) * Math.min(1, dt * 8);
    }
    // lily pads bob gently
    for (let i = 0; i < this.lilies.length; i++) {
      const l = this.lilies[i];
      l.setRotation(Math.sin(time * 0.6 + i * 1.7) * 0.06);
    }
  }
}
