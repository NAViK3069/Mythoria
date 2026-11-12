// The five elements (decided by the owner).
//
//   Fire → Wood → Water → Fire     (each beats the next)
//   Light ⇄ Dark                    (each beats the other)
//
// The same element, or two that don't touch on the chart: normal damage. Beating the target's element: harder;
// losing to it: softer. A hero can have more than one element as it rises in level, but the damage it TAKES is
// worked out from its first element only (like Dragon City).

export type ElementId = 'fire' | 'wood' | 'water' | 'light' | 'dark';

export interface ElementDef {
  id: ElementId;
  /** Thai name (as the owner named it). */
  name: string;
  /** Its colour in the UI. */
  color: string;
}

export const ELEMENTS: readonly ElementDef[] = [
  { id: 'fire', name: 'ไฟ', color: '#ff6a3d' },
  { id: 'wood', name: 'ไม้', color: '#5fcf5a' },
  { id: 'water', name: 'น้ำ', color: '#3fa8ff' },
  { id: 'light', name: 'แสง', color: '#ffd75a' },
  { id: 'dark', name: 'มืด', color: '#a774ff' },
];

/** Who each element beats. */
export const BEATS: Readonly<Record<ElementId, readonly ElementId[]>> = {
  fire: ['wood'],
  wood: ['water'],
  water: ['fire'],
  light: ['dark'],
  dark: ['light'],
};

export type Matchup = 'strong' | 'normal' | 'weak';

/**
 * How an attack of element `attack` lands on a defender of element `defender` (every hero and monster has one):
 * 'strong' if the attack beats it, 'weak' if it beats the attack, otherwise 'normal'.
 */
export function matchup(attack: ElementId, defender: ElementId | undefined): Matchup {
  const d = defender;
  if (!d) return 'normal';
  if (BEATS[attack].includes(d)) return 'strong';
  if (BEATS[d].includes(attack)) return 'weak';
  return 'normal';
}

/**
 * Damage multipliers for each matchup: x1.5 winning, x0.5 losing - the owner's own numbers from
 * LineRanger_TurnBased (src/lib/rangerClass.ts ELEMENT_WIN / ELEMENT_LOSE), whose battle rules Mythoria uses.
 */
export const MATCHUP_DAMAGE: Readonly<Record<Matchup, number>> = {
  strong: 1.5,
  normal: 1,
  weak: 0.5,
};
