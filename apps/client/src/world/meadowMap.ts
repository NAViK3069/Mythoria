import { rng } from '../art/pixel';
import HITBOXES from './hitboxes.json';
import { PAD } from '../fx/effects/warp';

// The first test map: a meadow with ponds, winding dirt paths, patches of dark
// grass, an old ruined shrine, an abandoned village to the east, an adventurers'
// camp to the south and a forest round the edge. The terrain is a
// grid of VERTICES (corners); each 16px tile is drawn from the four terrains at
// its corners (Wang autotiling), so edges between terrains come out smooth.

export const TILE = 16;
/** How far past a map's edges the ground goes on (px): as far as the camera may ever look past them. */
export const BEYOND = 14 * TILE;
export const COLS = 128;
export const ROWS = 92;

export const enum T {
  Grass = 0,
  Water = 1,
  Path = 2,
  Dark = 3,
}

export type Kind = 'tree' | 'bush' | 'wall' | 'pillar' | 'rock' | 'prop' | 'lily' | 'decal' | 'brazier' | 'house' | 'tent' | 'post';

/**
 * The part of an object that stands on the ground, which you can't walk into: an outline (polygon)
 * that follows the object's own base in the picture - a tent or a house seen corner-on is a diamond,
 * a log lying aslant a slanted strip, a well a circle. The outlines are worked out per picture by
 * tools/hitboxes.py (hand-drawn where the picture needs it) into hitboxes.json.
 * x, y, hw, hd are the outline's bounding box (centre and half sizes), for quick tests.
 */
export interface Footprint {
  x: number;
  y: number;
  hw: number;
  hd: number;
  /** The outline in world px: x0, y0, x1, y1, ... */
  poly: number[];
  /** Front edge: the lowest point of the outline (where it is drawn in depth order when nothing is near). */
  front: number;
}

export interface Placed {
  frame: string; // atlas frame ('' = drawn by something else, e.g. a brazier effect)
  x: number; // base (bottom centre) position in px
  y: number;
  kind: Kind;
  /** Where it blocks; none = walk-through (decals, lily pads, mushrooms). */
  foot?: Footprint;
  shadow?: boolean;
  /** Drawn mirrored (left-right), so it faces the other way; its footprint and shadow are mirrored too. */
  flip?: boolean;
}

/** Something burning on the map; the effects are drawn in code (fx/effects/fire.ts). */
export interface Fire {
  kind: 'campfire' | 'cookfire' | 'hearth' | 'spirit' | 'torch' | 'brazier' | 'lantern'
    // the town's: smoke from a chimney, a smithy's forge, a magic crystal's light, a street lamp's light
    | 'smoke' | 'forge' | 'crystal' | 'lamp';
  /** Where the flames stand (for a torch or brazier: the foot of its stand). */
  x: number;
  y: number;
  /** Depth to draw the flames at (so they sit in front of or behind their pit / pot). */
  depth: number;
  /** The thing it burns in (pit, hearth, shrine): the flames are drawn with it, just in front. */
  owner?: Placed;
}

/** A warp pad: step on it to jump to any other. (x, y) is the middle of the pad (it lies flat on the ground). */
export interface Warp {
  id: string;
  name: string;
  sub: string;
  x: number;
  y: number;
}

/** A door (or a board) you can walk up to: standing within r of (x, y) offers to open a panel. */
export interface Door {
  x: number;
  y: number;
  r: number;
  /** What it is (shown on the prompt) and a line under it. */
  name: string;
  sub: string;
  /** The panel it opens (ui/panels); none = not open yet. */
  panel?: string;
}

/** A named part of the map, announced when you walk into it. */
export interface Area {
  name: string;
  sub: string;
  x: number;
  y: number;
  r: number;
}

