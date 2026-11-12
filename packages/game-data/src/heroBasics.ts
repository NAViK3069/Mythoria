// The building blocks every hero is made of (decided by the owner): six classes, four rarities, the stats,
// four gear slots, and stars C0-C5. Class traits and how skills are written come from the owner's earlier
// game LineRanger_TurnBased (src/lib/roleTraits.ts, src/lib/skills.ts), whose battle rules Mythoria uses.

// ---------------------------------------------------------------- classes

export type ClassId = 'tank' | 'warrior' | 'assassin' | 'marksman' | 'mage' | 'support';

export interface ClassDef {
  id: ClassId;
  name: string;
  /** Its trait: what every hero of the class can do (from LineRanger_TurnBased's role traits). */
  trait: { name: string; text: string };
  /** The trait as numbers (1 = no effect): the combat system reads these. */
  damageTaken?: number;
  /** How much more enemies want to hit it. */
  threat?: number;
  /** Damage x (1 + this x the share of its own HP that's gone). */
  desperation?: number;
  /** Damage x (1 + this) against targets above half HP. */
  bigTargetDamage?: number;
  /** Can hit any row, not just the front one. */
  strikeAnyone?: boolean;
  /** Skill damage x. */
  skillDamage?: number;
  /** Heals and shields it gives x. */
  supportPower?: number;
  /** The team starts with this much more energy (+1 at most per team). */
  energyBonus?: number;
}

export const CLASSES: readonly ClassDef[] = [
  { id: 'tank', name: 'แทงค์', trait: { name: 'กำแพง', text: 'รับดาเมจลดลง 15% · ศัตรูมักเล็งตัวนี้ก่อน' }, damageTaken: 0.85, threat: 1.35 },
  { id: 'warrior', name: 'นักรบ', trait: { name: 'สู้ตาย', text: 'ยิ่งเลือดน้อยยิ่งตีแรง (สูงสุด +40% ตอนเลือดใกล้หมด)' }, desperation: 0.4 },
  { id: 'assassin', name: 'นักฆ่า', trait: { name: 'ลอบสังหาร', text: 'ตีข้ามแถวได้ทุกตัว ไม่ต้องรอแถวหน้าตาย' }, strikeAnyone: true },
  { id: 'marksman', name: 'นักยิง', trait: { name: 'ล่าแทงค์', text: 'ตีเป้าที่เลือดเกินครึ่ง แรงขึ้น 35%' }, bigTargetDamage: 0.35 },
  { id: 'mage', name: 'นักเวท', trait: { name: 'เวทรุนแรง', text: 'ดาเมจสกิลแรงขึ้น 20%' }, skillDamage: 1.2 },
  { id: 'support', name: 'ซัพพอร์ต', trait: { name: 'สายเลี้ยง', text: 'ฮีล/โล่ที่ให้เพิ่ม 25% · ทีมเริ่มเกมพลังงาน +1' }, supportPower: 1.25, energyBonus: 1 },
];

// ---------------------------------------------------------------- rarities and stars

export type RarityId = 'rare' | 'epic' | 'legend' | 'mythic';

export interface RarityDef {
  id: RarityId;
  name: string;
  color: string;
  /**
   * Copies of the same hero fed in for each star (C1..C5). The owner's rule: the lower the rarity, the more
   * copies; a Mythic takes one per step. The numbers below Mythic are a FIRST DRAFT.
   */
  copiesPerStar: number;
}

export const RARITIES: readonly RarityDef[] = [
  { id: 'rare', name: 'Rare', color: '#4aa8ff', copiesPerStar: 4 },
  { id: 'epic', name: 'Epic', color: '#b46bff', copiesPerStar: 3 },
  { id: 'legend', name: 'Legend', color: '#ffb52e', copiesPerStar: 2 },
  { id: 'mythic', name: 'Mythic', color: '#ff4d6d', copiesPerStar: 1 },
];

/** Stars 0..5: each star unlocks the talent of the same number (C1..C5); no stars = C0. */
export const MAX_STARS = 5;

/** Copies needed to go from `stars` to the next star (0 at the top). */
export function copiesForNextStar(rarity: RarityId, stars: number): number {
  if (stars >= MAX_STARS) return 0;
  return RARITIES.find((r) => r.id === rarity)!.copiesPerStar;
}

// ---------------------------------------------------------------- stats

