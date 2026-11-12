// The people in the towns and on the maps: who they are and where they stand.
//
// The names and lines here are PLACEHOLDERS (what each one does, not who they are) - the owner names them
// and writes what they say (docs/game-design/npcs.md). Their looks are in the 'npcs' atlas, made by
// tools/npc_parts.py from the hero's own parts.

import type { MapId } from './maps';

export interface NpcDef {
  /** The look in the 'npcs' atlas (<look>_head, _body, _leg_l, _leg_r). */
  look: string;
  name: string;
  /** A word on what they do, shown under the name. */
  role: string;
  /** What they say, a line at a time. */
  lines: string[];
  /** The button at the end of the talk, and the panel it opens (none: just "goodbye"). */
  action?: { label: string; panel: string };
}

export interface NpcPlace {
  id: string;
  /** Where they'd like to stand (moved to the nearest free spot) and which way they face. */
  x: number;
  y: number;
  facing?: 1 | -1;
}

export const NPCS: Record<string, NpcDef> = {
  shopkeeper: {
    look: 'shop',
    name: 'พ่อค้า',
    role: 'ร้านค้าทั่วไป',
    lines: ['ยินดีต้อนรับ! ของใช้จำเป็นมีครบ เลือกดูได้เลยนะ'],
    action: { label: 'ดูสินค้า', panel: 'shop' },
  },
  alchemist: {
    look: 'potion',
    name: 'นักปรุงยา',
    role: 'ร้านยาวิเศษ',
    lines: ['ยาฟื้นพลัง ยาเสริมพลัง... อยากได้ขวดไหนบอกได้เลย'],
    action: { label: 'ดูยา', panel: 'shop' },
  },
  smith: {
    look: 'smith',
    name: 'ช่างตีเหล็ก',
    role: 'โรงตีเหล็ก',
    lines: ['เตาหลอมกำลังร้อนได้ที่', 'แต่ร้านยังไม่เปิดรับงานนะ — เร็วๆ นี้'],
  },
  innkeeper: {
    look: 'inn',
    name: 'เจ้าของโรงเตี๊ยม',
    role: 'โรงเตี๊ยม',
    lines: ['เหนื่อยไหม? ห้องพักกำลังจัดอยู่', 'แวะมาใหม่นะ — เร็วๆ นี้'],
  },
  clerk: {
    look: 'guild',
    name: 'เจ้าหน้าที่กิลด์',
    role: 'กิลด์',
    lines: ['สวัสดีค่ะ มีอะไรให้กิลด์ช่วยไหมคะ'],
    action: { label: 'เข้ากิลด์', panel: 'guild' },
  },
  priestess: {
    look: 'priest',
    name: 'นักบวช',
    role: 'วิหารอัญเชิญ',
    lines: ['อยากอัญเชิญฮีโร่ใช่ไหม', 'เชิญทางนี้เลย'],
    action: { label: 'อัญเชิญ', panel: 'summon' },
  },
  herald: {
    look: 'quest',
    name: 'ผู้ประกาศเควส',
    role: 'กระดานเควส',
    lines: ['มีงานใหม่ติดบนกระดานแล้ว ลองดูสิ!'],
    action: { label: 'ดูเควส', panel: 'quests' },
  },
  guard: {
    look: 'guard',
    name: 'ทหารยาม',
    role: 'ประตูเมือง',
    lines: ['ประตูเมืองอยู่ตรงนี้', 'แท่นวาปพาไปทุ่งหญ้าได้ ออกไปข้างนอกระวังตัวด้วยนะ'],
  },
  fruitseller: {
    look: 'fruit',
    name: 'แม่ค้าผลไม้',
    role: 'แผงผลไม้',
    lines: ['ผลไม้สดๆ เพิ่งเก็บมาเช้านี้เลย!'],
  },
  traveller: {
    look: 'bard',
    name: 'นักเดินทาง',
    role: 'ผู้มาเยือน',
    lines: ['เมืองนี้น่าอยู่ดีนะ', 'นั่งฟังเสียงน้ำพุแล้วหายเหนื่อยเลย'],
  },
  baker: {
    look: 'baker',
    name: 'คนทำขนมปัง',
    role: 'ร้านขนมปัง',
    lines: ['ขนมปังเพิ่งออกจากเตา หอมไหมล่ะ'],
  },
  adventurer: {
    look: 'adventurer',
    name: 'นักผจญภัย',
    role: 'ผู้พักแรม',
    lines: ['ตั้งแคมป์พักแป๊บนึง', 'ทางข้างหน้ายังอีกไกล เดินทางปลอดภัยนะ'],
  },
  villager: {
    look: 'villager',
    name: 'ชาวบ้าน',
    role: 'หมู่บ้าน',
    lines: ['หมู่บ้านนี้เงียบไปนานแล้ว...', 'เดินทางปลอดภัยนะ'],
  },
};

/** Who stands where, map by map: in front of the shops and the places that matter. */
export const NPC_PLACES: Record<MapId, NpcPlace[]> = {
  town: [
    { id: 'shopkeeper', x: 372, y: 354, facing: 1 },
    { id: 'alchemist', x: 352, y: 470, facing: 1 },
    { id: 'clerk', x: 686, y: 336, facing: -1 },
    { id: 'priestess', x: 884, y: 364, facing: -1 },
    { id: 'herald', x: 700, y: 396, facing: 1 },
    { id: 'fruitseller', x: 794, y: 418, facing: -1 },
    { id: 'traveller', x: 704, y: 588, facing: -1 },
    { id: 'baker', x: 798, y: 592, facing: -1 },
    { id: 'innkeeper', x: 478, y: 756, facing: 1 },
    { id: 'smith', x: 918, y: 748, facing: -1 },
    { id: 'guard', x: 594, y: 958, facing: 1 },
    { id: 'guard', x: 686, y: 958, facing: -1 },
  ],
  // placed by the camp and the village (worked out from the map: see Npcs.ts)
  meadow: [],
};
