import { buildMeadow, type MeadowMap, type ShapeOf } from './meadowMap';
import { buildTown } from './townMap';

/** The maps you can travel between. The game starts in the town (the lobby). */
export const MAPS = {
  town: { name: 'เมืองหลัก', sub: 'ล็อบบี้', arrive: 'gate', build: buildTown },
  meadow: { name: 'ทุ่งหญ้า', sub: 'แผนที่ Lv.1', arrive: 'west', build: buildMeadow },
} satisfies Record<string, { name: string; sub: string; arrive: string; build: (s: ShapeOf) => MeadowMap }>;

export type MapId = keyof typeof MAPS;
export const START_MAP: MapId = 'town';

/** Where you can travel to from a map (the panel's top section). A locked one is shown but can't be picked. */
export function travelFrom(id: MapId): { id: string; name: string; sub: string; locked?: boolean }[] {
  if (id === 'town') return [{ id: 'meadow', name: MAPS.meadow.name, sub: MAPS.meadow.sub }];
  return [
    { id: 'town', name: MAPS.town.name, sub: 'กลับเมือง' },
    // the next maps don't exist yet (the owner decides where each exit leads)
    { id: 'next', name: 'แผนที่ถัดไป', sub: 'ยังไม่เปิด — เร็วๆ นี้', locked: true },
  ];
}
