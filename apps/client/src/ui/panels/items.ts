import { fmt, h, icon, toast } from '../dom';
import { registerPanel } from '../Modal';
import { changed, player } from '../store';
import { ITEMS } from './common';
import { showRewards } from '../reward';

interface Offer {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** what it costs: real money (not open yet), gems or gold */
  price: { thb?: number; gems?: number; gold?: number };
  give(): void;
  tag?: string;
  /** how many the popup shows (default 1) */
  qty?: number;
}

const OFFERS: Record<string, Offer[]> = {
  featured: [
    { id: 'energy', name: 'เติมพลังงาน', icon: 'energy', desc: 'พลังงาน +60', price: { gems: 50 }, give: () => { player.energy = Math.min(player.energyMax * 2, player.energy + 60); }, tag: 'ขายดี', qty: 60 },
    { id: 'potion5', name: 'ยาฟื้นฟู x5', icon: 'potion', desc: 'ใช้ระหว่างการผจญภัย', price: { gold: 2000 }, give: () => addItem('potion', 5), qty: 5 },
    { id: 'chest', name: 'หีบสมบัติ', icon: 'chest', desc: 'เปิดรับทองแบบสุ่ม', price: { gems: 80 }, give: () => addItem('chest', 1) },
    { id: 'key', name: 'กุญแจทอง', icon: 'key', desc: 'ไขหีบและประตูพิเศษ', price: { gold: 5000 }, give: () => addItem('key', 1) },
  ],
  gems: [
    { id: 'g60', name: 'เพชร 60', icon: 'gem', desc: 'ถุงเพชรเล็ก', price: { thb: 35 }, give: () => {} },
    { id: 'g330', name: 'เพชร 330', icon: 'gem', desc: 'ถุงเพชรกลาง', price: { thb: 179 }, give: () => {}, tag: '+10%' },
    { id: 'g1090', name: 'เพชร 1,090', icon: 'gem', desc: 'หีบเพชร', price: { thb: 549 }, give: () => {}, tag: '+20%' },
    { id: 'g2240', name: 'เพชร 2,240', icon: 'gem', desc: 'หีบเพชรใหญ่', price: { thb: 1090 }, give: () => {}, tag: 'คุ้มสุด' },
  ],
  gold: [
    { id: 'gold10k', name: 'ทอง 10,000', icon: 'gold', desc: 'แลกด้วยเพชร', price: { gems: 100 }, give: () => { player.gold += 10000; }, qty: 10000 },
    { id: 'gold60k', name: 'ทอง 60,000', icon: 'gold', desc: 'แลกด้วยเพชร', price: { gems: 500 }, give: () => { player.gold += 60000; }, tag: '+20%', qty: 60000 },
  ],
  packs: [
    { id: 'starter', name: 'แพ็กนักผจญภัยหน้าใหม่', icon: 'chest', desc: 'เพชร 300 • ทอง 50,000 • หีบสมบัติ x3', price: { thb: 99 }, give: () => {}, tag: 'ซื้อได้ครั้งเดียว' },
    { id: 'monthly', name: 'บัตรรายเดือน', icon: 'medal', desc: 'รับเพชร 100 ทุกวัน 30 วัน', price: { thb: 179 }, give: () => {} },
  ],
};

function addItem(id: string, n: number): void {
  player.items[id] = (player.items[id] ?? 0) + n;
}

function priceLabel(p: Offer['price']): (HTMLElement | string)[] {
  if (p.thb) return [`฿${p.thb}`];
  if (p.gems) return [icon('gem', 20), h('span', { class: 'num' }, fmt(p.gems))];
  return [icon('gold', 20), h('span', { class: 'num' }, fmt(p.gold ?? 0))];
}

