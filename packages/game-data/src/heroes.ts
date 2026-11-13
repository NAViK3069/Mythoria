// The heroes. The first seven are the Rare starters, designed as a FIRST DRAFT for the owner to rework:
// names, looks, skills, talents and numbers (docs/game-design/heroes.md). One per class, two supports
// (a healer and one who speeds the team up), seven races, all five elements.
//
// Base stats are at level 1, a step below LineRanger_TurnBased's heroes of the same role (these are the
// lowest rarity). Skills are written as in that game: a cost in team energy, an area, a list of effects.

import type { ElementId } from './elements';
import type { ClassId, RarityId, Skill, Stats, Talent } from './heroBasics';
import type { RaceId } from './races';

export interface HeroDef {
  id: string;
  name: string;
  /** A few words on who they are. */
  title: string;
  rarity: RarityId;
  class: ClassId;
  /** Its element - one per hero (the owner's rule): what it hits with and takes damage by. */
  element: ElementId;
  race: RaceId;
  /** Its picture in the 'heroes' atlas / assets/characters/heroes/<look>_*.png (tools/npc_parts.py). */
  look: string;
  base: Stats;
  normal: Skill;
  skill1: Skill;
  skill2: Skill;
  /** The ultimate: free, cast on its own turn when its charge is full (ULT in heroBasics). FIRST DRAFT. */
  ult: Skill;
  passive: { name: string; text: string };
  /** Unlocked by stars 1..5 (C1..C5). */
  talents: [Talent, Talent, Talent, Talent, Talent];
}

