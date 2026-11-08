import * as Phaser from 'phaser';
import { makeCanvas, rng } from '../art/pixel';
import { gradeCanvas } from '../art/grade';
import { Ponds } from './Ponds';
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

/** World px per texel of the light maps. */
const LIGHT_RES = 4;

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
    const ground = gradeCanvas(this.bakeGround(lookup));
    scene.textures.addCanvas('ground', ground);
    scene.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(0);
    this.ponds = new Ponds(scene, map, ground);
    const [cast, contact] = this.bakeShadows();
    scene.textures.addCanvas('shadows', cast);
    scene.add.image(0, 0, 'shadows').setOrigin(0, 0).setDepth(1).setAlpha(0.26);
    scene.textures.addCanvas('contact', contact);
    scene.add.image(0, 0, 'contact').setOrigin(0, 0).setDepth(1.1).setAlpha(0.3);
    // Light that belongs to the level: shade under the woods, warm sun pooling in the clearings.
    const [shade, sun] = this.bakeLight();
    scene.textures.addCanvas('shade', shade)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    scene.add.image(0, 0, 'shade').setOrigin(0, 0).setScale(LIGHT_RES).setDepth(1.2).setBlendMode(Phaser.BlendModes.MULTIPLY);
    scene.textures.addCanvas('sunlight', sun)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.sun = scene.add.image(0, 0, 'sunlight').setOrigin(0, 0).setScale(LIGHT_RES).setDepth(1.3).setBlendMode(Phaser.BlendModes.ADD);
    this.placeObjects();
    this.ponds.adoptLilies(this.lilies);
  }

  private readonly sun: Phaser.GameObjects.Image;
  private readonly ponds: Ponds;
  private readonly bushes: { data: Placed; image: Phaser.GameObjects.Image; w: number; h: number; shake: number; inside: boolean; seed: number }[] = [];
  private bushTime = 0;

  /** Low-resolution light maps (one texel = LIGHT_RES px), smoothed when drawn. */
  private bakeLight(): [HTMLCanvasElement, HTMLCanvasElement] {
    const W = Math.ceil((COLS * TILE) / LIGHT_RES);
    const H = Math.ceil((ROWS * TILE) / LIGHT_RES);
    const [shade, sg] = makeCanvas(W, H);
    const [sun, ug] = makeCanvas(W, H);
    sg.imageSmoothingEnabled = ug.imageSmoothingEnabled = true;
    sg.fillStyle = '#ffffff';
    sg.fillRect(0, 0, W, H);
    sg.globalCompositeOperation = 'multiply';
    const blob = (g: CanvasRenderingContext2D, x: number, y: number, rad: number, rgb: string, a: number) => {
      const X = x / LIGHT_RES, Y = y / LIGHT_RES, R = rad / LIGHT_RES;
      const gr = g.createRadialGradient(X, Y, 0, X, Y, R);
      gr.addColorStop(0, `rgba(${rgb},${a})`);
      gr.addColorStop(0.55, `rgba(${rgb},${a * 0.55})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(X - R, Y - R, R * 2, R * 2);
    };
    const trees = this.map.objects.filter((o) => o.kind === 'tree');
    // canopy shade, offset away from the sun; it builds up where the woods are thick
    for (const t of trees) blob(sg, t.x + 10, t.y - 6, 46, '86,110,122', 0.55);
    for (const o of this.map.objects) if (o.kind === 'wall' || o.kind === 'pillar') blob(sg, o.x + 6, o.y, 24, '110,125,135', 0.3);

    // warm sun pooling wherever the sky is open; dapples at the edge of the woods
    const r = rng(5);
    const nearestTree = (x: number, y: number) => trees.reduce((d, t) => Math.min(d, Math.hypot(t.x - x, t.y - 20 - y)), Infinity);
    for (let y = 0; y < ROWS * TILE; y += 44) {
      for (let x = 0; x < COLS * TILE; x += 44) {
        const px = x + (r() - 0.5) * 30, py = y + (r() - 0.5) * 30;
        const d = nearestTree(px, py);
        if (d > 95) blob(ug, px, py, 80, '205,255,215', 0.06);
        else if (d > 34 && r() < 0.5) blob(ug, px, py, 10 + r() * 8, '225,255,220', 0.15);
      }
    }
    return [shade, sun];
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

  /**
   * Shadows for a sun high overhead, a little to the upper left: each thing's own
   * outline squashed flat onto the ground beneath it and nudged down-right, so what
   * peeks out round its base is a soft shape that matches it (a round bush gets a
   * round shadow, a tree a canopy-shaped pool). Plus a darker contact patch where
   * it meets the ground. Both are crisp pixel shapes; overlapping shadows merge.
   */
  private bakeShadows(): [HTMLCanvasElement, HTMLCanvasElement] {
    const W = COLS * TILE, H = ROWS * TILE;
    const [cast, cg] = makeCanvas(W, H);
    const [contact, kg] = makeCanvas(W, H);
    cg.imageSmoothingEnabled = true;
    kg.imageSmoothingEnabled = true;
    const sil = new Map<string, HTMLCanvasElement>();
    const silhouette = (name: string) => {
      let s = sil.get(name);
      if (!s) {
        const f = this.scene.textures.getFrame('meadow', name);
        const [sc, sg] = makeCanvas(f.cutWidth, f.cutHeight);
        sg.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
        sg.globalCompositeOperation = 'source-in';
        sg.fillStyle = '#000000';
        sg.fillRect(0, 0, f.cutWidth, f.cutHeight);
        sil.set(name, (s = sc));
      }
      return s;
    };
    // cast shadows: tall things throw a longer one; low things (rocks, props) barely any
    const SQUASH: Partial<Record<Placed['kind'], number>> = { tree: 0.34, bush: 0.36, wall: 0.36, pillar: 0.3, rock: 0.28, prop: 0.32, decal: 0.3 };
    cg.fillStyle = '#000000';
    kg.fillStyle = '#000000';
    for (const o of this.map.objects) {
      if (!o.frame || o.kind === 'lily') continue;
      const s = silhouette(o.frame);
      if (o.shadow) {
        const sh = Math.max(3, Math.round(s.height * (SQUASH[o.kind] ?? 0.36)));
        const sw = s.width + 2;
        const dx = o.kind === 'tree' ? Math.round(s.height * 0.07) + 1 : 1;
        const dy = Math.round(sh * 0.3);
        cg.drawImage(s, Math.round(o.x - sw / 2 + dx), Math.round(o.y - sh + dy), sw, sh);
      }
      // contact shadow: where it touches the ground. For trees, round the trunk; for everything
      // else its own outline pressed flat and tucked right under its bottom edge, so it sits IN
      // the grass instead of on a separate patch.
      if (o.kind === 'tree') {
        const f = o.foot;
        if (f) {
          kg.beginPath();
          kg.ellipse(f.x + 1, f.y + f.hd * 0.45, f.hw + 2, f.hd + 1, 0, 0, Math.PI * 2);
          kg.fill();
        }
      } else {
        const ch = Math.max(2, Math.round(s.height * 0.16));
        kg.drawImage(s, Math.round(o.x - s.width / 2 - 1), Math.round(o.y - ch + 2), s.width + 2, ch);
      }
    }
    // keep them crisp: every pixel either in shadow or not
    for (const [canvas, g] of [[cast, cg], [contact, kg]] as const) {
      const img = g.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 12;
        d[i + 1] = 30;
        d[i + 2] = 22;
      }
      g.putImageData(img, 0, 0);
    }
    return [cast, contact];
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
      if (o.kind === 'bush') {
        this.bushes.push({ data: o, image: img, w: img.width, h: img.height, shake: 0, inside: false, seed: Math.random() * 10 });
      }
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
    // the sunlight breathes very slowly, as if thin cloud were passing
    this.sun.setAlpha(0.85 + Math.sin(time * 0.35) * 0.15);
    this.ponds.update(dt);
    this.updateBushes(dt, px, py);
  }

  /** Bushes you walk through rustle: they shiver, settle, and shed a leaf or two. */
  private updateBushes(dt: number, px: number, py: number): void {
    this.bushTime += dt;
    for (const b of this.bushes) {
      const inside = Math.abs(px - b.data.x) < b.w * 0.42 && py < b.data.y + 3 && py > b.data.y - b.h * 0.55;
      if (!inside && !b.inside && b.shake === 0) continue;
      if (inside && !b.inside) {
        b.shake = 1;
        this.leaves(b.data.x, b.data.y - b.h * 0.6, b.w);
      }
      if (inside && this.moving) b.shake = Math.max(b.shake, 0.55);
      b.inside = inside;
      if (b.shake > 0) {
        b.shake = Math.max(0, b.shake - dt * 1.8);
        const wob = Math.sin(this.bushTime * 26 + b.seed) * b.shake;
        b.image.setRotation(wob * 0.07);
        b.image.setScale(1 + wob * 0.03, 1 - Math.abs(wob) * 0.03);
      } else if (b.image.rotation !== 0) {
        b.image.setRotation(0).setScale(1);
      }
    }
  }

  /** Set by the scene each frame: is the player walking? */
  moving = false;

  private leaves(x: number, y: number, w: number): void {
    for (let i = 0; i < 3; i++) {
      const leaf = this.scene.add
        .rectangle(x + (Math.random() - 0.5) * w * 0.6, y + Math.random() * 4, 2, 1, Math.random() < 0.5 ? 0x3f8a34 : 0x6fbf4a)
        .setDepth(y + 40);
      this.scene.tweens.add({
        targets: leaf,
        x: leaf.x + (Math.random() - 0.5) * 14,
        y: leaf.y + 10 + Math.random() * 8,
        angle: (Math.random() - 0.5) * 360,
        alpha: 0,
        duration: 700 + Math.random() * 500,
        ease: 'Sine.easeIn',
        onComplete: () => leaf.destroy(),
      });
    }
  }
}
