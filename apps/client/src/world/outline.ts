import * as Phaser from 'phaser';
import type { Surface } from '../fx/surface';

// A stroke round a picture, pixel by pixel (the monster you're pointing at, ready to fight): a white line hugging its
// edge, a red one outside that. Worked out once per frame of the picture (its alpha read once), then drawn on the
// map's effect layer wherever the picture is, mirrored when it is.

interface Rings {
  w: number;
  h: number;
  /** Just outside the picture (white), and one further out (red): pixel offsets in the frame. */
  inner: number[];
  outer: number[];
}
const cache = new Map<string, Rings>();

function ringsOf(scene: Phaser.Scene, atlas: string, frame: string): Rings | null {
  const key = `${atlas}#${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!scene.textures.exists(atlas) || !scene.textures.get(atlas).has(frame)) return null;
  const f = scene.textures.getFrame(atlas, frame);
  const W = f.cutWidth, H = f.cutHeight;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, W, H, 0, 0, W, H);
  const a = g.getImageData(0, 0, W, H).data;
  // the picture's pixels, in a grid two wider each way (room for the rings)
  const P = 2, GW = W + P * 2, GH = H + P * 2;
  const solid = new Uint8Array(GW * GH);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] >= 128) solid[(y + P) * GW + x + P] = 1;
  const near = (m: Uint8Array, i: number) => {
    const x = i % GW, y = (i - x) / GW;
    return (x > 0 && m[i - 1]) || (x < GW - 1 && m[i + 1]) || (y > 0 && m[i - GW]) || (y < GH - 1 && m[i + GW]);
  };
  const innerM = new Uint8Array(GW * GH);
  const inner: number[] = [], outer: number[] = [];
  for (let i = 0; i < GW * GH; i++) if (!solid[i] && near(solid, i)) (innerM[i] = 1), inner.push(i % GW - P, Math.floor(i / GW) - P);
  for (let i = 0; i < GW * GH; i++) if (!solid[i] && !innerM[i] && near(innerM, i)) outer.push(i % GW - P, Math.floor(i / GW) - P);
  const r = { w: W, h: H, inner, outer };
  cache.set(key, r);
  return r;
}

/** Stroke an image (origin at its bottom middle, as the monsters are drawn) on the surface; t: a clock for the pulse. */
export function drawOutline(s: Surface, img: Phaser.GameObjects.Image, t: number): void {
  const r = ringsOf(img.scene, img.texture.key, String(img.frame.name));
  if (!r) return;
  const left = Math.round(img.x - r.w * img.originX), top = Math.round(img.y - r.h * img.originY);
  const flip = img.flipX;
  const at = (dx: number) => left + (flip ? r.w - 1 - dx : dx);
  const pulse = 0.75 + 0.25 * Math.sin(t * 8);
  for (let i = 0; i < r.outer.length; i += 2) s.px(at(r.outer[i]), top + r.outer[i + 1], 0xe8283a, pulse);
  for (let i = 0; i < r.inner.length; i += 2) s.px(at(r.inner[i]), top + r.inner[i + 1], 0xffffff);
}
