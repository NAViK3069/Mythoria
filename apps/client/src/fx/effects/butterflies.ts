// Mythoria's own butterflies, drawn pixel by pixel in code - no image files.
//
// Each species is plain data: the outline of its fore and hind wing (px, right wing, open flat, from the
// wing root at the body; y down) and a paint() that colours each pixel of a wing. Change a number or a
// colour here and every butterfly of that kind changes. bakeButterflies() draws each species once per
// wing pose into a strip of frames (open -> edge-on), which Critters.ts flaps and flies round the map.

import { makeCanvas } from '../../art/pixel';

type Pt = [number, number];

/** What paint() is told about a wing pixel. */
export interface WingPixel {
  /** Unfolded position in px from the wing root (u outward, v down). */
  u: number;
  v: number;
  /** Distance to the wing's edge (px), and from the root. */
  edge: number;
  root: number;
  hind: boolean;
}

export interface Species {
  id: string;
  /** Wing outlines, right wing, open flat. */
  fore: Pt[];
  hind: Pt[];
  /** Colour of a wing pixel (a CSS hex colour). */
  paint(w: WingPixel): string;
  /** Outline and body colours. */
  ink: string;
  body: [string, string];
  /** Soft light round it (additive), for the magical ones. */
  glow?: string;
  /** Sheds twinkling dust as it flies. */
  dust?: string;
  /** How fast its wings beat (beats per second) and how big it is drawn relative to the shape (1 = as is). */
  beat: number;
  /** How often it lands, 0..1. */
  lands: number;
}

const near = (u: number, v: number, x: number, y: number, r: number) => Math.hypot(u - x, v - y) < r;

/**
 * How big butterflies are drawn: the species' shapes below are designed at 1 (a wing ~9 px), and drawn at
 * this size - about 12 px from wingtip to wingtip, smaller than a cat, small beside the hero.
 */
export const SIZE = 0.6;

