import { makeCanvas, PixelGrid, rowsToCanvas, rng } from './pixel';

// Placeholder scenery for the test map, drawn in code. Real art will replace it.

const TREE_PAL = {
  t: '#5b3a24', T: '#7a5232', // trunk
  d: '#2d5a27', m: '#3f7a34', l: '#5c9e44', h: '#86c35a', // leaves dark -> highlight
};

/** A round leafy tree, about 26 x 32 px. Its base (trunk bottom) is the bottom centre. */
export function treeCanvas(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const W = 26;
  const H = 32;
  const g = new PixelGrid(W, H);
  // trunk
  for (let y = 20; y < H; y++) for (let x = 11; x <= 14; x++) g.set(x, y, x <= 12 ? 'T' : 't');
  g.set(10, H - 1, 't').set(15, H - 1, 't');
  // canopy: a few overlapping blobs, lit from the upper left
  const blobs: [number, number, number][] = [
    [13, 11, 10], [7 + r() * 2, 14, 6], [19 - r() * 2, 14, 6], [13, 6, 6 + r() * 1.5],
  ];
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < W; x++) {
      let inside = false;
      let light = -9;
      for (const [cx, cy, rad] of blobs) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rad * rad) {
          inside = true;
          light = Math.max(light, (-(dx + dy * 1.2) / rad) + (r() - 0.5) * 0.5);
        }
      }
      if (!inside) continue;
      g.set(x, y, light > 0.9 ? 'h' : light > 0.15 ? 'l' : light > -0.6 ? 'm' : 'd');
    }
  }
  return rowsToCanvas(g.rows(), TREE_PAL, '#142012');
}

/** A bush, about 16 x 11 px. */
export function bushCanvas(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const g = new PixelGrid(16, 11);
  const blobs: [number, number, number][] = [[5, 6, 4.5], [10, 6, 4.5], [8, 4, 4]];
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 16; x++) {
      let light = -9;
      let inside = false;
      for (const [cx, cy, rad] of blobs) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rad * rad) {
          inside = true;
          light = Math.max(light, -(dx + dy) / rad + (r() - 0.5) * 0.4);
        }
      }
      if (inside) g.set(x, y, light > 0.8 ? 'h' : light > 0 ? 'l' : light > -0.8 ? 'm' : 'd');
    }
  }
  return rowsToCanvas(g.rows(), TREE_PAL, '#142012');
}

/** A grey rock, about 12 x 8 px. */
export function rockCanvas(): HTMLCanvasElement {
  return rowsToCanvas(
    ['...hhll.....', '..hllllmm...', '.hllllmmmm..', 'hlllmmmmmdd.', 'llmmmmmmdddd', '.mmmmmddddd.'],
    { h: '#d9d6cc', l: '#a9a69c', m: '#84817a', d: '#5f5c57' },
    '#25231f',
  );
}

/** The ground of the test map: grass with specks, tufts, flowers and a dirt path. */
export function groundCanvas(w: number, h: number, path: (x: number) => number): HTMLCanvasElement {
  const r = rng(7);
  const [c, g] = makeCanvas(w, h);
  const img = g.createImageData(w, h);
  const put = (x: number, y: number, hex: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    img.data[i] = hex >> 16;
    img.data[i + 1] = (hex >> 8) & 255;
    img.data[i + 2] = hex & 255;
    img.data[i + 3] = 255;
  };
  const GRASS = [0x5a9e4b, 0x5a9e4b, 0x5a9e4b, 0x56984a, 0x5fa64f];
  const DIRT = [0xb08a5a, 0xa98454, 0xb69262];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.abs(y - path(x));
      if (d < 9 + Math.sin(x * 0.21) * 1.5) put(x, y, DIRT[Math.floor(r() * DIRT.length)]);
      else if (d < 10.5 + Math.sin(x * 0.21) * 1.5) put(x, y, 0x8f7a4a); // path edge
      else put(x, y, GRASS[Math.floor(r() * GRASS.length)]);
    }
  }
  // grass tufts
  for (let n = 0; n < (w * h) / 90; n++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h);
    if (Math.abs(y - path(x)) < 12) continue;
    const dark = r() < 0.6;
    const col = dark ? 0x447d39 : 0x7cbf5e;
    put(x, y, col);
    put(x - 1, y - 1, col);
    put(x + 1, y - 1, col);
  }
  // flowers
  const PETALS = [0xf4f1e8, 0xf2d05a, 0xe98bb0, 0x9fc3f0];
  for (let n = 0; n < (w * h) / 900; n++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h);
    if (Math.abs(y - path(x)) < 12) continue;
    const p = PETALS[Math.floor(r() * PETALS.length)];
    put(x - 1, y, p);
    put(x + 1, y, p);
    put(x, y - 1, p);
    put(x, y + 1, p);
    put(x, y, 0xe0a030);
  }
  g.putImageData(img, 0, 0);
  return c;
}
