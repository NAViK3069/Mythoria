import { fmt, h, icon, toast } from '../dom';
import { registerPanel } from '../Modal';
import { changed, giveReward, player, type Quest } from '../store';
import { art, rewardChips } from './common';
import { rewardItems, showRewards } from '../reward';

const LOGIN_GIFTS = [
  { gold: 2000 }, { gems: 50 }, { gold: 5000 }, { gems: 80 }, { gold: 10000 }, { gems: 120 }, { gems: 300 },
];
const today = () => new Date().toISOString().slice(0, 10);

/** Can today's login gift be claimed? (for the red dot) */
export const loginGiftReady = () => player.loginDays < LOGIN_GIFTS.length && player.loginLast !== today();

registerPanel('events', {
  title: 'อีเวนต์',
  icon: 'event',
  tabs: [
    { id: 'login', label: 'ล็อกอิน 7 วัน' },
    { id: 'launch', label: 'เทศกาลเปิดตัว' },
  ],
  build(body, tab, ctx) {
    if (tab === 'launch') {
      body.append(
        h('div', { class: 'banner px-cut', style: `min-height:240px;${art('explore')}` },
          h('div', { class: 'orb' }, icon('trophy', 140)),
          h('div', { class: 'copy' },
            h('h3', { style: 'background:linear-gradient(180deg,#fff,#ffe7a3);-webkit-background-clip:text;background-clip:text' }, 'เทศกาลเปิดตัว Mythoria'),
            h('p', null, 'อีเวนต์ฉลองเปิดเซิร์ฟเวอร์ พร้อมของรางวัลพิเศษ'),
            h('span', { class: 'note' }, 'เร็วๆ นี้'))),
      );
      return;
    }
    const ready = loginGiftReady();
    body.append(
      h('p', { style: 'margin:0 0 12px;font-size:14px;color:var(--ui-dim)' }, 'เข้าเกมทุกวันเพื่อรับของขวัญ วันที่ 7 รับเพชรชุดใหญ่!'),
      h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(105px,1fr))' },
        LOGIN_GIFTS.map((g, i) => {
          const got = i < player.loginDays;
          const now = i === player.loginDays && ready;
          return h('div', {
            class: 'card px-cut',
            style: `${now ? 'box-shadow:inset 0 0 0 2px var(--ui-accent);cursor:pointer' : ''}${got ? ';opacity:.55' : ''}`,
            onclick: () => {
              if (!now) return;
              player.loginDays++;
              player.loginLast = today();
              giveReward(g);
              showRewards(rewardItems(g), `ของขวัญวันที่ ${i + 1}`);
              ctx.refresh();
            },
          },
            h('div', { class: 'ds' }, `วันที่ ${i + 1}`),
            h('div', { class: 'art', style: 'height:52px' }, icon(g.gems ? (i === 6 ? 'chest' : 'gem') : 'gold', 44)),
            h('div', { class: 'num', style: 'font-size:15px' }, fmt(g.gems ?? g.gold ?? 0)),
            h('div', { class: 'ds', style: `color:${got ? 'var(--ui-green)' : now ? 'var(--ui-accent)' : 'var(--ui-faint)'}` }, got ? 'รับแล้ว' : now ? 'แตะเพื่อรับ' : 'รอวันถัดไป'));
        })),
    );
  },
});

registerPanel('quests', {
  title: 'เควส',
  icon: 'quest',
  tabs: [
    { id: 'daily', label: 'รายวัน' },
    { id: 'weekly', label: 'รายสัปดาห์' },
    { id: 'story', label: 'เนื้อเรื่อง' },
    { id: 'achievement', label: 'ความสำเร็จ' },
  ],
  build(body, tab, ctx) {
    const qs = player.quests.filter((q) => q.group === tab);
    const row = (q: Quest) => {
      const done = q.progress >= q.goal;
      return h('div', { class: `item-row px-cut ${q.claimed ? 'dim' : ''}` },
        icon(done ? 'trophy' : 'quest', 36),
        h('div', { class: 'main' },
          h('div', { class: 'ttl' }, q.title),
          h('div', { style: 'display:flex;align-items:center;gap:10px' },
            h('div', { class: 'bar px-cut' }, h('i', { class: 'px-cut', style: `width:${(q.progress / q.goal) * 100}%` })),
            h('span', { class: 'num', style: 'font-size:12px;color:var(--ui-dim)' }, `${fmt(q.progress)}/${fmt(q.goal)}`))),
        rewardChips(q.reward),
        h('button', {
          class: `btn ${done && !q.claimed ? 'gold' : 'ghost'} px-cut`,
          disabled: !done || q.claimed,
          onclick: () => {
            q.claimed = true;
            giveReward(q.reward);
            showRewards(rewardItems(q.reward), 'เควสสำเร็จ!');
            changed();
            ctx.refresh();
          },
        }, q.claimed ? 'รับแล้ว' : done ? 'รับ' : 'กำลังทำ'));
    };
    body.append(qs.length ? h('div', { class: 'list' }, qs.map(row)) : h('div', { class: 'empty' }, icon('quest', 64), 'ไม่มีเควสในหมวดนี้'));
  },
});

const MODES = [
  { id: 'explore', name: 'สำรวจโลก', desc: 'เดินสำรวจทุ่งหญ้า ค้นหาสมบัติ', open: true },
  { id: 'story', name: 'เนื้อเรื่อง', desc: 'ออกเดินทางตามตำนานแห่ง Mythoria' },
  { id: 'arena', name: 'อารีน่า (PvP)', desc: 'ประลองทีมกับผู้เล่นคนอื่น' },
  { id: 'raid', name: 'บอสเรด', desc: 'ร่วมมือกันโค่นบอสยักษ์' },
  { id: 'dungeon', name: 'ดันเจี้ยน', desc: 'ลุยด่านเก็บวัตถุดิบอัปเกรด' },
];

registerPanel('modes', {
  title: 'โหมดเล่น',
  icon: 'battle',
  build(body, _tab, ctx) {
    body.append(
      h('div', { class: 'modes' },
        MODES.map((m) =>
          h('div', {
            class: `mode px-cut ${m.open ? 'featured' : 'locked'}`,
            style: art(m.id),
            onclick: () => (m.open ? ctx.close() : toast(`${m.name} — เร็วๆ นี้`)),
          },
            m.open ? h('span', { class: 'tag live' }, '● กำลังเล่น') : h('span', { class: 'tag' }, '🔒 เร็วๆ นี้'),
            h('div', { class: 'nm' }, m.name),
            h('div', { class: 'ds' }, m.desc),
            h('div', { class: 'cost' }, icon('energy', 18), m.open ? 'ฟรี' : 'ใช้พลังงาน'),
            m.open ? h('button', { class: 'btn gold px-cut go' }, 'ออกสำรวจ') : null),
        )),
    );
  },
});
