import { TEX } from '../art/texPrefix';
import * as Phaser from 'phaser';
import { makeCanvas, rng } from '../art/pixel';
import { gradeCanvas } from '../art/grade';
import { Ponds } from './Ponds';
import { BEYOND, T, TILE, vertexAt, type Footprint, type MeadowMap, type Placed } from './meadowMap';

interface TileTable {
  tiles: Record<string, [number, number]>;
}
export type TileLookup = Record<'water' | 'path' | 'dark' | 'cobble', TileTable>;

/** An object standing on the map (tree, wall, ...) that can fade when the player walks behind it. */
export interface StandingThing {
  data: Placed;
  image: Phaser.GameObjects.Image;
  bounds: Phaser.Geom.Rectangle;
}

/** World px per texel of the light maps. */
const LIGHT_RES = 4;

/** Which way and how far shadows fall per px of height: the sun is high, up and to the left. */
const SUN_X = 0.42;
const SUN_Y = 0.24;

/** Things that lie flat on the ground (a ring of stones, a map, kindling): drawn on the ground layer, no shadow. */
export const FLAT = new Set(['smallpit', 'mapscroll', 'kindling']);


/**
 * Draws the meadow: the ground (autotiled terrain + ground decals) and the cast
 * shadows are baked into two big textures once; the objects are sprites so
 * they sort by depth with the characters.
 */
export class MeadowView {
  readonly things: StandingThing[] = [];
  readonly lilies: Phaser.GameObjects.Image[] = [];
  /** Everything that stands on an outline, for depth sorting against the player. */
  private readonly standing: { foot: Footprint; image: Phaser.GameObjects.Image; bounds: Phaser.Geom.Rectangle; near: boolean }[] = [];
  private readonly images = new Map<Placed, Phaser.GameObjects.Image>();
  /** Things drawn with an object (a fire in its pit): they keep its depth, plus an offset. */
  private readonly followers: { owner: Phaser.GameObjects.Image; image: Phaser.GameObjects.Image; offset: number }[] = [];

  /** Its textures' name prefix (art/texPrefix.ts). */
  private readonly px = TEX;

  constructor(private readonly scene: Phaser.Scene, private readonly map: MeadowMap) {
    const lookup = scene.cache.json.get('tiles') as TileLookup;
    const ground = gradeCanvas(this.bakeGround(lookup));
    scene.textures.addCanvas(this.px + 'ground', ground);
    scene.add.image(0, 0, this.px + 'ground').setOrigin(0, 0).setDepth(0);
    this.bakeBeyond(lookup);
    this.ponds = new Ponds(scene, map, ground);
    const [cast, contact] = this.bakeShadows();
    scene.textures.addCanvas(this.px + 'shadows', cast);
    scene.add.image(0, 0, this.px + 'shadows').setOrigin(0, 0).setDepth(1).setAlpha(0.26);
    scene.textures.addCanvas(this.px + 'contact', contact);
    scene.add.image(0, 0, this.px + 'contact').setOrigin(0, 0).setDepth(1.1).setAlpha(0.3);
    // Light that belongs to the level: shade under the woods, warm sun pooling in the clearings.
    const [shade, sun] = this.bakeLight();
    scene.textures.addCanvas(this.px + 'shade', shade)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    scene.add.image(0, 0, this.px + 'shade').setOrigin(0, 0).setScale(LIGHT_RES).setDepth(1.2).setBlendMode(Phaser.BlendModes.MULTIPLY);
    scene.textures.addCanvas(this.px + 'sunlight', sun)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.sun = scene.add.image(0, 0, this.px + 'sunlight').setOrigin(0, 0).setScale(LIGHT_RES).setDepth(1.3).setBlendMode(Phaser.BlendModes.ADD);
    this.placeObjects();
    this.ponds.adoptLilies(this.lilies);
  }

  private readonly sun: Phaser.GameObjects.Image;
  private readonly ponds: Ponds;
  private readonly bushes: { data: Placed; image: Phaser.GameObjects.Image; w: number; h: number; shake: number; inside: boolean; seed: number }[] = [];
  private bushTime = 0;