registerPanel('shop', {
  title: 'ร้านค้า',
  icon: 'shop',
  tabs: [
    { id: 'featured', label: 'แนะนำ' },
    { id: 'gems', label: 'เพชร' },
    { id: 'gold', label: 'ทอง' },
    { id: 'packs', label: 'แพ็กเกจ' },
  ],
  build(body, tab, ctx) {
    const buy = (o: Offer) => {
      const p = o.price;
      if (p.thb) return toast('การชำระเงินจริงจะเปิดในภายหลัง');
      if (p.gems && player.gems < p.gems) return toast('เพชรไม่พอ');
      if (p.gold && player.gold < p.gold) return toast('ทองไม่พอ');
      if (p.gems) player.gems -= p.gems;
      if (p.gold) player.gold -= p.gold;
      o.give();
      changed();
      showRewards([{ icon: o.icon, amount: o.qty ?? 1, label: o.name }], 'ซื้อสำเร็จ!');
      ctx.refresh();
    };
    body.append(
      h('div', { class: 'grid' },
        OFFERS[tab].map((o) =>
          h('div', { class: 'card px-cut' },
            o.tag ? h('span', { class: 'ribbon' }, o.tag) : null,
            h('div', { class: 'art' }, icon(o.icon, 56)),
            h('div', { class: 'nm' }, o.name),
            h('div', { class: 'ds' }, o.desc),
            h('button', { class: `btn ${o.price.thb ? 'gold' : ''} px-cut`, style: 'width:100%;margin-top:4px', onclick: () => buy(o) }, ...priceLabel(o.price)),
          ),
        ),
      ),
      tab === 'gems' || tab === 'packs' ? h('p', { class: 'note', style: 'margin-top:12px' }, 'ราคาเป็นตัวอย่าง ระบบชำระเงิน (บัตร / PromptPay / TrueMoney) จะเปิดในเฟสถัดไป') : '',
    );
  },
});

registerPanel('bag', {
  title: 'กระเป๋า',
  icon: 'bag',
  tabs: [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'item', label: 'ไอเทม' },
    { id: 'material', label: 'วัตถุดิบ' },
  ],
  build(body, tab, ctx) {
    const owned = Object.entries(player.items).filter(([id, n]) => n > 0 && ITEMS[id] && (tab === 'all' || ITEMS[id].kind === tab));
    let sel = owned[0]?.[0];
    const detail = h('div', { class: 'reader px-cut', style: 'margin-top:12px' });
    const grid = h('div', { class: 'grid slots' });
    const draw = () => {
      grid.replaceChildren(
        ...owned.map(([id, n]) =>
          h('div', { class: `slot px-cut ${id === sel ? 'sel' : ''}`, onclick: () => { sel = id; draw(); } }, icon(ITEMS[id].icon, 40), h('span', { class: 'qty num' }, `x${n}`))),
        ...Array.from({ length: Math.max(0, 24 - owned.length) }, () => h('div', { class: 'slot px-cut', style: 'cursor:default' })),
      );
      if (!sel) {
        detail.replaceChildren(h('p', null, 'ไม่มีไอเทมในหมวดนี้'));
        return;
      }
      const it = ITEMS[sel];
      const id = sel;
      detail.replaceChildren(
        h('div', { style: 'display:flex;gap:14px;align-items:center' },
          icon(it.icon, 48),
          h('div', { style: 'flex:1' }, h('h3', null, it.name), h('p', null, it.desc), h('div', { class: 'note' }, `มีอยู่ ${player.items[id]} ชิ้น`)),
          it.kind === 'item'
            ? h('button', {
                class: 'btn px-cut',
                onclick: () => {
                  if (id === 'chest') {
                    const g = 500 + Math.floor(Math.random() * 10) * 250;
                    player.gold += g;
                    showRewards([{ icon: 'gold', amount: g, label: 'ทอง' }], 'เปิดหีบสมบัติ!');
                  } else {
                    toast(`${it.name}: ใช้ได้เมื่อระบบต่อสู้เปิด`);
                    return;
                  }
                  player.items[id]--;
                  changed();
                  ctx.refresh();
                },
              }, 'ใช้')
            : null),
      );
    };
    draw();
    body.append(grid, detail);
  },
});
