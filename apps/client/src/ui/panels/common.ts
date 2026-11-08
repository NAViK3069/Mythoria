import { fmt, h, icon } from '../dom';

/** The master's face, cut from the head sprite. */
export function avatar(size = 58): HTMLElement {
  const img = h('img', { src: 'assets/characters/master/head.png', alt: '', draggable: false });
  img.style.width = img.style.height = `${size * 1.65}px`;
  const box = h('div', { class: 'avatar px-cut' }, h('div', { class: 'face px-cut' }, h('div', { class: 'pic px-cut' }, img)));
  box.style.width = box.style.height = `${size}px`;
  return box;
}

export function rewardChips(r: { gems?: number; gold?: number }): HTMLElement {
  return h('span', { style: 'display:inline-flex;gap:10px' },
    r.gems ? h('span', { class: 'reward' }, icon('gem', 22), h('span', { class: 'num' }, fmt(r.gems))) : null,
    r.gold ? h('span', { class: 'reward' }, icon('gold', 22), h('span', { class: 'num' }, fmt(r.gold))) : null);
}

/** Items the bag knows about (sample set until game-data has the real list). */
export const ITEMS: Record<string, { name: string; icon: string; kind: 'item' | 'material'; desc: string }> = {
  potion: { name: 'ยาฟื้นฟู', icon: 'potion', kind: 'item', desc: 'ฟื้นฟูพลังชีวิตฮีโร่ระหว่างการผจญภัย' },
  chest: { name: 'หีบสมบัติ', icon: 'chest', kind: 'item', desc: 'เปิดเพื่อรับทองแบบสุ่ม' },
  key: { name: 'กุญแจทอง', icon: 'key', kind: 'material', desc: 'ใช้ไขประตูหรือหีบพิเศษ' },
  book: { name: 'ตำราเวท', icon: 'book', kind: 'material', desc: 'วัตถุดิบสำหรับอัปเกรดสกิลฮีโร่' },
  medal: { name: 'เหรียญตรา', icon: 'medal', kind: 'material', desc: 'ใช้แลกของในร้านพิเศษ' },
  map: { name: 'แผนที่สมบัติ', icon: 'map', kind: 'item', desc: 'บอกตำแหน่งสมบัติในแผนที่' },
};

/** Key art behind a card or banner (PixelLab, assets/ui/art). */
export const art = (id: string) => `background-image:url(assets/ui/art/${id}.png)`;
