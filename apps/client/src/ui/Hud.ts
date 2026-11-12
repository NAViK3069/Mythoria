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
import { fmt, glyph, GLYPH_PLUS, h, icon, toast } from './dom';

/** The minimap's fold button's arrow (points up when open: "fold away"). */
const GLYPH_CHEVRON_UP = ['...##...', '..####..', '.##..##.', '##....##'];
const MM_FOLD_KEY = 'mythoria.minimap.folded';
import { frame, openPanel, registerPanel } from './Modal';
import { avatar } from './panels/common';
import { changed, claimableQuests, onChange, player, progressQuests, unreadMail } from './store';

export { uiBlocking } from './Modal';

/** An icon button with a label and an optional red dot. */
function iconButton(name: string, label: string, panel: string, cls = '', dot?: () => number | boolean): HTMLButtonElement {
  const badge = h('span', { class: 'badge' });
  const b = h('button', { class: `btn-ico ${cls}`, onclick: () => openPanel(panel), title: label || undefined, 'aria-label': label || panel },
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

/** A currency counter: the icon sits over the left end; the number rolls when it changes. */
function coin(name: string, value: () => number, text: (n: number) => string, onPlus: () => void): HTMLElement {
  const v = h('span', { class: 'v num' });
  const el = h('div', { class: `coin coin-${name}` },
    h('div', { class: 'plate px-cut' }, v, h('button', { class: 'plus px-cut', onclick: onPlus, 'aria-label': 'เติม', title: 'เติม' }, h('span', { class: 'px-cut' }, glyph(GLYPH_PLUS)))),
    icon(name, 32));
  let shown = value();
  let raf = 0;
  v.textContent = text(shown);
  onChange(() => {
    const target = value();
    if (target === shown) return;
    const from = shown;
    const t0 = performance.now();
    el.classList.remove('up', 'down');
    void el.offsetWidth;
    el.classList.add(target > from ? 'up' : 'down');
    cancelAnimationFrame(raf);
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 650);
      const e = 1 - (1 - k) ** 3;
      shown = k >= 1 ? target : Math.round(from + (target - from) * e);
      v.textContent = text(shown);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  return el;
}

/** What the world gives the HUD so it can draw the minimap. */
export interface MapInfo {
  /** A picture of the whole map. */
  image: HTMLCanvasElement;
  /** World size in px. */
  width: number;
  height: number;
  /** Where the story quest leads (shown until it is done). */
  quest?: { id: string; x: number; y: number };
  /** Warp pads. */
  warps?: { x: number; y: number }[];
  /** The map's name, and what kind of place it is (for the big map's note). */
  name?: string;
  sub?: string;
}

export interface Hud {
  /** The master took a step (feeds walking quests). */
  step(): void;
  /** The master reached a place a quest asks for. */
  reached(place: 'shrine'): void;
  /** Give the minimap its picture. */
  attachMap(info: MapInfo): void;
  /** How far (CSS px) the menus reach in from each edge of the screen, across its middle - what the
   * camera has to be able to look past at the edges of the map. */
  insets(): { top: number; bottom: number; left: number; right: number };
  /** Every frame: where the master is and what the camera sees (world px). */
  track(x: number, y: number, facing: 1 | -1, view: { x: number; y: number; width: number; height: number }): void;
  /** The big title when entering an area. */
  announceArea(name: string, sub?: string): void;
  /** Every frame: where the master's head is on screen (CSS px), for the name plate. */
  placeName(x: number, y: number): void;
  /** Hide the name plate (while the hero is mid-warp). */
  nameVisible(on: boolean): void;
}

// The latest map + position, shared with the full-map panel.
let mapInfo: MapInfo | null = null;
const me = { x: 0, y: 0, facing: 1 as 1 | -1 };

const questOpen = (id: string) => {
  const q = player.quests.find((x) => x.id === id);
  return !!q && q.progress < q.goal;
};

/** Markers (player, quest) over a map picture; positions in % so it works at any size. */
function mapLayer(info: MapInfo, cls: string) {
  const pic = info.image;
  const canvas = h('canvas', { class: 'mm-pic', width: pic.width, height: pic.height });
  canvas.getContext('2d')!.drawImage(pic, 0, 0);
  const view = h('div', { class: 'mm-view', style: 'display:none' });
  const quest = h('div', { class: 'mm-quest' }, icon('quest', 20));
  const dot = h('div', { class: 'mm-me' }, h('i'));
  const warps = (info.warps ?? []).map(() => h('div', { class: 'mm-warp', title: 'แท่นวาป' }, h('i')));
  const box = h('div', { class: `mm-map ${cls}` }, canvas, view, ...warps, quest, dot);
  box.style.aspectRatio = `${info.width} / ${info.height}`;
  const place = (el: HTMLElement, x: number, y: number) => {
    el.style.left = `${(x / info.width) * 100}%`;
    el.style.top = `${(y / info.height) * 100}%`;
  };
  if (info.quest) place(quest, info.quest.x, info.quest.y);
  (info.warps ?? []).forEach((w, i) => place(warps[i], w.x, w.y));
  return {
    box,
    update(v?: { x: number; y: number; width: number; height: number }) {
      place(dot, me.x, me.y);
      dot.classList.toggle('left', me.facing < 0);
      quest.style.display = info.quest && questOpen(info.quest.id) ? '' : 'none';
      if (v) {
        view.style.display = '';
        view.style.left = `${(v.x / info.width) * 100}%`;
        view.style.top = `${(v.y / info.height) * 100}%`;
        view.style.width = `${(v.width / info.width) * 100}%`;
        view.style.height = `${(v.height / info.height) * 100}%`;
      }
    },
  };
}

registerPanel('worldmap', {
  title: 'แผนที่',
  icon: 'map',
  build(body) {
    if (!mapInfo) {
      body.append(h('div', { class: 'empty' }, icon('map', 64), 'ยังไม่มีแผนที่'));
      return;
    }
    const layer = mapLayer(mapInfo, 'big');
    layer.update();
    body.classList.add('fit');
    body.append(
      h('div', { class: 'bigmap' },
        h('div', { class: 'bigmap-frame px-cut' }, layer.box),
        h('div', { class: 'legend' },
          h('span', null, h('i', { class: 'lg-me' }), 'ตำแหน่งของคุณ'),
          h('span', null, icon('quest', 18), 'จุดหมายเควส'),
          h('span', null, h('i', { class: 'lg-warp' }), 'แท่นวาป'),
          h('span', { class: 'note' }, [mapInfo.name, mapInfo.sub].filter(Boolean).join(' • ')))),
    );
  },
});

/** Builds the in-game HUD over the world. */
export function createHud(getFps: () => number): Hud {
  document.getElementById('ui')?.remove();
  const root = h('div', { id: 'ui' });
  document.body.appendChild(root);

  // ---- top left: profile + quest tracker
  const name = h('div', { class: 'name' });
  const lv = h('div', { class: 'lv num' });
  const exp = h('i', { class: 'px-cut' });
  const expText = h('span', { class: 'exp-t num' });
  const av = avatar(64);
  // the level sits at the front of its EXP bar (the bar runs out from behind it), not on the picture
  const profile = h('div', { class: 'profile', onclick: () => openPanel('profile'), role: 'button', 'aria-label': 'โปรไฟล์' },
    av,
    h('div', { class: 'who' }, name, h('div', { class: 'title' }, player.title), h('div', { class: 'exp-row' }, lv, h('div', { class: 'bar px-cut' }, exp), expText)));
  const trackText = h('div', { class: 'q' });
  const trackBar = h('i', { class: 'px-cut' });
  const trackKind = h('span', { class: 'kind' });
  const tracker = frame('tracker',
    h('div', { class: 'head' }, icon('quest', 18), trackKind, h('span', { class: 'chev' }, '›')),
    trackText,
    h('div', { class: 'bar thin px-cut' }, trackBar));
  tracker.addEventListener('click', () => openPanel('quests'));

  // ---- top right: wallet + system buttons, then the minimap and the side menu
  const wallet = h('div', { class: 'wallet' },
    coin('gold', () => player.gold, fmt, () => openPanel('shop', 'gold')),
    coin('gem', () => player.gems, fmt, () => openPanel('shop', 'gems')),
    coin('energy', () => player.energy, (n) => `${n}/${player.energyMax}`, () => openPanel('shop', 'featured')));
  const system = h('div', { class: 'row-icons' },
    iconButton('announce', '', 'news', 'small'),
    iconButton('mail', '', 'mail', 'small', unreadMail),
    iconButton('settings', '', 'settings', 'small'));

  const side = h('div', { class: 'hud-side' },
    iconButton('event', 'อีเวนต์', 'events', '', loginGiftReady),
    iconButton('quest', 'เควส', 'quests', '', claimableQuests),
    iconButton('shop', 'ร้านค้า', 'shop'),
    iconButton('summon', 'ซัมม่อน', 'summon', 'summon'));

  const mmSlot = h('div', { class: 'mm-slot' });
  const mmCoords = h('span', { class: 'num' });
  const mmName = h('b', null, 'ทุ่งหญ้า');
  // fold the map away (just its name strip stays) or open it again; remembered on this device
  const mmFold = h('button', { class: 'mm-fold', 'aria-label': 'พับแผนที่' }, glyph(GLYPH_CHEVRON_UP));
  const minimap = frame('minimap', mmSlot, h('div', { class: 'mm-label' }, mmName, mmCoords, mmFold));
  minimap.addEventListener('click', () => openPanel('worldmap'));
  minimap.title = 'เปิดแผนที่';
  const setFolded = (folded: boolean) => {
    minimap.classList.toggle('folded', folded);
    mmFold.setAttribute('aria-label', folded ? 'กางแผนที่' : 'พับแผนที่');
    mmFold.title = folded ? 'กางแผนที่' : 'พับแผนที่';
    try {
      localStorage.setItem(MM_FOLD_KEY, folded ? '1' : '0');
    } catch {
      /* storage blocked: it just won't be remembered */
    }
  };
  let startFolded = false;
  try {
    startFolded = localStorage.getItem(MM_FOLD_KEY) === '1';
  } catch {
    /* ignore */
  }
  setFolded(startFolded);
  mmFold.addEventListener('click', (e) => {
    e.stopPropagation(); // folding isn't opening the world map
    setFolded(!minimap.classList.contains('folded'));
  });
  let mm: ReturnType<typeof mapLayer> | null = null;

  // ---- bottom: chat preview, dock, play
  const chatText = h('div', { class: 't' });
  const chatPeek = frame('chat-peek', h('div', { class: 'ch-ico' }, icon('chat', 22)), chatText);
  chatPeek.addEventListener('click', () => openPanel('chat'));
  const dock = frame('dock',
    iconButton('bag', 'กระเป๋า', 'bag'),
    iconButton('team', 'ทีม', 'team'),
    iconButton('heroes', 'ฮีโร่', 'heroes'),
    iconButton('friends', 'เพื่อน', 'friends'),
    iconButton('guild', 'กิลด์', 'guild'),
    iconButton('chat', 'แชท', 'chat'));
  const play = h('button', { class: 'play', onclick: () => openPanel('modes'), title: 'โหมดเล่น', 'aria-label': 'โหมดเล่น' },
    h('div', { class: 'emblem' }, h('div', { class: 'ring' }), h('div', { class: 'core' }, icon('battle', 44))),
    h('div', { class: 'plate px-cut' },
      h('div', { class: 'txt' }, h('span', { class: 'big' }, 'โหมดเล่น'), h('span', { class: 'sub' }, 'ผจญภัย • PvP • บอสเรด'))));

  // name + level floating over the master (HTML, so Thai stays sharp at any zoom)
  const npLv = h('span', { class: 'np-lv num' });
  const npName = h('span', { class: 'np-name' });
  const nameplate = h('div', { class: 'nameplate' }, npLv, npName);

  const fps = h('div', { class: 'fps num' });
  const areaBanner = h('div', { class: 'area-banner' });

  root.append(
    nameplate,
    h('div', { class: 'hud-top-left' }, profile, tracker),
    h('div', { class: 'hud-top-right' }, h('div', { class: 'top-row' }, wallet, system), h('div', { class: 'mid-row' }, side, minimap)),
    h('div', { class: 'hud-bottom' }, chatPeek, dock, play),
    areaBanner,
    fps,
  );

  const KIND: Record<string, string> = { story: 'เควสหลัก', daily: 'เควสรายวัน', weekly: 'เควสรายสัปดาห์', achievement: 'ความสำเร็จ' };
  const update = () => {
    name.textContent = player.name;
    lv.textContent = `${player.level}`;
    npName.textContent = player.name;
    npLv.textContent = `Lv.${player.level}`;
    exp.style.width = `${(player.exp / player.expMax) * 100}%`;
    expText.textContent = `${player.exp}/${player.expMax}`;
    const q = player.quests.find((x) => x.group === 'story' && !x.claimed) ?? player.quests.find((x) => !x.claimed);
    const done = !!q && q.progress >= q.goal;
    tracker.classList.toggle('done', done);
    trackKind.textContent = q ? KIND[q.group] : 'เควส';
    trackBar.style.width = q ? `${(q.progress / q.goal) * 100}%` : '100%';
    trackText.replaceChildren(q ? q.title : 'ทำเควสครบแล้ว!', q ? h('span', { class: 'p num' }, done ? '✓ รับรางวัล' : `${fmt(q.progress)}/${fmt(q.goal)}`) : '');
    const last = player.chat[player.chat.length - 1];
    chatText.replaceChildren(last ? h('b', null, `[${last.from}] `) : '', last ? last.text : '');
    fps.style.display = player.settings.showFps ? '' : 'none';
    mm?.update();
  };
  update();
  onChange(update);
  setInterval(() => {
    if (player.settings.showFps) fps.textContent = `${Math.round(getFps())} FPS`;
  }, 500);

  // first visit: point at the welcome mail
  if (unreadMail()) setTimeout(() => toast('มีจดหมายใหม่ — ดูที่ไอคอนซองจดหมายมุมขวาบน'), 4200);

  let lastKey = '';
  let areaTimer = 0;
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
    insets() {
      const W = window.innerWidth, H = window.innerHeight;
      const out = { top: 0, bottom: 0, left: 0, right: 0 };
      for (const el of [profile, tracker, wallet, system, side, minimap, chatPeek, dock, play]) {
        // where layout puts it (not where it is mid-slide: the menus slide in when the HUD appears)
        let x = 0, y = 0;
        for (let e: HTMLElement | null = el; e && e !== root; e = e.offsetParent as HTMLElement | null) (x += e.offsetLeft), (y += e.offsetTop);
        const r = { left: x, top: y, right: x + el.offsetWidth, bottom: y + el.offsetHeight };
        if (r.right === r.left || r.bottom === r.top) continue;
        // in the middle of the top or bottom edge
        if (r.right > W * 0.3 && r.left < W * 0.7) {
          if (r.top < H / 2) out.top = Math.max(out.top, r.bottom);
          else out.bottom = Math.max(out.bottom, H - r.top);
        }
        // in the middle of the left or right edge
        if (r.bottom > H * 0.3 && r.top < H * 0.7) {
          if (r.left < W / 2) out.left = Math.max(out.left, r.right);
          else out.right = Math.max(out.right, W - r.left);
        }
      }
      return out;
    },
    attachMap(info) {
      mapInfo = info;
      if (info.name) mmName.textContent = info.name;
      mm = mapLayer(info, 'mini');
      mmSlot.replaceChildren(mm.box);
      mm.update();
    },
    track(x, y, facing, view) {
      me.x = x;
      me.y = y;
      me.facing = facing;
      if (!mm || !mapInfo) return;
      // only touch the DOM when something visible moved
      const key = `${Math.round(x / 2)},${Math.round(y / 2)},${facing},${Math.round(view.x / 2)},${Math.round(view.y / 2)},${Math.round(view.width)}`;
      if (key === lastKey) return;
      lastKey = key;
      mm.update(view);
      mmCoords.textContent = `${Math.round(x / 16)}, ${Math.round(y / 16)}`;
    },
    nameVisible(on) {
      nameplate.style.visibility = on ? '' : 'hidden';
    },
    placeName(x, y) {
      nameplate.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    },
    announceArea(title, sub = '') {
      mmName.textContent = title;
      areaBanner.replaceChildren(
        h('div', { class: 'ab-line' }),
        h('div', { class: 'ab-title' }, title),
        h('div', { class: 'ab-sub' }, sub),
        h('div', { class: 'ab-line' }));
      areaBanner.classList.remove('show');
      void areaBanner.offsetWidth;
      areaBanner.classList.add('show');
      clearTimeout(areaTimer);
      areaTimer = window.setTimeout(() => areaBanner.classList.remove('show'), 3800);
    },
  };
}
