import { rng } from '../art/pixel';

// The first test map: a meadow with ponds, winding dirt paths, patches of dark
// grass, an old ruined shrine and a forest round the edge. The terrain is a
// grid of VERTICES (corners); each 16px tile is drawn from the four terrains at
// its corners (Wang autotiling), so edges between terrains come out smooth.

export const TILE = 16;
export const COLS = 96;
export const ROWS = 68;

export const enum T {
  Grass = 0,
  Water = 1,
  Path = 2,
  Dark = 3,
}

export type Kind = 'tree' | 'bush' | 'wall' | 'pillar' | 'rock' | 'prop' | 'lily' | 'decal' | 'brazier';

/**
 * The part of an object that stands on the ground, which you can't walk into:
 * a rectangle (half width hw, half depth hd round x, y) with rounded corners
 * of radius r. Boxes get small corners (you stop flat against their sides),
 * trunks and round things big ones (you slide round them).
 */
export interface Footprint {
  x: number;
  y: number;
  hw: number;
  hd: number;
  r: number;
}

export interface Placed {
  frame: string; // atlas frame ('' = drawn by something else, e.g. a brazier effect)
  x: number; // base (bottom centre) position in px
  y: number;
  kind: Kind;
  /** Where it blocks; none = walk-through (decals, lily pads, mushrooms). */
  foot?: Footprint;
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

/** What the map needs to know about a picture: its size and how wide its solid pixels are near the bottom. */
export interface Shape {
  w: number;
  h: number;
  /** Left and right edge (px from the picture's centre) of the solid pixels in the bottom `rows` rows. */
  span(rows: number): [number, number];
}
export type ShapeOf = (frame: string) => Shape;

const ROCKS = Array.from({ length: 12 }, (_, i) => `rock${i}`);
const BOULDERS = Array.from({ length: 8 }, (_, i) => `boulder${i}`);

const VW = COLS + 1;
const VH = ROWS + 1;

/**
 * Where a thing stands on the ground, read from its picture: as wide as the
 * solid pixels at its base, and as deep as its top face would cover in a
 * 3/4 view (boxes, barrels and rocks about half their height, walls a slab,
 * trees just the trunk). A flat-sided capsule, so you stop against its sides.
 */
export function footprintFor(kind: Kind, x: number, y: number, s?: Shape): Footprint | undefined {
  if (kind === 'brazier') return { x, y: y - 2.5, hw: 4.5, hd: 2.5, r: 2.5 };
  if (!s) return undefined;
  const fp = (l: number, r: number, depth: number, maxW = Infinity, round = 2.5): Footprint => {
    const hw = Math.min((r - l) / 2, maxW / 2);
    const hd = depth / 2;
    return { x: x + (l + r) / 2, y: y - hd, hw, hd, r: Math.min(round, hw, hd) };
  };
  switch (kind) {
    case 'tree': {
      const [l, r] = s.span(3); // trunk and roots
      return fp(l, r, 6, 12, 6);
    }
    case 'wall': {
      const [l, r] = s.span(4);
      return fp(l, r, Math.min(12, s.h * 0.34));
    }
    case 'pillar': {
      const [l, r] = s.span(4);
      return fp(l, r, Math.min(11, s.h * 0.3));
    }
    case 'rock':
    case 'prop': {
      const [l, r] = s.span(Math.ceil(s.h * 0.45));
      return fp(l, r, Math.max(5, s.h * 0.5), Infinity, kind === 'rock' ? 4 : 2);
    }
    case 'bush': {
      const [l, r] = s.span(Math.ceil(s.h * 0.4));
      return fp(l + 1, r - 1, Math.max(5, s.h * 0.42), Infinity, 5);
    }
    default:
      return undefined;
  }
}

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

// The layout is designed on a 72 x 52 sketch and stretched onto the real grid.
const KX = COLS / 72;
const KY = ROWS / 52;
const KR = (KX + KY) / 2;

export function buildMeadow(sizeOf: ShapeOf): MeadowMap {
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
  ].map(([x, y, r]) => [x * KX, y * KY, r * KR]);
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const wob = (n1(x / 3, y / 3) - 0.5) * 2.4;
      if (ponds.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) < r + wob)) set(x, y, T.Water);
    }
  }

  // --- dirt paths from the clearing in the middle, out to each side
  const spawnT = { x: 34 * KX, y: 26 * KY };
  const paths = [
    [[34, 26], [33, 19], [36, 12], [35, 4], [36, -1]],
    [[34, 26], [42, 27], [50, 24], [60, 26], [73, 25]],
    [[34, 26], [27, 28], [22, 25], [12, 24], [-1, 26]],
    [[34, 26], [36, 33], [33, 41], [36, 53]],
  ].map((p) => p.map(([x, y]) => [x * KX, y * KY]));
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      if (at(x, y) === T.Water) continue;
      let d = Math.hypot(x - spawnT.x, y - spawnT.y) - 3; // a clearing at the crossroads
      for (const p of paths) for (let i = 0; i + 1 < p.length; i++) d = Math.min(d, distToSegment(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) - 1);
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
      if (n3(x / 7, y / 7) > 0.6 && !near(x, y, T.Water, 2) && !near(x, y, T.Path, 2)) set(x, y, T.Dark);
    }
  }

  // tiny patches (a corner or two) draw as ragged stains: keep only real areas of dark grass
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < VH; y++) {
      for (let x = 0; x < VW; x++) {
        if (at(x, y) !== T.Dark) continue;
        const n = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].filter((t) => t === T.Dark).length;
        if (n < 3) set(x, y, T.Grass);
      }
    }
  }
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      if (at(x, y) !== T.Grass || near(x, y, T.Water, 2) || near(x, y, T.Path, 2)) continue;
      const n = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].filter((t) => t === T.Dark).length;
      if (n >= 3) set(x, y, T.Dark); // fill pinholes
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

  /** Half the visible width of something - how much room it needs round it. */
  const room = (o: { frame: string; kind: Kind }) => (o.frame ? sizeOf(o.frame).w / 2 : 6) * (o.kind === 'tree' ? 0.85 : 1);
  /** Can this stand here without its picture crowding another, or its base sitting on water/path? */
  const fits = (frame: string, kind: Kind, x: number, y: number) => {
    const { w } = sizeOf(frame);
    const half = w * 0.45;
    for (const [dx, dy] of [[-half, 0], [half, 0], [0, -3], [0, 3]]) {
      const t = terrainAt(x + dx, y + dy);
      if (t === T.Water || t === T.Path) return false;
    }
    // Blocking things leave a gap the player can really walk through - never a sliver
    // they half squeeze into.
    const foot = footprintFor(kind, x, y, sizeOf(frame));
    if (foot) {
      for (const o of objects) {
        const f = o.foot;
        if (!f) continue;
        const gx = Math.abs(f.x - foot.x) - (f.hw + foot.hw);
        const gy = Math.abs(f.y - foot.y) - (f.hd + foot.hd);
        // scattered things keep a walkable gap; hand-placed clusters (camp, shrine) are allowed to touch
        if (Math.max(gx, gy) < 16) return false;
      }
    }
    const me = room({ frame, kind });
    const myH = sizeOf(frame).h;
    const myW = sizeOf(frame).w;
    /** Is the base at (bx, by) inside the picture of the thing standing at (fx, fy)? */
    const hides = (fx: number, fy: number, fw: number, fh: number, bx: number, by: number) =>
      fy > by && Math.abs(bx - fx) < fw * 0.42 && by > fy - fh * 0.92;
    return objects.every((o) => {
      if (o.kind === 'lily') return true;
      const os = o.frame ? sizeOf(o.frame) : { w: 8, h: 8 };
      if (hides(o.x, o.y, os.w, os.h, x, y) || hides(x, y, myW, myH, o.x, o.y)) return false;
      const need = me + room(o);
      const dx = o.x - x;
      const dy = o.y - y;
      // Whichever stands in front must not hide the other's base: the one behind has to
      // sit above the front one's picture, or far enough to the side. An ellipse of
      // personal space does both and keeps clumps looking natural.
      const frontH = dy > 0 ? (o.frame ? sizeOf(o.frame).h : 8) : myH;
      const k = kind === 'tree' && o.kind === 'tree' ? 0.95 : 0.8;
      const ax = need * k;
      const ay = Math.max(8, frontH * (kind === 'tree' && o.kind === 'tree' ? 0.82 : 0.6));
      return (dx / ax) ** 2 + (dy / ay) ** 2 > 1;
    });
  };
  const add = (frame: string, kind: Kind, x: number, y: number, shadow = true) => {
    objects.push({ frame, kind, x, y, shadow, foot: footprintFor(kind, x, y, frame ? sizeOf(frame) : undefined) });
  };
  const sx = Math.round(spawnT.x) * TILE, sy = Math.round(spawnT.y) * TILE;

  // the ruined shrine north-east of the clearing: a broken ring of walls and pillars
  const shrine = { x: Math.round(46 * KX) * TILE, y: Math.round(16 * KY) * TILE };
  const ring: [string, Kind, number, number][] = [
    ['wall0', 'wall', -44, -30], ['wall4', 'wall', 8, -38], ['pillar0', 'pillar', 50, -24], ['wall2', 'wall', 58, 6],
    ['pillar2', 'pillar', 44, 34], ['wall6', 'wall', -8, 40], ['pillar3', 'pillar', -52, 26], ['wall8', 'wall', -62, -2],
  ];
  for (const [f, k, dx, dy] of ring) add(f, k, shrine.x + dx, shrine.y + dy);
  add('chest2', 'prop', shrine.x, shrine.y + 4);
  const braziers = [{ x: shrine.x - 24, y: shrine.y + 4 }, { x: shrine.x + 24, y: shrine.y + 4 }];
  for (const b of braziers) add('', 'brazier', b.x, b.y, false);
  const wisps = [{ x: shrine.x, y: shrine.y - 22 }];

  // smaller ruins scattered about
  const ruinSpots: [number, number][] = [[20, 13], [57, 38], [26, 44], [63, 19], [8, 15], [44, 5]];
  for (const [tx, ty] of ruinSpots) {
    const x = Math.round(tx * KX) * TILE, y = Math.round(ty * KY) * TILE;
    const wall = pick(['wall1', 'wall3', 'wall5', 'wall7', 'wall9', 'wall10']);
    if (!fits(wall, 'wall', x, y)) continue;
    add(wall, 'wall', x, y);
    const pillar = pick(['pillar1', 'pillar4', 'pillar5', 'pillar6']);
    const px = x + sizeOf(wall).w / 2 + sizeOf(pillar).w / 2 + 4, py = y + 8;
    if (r() < 0.8 && fits(pillar, 'pillar', px, py)) add(pillar, 'pillar', px, py);
    const rock = pick(BOULDERS);
    const rx = x - sizeOf(wall).w / 2 - 8, ry = y + 12;
    if (r() < 0.6 && fits(rock, 'rock', rx, ry)) add(rock, 'rock', rx, ry);
  }

  // camp props by the clearing
  const camp: [string, Kind, number, number][] = [
    ['barrel0', 'prop', -56, -34], ['barrel1', 'prop', -42, -38], ['crate0', 'prop', -62, -24],
  ];
  for (const [f, k, dx, dy] of camp) add(f, k, sx + dx, sy + dy);
  add('chest0', 'prop', Math.round(23 * KX) * TILE, Math.round(31 * KY) * TILE);
  add('crate1', 'prop', Math.round(58 * KX) * TILE, Math.round(31 * KY) * TILE);

  // forest: thick round the edge, clumps inside - trees spaced so every trunk shows
  const fn = noise2(9);
  const W = COLS * TILE, H = ROWS * TILE;
  for (let i = 0; i < 9000; i++) {
    const x = -10 + r() * (W + 20), y = r() * (H + 30);
    const edge = Math.min(x, y, W - x, H - y) / TILE;
    const dense = edge < 2.5 || (edge < 7 && fn(x / 80, y / 80) > 0.48) || fn(x / 100, y / 100) > 0.67;
    if (!dense || Math.hypot(x - sx, y - sy) < 110 || Math.hypot(x - shrine.x, y - shrine.y) < 100) continue;
    const f = `tree${Math.floor(r() * 8)}`;
    if (fits(f, 'tree', x, y)) add(f, 'tree', x, y);
  }
  // bushes, rocks, stumps, mushrooms
  const scatter = (n: number, frames: string[], kind: Kind, where?: (x: number, y: number) => boolean) => {
    for (let i = 0, tries = 0; i < n && tries < n * 60; tries++) {
      const x = 24 + r() * (W - 48), y = 30 + r() * (H - 54);
      const f = pick(frames);
      if (Math.hypot(x - sx, y - sy) < 50 || !fits(f, kind, x, y) || (where && !where(x, y))) continue;
      add(f, kind, x, y, kind !== 'bush' || r() < 0.6);
      i++;
    }
  };
  scatter(110, Array.from({ length: 12 }, (_, i) => `bush${i}`), 'bush');
  scatter(26, ROCKS, 'rock');
  scatter(12, BOULDERS, 'rock');
  scatter(16, ['stump0', 'stump1', 'stump2'], 'prop');
  // mushrooms are walk-through: no footprint
  for (let i = 0, tries = 0; i < 26 && tries < 3000; tries++) {
    const x = 24 + r() * (W - 48), y = 30 + r() * (H - 54);
    const f = pick(['mushroom0', 'mushroom1', 'mushroom2']);
    if (fn(x / 100, y / 100) < 0.5 || !fits(f, 'decal', x, y)) continue;
    objects.push({ frame: f, kind: 'decal', x, y, shadow: true });
    i++;
  }
  // rocks along the pond banks
  for (let i = 0, tries = 0; i < 22 && tries < 4000; tries++) {
    const x = r() * W, y = r() * H;
    if (terrainAt(x, y) === T.Water || !near(Math.round(x / TILE), Math.round(y / TILE), T.Water, 1)) continue;
    const f = pick(ROCKS);
    if (!fits(f, 'rock', x, y)) continue;
    add(f, 'rock', x, y);
    i++;
  }

  // lily pads: on open water only
  const lilyN = noise2(13);
  for (let y = 1; y < ROWS; y++) {
    for (let x = 1; x < COLS; x++) {
      // lilies gather in a few drifts, not a carpet
      if (at(x, y) !== T.Water || lilyN(x / 4, y / 4) < 0.58 || r() > 0.35) continue;
      let open = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) !== T.Water) open = false;
      if (!open) continue;
      const lx = x * TILE + (r() - 0.5) * 8, ly = y * TILE + (r() - 0.5) * 8;
      // room round each pad, so they can drift without crowding
      if (objects.some((o) => o.kind === 'lily' && Math.hypot(o.x - lx, (o.y - ly) * 1.6) < 24)) continue;
      objects.push({ frame: `lily${Math.floor(r() * 5)}`, x: lx, y: ly, kind: 'lily' });
    }
  }

  // ground decals: grass tufts everywhere, flowers in drifts, pebbles on paths
  const fl = noise2(5);
  for (let i = 0; i < 2600; i++) {
    const x = r() * W, y = r() * H;
    const t = terrainAt(x, y);
    if (t === T.Water) continue;
    if (t === T.Path) {
      if (r() < 0.25) decals.push({ frame: `pebble${Math.floor(r() * 6)}`, x, y, kind: 'decal' });
      continue;
    }
    const flowers = fl(x / 70, y / 70) > 0.55;
    if (flowers && r() < 0.6) decals.push({ frame: `flower${Math.floor(r() * 9)}`, x, y, kind: 'decal' });
    else if (r() < 0.45) decals.push({ frame: `tuft${Math.floor(r() * 10)}`, x, y, kind: 'decal' });
  }

  const butterflies = [
    { x: sx + 70, y: sy + 50 }, { x: 18 * KX * TILE, y: 30 * KY * TILE }, { x: 52 * KX * TILE, y: 34 * KY * TILE }, { x: 30 * KX * TILE, y: 12 * KY * TILE },
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
