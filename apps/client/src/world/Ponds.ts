import { TEX } from '../art/texPrefix';
import * as Phaser from 'phaser';
import { makeCanvas, rng } from '../art/pixel';
import { T, TILE, vertexAt, waterAt, type MeadowMap } from './meadowMap';

/** How often the water surface is redrawn - with continuous time, 30 fps like pixelfx. */
const WATER_FPS = 30;

const SHALLOW = [0x52, 0xe0, 0xd0]; // glowing turquoise near the shore
const MID = [0x22, 0x9e, 0xcc];
const DEEP = [0x16, 0x4a, 0xa8]; // deep blue in the middle
const CREST = [0xc4, 0xff, 0xf4];
const FOAM = [0xd6, 0xff, 0xf2];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const pack = (r: number, g: number, b: number) => (255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r);

/** Smooth value noise. */
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

/** One body of water, redrawn live: everything that never changes is worked out once. */
class PondSurface {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly out: Uint32Array;
  private readonly water: Uint8Array;
  private readonly cells: Int32Array; // indices of water pixels
  private readonly color: Uint32Array; // depth-tinted water + reflection, packed
  private readonly cr: Float32Array; // the same colour unpacked, for crest blending
  private readonly cg: Float32Array;
  private readonly cb: Float32Array;
  private readonly phaseA: Float32Array; // crest pattern
  private readonly phaseB: Float32Array; // where crests break up
  private readonly deep: Uint8Array; // far enough from the bank for crests
  private readonly edge: Int32Array; // pixels touching the bank (foam)

