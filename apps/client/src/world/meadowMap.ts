import { rng } from '../art/pixel';

// The first test map: a meadow with ponds, winding dirt paths, patches of dark
// grass, an old ruined shrine and a forest round the edge. The terrain is a
// grid of VERTICES (corners); each 16px tile is drawn from the four terrains at
// its corners (Wang autotiling), so edges between terrains come out smooth.

export const TILE = 16;
export const COLS = 72;
export const ROWS = 52;

export const enum T {
  Grass = 0,
  Water = 1,
  Path = 2,
  Dark = 3,
}

export interface Placed {
  frame: string; // atlas frame
  x: number; // base (feet) position in px
  y: number;
  r: number; // collision radius at the base, 0 = walk-through
  kind: 'tree' | 'bush' | 'wall' | 'pillar' | 'rock' | 'prop' | 'lily' | 'decal';
  shadow?: boolean;
}

export interface MeadowMap {
  /** (COLS+1) x (ROWS+1) vertex terrain. */
  vert: Uint8Array;
  objects: Placed[];
  decals: Placed[];
  spawn: { x: number; y: number };
  braziers: { x: number; y: number }[];
  wisps: { x: number; y: number }[];
  butterflies: { x: number; y: number }[];
}

const VW = COLS + 1;
const VH = ROWS + 1;

/** Smooth value noise in [0, 1]. */
function noise2(seed: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const n = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x: number, y: number) => n(x, y) * 0.6 + n(x * 2.1, y * 2.1) * 0.3 + n(x * 4.3, y * 4.3) * 0.1;
}

const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

