import * as Phaser from 'phaser';
import { makeCanvas, rng } from '../art/pixel';
import { COLS, ROWS, T, TILE, vertexAt, type MeadowMap } from './meadowMap';

/** Frames in one loop of the water animation, and how fast it plays. */
const FRAMES = 12;
const FPS = 6;

const SHALLOW = [0x6c, 0xc4, 0xd8];
const MID = [0x2f, 0x86, 0xbc];
const DEEP = [0x1b, 0x4c, 0x8a];
const CREST = [0xd8, 0xf4, 0xff];

interface Pond {
  image: Phaser.GameObjects.Image;
}

interface LilyPad {
  image: Phaser.GameObjects.Image;
  shade: Phaser.GameObjects.Ellipse;
  x: number;
  y: number;
  seed: number;
}

/** Smooth value noise, used for the looping surface pattern. */
function noise(seed: number) {
  const h = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/**
 * Living ponds. Each pond is pre-rendered into a short seamless loop (played as
 * a sprite over the baked ground): water coloured by depth - pale near the shore,
 * deep blue in the middle - the trees and stones on the bank reflected upside
 * down and wobbling, light crests drifting over the surface and foam lapping at
 * the bank. Lily pads float on top, drifting, turning and bobbing, now and then
 * sending out a ripple.
 */
export class Ponds {
  private readonly ponds: Pond[] = [];
  private readonly lilies: LilyPad[] = [];
  private time = 0;
  private frame = 0;
  private rippleT = 1;
  private readonly r = rng(17);

  constructor(private readonly scene: Phaser.Scene, private readonly map: MeadowMap, ground: HTMLCanvasElement) {
    const g = ground.getContext('2d', { willReadFrequently: true })!;
    for (const [i, box] of this.findPonds().entries()) {
      const key = `pond${i}`;
      const sheet = this.renderPond(g, box);
      const tex = scene.textures.addCanvas(key, sheet.canvas)!;
      for (let f = 0; f < FRAMES; f++) tex.add(`f${f}`, 0, (f % sheet.cols) * box.w, Math.floor(f / sheet.cols) * box.h, box.w, box.h);
      const image = scene.add.image(box.x, box.y, key, 'f0').setOrigin(0, 0).setDepth(0.5);
      this.ponds.push({ image });
    }
    scene.textures.addCanvas('ripple', rippleTexture());
  }

  /** Bounding boxes (px) of each body of water, from the terrain corners. */
  private findPonds(): { x: number; y: number; w: number; h: number }[] {
    const seen = new Set<number>();
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const W = COLS + 1;
    for (let y = 0; y <= ROWS; y++) {
      for (let x = 0; x <= COLS; x++) {
        if (seen.has(y * W + x) || vertexAt(this.map, x, y) !== T.Water) continue;
        let x0 = x, x1 = x, y0 = y, y1 = y;
        const stack = [[x, y]];
        seen.add(y * W + x);
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
          for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
            if (nx < 0 || ny < 0 || nx > COLS || ny > ROWS || seen.has(ny * W + nx) || vertexAt(this.map, nx, ny) !== T.Water) continue;
            seen.add(ny * W + nx);
            stack.push([nx, ny]);
          }
        }
        const px0 = Math.max(0, (x0 - 1) * TILE), py0 = Math.max(0, (y0 - 1) * TILE);
        const px1 = Math.min(COLS * TILE, (x1 + 1) * TILE), py1 = Math.min(ROWS * TILE, (y1 + 1) * TILE);
        boxes.push({ x: px0, y: py0, w: px1 - px0, h: py1 - py0 });
      }
    }
    return boxes;
  }

  private renderPond(g: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }) {
    const { x: bx, y: by, w, h } = box;
    const src = g.getImageData(bx, by, w, h).data;
    const n = w * h;

    // which pixels are water (the tiles' blue), and how far each is from the shore
    const water = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = src[i * 4], gg = src[i * 4 + 1], b = src[i * 4 + 2];
      water[i] = b > r + 25 && b >= gg - 6 ? 1 : 0;
    }
    const depth = new Float32Array(n).fill(0);
    {
      const INF = 1e9;
      const d = new Float32Array(n).fill(INF);
      const q: number[] = [];
      for (let i = 0; i < n; i++) if (!water[i]) { d[i] = 0; q.push(i); }
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi], x = i % w, y = (i / w) | 0;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
        }
      }
      for (let i = 0; i < n; i++) depth[i] = Math.min(d[i], 40);
    }

    // reflections: things on the bank, mirrored about their base line
    const [, rg] = makeCanvas(w, h);
    for (const o of this.map.objects) {
      if (!o.frame || o.kind === 'lily' || o.kind === 'decal') continue;
      const f = this.scene.textures.getFrame('meadow', o.frame);
      if (o.x + f.cutWidth < bx || o.x - f.cutWidth > bx + w || o.y + f.cutHeight < by || o.y - 4 > by + h) continue;
      rg.save();
      rg.translate(Math.round(o.x - bx), Math.round(o.y - by));
      rg.scale(1, -1);
      rg.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, -Math.round(f.cutWidth / 2), -f.cutHeight, f.cutWidth, f.cutHeight);
      rg.restore();
    }
    const refl = rg.getImageData(0, 0, w, h).data;

    const cols = Math.min(FRAMES, Math.max(1, Math.floor(4000 / w)));
    const rows = Math.ceil(FRAMES / cols);
    const [sheet, sg] = makeCanvas(w * cols, h * rows);
    const out = sg.createImageData(w, h);
    const o = out.data;
    const nz = noise(3);
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;

    for (let f = 0; f < FRAMES; f++) {
      const ph = (f / FRAMES) * Math.PI * 2;
      const cx = Math.cos(ph), sx = Math.sin(ph);
      for (let y = 0; y < h; y++) {
        // each row sways a little sideways: the reflection and the surface ripple
        const sway = Math.round(Math.sin(y * 0.55 + ph) * 0.9 + Math.sin(y * 0.17 - 2 * ph) * 0.7);
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const p = i * 4;
          if (!water[i]) { o[p + 3] = 0; continue; }
          const dd = depth[i];
          // base: the tile's own texture tinted by depth
          let sx2 = x + sway;
          if (sx2 < 0 || sx2 >= w || !water[y * w + sx2]) sx2 = x;
          const si = (y * w + sx2) * 4;
          const k = Math.min(1, dd / 18);
          const tint = k < 0.35 ? SHALLOW.map((c, j) => mix(c, MID[j], k / 0.35)) : MID.map((c, j) => mix(c, DEEP[j], (k - 0.35) / 0.65));
          let r = mix(src[si], tint[0], 0.65);
          let gg = mix(src[si + 1], tint[1], 0.65);
          let b = mix(src[si + 2], tint[2], 0.65);
          // reflection of the bank, darkened and blued, rippling with the rows
          const ri = (y * w + Math.min(w - 1, Math.max(0, x + sway))) * 4;
          const ra = refl[ri + 3] / 255;
          if (ra > 0) {
            const a = ra * 0.42;
            r = mix(r, refl[ri] * 0.55, a);
            gg = mix(gg, refl[ri + 1] * 0.62, a);
            b = mix(b, refl[ri + 2] * 0.7 + 40, a);
          }
          // light crests: thin horizontal glints that drift and break up
          const wave = Math.sin(y * 0.8 + nz(x * 0.07 + cx * 1.5, y * 0.11 + sx * 1.5) * 9 + ph);
          const brk = nz(x * 0.2 + cx * 2.2, y * 0.6 + sx * 2.2);
          if (dd > 3 && wave > 0.95 && brk > 0.58) {
            const a = 0.5 * (wave - 0.95) / 0.05 + 0.2;
            r = mix(r, CREST[0], a); gg = mix(gg, CREST[1], a); b = mix(b, CREST[2], a);
          }
          // foam lapping at the bank
          if (dd <= 1.5) {
            const lap = Math.sin(x * 0.45 + y * 0.3 - ph * 2) * 0.5 + 0.5;
            const a = 0.15 + lap * 0.35;
            r = mix(r, 235, a); gg = mix(gg, 248, a); b = mix(b, 255, a);
          } else if (dd <= 3) {
            r = mix(r, SHALLOW[0], 0.3); gg = mix(gg, SHALLOW[1], 0.3); b = mix(b, SHALLOW[2], 0.3);
          }
          o[p] = r; o[p + 1] = gg; o[p + 2] = b; o[p + 3] = 255;
        }
      }
      sg.putImageData(out, (f % cols) * w, Math.floor(f / cols) * h);
    }
    return { canvas: sheet, cols };
  }

  /** Lily pads (the map's 'lily' sprites) taken over so they float. */
  adoptLilies(images: Phaser.GameObjects.Image[]): void {
    for (const image of images) {
      const shade = this.scene.add.ellipse(image.x + 1, image.y + 2, image.width * 0.9, image.height * 0.6, 0x0b2a44, 0.28).setDepth(1.4);
      image.setDepth(1.5);
      this.lilies.push({ image, shade, x: image.x, y: image.y, seed: this.r() * 100 });
    }
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    const f = Math.floor(t * FPS) % FRAMES;
    if (f !== this.frame) {
      this.frame = f;
      for (const p of this.ponds) p.image.setFrame(`f${f}`);
    }
    // lilies drift in slow loops, turn a little and bob (a gentle squash as a swell passes)
    for (const l of this.lilies) {
      const s = l.seed;
      const x = l.x + Math.sin(t * 0.31 + s) * 2.2 + Math.sin(t * 0.13 + s * 2) * 1.2;
      const y = l.y + Math.sin(t * 0.23 + s * 1.3) * 1.4;
      const bob = Math.sin(t * 1.7 + s * 3);
      l.image.setPosition(x, y + bob * 0.25);
      l.image.setRotation(Math.sin(t * 0.37 + s) * 0.18);
      l.image.setScale(1 + bob * 0.025, 1 - bob * 0.04);
      l.shade.setPosition(x + 1, y + 2);
    }
    // now and then a pad rocks and sends a ring across the water
    this.rippleT -= dt;
    if (this.rippleT <= 0 && this.lilies.length) {
      this.rippleT = 0.6 + this.r() * 1.4;
      const l = this.lilies[Math.floor(this.r() * this.lilies.length)];
      const view = this.scene.cameras.main.worldView;
      if (view.contains(l.image.x, l.image.y)) this.ripple(l.image.x, l.image.y + 2);
    }
  }

  private ripple(x: number, y: number): void {
    const ring = this.scene.add.image(x, y, 'ripple').setDepth(1.45).setAlpha(0.7).setScale(0.3);
    this.scene.tweens.add({
      targets: ring,
      scale: 1.4,
      alpha: 0,
      duration: 1800,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
}

/** A flat pixel ring (an ellipse outline) for ripples. */
function rippleTexture(): HTMLCanvasElement {
  const W = 33, H = 15;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = '#dff6ff';
  const cx = (W - 1) / 2, cy = (H - 1) / 2, rx = cx, ry = cy;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d <= 1 && d > 1 - 1.3 / ry) g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
