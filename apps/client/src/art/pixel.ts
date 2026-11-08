// Tiny helpers for drawing pixel art in code (hands, props, ground).

export type Palette = Record<string, string>;

/** A canvas of the given size and its 2D context. */
export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/**
 * Pixel rows (one character per pixel, '.' = empty) to a canvas with a 1px
 * outline all round, so the result is 2px bigger than the rows.
 */
export function rowsToCanvas(rows: string[], pal: Palette, outline = '#000000'): HTMLCanvasElement {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? rows[y][x] ?? '.' : '.');
  const [c, g] = makeCanvas(w + 2, h + 2);
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      const ch = at(x, y);
      let color: string | null = ch !== '.' ? pal[ch] ?? null : null;
      if (!color && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) !== '.')) color = outline;
      if (color) {
        g.fillStyle = color;
        g.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }
  return c;
}

/** A grid of palette keys built by code, then outlined like rowsToCanvas. */
export class PixelGrid {
  readonly cells: string[][];
  constructor(readonly w: number, readonly h: number) {
    this.cells = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  }
  set(x: number, y: number, k: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y][x] = k;
    return this;
  }
  get(x: number, y: number): string {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.cells[y][x] : '.';
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }
}

/** Small deterministic RNG (mulberry32) so the test map is the same every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
