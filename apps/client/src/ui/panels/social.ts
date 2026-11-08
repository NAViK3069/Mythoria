import { h, icon, toast } from '../dom';
import { registerPanel } from '../Modal';
import { changed, player, type ChatLine } from '../store';

// Friends, guilds and chat need the online server; until then they show their
// layout, and chat echoes locally.

const needsServer = () => toast('ต้องเชื่อมต่อเซิร์ฟเวอร์ (เปิดในเฟสออนไลน์)');

registerPanel('friends', {
  title: 'เพื่อน',
  icon: 'friends',
  narrow: true,
  tabs: [
    { id: 'list', label: 'เพื่อน' },
    { id: 'requests', label: 'คำขอ' },
    { id: 'add', label: 'เพิ่มเพื่อน' },
  ],
  build(body, tab) {
    if (tab === 'add') {
      const input = h('input', { class: 'field px-cut', placeholder: 'ใส่ UID ของเพื่อน', inputmode: 'numeric' });
      body.append(
        h('div', { style: 'display:flex;gap:8px' }, input, h('button', { class: 'btn px-cut', onclick: needsServer }, 'ค้นหา')),
        h('p', { class: 'note', style: 'margin-top:12px' }, 'UID ของคุณ: ', h('span', { class: 'num', style: 'color:var(--ui-ink)' }, player.uid)),
      );
      return;
    }
    body.append(
      h('div', { class: 'empty' }, icon('friends', 64), tab === 'list' ? 'ยังไม่มีเพื่อน' : 'ไม่มีคำขอเป็นเพื่อน',
        h('div', { class: 'note' }, 'เพิ่มเพื่อนด้วย UID เมื่อเปิดระบบออนไลน์')),
    );
  },
});

registerPanel('guild', {
  title: 'กิลด์',
  icon: 'guild',
  tabs: [
    { id: 'join', label: 'ค้นหากิลด์' },
    { id: 'create', label: 'สร้างกิลด์' },
  ],
  build(body, tab) {
    if (tab === 'create') {
      const name = h('input', { class: 'field px-cut', placeholder: 'ชื่อกิลด์', maxlength: 20 });
      const motto = h('input', { class: 'field px-cut', placeholder: 'คำขวัญกิลด์', maxlength: 60 });
      body.append(
        h('div', { style: 'display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap' },
          h('div', { class: 'card px-cut', style: 'width:120px' }, icon('guild', 64), h('div', { class: 'ds' }, 'ตราสัญลักษณ์')),
          h('div', { style: 'flex:1;min-width:220px;display:flex;flex-direction:column;gap:10px' },
            name, motto,
            h('button', { class: 'btn gold px-cut', onclick: needsServer }, 'สร้างกิลด์ ', icon('gem', 20), h('span', { class: 'num' }, '500')))),
      );
      return;
    }
    const q = h('input', { class: 'field px-cut', placeholder: 'ชื่อหรือรหัสกิลด์', style: 'flex:1' });
    body.append(
      h('div', { style: 'display:flex;gap:8px' }, q, h('button', { class: 'btn px-cut', onclick: needsServer }, 'ค้นหา')),
      h('div', { class: 'empty' }, icon('guild', 64), 'ยังไม่มีกิลด์ในเซิร์ฟเวอร์',
        h('div', { class: 'note' }, 'ระบบกิลด์ (แชทกิลด์ ภารกิจกิลด์ บอสกิลด์) จะเปิดพร้อมเซิร์ฟเวอร์ออนไลน์')),
    );
  },
});

const CHANNELS: { id: ChatLine['channel']; label: string }[] = [
  { id: 'world', label: 'โลก' },
  { id: 'guild', label: 'กิลด์' },
  { id: 'private', label: 'ส่วนตัว' },
  { id: 'system', label: 'ระบบ' },
];

registerPanel('chat', {
  title: 'แชท',
  icon: 'chat',
  narrow: true,
  tabs: CHANNELS,
  build(body, tab, ctx) {
    const channel = tab as ChatLine['channel'];
    const lines = player.chat.filter((c) => c.channel === channel || c.channel === 'system');
    const log = h('div', { class: 'log' },
      lines.length
        ? lines.map((c) => h('div', { class: `msg ${c.channel === 'system' ? 'sys' : ''}` }, h('b', null, c.from), c.text))
        : h('div', { class: 'note' }, 'ยังไม่มีข้อความ'));
    const input = h('input', { class: 'field px-cut', placeholder: channel === 'system' ? 'ช่องระบบส่งข้อความไม่ได้' : 'พิมพ์ข้อความ...', maxlength: 120, disabled: channel === 'system' });
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      if (channel === 'guild') return toast('คุณยังไม่ได้อยู่ในกิลด์');
      player.chat.push({ channel, from: player.name, text, time: Date.now() });
      if (player.chat.length > 100) player.chat.splice(0, player.chat.length - 100);
      changed();
      ctx.refresh();
      setTimeout(() => (body.querySelector('input') as HTMLInputElement | null)?.focus(), 0);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') send();
    });
    body.style.display = 'flex';
    body.append(
      h('div', { class: 'chat', style: 'flex:1' },
        log,
        h('div', { class: 'send' }, input, h('button', { class: 'btn px-cut', onclick: send, disabled: channel === 'system' }, 'ส่ง')),
        h('div', { class: 'note' }, 'ตอนนี้ข้อความแสดงเฉพาะในเครื่องของคุณ — แชทออนไลน์จะเปิดพร้อมเซิร์ฟเวอร์')),
    );
    requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
  },
});
