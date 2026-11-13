// From the game's data (@mythoria/game-data) to units in a battle: heroes and monsters, where they stand.

import { heroById, monsterById, type HeroDef, type MonsterDef, type Skill, type Stats, type MonsterSkill } from '@mythoria/game-data';
import { ROW_BONUS } from './rules';
import type { CombatStats, Role, Row, SkillArea, SkillDef, SkillEffect, UnitSetup } from './types';

const BUFF_AREAS: SkillArea[] = ['self', 'own_row', 'ally_single', 'ally_all'];
const kindOf = (area: SkillArea) => (BUFF_AREAS.includes(area) ? 'buff' : 'attack');

/** Our 11 stats as the battle reads them (no accuracy stats in this game yet). */
export function combatStats(s: Stats): CombatStats {
  return {
    hp: s.hp, atk: s.atk, def: s.def, spd: s.spd, crit: s.crit, critDmg: s.critDmg,
    evade: s.evade, hit: 0, skillEvade: s.skillEvade, skillHit: 0,
    statusRes: s.statusRes, skillDmgRes: s.skillRes, normalDmgRes: s.normalRes,
  };
}

function skillDef(s: Skill): SkillDef {
  return { name: s.name, kind: kindOf(s.area), cost: s.cost, area: s.area, effects: s.effects as SkillEffect[] };
}
function monsterSkill(s: MonsterSkill | undefined): SkillDef {
  // a monster without a second skill: one it never gets to use
  if (!s) return { name: '', kind: 'attack', cost: 99, area: 'single_front', effects: [], every: 9999 };
  return { name: s.name, kind: kindOf(s.area), cost: 0, area: s.area, effects: s.effects as SkillEffect[], every: s.every };
}

export function heroUnit(def: HeroDef, row: Row, lane: number, level = 1): UnitSetup {
  return {
    id: def.id, name: def.name, row, lane, level, look: def.look,
    stats: combatStats(def.base), element: def.element, role: def.class as Role,
    skills: { skill1: skillDef(def.skill1), skill2: skillDef(def.skill2), ult: { ...skillDef(def.ult), cost: 0 } },
  };
}

export function monsterUnit(def: MonsterDef, row: Row, lane: number): UnitSetup {
  return {
    id: def.id, name: def.name, row, lane, level: def.level, look: def.look, miniBoss: def.miniBoss,
    stats: combatStats(def.base), element: def.element,
    // the bigger ones stand in front and take the hits; the rest fight as warriors
    role: def.miniBoss ? 'tank' : 'warrior',
    skills: { skill1: monsterSkill(def.skills[0]), skill2: monsterSkill(def.skills[1]) },
  };
}

/**
 * Where a team stands: front row (2 places) for those that fit it (tanks, warriors), back row (3) for the
 * rest; if one row is full, the other. Keeps the order given within a row.
 */
export function formation<T extends { role?: Role }>(list: T[]): { item: T; row: Row; lane: number }[] {
  const front: T[] = [], back: T[] = [];
  for (const u of list.slice(0, 5)) {
    const wantsFront = ROW_BONUS.front.fits.includes(u.role ?? 'warrior');
    if (wantsFront && front.length < 2) front.push(u);
    else if (!wantsFront && back.length < 3) back.push(u);
    else if (front.length < 2) front.push(u);
    else back.push(u);
  }
  // nobody in front: the first of the back row steps up (the front row shields the back)
  if (!front.length && back.length) front.push(back.shift()!);
  return [...front.map((item, lane) => ({ item, row: 'front' as Row, lane })), ...back.map((item, lane) => ({ item, row: 'back' as Row, lane }))];
}

/** A party of heroes (ids; up to 5) as battle units; `hpOf` gives each one's lasting HP as a share of its max (0..1,
 * undefined = full). */
export function heroTeam(ids: string[], level = 1, hpOf?: (id: string) => number | undefined): UnitSetup[] {
  const defs = ids.map((id) => heroById(id)).filter((d): d is HeroDef => !!d);
  return formation(defs.map((d) => ({ d, role: d.class as Role }))).map(({ item, row, lane }) => {
    const u = heroUnit(item.d, row, lane, level), f = hpOf?.(item.d.id);
    if (f != null && f < 1) u.hpShare = f;
    return u;
  });
}

/** The special team (reserves, ids): off the field - called in by a fighter to cast its skill 1. */
export function reserveTeam(ids: string[], level = 1): UnitSetup[] {
  return ids.map((id) => heroById(id)).filter((d): d is HeroDef => !!d).map((d, i) => heroUnit(d, 'back', i, level));
}

/** A group of monsters (ids) as battle units. */
export function monsterTeam(ids: string[]): UnitSetup[] {
  const defs = ids.map((id) => monsterById(id)).filter((d): d is MonsterDef => !!d);
  return formation(defs.map((d) => ({ d, role: (d.miniBoss ? 'tank' : 'warrior') as Role }))).map(({ item, row, lane }) => monsterUnit(item.d, row, lane));
}
