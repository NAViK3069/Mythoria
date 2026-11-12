// The ten races (decided by the owner). Each will give team bonuses ("n heroes of race x in the team: ...") -
// those are still to be designed (docs/game-design/elements-races.md).

export type RaceId =
  | 'human'
  | 'beastkin'
  | 'spirit'
  | 'celestial'
  | 'demon'
  | 'dragonkin'
  | 'aquatic'
  | 'forest'
  | 'undead'
  | 'automaton';

export interface RaceDef {
  id: RaceId;
  /** English name, and the Thai one (as the owner named them). */
  en: string;
  name: string;
}

export const RACES: readonly RaceDef[] = [
  { id: 'human', en: 'Human', name: 'เผ่ามนุษย์' },
  { id: 'beastkin', en: 'Beastkin', name: 'เผ่าสัตว์อสูร' },
  { id: 'spirit', en: 'Spirit', name: 'เผ่าภูติวิญญาณ' },
  { id: 'celestial', en: 'Celestial', name: 'เผ่าเทพสวรรค์' },
  { id: 'demon', en: 'Demon', name: 'เผ่าปีศาจ' },
  { id: 'dragonkin', en: 'Dragonkin', name: 'เผ่ามังกร' },
  { id: 'aquatic', en: 'Aquatic', name: 'เผ่าทะเล' },
  { id: 'forest', en: 'Forest Tribe', name: 'เผ่าป่าพงไพร์' },
  { id: 'undead', en: 'Undead', name: 'เผ่าอันเดด' },
  { id: 'automaton', en: 'Automaton', name: 'เผ่าจักรกลโบราณ' },
];