  /** Low-resolution light maps (one texel = LIGHT_RES px), smoothed when drawn. */
  private bakeLight(): [HTMLCanvasElement, HTMLCanvasElement] {
    const W = Math.ceil((this.map.cols * TILE) / LIGHT_RES);
    const H = Math.ceil((this.map.rows * TILE) / LIGHT_RES);
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
    for (let y = 0; y < this.map.rows * TILE; y += 44) {
      for (let x = 0; x < this.map.cols * TILE; x += 44) {
        const px = x + (r() - 0.5) * 30, py = y + (r() - 0.5) * 30;
        const d = nearestTree(px, py);
        if (d > 95) blob(ug, px, py, 80, '205,255,215', 0.06);
        else if (d > 34 && r() < 0.5) blob(ug, px, py, 10 + r() * 8, '225,255,220', 0.15);
      }
    }
    // both fade out over the last few tiles before the map's edges: the ground past the edges has neither,
    // so nothing stops in a line there
    const FADE = 72 / LIGHT_RES;
    for (const [g, light] of [[sg, false], [ug, true]] as const) {
      const img = g.getImageData(0, 0, W, H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const k = Math.min(1, Math.min(x + 0.5, W - x - 0.5, y + 0.5, H - y - 0.5) / FADE);
          if (k >= 1) continue;
          const f = k * k * (3 - 2 * k), i = (y * W + x) * 4;
          if (light) img.data[i + 3] *= f;
          else for (let j = 0; j < 3; j++) img.data[i + j] = 255 - (255 - img.data[i + j]) * f;
        }
      g.putImageData(img, 0, 0);
    }
    return [shade, sun];
  }

  private sourceOf(key: string): CanvasImageSource {
    return this.scene.textures.get(key).getSourceImage() as CanvasImageSource;
  }