export type StatId =
  | 'atk' | 'hp' | 'def' | 'spd'
  | 'evade' | 'skillEvade'
  | 'normalRes' | 'skillRes'
  | 'crit' | 'critDmg'
  | 'statusRes';

export interface StatDef {
  id: StatId;
  name: string;
  /** Shown as a percentage. */
  pct?: boolean;
}

/** The stats, in the order the owner listed them. */
export const STATS: readonly StatDef[] = [
  { id: 'atk', name: 'พลังโจมตี' },
  { id: 'hp', name: 'เลือด' },
  { id: 'def', name: 'เกราะ' },
  { id: 'spd', name: 'สปีด' },
  { id: 'evade', name: 'หลบการโจมตีปกติ', pct: true },
  { id: 'skillEvade', name: 'หลบการโจมตีสกิล', pct: true },
  { id: 'normalRes', name: 'ต้านการโจมตีปกติ', pct: true },
  { id: 'skillRes', name: 'ต้านการโจมตีสกิล', pct: true },
  { id: 'crit', name: 'อัตราคริติคอล', pct: true },
  { id: 'critDmg', name: 'แรงโจมตีคริติคอล', pct: true },
  { id: 'statusRes', name: 'ต้านสถานะ', pct: true },
];

export type Stats = Record<StatId, number>;

// ---------------------------------------------------------------- gear

export type GearSlot = 'weapon' | 'armor' | 'accessory' | 'scroll';

export const GEAR_SLOTS: readonly { id: GearSlot; name: string }[] = [
  { id: 'weapon', name: 'อาวุธ' },
  { id: 'armor', name: 'เกราะ' },
  { id: 'accessory', name: 'ของประดับ' },
  { id: 'scroll', name: 'คัมภีร์' },
];

// ---------------------------------------------------------------- skills (written as in LineRanger_TurnBased)

/** Who a skill reaches. Attacks: the front one, anyone, a row (front first), any row, everyone. */
export type SkillArea =
  | 'single_front' | 'single_any' | 'row' | 'row_any' | 'all'
  | 'self' | 'own_row' | 'ally_single' | 'ally_all';

/** What a skill does (a subset of LineRanger_TurnBased's effects; pct is % of ATK unless `scale` says). */
export type Effect =
  | { type: 'damage'; pct: number }
  | { type: 'burn' | 'bleed' | 'poison'; pct: number; turns: number }
  | { type: 'stun' | 'silence' | 'taunt' | 'barrier'; turns: number }
  | { type: 'atkDown' | 'speedDown' | 'evadeDown' | 'vulnerable'; pct: number; turns: number }
  | { type: 'atkUp' | 'speedUp' | 'evadeUp' | 'critUp' | 'toughUp' | 'skillResUp'; pct: number; turns: number }
  | { type: 'heal'; pct: number; scale: 'targetHp' | 'casterHp' | 'casterAtk' }
  | { type: 'regen'; pct: number; turns: number; scale: 'targetHp' | 'casterHp' | 'casterAtk' }
  | { type: 'shield'; pct: number; turns: number; scale: 'targetHp' | 'casterHp' | 'casterAtk' }
  | { type: 'lifesteal'; pct: number }
  | { type: 'actionAdvance'; pct: number }
  | { type: 'energyGain'; amount: number }
  | { type: 'cleanse' };

export interface Skill {
  name: string;
  /** Team energy it costs (0 for the normal attack). */
  cost: number;
  area: SkillArea;
  effects: Effect[];
  /** How it reads in the hero panel. */
  text: string;
}

/**
 * The ultimate (สกิลอัลติเมต), charged like Honkai: Star Rail: each hero has its own charge in %, which fills as it
 * fights; at `max` it can cast its ult on its own turn - free (no team energy), and the turn goes on after it
 * (it still makes its move). Heroes only; monsters have none. FIRST DRAFT numbers for the owner to tune.
 */
export const ULT = {
  max: 100,
  /** Its own normal attack / a skill it casts (or casts when called in from the special team). */
  attack: 20,
  skill: 30,
  /** Each hit it takes from an enemy. */
  hit: 10,
  /** Each enemy it finishes off. */
  kill: 10,
  /** Where it starts again after the ult. */
  afterUlt: 5,
  /** Where every hero starts a battle. */
  start: 0,
} as const;

/** A talent unlocked by a star (C1..C5): what it says, and (when it's simple) the numbers it adds. */
export interface Talent {
  name: string;
  text: string;
}