/** The species. Shapes are in design px (drawn at SIZE). */
export const SPECIES: Species[] = [
  {
    // Azure: iridescent blue, black tips dotted white.
    id: 'azure',
    fore: [[0, -1], [2, -4.5], [5.5, -7], [8.5, -7.5], [9.2, -5.5], [7.5, -2.5], [3.5, 0], [0, 0.5]],
    hind: [[0, 0.5], [3.5, 0.5], [6.2, 2.5], [6.5, 5], [4.5, 7], [2, 6.5], [0, 3.5]],
    ink: '#0c1230',
    body: ['#1b2550', '#3b4f8f'],
    paint: ({ u, v, edge, root, hind }) => {
      if (!hind && (u - v * 0.5 > 9.6 || (root > 8.2 && v < -4))) return near(u, v, 8.4, -6.2, 0.8) || near(u, v, 8.8, -4.4, 0.7) ? '#ffffff' : '#0c1230';
      if (hind && edge < 1.2) return '#1a2c6a';
      if (root < 2.5) return '#1d3a8a';
      if (!hind && edge < 1.6 && v < -3) return '#a8ecff';
      return root < 5 ? '#2f7fd8' : '#56c2f5';
    },
    beat: 9,
    lands: 0.5,
  },
  {
    // Ember: deep orange, black veins and border with a chain of white dots.
    id: 'ember',
    fore: [[0, -1], [2.5, -5], [6, -7.5], [9, -8], [9.5, -6], [8, -3], [4, -0.5], [0, 0.5]],
    hind: [[0, 0.5], [4, 0.5], [6.8, 2.5], [7, 5.2], [5, 7.2], [2.2, 6.8], [0, 3.6]],
    ink: '#160806',
    body: ['#1d0d08', '#3a2014'],
    paint: ({ u, v, edge, root, hind }) => {
      // a dark tip on the forewing with two pale dots
      if (!hind && u > 8 && v < -5.2) return near(u, v, 8.6, -6.6, 0.7) ? '#fff0c8' : '#160806';
      if (edge < 1.6 && root > 6 && (Math.round(u * 1.4 + v) & 1) === 0) return '#fff0c8';
      // two thin veins on each wing
      const ang = Math.atan2(v, u);
      for (const a of hind ? [0.7, 1.3] : [-0.95, -0.4]) if (Math.abs(ang - a) * root < 0.35 && root > 3) return '#6a2408';
      return root < 2.5 ? '#c24c10' : root < 5.5 ? '#f07c1c' : '#ffa53a';
    },
    beat: 8,
    lands: 0.6,
  },
  {
    // Rose: pink fading to blush at the edges, pearl spots.
    id: 'rose',
    fore: [[0, -1], [2, -4], [5, -6.5], [8, -7], [8.6, -5], [7, -2.2], [3.2, 0], [0, 0.5]],
    hind: [[0, 0.5], [3.2, 0.6], [6, 2.4], [6.4, 4.8], [4.4, 6.6], [1.8, 6.2], [0, 3.4]],
    ink: '#3a0f2a',
    body: ['#4a1838', '#7a2c5a'],
    paint: ({ u, v, edge, root, hind }) => {
      if (near(u, v, hind ? 3.8 : 5.6, hind ? 3.6 : -4.2, hind ? 1 : 1.1)) return '#fff2fa';
      if (edge < 1.1) return '#b5306f';
      if (root < 2.5) return '#c8467f';
      return root < 5.5 ? '#ef77ab' : '#ffb3d1';
    },
    beat: 9,
    lands: 0.6,
  },
  {
    // Lemon: small, round, pale yellow with an orange dot on each wing.
    id: 'lemon',
    fore: [[0, -1], [2, -4.5], [4.8, -6.4], [7, -6.2], [7.5, -4], [6, -1.2], [2.8, 0.2], [0, 0.5]],
    hind: [[0, 0.5], [3, 0.5], [5.5, 2], [5.8, 4.4], [4, 6], [1.6, 5.6], [0, 3.2]],
    ink: '#3a2e0a',
    body: ['#3a3014', '#6b5a24'],
    paint: ({ u, v, edge, root, hind }) => {
      if (near(u, v, hind ? 3.2 : 4.2, hind ? 3 : -3.4, 0.8)) return '#ff8a1e';
      if (edge < 1) return '#d9b93a';
      if (root < 2.2) return '#cfe08a';
      return root < 4.5 ? '#fff07a' : '#fff8c4';
    },
    beat: 11,
    lands: 0.7,
  },
  {
    // Swallowtail: cream with black bands, a blue and red eye on the hind wing, long tails.
    id: 'swallow',
    fore: [[0, -1], [2.5, -5.2], [6.5, -8], [9.6, -8.2], [9.6, -6.5], [7.2, -2.8], [3.6, -0.2], [0, 0.5]],
    hind: [[0, 0.5], [3.8, 0.4], [6.4, 2.2], [6.6, 4.6], [5, 6], [4.8, 9.4], [3.8, 9.4], [3.4, 6.6], [1.6, 6.2], [0, 3.6]],
    ink: '#100c08',
    body: ['#14100c', '#3b3020'],
    paint: ({ u, v, root, hind }) => {
      if (hind) {
        if (near(u, v, 2.8, 5, 0.8)) return '#e2402c';
        if (near(u, v, 4.8, 4.6, 0.8)) return '#4aa4ff';
        if (v > 6.4) return '#2a2418';
      } else {
        // a band across the forewing and a dark tip
        const s = u * 0.55 - v * 0.8;
        if ((s > 5.6 && s < 6.9) || s > 9.4) return '#100c08';
      }
      return root < 3 ? '#e8d48a' : '#fff1bd';
    },
    beat: 7,
    lands: 0.45,
  },
  {
    // Luna: a pale-green moth with long curling tails and eyespots; glows faintly.
    id: 'luna',
    fore: [[0, -1], [2.2, -4.4], [6, -6.6], [8.6, -6.2], [8.2, -3.6], [6, -1.2], [2.8, 0.2], [0, 0.5]],
    hind: [[0, 0.5], [3.2, 0.8], [5.6, 2.6], [5.8, 4.8], [5.2, 7], [5.6, 10.5], [6.2, 12], [5, 12.2], [4, 9.6], [3.4, 7], [1.4, 5.4], [0, 3.4]],
    ink: '#16301e',
    body: ['#e9f5d8', '#c8e0b0'],
    paint: ({ u, v, edge, root, hind }) => {
      if (near(u, v, hind ? 3.4 : 4.6, hind ? 3.4 : -3.6, 1.1)) return near(u, v, hind ? 3.4 : 4.6, hind ? 3.4 : -3.6, 0.5) ? '#2a2216' : '#f0c060';
      if (!hind && edge < 1.2 && v < -2) return '#9a6a8a';
      if (edge < 1) return '#6fb48a';
      return root < 3 ? '#b8e8b8' : '#d8f7cc';
    },
    glow: '#a8ffcc',
    beat: 6,
    lands: 0.35,
  },
  {
    // Lumen: a spirit butterfly of light; glassy wings, a bright edge, a trail of twinkling dust.
    id: 'lumen',
    fore: [[0, -1], [2, -5], [5.6, -8], [9, -8.6], [9.4, -6.2], [7.4, -2.6], [3.4, 0], [0, 0.5]],
    hind: [[0, 0.5], [3.6, 0.6], [6.4, 2.8], [6.6, 5.4], [4.6, 7.6], [2, 7], [0, 3.8]],
    ink: '#1a3a6a',
    body: ['#e8fbff', '#9fe8ff'],
    paint: ({ edge, root }) => {
      if (edge < 1) return '#e8fdff';
      if (edge < 2) return '#8fe6ff';
      return root < 3 ? '#5ad0ff' : '#2a9ae0';
    },
    glow: '#7fe0ff',
    dust: '#bff4ff',
    beat: 7,
    lands: 0.2,
  },
];