  constructor(scene: Phaser.Scene, key: string, readonly box: { x: number; y: number; w: number; h: number }, src: Uint8ClampedArray, refl: Uint8ClampedArray) {
    const { w, h } = box;
    const n = w * h;
    this.water = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
      this.water[i] = b > r + 25 && b >= g - 6 ? 1 : 0;
    }
    // distance to the bank
    const dist = new Float32Array(n).fill(1e9);
    const q: number[] = [];
    for (let i = 0; i < n; i++) if (!this.water[i]) { dist[i] = 0; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % w, y = (i / w) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); }
      }
    }
    const nz = noise(3);
    const cells: number[] = [];
    const edge: number[] = [];
    this.color = new Uint32Array(n);
    this.cr = new Float32Array(n);
    this.cg = new Float32Array(n);
    this.cb = new Float32Array(n);
    this.phaseA = new Float32Array(n);
    this.phaseB = new Float32Array(n);
    this.deep = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!this.water[i]) continue;
      cells.push(i);
      const x = i % w, y = (i / w) | 0, d = dist[i];
      const k = Math.min(1, d / 18);
      const tint = k < 0.35 ? SHALLOW.map((c, j) => mix(c, MID[j], k / 0.35)) : MID.map((c, j) => mix(c, DEEP[j], (k - 0.35) / 0.65));
      // The surface is painted here, not taken from the tiles (their texture repeats every 16 px):
      // depth colour with broad, soft light and dark patches, as if from the sky and the pond bed.
      const patch = (nz(x * 0.035 + 7, y * 0.05 + 3) - 0.5) * 0.16 + (nz(x * 0.11, y * 0.16 + 9) - 0.5) * 0.05;
      let r = tint[0] * (1 + patch);
      let g = tint[1] * (1 + patch);
      let b = tint[2] * (1 + patch * 0.7);
      if (d <= 3 && d > 1.5) { r = mix(r, SHALLOW[0], 0.3); g = mix(g, SHALLOW[1], 0.3); b = mix(b, SHALLOW[2], 0.3); }
      const ra = (refl[i * 4 + 3] / 255) * 0.42;
      if (ra > 0) {
        r = mix(r, refl[i * 4] * 0.55, ra);
        g = mix(g, refl[i * 4 + 1] * 0.62, ra);
        b = mix(b, refl[i * 4 + 2] * 0.7 + 40, ra);
      }
      this.cr[i] = r; this.cg[i] = g; this.cb[i] = b;
      this.color[i] = pack(r, g, b);
      this.phaseA[i] = y * 0.8 + nz(x * 0.07, y * 0.11) * 9;
      this.phaseB[i] = nz(x * 0.2 + 40, y * 0.6) * 12;
      this.deep[i] = d > 3 ? 1 : 0;
      if (d <= 1.5) edge.push(i);
    }
    this.cells = Int32Array.from(cells);
    this.edge = Int32Array.from(edge);

    this.texture = scene.textures.createCanvas(key, w, h)!;
    const canvas = this.texture.getSourceImage() as HTMLCanvasElement;
    this.ctx = canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(w, h);
    this.out = new Uint32Array(this.img.data.buffer);
    this.image = scene.add.image(box.x, box.y, key).setOrigin(0, 0).setDepth(0.5);
    this.draw(0);
  }

  /** Is this pond pixel water? (for keeping lilies afloat) */
  isWater(px: number, py: number): boolean {
    const x = Math.round(px - this.box.x), y = Math.round(py - this.box.y);
    if (x < 0 || y < 0 || x >= this.box.w || y >= this.box.h) return false;
    return this.water[y * this.box.w + x] === 1;
  }

  draw(t: number): void {
    const { w, h } = this.box;
    const out = this.out, color = this.color, water = this.water;
    // each row sways sideways a little, at its own moment: the surface and the reflection ripple
    const sway = new Int8Array(h);
    for (let y = 0; y < h; y++) sway[y] = Math.round(Math.sin(y * 0.5 + t * 1.7) * 0.85 + Math.sin(y * 0.16 - t * 1.1) * 0.65);
    const tA = t * 1.15, tB = t * 0.55;
    for (let c = 0; c < this.cells.length; c++) {
      const i = this.cells[c];
      const y = (i / w) | 0;
      let j = i + sway[y];
      if (!water[j]) j = i;
      // light crests: thin glinting lines that slide smoothly across the water and break up
      if (this.deep[i]) {
        const s = Math.sin(this.phaseA[i] + tA);
        if (s > 0.975 && Math.sin(this.phaseB[i] + tB) > 0.7) {
          const a = 0.25 + 0.55 * ((s - 0.975) / 0.025);
          out[i] = pack(mix(this.cr[j], CREST[0], a), mix(this.cg[j], CREST[1], a), mix(this.cb[j], CREST[2], a));
          continue;
        }
      }
      out[i] = color[j];
    }
    // foam lapping at the bank
    for (let c = 0; c < this.edge.length; c++) {
      const i = this.edge[c];
      const x = i % w, y = (i / w) | 0;
      const a = 0.15 + (Math.sin(x * 0.45 + y * 0.3 - t * 2.3) * 0.5 + 0.5) * 0.4;
      out[i] = pack(mix(this.cr[i], FOAM[0], a), mix(this.cg[i], FOAM[1], a), mix(this.cb[i], FOAM[2], a));
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.texture.refresh();
  }
}

/** A ring spreading over the water, drawn crisp pixel by pixel every frame so it grows smoothly. */
class Ripple {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly out: Uint32Array;
  age = 0;
  private readonly W = 64;
  private readonly H = 24;

  constructor(scene: Phaser.Scene, key: string, private readonly size: number) {
    this.texture = scene.textures.createCanvas(key, this.W, this.H)!;
    this.ctx = (this.texture.getSourceImage() as HTMLCanvasElement).getContext('2d')!;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.out = new Uint32Array(this.img.data.buffer);
    this.image = scene.add.image(0, 0, key).setDepth(1.45).setVisible(false);
  }

  get alive(): boolean {
    return this.image.visible;
  }

  start(x: number, y: number): void {
    this.age = 0;
    this.image.setPosition(Math.round(x), Math.round(y)).setVisible(true);
  }

