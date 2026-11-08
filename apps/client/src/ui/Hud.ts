import '@fontsource/kanit/400.css';
import '@fontsource/kanit/500.css';
import '@fontsource/kanit/600.css';
import '@fontsource/kanit/700.css';
import './ui.css';
import './panels/account';
import './panels/items';
import './panels/heroes';
import './panels/social';
import { loginGiftReady } from './panels/play';
import { fmt, h, icon, toast } from './dom';
import { frame, openPanel } from './Modal';
import { avatar } from './panels/common';
import { changed, claimableQuests, onChange, player, progressQuests, unreadMail } from './store';

export { uiBlocking } from './Modal';

/** An icon button with a label and an optional red dot. */
function iconButton(name: string, label: string, panel: string, cls = '', dot?: () => number | boolean): HTMLButtonElement {
  const badge = h('span', { class: 'badge' });
  const b = h('button', { class: `btn-ico ${cls}`, onclick: () => openPanel(panel), title: label },
    h('div', { class: 'tile px-cut' }, h('span', { class: 'px-cut' }, icon(name, cls.includes('summon') ? 40 : 32))),
    label ? h('span', { class: 'lbl' }, label) : null,
    badge);
  const update = () => {
    const v = dot?.();
    badge.style.display = v ? '' : 'none';
    badge.textContent = typeof v === 'number' && v > 1 ? String(v) : '';
  };
  update();
  onChange(update);
  return b;
}

function coin(name: string, value: () => string, onPlus: () => void): HTMLElement {
  const v = h('span', { class: 'v num' });
  const el = h('div', { class: 'coin px-cut' }, icon(name, 30), v, h('button', { class: 'plus px-cut', onclick: onPlus, 'aria-label': 'เติม' }, '+'));
  const update = () => (v.textContent = value());
  update();
  onChange(update);
  return el;
}

export interface Hud {
  /** The master took a step (feeds walking quests). */
  step(): void;
  /** The master reached a place a quest asks for. */
  reached(place: 'shrine'): void;
}

/** Builds the in-game HUD over the world. */
export function createHud(getFps: () => number): Hud {
  document.getElementById('hud')?.remove();
  const root = h('div', { id: 'ui' });
  document.body.appendChild(root);

  // ---- top left: profile + quest tracker
  const name = h('div', { class: 'name' });
  const lv = h('div', { class: 'lv num' });
  const exp = h('i', { class: 'px-cut' });
  const av = avatar(58);
  av.appendChild(lv);
  const profile = h('div', { class: 'profile', onclick: () => openPanel('profile') },
    av,
    h('div', { class: 'who' }, name, h('div', { class: 'title' }, player.title), h('div', { class: 'bar px-cut' }, exp)));
  const trackText = h('div', { class: 'q' });
  const tracker = frame('tracker', h('div', { class: 'head' }, icon('quest', 18), 'เควสปัจจุบัน'), trackText);
  tracker.addEventListener('click', () => openPanel('quests'));

  // ---- top right: wallet + system buttons
  const wallet = h('div', { class: 'wallet' },
    coin('gold', () => fmt(player.gold), () => openPanel('shop', 'gold')),
    coin('gem', () => fmt(player.gems), () => openPanel('shop', 'gems')),
    coin('energy', () => `${player.energy}/${player.energyMax}`, () => openPanel('shop', 'featured')));
  const system = h('div', { class: 'row-icons' },
    iconButton('announce', '', 'news', 'small'),
    iconButton('mail', '', 'mail', 'small', unreadMail),
    iconButton('settings', '', 'settings', 'small'));

  // ---- right side: event, shop, summon
  const side = h('div', { class: 'hud-right' },
    iconButton('event', 'อีเวนต์', 'events', '', loginGiftReady),
    iconButton('quest', 'เควส', 'quests', '', claimableQuests),
    iconButton('shop', 'ร้านค้า', 'shop'),
    iconButton('summon', 'ซัมม่อน', 'summon', 'summon'));

  // ---- bottom: chat preview, dock, play
  const chatText = h('div', { class: 't' });
  const chatPeek = frame('chat-peek', icon('chat', 24), chatText);
  chatPeek.addEventListener('click', () => openPanel('chat'));
  const dock = frame('dock',
    iconButton('bag', 'กระเป๋า', 'bag'),
    iconButton('team', 'ทีม', 'team'),
    iconButton('heroes', 'ฮีโร่', 'heroes'),
    iconButton('friends', 'เพื่อน', 'friends'),
    iconButton('guild', 'กิลด์', 'guild'),
    iconButton('chat', 'แชท', 'chat'));
  const play = h('button', { class: 'play', onclick: () => openPanel('modes') },
    frame('', icon('battle', 40), h('div', { class: 'txt' }, h('span', { class: 'big' }, 'โหมดเล่น'), h('span', { class: 'sub' }, 'ผจญภัย • PvP • บอสเรด'))));

  const fps = h('div', { class: 'fps num' });

  root.append(
    h('div', { class: 'hud-top-left' }, profile, tracker),
    h('div', { class: 'hud-top-right' }, system, wallet),
    side,
    h('div', { class: 'hud-bottom' }, chatPeek, dock, play),
    fps,
  );

  const update = () => {
    name.textContent = player.name;
    lv.textContent = `Lv.${player.level}`;
    exp.style.width = `${(player.exp / player.expMax) * 100}%`;
    const q = player.quests.find((x) => x.group === 'story' && !x.claimed) ?? player.quests.find((x) => !x.claimed);
    tracker.classList.toggle('done', !!q && q.progress >= q.goal);
    trackText.replaceChildren(q ? q.title : 'ทำเควสครบแล้ว!', q ? h('span', { class: 'p num' }, q.progress >= q.goal ? '✓ รับรางวัล' : `${fmt(q.progress)}/${fmt(q.goal)}`) : '');
    const last = player.chat[player.chat.length - 1];
    chatText.replaceChildren(last ? h('b', null, `[${last.from}] `) : '', last ? last.text : '');
    fps.style.display = player.settings.showFps ? '' : 'none';
  };
  update();
  onChange(update);
  setInterval(() => {
    if (player.settings.showFps) fps.textContent = `${Math.round(getFps())} FPS`;
  }, 500);

  // first visit: point at the welcome mail
  if (unreadMail()) setTimeout(() => toast('มีจดหมายใหม่ — ดูที่ไอคอนซองจดหมายมุมขวาบน'), 1200);

  return {
    step() {
      player.steps++;
      progressQuests('steps');
      changed();
    },
    reached(place) {
      const q = player.quests.find((x) => x.id === 's-shrine');
      if (place !== 'shrine' || !q || q.progress >= q.goal) return;
      progressQuests('shrine');
      changed();
      toast('เควสสำเร็จ: ไปถึงซากศาลเจ้าแล้ว!');
    },
  };
}