export function buildMeadow(): MeadowMap {
  const vert = new Uint8Array(VW * VH);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= VW || y >= VH ? T.Grass : vert[y * VW + x]);
  const set = (x: number, y: number, t: T) => {
    if (x >= 0 && y >= 0 && x < VW && y < VH) vert[y * VW + x] = t;
  };
  const n1 = noise2(1), n2 = noise2(2), n3 = noise2(3);

  // --- ponds: blobs with wobbly edges
  const ponds: [number, number, number][] = [
    [11, 35, 4.5], [15, 39, 4.5], [10, 42, 3.5], [19, 36, 3], [16, 44, 3], // the big L-shaped pond (west)
    [55, 9, 4], [60, 11, 3.5], [57, 14, 2.6], // north-east pond
    [46, 44, 2.6], [49, 45, 2], // a small one south
  ];
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const wob = (n1(x / 3, y / 3) - 0.5) * 2.2;
      if (ponds.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) < r + wob)) set(x, y, T.Water);
    }
  }

  // --- dirt paths from the clearing in the middle, out to each side
  const spawn = { tx: 34, ty: 26 };
  const paths: [number, number][][] = [
    [[34, 26], [33, 19], [36, 12], [35, 4], [36, 0]],
    [[34, 26], [42, 27], [50, 24], [60, 26], [72, 25]],
    [[34, 26], [27, 28], [22, 25], [12, 24], [0, 26]],
    [[34, 26], [36, 33], [33, 41], [36, 52]],
  ];
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      if (at(x, y) === T.Water) continue;
      let d = Math.hypot(x - spawn.tx, y - spawn.ty) - 2.6; // a clearing at the crossroads
      for (const p of paths) for (let i = 0; i + 1 < p.length; i++) d = Math.min(d, distToSegment(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) - 0.9);
      if (d + (n2(x / 2.5, y / 2.5) - 0.5) * 1.2 < 0.35) set(x, y, T.Path);
    }
  }

  // --- patches of dark grass, kept clear of water and paths
  const near = (x: number, y: number, t: T, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (at(x + dx, y + dy) === t) return true;
    return false;
  };
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      if (at(x, y) !== T.Grass) continue;
      if (n3(x / 6, y / 6) > 0.6 && !near(x, y, T.Water, 2) && !near(x, y, T.Path, 2)) set(x, y, T.Dark);
    }
  }

  // --- each tile can show only grass + ONE other terrain: clear any clashes
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)].filter((t) => t !== T.Grass);
        if (new Set(c).size < 2) continue;
        const keep = c.includes(T.Water) ? T.Water : T.Path;
        for (const [vx, vy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) if (at(vx, vy) !== T.Grass && at(vx, vy) !== keep) set(vx, vy, T.Grass);
      }
    }
  }

  // --- things on the map
  const r = rng(2024);
  const pick = <V>(a: V[]) => a[Math.floor(r() * a.length)];
  const objects: Placed[] = [];
  const decals: Placed[] = [];
  const terrainAt = (px: number, py: number) => at(Math.round(px / TILE), Math.round(py / TILE));
  const clearOf = (px: number, py: number, rad: number, allowDark = true) => {
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      const t = terrainAt(px + dx * rad, py + dy * rad);
      if (t === T.Water || t === T.Path || (!allowDark && t === T.Dark)) return false;
    }
    return objects.every((o) => o.r === 0 || Math.hypot(o.x - px, o.y - py) > o.r + rad + 2);
  };
  const add = (p: Placed) => objects.push(p);
  const sx = spawn.tx * TILE, sy = spawn.ty * TILE;

  // the ruined shrine north-east of the clearing: a broken ring of walls and pillars
  const shrine = { x: 46 * TILE, y: 16 * TILE };
  const ring: [string, number, number, number][] = [
    ['wall0', -40, -26, 18], ['wall4', 6, -34, 18], ['pillar0', 44, -22, 7], ['wall2', 52, 4, 16],
    ['pillar2', 40, 30, 7], ['wall6', -6, 34, 16], ['pillar3', -46, 22, 7], ['wall8', -56, -4, 16],
  ];
  for (const [f, dx, dy, rad] of ring) add({ frame: f, x: shrine.x + dx, y: shrine.y + dy, r: rad, kind: f.startsWith('wall') ? 'wall' : 'pillar', shadow: true });
  add({ frame: 'chest2', x: shrine.x, y: shrine.y + 4, r: 7, kind: 'prop', shadow: true });
  const braziers = [{ x: shrine.x - 22, y: shrine.y + 2 }, { x: shrine.x + 22, y: shrine.y + 2 }];
  for (const b of braziers) objects.push({ frame: '', x: b.x, y: b.y, r: 5, kind: 'prop' });
  const wisps = [{ x: shrine.x, y: shrine.y - 20 }];

  // smaller ruins scattered about
  const ruinSpots: [number, number][] = [[20, 13], [57, 38], [26, 44], [62, 19], [8, 15]];
  for (const [tx, ty] of ruinSpots) {
    const x = tx * TILE, y = ty * TILE;
    if (!clearOf(x, y, 16)) continue;
    add({ frame: pick(['wall1', 'wall3', 'wall5', 'wall7', 'wall9', 'wall10']), x, y, r: 15, kind: 'wall', shadow: true });
    if (r() < 0.8) add({ frame: pick(['pillar1', 'pillar4', 'pillar5', 'pillar6']), x: x + 26 + r() * 8, y: y + 10, r: 7, kind: 'pillar', shadow: true });
    if (r() < 0.6) add({ frame: pick(['rock0', 'rock4', 'rock5']), x: x - 22, y: y + 14, r: 6, kind: 'rock', shadow: true });
  }

  // camp props by the clearing
  add({ frame: 'barrel0', x: sx - 46, y: sy - 30, r: 6, kind: 'prop', shadow: true });
  add({ frame: 'barrel1', x: sx - 36, y: sy - 34, r: 6, kind: 'prop', shadow: true });
  add({ frame: 'crate0', x: sx - 50, y: sy - 16, r: 7, kind: 'prop', shadow: true });
  add({ frame: 'chest0', x: 23 * TILE, y: 31 * TILE, r: 7, kind: 'prop', shadow: true });
  add({ frame: 'crate1', x: 58 * TILE, y: 31 * TILE, r: 7, kind: 'prop', shadow: true });

  // forest: thick round the edge, clumps inside
  const fn = noise2(9);
  const treeAt = (x: number, y: number) => add({ frame: `tree${Math.floor(r() * 8)}`, x, y, r: 7, kind: 'tree', shadow: true });
  for (let i = 0; i < 2600; i++) {
    const x = r() * COLS * TILE, y = r() * (ROWS * TILE + 24);
    const edge = Math.min(x, y, COLS * TILE - x, ROWS * TILE - y) / TILE;
    const dense = edge < 2.5 || (edge < 6 && fn(x / 70, y / 70) > 0.5) || fn(x / 90, y / 90) > 0.68;
    if (!dense || Math.hypot(x - sx, y - sy) < 90 || Math.hypot(x - shrine.x, y - shrine.y) < 80) continue;
    if (clearOf(x, y, 15)) treeAt(x, y);
  }
  // bushes, rocks, stumps, mushrooms
  const scatter = (n: number, frames: string[], kind: Placed['kind'], rad: number, gap: number, where?: (x: number, y: number) => boolean) => {
    for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) {
      const x = 24 + r() * (COLS * TILE - 48), y = 24 + r() * (ROWS * TILE - 48);
      if (Math.hypot(x - sx, y - sy) < 40 || !clearOf(x, y, gap) || (where && !where(x, y))) continue;
      add({ frame: pick(frames), x, y, r: rad, kind, shadow: kind !== 'bush' || r() < 0.5 });
      i++;
    }
  };
  scatter(70, Array.from({ length: 12 }, (_, i) => `bush${i}`), 'bush', 6, 8);
  scatter(22, ['rock0', 'rock1', 'rock2', 'rock3', 'rock4', 'rock5', 'rock6', 'rock7'], 'rock', 6, 8);
  scatter(10, ['stump0', 'stump1', 'stump2'], 'prop', 6, 8);
  scatter(18, ['mushroom0', 'mushroom1', 'mushroom2'], 'prop', 0, 6, (x, y) => fn(x / 90, y / 90) > 0.5);
  // rocks along the pond banks
  for (let i = 0, tries = 0; i < 16 && tries < 3000; tries++) {
    const x = r() * COLS * TILE, y = r() * ROWS * TILE;
    if (terrainAt(x, y) === T.Water || !near(Math.round(x / TILE), Math.round(y / TILE), T.Water, 1) || !clearOf(x, y, 6)) continue;
    add({ frame: pick(['rock4', 'rock5', 'rock6', 'rock7', 'rock0']), x, y, r: 5, kind: 'rock', shadow: true });
    i++;
  }

  // lily pads: on open water only
  for (let y = 1; y < ROWS; y++) {
    for (let x = 1; x < COLS; x++) {
      if (at(x, y) !== T.Water || !near(x, y, T.Water, 1) || r() > 0.22) continue;
      let open = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) !== T.Water) open = false;
      if (open) objects.push({ frame: `lily${Math.floor(r() * 5)}`, x: x * TILE + (r() - 0.5) * 8, y: y * TILE + (r() - 0.5) * 8, r: 0, kind: 'lily' });
    }
  }

  // ground decals: grass tufts everywhere, flowers in drifts, pebbles near paths
  const fl = noise2(5);
  for (let i = 0; i < 1500; i++) {
    const x = r() * COLS * TILE, y = r() * ROWS * TILE;
    const t = terrainAt(x, y);
    if (t === T.Water) continue;
    if (t === T.Path) {
      if (r() < 0.25) decals.push({ frame: `pebble${Math.floor(r() * 6)}`, x, y, r: 0, kind: 'decal' });
      continue;
    }
    const flowers = fl(x / 60, y / 60) > 0.55;
    if (flowers && r() < 0.6) decals.push({ frame: `flower${Math.floor(r() * 9)}`, x, y, r: 0, kind: 'decal' });
    else if (r() < 0.45) decals.push({ frame: `tuft${Math.floor(r() * 10)}`, x, y, r: 0, kind: 'decal' });
  }

  const butterflies = [
    { x: sx + 60, y: sy + 40 }, { x: 18 * TILE, y: 30 * TILE }, { x: 52 * TILE, y: 34 * TILE }, { x: 30 * TILE, y: 12 * TILE },
  ];

  return { vert, objects, decals, spawn: { x: sx, y: sy }, braziers, wisps, butterflies };
}

/** Terrain at a vertex. */
export function vertexAt(map: MeadowMap, x: number, y: number): T {
  if (x < 0 || y < 0 || x >= VW || y >= VH) return T.Grass;
  return map.vert[y * VW + x] as T;
}

/** How much of the ground at a pixel is water (0..1), blended from the corners. */
export function waterAt(map: MeadowMap, px: number, py: number): number {
  const fx = px / TILE, fy = py / TILE;
  const x = Math.floor(fx), y = Math.floor(fy);
  const u = fx - x, v = fy - y;
  const w = (vx: number, vy: number) => (vertexAt(map, vx, vy) === T.Water ? 1 : 0);
  return w(x, y) * (1 - u) * (1 - v) + w(x + 1, y) * u * (1 - v) + w(x, y + 1) * (1 - u) * v + w(x + 1, y + 1) * u * v;
}
