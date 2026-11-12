// The rules a battle leans on: elements, role traits, the bonus for where a unit stands, passives.
// From LineRanger_TurnBased (lib/rangerClass.ts, lib/roleTraits.ts, lib/formation.ts, lib/passives.ts);
// elements and role traits now come from @mythoria/game-data so the game shows the same numbers it fights with.

import { CLASSES, MATCHUP_DAMAGE, matchup, type ClassDef, type ElementId } from '@mythoria/game-data';
import type { CombatStats, PassiveDef, PassiveType, Role, Row } from './types';

/** Damage × for an attacker's element against a defender's (one element each: the defender's first). */
export function elementMultiplier(attacker: ElementId | undefined, defender: ElementId | undefined): number {
  if (!attacker || !defender) return 1;
  return MATCHUP_DAMAGE[matchup(attacker, defender)];
}

/** A role's traits (game-data CLASSES; LineRanger_TurnBased's roleTraits). */
export interface RoleTrait {
  strikeAnyone?: boolean;
  damageTaken?: number;
  threat?: number;
  lifesteal?: number;
  normalDamage?: number;
  skillDamage?: number;
  executeDamage?: number;
  desperation?: number;
  bigTargetDamage?: number;
  supportPower?: number;
  energyBonus?: number;
}

const TRAITS = new Map<string, RoleTrait>(CLASSES.map((c: ClassDef) => [c.id, c as RoleTrait]));
export const traitOf = (role: Role | undefined): RoleTrait => TRAITS.get(role ?? 'warrior') ?? {};

/**
 * Where it stands (as in Seven Knights Rebirth): the front row takes the hits (DEF ×1.3, HP ×1.15),
 * the back row hits harder (ATK ×1.15, crit +8). Every place in a row gets the same.
 */
export const ROW_BONUS: Record<Row, { mult: Partial<Record<keyof CombatStats, number>>; add: Partial<Record<keyof CombatStats, number>>; fits: Role[] }> = {
  front: { mult: { def: 1.3, hp: 1.15 }, add: {}, fits: ['tank', 'warrior'] },
  back: { mult: { atk: 1.15 }, add: { crit: 8 }, fits: ['marksman', 'assassin', 'mage', 'support'] },
};

export function statsWithPosition(stats: CombatStats, row: Row): CombatStats {
  const b = ROW_BONUS[row];
  const out = { ...stats };
  for (const k of Object.keys(b.mult) as (keyof CombatStats)[]) out[k] = Math.round(out[k] * (b.mult[k] ?? 1));
  for (const k of Object.keys(b.add) as (keyof CombatStats)[]) out[k] = Math.round(out[k] + (b.add[k] ?? 0));
  return out;
}

/** A passive of this kind, summed (%). */
export const passiveSum = (list: PassiveDef[] | undefined, type: PassiveType): number =>
  (list ?? []).filter((p) => p.type === type).reduce((n, p) => n + (p.pct || 0), 0);
