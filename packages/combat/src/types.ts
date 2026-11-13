// The shapes the battle works on. Ported from LineRanger_TurnBased (lib/skills.ts, lib/rangerConfig.ts,
// play/battle.ts) - the owner's earlier game, where these rules were built and balanced.

import type { ElementId } from '@mythoria/game-data';

export type Team = 0 | 1;
/** Front row: 2 places, back row: 3 (5 a side). */
export type Row = 'front' | 'back';
/** A move: the normal attack, skills 1 and 2, and a hero's ultimate (free, cast on its own turn when charged). */
export type ActionName = 'attack' | 'skill1' | 'skill2' | 'ult';
/** The moves that make a turn (the ult doesn't: the turn goes on after it). */
export const ACTIONS: readonly ActionName[] = ['attack', 'skill1', 'skill2'];

/**
 * The six roles. Our classes (game-data CLASSES) carry the same traits as LineRanger_TurnBased's roles
 * (warrior = its fighter, marksman = its shooter).
 */
export type Role = 'tank' | 'warrior' | 'assassin' | 'marksman' | 'mage' | 'support';

/** A unit's numbers in battle. */
export interface CombatStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  /** Critical rate (%), critical damage (150 = ×1.5). */
  crit: number;
  critDmg: number;
  /** Evade normal attacks / skills (%), and the accuracy that takes them off (we have none yet: 0). */
  evade: number;
  hit: number;
  skillEvade: number;
  skillHit: number;
  /** Chance (%) to shrug off a debuff - our "ต้านสถานะ". */
  statusRes: number;
  /** Damage taken from skills / from normal attacks cut by (%) - our "ต้านการโจมตีสกิล / ปกติ". */
  skillDmgRes: number;
  normalDmgRes: number;
}

export type SkillKind = 'attack' | 'buff';
export type AttackArea = 'single_front' | 'single_any' | 'row' | 'row_any' | 'all';
export type BuffArea = 'self' | 'own_row' | 'ally_single' | 'ally_all';
export type SkillArea = AttackArea | BuffArea;

export type EffectType =
  // on enemies
  | 'damage' | 'trueDamage' | 'damageHp' | 'breakInvincible' | 'dispelBuffs' | 'turnBurn' | 'lifesteal'
  | 'stun' | 'silence' | 'atkDown' | 'speedDown' | 'evadeDown' | 'skillEvadeDown' | 'skillResDown' | 'healBlock'
  | 'critDown' | 'critDmgDown' | 'hitDown' | 'skillHitDown' | 'vulnerable' | 'sealCleanse' | 'elementShift'
  | 'poison' | 'burn' | 'bleed' | 'selfHpCost' | 'selfVulnerable'
  // on allies
  | 'atkUp' | 'heal' | 'regen' | 'shield' | 'barrier' | 'evadeUp' | 'skillEvadeUp' | 'skillResUp' | 'speedUp'
  | 'actionAdvance' | 'critDmgUp' | 'critUp' | 'hitUp' | 'skillHitUp' | 'cleanse' | 'energyGain' | 'toughUp'
  | 'skillDmgResUp' | 'taunt';

export type HealScale = 'targetHp' | 'casterHp' | 'casterAtk';
export type LifestealScope = 'self' | 'own_row' | 'ally_all';

export interface SkillEffect {
  type: EffectType;
  pct?: number;
  turns?: number;
  amount?: number;
  /** Share of the damage that goes past a shield straight into HP (%). */
  pierce?: number;
  scale?: HealScale;
  scope?: LifestealScope;
  element?: ElementId;
}

export interface SkillDef {
  kind: SkillKind;
  /** Team energy it costs. */
  cost: number;
  area: SkillArea;
  effects: SkillEffect[];
  /** Monsters: used every this many of its own turns instead of costing energy. */
  every?: number;
  name?: string;
}

/** Skills 1 and 2, and (heroes) the ultimate. */
export type UnitSkills = Record<'skill1' | 'skill2', SkillDef> & { ult?: SkillDef };

export type PassiveType = 'execute' | 'lifesteal' | 'tough' | 'atkUp' | 'critUp' | 'speedUp' | 'healUp';
export interface PassiveDef {
  type: PassiveType;
  pct: number;
}

/** One unit going into battle. */
export interface UnitSetup {
  /** What it is (a hero's or a monster's id). */
  id: string;
  name: string;
  row: Row;
  /** Its place in the row: front 0-1, back 0-2. */
  lane: number;
  stats: CombatStats;
  /** It takes damage by this one (a hero's first element). */
  element?: ElementId;
  role?: Role;
  skills: UnitSkills;
  passives?: PassiveDef[];
  level?: number;
  /** Its picture (the client draws it). */
  look?: string;
  miniBoss?: boolean;
  /** HP it comes into the battle with, as a share of its max (0..1 - a hero's lasting HP); full when not given. */
  hpShare?: number;
}
