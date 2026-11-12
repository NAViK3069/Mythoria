// The monsters, and where they live. The meadow's five kinds (each with its own mini-boss) are Claude's FIRST
// DRAFT for the owner to rework: names, looks, elements, skills and numbers (docs/game-design/monsters.md).
//
// Written the way heroes are (heroBasics.ts): base stats, a normal attack and skills in LineRanger_TurnBased's
// form (area + effects). Monsters have no team energy: a skill is used every `every` turns instead.
// One kind of each element in the meadow, so the element wheel shows in the first fights.

import type { RarityId } from './heroBasics';
import type { ElementId } from './elements';
import type { SkillArea, Effect, Stats } from './heroBasics';

export interface MonsterSkill {
  name: string;
  area: SkillArea;
  effects: Effect[];
  /** Used every this many of its turns (the normal attack in between). */
  every: number;
  text: string;
}

export interface MonsterDef {
  id: string;
  name: string;
  /** The kind it belongs to: a mini-boss shares its kind with the monsters it leads. */
  kind: string;
  miniBoss: boolean;
  /** Rare < Epic < Legend < Mythic, as heroes (FIRST DRAFT: the monsters Rare, their mini-bosses Epic). */
  rarity: RarityId;
  element: ElementId;
  level: number;
  /** Its picture in the 'monsters' atlas (tools/monster_parts.py). */
  look: string;
  base: Stats;
  normal: { name: string; area: SkillArea; effects: Effect[]; text: string };
  skills: MonsterSkill[];
  /** A line about it, for its info card. */
  text: string;
}

const s = (atk: number, hp: number, def: number, spd: number, evade = 5, skillEvade = 5, normalRes = 0, skillRes = 0, crit = 5, critDmg = 150, statusRes = 5): Stats =>
  ({ atk, hp, def, spd, evade, skillEvade, normalRes, skillRes, crit, critDmg, statusRes });

