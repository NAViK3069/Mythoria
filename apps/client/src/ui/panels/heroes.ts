import { fmt, h, icon, toast } from '../dom';
import { registerPanel } from '../Modal';
import { player } from '../store';
import { art } from './common';

// Heroes don't exist yet (the owner will design them): these panels show the
// layout and empty states, ready for real hero data.

registerPanel('team', {
  title: 'ทีม',
  icon: 'team',
  build(body, _tab, ctx) {
    const slot = (i: number) =>
      h('div', { class: 'card px-cut', style: 'min-height:170px;justify-content:center;cursor:pointer', onclick: () => ctx.open('heroes') },
        h('div', { style: 'font-size:34px;color:var(--ui-faint);line-height:1' }, '+'),
        h('div', { class: 'nm' }, `ช่อง ${i + 1}`),
        h('div', { class: 'ds' }, 'แตะเพื่อเลือกฮีโร่'));
    body.append(
      h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr))' }, [0, 1, 2, 3].map(slot)),
      h('div', { class: 'item-row px-cut', style: 'margin-top:14px' },
        icon('trophy', 32),
        h('div', { class: 'main' }, h('div', { class: 'ttl' }, 'พลังทีม'), h('div', { class: 'sub' }, 'จัดฮีโร่ลงทีมเพื่อดูพลังรวม')),
        h('div', { class: 'num', style: 'font-size:22px;color:var(--ui-gold)' }, '0')),
      h('p', { class: 'note', style: 'margin-top:10px' }, 'จำนวนช่องและกติกาการจัดทีมจะปรับตามระบบต่อสู้ที่กำลังออกแบบ'),
    );
  },
});

registerPanel('heroes', {
  title: 'ฮีโร่',
  icon: 'heroes',
  tabs: [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'tank', label: 'แทงก์' },
    { id: 'dps', label: 'โจมตี' },
    { id: 'support', label: 'สนับสนุน' },
  ],
  build(body, _tab, ctx) {
    body.append(
      h('div', { class: 'empty' },
        icon('heroes', 64),
        h('div', null, 'ยังไม่มีฮีโร่'),
        h('div', { class: 'note' }, 'อัญเชิญฮีโร่ตัวแรกของคุณได้ที่ ซัมม่อน'),
        h('button', { class: 'btn purple px-cut', onclick: () => ctx.open('summon') }, icon('summon', 20), 'ไปที่ซัมม่อน')),
    );
  },
});

registerPanel('summon', {
  title: 'ซัมม่อน',
  icon: 'summon',
  build(body) {
    const stars = h('div', { class: 'stars' },
      Array.from({ length: 22 }, () => {
        const s = h('i');
        s.style.left = `${Math.random() * 100}%`;
        s.style.top = `${Math.random() * 100}%`;
        s.style.animationDelay = `${Math.random() * 2.6}s`;
        return s;
      }));
    const pull = (n: number) => {
      const cost = n === 1 ? 160 : 1600;
      if (player.gems < cost) return toast('เพชรไม่พอ');
      toast('ยังไม่มีรายชื่อฮีโร่ในระบบ — ซัมม่อนจะเปิดพร้อมฮีโร่ชุดแรก');
    };
    body.append(
      h('div', { class: 'banner px-cut', style: art('summon') },
        stars,
        h('div', { class: 'orb' }, icon('summon', 140)),
        h('div', { class: 'copy' },
          h('span', { class: 'note', style: 'color:#c9b5ff' }, 'แบนเนอร์ถาวร'),
          h('h3', null, 'การอัญเชิญแห่งตำนาน'),
          h('p', null, 'อัญเชิญเหล่าฮีโร่จากทั่วดินแดน Mythoria มาร่วมทีมของคุณ'),
          h('div', { class: 'note', style: 'color:#b9a6e6' }, 'การันตีฮีโร่ระดับสูงสุดภายใน — ครั้ง (ประกาศเมื่อเปิดระบบ)'))),
      h('div', { class: 'pull-row' },
        h('button', { class: 'btn purple px-cut', onclick: () => pull(1) },
          h('span', null, 'อัญเชิญ 1 ครั้ง'), h('span', { style: 'display:flex;gap:4px;align-items:center' }, icon('gem', 20), h('span', { class: 'num' }, fmt(160)))),
        h('button', { class: 'btn gold px-cut', onclick: () => pull(10) },
          h('span', null, 'อัญเชิญ 10 ครั้ง'), h('span', { style: 'display:flex;gap:4px;align-items:center' }, icon('gem', 20), h('span', { class: 'num' }, fmt(1600))))),
      h('p', { class: 'note', style: 'text-align:center;margin-top:12px' },
        'อัตราการออกของฮีโร่แต่ละระดับจะเปิดเผยครบถ้วนก่อนเปิดระบบ'),
    );
  },
});
