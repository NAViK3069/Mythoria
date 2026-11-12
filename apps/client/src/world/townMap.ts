import { rng } from '../art/pixel';
import {
  distToSegment, footprintFor, noise2, T, TILE,
  type Area, type Door, type Fire, type Kind, type MeadowMap, type Placed, type ShapeOf, type Warp,
} from './meadowMap';

// The main town - the lobby the game starts in. A round cobbled plaza with a grand fountain in the middle,
// the guild hall, the general store and the summon temple on its north side, the potion shop and a house to
// the west and east, the inn and the smithy to the south; houses and gardens further out, woods round the
// edge, and four roads out of town - the south one ends at the gate's warp pad.
//
// Names of places here are plain descriptions (placeholders until the owner names them).

export const TOWN_COLS = 80;
export const TOWN_ROWS = 64;

export function buildTown(sizeOf: ShapeOf): MeadowMap {
  const COLS = TOWN_COLS, ROWS = TOWN_ROWS;
  const VW = COLS + 1, VH = ROWS + 1;
  const W = COLS * TILE, H = ROWS * TILE;
  const vert = new Uint8Array(VW * VH);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= VW || y >= VH ? T.Grass : vert[y * VW + x]);
  const set = (x: number, y: number, t: T) => {
    if (x >= 0 && y >= 0 && x < VW && y < VH) vert[y * VW + x] = t;
  };

  // --- the ground: cobbles for the plaza, the roads and the lanes to the doors; dark grass in the gardens
  const C = { x: 640, y: 470 }; // the middle of the plaza (px)
  const PLAZA = { rx: 178, ry: 152 };
  const roads: [number, number, number, number, number][] = [
    // x0, y0, x1, y1, half width (px)
    [C.x, C.y, C.x, 286, 36], // north, up to the guild's steps
    [C.x, C.y, C.x, H + 20, 34], // south, out through the gate
    [C.x, C.y, W + 20, C.y, 30], // east
    [C.x, C.y, -20, C.y, 30], // west
    // lanes to the doors off the plaza
    [432, 726, 600, 690, 18], // the inn
    [868, 722, 680, 690, 18], // the smithy
    [314, 448, 330, 470, 14], // the potion shop
    [1010, 436, 1000, 470, 14], // the house east
  ];
  const n1 = noise2(41), n2 = noise2(42);
  for (let y = 0; y < VH; y++)
    for (let x = 0; x < VW; x++) {
      const px = x * TILE, py = y * TILE;
      const wob = (n1(x / 2.5, y / 2.5) - 0.5) * 10;
      let paved = ((px - C.x) / PLAZA.rx) ** 2 + ((py - C.y) / PLAZA.ry) ** 2 < 1 + wob / 400;
      for (const [x0, y0, x1, y1, hw] of roads) if (distToSegment(px, py, x0, y0, x1, y1) < hw + wob * 0.4) paved = true;
      if (paved) set(x, y, T.Path);
    }
  // gardens: patches of darker grass away from the cobbles
  const near = (x: number, y: number, t: T, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (at(x + dx, y + dy) === t) return true;
    return false;
  };
  for (let y = 0; y < VH; y++)
    for (let x = 0; x < VW; x++) if (at(x, y) === T.Grass && n2(x / 6, y / 6) > 0.62 && !near(x, y, T.Path, 2)) set(x, y, T.Dark);
  for (let pass = 0; pass < 2; pass++)
    for (let y = 0; y < VH; y++)
      for (let x = 0; x < VW; x++) {
        if (at(x, y) !== T.Dark) continue;
        const n = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].filter((t) => t === T.Dark).length;
        if (n < 3) set(x, y, T.Grass);
      }
  // each tile can show only grass + one other terrain: cobbles win
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const c = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)];
      if (c.includes(T.Path) && c.includes(T.Dark))
        for (const [vx, vy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) if (at(vx, vy) === T.Dark) set(vx, vy, T.Grass);
    }
  const terrainAt = (px: number, py: number) => at(Math.round(px / TILE), Math.round(py / TILE));

  // --- things
  const r = rng(7);
  const objects: Placed[] = [];
  const decals: Placed[] = [];
  const fires: Fire[] = [];
  const doors: Door[] = [];
  const add = (frame: string, kind: Kind, x: number, y: number, shadow = true, flip = false) => {
    const o: Placed = { frame, kind, x, y, shadow, flip, foot: footprintFor(frame, kind, x, y, frame ? sizeOf(frame) : undefined, flip) };
    objects.push(o);
    return o;
  };
  /** Room for a scattered thing: off the cobbles, clear of every footprint and of the pictures in front. */
  const fits = (frame: string, x: number, y: number, gap = 14) => {
    const { w, h } = sizeOf(frame);
    for (const [dx, dy] of [[-w * 0.45, 0], [w * 0.45, 0], [0, -4], [0, 4], [0, -h * 0.5]]) if (terrainAt(x + dx, y + dy) === T.Path) return false;
    if (x < 6 || x > W - 6 || y < 10 || y > H) return false;
    return objects.every((o) => {
      const s = o.frame ? sizeOf(o.frame) : { w: 10, h: 10 };
      const dx = Math.abs(o.x - x);
      // neither base inside the other's picture, and a little room round each
      if (dx < (s.w + w) / 2 + gap * 0.5 && y > o.y - s.h - gap && y < o.y + h + gap) return false;
      return true;
    });
  };

  // the plaza: the fountain in the middle, benches round it, lamps round the edge, market stalls
  const fountain = add('t_fountain', 'prop', C.x, C.y + 50);
  for (const [dx, dy] of [[-46, 92], [46, 92], [-84, 34], [84, 34]] as const) add('t_stonebench', 'prop', C.x + dx, C.y + dy);
  for (const deg of [30, 60, 120, 150, 210, 240, 300, 330]) {
    const a = (deg * Math.PI) / 180;
    const lx = C.x + Math.cos(a) * (PLAZA.rx + 10), ly = C.y - Math.sin(a) * (PLAZA.ry + 8);
    add('t_lamp', 'post', lx, ly);
    fires.push({ kind: 'lamp', x: lx, y: ly - 56, depth: ly + 0.5 });
  }
  // market stalls on either side, each turned to face the fountain, with a little room round it
  add('t_stall_red', 'prop', C.x - 128, C.y - 38);
  add('t_stall_fruit', 'prop', C.x + 130, C.y - 38, true, true);
  add('t_stall_cloth', 'prop', C.x - 120, C.y + 100);
  add('t_bakery', 'prop', C.x + 120, C.y + 100);
  add('t_crate_apple', 'prop', C.x + 172, C.y - 34);
  add('t_crate_fish', 'prop', C.x - 166, C.y - 28);
  add('t_breadbasket', 'prop', C.x + 164, C.y + 104);

  // the buildings round the plaza (and the doors that open their panels)
  add('t_guild', 'house', C.x, 300);
  doors.push({ x: C.x, y: 290, r: 26, name: 'กิลด์นักผจญภัย', sub: 'กิลด์ • สมาชิก • บอสกิลด์', panel: 'guild' });
  add('t_banner', 'post', C.x - 56, 318);
  add('t_banner', 'post', C.x + 56, 318);
  add('t_store', 'house', 440, 332);
  doors.push({ x: 412, y: 330, r: 24, name: 'ร้านค้าทั่วไป', sub: 'ซื้อขายไอเทม', panel: 'shop' });
  const temple = add('t_temple', 'house', 842, 330);
  doors.push({ x: 842, y: 340, r: 26, name: 'วิหารอัญเชิญ', sub: 'อัญเชิญฮีโร่', panel: 'summon' });
  add('t_questboard', 'prop', 742, 366, true, true); // turned to face the plaza
  doors.push({ x: 742, y: 376, r: 24, name: 'กระดานเควส', sub: 'เควสประจำวัน • ประจำสัปดาห์', panel: 'quests' });
  add('t_potionshop', 'house', 292, 440);
  doors.push({ x: 314, y: 444, r: 22, name: 'ร้านยาวิเศษ', sub: 'ยาและวัตถุดิบ', panel: 'shop' });
  const east = add('t_house0', 'house', 1006, 430);
  const inn = add('t_inn', 'house', 432, 722);
  doors.push({ x: 434, y: 732, r: 24, name: 'โรงเตี๊ยม', sub: 'เร็วๆ นี้' });
  const smithy = add('t_smithy', 'house', 868, 718);
  doors.push({ x: 876, y: 726, r: 24, name: 'โรงตีเหล็ก', sub: 'เร็วๆ นี้' });

  // the things round them
  add('t_goods', 'prop', 352, 300);
  add('t_box_red', 'prop', 488, 346);
  add('t_pot_red', 'prop', 384, 350);
  add('t_flowercart', 'prop', 940, 386);
  add('t_crystal_blue', 'post', 786, 350);
  add('t_crystal_blue', 'post', 898, 350);
  add('t_statue', 'prop', 452, 528);
  add('t_planter', 'prop', 566, 662);
  add('t_signpost', 'post', 716, 668);
  add('t_box_yellow', 'prop', 360, 742);
  add('t_waterbarrel', 'prop', 502, 740);
  add('t_redbench', 'prop', 536, 752);
  add('weaponrack', 'prop', 960, 736);
  add('anvil', 'prop', 790, 740);
  add('t_barrel', 'prop', 942, 700);
  add('t_pot_blue', 'prop', 958, 446);
  add('t_mailbox', 'post', 1050, 448);

  // the houses further out, each with its garden things
  const houses: [string, number, number][] = [
    ['t_house1', 186, 290], ['t_house2', 1094, 296], ['t_house2', 196, 756], ['t_house1', 1084, 750],
    ['t_house0', 262, 930], ['t_house1', 1012, 930], ['t_house2', 1180, 560], ['t_house0', 110, 560],
  ];
  const homes = houses.map(([f, x, y]) => add(f, 'house', x, y));
  for (const [f, x, y] of [
    ['t_pot_orange', 236, 300], ['t_topiary', 140, 300], ['t_pumpkins', 1138, 310], ['t_hay', 1040, 312],
    ['t_box_yellow', 248, 768], ['t_bush_pot', 1126, 764], ['t_pump', 316, 944], ['t_pot_vase', 1060, 944],
    ['t_crate_carrot', 1220, 576], ['t_blossom', 150, 576], ['t_lanternpost', 72, 572],
  ] as [string, number, number][])
    add(f, 'prop', x, y);

  // the town gate: a warp pad at the end of the south road, banners either side
  const gate = { x: C.x, y: H - 62 };
  const warps: Warp[] = [{ id: 'gate', name: 'ประตูเมือง', sub: 'ทางออกทิศใต้', x: gate.x, y: gate.y }];
  add('t_banner', 'post', gate.x - 58, gate.y + 6);
  add('t_banner', 'post', gate.x + 58, gate.y + 6);
  add('t_lamp', 'post', gate.x - 44, gate.y - 40);
  add('t_lamp', 'post', gate.x + 44, gate.y - 40);
  fires.push({ kind: 'lamp', x: gate.x - 44, y: gate.y - 96, depth: gate.y - 39.5 }, { kind: 'lamp', x: gate.x + 44, y: gate.y - 96, depth: gate.y - 39.5 });
  // lamps along the roads
  for (const [lx, ly] of [[596, 820], [684, 820], [940, 438], [1150, 438], [340, 504], [130, 504], [596, 330], [684, 330]]) {
    if (!fits('t_lamp', lx, ly, 4) && !(lx === 596 || lx === 684)) continue;
    add('t_lamp', 'post', lx, ly);
    fires.push({ kind: 'lamp', x: lx, y: ly - 56, depth: ly + 0.5 });
  }

  // smoke from the chimneys, the forge's glow, the temple's crystal light
  // (smoke rises above the roof: it draws in front of its own building)
  const chim = (o: Placed, dx: number, dy: number) => fires.push({ kind: 'smoke', x: o.x + dx, y: o.y + dy, depth: o.y + 2 });
  // each chimney's mouth, measured off its picture (px from the picture's bottom centre)
  chim(inn, -40, -114);
  chim(inn, 29, -117);
  chim(smithy, -27, -95);
  const CHIMNEY: Record<string, [number, number]> = { t_house0: [-22, -97], t_house1: [21, -89], t_house2: [21, -102] };
  chim(east, ...CHIMNEY[east.frame]);
  for (const h of homes) if (r() < 0.75) chim(h, ...CHIMNEY[h.frame]);
  fires.push({ kind: 'forge', x: smithy.x - 27, y: smithy.y - 16, depth: smithy.y + 0.5, owner: smithy });
  fires.push({ kind: 'crystal', x: temple.x, y: temple.y - 100, depth: temple.y + 1 });

  // woods round the edge, bushes and small trees in the gardens
  const fn = noise2(48);
  for (let i = 0; i < 4000; i++) {
    const x = -10 + r() * (W + 20), y = r() * (H + 30);
    const edge = Math.min(x, y, W - x, H - y) / TILE;
    if (!(edge < 2.2 || (edge < 5 && fn(x / 70, y / 70) > 0.5))) continue;
    if (Math.hypot(x - gate.x, y - gate.y) < 90) continue;
    const f = `tree${Math.floor(r() * 8)}`;
    if (fits(f, x, y, 4)) add(f, 'tree', x, y);
  }
  // trees in the gardens round the houses (never on the plaza or the roads)
  for (let i = 0, tries = 0; i < 26 && tries < 4000; tries++) {
    const x = 60 + r() * (W - 120), y = 80 + r() * (H - 140);
    const f = `tree${Math.floor(r() * 8)}`;
    if (Math.hypot((x - C.x) / 1.15, y - C.y) < 280 || !fits(f, x, y, 16)) continue;
    add(f, 'tree', x, y);
    i++;
  }
  for (let i = 0, tries = 0; i < 46 && tries < 3000; tries++) {
    const x = 40 + r() * (W - 80), y = 60 + r() * (H - 100);
    const f = `bush${Math.floor(r() * 12)}`;
    if (Math.hypot(x - C.x, y - C.y) < 230 || !fits(f, x, y, 10)) continue;
    add(f, 'bush', x, y, r() < 0.6);
    i++;
  }
  for (let i = 0, tries = 0; i < 18 && tries < 2000; tries++) {
    const x = 40 + r() * (W - 80), y = 60 + r() * (H - 100);
    const f = ['t_topiary', 't_pine', 't_bush_stone', 't_box_red', 't_box_stone'][Math.floor(r() * 5)];
    if (Math.hypot(x - C.x, y - C.y) < 210 || !fits(f, x, y, 12)) continue;
    add(f, 'prop', x, y);
    i++;
  }

  // ground decals: grass tufts, flowers in the gardens, a few pebbles on the cobbles
  const fl = noise2(45);
  for (let i = 0; i < 2200; i++) {
    const x = r() * W, y = r() * H;
    const t = terrainAt(x, y);
    if (t === T.Path) {
      if (r() < 0.05) decals.push({ frame: `pebble${Math.floor(r() * 6)}`, x, y, kind: 'decal' });
      continue;
    }
    if (fl(x / 60, y / 60) > 0.52 && r() < 0.7) decals.push({ frame: `flower${Math.floor(r() * 9)}`, x, y, kind: 'decal' });
    else if (r() < 0.4) decals.push({ frame: `tuft${Math.floor(r() * 10)}`, x, y, kind: 'decal' });
  }

  const flowers = decals.filter((d) => d.frame.startsWith('flower')).map((d) => ({ x: d.x, y: d.y }));
  const butterflies: { x: number; y: number }[] = [];
  for (const f of flowers) {
    if (butterflies.length >= 12) break;
    if (butterflies.every((b) => Math.hypot(b.x - f.x, b.y - f.y) > 200)) butterflies.push({ x: f.x, y: f.y - 10 });
  }
  const areas: Area[] = [{ name: 'จัตุรัสน้ำพุ', sub: 'ใจกลางเมือง', x: C.x, y: C.y, r: 190 }];

  return {
    id: 'town', cols: COLS, rows: ROWS, paved: 'cobble', vert, objects, decals,
    spawn: { x: C.x, y: C.y + 130 },
    braziers: [], fires, wisps: [], butterflies, flowers, areas, warps, doors,
    glades: [{ x: temple.x, y: temple.y - 40, r: 70 }],
    fountain: { x: fountain.x, y: fountain.y, owner: fountain },
  };
}
