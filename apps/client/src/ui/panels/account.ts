import { fmt, h, icon, toast } from '../dom';
import { registerPanel } from '../Modal';
import { changed, giveReward, player, progressQuests } from '../store';
import { avatar, rewardChips } from './common';

registerPanel('profile', {
  title: 'โปรไฟล์',
  icon: 'heroes',
  narrow: true,
  build(body, _tab, ctx) {
    const nameInput = h('input', { class: 'field px-cut', value: player.name, maxlength: 16 });
    let editing = false;
    const nameRow = h('div', { style: 'display:flex;gap:8px;align-items:center' });
    const showName = () => {
      nameRow.replaceChildren(
        editing ? nameInput : h('div', { style: 'font-size:22px;font-weight:600' }, player.name),
        h('button', {
          class: 'btn ghost px-cut',
          onclick: () => {
            if (editing) {
              const v = nameInput.value.trim();
              if (v.length < 2) return toast('ชื่อต้องมีอย่างน้อย 2 ตัวอักษร');
              player.name = v;
              changed();
            }
            editing = !editing;
            showName();
            if (editing) nameInput.focus();
          },
        }, editing ? 'บันทึก' : 'เปลี่ยนชื่อ'),
      );
    };
    showName();
    const stat = (label: string, value: string, ico: string) =>
      h('div', { class: 'card px-cut', style: 'flex-direction:row;gap:10px;text-align:left;align-items:center' }, icon(ico, 32), h('div', null, h('div', { class: 'ds' }, label), h('div', { class: 'num', style: 'font-size:18px' }, value)));
    body.append(
      h('div', { style: 'display:flex;gap:18px;align-items:center;margin-bottom:16px' },
        avatar(96),
        h('div', { style: 'display:flex;flex-direction:column;gap:6px;min-width:0' },
          nameRow,
          h('div', { style: 'color:var(--ui-gold);font-size:13px' }, player.title),
          h('div', { class: 'note' }, 'UID ', h('span', { class: 'num', style: 'color:var(--ui-dim)' }, player.uid), ' ',
            h('button', { class: 'btn ghost px-cut', style: 'padding:2px 8px;font-size:11px', onclick: () => { navigator.clipboard?.writeText(player.uid); toast('คัดลอก UID แล้ว'); } }, 'คัดลอก')),
        ),
      ),
      h('div', { style: 'display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px' }, h('span', null, `เลเวล ${player.level}`), h('span', { class: 'num' }, `${player.exp} / ${player.expMax} EXP`)),
      h('div', { class: 'bar px-cut', style: 'width:100%;height:12px;margin-bottom:16px' }, h('i', { class: 'px-cut', style: `width:${(player.exp / player.expMax) * 100}%` })),
      h('div', { class: 'grid', style: 'grid-template-columns:repeat(2,1fr)' },
        stat('ฮีโร่', '0', 'heroes'),
        stat('ก้าวที่เดินทั้งหมด', fmt(player.steps), 'map'),
        stat('เพชร', fmt(player.gems), 'gem'),
        stat('ทอง', fmt(player.gold), 'gold'),
      ),
    );
    void ctx;
  },
});

registerPanel('settings', {
  title: 'ตั้งค่า',
  icon: 'settings',
  narrow: true,
  tabs: [
    { id: 'general', label: 'ทั่วไป' },
    { id: 'graphics', label: 'กราฟิก' },
    { id: 'about', label: 'เกี่ยวกับ' },
  ],
  build(body, tab, ctx) {
    const s = player.settings;
    const slider = (label: string, key: 'music' | 'sfx') => {
      const out = h('span', { class: 'num', style: 'width:34px;text-align:right' }, String(s[key]));
      return h('div', { class: 'setting' }, label,
        h('input', { type: 'range', min: 0, max: 100, value: s[key], oninput: (e: Event) => { s[key] = Number((e.target as HTMLInputElement).value); out.textContent = String(s[key]); changed(); } }),
        out);
    };
    const seg = <T extends string>(label: string, value: T, options: [T, string][], set: (v: T) => void) =>
      h('div', { class: 'setting' }, label,
        h('div', { class: 'seg' }, options.map(([v, l]) => h('button', { class: `px-cut ${v === value ? 'on' : ''}`, onclick: () => { set(v); changed(); ctx.refresh(); } }, l))),
        h('span'));
    if (tab === 'general') {
      body.append(
        slider('เพลง', 'music'),
        slider('เสียงประกอบ', 'sfx'),
        seg('ภาษา', s.language, [['th', 'ไทย'], ['en', 'English']], (v) => {
          if (v === 'en') return toast('ภาษาอังกฤษจะมาเร็วๆ นี้');
          s.language = v;
        }),
        h('p', { class: 'note' }, 'ยังไม่มีเสียงในเกม — ค่าที่ตั้งไว้จะถูกใช้เมื่อเพิ่มเพลงและเสียง'),
      );
    } else if (tab === 'graphics') {
      body.append(
        seg('เอฟเฟกต์', s.effects, [['high', 'สูง'], ['low', 'ประหยัด']], (v) => { s.effects = v; }),
        seg('แสดง FPS', s.showFps ? 'on' : 'off', [['on', 'เปิด'], ['off', 'ปิด']], (v) => { s.showFps = v === 'on'; }),
        h('p', { class: 'note' }, 'โหมดประหยัดจะลดเอฟเฟกต์เพื่อให้ลื่นขึ้นบนเครื่องรุ่นเก่า (มีผลหลังโหลดใหม่)'),
      );
    } else {
      body.append(
        h('div', { class: 'reader px-cut' },
          h('h3', null, 'Mythoria'),
          h('p', null, 'เวอร์ชัน 0.1 (Prototype)\nเกม RPG แฟนตาซี Turn-based ภาพ Pixel 2.5D เล่นบนเว็บ'),
          h('p', { class: 'note' }, 'ภาพแผนที่สร้างด้วย PixelLab • เอฟเฟกต์ pixelfx (MIT) • Phaser (MIT)'),
          h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
            h('a', { class: 'btn ghost px-cut', href: 'THIRD_PARTY_NOTICES.txt', target: '_blank', style: 'text-decoration:none' }, 'สัญญาอนุญาตซอฟต์แวร์'),
            h('button', {
              class: 'btn ghost px-cut',
              onclick: () => {
                if (!confirm('ล้างข้อมูลผู้เล่นที่เก็บไว้ในเครื่องนี้ทั้งหมด?')) return;
                try { localStorage.removeItem('mythoria.player.v1'); } catch { /* ignore */ }
                location.reload();
              },
            }, 'ล้างข้อมูลในเครื่อง'),
          ),
        ),
      );
    }
  },
});