  update(dt: number): void {
    if (!this.image.visible) return;
    this.age += dt;
    const LIFE = 1.6;
    if (this.age >= LIFE) {
      this.image.setVisible(false);
      return;
    }
    const k = this.age / LIFE;
    const out = this.out;
    out.fill(0);
    const cx = this.W / 2, cy = this.H / 2;
    // two rings, the second trailing; each eases out and fades
    for (const [delay, strength] of [[0, 1], [0.22, 0.6]]) {
      const kk = (k - delay) / (1 - delay);
      if (kk <= 0) continue;
      const R = 2 + (this.size - 2) * (1 - Math.pow(1 - kk, 3));
      const power = Math.pow(1 - kk, 1.4) * strength;
      for (let y = 0; y < this.H; y++) {
        for (let x = 0; x < this.W; x++) {
          const e = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / 0.38);
          const d = Math.abs(e - R);
          if (d > 1.1) continue;
          const a = Math.round(255 * power * (1 - d / 1.1) * 0.9);
          const p = y * this.W + x;
          const prev = out[p] >>> 24;
          if (a > prev) out[p] = (a << 24) | (0xff << 16) | (0xf6 << 8) | 0xe2; // pale blue-white
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.texture.refresh();
  }
}

interface LilyPad {
  image: Phaser.GameObjects.Image;
  shade: Phaser.GameObjects.Ellipse;
  ax: number; // where it likes to be
  ay: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  seed: number;
}

/**
 * Living ponds, redrawn live at 30 fps so everything moves smoothly: water
 * coloured by depth - pale near the shore, deep blue in the middle - the bank
 * reflected and swaying, light crests sliding across the surface and foam
 * lapping at the bank; lily pads that
 * drift on a gentle current, nudge each other apart, turn when they bump and
 * send out rings.
 */
export class Ponds {
  private readonly surfaces: PondSurface[] = [];
  private readonly lilies: LilyPad[] = [];
  private readonly ripples: Ripple[] = [];
  private time = 0;
  private acc = 0;
  private rippleT = 1;
  private readonly r = rng(17);

  constructor(private readonly scene: Phaser.Scene, private readonly map: MeadowMap, ground: HTMLCanvasElement) {
    const g = ground.getContext('2d', { willReadFrequently: true })!;
    this.findPonds().forEach((box, i) => {
      const src = g.getImageData(box.x, box.y, box.w, box.h).data;
      this.surfaces.push(new PondSurface(scene, `${TEX}pond${i}`, box, src, this.reflections(box)));
    });
    for (let i = 0; i < 6; i++) this.ripples.push(new Ripple(scene, `${TEX}ripple${i}`, 14));
  }

  /** Bounding boxes (px) of each body of water, from the terrain corners. */
  private findPonds(): { x: number; y: number; w: number; h: number }[] {
    const seen = new Set<number>();
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const W = this.map.cols + 1;
    for (let y = 0; y <= this.map.rows; y++) {
      for (let x = 0; x <= this.map.cols; x++) {
        if (seen.has(y * W + x) || vertexAt(this.map, x, y) !== T.Water) continue;
        let x0 = x, x1 = x, y0 = y, y1 = y;
        const stack = [[x, y]];
        seen.add(y * W + x);
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
          for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
            if (nx < 0 || ny < 0 || nx > this.map.cols || ny > this.map.rows || seen.has(ny * W + nx) || vertexAt(this.map, nx, ny) !== T.Water) continue;
            seen.add(ny * W + nx);
            stack.push([nx, ny]);
          }
        }
        const px0 = Math.max(0, (x0 - 1) * TILE), py0 = Math.max(0, (y0 - 1) * TILE);
        const px1 = Math.min(this.map.cols * TILE, (x1 + 1) * TILE), py1 = Math.min(this.map.rows * TILE, (y1 + 1) * TILE);
        boxes.push({ x: px0, y: py0, w: px1 - px0, h: py1 - py0 });
      }
    }
    return boxes;
  }