/** A map the hero walks: the meadow (Lv.1), the town (the lobby), ... (built by meadowMap / townMap). */
export interface MeadowMap {
  /** Which map this is (see world/maps.ts). */
  id: string;
  /** Its size in tiles. */
  cols: number;
  rows: number;
  /** Which tileset draws the T.Path terrain: the meadow's dirt paths or the town's cobbles. */
  paved: 'path' | 'cobble';
  /** (cols+1) x (rows+1) vertex terrain. */
  vert: Uint8Array;
  objects: Placed[];
  decals: Placed[];
  spawn: { x: number; y: number };
  braziers: { x: number; y: number }[];
  fires: Fire[];
  wisps: { x: number; y: number }[];
  butterflies: { x: number; y: number }[];
  /** Flowers butterflies can land on. */
  flowers: { x: number; y: number }[];
  areas: Area[];
  warps: Warp[];
  /** Doors and boards you can walk up to and use (the town's shops). */
  doors: Door[];
  /** A fountain whose water is drawn live (the town's), standing on that object. */
  fountain?: { x: number; y: number; owner: Placed };
  /** Where fireflies / spirit motes drift. */
  glades: { x: number; y: number; r: number }[];
}

/** What the map needs to know about a picture: its size. */
export interface Shape {
  w: number;
  h: number;
}
export type ShapeOf = (frame: string) => Shape;

const ROCKS = Array.from({ length: 12 }, (_, i) => `rock${i}`);
const BOULDERS = Array.from({ length: 8 }, (_, i) => `boulder${i}`);

const VW = COLS + 1;
const VH = ROWS + 1;

/** An outline (points relative to a spot) placed at (x, y) as a footprint. */
function footprintOf(pts: readonly (readonly [number, number])[], x: number, y: number): Footprint {
  const poly: number[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of pts) {
    const X = x + px, Y = y + py;
    poly.push(X, Y);
    x0 = Math.min(x0, X), x1 = Math.max(x1, X), y0 = Math.min(y0, Y), y1 = Math.max(y1, Y);
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, hw: (x1 - x0) / 2, hd: (y1 - y0) / 2, poly, front: y1 };
}

/** An oval outline, n corners. */
const oval = (cx: number, cy: number, rx: number, ry: number, n = 10) =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry] as const);

/**
 * Where a thing stands on the ground. Pictures use their own outline from hitboxes.json (relative to
 * the picture's bottom centre, where it is stood on the map). Torch stakes and braziers are drawn in
 * code and get a small base; bushes (which you walk through) an oval just to keep them spaced apart.
 */
export function footprintFor(frame: string, kind: Kind, x: number, y: number, s?: Shape, flip = false): Footprint | undefined {
  // the picture is drawn at whole pixels, so its outline is too
  const X = Math.round(x), Y = Math.round(y);
  if (kind === 'brazier') return footprintOf(oval(0, -2.5, 5.5, 3, 8), X, Y);
  const pts = (HITBOXES as unknown as Record<string, [number, number][]>)[frame];
  if (pts) return footprintOf(flip ? pts.map(([px, py]) => [-px, py] as const) : pts, X, Y);
  if (kind === 'bush' && s) return footprintOf(oval(0, -s.h * 0.2, s.w * 0.4, s.h * 0.2, 8), X, Y);
  return undefined;
}

/** Is (x, y) inside any of these footprints? */
export function insideFeet(feet: Footprint[], x: number, y: number): boolean {
  for (const f of feet) {
    if (Math.abs(x - f.x) > f.hw + 1 || Math.abs(y - f.y) > f.hd + 1) continue;
    const p = f.poly;
    let c = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2)
      if (p[i + 1] > y !== p[j + 1] > y && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
    if (c) return true;
  }
  return false;
}