/** Wing poses in the strip: how open each frame is (1 flat open .. small = edge-on, raised over the back). */
export const FOLDS = [1, 0.78, 0.52, 0.3, 0.14];

const inPoly = (pts: Pt[], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const edgeDist = (pts: Pt[], x: number, y: number) => {
  let m = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i], dx = bx - ax, dy = by - ay;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    m = Math.min(m, Math.hypot(ax + dx * k - x, ay + dy * k - y));
  }
  return m;
};
const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shadeTo = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

export interface ButterflyStrip {
  canvas: HTMLCanvasElement;
  /** One frame's size; the body's centre sits at (cx, cy) in each frame. */
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** Draw one species as a strip of FOLDS.length frames, left to right. */
export function bakeButterfly(sp: Species): ButterflyStrip {
  const all = [...sp.fore, ...sp.hind];
  const span = Math.ceil(Math.max(...all.map((p) => p[0])) * SIZE) + 2;
  const top = Math.floor(Math.min(...all.map((p) => p[1])) * SIZE) - 3;
  const bottom = Math.ceil(Math.max(...all.map((p) => p[1])) * SIZE) + 2;
  const w = span * 2 + 1, h = bottom - top + 1;
  const cx = span, cy = -top;
  const [canvas, g] = makeCanvas(w * FOLDS.length, h);
  const img = g.createImageData(w * FOLDS.length, h);
  const ink = rgb(sp.ink);

  FOLDS.forEach((fold, f) => {
    const cell = new Array<[number, number, number] | null>(w * h).fill(null);
    const put = (x: number, y: number, c: [number, number, number]) => {
      if (x >= 0 && y >= 0 && x < w && y < h) cell[y * w + x] = c;
    };
    // Folding wings rise over the back a little (3/4 view) and turn their far side from the light.
    const lift = Math.round((1 - fold) * 1.5);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        if (dx === 0) continue;
        // back in the design's px, where the shapes and patterns are
        const u = (Math.abs(dx) - 0.5) / fold / SIZE;
        const v = (y - cy + 0.5 + lift * (1 - Math.min(1, Math.abs(dx) / 3))) / SIZE;
        for (const hind of [false, true]) {
          const pts = hind ? sp.hind : sp.fore;
          if (!inPoly(pts, u, v)) continue;
          // fore wings overlap the hind ones
          if (hind && cell[y * w + x]) continue;
          let c = rgb(sp.paint({ u, v, edge: edgeDist(pts, u, v) * Math.max(fold, 0.6) * Math.max(SIZE, 0.75), root: Math.hypot(u, v), hind }));
          if (fold < 0.6) c = shadeTo(c, ink, (0.6 - fold) * 0.9);
          if (dx < 0 && fold < 0.9) c = shadeTo(c, ink, 0.12); // the far wing a touch darker
          put(x, y, c);
          break;
        }
      }
    }
    // the body: head, thorax, a tapering abdomen, two antennae with bright tips
    const [dark, lite] = [rgb(sp.body[0]), rgb(sp.body[1])];
    for (let y = -1; y <= 2; y++) put(cx, cy + y, y <= 0 ? lite : dark);
    put(cx, cy - 2, dark);
    put(cx - 1, cy - 3, lite), put(cx + 1, cy - 3, lite);
    // a 1 px outline round the wings and body
    const filled = cell.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (filled[y * w + x]) continue;
        const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < w && yy < h && !!filled[yy * w + xx];
        // antenna tips and the body's own pixels don't get boxed in
        if (y < cy - 2) continue;
        if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) cell[y * w + x] = ink;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = cell[y * w + x];
        if (!c) continue;
        const i = (y * w * FOLDS.length + f * w + x) * 4;
        img.data[i] = c[0];
        img.data[i + 1] = c[1];
        img.data[i + 2] = c[2];
        img.data[i + 3] = 255;
      }
    }
  });
  g.putImageData(img, 0, 0);
  return { canvas, w, h, cx, cy };
}
