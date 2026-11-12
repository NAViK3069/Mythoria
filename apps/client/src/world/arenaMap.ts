import { rng } from '../art/pixel';
import {
  footprintFor, noise2, T, TILE,
  type Area, type Fire, type Kind, type MeadowMap, type Placed, type ShapeOf,
} from './meadowMap';

// The meadow's battle arena: where fights against the meadow's monsters happen (scenes/BattleScene.ts). A
// clearing in the woods, made of the meadow's own art and lit by the same view as the map: a trodden dirt
// ground in the middle where the two sides line up (kept clear), a wall of trees behind with an old wayshrine
// and its spirit flame between two broken pillars, woods down both sides, a pond with lily pads in the front
// corner, mushrooms round the stumps and logs, flowers, fireflies in the shade and butterflies.

export const ARENA_COLS = 40;
export const ARENA_ROWS = 26;
/** The middle of the fighting ground (px). */
export const ARENA_CENTER = { x: 320, y: 252 };
/** The fighting ground nothing stands on (an oval round the middle, px); props keep a margin beyond it. */
const FIELD = { rx: 164, ry: 78 };

export function buildArena(sizeOf: ShapeOf): MeadowMap {
  const COLS = ARENA_COLS, ROWS = ARENA_ROWS;
  const VW = COLS + 1, VH = ROWS + 1;
  const W = COLS * TILE, H = ROWS * TILE;
  const C = ARENA_CENTER;
  const vert = new Uint8Array(VW * VH);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= VW || y >= VH ? T.Grass : vert[y * VW + x]);
  const set = (x: number, y: number, t: T) => {
    if (x >= 0 && y >= 0 && x < VW && y < VH) vert[y * VW + x] = t;
  };
  const n1 = noise2(71), n2 = noise2(72);

  // the pond, front right; the trodden ground in the middle
  const POND = { x: 462, y: 330, r: 2.6 };
  for (let y = 0; y < VH; y++)
    for (let x = 0; x < VW; x++) {
      const px = x * TILE, py = y * TILE;
      const wob = (n1(x / 2.2, y / 2.2) - 0.5) * 1.6;
      if (Math.hypot(px - POND.x, (py - POND.y) * 1.15) / TILE < POND.r + wob) set(x, y, T.Water);
      const d = ((px - C.x) / 132) ** 2 + ((py - C.y) / 54) ** 2;
      if (d + (n2(x / 2.5, y / 2.5) - 0.5) * 0.45 < 1) set(x, y, T.Path);
    }
  // each tile can show only grass + one other terrain
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const c = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)];
      if (c.includes(T.Path) && c.includes(T.Water))
        for (const [vx, vy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) if (at(vx, vy) === T.Path) set(vx, vy, T.Grass);
    }
  const terrainAt = (px: number, py: number) => at(Math.round(px / TILE), Math.round(py / TILE));

  const r = rng(13);
  const objects: Placed[] = [];
  const decals: Placed[] = [];
  const fires: Fire[] = [];
  const add = (frame: string, kind: Kind, x: number, y: number, shadow = true, flip = false) => {
    const o: Placed = { frame, kind, x, y, shadow, flip, foot: footprintFor(frame, kind, x, y, frame ? sizeOf(frame) : undefined, flip) };
    objects.push(o);
    return o;
  };
  /** The fighting ground (and a margin round it): nothing stands there. */
  const field = (x: number, y: number, m = 0) => ((x - C.x) / (FIELD.rx + m)) ** 2 + ((y - C.y) / (FIELD.ry + m)) ** 2 < 1;
  const fits = (frame: string, x: number, y: number, gap = 8) => {
    const { w, h } = sizeOf(frame);
    if (field(x, y) || field(x, y - h * 0.6)) return false;
    for (const [dx, dy] of [[-w * 0.45, 0], [w * 0.45, 0], [0, -3], [0, 3]]) if (terrainAt(x + dx, y + dy) !== T.Grass) return false;
    return objects.every((o) => {
      const s = o.frame ? sizeOf(o.frame) : { w: 10, h: 10 };
      return !(Math.abs(o.x - x) < (s.w + w) / 2 + gap * 0.5 && y > o.y - s.h - gap && y < o.y + h + gap);
    });
  };

  // behind the field: the old wayshrine, its spirit flame, two broken pillars either side
  const shrine = add('wayshrine', 'prop', C.x, C.y - 70);
  fires.push({ kind: 'spirit', x: shrine.x, y: shrine.y - 33, depth: shrine.y + 0.5 });
  add('pillar0', 'pillar', C.x - 74, C.y - 74);
  add('pillar1', 'pillar', C.x + 76, C.y - 76, true, true);
  add('mossylog', 'prop', C.x - 124, C.y - 86);
  add('stump0', 'prop', C.x + 128, C.y - 88);

  // the woods: a thick wall of trees behind, down both sides, thinning towards the front
  const fw = noise2(74);
  for (let i = 0; i < 14000; i++) {
    const x = -20 + r() * (W + 40), y = -10 + r() * (H + 40);
    // a thick wall behind (round the shrine it stays back, so the shrine shows), woods closing in at both
    // edges of the screen, a few in front
    const back = y < C.y - 108 || (y < C.y - 86 && Math.abs(x - C.x) > 152);
    const side = (x < C.x - 164 || x > C.x + 164) && y > C.y - 122;
    const front = y > C.y + 94 && fw(x / 60, y / 60) > 0.45;
    if (!(back || side || front)) continue;
    const f = `tree${Math.floor(r() * 8)}`;
    if (fits(f, x, y, back ? 0 : 4)) add(f, 'tree', x, y, true, r() < 0.5);
  }
  // round the field: bushes, rocks, stumps and logs (mushrooms grow by them)
  // [picture, kind, how many, how many variants it has (0: just the one)]
  const props: [string, Kind, number, number][] = [
    ['bush', 'bush', 14, 12], ['rock', 'rock', 7, 12], ['boulder', 'rock', 3, 8], ['stump', 'prop', 3, 3],
    ['mossylog', 'prop', 2, 0], ['log', 'prop', 1, 0], ['choppedstump', 'prop', 1, 0],
  ];
  for (const [f, kind, n, variants] of props)
    for (let i = 0, tries = 0; i < n && tries < 600; tries++) {
      const x = 40 + r() * (W - 80), y = 60 + r() * (H - 70);
      const frame = variants ? `${f}${Math.floor(r() * variants)}` : f;
      if (!field(x, y, 40) || !fits(frame, x, y, 10)) continue;
      const o = add(frame, kind, x, y, kind !== 'bush' || r() < 0.6, r() < 0.5);
      i++;
      if (/stump|log/.test(frame)) for (let k = 0; k < 3; k++) decals.push({ frame: `mushroom${Math.floor(r() * 3)}`, kind: 'decal', x: o.x + (r() - 0.5) * 26, y: o.y + 2 + r() * 6 });
    }
  // lily pads on the pond, reeds of tall grass round it
  for (let i = 0, tries = 0; i < 5 && tries < 300; tries++) {
    const x = POND.x + (r() - 0.5) * 80, y = POND.y + (r() - 0.5) * 40;
    if (terrainAt(x, y) !== T.Water || terrainAt(x + 6, y) !== T.Water || terrainAt(x - 6, y) !== T.Water) continue;
    if (objects.some((o) => o.kind === 'lily' && Math.hypot(o.x - x, o.y - y) < 14)) continue;
    add(`lily${Math.floor(r() * 4)}`, 'lily', x, y, false);
    i++;
  }

  // the ground: tufts everywhere, flowers in drifts, pebbles on the trodden earth, mushrooms in the shade
  const fl = noise2(75);
  for (let i = 0; i < 1500; i++) {
    const x = r() * W, y = r() * H;
    const t = terrainAt(x, y);
    if (t === T.Water) continue;
    if (t === T.Path) {
      if (r() < 0.07) decals.push({ frame: `pebble${Math.floor(r() * 6)}`, kind: 'decal', x, y });
      continue;
    }
    if (fl(x / 50, y / 50) > 0.55 && r() < 0.75) decals.push({ frame: `flower${Math.floor(r() * 9)}`, kind: 'decal', x, y });
    else if (r() < 0.45) decals.push({ frame: `tuft${Math.floor(r() * 10)}`, kind: 'decal', x, y });
    else if (y < 150 && r() < 0.08) decals.push({ frame: `mushroom${Math.floor(r() * 3)}`, kind: 'decal', x, y });
  }

  const flowers = decals.filter((d) => d.frame.startsWith('flower')).map((d) => ({ x: d.x, y: d.y }));
  const butterflies: { x: number; y: number }[] = [];
  for (const f of flowers) {
    if (butterflies.length >= 4) break;
    if (!field(f.x, f.y) && butterflies.every((b) => Math.hypot(b.x - f.x, b.y - f.y) > 120)) butterflies.push({ x: f.x, y: f.y - 10 });
  }
  const areas: Area[] = [{ name: 'ลานต่อสู้', sub: 'ทุ่งหญ้า', x: C.x, y: C.y, r: 200 }];

  return {
    id: 'arena_meadow', cols: COLS, rows: ROWS, paved: 'path', vert, objects, decals,
    spawn: { ...C }, braziers: [], fires, wisps: [], butterflies, flowers, areas, warps: [], doors: [],
    glades: [{ x: C.x - 170, y: 120, r: 70 }, { x: C.x + 180, y: 130, r: 70 }, { x: 70, y: 300, r: 60 }],
  };
}