/** Smooth value noise in [0, 1]. */
export function noise2(seed: number) {
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

export const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// The layout is designed on a 96 x 69 sketch and stretched onto the real grid. (The meadow in the
// north-west quarter was first drawn for a 72 x 52 map; the village and the camp extend it.)
const KX = COLS / 96;
const KY = ROWS / 69;
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
    [70, 61, 3.4], [74, 63.5, 3], [67, 64.5, 2.4], // reed pond south-east
    [92, 52, 2.8], [89, 55, 2.2], // a pool below the village
  ].map(([x, y, r]) => [x * KX, y * KY, r * KR]);
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const wob = (n1(x / 3, y / 3) - 0.5) * 2.4;
      if (ponds.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) < r + wob)) set(x, y, T.Water);
    }
  }

  // --- dirt paths from the clearing in the middle, out to each side
  const spawnT = { x: 34 * KX, y: 26 * KY };
  const villageT = { x: 82 * KX, y: 29 * KY };
  const campT = { x: 40 * KX, y: 59 * KY };
  const paths = [
    [[34, 26], [33, 19], [36, 12], [35, 4], [36, -1]],
    [[34, 26], [42, 27], [50, 24], [60, 26], [73, 25], [82, 29], [90, 28], [97, 31]],
    [[34, 26], [27, 28], [22, 25], [12, 24], [-1, 26]],
    [[34, 26], [36, 33], [33, 41], [36, 52], [40, 59], [37, 65], [39, 70]],
    [[82, 29], [83, 37], [80, 45], [70, 53], [56, 56], [40, 59]],
    [[40, 59], [27, 61], [16, 58], [-1, 60]],
  ].map((p) => p.map(([x, y]) => [x * KX, y * KY]));
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      if (at(x, y) === T.Water) continue;
      let d = Math.hypot(x - spawnT.x, y - spawnT.y) - 3; // a clearing at the crossroads
      d = Math.min(d, Math.hypot(x - villageT.x, (y - villageT.y) * 1.2) - 4.2); // the village square
      d = Math.min(d, Math.hypot(x - campT.x, (y - campT.y) * 1.3) - 3.4); // the camp's yard
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
  /** Ground kept clear for things placed by hand later (the warp pads). */
  const reserved: { x: number; y: number; r: number }[] = [];
  const fits = (frame: string, kind: Kind, x: number, y: number) => {
    if (reserved.some((z) => Math.hypot(x - z.x, (y - z.y) * 1.3) < z.r)) return false;
    const { w } = sizeOf(frame);
    const half = w * 0.45;
    for (const [dx, dy] of [[-half, 0], [half, 0], [0, -3], [0, 3]]) {
      const t = terrainAt(x + dx, y + dy);
      if (t === T.Water || t === T.Path) return false;
    }
    // Blocking things leave a gap the player can really walk through - never a sliver
    // they half squeeze into.
    const foot = footprintFor(frame, kind, x, y, sizeOf(frame));
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
      fy > by && Math.abs(bx - fx) < fw * 0.5 && by > fy - fh - 6;
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
  // warp pads: one where each path leaves the map - the gates on to the next maps. Each stands on its
  // path a few tiles in from the edge (in the clearing the path makes through the edge forest).
  const EXITS: Record<string, [string, string]> = {
    north: ['ทางออกทิศเหนือ', 'ปลายทางเดินด้านเหนือ'],
    east: ['ทางออกทิศตะวันออก', 'ถนนออกจากหมู่บ้าน'],
    west: ['ทางออกทิศตะวันตก', 'ทางเดินริมบึง'],
    southwest: ['ทางออกตะวันตกเฉียงใต้', 'ทางเดินจากค่าย'],
    south: ['ทางออกทิศใต้', 'ทางเดินผ่านค่าย'],
  };
  const warps: Warp[] = [];
  const IN = 3.6; // tiles in from the edge
  for (const p of paths) {
    const [ax, ay] = p[p.length - 2], [bx, by] = p[p.length - 1];
    const inside = (x: number, y: number) => Math.min(x, y, COLS - x, ROWS - y);
    if (inside(bx, by) >= 0) continue; // this path doesn't leave the map
    let best: [number, number] | null = null;
    for (let i = 0; i <= 400; i++) {
      const x = ax + ((bx - ax) * i) / 400, y = ay + ((by - ay) * i) / 400;
      if (inside(x, y) >= IN) best = [x, y];
    }
    if (!best) continue;
    const side = bx < 0 ? (by > ROWS * 0.55 ? 'southwest' : 'west') : bx > COLS ? 'east' : by < 0 ? 'north' : 'south';
    const n = warps.filter((w) => w.id.startsWith(side)).length;
    const [name, sub] = EXITS[side];
    warps.push({ id: n ? `${side}${n + 1}` : side, name: n ? `${name} ${n + 1}` : name, sub, x: Math.round(best[0] * TILE), y: Math.round(best[1] * TILE) });
  }
  for (const w of warps) {
    reserved.push({ x: w.x, y: w.y, r: 78 });
    // a tree just in front would hide the pad under its canopy: keep more room on that side
    reserved.push({ x: w.x, y: w.y + 52, r: 74 });
  }

  /**
   * Put something down. Things placed by hand (the village, the camp) never cover a warp pad: one whose
   * picture would lie over a pad is moved off to the side of it.
   */
  const add = (frame: string, kind: Kind, x: number, y: number, shadow = true) => {
    if (frame)
      for (const w of warps) {
        const { w: fw, h: fh } = sizeOf(frame);
        const over = Math.abs(x - w.x) < PAD.rx + fw / 2 + 2 && y > w.y - PAD.ry - 6 && y - fh < w.y + PAD.ry + 4;
        if (over) x = w.x + (x < w.x ? -1 : 1) * (PAD.rx + fw / 2 + 6);
      }
    objects.push({ frame, kind, x, y, shadow, foot: footprintFor(frame, kind, x, y, frame ? sizeOf(frame) : undefined) });
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
  const fires: Fire[] = braziers.map((b) => ({ kind: 'brazier', x: b.x, y: b.y, depth: b.y + 0.5 }));
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
    const rock = pick(ROCKS);
    const rx = x - sizeOf(wall).w / 2 - 8, ry = y + 12;
    if (r() < 0.6 && fits(rock, 'rock', rx, ry)) add(rock, 'rock', rx, ry);
  }

  // camp props by the clearing
  const supplies: [string, Kind, number, number][] = [
    ['barrel0', 'prop', -56, -34], ['barrel1', 'prop', -42, -38], ['crate0', 'prop', -62, -24],
  ];
  for (const [f, k, dx, dy] of supplies) add(f, k, sx + dx, sy + dy);
  add('chest0', 'prop', Math.round(23 * KX) * TILE, Math.round(31 * KY) * TILE);
  add('crate1', 'prop', Math.round(58 * KX) * TILE, Math.round(31 * KY) * TILE);

  // --- the abandoned village, east: four ruined cottages round a square with an old well
  const village = { x: Math.round(villageT.x) * TILE, y: Math.round(villageT.y) * TILE };
  const at2 = (o: { x: number; y: number }, dx: number, dy: number) => [o.x + dx, o.y + dy] as const;
  const villageParts: [string, Kind, number, number][] = [
    ['house0', 'house', -128, -60], ['house1', 'house', 118, -74], ['house2', 'house', -134, 128], ['house3', 'house', 128, 122],
    ['well', 'prop', 6, 4],
    ['wayshrine', 'prop', 22, -150],
    ['grave', 'prop', -32, -138], ['grave', 'prop', -58, -150], ['grave', 'prop', -84, -136],
    ['chimney', 'prop', 240, 118], ['hearth', 'prop', -64, 214], ['beams', 'prop', 64, 186], ['rubblewall', 'prop', -236, 40],
    ['stonepile', 'rock', 222, 176], ['haystack', 'prop', 210, -112], ['cart', 'prop', -196, -118],
    ['fence', 'prop', -60, 70], ['fence', 'prop', 66, 62], ['fence', 'prop', 182, 72],
    ['barrel3', 'prop', -70, -42], ['brokenjar', 'prop', -52, -30], ['wheel', 'prop', 58, -36], ['pots', 'prop', 168, -44],
    ['bucket', 'prop', 30, 14], ['amphora', 'prop', -176, 156], ['sign1', 'post', -164, 6], ['spilledbucket', 'prop', -20, 22],
  ];
  for (const [f, k, dx, dy] of villageParts) add(f, k, ...at2(village, dx, dy));
  decals.push({ frame: 'olddoor', kind: 'decal', x: village.x - 130, y: village.y + 206 });
  const wayshrine = at2(village, 22, -150);
  fires.push({ kind: 'spirit', x: wayshrine[0], y: wayshrine[1] - 33, depth: wayshrine[1] + 0.5 });
  const hearth = at2(village, -64, 214);
  fires.push({ kind: 'hearth', x: hearth[0] - 2, y: hearth[1] - 12, depth: hearth[1] + 0.5 });

  // --- the adventurers' camp, south: two tents round a big fire, a cooking fire, racks and supplies
  const camp = { x: Math.round(campT.x) * TILE, y: Math.round(campT.y) * TILE };
  const campParts: [string, Kind, number, number][] = [
    ['firepit', 'prop', 0, 6],
    ['tent0', 'tent', -84, -34], ['tent1', 'tent', 86, -40],
    ['logseat', 'prop', -38, 2], ['logseat', 'prop', 40, 4], ['mossylog', 'prop', 2, -26],
    ['smallpit', 'decal', -96, 52], ['tripod', 'prop', -96, 52],
    ['hiderack', 'prop', -150, 8], ['weaponrack', 'prop', 150, 4], ['target', 'prop', 196, 58],
    ['lamppost', 'post', 40, -70], ['keg', 'prop', 120, -14], ['barrel2', 'prop', 134, -24], ['sacks', 'prop', -132, -46],
    ['backpack0', 'prop', -46, -22], ['logs', 'prop', -32, 36], ['kindling', 'decal', 28, 36], ['axestump', 'prop', -150, 70],
    ['applecrate', 'prop', 120, 42], ['herbcrate', 'prop', 98, 52], ['stool', 'prop', -64, 58], ['cauldron', 'prop', -126, 60],
    ['mapscroll', 'decal', 60, 24], ['sign0', 'post', -38, -74],
  ];
  for (const [f, k, dx, dy] of campParts) {
    const [x, y] = at2(camp, dx, dy);
    if (k === 'decal') objects.push({ frame: f, kind: 'decal', x, y, shadow: false });
    else add(f, k, x, y);
  }
  decals.push({ frame: 'bedroll0', kind: 'decal', x: camp.x - 84, y: camp.y - 10 }, { frame: 'bedroll1', kind: 'decal', x: camp.x + 90, y: camp.y - 16 });
  fires.push({ kind: 'campfire', x: camp.x, y: camp.y - 8, depth: camp.y + 6.5 });
  fires.push({ kind: 'cookfire', x: camp.x - 96, y: camp.y + 47, depth: camp.y + 51.5 });
  for (const [dx, dy] of [[-22, -96], [24, -100]] as const) {
    add('', 'brazier', camp.x + dx, camp.y + dy, false);
    fires.push({ kind: 'torch', x: camp.x + dx, y: camp.y + dy, depth: camp.y + dy + 0.5 });
  }
  const lamp = at2(camp, 40, -70);
  fires.push({ kind: 'lantern', x: lamp[0] - 6, y: lamp[1] - 34, depth: lamp[1] + 0.5 });

  // warp pads: one in each part of the map, a waystone floating at the back of each
  // a few things left along the roads
  add('handcart', 'prop', Math.round(60 * KX) * TILE, Math.round(51 * KY) * TILE);
  add('sign1', 'post', sx + 52, sy - 36);
  add('wheelflat', 'prop', Math.round(14 * KX) * TILE, Math.round(55 * KY) * TILE);

  // forest: thick round the edge, clumps inside - trees spaced so every trunk shows
  const fn = noise2(9);
  const W = COLS * TILE, H = ROWS * TILE;
  for (let i = 0; i < 9000; i++) {
    const x = -10 + r() * (W + 20), y = r() * (H + 30);
    const edge = Math.min(x, y, W - x, H - y) / TILE;
    const dense = edge < 2.5 || (edge < 7 && fn(x / 80, y / 80) > 0.48) || fn(x / 100, y / 100) > 0.67;
    if (!dense || Math.hypot(x - sx, y - sy) < 110 || Math.hypot(x - shrine.x, y - shrine.y) < 100) continue;
    if (Math.hypot(x - village.x, (y - village.y) * 1.1) < 300 || Math.hypot(x - camp.x, (y - camp.y) * 1.2) < 230) continue;
    const f = `tree${Math.floor(r() * 8)}`;
    if (fits(f, 'tree', x, y)) add(f, 'tree', x, y);
  }
  // bushes, rocks, stumps, mushrooms
  const scatter = (n: number, frames: string[], kind: Kind, where?: (x: number, y: number) => boolean) => {
    for (let i = 0, tries = 0; i < n && tries < n * 60; tries++) {
      const x = 24 + r() * (W - 48), y = 30 + r() * (H - 54);
      const f = pick(frames);
      if (Math.hypot(x - sx, y - sy) < 50 || Math.hypot(x - village.x, y - village.y) < 200 || Math.hypot(x - camp.x, y - camp.y) < 170) continue;
      if (!fits(f, kind, x, y) || (where && !where(x, y))) continue;
      add(f, kind, x, y, kind !== 'bush' || r() < 0.6);
      i++;
    }
  };
  scatter(200, Array.from({ length: 12 }, (_, i) => `bush${i}`), 'bush');
  scatter(54, ROCKS, 'rock');
  scatter(18, BOULDERS, 'rock');
  scatter(24, ['stump0', 'stump1', 'stump2', 'choppedstump'], 'prop');
  scatter(10, ['mossylog', 'log'], 'prop');
  // mushrooms are walk-through: no footprint
  for (let i = 0, tries = 0; i < 46 && tries < 5000; tries++) {
    const x = 24 + r() * (W - 48), y = 30 + r() * (H - 54);
    const f = pick(['mushroom0', 'mushroom1', 'mushroom2']);
    if (fn(x / 100, y / 100) < 0.5 || !fits(f, 'decal', x, y)) continue;
    objects.push({ frame: f, kind: 'decal', x, y, shadow: true });
    i++;
  }
  // rocks along the pond banks
  for (let i = 0, tries = 0; i < 36 && tries < 6000; tries++) {
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
  for (let i = 0; i < 4700; i++) {
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

  // each fire burns in something: draw it with that thing, so they sort together
  const OWNER: Partial<Record<Fire['kind'], string>> = { campfire: 'firepit', cookfire: 'tripod', hearth: 'hearth', spirit: 'wayshrine' };
  for (const f of fires) {
    const frame = OWNER[f.kind];
    if (!frame) continue;
    let best = 60;
    for (const o of objects) {
      const d = o.frame === frame ? Math.hypot(o.x - f.x, o.y - f.y) : Infinity;
      if (d < best) (best = d), (f.owner = o);
    }
  }

  // butterflies keep to the drifts of flowers, a patch each
  const flowers = decals.filter((d) => d.frame.startsWith('flower')).map((d) => ({ x: d.x, y: d.y }));
  const butterflies: { x: number; y: number }[] = [{ x: sx + 70, y: sy + 50 }];
  for (const f of flowers) {
    if (butterflies.length >= 34) break;
    if (butterflies.every((b) => Math.hypot(b.x - f.x, b.y - f.y) > 150)) butterflies.push({ x: f.x, y: f.y - 10 });
  }

  // names here are plain descriptions (placeholders until the owner names the places)
  const areas: Area[] = [
    { name: 'หมู่บ้านร้าง', sub: 'ซากบ้านเรือนที่ถูกทิ้งไว้', x: village.x, y: village.y, r: 230 },
    { name: 'ค่ายพักแรม', sub: 'ที่พักของนักผจญภัย', x: camp.x, y: camp.y, r: 170 },
    { name: 'ศาลเจ้าเก่า', sub: 'ซากศาลเจ้า', x: shrine.x, y: shrine.y, r: 110 },
  ];
  const glades = [
    { x: village.x, y: village.y + 20, r: 260 },
    { x: shrine.x, y: shrine.y, r: 120 },
    { x: camp.x, y: camp.y - 10, r: 150 },
  ];

  return { id: 'meadow', cols: COLS, rows: ROWS, paved: 'path', vert, objects, decals, spawn: { x: sx, y: sy }, braziers, fires, wisps, butterflies, flowers, areas, warps, doors: [], glades };
}

/** Terrain at a vertex. */
export function vertexAt(map: MeadowMap, x: number, y: number): T {
  const w = map.cols + 1;
  if (x < 0 || y < 0 || x >= w || y > map.rows) return T.Grass;
  return map.vert[y * w + x] as T;
}

/** How much of the ground at a pixel is water (0..1), blended from the corners. */
export function waterAt(map: MeadowMap, px: number, py: number): number {
  const fx = px / TILE, fy = py / TILE;
  const x = Math.floor(fx), y = Math.floor(fy);
  const u = fx - x, v = fy - y;
  const w = (vx: number, vy: number) => (vertexAt(map, vx, vy) === T.Water ? 1 : 0);
  return w(x, y) * (1 - u) * (1 - v) + w(x + 1, y) * u * (1 - v) + w(x, y + 1) * (1 - u) * v + w(x + 1, y + 1) * u * v;
}