const NEWS = [
  {
    title: 'ยินดีต้อนรับสู่ Mythoria',
    date: '8 พ.ย. 2026',
    body: 'นี่คือเวอร์ชันทดสอบช่วงแรก (Prototype)\n\nตอนนี้คุณสามารถเดินสำรวจทุ่งหญ้า ซากศาลเจ้า และบ่อน้ำได้ ระบบต่อสู้ turn-based ฮีโร่ และโหมดออนไลน์กำลังพัฒนาอยู่',
  },
  {
    title: 'อัปเดต v0.1 — ทุ่งหญ้าแห่งแรก',
    date: '8 พ.ย. 2026',
    body: '• แผนที่ทุ่งหญ้า: บ่อน้ำมีชีวิต ใบบัวลอย ซากศาลเจ้า ป่ารอบขอบ\n• แสงและเงาผูกกับด่าน เงาเมฆ ไฟกระถาง ผีเสื้อ\n• ตัวละครขยับลื่น มือลอย 8 ท่า\n• UI เกมชุดแรก',
  },
  {
    title: 'แผนการพัฒนา',
    date: '8 พ.ย. 2026',
    body: 'ต่อไป: ระบบต่อสู้ turn-based → ฮีโร่และซัมม่อน → เซิร์ฟเวอร์และบัญชีผู้เล่น → กิลด์ PvP บอสเรด',
  },
];

registerPanel('news', {
  title: 'ประกาศ',
  icon: 'announce',
  build(body) {
    let sel = 0;
    const list = h('div', { class: 'list' });
    const reader = h('div', { class: 'reader px-cut' });
    const draw = () => {
      list.replaceChildren(
        ...NEWS.map((n, i) =>
          h('div', { class: `item-row px-cut ${i === sel ? '' : 'dim'}`, style: 'cursor:pointer', onclick: () => { sel = i; draw(); } },
            h('div', { class: 'main' }, h('div', { class: 'ttl' }, n.title), h('div', { class: 'sub' }, n.date))),
        ),
      );
      const n = NEWS[sel];
      reader.replaceChildren(h('h3', null, n.title), h('div', { class: 'note' }, n.date), h('p', null, n.body));
    };
    draw();
    body.append(h('div', { class: 'split' }, list, reader));
  },
});

registerPanel('mail', {
  title: 'จดหมาย',
  icon: 'mail',
  build(body, _tab, ctx) {
    if (!player.mail.length) {
      body.append(h('div', { class: 'empty' }, icon('mail', 64), 'ไม่มีจดหมาย'));
      return;
    }
    let sel = 0;
    const list = h('div', { class: 'list' });
    const reader = h('div', { class: 'reader px-cut' });
    const draw = () => {
      const m = player.mail[sel];
      if (!m.read) {
        m.read = true;
        progressQuests('mail');
        changed();
      }
      list.replaceChildren(
        ...player.mail.map((x, i) =>
          h('div', { class: `item-row px-cut ${i === sel ? '' : 'dim'}`, style: 'cursor:pointer;position:relative', onclick: () => { sel = i; draw(); } },
            icon(x.gift && !x.claimed ? 'chest' : 'mail', 32),
            h('div', { class: 'main' }, h('div', { class: 'ttl' }, x.title), h('div', { class: 'sub' }, `${x.from} • ${x.date}`)),
            !x.read || (x.gift && !x.claimed) ? h('span', { class: 'badge', style: 'top:8px;right:8px' }) : null),
        ),
      );
      reader.replaceChildren(
        h('h3', null, m.title),
        h('div', { class: 'note' }, `จาก ${m.from} • ${m.date}`),
        h('p', null, m.body),
        m.gift
          ? h('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:6px' },
              rewardChips(m.gift),
              h('button', {
                class: 'btn gold px-cut',
                disabled: m.claimed,
                onclick: () => { m.claimed = true; toast(`ได้รับ ${giveReward(m.gift!)}`); draw(); },
              }, m.claimed ? 'รับแล้ว' : 'รับของ'))
          : '',
      );
    };
    draw();
    body.append(h('div', { class: 'split' }, list, reader));
    void ctx;
  },
});