export const HEROES: readonly HeroDef[] = [
  {
    id: 'bram',
    name: 'บราม',
    title: 'อัศวินโล่แห่งแสง',
    rarity: 'rare',
    class: 'tank',
    element: 'light',
    race: 'human',
    look: 'bram',
    base: { atk: 220, hp: 5600, def: 400, spd: 92, evade: 8, skillEvade: 6, normalRes: 10, skillRes: 8, crit: 2, critDmg: 140, statusRes: 28 },
    normal: { name: 'กระแทกโล่', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'กระแทกศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'ปราการแสง', cost: 2, area: 'self',
      effects: [{ type: 'taunt', turns: 2 }, { type: 'shield', pct: 20, turns: 2, scale: 'casterHp' }],
      text: 'ยั่วยุศัตรูให้ตีตัวเอง 2 เทิร์น และสร้างโล่ 20% ของเลือดสูงสุดให้ตัวเอง',
    },
    skill2: {
      name: 'โล่พิทักษ์', cost: 4, area: 'ally_all',
      effects: [{ type: 'shield', pct: 10, turns: 2, scale: 'casterHp' }, { type: 'toughUp', pct: 10, turns: 2 }],
      text: 'สร้างโล่ 10% ของเลือดสูงสุดของบรามให้เพื่อนทั้งทีม และลดดาเมจที่ได้รับ 10% นาน 2 เทิร์น',
    },
    ult: {
      name: 'รุ่งอรุณพิทักษ์', cost: 0, area: 'ally_all',
      effects: [{ type: 'shield', pct: 18, turns: 2, scale: 'casterHp' }, { type: 'toughUp', pct: 20, turns: 2 }, { type: 'cleanse' }],
      text: 'สร้างโล่ 18% ของเลือดสูงสุดของบรามให้เพื่อนทั้งทีม ลดดาเมจที่ได้รับ 20% นาน 2 เทิร์น และล้างผลด้านลบ',
    },
    passive: { name: 'ใจเหล็ก', text: 'เมื่อเลือดเหลือต่ำกว่า 30% ครั้งแรก ได้บาเรียอมตะ 1 เทิร์น' },
    talents: [
      { name: 'โล่หนาขึ้น', text: 'ปราการแสง: โล่เพิ่มเป็น 25%' },
      { name: 'ร่างกายแกร่ง', text: 'เลือด +8%' },
      { name: 'ป้อมปราการ', text: 'โล่พิทักษ์: โล่เพิ่มเป็น 13%' },
      { name: 'ศรัทธาไม่สั่นคลอน', text: 'ใจเหล็ก: ฟื้นเลือด 15% ตอนได้บาเรีย' },
      { name: 'ผู้พิทักษ์แห่งแสง', text: 'โล่พิทักษ์: ล้างผลด้านลบให้เพื่อนทั้งทีมด้วย' },
    ],
  },
  {
    id: 'kael',
    name: 'ไคล์',
    title: 'นักรบหมาป่าเพลิง',
    rarity: 'rare',
    class: 'warrior',
    element: 'fire',
    race: 'beastkin',
    look: 'kael',
    base: { atk: 360, hp: 4600, def: 250, spd: 101, evade: 8, skillEvade: 7, normalRes: 5, skillRes: 5, crit: 10, critDmg: 155, statusRes: 16 },
    normal: { name: 'ฟันขวาน', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ฟันศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'เขี้ยวเพลิง', cost: 2, area: 'single_front',
      effects: [{ type: 'damage', pct: 220 }, { type: 'burn', pct: 30, turns: 2 }],
      text: 'ฟัน 220% ของพลังโจมตี และติดไฟไหม้ 30% ต่อเทิร์น นาน 2 เทิร์น',
    },
    skill2: {
      name: 'หมาป่าคลั่ง', cost: 4, area: 'row',
      effects: [{ type: 'damage', pct: 170 }, { type: 'lifesteal', pct: 20 }],
      text: 'กวาดทั้งแถว 170% ของพลังโจมตี และดูดเลือด 20% ของดาเมจที่ทำ',
    },
    ult: {
      name: 'อัคคีหมาป่าคลั่ง', cost: 0, area: 'row',
      effects: [{ type: 'damage', pct: 300 }, { type: 'burn', pct: 40, turns: 2 }, { type: 'lifesteal', pct: 25 }],
      text: 'ฟาดทั้งแถว 300% ของพลังโจมตี ติดไฟไหม้ 40% 2 เทิร์น และดูดเลือด 25% ของดาเมจ',
    },
    passive: { name: 'สัญชาตญาณป่า', text: 'ล้มศัตรูได้ เลื่อนเทิร์นตัวเองขึ้น 20%' },
    talents: [
      { name: 'เปลวไฟลุกโชน', text: 'เขี้ยวเพลิง: ไฟไหม้เพิ่มเป็น 40%' },
      { name: 'กรงเล็บคม', text: 'พลังโจมตี +8%' },
      { name: 'ฝูงคลั่ง', text: 'หมาป่าคลั่ง: ดาเมจเพิ่มเป็น 200%' },
      { name: 'ล่าไม่หยุด', text: 'สัญชาตญาณป่า: เลื่อนเทิร์นเพิ่มเป็น 35%' },
      { name: 'ราชันหมาป่า', text: 'หมาป่าคลั่ง: ดูดเลือดเพิ่มเป็น 35% และติดไฟไหม้ทั้งแถว' },
    ],
  },
  {
    id: 'nyx',
    name: 'นิกซ์',
    title: 'มือสังหารแห่งราตรี',
    rarity: 'rare',
    class: 'assassin',
    element: 'dark',
    race: 'demon',
    look: 'nyx',
    base: { atk: 380, hp: 2300, def: 140, spd: 116, evade: 14, skillEvade: 10, normalRes: 0, skillRes: 0, crit: 26, critDmg: 190, statusRes: 6 },
    normal: { name: 'แทงมีดคู่', cost: 0, area: 'single_any', effects: [{ type: 'damage', pct: 100 }], text: 'แทงศัตรูตัวใดก็ได้ 100% ของพลังโจมตี' },
    skill1: {
      name: 'เงาเชือด', cost: 2, area: 'single_any',
      effects: [{ type: 'damage', pct: 240 }, { type: 'bleed', pct: 30, turns: 2 }],
      text: 'เชือด 240% ของพลังโจมตี และติดเลือดไหล 30% ต่อเทิร์น นาน 2 เทิร์น',
    },
    skill2: {
      name: 'ม่านราตรี', cost: 4, area: 'single_any',
      effects: [{ type: 'damage', pct: 330 }],
      text: 'จู่โจมจากเงามืดใส่เป้าใดก็ได้ 330% ของพลังโจมตี',
    },
    ult: {
      name: 'เงาประหาร', cost: 0, area: 'single_any',
      effects: [{ type: 'damage', pct: 480 }, { type: 'vulnerable', pct: 20, turns: 2 }],
      text: 'จู่โจมศัตรูตัวใดก็ได้ 480% ของพลังโจมตี และทำให้รับดาเมจเพิ่ม 20% นาน 2 เทิร์น',
    },
    passive: { name: 'ล่าเหยื่อ', text: 'ตีเป้าที่เลือดต่ำกว่าครึ่ง แรงขึ้น 25%' },
    talents: [
      { name: 'คมมีดพิษ', text: 'เงาเชือด: เลือดไหลเพิ่มเป็น 40%' },
      { name: 'ฝีเท้าเงา', text: 'สปีด +6' },
      { name: 'จันทร์ดับ', text: 'ม่านราตรี: ดาเมจเพิ่มเป็น 380%' },
      { name: 'กลิ่นเลือด', text: 'ล่าเหยื่อ: แรงขึ้นเป็น 40%' },
      { name: 'เจ้าแห่งราตรี', text: 'ม่านราตรี: แล้วหายตัว หลบการโจมตีปกติ +25% นาน 2 เทิร์น · ถ้าล้มเป้าได้ ได้พลังงานคืน 2' },
    ],
  },
  {
    id: 'fen',
    name: 'เฟน',
    title: 'พรานธนูแห่งพงไพร',
    rarity: 'rare',
    class: 'marksman',
    element: 'wood',
    race: 'forest',
    look: 'fen',
    base: { atk: 400, hp: 3100, def: 160, spd: 110, evade: 10, skillEvade: 8, normalRes: 0, skillRes: 3, crit: 20, critDmg: 175, statusRes: 10 },
    normal: { name: 'ยิงศร', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ยิงศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'ศรหนาม', cost: 2, area: 'single_any',
      effects: [{ type: 'damage', pct: 200 }, { type: 'speedDown', pct: 20, turns: 2 }],
      text: 'ยิงเป้าใดก็ได้ 200% ของพลังโจมตี และลดสปีด 20% นาน 2 เทิร์น',
    },
    skill2: {
      name: 'ฝนธนูพงไพร', cost: 4, area: 'all',
      effects: [{ type: 'damage', pct: 140 }],
      text: 'ยิงศรตกใส่ศัตรูทั้งหมด 140% ของพลังโจมตี',
    },
    ult: {
      name: 'ศรเทพพฤกษา', cost: 0, area: 'all',
      effects: [{ type: 'damage', pct: 220 }, { type: 'evadeDown', pct: 15, turns: 2 }],
      text: 'ยิงศรใส่ศัตรูทั้งหมด 220% ของพลังโจมตี และลดการหลบ 15% นาน 2 เทิร์น',
    },
    passive: { name: 'สายตาเหยี่ยว', text: 'อัตราคริติคอล +10% เมื่อตีเป้าที่เลือดเกินครึ่ง' },
    talents: [
      { name: 'หนามพันธนาการ', text: 'ศรหนาม: ลดสปีดเพิ่มเป็น 30%' },
      { name: 'มือนิ่ง', text: 'แรงโจมตีคริติคอล +15%' },
      { name: 'พายุใบไม้', text: 'ฝนธนูพงไพร: ดาเมจเพิ่มเป็น 165%' },
      { name: 'นัยน์ตาพราน', text: 'สายตาเหยี่ยว: คริติคอลเพิ่มเป็น +18%' },
      { name: 'ผู้พิทักษ์ป่า', text: 'ฝนธนูพงไพร: ลดสปีดศัตรูทั้งหมด 15% นาน 1 เทิร์น' },
    ],
  },
  {
    id: 'marin',
    name: 'มาริน',
    title: 'นักเวทแห่งท้องทะเล',
    rarity: 'rare',
    class: 'mage',
    element: 'water',
    race: 'aquatic',
    look: 'marin',
    base: { atk: 450, hp: 2900, def: 150, spd: 100, evade: 7, skillEvade: 9, normalRes: 0, skillRes: 8, crit: 9, critDmg: 160, statusRes: 18 },
    normal: { name: 'ลูกน้ำวน', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ปาลูกน้ำวนใส่ศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'หอกวารี', cost: 2, area: 'row_any',
      effects: [{ type: 'damage', pct: 170 }, { type: 'atkDown', pct: 15, turns: 2 }],
      text: 'แทงหอกน้ำใส่แถวใดก็ได้ 170% ของพลังโจมตี และลดพลังโจมตี 15% นาน 2 เทิร์น',
    },
    skill2: {
      name: 'คลื่นยักษ์', cost: 4, area: 'all',
      effects: [{ type: 'damage', pct: 190 }, { type: 'speedDown', pct: 15, turns: 1 }],
      text: 'คลื่นซัดศัตรูทั้งหมด 190% ของพลังโจมตี และลดสปีด 15% นาน 1 เทิร์น',
    },
    ult: {
      name: 'สึนามิ', cost: 0, area: 'all',
      effects: [{ type: 'damage', pct: 260 }, { type: 'speedDown', pct: 20, turns: 2 }],
      text: 'คลื่นยักษ์ซัดศัตรูทั้งหมด 260% ของพลังโจมตี และลดสปีด 20% นาน 2 เทิร์น',
    },
    passive: { name: 'กระแสน้ำ', text: 'ใช้สกิลแล้ว มีโอกาส 30% ได้พลังงานคืน 1' },
    talents: [
      { name: 'หอกเย็นเฉียบ', text: 'หอกวารี: ลดพลังโจมตีเพิ่มเป็น 20%' },
      { name: 'ใจสงบ', text: 'ต้านสถานะ +10%' },
      { name: 'สึนามิ', text: 'คลื่นยักษ์: ดาเมจเพิ่มเป็น 220%' },
      { name: 'น้ำขึ้น', text: 'กระแสน้ำ: โอกาสเพิ่มเป็น 45%' },
      { name: 'ธิดาแห่งทะเล', text: 'คลื่นยักษ์: ทำให้ศัตรูทั้งหมดเปราะบาง (รับดาเมจ +15%) นาน 2 เทิร์น' },
    ],
  },
  {
    id: 'sira',
    name: 'ซีร่า',
    title: 'ภูติผู้เยียวยา',
    rarity: 'rare',
    class: 'support',
    element: 'water',
    race: 'spirit',
    look: 'sira',
    base: { atk: 300, hp: 3400, def: 190, spd: 112, evade: 9, skillEvade: 11, normalRes: 3, skillRes: 6, crit: 4, critDmg: 145, statusRes: 26 },
    normal: { name: 'ประกายวิญญาณ', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ยิงประกายวิญญาณใส่ศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'แสงตะเกียงภูติ', cost: 2, area: 'ally_single',
      effects: [{ type: 'heal', pct: 25, scale: 'targetHp' }, { type: 'cleanse' }],
      text: 'ฟื้นเลือดเพื่อน 1 ตัว 25% ของเลือดสูงสุด และล้างผลด้านลบ',
    },
    skill2: {
      name: 'ลมหายใจภูติ', cost: 4, area: 'ally_all',
      effects: [{ type: 'heal', pct: 15, scale: 'targetHp' }, { type: 'regen', pct: 6, turns: 2, scale: 'targetHp' }],
      text: 'ฟื้นเลือดเพื่อนทั้งทีม 15% และฟื้นฟูต่อเนื่อง 6% ต่อเทิร์น นาน 2 เทิร์น',
    },
    ult: {
      name: 'อรุณแห่งภูติ', cost: 0, area: 'ally_all',
      effects: [{ type: 'heal', pct: 30, scale: 'targetHp' }, { type: 'cleanse' }, { type: 'regen', pct: 8, turns: 2, scale: 'targetHp' }],
      text: 'ฮีลเพื่อนทั้งทีม 30% ของเลือดสูงสุด ล้างผลด้านลบ และฟื้นเลือด 8% ทุกเทิร์น 2 เทิร์น',
    },
    passive: { name: 'วิญญาณคุ้มครอง', text: 'ฮีลเพื่อนที่เลือดต่ำกว่า 30% แรงขึ้น 20%' },
    talents: [
      { name: 'ตะเกียงสว่าง', text: 'แสงตะเกียงภูติ: ฮีลเพิ่มเป็น 30%' },
      { name: 'กายโปร่งแสง', text: 'หลบการโจมตีสกิล +8%' },
      { name: 'สายลมอุ่น', text: 'ลมหายใจภูติ: ฮีลเพิ่มเป็น 18%' },
      { name: 'ผู้นำทางวิญญาณ', text: 'วิญญาณคุ้มครอง: แรงขึ้นเป็น 35%' },
      { name: 'คืนชีพแห่งภูติ', text: 'ลมหายใจภูติ: ล้างผลด้านลบให้เพื่อนทั้งทีมด้วย' },
    ],
  },
  {
    id: 'pip',
    name: 'ปิ๊ป',
    title: 'ช่างกลจักรไอน้ำ',
    rarity: 'rare',
    class: 'support',
    element: 'fire',
    race: 'automaton',
    look: 'pip',
    base: { atk: 290, hp: 3600, def: 220, spd: 118, evade: 8, skillEvade: 8, normalRes: 5, skillRes: 5, crit: 5, critDmg: 150, statusRes: 22 },
    normal: { name: 'ทุบค้อน', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ทุบค้อนใส่ศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'จูนเครื่อง', cost: 2, area: 'ally_single',
      effects: [{ type: 'atkUp', pct: 25, turns: 2 }, { type: 'actionAdvance', pct: 20 }],
      text: 'เพิ่มพลังโจมตีเพื่อน 1 ตัว 25% นาน 2 เทิร์น และเลื่อนเทิร์นของเพื่อนตัวนั้นขึ้น 20%',
    },
    skill2: {
      name: 'เทอร์โบไอน้ำ', cost: 4, area: 'ally_all',
      effects: [{ type: 'speedUp', pct: 15, turns: 2 }, { type: 'energyGain', amount: 1 }],
      text: 'เพิ่มสปีดเพื่อนทั้งทีม 15% นาน 2 เทิร์น และได้พลังงาน 1',
    },
    ult: {
      name: 'โอเวอร์โหลด', cost: 0, area: 'ally_all',
      effects: [{ type: 'atkUp', pct: 25, turns: 2 }, { type: 'actionAdvance', pct: 30 }],
      text: 'เพิ่มพลังโจมตีเพื่อนทั้งทีม 25% นาน 2 เทิร์น และดันลำดับเทิร์นขึ้นมา 30%',
    },
    passive: { name: 'ช่างประจำทีม', text: 'เริ่มต่อสู้: สร้างโล่ 8% ของเลือดสูงสุดของปิ๊ปให้เพื่อนทั้งทีม นาน 2 เทิร์น' },
    talents: [
      { name: 'น็อตแน่น', text: 'จูนเครื่อง: เพิ่มพลังโจมตีเป็น 30%' },
      { name: 'โครงเหล็ก', text: 'เกราะ +10%' },
      { name: 'หม้อต้มแรงสูง', text: 'เทอร์โบไอน้ำ: เพิ่มสปีดเป็น 20%' },
      { name: 'อะไหล่สำรอง', text: 'ช่างประจำทีม: โล่เพิ่มเป็น 12%' },
      { name: 'เครื่องยนต์ในตำนาน', text: 'เทอร์โบไอน้ำ: ได้พลังงาน 2' },
    ],
  },

  // ---------------------------------------------------------------- the owner's new heroes (drawn by the owner;
  // names from the art files). Everything else - title, rarity, class, element, race, numbers, skills, talents -
  // is Claude's FIRST DRAFT for the owner to rework (docs/game-design/heroes.md).
  {
    id: 'dravik',
    name: 'ดราวิก',
    title: 'อัศวินมังกรน้ำแข็ง',
    rarity: 'legend',
    // a warrior (the owner's call: his looks suit buffs and attacks, not standing guard)
    class: 'warrior',
    element: 'water',
    race: 'dragonkin',
    look: 'dravik',
    base: { atk: 470, hp: 6000, def: 320, spd: 104, evade: 9, skillEvade: 8, normalRes: 6, skillRes: 6, crit: 14, critDmg: 165, statusRes: 22 },
    normal: { name: 'แทงหอกน้ำแข็ง', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'แทงศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'เกล็ดมังกรเยือกแข็ง', cost: 2, area: 'self',
      effects: [{ type: 'atkUp', pct: 30, turns: 2 }, { type: 'critUp', pct: 15, turns: 2 }],
      text: 'เกล็ดน้ำแข็งห่อหุ้มตัว เพิ่มพลังโจมตี 30% และอัตราคริติคอล 15% นาน 2 เทิร์น',
    },
    skill2: {
      name: 'ลมหายใจน้ำแข็ง', cost: 4, area: 'row',
      effects: [{ type: 'damage', pct: 180 }, { type: 'speedDown', pct: 20, turns: 2 }],
      text: 'คลื่นหนามน้ำแข็งพุ่งใส่ทั้งแถว 180% ของพลังโจมตี และลดสปีด 20% นาน 2 เทิร์น',
    },
    ult: {
      name: 'พิโรธมังกรน้ำแข็ง', cost: 0, area: 'all',
      effects: [{ type: 'damage', pct: 260 }, { type: 'speedDown', pct: 25, turns: 2 }],
      text: 'น้ำแข็งระเบิดขึ้นใต้ศัตรูทั้งหมด 260% ของพลังโจมตี และลดสปีด 25% นาน 2 เทิร์น',
    },
    passive: { name: 'เกล็ดน้ำแข็ง', text: 'ตีศัตรูที่ติดลดสปีด แรงขึ้น 20%' },
    talents: [
      { name: 'เกล็ดคม', text: 'เกล็ดมังกรเยือกแข็ง: เพิ่มพลังโจมตีเป็น 35%' },
      { name: 'สายเลือดมังกร', text: 'พลังโจมตี +8%' },
      { name: 'ลมหนาวกัดกร่อน', text: 'ลมหายใจน้ำแข็ง: ดาเมจเพิ่มเป็น 210%' },
      { name: 'ผิวน้ำแข็ง', text: 'เกล็ดน้ำแข็ง: แรงขึ้นเป็น 30%' },
      { name: 'ราชันมังกรน้ำแข็ง', text: 'พิโรธมังกรน้ำแข็ง: ศัตรูที่ติดลดสปีดอยู่แล้ว ถูกแช่แข็ง (มึนงง) 1 เทิร์น' },
    ],
  },
  {
    id: 'fenrir',
    name: 'เฟนริร์',
    title: 'นักล่าหมาป่าอัคคี',
    rarity: 'epic',
    class: 'assassin',
    element: 'fire',
    race: 'beastkin',
    look: 'fenrir',
    base: { atk: 420, hp: 2600, def: 150, spd: 119, evade: 15, skillEvade: 10, normalRes: 0, skillRes: 2, crit: 27, critDmg: 190, statusRes: 8 },
    normal: { name: 'แทงหอก', cost: 0, area: 'single_any', effects: [{ type: 'damage', pct: 100 }], text: 'แทงศัตรูตัวใดก็ได้ 100% ของพลังโจมตี' },
    skill1: {
      name: 'หอกเพลิง', cost: 2, area: 'single_any',
      effects: [{ type: 'damage', pct: 230 }, { type: 'burn', pct: 30, turns: 2 }],
      text: 'แทงศัตรูตัวใดก็ได้ 230% ของพลังโจมตี และติดไฟไหม้ 30% ต่อเทิร์น นาน 2 เทิร์น',
    },
    skill2: {
      name: 'ล่าเหยื่อ', cost: 4, area: 'single_any',
      effects: [{ type: 'damage', pct: 200 }, { type: 'bleed', pct: 25, turns: 2 }, { type: 'vulnerable', pct: 15, turns: 2 }],
      text: 'พุ่งหอกเพลิงทะลวงแล้วกระโดดแทงศัตรูตัวใดก็ได้ 200% ของพลังโจมตี ติดเลือดไหล 25% และเปราะบาง (รับดาเมจ +15%) นาน 2 เทิร์น',
    },
    ult: {
      name: 'ฝนหอกเพลิง', cost: 0, area: 'single_any',
      effects: [{ type: 'damage', pct: 380 }, { type: 'burn', pct: 40, turns: 2 }],
      text: 'เรียกฝนหอกเพลิงแล้วกระโดดแทงศัตรูตัวใดก็ได้ 380% ของพลังโจมตี และติดไฟไหม้ 40% นาน 2 เทิร์น',
    },
    passive: { name: 'กลิ่นเหยื่อ', text: 'ตีศัตรูที่เลือดต่ำกว่า 50% แรงขึ้น 15%' },
    talents: [
      { name: 'ปลายหอกร้อน', text: 'หอกเพลิง: ไฟไหม้เพิ่มเป็น 40%' },
      { name: 'ฝีเท้าหมาป่า', text: 'สปีด +6%' },
      { name: 'แผลลึก', text: 'ล่าเหยื่อ: เลือดไหลเพิ่มเป็น 35%' },
      { name: 'นักล่าเลือดร้อน', text: 'กลิ่นเหยื่อ: แรงขึ้นเป็น 25%' },
      { name: 'หมาป่าเพลิงตำนาน', text: 'ล่าเหยื่อ: ล้มศัตรูได้ เลื่อนเทิร์นตัวเองขึ้น 30%' },
    ],
  },
  {
    id: 'neris',
    name: 'เนริส',
    title: 'ภูติผลึกแห่งแสง',
    rarity: 'epic',
    class: 'mage',
    element: 'light',
    race: 'celestial',
    look: 'neris',
    base: { atk: 490, hp: 3100, def: 160, spd: 102, evade: 8, skillEvade: 10, normalRes: 0, skillRes: 10, crit: 10, critDmg: 160, statusRes: 20 },
    normal: { name: 'ลำแสงผลึก', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ยิงลำแสงใส่ศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'หอกผลึก', cost: 2, area: 'row_any',
      effects: [{ type: 'damage', pct: 150 }, { type: 'atkDown', pct: 15, turns: 2 }],
      text: 'ปักหอกผลึกใส่แถวใดก็ได้ 150% ของพลังโจมตี และลดพลังโจมตี 15% นาน 2 เทิร์น',
    },
    skill2: {
      name: 'ฝนผลึกแสง', cost: 4, area: 'all',
      effects: [{ type: 'damage', pct: 130 }, { type: 'vulnerable', pct: 10, turns: 2 }],
      text: 'ฝนผลึกตกใส่ศัตรูทั้งหมด 130% ของพลังโจมตี และเปราะบาง (รับดาเมจ +10%) นาน 2 เทิร์น',
    },
    ult: {
      name: 'ดาราผลึก', cost: 0, area: 'all',
      effects: [{ type: 'damage', pct: 240 }, { type: 'silence', turns: 1 }],
      text: 'ผลึกดาราระเบิดใส่ศัตรูทั้งหมด 240% ของพลังโจมตี และใบ้ (ใช้สกิลไม่ได้) 1 เทิร์น',
    },
    passive: { name: 'ประกายผลึก', text: 'ทุกครั้งที่ใช้สกิล ได้พลังโจมตี +5% (สะสมสูงสุด 3 ครั้ง)' },
    talents: [
      { name: 'ผลึกคม', text: 'หอกผลึก: ดาเมจเพิ่มเป็น 170%' },
      { name: 'ใจกระจ่าง', text: 'พลังโจมตี +8%' },
      { name: 'พายุผลึก', text: 'ฝนผลึกแสง: ดาเมจเพิ่มเป็น 150%' },
      { name: 'แสงสะสม', text: 'ประกายผลึก: สะสมได้ 5 ครั้ง' },
      { name: 'ธิดาแห่งดารา', text: 'ฝนผลึกแสง: ได้พลังงาน 1' },
    ],
  },
  {
    id: 'sylva',
    name: 'ซิลวา',
    title: 'เอลฟ์ผู้พิทักษ์พงไพร',
    rarity: 'epic',
    class: 'support',
    element: 'wood',
    race: 'forest',
    look: 'sylva',
    base: { atk: 310, hp: 3800, def: 210, spd: 114, evade: 10, skillEvade: 10, normalRes: 3, skillRes: 6, crit: 5, critDmg: 145, statusRes: 28 },
    normal: { name: 'เมล็ดหนาม', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ดีดเมล็ดหนามใส่ศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'น้ำค้างชีวิต', cost: 2, area: 'ally_single',
      effects: [{ type: 'heal', pct: 28, scale: 'targetHp' }, { type: 'regen', pct: 5, turns: 2, scale: 'targetHp' }],
      text: 'ฟื้นเลือดเพื่อน 1 ตัว 28% ของเลือดสูงสุด และฟื้นฟูต่อเนื่อง 5% ต่อเทิร์น นาน 2 เทิร์น',
    },
    skill2: {
      name: 'ร่มไม้คุ้มภัย', cost: 4, area: 'ally_all',
      effects: [{ type: 'shield', pct: 10, turns: 2, scale: 'targetHp' }, { type: 'evadeUp', pct: 10, turns: 2 }],
      text: 'สร้างโล่ 10% ของเลือดสูงสุดให้เพื่อนทั้งทีม และเพิ่มการหลบ 10% นาน 2 เทิร์น',
    },
    ult: {
      name: 'พรแห่งพงไพร', cost: 0, area: 'ally_all',
      effects: [{ type: 'heal', pct: 25, scale: 'targetHp' }, { type: 'regen', pct: 8, turns: 2, scale: 'targetHp' }, { type: 'cleanse' }],
      text: 'ฮีลเพื่อนทั้งทีม 25% ของเลือดสูงสุด ฟื้นเลือด 8% ทุกเทิร์น 2 เทิร์น และล้างผลด้านลบ',
    },
    passive: { name: 'รากแห่งชีวิต', text: 'เริ่มเทิร์นของซิลวา: เพื่อนที่เลือดต่ำสุดฟื้นเลือด 4%' },
    talents: [
      { name: 'น้ำค้างใส', text: 'น้ำค้างชีวิต: ฮีลเพิ่มเป็น 33%' },
      { name: 'ใบไม้ปลิว', text: 'หลบการโจมตี +6%' },
      { name: 'ร่มไม้ใหญ่', text: 'ร่มไม้คุ้มภัย: โล่เพิ่มเป็น 13%' },
      { name: 'รากลึก', text: 'รากแห่งชีวิต: ฟื้นเลือดเพิ่มเป็น 7%' },
      { name: 'หัวใจแห่งพงไพร', text: 'ร่มไม้คุ้มภัย: ล้างผลด้านลบให้เพื่อนทั้งทีมด้วย' },
    ],
  },
  {
    id: 'valdris',
    name: 'วัลดริส',
    title: 'เจ้าแห่งรัตติกาลโลหิต',
    rarity: 'mythic',
    class: 'warrior',
    element: 'dark',
    race: 'undead',
    look: 'valdris',
    base: { atk: 470, hp: 5600, def: 300, spd: 106, evade: 10, skillEvade: 9, normalRes: 6, skillRes: 6, crit: 15, critDmg: 165, statusRes: 22 },
    normal: { name: 'ฟันโลหิต', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }, { type: 'lifesteal', pct: 10 }], text: 'ฟันศัตรูแถวหน้า 100% ของพลังโจมตี และดูดเลือด 10% ของดาเมจ' },
    skill1: {
      name: 'คมเลือด', cost: 2, area: 'single_front',
      effects: [{ type: 'damage', pct: 260 }, { type: 'bleed', pct: 35, turns: 2 }, { type: 'lifesteal', pct: 20 }],
      text: 'ฟัน 260% ของพลังโจมตี ติดเลือดไหล 35% นาน 2 เทิร์น และดูดเลือด 20% ของดาเมจ',
    },
    skill2: {
      name: 'ราตรีกระหายเลือด', cost: 4, area: 'row',
      effects: [{ type: 'damage', pct: 190 }, { type: 'atkDown', pct: 15, turns: 2 }, { type: 'lifesteal', pct: 30 }],
      text: 'กวาดทั้งแถว 190% ของพลังโจมตี ลดพลังโจมตี 15% นาน 2 เทิร์น และดูดเลือด 30% ของดาเมจ',
    },
    ult: {
      name: 'จันทร์สีเลือด', cost: 0, area: 'all',
      effects: [{ type: 'damage', pct: 260 }, { type: 'bleed', pct: 40, turns: 2 }, { type: 'lifesteal', pct: 30 }],
      text: 'จันทร์สีเลือดเหนือศัตรูทั้งหมด 260% ของพลังโจมตี ติดเลือดไหล 40% 2 เทิร์น และดูดเลือด 30% ของดาเมจ',
    },
    passive: { name: 'อมตะโลหิต', text: 'ครั้งแรกที่จะล้ม: รอดด้วยเลือด 1 และฟื้นเลือด 25%' },
    talents: [
      { name: 'คมกระหาย', text: 'คมเลือด: เลือดไหลเพิ่มเป็น 45%' },
      { name: 'ร่างอมตะ', text: 'เลือด +10%' },
      { name: 'ราตรีนิรันดร์', text: 'ราตรีกระหายเลือด: ดาเมจเพิ่มเป็น 220%' },
      { name: 'เลือดคืนชีพ', text: 'อมตะโลหิต: ฟื้นเลือดเพิ่มเป็น 40%' },
      { name: 'ราชันรัตติกาล', text: 'จันทร์สีเลือด: ลดพลังโจมตีศัตรูทั้งหมด 20% นาน 2 เทิร์น' },
    ],
  },
  {
    // the owner's ninja (Kuroha.aseprite) - her data is Claude's FIRST DRAFT: Epic marksman, dark, violet lightning
    id: 'kuroha',
    name: 'คุโรฮะ',
    title: 'นินจาดาวสายฟ้าทมิฬ',
    rarity: 'epic',
    class: 'marksman',
    element: 'dark',
    race: 'human',
    look: 'kuroha',
    base: { atk: 470, hp: 3300, def: 165, spd: 116, evade: 14, skillEvade: 10, normalRes: 0, skillRes: 4, crit: 24, critDmg: 180, statusRes: 10 },
    normal: { name: 'ดาวกระจาย', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }], text: 'ขว้างดาวกระจายใส่ศัตรูแถวหน้า 100% ของพลังโจมตี' },
    skill1: {
      name: 'ดาวสายฟ้า', cost: 2, area: 'single_any',
      effects: [{ type: 'damage', pct: 210 }, { type: 'vulnerable', pct: 12, turns: 2 }],
      text: 'ขว้างดาวสายฟ้าใส่เป้าใดก็ได้ 210% ของพลังโจมตี และเปราะบาง (รับดาเมจ +12%) นาน 2 เทิร์น',
    },
    skill2: {
      name: 'พายุดาวกระจาย', cost: 4, area: 'all',
      effects: [{ type: 'damage', pct: 125 }, { type: 'evadeDown', pct: 15, turns: 2 }],
      text: 'โปรยดาวกระจายใส่ศัตรูทั้งหมด 125% ของพลังโจมตี และลดการหลบ 15% นาน 2 เทิร์น',
    },
    ult: {
      name: 'วังวนสายฟ้าทมิฬ', cost: 0, area: 'all',
      effects: [{ type: 'damage', pct: 240 }, { type: 'speedDown', pct: 20, turns: 2 }],
      text: 'ดาวกระจายยักษ์หมุนเป็นวังวนสายฟ้าเหนือศัตรูทั้งหมด 240% ของพลังโจมตี และลดสปีด 20% นาน 2 เทิร์น',
    },
    passive: { name: 'เงาพริบตา', text: 'หลังใช้สกิล หลบการโจมตี +15% นาน 1 เทิร์น' },
    talents: [
      { name: 'คมสายฟ้า', text: 'ดาวสายฟ้า: ดาเมจเพิ่มเป็น 240%' },
      { name: 'ฝีเท้าเงา', text: 'สปีด +6%' },
      { name: 'พายุใบมีด', text: 'พายุดาวกระจาย: ดาเมจเพิ่มเป็น 145%' },
      { name: 'เงาซ้อนเงา', text: 'เงาพริบตา: หลบเพิ่มเป็น +25%' },
      { name: 'ดาวทมิฬ', text: 'วังวนสายฟ้าทมิฬ: ทำให้ศัตรูทั้งหมดเปราะบาง (รับดาเมจ +15%) นาน 2 เทิร์น' },
    ],
  },
  {
    // the owner's Mythic swordswoman (Astraea.aseprite) - "the coolest hero ever" (the owner); her data is Claude's
    // FIRST DRAFT: Mythic assassin, light, celestial (Astraea - the star maiden), a sakura katana
    id: 'astraea',
    name: 'แอสเทรีย',
    title: 'ดาบซากุระแห่งดวงดาว',
    rarity: 'mythic',
    class: 'assassin',
    element: 'light',
    race: 'celestial',
    look: 'astraea',
    base: { atk: 560, hp: 4200, def: 210, spd: 122, evade: 16, skillEvade: 12, normalRes: 4, skillRes: 6, crit: 30, critDmg: 200, statusRes: 18 },
    normal: { name: 'ฟันซากุระ', cost: 0, area: 'single_any', effects: [{ type: 'damage', pct: 110 }], text: 'ฟันศัตรูตัวใดก็ได้ 110% ของพลังโจมตี' },
    skill1: {
      name: 'ไออิ: กลีบจันทร์', cost: 2, area: 'single_any',
      effects: [{ type: 'damage', pct: 300 }, { type: 'vulnerable', pct: 15, turns: 2 }],
      text: 'ชักดาบฟันฉับเดียวใส่ศัตรูตัวใดก็ได้ 300% ของพลังโจมตี และเปราะบาง (รับดาเมจ +15%) นาน 2 เทิร์น',
    },
    skill2: {
      name: 'พายุกลีบซากุระ', cost: 4, area: 'all',
      effects: [{ type: 'damage', pct: 170 }, { type: 'bleed', pct: 30, turns: 2 }],
      text: 'พายุกลีบซากุระคมดาบพัดผ่านศัตรูทั้งหมด 170% ของพลังโจมตี และติดเลือดไหล 30% นาน 2 เทิร์น',
    },
    ult: {
      name: 'ดาราซากุระพันคม', cost: 0, area: 'all',
      effects: [{ type: 'damage', pct: 360 }, { type: 'vulnerable', pct: 20, turns: 2 }],
      text: 'หยุดเวลาใต้ต้นซากุระแห่งดวงดาว ฟันพันคมใส่ศัตรูทั้งหมด 360% ของพลังโจมตี และเปราะบาง (รับดาเมจ +20%) นาน 2 เทิร์น',
    },
    passive: { name: 'ซากุระไม่ร่วงโรย', text: 'ทุกครั้งที่ล้มศัตรู ได้พลังโจมตี +10% (สะสมสูงสุด 3 ครั้ง) และชาร์จอัลติเมต +15%' },
    talents: [
      { name: 'คมจันทร์', text: 'ไออิ: กลีบจันทร์: ดาเมจเพิ่มเป็น 340%' },
      { name: 'ก้าวกลีบไม้', text: 'สปีด +8%' },
      { name: 'ฤดูใบไม้ผลินิรันดร์', text: 'พายุกลีบซากุระ: ดาเมจเพิ่มเป็น 200%' },
      { name: 'ดาบดวงดาว', text: 'แรงโจมตีคริติคอล +25%' },
      { name: 'ราชินีซากุระ', text: 'ดาราซากุระพันคม: ศัตรูที่เลือดต่ำกว่า 30% ล้มทันที' },
    ],
  },
];

/** A hero's data by id. */
export const heroById = (id: string): HeroDef | undefined => HEROES.find((h) => h.id === id);

/** The heroes a new player starts with. */
export const STARTER_HEROES: readonly string[] = ['bram', 'kael', 'nyx', 'fen', 'marin', 'sira', 'pip'];