  private bakeGround(lookup: TileLookup): HTMLCanvasElement {
    const [c, g] = makeCanvas(this.map.cols * TILE, this.map.rows * TILE);
    this.drawTiles(g, lookup, 0, 0, this.map.cols, this.map.rows, 0, 0, (x, y) => vertexAt(this.map, x, y));
    // ground decals (flowers, tufts, pebbles), pixel aligned
    for (const d of this.map.decals) {
      const f = this.scene.textures.getFrame('meadow', d.frame);
      g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, Math.round(d.x - f.cutWidth / 2), Math.round(d.y - f.cutHeight / 2), f.cutWidth, f.cutHeight);
    }
    return c;
  }

  /**
   * The ground past the map's edges, BEYOND px all round (the camera may look a little past the edges, so
   * the menus never cover what's at them): the edge's own terrain carried straight on - a road leaving the
   * map keeps going - fading into the dark. Four strips, so the middle isn't drawn twice.
   */
  private bakeBeyond(lookup: TileLookup): void {
    const B = BEYOND / TILE, C = this.map.cols, R = this.map.rows;
    const vert = (x: number, y: number) => vertexAt(this.map, Math.max(0, Math.min(C, x)), Math.max(0, Math.min(R, y)));
    const dark = [12, 24, 17];
    const strips: [string, number, number, number, number][] = [
      [this.px + 'beyond_n', -B, -B, C + B, 0],
      [this.px + 'beyond_s', -B, R, C + B, R + B],
      [this.px + 'beyond_w', -B, 0, 0, R],
      [this.px + 'beyond_e', C, 0, C + B, R],
    ];
    for (const [key, x0, y0, x1, y1] of strips) {
      const [c, g] = makeCanvas((x1 - x0) * TILE, (y1 - y0) * TILE);
      this.drawTiles(g, lookup, x0, y0, x1, y1, -x0 * TILE, -y0 * TILE, vert);
      // fading out the further it is from the map
      const img = g.getImageData(0, 0, c.width, c.height);
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const wx = x + x0 * TILE, wy = y + y0 * TILE;
          const d = Math.hypot(Math.max(0, -wx, wx - C * TILE), Math.max(0, -wy, wy - R * TILE));
          const k = Math.min(1, d / BEYOND);
          const a = 0.9 * k * k * (3 - 2 * k);
          const i = (y * c.width + x) * 4;
          for (let j = 0; j < 3; j++) img.data[i + j] += (dark[j] - img.data[i + j]) * a;
        }
      g.putImageData(img, 0, 0);
      this.scene.textures.addCanvas(key, gradeCanvas(c));
      this.scene.add.image(x0 * TILE, y0 * TILE, key).setOrigin(0, 0).setDepth(0);
    }
    this.edgeVeil();
  }

  /**
   * Dark over the ground you can't walk on: a soft veil over everything at the edge of the world, from a
   * little inside the map's edge (so the light and shade drawn on the map don't stop in a hard line, and
   * the trees at the edge sink into the dark with the ground) to nearly black further out.
   */
  private edgeVeil(): void {
    const W = this.map.cols * TILE, H = this.map.rows * TILE;
    const RES = 8; // px per texel; drawn smoothed
    const IN = 20; // starts this far inside the edge
    const w = Math.ceil((W + 2 * BEYOND) / RES), h = Math.ceil((H + 2 * BEYOND) / RES);
    const [c, g] = makeCanvas(w, h);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const wx = x * RES + RES / 2 - BEYOND, wy = y * RES + RES / 2 - BEYOND;
        // how far out past the line IN px inside the edge
        const d = Math.hypot(Math.max(0, IN - wx, wx - (W - IN)), Math.max(0, IN - wy, wy - (H - IN)));
        if (d <= 0) continue;
        const k = Math.min(1, d / 96);
        const i = (y * w + x) * 4;
        img.data[i] = 8, img.data[i + 1] = 16, img.data[i + 2] = 12;
        img.data[i + 3] = 255 * Math.min(0.94, Math.pow(k, 0.7));
      }
    g.putImageData(img, 0, 0);
    this.scene.textures.addCanvas(this.px + 'edge_veil', c)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    // over the trees and animals at the edge, under the fireflies and the menus
    this.scene.add.image(-BEYOND, -BEYOND, this.px + 'edge_veil').setOrigin(0, 0).setScale(RES).setDepth(9000);
  }

  /** Ground tiles for tiles x0..x1, y0..y1 (exclusive), drawn offset by (ox, oy), terrain from vert. */
  private drawTiles(g: CanvasRenderingContext2D, lookup: TileLookup, x0: number, y0: number, x1: number, y1: number, ox: number, oy: number, vert: (x: number, y: number) => T): void {
    const r = rng(77 + x0 * 7 + y0 * 13);
    // the map's paved terrain is dirt paths (the meadow) or cobbles (the town)
    const src = { water: this.sourceOf('tiles_water'), path: this.sourceOf('tiles_path'), dark: this.sourceOf('tiles_dark'), cobble: this.sourceOf('tiles_cobble') };
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const corners = [vert(x, y), vert(x + 1, y), vert(x, y + 1), vert(x + 1, y + 1)];
        let set: 'water' | 'path' | 'dark' | 'cobble' = 'water';
        let key = '1111'; // plain grass (grass is the water set's upper terrain)
        if (corners.includes(T.Water)) key = corners.map((t) => (t === T.Water ? '0' : '1')).join('');
        else if (corners.includes(T.Path)) (set = this.map.paved), (key = corners.map((t) => (t === T.Path ? '1' : '0')).join(''));
        else if (corners.includes(T.Dark)) (set = 'dark'), (key = corners.map((t) => (t === T.Dark ? '1' : '0')).join(''));
        const pos = lookup[set].tiles[key];
        if (!pos) continue;
        // Plain tiles get mirrored at random so the repeat doesn't show.
        const plain = key === '1111' || key === '0000';
        const flip = plain && r() < 0.5;
        g.save();
        g.translate(ox + x * TILE + (flip ? TILE : 0), oy + y * TILE);
        if (flip) g.scale(-1, 1);
        g.drawImage(src[set], pos[0], pos[1], TILE, TILE, 0, 0, TILE, TILE);
        g.restore();
      }
    }
  }

  /**
   * Shadows, cast by a sun high up to the upper left. In a 3/4 view every pixel of a picture is a point
   * some height above the ground: its height is how far it sits above the line where the object meets
   * the ground (the middle of its footprint, in its column). The sun throws that point down and to
   * the right by its height - so a shadow starts at the object's own base and leans away from the
   * light, long for a tall tree or post, a sliver for a log or a crate. Flat things cast none.
   * Plus a darker contact patch on the footprint itself. Both are crisp pixel shapes; they merge.
   */
  private bakeShadows(): [HTMLCanvasElement, HTMLCanvasElement] {
    const W = this.map.cols * TILE, H = this.map.rows * TILE;
    const mask = new Uint8Array(W * H);
    const put = (x: number, y: number) => {
      const X = Math.round(x), Y = Math.round(y);
      if (X >= 0 && Y >= 0 && X < W && Y < H) mask[Y * W + X] = 1;
    };
    // the pictures' solid pixels, read once per frame
    const atlas = this.scene.textures.get('meadow');
    const src = atlas.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const [, ag] = makeCanvas(src.width, src.height);
    ag.drawImage(src, 0, 0);
    const pix = ag.getImageData(0, 0, src.width, src.height).data;
    const solid = (frame: string, flip = false) => {
      const f = atlas.get(frame);
      const w = f.cutWidth;
      return { w, h: f.cutHeight, at: (x: number, y: number) => pix[((f.cutY + y) * src.width + f.cutX + (flip ? w - 1 - x : x)) * 4 + 3] > 100 };
    };

    for (const o of this.map.objects) {
      if (!o.frame || o.kind === 'lily' || o.shadow === false || FLAT.has(o.frame)) continue;
      const pic = solid(o.frame, o.flip);
      const left = Math.round(o.x) - Math.floor(pic.w / 2), top = Math.round(o.y) - pic.h;
      const foot = o.kind !== 'bush' && o.kind !== 'tree' ? o.foot : undefined;
      for (let x = 0; x < pic.w; x++) {
        const wx = left + x;
        // where this column meets the ground
        let g: number;
        if (o.kind === 'tree') g = Math.round(o.y) - 3;
        else if (foot) g = (edgeAt(foot, wx, true) + edgeAt(foot, wx, false)) / 2;
        else {
          let b = pic.h - 1;
          while (b > 0 && !pic.at(x, b)) b--;
          g = top + b - 1;
        }
        for (let y = 0; y < pic.h; y++) {
          if (!pic.at(x, y)) continue;
          const z = g - (top + y);
          if (z <= 0) put(wx, top + y);
          else put(wx + z * SUN_X, g + z * SUN_Y);
        }
      }
    }
    // the torch stakes and braziers drawn in code
    for (const f of this.map.fires) {
      if (f.kind !== 'torch' && f.kind !== 'brazier') continue;
      const [hw, tall] = f.kind === 'torch' ? [1.5, 30] : [5, 18];
      for (let z = 0; z <= tall; z++) for (let dx = -hw; dx <= hw; dx++) put(f.x + dx + z * SUN_X, f.y - 1 + z * SUN_Y);
    }

    const [cast, cg] = makeCanvas(W, H);
    const img = cg.createImageData(W, H);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const j = i * 4;
      img.data[j] = 12, img.data[j + 1] = 30, img.data[j + 2] = 22, img.data[j + 3] = 255;
    }
    cg.putImageData(img, 0, 0);

    // contact shadow: the footprint itself, a pixel bigger (for a tree, round its trunk)
    const [contact, kg] = makeCanvas(W, H);
    kg.fillStyle = kg.strokeStyle = 'rgb(12,30,22)';
    kg.lineWidth = 2;
    for (const o of this.map.objects) {
      const f = o.foot;
      if (!o.frame || !f || o.kind === 'bush' || o.kind === 'lily' || FLAT.has(o.frame)) continue;
      kg.beginPath();
      for (let i = 0; i < f.poly.length; i += 2) kg[i ? 'lineTo' : 'moveTo'](f.poly[i], f.poly[i + 1]);
      kg.closePath();
      kg.fill();
      kg.stroke();
    }
    // keep it crisp: every pixel either in shadow or not
    const ci = kg.getImageData(0, 0, W, H);
    for (let i = 3; i < ci.data.length; i += 4) ci.data[i] = ci.data[i] > 110 ? 255 : 0;
    kg.putImageData(ci, 0, 0);
    return [cast, contact];
  }

  private placeObjects(): void {
    for (const o of this.map.objects) {
      if (!o.frame) continue;
      const img = this.scene.add.image(Math.round(o.x), Math.round(o.y), 'meadow', o.frame).setOrigin(0.5, 1).setFlipX(!!o.flip);
      if (o.kind === 'lily') {
        img.setOrigin(0.5, 0.5).setDepth(1.5);
        this.lilies.push(img);
        continue;
      }
      this.images.set(o, img);
      // In depth order a thing stands where the front edge of its footprint is - for a house that's
      // the foot of its walls, not the bottom of the rubble painted round it.
      img.setDepth(FLAT.has(o.frame) ? 1.6 : o.foot && o.kind !== 'bush' ? o.foot.front : o.y);
      if (o.foot && o.kind !== 'bush') this.standing.push({ foot: o.foot, image: img, bounds: img.getBounds(), near: false });
      if (o.kind === 'bush') {
        this.bushes.push({ data: o, image: img, w: img.width, h: img.height, shake: 0, inside: false, seed: Math.random() * 10 });
      }
      if (o.kind === 'tree' || o.kind === 'wall' || o.kind === 'pillar' || o.kind === 'house' || o.kind === 'tent') {
        this.things.push({ data: o, image: img, bounds: img.getBounds() });
      }
    }
  }

  /** Draw `image` with `owner` (just in front of it, by `offset`), wherever the owner sorts. */
  follow(owner: Placed, image: Phaser.GameObjects.Image, offset: number): void {
    const o = this.images.get(owner);
    if (o) this.followers.push({ owner: o, image, offset });
  }

  /**
   * Who is in front: where the player overlaps a picture, compare the player's feet with the front
   * edge of that thing's footprint right where the player stands - so you can walk in front of the
   * low end of a slanted bench and behind its high end, or along the side of a house.
   */
  private sortAround(px: number, py: number): void {
    for (const s of this.standing) {
      const b = s.bounds;
      const near = px + 8 > b.x && px - 8 < b.right && py > b.y && py - 34 < b.bottom;
      if (near) {
        // Only correct its usual place in the order where that would be wrong for the player - so it
        // never jumps past other things (the flags in front of the guild hall stay in front of it).
        const usual = s.foot.front;
        s.image.setDepth(py >= frontAt(s.foot, px) ? Math.min(usual, py - 0.25) : Math.max(usual, py + 0.25));
        s.near = true;
      } else if (s.near) {
        s.image.setDepth(s.foot.front);
        s.near = false;
      }
    }
    for (const f of this.followers) f.image.setDepth(f.owner.depth + f.offset);
  }

  /**
   * Where something small standing at (x, y) - a box w wide and h tall above its feet - goes in the draw
   * order: by its feet, but where it overlaps a picture, in front of or behind it by that thing's front
   * edge right at x (as for the player), so an animal by a slanted bench or the corner of a house sorts
   * the way it stands. In front, it also goes past what's drawn with that thing (a fountain's water).
   */
  depthFor(x: number, y: number, w: number, h: number): number {
    let d = y;
    for (const s of this.standing) {
      const b = s.bounds;
      if (x + w / 2 <= b.x || x - w / 2 >= b.right || y <= b.y || y - h >= b.bottom) continue;
      const at = s.image.depth;
      if (y >= frontAt(s.foot, x)) d = Math.max(d, at + 0.6);
      else d = Math.min(d, at - 0.05);
    }
    return d;
  }

  /** Others who should never vanish behind things either (set by the scene each frame): the team leader walking
   * with you, the monster you're fighting. */
  also: { x: number; y: number }[] = [];

  /** Fade trees and walls the player (or anyone in `also`) is standing behind, so they never vanish from view. */
  update(dt: number, px: number, py: number, time: number): void {
    this.sortAround(px, py);
    const hides = (t: (typeof this.things)[number], x: number, y: number) => {
      const f = t.data.foot;
      const front = f ? frontAt(f, x) : t.data.y;
      // a tree's canopy hides you anywhere under it; a house, tent or wall only when you're really behind it
      const across = t.data.kind === 'tree' || !f || Math.abs(x - f.x) < f.hw;
      return across && y < front - 2 && Phaser.Geom.Rectangle.Contains(t.bounds, x, y - 10);
    };
    for (const t of this.things) {
      const behind = hides(t, px, py) || this.also.some((o) => hides(t, o.x, o.y));
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

/** The front (lowest) edge of a footprint at x: where its outline meets the ground nearest the viewer. */
export function frontAt(f: Footprint, x: number): number {
  return edgeAt(f, x, true);
}

/** The front (or back) edge of a footprint at x, x held inside the footprint. */
export function edgeAt(f: Footprint, x: number, front: boolean): number {
  const p = f.poly;
  const cx = Math.max(f.x - f.hw + 0.01, Math.min(f.x + f.hw - 0.01, x));
  let y = front ? -Infinity : Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], ay = p[j + 1], bx = p[i], by = p[i + 1];
    if ((ax <= cx && bx >= cx) || (bx <= cx && ax >= cx)) {
      const t = bx === ax ? 0 : (cx - ax) / (bx - ax);
      const e = ay + (by - ay) * t;
      y = front ? Math.max(y, e) : Math.min(y, e);
    }
  }
  return Number.isFinite(y) ? y : f.front;
}