export const MONSTERS: readonly MonsterDef[] = [
  // ---------------------------------------------------------------- slimes (water)
  {
    id: 'slime', name: 'สไลม์น้ำ', kind: 'slime', miniBoss: false, rarity: 'rare', element: 'water', level: 1, look: 'slime',
    base: s(150, 1900, 120, 88, 4, 4, 10, 0, 3, 140, 5),
    normal: { name: 'กระแทกเหนียว', area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'กระแทกศัตรูแถวหน้า 100%' },
    skills: [{ name: 'เมือกเหนียว', area: 'single_front', every: 3, effects: [{ type: 'damage', pct: 120 }, { type: 'speedDown', pct: 15, turns: 2 }], text: '120% + ลดสปีด 15% 2 เทิร์น' }],
    text: 'ก้อนวุ้นน้ำที่ชอบอยู่ริมบ่อ เด้งไปมาทั้งวัน',
  },
  {
    id: 'slime_king', name: 'ราชาสไลม์', kind: 'slime', miniBoss: true, rarity: 'epic', element: 'water', level: 5, look: 'slime_king',
    base: s(280, 11000, 220, 84, 3, 3, 20, 10, 5, 150, 30),
    normal: { name: 'ทับแบน', area: 'single_front', effects: [{ type: 'damage', pct: 110 }], text: 'ทับศัตรูแถวหน้า 110%' },
    skills: [
      { name: 'คลื่นวุ้น', area: 'all', every: 3, effects: [{ type: 'damage', pct: 80 }, { type: 'speedDown', pct: 15, turns: 2 }], text: 'ทั้งหมด 80% + ลดสปีด 15% 2 เทิร์น' },
      { name: 'แยกร่าง', area: 'self', every: 5, effects: [{ type: 'heal', pct: 12, scale: 'targetHp' }, { type: 'shield', pct: 8, turns: 2, scale: 'casterHp' }], text: 'ฟื้นเลือด 12% + โล่ 8% ของเลือดสูงสุด' },
    ],
    text: 'สไลม์ที่กินสไลม์ตัวอื่นจนตัวโต สวมมงกุฎที่ใครทำตกไว้ในบ่อ',
  },
  // ---------------------------------------------------------------- horned rabbits (light)
  {
    id: 'hornbun', name: 'กระต่ายเขาเดียว', kind: 'hornbun', miniBoss: false, rarity: 'rare', element: 'light', level: 2, look: 'hornbun',
    base: s(200, 1600, 90, 108, 12, 8, 0, 0, 12, 160, 5),
    normal: { name: 'ขวิด', area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ขวิดศัตรูแถวหน้า 100%' },
    skills: [{ name: 'พุ่งแทง', area: 'single_any', every: 3, effects: [{ type: 'damage', pct: 150 }], text: 'ศัตรูตัวใดก็ได้ 150%' }],
    text: 'กระต่ายขาวเขาทอง ตกใจง่าย แต่ถ้าโกรธจะพุ่งใส่ไม่ยั้ง',
  },
  {
    id: 'hornbun_chief', name: 'หัวหน้าฝูงเขาทอง', kind: 'hornbun', miniBoss: true, rarity: 'epic', element: 'light', level: 6, look: 'hornbun_chief',
    base: s(360, 9000, 180, 112, 14, 10, 5, 5, 15, 170, 25),
    normal: { name: 'ขวิดหนัก', area: 'single_front', effects: [{ type: 'damage', pct: 110 }], text: 'ขวิดศัตรูแถวหน้า 110%' },
    skills: [
      { name: 'เขาแสง', area: 'row_any', every: 3, effects: [{ type: 'damage', pct: 130 }, { type: 'evadeDown', pct: 15, turns: 2 }], text: 'แถวใดก็ได้ 130% + ลดการหลบ 15% 2 เทิร์น' },
      { name: 'เสียงเรียกฝูง', area: 'self', every: 4, effects: [{ type: 'atkUp', pct: 20, turns: 2 }, { type: 'speedUp', pct: 15, turns: 2 }], text: 'พลังโจมตี +20% สปีด +15% 2 เทิร์น' },
    ],
    text: 'จ่าฝูงกระต่ายเขาเดียว รอยแผลเป็นที่ตาคือหลักฐานว่าไม่เคยแพ้',
  },
  // ---------------------------------------------------------------- poison mushrooms (dark)
  {
    id: 'shroom', name: 'เห็ดพิษ', kind: 'shroom', miniBoss: false, rarity: 'rare', element: 'dark', level: 2, look: 'shroom',
    base: s(170, 2100, 110, 92, 5, 6, 5, 5, 5, 150, 10),
    normal: { name: 'โขกหัว', area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'โขกศัตรูแถวหน้า 100%' },
    skills: [{ name: 'สปอร์พิษ', area: 'row', every: 3, effects: [{ type: 'damage', pct: 70 }, { type: 'poison', pct: 20, turns: 2 }], text: 'ทั้งแถว 70% + พิษ 20% 2 เทิร์น' }],
    text: 'เห็ดม่วงเดินได้ อยู่แถวตอไม้และดงเห็ด ปล่อยสปอร์เมื่อมีใครเดินเข้าใกล้',
  },
  {
    id: 'shroom_king', name: 'ราชันเห็ดพิษ', kind: 'shroom', miniBoss: true, rarity: 'epic', element: 'dark', level: 7, look: 'shroom_king',
    base: s(320, 12000, 200, 86, 4, 6, 10, 15, 5, 150, 35),
    normal: { name: 'ทุบหมวก', area: 'single_front', effects: [{ type: 'damage', pct: 110 }], text: 'ทุบศัตรูแถวหน้า 110%' },
    skills: [
      { name: 'หมอกสปอร์', area: 'all', every: 3, effects: [{ type: 'damage', pct: 60 }, { type: 'poison', pct: 25, turns: 3 }], text: 'ทั้งหมด 60% + พิษ 25% 3 เทิร์น' },
      { name: 'สปอร์หลับ', area: 'single_any', every: 5, effects: [{ type: 'stun', turns: 1 }], text: 'ศัตรูตัวใดก็ได้ มึนงง 1 เทิร์น' },
    ],
    text: 'เห็ดเก่าแก่ที่สุดในทุ่ง สปอร์เรืองแสงของมันทำให้หญ้ารอบๆ เหี่ยว',
  },
  // ---------------------------------------------------------------- walking saplings (wood)
  {
    id: 'sapling', name: 'ต้นกล้าเดินได้', kind: 'sapling', miniBoss: false, rarity: 'rare', element: 'wood', level: 3, look: 'sapling',
    base: s(160, 2600, 160, 80, 3, 3, 10, 10, 3, 140, 15),
    normal: { name: 'ฟาดกิ่ง', area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ฟาดศัตรูแถวหน้า 100%' },
    skills: [{ name: 'รากพันขา', area: 'single_front', every: 3, effects: [{ type: 'damage', pct: 90 }, { type: 'speedDown', pct: 25, turns: 2 }], text: '90% + ลดสปีด 25% 2 เทิร์น' }],
    text: 'ต้นไม้เล็กที่ถอนรากเดินเล่นตอนไม่มีใครมอง ชอบยืนนิ่งปนกับต้นไม้จริง',
  },
  {
    id: 'treant_elder', name: 'พฤกษาเฒ่า', kind: 'sapling', miniBoss: true, rarity: 'epic', element: 'wood', level: 8, look: 'treant_elder',
    base: s(300, 15000, 300, 76, 2, 2, 20, 20, 3, 140, 40),
    normal: { name: 'ทุบราก', area: 'single_front', effects: [{ type: 'damage', pct: 110 }], text: 'ทุบศัตรูแถวหน้า 110%' },
    skills: [
      { name: 'แผ่นดินไหวราก', area: 'row', every: 3, effects: [{ type: 'damage', pct: 110 }, { type: 'stun', turns: 1 }], text: 'ทั้งแถว 110% + มึนงง 1 เทิร์น' },
      { name: 'น้ำค้างพฤกษา', area: 'self', every: 4, effects: [{ type: 'regen', pct: 6, turns: 3, scale: 'targetHp' }, { type: 'toughUp', pct: 15, turns: 2 }], text: 'ฟื้นฟู 6%/เทิร์น 3 เทิร์น + รับดาเมจลดลง 15%' },
    ],
    text: 'ผู้เฝ้าป่าที่หลับมาร้อยปี ตื่นขึ้นเมื่อต้นกล้ารอบตัวถูกรังแก',
  },
  // ---------------------------------------------------------------- wild bees (fire)
  {
    id: 'bee', name: 'ผึ้งป่า', kind: 'bee', miniBoss: false, rarity: 'rare', element: 'fire', level: 3, look: 'bee',
    base: s(210, 1400, 80, 118, 15, 10, 0, 0, 10, 160, 5),
    normal: { name: 'ต่อย', area: 'single_any', effects: [{ type: 'damage', pct: 90 }], text: 'ต่อยศัตรูตัวใดก็ได้ 90%' },
    skills: [{ name: 'เหล็กในไฟ', area: 'single_any', every: 3, effects: [{ type: 'damage', pct: 110 }, { type: 'burn', pct: 20, turns: 2 }], text: 'ตัวใดก็ได้ 110% + ไฟไหม้ 20% 2 เทิร์น' }],
    text: 'ผึ้งตัวโตเท่าแมว บินวนแถวดงดอกไม้ เหล็กในร้อนเหมือนถ่าน',
  },
  {
    id: 'bee_queen', name: 'ราชินีผึ้ง', kind: 'bee', miniBoss: true, rarity: 'epic', element: 'fire', level: 9, look: 'bee_queen',
    base: s(380, 9500, 170, 120, 16, 12, 5, 5, 12, 170, 30),
    normal: { name: 'ต่อยแรง', area: 'single_any', effects: [{ type: 'damage', pct: 100 }], text: 'ต่อยศัตรูตัวใดก็ได้ 100%' },
    skills: [
      { name: 'ฝูงผึ้งไฟ', area: 'all', every: 3, effects: [{ type: 'damage', pct: 70 }, { type: 'burn', pct: 20, turns: 2 }], text: 'ทั้งหมด 70% + ไฟไหม้ 20% 2 เทิร์น' },
      { name: 'น้ำผึ้งราชินี', area: 'self', every: 4, effects: [{ type: 'heal', pct: 10, scale: 'targetHp' }, { type: 'evadeUp', pct: 20, turns: 2 }], text: 'ฟื้นเลือด 10% + หลบ +20% 2 เทิร์น' },
    ],
    text: 'ราชินีแห่งรังใหญ่ในทุ่ง ปีกร้อนจนอากาศรอบตัวสั่นไหว',
  },
];

export const monsterById = (id: string): MonsterDef | undefined => MONSTERS.find((m) => m.id === id);

/** Where the monsters live on a map: which kinds, how many roam, how quickly they come back, where they keep. */
/** pond: by the water · grass: open grass · shade: by the mushroom clumps, stumps and mossy logs · trees: among
 * the trees · flowers: round the flowers. */
export type Habitat = 'pond' | 'grass' | 'shade' | 'trees' | 'flowers';

export interface Spawn {
  monster: string;
  /** How many roam the map at once (a mini-boss: 1, at its own lair). */
  count: number;
  habitat: Habitat;
  /** Seconds before one that was beaten comes back. */
  respawn: number;
}

export const MAP_SPAWNS: Record<string, readonly Spawn[]> = {
  meadow: [
    { monster: 'slime', count: 7, habitat: 'pond', respawn: 30 },
    { monster: 'slime_king', count: 1, habitat: 'pond', respawn: 300 },
    { monster: 'hornbun', count: 6, habitat: 'grass', respawn: 30 },
    { monster: 'hornbun_chief', count: 1, habitat: 'grass', respawn: 300 },
    { monster: 'shroom', count: 6, habitat: 'shade', respawn: 30 },
    { monster: 'shroom_king', count: 1, habitat: 'shade', respawn: 300 },
    { monster: 'sapling', count: 5, habitat: 'trees', respawn: 40 },
    { monster: 'treant_elder', count: 1, habitat: 'trees', respawn: 300 },
    { monster: 'bee', count: 6, habitat: 'flowers', respawn: 30 },
    { monster: 'bee_queen', count: 1, habitat: 'flowers', respawn: 300 },
  ],
};

/**
 * Who you fight when you take on a monster on the map (FIRST DRAFT - the owner decides group sizes):
 * a monster comes with two more of its kind; a mini-boss with two of the monsters it leads.
 */
export function encounterOf(monsterId: string): string[] {
  const m = monsterById(monsterId);
  if (!m) return [];
  if (!m.miniBoss) return [m.id, m.id, m.id];
  const minion = MONSTERS.find((x) => x.kind === m.kind && !x.miniBoss);
  return minion ? [m.id, minion.id, minion.id] : [m.id];
}