  /** Things on the bank, mirrored about their base line, for the water to reflect. */
  private reflections(box: { x: number; y: number; w: number; h: number }): Uint8ClampedArray {
    const [, rg] = makeCanvas(box.w, box.h);
    for (const o of this.map.objects) {
      if (!o.frame || o.kind === 'lily' || o.kind === 'decal') continue;
      const f = this.scene.textures.getFrame('meadow', o.frame);
      if (o.x + f.cutWidth < box.x || o.x - f.cutWidth > box.x + box.w || o.y + f.cutHeight < box.y || o.y - 4 > box.y + box.h) continue;
      rg.save();
      rg.translate(Math.round(o.x - box.x), Math.round(o.y - box.y));
      rg.scale(o.flip ? -1 : 1, -1);
      rg.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, -Math.round(f.cutWidth / 2), -f.cutHeight, f.cutWidth, f.cutHeight);
      rg.restore();
    }
    return rg.getImageData(0, 0, box.w, box.h).data;
  }

  /** Lily pads (the map's 'lily' sprites) taken over so they float. */
  adoptLilies(images: Phaser.GameObjects.Image[]): void {
    for (const image of images) {
      const shade = this.scene.add.ellipse(image.x + 1, image.y + 2, image.width * 0.9, image.height * 0.6, 0x0b2a44, 0.28).setDepth(1.4);
      image.setDepth(1.5);
      this.lilies.push({
        image, shade, ax: image.x, ay: image.y, x: image.x, y: image.y, vx: 0, vy: 0,
        r: Math.max(image.width, image.height) * 0.46, seed: this.r() * 100,
      });
    }
  }

  private afloat(x: number, y: number, r: number): boolean {
    return waterAt(this.map, x, y) > 0.99 && waterAt(this.map, x + r * 0.8, y) > 0.9 && waterAt(this.map, x - r * 0.8, y) > 0.9 && waterAt(this.map, x, y + r * 0.5) > 0.9 && waterAt(this.map, x, y - r * 0.5) > 0.9;
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    const view = this.scene.cameras.main.worldView;

    // the water surface: 30 redraws a second, only for ponds on screen
    this.acc += dt;
    if (this.acc >= 1 / WATER_FPS) {
      this.acc %= 1 / WATER_FPS;
      for (const s of this.surfaces) {
        const b = s.box;
        if (b.x > view.right || b.x + b.w < view.x || b.y > view.bottom || b.y + b.h < view.y) continue;
        s.draw(t);
      }
    }
    for (const r of this.ripples) r.update(dt);

    this.updateLilies(dt, t);

    // now and then a pad rocks and sends a ring out
    this.rippleT -= dt;
    if (this.rippleT <= 0 && this.lilies.length) {
      this.rippleT = 0.7 + this.r() * 1.6;
      const l = this.lilies[Math.floor(this.r() * this.lilies.length)];
      if (view.contains(l.x, l.y)) this.ripple(l.x, l.y + 1);
    }
  }

  private updateLilies(dt: number, t: number): void {
    const L = this.lilies;
    for (const l of L) {
      // a slow, wandering current plus a weak pull back to where it belongs
      const fx = Math.sin(t * 0.21 + l.seed + l.y * 0.03) * 1.1 + (l.ax - l.x) * 0.11;
      const fy = Math.cos(t * 0.17 + l.seed * 1.7 + l.x * 0.03) * 0.7 + (l.ay - l.y) * 0.11;
      l.vx += fx * dt;
      l.vy += fy * dt;
      const damp = Math.exp(-1.2 * dt);
      l.vx *= damp;
      l.vy *= damp;
    }
    // pads never overlap: they push each other apart (they never turn: a pad only drifts)
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j];
        const dx = b.x - a.x, dy = (b.y - a.y) * 1.6; // pads are seen flattened: measure in their plane
        const min = a.r + b.r + 1;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d / 1.6;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          a.vx += nx * rel * 0.5; a.vy += ny * rel * 0.5;
          b.vx -= nx * rel * 0.5; b.vy -= ny * rel * 0.5;
        }
      }
    }
    for (const l of L) {
      const nx = l.x + l.vx * dt, ny = l.y + l.vy * dt;
      if (this.afloat(nx, ny, l.r)) {
        l.x = nx;
        l.y = ny;
      } else {
        // touched the bank: stop and drift back out
        l.vx = (l.ax - l.x) * 0.3;
        l.vy = (l.ay - l.y) * 0.3;
        if (!this.afloat(l.x, l.y, l.r)) { l.x += (l.ax - l.x) * 0.1; l.y += (l.ay - l.y) * 0.1; }
      }
      // it only drifts - up, down, left, right - and bobs a hair on the ripples; never turns or squashes
      const bob = Math.sin(t * 1.6 + l.seed * 3);
      l.image.setPosition(l.x, l.y + bob * 0.25);
      l.shade.setPosition(l.x + 1, l.y + 2);
    }
  }

  private ripple(x: number, y: number): void {
    const free = this.ripples.find((r) => !r.alive);
    free?.start(x, y);
  }
}
