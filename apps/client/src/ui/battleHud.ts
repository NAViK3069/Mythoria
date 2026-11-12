import { CLASSES, ELEMENTS, RARITIES, heroById, monsterById } from '@mythoria/game-data';
import { Surface } from '../fx/surface';
import { UltCut, ULT_CUT_DURATION } from '../fx/effects/ultCut';
import { ENERGY_MAX, RESERVE_COOLDOWN, TURN_LIMIT, previewLoss, type ActionName, type ActionPreview, type Battle, type SkillDef, type Unit } from '@mythoria/combat';
import { LOOKS, textCanvas, type TextLook } from '../fx/pixelFont';
import { CRYSTAL_SM, elementIcon, FAST, GEAR, HEART, HEART_BIG, STAR, STAR_OFF, statusIcon, type Icon } from '../fx/pixelIcons';
import { player } from './store';
import { h } from './dom';
import { glowUrl, iconUrl, installKit, rarityWindow, starUrl } from './pixelKit';
import { BAR_LOOKS, PixelBar } from './pixelBar';
import { EnergyGauge } from './energyGauge';
import { pageClock, PREVIEW_BLINK } from '../fx/effects/battlePops';
import { TeamBar } from './teamBar';
import { Swirl } from './pixelSwirl';
import './battle.css';

// The battle's screen - pixel art on ONE pixel grid: every frame, icon and number is drawn by our own code
// (ui/pixelKit.ts frames, fx/pixelIcons.ts icons, fx/pixelFont.ts numbers) and shown at --p CSS px per pixel
// (a whole number picked from the screen size), pictures at whole multiples of their own size - nothing is
// stretched or squeezed. Each part has its own shape:
//   top left      the turn in a gold octagon; under it the turn order as chips (the next one big, gold)
//   top middle    both teams' HP as parallelogram bars leaning away from the VS crest, the numbers on plates
//   top right     settings / AUTO / speed as small steel buttons
//   bottom left   whoever's turn it is: its picture in a window, a ribbon, name, LV, element, HP, statuses
//   bottom right  the team's energy crystals over its three moves (a steel square for the basic attack, gold
//                 octagons for the skills; key, cost, name on each)
// The fighters' own HP bars, status icons and every number off a hit are drawn on the field itself
// (fx/BattleLayer.ts, by world/BattleStage.ts) - here only invisible buttons over them to tap a target.

const STATUS_LABEL: Record<string, string> = {
  stun: 'มึนงง', silence: 'ห้ามสกิล', atkDown: 'โจมตี↓', speedDown: 'สปีด↓', evadeDown: 'หลบ↓', skillEvadeDown: 'หลบสกิล↓',
  skillResDown: 'ต้าน↓', healBlock: 'ห้ามฮีล', critDown: 'คริ↓', critDmgDown: 'แรงคริ↓', hitDown: 'แม่น↓', skillHitDown: 'แม่นสกิล↓',
  vulnerable: 'เปราะบาง', sealCleanse: 'ผนึก', elementShift: 'เปลี่ยนธาตุ', poison: 'พิษ', burn: 'ไฟไหม้', bleed: 'เลือดไหล',
  atkUp: 'โจมตี↑', regen: 'ฟื้นฟู', shield: 'โล่', barrier: 'อมตะ', evadeUp: 'หลบ↑', skillEvadeUp: 'หลบสกิล↑', skillResUp: 'ต้าน↑',
  speedUp: 'สปีด↑', critDmgUp: 'แรงคริ↑', critUp: 'คริ↑', hitUp: 'แม่น↑', skillHitUp: 'แม่นสกิล↑', toughUp: 'ทนทาน',
  skillDmgResUp: 'ต้านสกิล↑', taunt: 'ยั่วยุ',
};
export const GOOD_STATUS = new Set(['atkUp', 'regen', 'shield', 'barrier', 'evadeUp', 'skillEvadeUp', 'skillResUp', 'speedUp', 'critDmgUp', 'critUp', 'hitUp', 'skillHitUp', 'toughUp', 'skillDmgResUp', 'taunt']);
export const statusLabel = (t: string) => STATUS_LABEL[t] ?? t;

const AREA_LABEL: Record<string, string> = {
  single_front: 'เดี่ยว · แถวหน้า', single_any: 'เดี่ยว · ตัวใดก็ได้', row: 'ทั้งแถว · แถวหน้า', row_any: 'ทั้งแถว · เลือกแถว',
  all: 'ศัตรูทั้งหมด', self: 'ตัวเอง', own_row: 'แถวตัวเอง', ally_single: 'เพื่อน 1 ตัว', ally_all: 'เพื่อนทั้งทีม',
};
/** What a heal / shield is worked out from, as a hover card says it. */
const SCALE_LABEL: Record<string, string> = { targetHp: 'เลือดสูงสุดของเป้า', casterHp: 'เลือดสูงสุดของผู้ใช้', casterAtk: 'พลังโจมตีของผู้ใช้' };
/** A move's effects, one line each, for its hover card. */
function effectLines(sk: SkillDef): string[] {
  return sk.effects.map((e) => {
    const turns = e.turns ? ` ${e.turns} เทิร์น` : '';
    const of = SCALE_LABEL[e.scale ?? 'targetHp'];
    switch (e.type) {
      case 'damage': return `ดาเมจ ${e.pct}% ของพลังโจมตี${e.pierce ? ` (ทะลุโล่ ${e.pierce}%)` : ''}`;
      case 'trueDamage': return `ดาเมจจริง ${e.pct}% ของพลังโจมตี (ไม่สนเกราะ)`;
      case 'damageHp': return `ดาเมจ ${e.pct}% ของเลือดเป้า`;
      case 'heal': return `ฮีล ${e.pct}% ของ${of}`;
      case 'regen': return `ฟื้นฟู ${e.pct}% ของ${of} ทุกเทิร์น${turns}`;
      case 'shield': return `โล่ ${e.pct}% ของ${of}${turns}`;
      case 'lifesteal': return `ดูดเลือด ${e.pct}% ของดาเมจ`;
      case 'actionAdvance': return `ดันลำดับเทิร์นขึ้น ${e.pct}%`;
      case 'energyGain': return `พลังงานทีม +${e.amount ?? 1}`;
      case 'cleanse': return 'ล้างผลด้านลบ';
      case 'dispelBuffs': return 'ลบผลด้านบวกของเป้า';
      case 'breakInvincible': return 'ทะลุอมตะ';
      case 'turnBurn': return `ผลต่อเนื่องทำงานทันที ${e.amount ?? 1} ครั้ง`;
      case 'selfHpCost': return `เสียเลือดตัวเอง ${e.pct}%`;
      case 'selfVulnerable': return `ตัวเองรับดาเมจเพิ่ม ${e.pct}%${turns}`;
      default: return `${statusLabel(e.type)}${e.pct ? ` ${e.pct}%` : ''}${turns}`;
    }
  });
}
const num = (n: number) => Math.round(n).toLocaleString('en-US');
/** How long a finger is held on a fighter or a move before its card shows (touch screens). */
const LONG_PRESS_MS = 420;

const KEYS: Record<ActionName, string> = { attack: 'Z', skill1: 'X', skill2: 'C', ult: 'R' };
/** The dock's tiles, as the owner laid them out (ui/battle.css places each on the grid). */
const DOCK_TILES = ['prof', 'stars', 'st', 'hp', 'nm', 'basic', 'en', 's1', 's2', 'ult', 'p1', 'k1', 'p2', 'k2'] as const;
type DockTile = (typeof DOCK_TILES)[number];

/** The keys that call in the special team's first and second. */
/** The special team's skills, in order: the first one's skill 1 and 2, the second one's skill 1 and 2. */
const ASSIST_KEYS = ['V', 'B', 'N', 'M'];
const ASSIST_SLOTS = [['p1', 0, 'skill1'], ['k1', 0, 'skill2'], ['p2', 1, 'skill1'], ['k2', 1, 'skill2']] as const;
const rgb = (hex: string) => parseInt(hex.replace('#', ''), 16);

/** A number or a short shout in our pixel font, at the HUD's pixel size (size 2: double). */
const px = (text: string, look: TextLook = LOOKS.ui, size = 1, bold = false, cls = '') => textCanvas(text, look, { size, bold, className: cls });

/** An icon as an <img> at the HUD's pixel size (k: whole multiple). */
const icons = new Map<Icon, { url: string; w: number; h: number }>();
function ico(icon: Icon, cls = '', k = 1): HTMLImageElement {
  let u = icons.get(icon);
  if (!u) icons.set(icon, (u = iconUrl(icon)));
  const img = h('img', { class: `pxi ${cls}`, src: u.url, alt: '', draggable: false });
  img.style.width = `calc(var(--p) * ${u.w * k})`;
  img.style.height = `calc(var(--p) * ${u.h * k})`;
  return img;
}

/** A picture shown at a whole multiple (k) of its own size, once it has loaded. */
function sized<T extends HTMLElement>(el: T, k = 1): T {
  const img = el instanceof HTMLImageElement ? el : el.querySelector('img');
  if (!img) return el;
  const set = () => {
    img.style.width = `calc(var(--p) * ${img.naturalWidth * k})`;
    img.style.height = `calc(var(--p) * ${img.naturalHeight * k})`;
  };
  if (img.complete && img.naturalWidth) set();
  else img.addEventListener('load', set, { once: true });
  img.classList.add('pxi');
  return el;
}

/**
 * A picture (or the <img> in it) set in its window by what's drawn on it: its drawn part centred in the 40 x 40
 * inside, at its own size (whole pixels) - so a hero stands in the middle of its frame, not wherever its canvas
 * puts it. The drawn box is measured once per picture.
 */
const drawnBox = new Map<string, { x: number; y: number; w: number; h: number }>();
function centred<T extends HTMLElement>(el: T, inside = 40): T {
  const img = el instanceof HTMLImageElement ? el : el.querySelector('img');
  if (!img) return el;
  img.classList.add('pxi', 'bd-figimg');
  const place = () => {
    let box = drawnBox.get(img.src);
    if (!box) {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++)
          if (d[(y * c.width + x) * 4 + 3] > 8) (x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x), y1 = Math.max(y1, y));
      box = x1 < 0 ? { x: 0, y: 0, w: c.width, h: c.height } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      drawnBox.set(img.src, box);
    }
    img.style.width = `calc(var(--p) * ${img.naturalWidth})`;
    img.style.height = `calc(var(--p) * ${img.naturalHeight})`;
    // a tall figure keeps its feet in: its top is cut instead
    const top = box.h > inside ? inside - (box.y + box.h) : Math.round((inside - box.h) / 2) - box.y;
    img.style.left = `calc(var(--p) * ${Math.round((inside - box.w) / 2) - box.x})`;
    img.style.top = `calc(var(--p) * ${top})`;
  };
  if (img.complete && img.naturalWidth) place();
  else img.addEventListener('load', place, { once: true });
  return el;
}

/**
 * The HUD's pixel size in CSS px: always a whole number of the screen's REAL pixels (with Windows display scaling
 * at 125 % a CSS px is 1.25 real ones, so 3 CSS px would be 3.75 - pixels of uneven widths, smeared edges).
 * At least about 2 CSS px, and about a 440 x 250 grid's worth of the screen.
 */
export function pixelSize(): number {
  const dpr = window.devicePixelRatio || 1;
  const real = baseReal(dpr);
  // a phone held upright: the dock is 4 tiles of 48 across (about 207 pixels) - fit them
  if (narrowScreen()) return Math.max(2, Math.min(real, Math.floor((window.innerWidth * dpr) / 207))) / dpr;
  // a landscape screen: the whole bottom row (the dock and the special team, about 560 pixels) fits across
  return Math.max(Math.min(real, 2), Math.min(real, Math.floor((window.innerWidth * dpr) / 560))) / dpr;
}

/** Real screen pixels per pixel, before a phone's width is taken into account. */
function baseReal(dpr: number): number {
  const fit = Math.floor(Math.min((window.innerWidth * dpr) / 440, (window.innerHeight * dpr) / 250));
  return Math.max(1, Math.round(2 * dpr), Math.min(fit, Math.round(4 * dpr)));
}

/** A phone held upright (or a very small screen): the card and the moves stack along the bottom. */
export function narrowScreen(): boolean {
  const dpr = window.devicePixelRatio || 1;
  const wide = window.innerWidth / (baseReal(dpr) / dpr);
  return wide < 300 || (wide < 520 && window.innerHeight > window.innerWidth);
}

/** How much of the screen the HUD keeps along the top and the bottom (CSS px) - the field fits between. */
/** The HP and energy bars' length in pixels: their tile's width (one 96 px column; on a phone three 48s and two gaps). */
const BAR_W = { wide: 92, narrow: 146 };
const BAR_CELLS = 10;

/**
 * The preview's blinking pieces on a card (the HP it would lose / heal, the statuses it would put on) start
 * their CSS animation when they're made; set each one back to where the page clock is in the cycle, so the card
 * blinks in step with the fighters' bars on the field (battlePops previewPulse) - and with itself when redrawn.
 */
function syncBlinks(root: HTMLElement): void {
  const delay = `${-(pageClock() % (PREVIEW_BLINK * 2))}s`;
  root.querySelectorAll<HTMLElement>('.tp-hp b, .tp-hp em, .tp-hp u.more, .tp-si.new').forEach((e) => (e.style.animationDelay = delay));
}

export function hudReserve(): { top: number; bottom: number } {
  const p = pixelSize();
  return narrowScreen() ? { top: p * 96, bottom: p * 181 } : { top: p * 30, bottom: p * 76 };
}

/** A hover card's contents and its frame (the team's colour, or gold for a move). */
interface TipBody {
  kind: 'Ally' | 'Foe' | 'Skill';
  body: HTMLElement[];
}

export interface UnitView {
  /** Where its feet and its top are on screen (CSS px). */
  feet: { x: number; y: number };
  top: number;
  /** Half its width on screen (for the tap area). */
  half: number;
  /** CSS px per world px. */
  k: number;
}

export interface HudHooks {
  /** A unit's picture (an <img>): a hero's face, a monster's first frame. */
  portrait(u: Unit): HTMLElement;
  /** A unit standing (its card): a hero with its weapon, a monster. */
  figure(u: Unit): HTMLElement;
  /** A move's icon (an <img>, 32 px). */
  moveIcon(u: Unit, action: ActionName): HTMLElement;
  flee(): void;
}

/** What the player chose: a move of the one whose turn it is, or `caster` - the special team's one it calls in. */
export interface Choice {
  action: ActionName;
  target: Unit;
  caster?: Unit;
}

export class BattleHud {
  readonly root: HTMLElement;
  private readonly turnEl: HTMLElement;
  private readonly rail: HTMLElement;
  private readonly teams: { box: HTMLElement; bar: TeamBar; num: HTMLElement; count: HTMLElement }[] = [];
  /** The dock along the bottom (the owner's layout) and its tiles, each in its own place on the grid. */
  private readonly dock: HTMLElement;
  private readonly tile: Record<DockTile, HTMLElement>;
  private readonly assistBox: HTMLElement;
  /** The card's HP bar and the team's energy bar - kept, so a change plays out on them. */
  // HP and energy: the same length, the whole tile, ten cells of 10 % each
  private readonly hpBar = new PixelBar({ ...BAR_LOOKS.ally, icon: HEART_BIG }, BAR_W.wide, 12, BAR_CELLS);
  private readonly enBar = new EnergyGauge(BAR_W.wide, 12, BAR_CELLS);
  private cardUid = '';
  /** The hover card (PC only): a fighter's info, or what a move does - and what it is showing now. */
  private readonly tip = h('div', { class: 'bt-tip' });
  private readonly hoverable = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  private tipOn: { el: HTMLElement; make: () => TipBody | null; place: 'side' | 'above' } | null = null;
  /** A long press (touch): its timer, and whether it showed a card (then the tap it ends with is swallowed). */
  private pressTimer = 0;
  private pressShown = false;
  /** The hero on the card: whoever's turn it is on ours; on the enemy's, the last of ours (their cards aren't shown). */
  private cardUnit: Unit | null = null;
  private readonly autoBtn: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;
  private readonly menu: HTMLElement;
  private readonly units = new Map<string, { el: HTMLElement; hit: HTMLButtonElement }>();
  /** HP and shield as shown (they change when a hit lands on screen, not when the battle works it out). */
  readonly shown = new Map<string, { hp: number; shield: number }>();
  /** What the aimed move would do to each fighter (fractions of its bar) - the field's bars blink it. */
  readonly previews = new Map<string, { from: number; to: number; heal: boolean }>();
  /** Who can be picked now, and who the pointer is on. */
  readonly targets = new Set<string>();
  hover: string | null = null;
  auto = false;
  fast = false;
  private now: Unit | null = null;
  private lastEnergy = -1;
  private picking: { actor: Unit; action: ActionName; caster: Unit | null; resolve: (p: Choice) => void } | null = null;
  /** The turn order's chips, by unit and how many times it's in the list (so a chip moves rather than redraws). */
  private railChips = new Map<string, HTMLElement>();
  private keys = (e: KeyboardEvent) => this.onKey(e);
  private resize = () => this.scale();

  constructor(private readonly battle: Battle, private readonly hooks: HudHooks) {
    this.turnEl = h('div', { class: 'bt-turn k-badge' });
    this.rail = h('div', { class: 'bt-rail' });
    const team = (t: 0 | 1) => {
      const fill = h('i', { class: 'bt-fill' }), trail = h('i', { class: 'bt-trail' }), num = h('div', { class: 'bt-num k-plate' }), count = h('div', { class: 'bt-count' });
      const rise = h('i', { class: 'bt-rise' }), head = h('i', { class: 'bt-head' });
      const track = h('div', { class: 'bt-track' }, trail, fill, rise, head);
      const box = h('div', { class: `bt-team ${t ? 'foe' : 'ally'}` },
        h('div', { class: `bt-bar ${t ? 'k-barFoe' : 'k-barAlly'}` }, track),
        h('div', { class: 'bt-sub' }, num, count));
      // animated like the fighter's own HP bar (teamBar.ts)
      this.teams[t] = { box, bar: new TeamBar(box, track, rise, head), num, count };
      return box;
    };
    const vs = h('div', { class: 'bt-vs' }, sized(h('img', { src: 'assets/ui/battle/vs.png', alt: '', draggable: false })), px('VS', LOOKS.gold, 2));
    this.tile = Object.fromEntries(DOCK_TILES.map((t) => [t, h('div', { class: `bd-${t}` })])) as unknown as Record<DockTile, HTMLElement>;
    // the owner's layout: the main dock (picture + stars | statuses, HP, name / element | basic attack | energy
    // over skills 1 and 2) bottom left, the special team (each one's picture + its skill 1) bottom right
    const assist = new Set<DockTile>(['p1', 'k1', 'p2', 'k2']);
    this.dock = h('div', { class: 'bt-dock' }, ...DOCK_TILES.filter((t) => !assist.has(t)).map((t) => this.tile[t]));
    // each of the special team on its own dark plate - its picture and its skill together, so it reads as one
    this.assistBox = h('div', { class: 'bt-assist' }, ...DOCK_TILES.filter((t) => assist.has(t)).map((t) => this.tile[t]));
    // hover cards (PC): the card's picture - the hero; each move - what it does; the special team's
    this.hoverCard(this.tile.prof, () => (this.cardUnit ? this.unitTip(this.cardUnit) : null), 'above');
    for (const [t, k] of [['basic', 'attack'], ['s1', 'skill1'], ['s2', 'skill2'], ['ult', 'ult']] as const)
      this.hoverCard(this.tile[t], () => (this.cardUnit ? this.skillTip(this.cardUnit, k) : null), 'above');
    for (const [t, i, k] of ASSIST_SLOTS)
      this.hoverCard(this.tile[t], () => (this.battle.reserves[0][i] ? this.skillTip(this.battle.reserves[0][i], k, true) : null), 'above');
    const btn = (label: string, child: Node, on: () => void) => h('button', { class: 'bt-btn k-btn', onclick: on, title: label, 'aria-label': label }, child);
    this.autoBtn = btn('ออโต้ (A)', px('AUTO'), () => this.setAuto(!this.auto));
    this.speedBtn = btn('ความเร็ว', h('span', { class: 'bt-speed' }, ico(FAST), px('x1')), () => this.setFast(!this.fast));
    this.menu = h('div', { class: 'bt-menu k-panel' },
      h('div', { class: 'bt-menu-title' }, 'หยุดพัก'),
      h('button', { class: 'bt-btn k-btn', onclick: () => hooks.flee() }, 'หนีออกจากการต่อสู้'),
      h('button', { class: 'bt-btn k-btn', onclick: () => this.menu.classList.remove('open') }, 'เล่นต่อ'));
    this.root = h('div', { class: 'battle-ui' },
      h('div', { class: 'bt-left' }, this.turnEl, this.rail),
      h('div', { class: 'bt-top' }, team(0), vs, team(1)),
      h('div', { class: 'bt-side' }, btn('ตั้งค่า', ico(GEAR), () => this.menu.classList.toggle('open')), this.autoBtn, this.speedBtn),
      this.dock,
      this.assistBox,
      this.menu,
      this.tip);
    installKit(this.root);
    document.getElementById('ui')?.appendChild(this.root);
    document.body.classList.add('in-battle');
    for (const u of battle.units) this.addUnit(u);
    window.addEventListener('keydown', this.keys);
    window.addEventListener('resize', this.resize);
    this.scale();
    this.totals();
    requestAnimationFrame(() => this.root.classList.add('show'));
  }

  /** One pixel size for the whole HUD; a narrow screen stacks the bottom parts. */
  private scale(): void {
    const p = pixelSize();
    this.root.style.setProperty('--p', `${p}px`);
    this.root.classList.toggle('narrow', narrowScreen());
    const bw = narrowScreen() ? BAR_W.narrow : BAR_W.wide;
    this.hpBar.resize(bw);
    this.enBar.resize(bw, 12);
    // a landscape screen too short of width for the whole bottom row: the special team moves up to the right
    this.root.classList.toggle('tight', !narrowScreen() && window.innerWidth / p < 611);
  }

  private addUnit(u: Unit): void {
    const hit = h('button', { class: 'bt-hit', 'aria-label': u.name });
    const el = h('div', { class: 'bt-unit' }, hit);
    hit.addEventListener('click', () => this.pickTarget(u));
    hit.addEventListener('mouseenter', () => this.previewOn(u));
    hit.addEventListener('mouseleave', () => this.previewOn(null));
    this.hoverCard(hit, () => this.unitTip(u), 'side');
    this.root.prepend(el);
    this.units.set(u.uid, { el, hit });
    this.shown.set(u.uid, { hp: u.hp, shield: 0 });
  }

  /** How far down the screen the top bars reach (CSS px). */
  topBottom(): number {
    return this.root.querySelector('.bt-top')?.getBoundingClientRect().bottom ?? 60;
  }

  /** Show a unit's HP and shield as they are in the battle now (when its hit lands on screen). */
  sync(u: Unit): void {
    this.shown.set(u.uid, { hp: u.alive ? u.hp : 0, shield: u.statuses.find((s) => s.type === 'shield')?.shieldHp ?? 0 });
    this.totals();
    if (this.cardUnit === u) this.fillCard(u);
    this.refreshTip();
  }

  /** Both teams' HP as shown, and how many are standing. */
  private totals(): void {
    for (const t of [0, 1] as const) {
      const list = this.battle.units.filter((u) => u.team === t);
      const max = list.reduce((n, u) => n + u.maxHp, 0);
      const hp = list.reduce((n, u) => n + (this.shown.get(u.uid)?.hp ?? 0), 0);
      const v = this.teams[t];
      v.bar.set(max ? hp / max : 0);
      v.num.replaceChildren(px(`${Math.round(hp)}`, LOOKS.ui));
      const up = list.filter((u) => (this.shown.get(u.uid)?.hp ?? 0) > 0).length;
      v.count.replaceChildren(h('span', null, t ? 'ศัตรู' : 'ทีมเรา'), px(`${up}/${list.length}`, t ? LOOKS.dmg : LOOKS.shield));
    }
  }

  /** Pin the tap areas over everyone. */
  place(views: Map<string, UnitView>): void {
    for (const u of this.battle.units) {
      const ui = this.units.get(u.uid)!, v = views.get(u.uid);
      const on = !!v && (this.shown.get(u.uid)?.hp ?? 0) > 0;
      ui.el.classList.toggle('gone', !on);
      if (!v) continue;
      ui.el.style.transform = `translate3d(${v.feet.x.toFixed(1)}px, ${v.top.toFixed(1)}px, 0)`;
      ui.hit.style.width = `${v.half * 2}px`;
      ui.hit.style.height = `${v.feet.y - v.top}px`;
    }
  }

  /** The turn count, the order (the next one first, big), the card and moves of whoever's turn it is. */
  order(current: Unit | null): void {
    const changed = this.now !== current;
    this.now = current;
    this.turnEl.replaceChildren(px('TURN', LOOKS.uiGold), px(String(Math.max(1, this.battle.turn)), LOOKS.uiGold, 2), px(`/${TURN_LIMIT}`, LOOKS.miss));
    // as many as fit down the left between the turn badge and the card
    const p = pixelSize();
    const room = this.root.classList.contains('narrow')
      ? Math.floor((window.innerWidth / p - 46) / 30) + 1
      : Math.floor((window.innerHeight / p - 146) / 30) + 1;
    const next = this.battle.previewSchedule(Math.max(3, Math.min(6, room))).map((e) => e.unit);
    this.drawRail(next);
    this.root.classList.toggle('turn', !!current);
    if (current && changed) {
      // only our heroes are shown: on the enemy's turn the card keeps the last of ours (or the next of ours to go)
      const card = current.team === 0 ? current : this.cardUnit ?? this.battle.previewSchedule(12).find((e) => e.unit.team === 0)?.unit ?? null;
      if (card && card !== this.cardUnit) {
        this.cardUnit = card;
        this.fillCard(card);
        this.dock.classList.remove('enter');
        void this.dock.offsetWidth;
        this.dock.classList.add('enter');
      }
      if (card) this.drawMoves(card, null);
    }
  }

  /**
   * The turn order, moving rather than redrawn: the same chip stays with the same fighter and slides to its new
   * place (whoever just went drops down the queue, the rest move up one), a chip that leaves slides out to the
   * left, a new one rises in at its place; the next one grows into the gold frame.
   */
  private drawRail(list: Unit[]): void {
    const before = new Map<HTMLElement, { x: number; y: number }>();
    for (const el of this.railChips.values())
      if (el.isConnected) {
        const r = el.getBoundingClientRect();
        before.set(el, { x: r.left, y: r.top });
      }
    const seen = new Map<string, number>();
    const keep = new Map<string, HTMLElement>();
    const els = list.map((u, i) => {
      const n = seen.get(u.uid) ?? 0;
      seen.set(u.uid, n + 1);
      const key = `${u.uid}#${n}`;
      let el = this.railChips.get(key);
      if (!el) {
        el = h('div', { class: 'bt-chip' }, h('div', { class: 'bt-chip-face' }, sized(this.hooks.portrait(u))));
        el.dataset.fresh = String(i);
      }
      el.className = `bt-chip ${i === 0 ? 'k-chipNext next' : u.team ? 'k-chipFoe' : 'k-chipAlly'}`;
      keep.set(key, el);
      return el;
    });
    const leaving: HTMLElement[] = [];
    for (const [key, el] of this.railChips)
      if (!keep.has(key) && el.isConnected) {
        const top = el.offsetTop, left = el.offsetLeft;
        el.classList.add('leaving');
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
        leaving.push(el);
        el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-70%)', opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished.then(() => el.remove(), () => el.remove());
      }
    this.rail.replaceChildren(...els, ...leaving);
    this.railChips = keep;
    for (const el of els) {
      if (el.dataset.fresh !== undefined) {
        const i = Number(el.dataset.fresh);
        delete el.dataset.fresh;
        el.animate([{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, delay: before.size ? 120 : i * 50, easing: 'cubic-bezier(0.2, 1.2, 0.3, 1)', fill: 'backwards' });
        continue;
      }
      const was = before.get(el), now = el.getBoundingClientRect();
      const dx = was ? was.x - now.left : 0, dy = was ? was.y - now.top : 0;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.3, 0.9, 0.3, 1)' });
    }
  }

  /** Where the turn order ends on the right (CSS px) - things on the field keep clear of it. */
  leftEdge(): number {
    return this.rail.getBoundingClientRect().right;
  }
  /** Where the turn order ends at the bottom (CSS px) - on a phone the combo shows just under it. */
  railBottom(): number {
    return this.rail.getBoundingClientRect().bottom;
  }

  /**
   * The left of the dock - whoever's turn it is: its picture (tile prof) with its stars under it (stars: C0-C5 for
   * a hero, a ribbon for a monster); its statuses (st) across the top; its HP (hp, the number only); its name and
   * level, element and class (nm).
   */
  private fillCard(u: Unit): void {
    const hero = u.team === 0 ? heroById(u.id) : undefined;
    const rar = hero ? RARITIES.find((r) => r.id === hero.rarity) : undefined;
    const cls = u.team === 0 ? CLASSES.find((c) => c.id === u.role) : undefined;
    const el = ELEMENTS.find((e) => e.id === u.element);
    const s = this.shown.get(u.uid) ?? { hp: u.hp, shield: 0 };
    const t = this.tile;
    this.dock.classList.toggle('foe', u.team === 1);
    this.dock.style.setProperty('--rar', rar?.color ?? (u.team ? '#ff6a5a' : '#5ad0ff'));
    const mon = u.team === 1 ? monsterById(u.id) : undefined;
    const rarity = hero?.rarity ?? mon?.rarity ?? 'rare';
    t.prof.className = 'bd-prof';
    t.prof.style.backgroundImage = `url(${rarityWindow(rarity)})`;
    t.prof.replaceChildren(h('div', { class: 'bd-fig' }, centred(this.hooks.figure(u))));
    const stars = hero ? player.heroes.find((x) => x.id === u.id)?.stars ?? 0 : -1;
    const mrar = mon ? RARITIES.find((r) => r.id === mon.rarity) : undefined;
    const tag = rar ? rar.name : `${mrar?.name ?? ''}${u.miniBoss ? ' · บอส' : ''}`;
    t.stars.className = 'bd-stars k-tile';
    t.stars.title = stars >= 0 ? `${tag} · ดาว ${stars}/5` : tag;
    t.stars.replaceChildren(...(stars >= 0 ? Array.from({ length: 5 }, (_, i) => ico(i < stars ? STAR : STAR_OFF)) : [h('span', null, tag)]));
    t.st.className = 'bd-st';
    const list = u.alive ? u.statuses.filter((x) => x.type !== 'shield') : [];
    t.st.replaceChildren(...list.slice(0, 6).map((x) => h('span', { class: `bd-si ${GOOD_STATUS.has(x.type) ? 'good' : 'bad'}`, title: `${statusLabel(x.type)} · ${x.turns} เทิร์น` },
      ico(statusIcon(x.type, GOOD_STATUS.has(x.type)), '', 2), px(String(x.turns), LOOKS.ui))));
    // HP: the pixel bar (its drop / rise plays out on it), the number only
    t.hp.className = `bd-hp k-tile ${u.team ? 'foe' : ''}`;
    // HP then the shield (white) in one bar; over max HP the whole bar is scaled to fit (LineRanger_TurnBased)
    const scale = Math.max(u.maxHp, s.hp + s.shield) || 1;
    if (u.uid !== this.cardUid) {
      this.cardUid = u.uid;
      this.hpBar.setLook({ ...(u.team ? BAR_LOOKS.foe : BAR_LOOKS.ally), icon: HEART_BIG });
      this.hpBar.set(s.hp / scale, true);
    } else this.hpBar.set(s.hp / scale);
    this.hpBar.setGuard(s.shield / scale, u.alive && u.statuses.some((x) => x.type === 'barrier'));
    t.hp.replaceChildren(this.hpBar.el, px(String(Math.round(s.hp)), LOOKS.ui, 1, false, 'bd-over'));
    t.nm.className = 'bd-nm k-tile';
    t.nm.replaceChildren(
      h('div', { class: 'bd-row' }, h('div', { class: 'bd-name' }, u.name), h('div', { class: 'bd-lv' }, px('LV', LOOKS.uiGold), px(String(u.level), LOOKS.ui))),
      h('div', { class: 'bd-row' }, ico(elementIcon(u.element, rgb(el?.color ?? '#ffffff'))), h('span', { class: 'bd-meta' }, [el ? `ธาตุ${el.name}` : null, cls?.name].filter(Boolean).join(' · '))));
  }

  /** A move's button: its frame, the element's glow, its icon, the cost on a hexagon, its key; dark while waiting. */
  private moveButton(u: Unit, k: ActionName, o: { mine: boolean; on: boolean; ok: boolean; key: string; cost: string; hex: 'Blue' | 'Green' | 'Grey'; rest?: number; short?: boolean; onPress: () => void; title: string }): HTMLElement {
    const glow = glowUrl(k === 'attack' ? '#5a6a8a' : ELEMENTS.find((e) => e.id === u.element)?.color ?? '#8a7aff');
    return h('button', { class: `bd-move ${k === 'attack' ? 'basic' : 'skill'} ${o.on ? 'on' : ''} ${o.ok ? '' : 'off'}`, disabled: !o.mine || !o.ok, onclick: o.onPress, title: this.hoverable ? '' : o.title, 'data-a': k },
      h('i', { class: 'bd-glow', style: `background-image:url(${glow})` }),
      sized(this.hooks.moveIcon(u, k)),
      o.rest ? h('div', { class: 'bd-rest' }, px(String(o.rest), LOOKS.ui, 2), h('small', null, 'เทิร์น'))
        // not enough team energy for it: the same dark veil as a cooldown, over the whole button (no count)
        : o.short ? h('div', { class: 'bd-rest short' }) : null,
      // the chosen one: light running round its frame - under its cost and its key
      o.mine && o.on ? new Swirl(48, k === 'attack' ? 0xcfe6ff : 0xffd75a).el : null,
      h('span', { class: 'bd-cost', style: `background-image:var(--k-hex${o.hex})` }, px(o.cost, LOOKS.ui)),
      o.mine && o.key ? h('kbd', null, px(o.key, LOOKS.uiGold)) : null);
  }

  /**
   * The ultimate (tile ult): the hero's face in a gold frame, dark above its charge (it fills from the bottom like
   * Honkai: Star Rail's), the % over it; charged: lit, "ULT" on it, its key - usable on its own turn, free, and the
   * turn goes on after it.
   */
  private drawUlt(u: Unit, on: boolean, mine: boolean): void {
    const share = this.battle.ultShare(u);
    const ready = this.battle.canUse(u, 'ult');
    const pct = Math.floor(share * 100);
    const sk = this.battle.skillOf(u, 'ult');
    const inner = 38, dark = inner - Math.round(inner * share);
    const glow = glowUrl(ELEMENTS.find((e) => e.id === u.element)?.color ?? '#ffd75a');
    this.tile.ult.replaceChildren(h('button', {
      class: `bd-move skill ult ${on ? 'on' : ''} ${ready ? 'ready' : 'off'}`, disabled: !mine || !ready, 'data-a': 'ult',
      onclick: () => this.select('ult'), title: this.hoverable ? '' : `${sk.name || 'อัลติเมต'} · อัลติเมต ${pct}%`,
    },
      h('i', { class: 'bd-glow', style: `background-image:url(${glow})` }),
      h('div', { class: 'bd-ultface' }, sized(this.hooks.portrait(u))),
      dark > 0 ? h('i', { class: 'bd-ultdark', style: `height:calc(var(--p) * ${dark})` }) : null,
      mine && on ? new Swirl(48, 0xffd75a).el : null,
      h('span', { class: 'bd-ultpct' }, px(ready ? 'ULT' : `${pct}%`, ready ? LOOKS.uiGold : LOOKS.ui)),
      mine && ready ? h('kbd', null, px(KEYS.ult, LOOKS.uiGold)) : null));
  }

  /** Whoever's turn it is: the basic attack and skills 1 and 2 (the chosen one lit; the player's on a hero's turn). */
  private drawMoves(u: Unit, chosen: ActionName | null, caster: Unit | null = null): void {
    const mine = u.team === 0 && !!this.picking;
    if (caster) chosen = null;
    const move = (k: ActionName) => {
      const sk = this.battle.skillOf(u, k);
      const cost = this.battle.costOf(u, k);
      const cd = this.battle.cooldownOf(u, k);
      const ok = this.battle.canUse(u, k);
      const name = k === 'attack' ? 'โจมตี' : sk.name || (k === 'skill1' ? 'สกิล 1' : 'สกิล 2');
      const hex = k === 'attack' ? 'Green' : cd > 0 || (u.team === 0 && !ok) ? 'Grey' : 'Blue';
      // a move it hasn't got (a monster with one skill): an empty frame
      if (k !== 'attack' && !sk.name) return h('div', { class: 'bd-move skill none', title: 'ไม่มีสกิล' });
      return this.moveButton(u, k, {
        mine, on: k === chosen, ok, key: KEYS[k], hex, rest: cd > 0 ? cd : undefined,
        short: u.team === 0 && k !== 'attack' && cd <= 0 && this.battle.energy[0] < cost,
        cost: k === 'attack' ? '+1' : u.team === 0 ? String(cost) : '!',
        onPress: () => this.select(k), title: `${name} · ${AREA_LABEL[sk.area] ?? ''}`,
      });
    };
    this.tile.basic.replaceChildren(move('attack'));
    this.tile.s1.replaceChildren(move('skill1'));
    this.tile.s2.replaceChildren(move('skill2'));
    this.drawUlt(u, chosen === 'ult' && !caster, mine);
    this.dock.classList.toggle('mine', mine);
    this.drawAssist(u, caster, caster ? this.picking?.action ?? null : null);
  }

  /**
   * The special team: each one's skill 1 and skill 2 (tiles p1 k1 for the first, p2 k2 for the second) - pressed on
   * a hero's turn, that hero calls it in to cast it (the energy it costs); then it rests - both its skills - for the
   * turns shown on them before it can come again.
   */
  private drawAssist(u: Unit | null, chosen: Unit | null, chosenAction: ActionName | null = null): void {
    const list = this.battle.reserves[0];
    this.assistBox.classList.toggle('none', !list.length);
    const mine = !!u && u.team === 0 && !!this.picking;
    this.assistBox.classList.toggle('mine', mine);
    ASSIST_SLOTS.forEach(([t, i, k], n) => {
      const r = list[i];
      const tile = this.tile[t];
      tile.className = `bd-${t} ${r ? '' : 'empty'}`;
      tile.style.backgroundImage = '';
      if (!r) {
        tile.replaceChildren();
        return;
      }
      const cd = this.battle.reserveCooldown(r);
      const can = mine && this.battle.canSummon(u!, r, k);
      const sk = this.battle.skillOf(r, k);
      const cost = this.battle.costOf(r, k);
      tile.replaceChildren(this.moveButton(r, k, {
        mine, on: chosen === r && chosenAction === k, ok: can, key: ASSIST_KEYS[n] ?? '', hex: cd > 0 || this.battle.energy[0] < cost ? 'Grey' : 'Blue',
        rest: cd > 0 ? cd : undefined, short: cd <= 0 && this.battle.energy[0] < cost, cost: String(cost), onPress: () => this.select(k, r),
        title: `${r.name} · ${sk.name ?? ''} · ${AREA_LABEL[sk.area] ?? ''}`,
      }));
    });
  }

  /** The team's energy: the crystal gauge (energyGauge.ts), the number over it (no "/10"). */
  energy(): void {
    const n = this.battle.energy[0];
    const first = this.lastEnergy < 0;
    this.lastEnergy = n;
    this.tile.en.className = 'bd-en k-tile';
    this.enBar.set(n / ENERGY_MAX, first);
    this.tile.en.replaceChildren(this.enBar.el, px(String(n), LOOKS.ui, 1, false, 'bd-over'));
    this.refreshTip();
    // the card's ult charge moves with every hit
    if (this.cardUnit) this.drawUlt(this.cardUnit, this.picking?.action === 'ult' && !this.picking.caster, !!this.picking && this.picking.actor === this.cardUnit);
    // what the special team can afford changes with it
    if (!this.picking) this.drawAssist(this.now, null);
  }

  /** A word (Thai - a status put on, cleansed...) floating up off someone, as a small plate. */
  float(uid: string, text: string, kind: 'good' | 'bad' | 'info', views: Map<string, UnitView>, delay = 0): void {
    const v = views.get(uid);
    if (!v) return;
    const el = h('div', { class: `bt-float ${kind}` }, text);
    el.style.transform = `translate3d(${v.feet.x.toFixed(1)}px, ${(v.top - v.k * 16).toFixed(1)}px, 0)`;
    el.style.animationDelay = `${delay}ms`;
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 1300 + delay);
  }

  // ---------------------------------------------------------------- the player's turn

  /** Wait for the player to pick a move and a target (or for auto to be switched on). */
  choose(actor: Unit): Promise<Choice> {
    return new Promise((resolve) => {
      this.picking = { actor, action: 'attack', caster: null, resolve };
      this.select('attack');
      // AUTO was switched on just before this turn reached the player: the AI picks it
      if (this.auto) this.setAuto(true);
    });
  }

  /** Who casts what's chosen: the one whose turn it is, or the special team's one it calls in. */
  private caster(): Unit | null {
    const p = this.picking;
    return p ? p.caster ?? p.actor : null;
  }

  private select(action: ActionName, caster: Unit | null = null): void {
    const p = this.picking;
    if (!p) return;
    if (caster) {
      if (!this.battle.canSummon(p.actor, caster, action)) return;
      this.battle.prepareSummon(p.actor, caster);
    } else if (!this.battle.canUse(p.actor, action)) return;
    // the same move again: use it on the best target
    if (p.action === action && p.caster === caster && this.root.classList.contains('picking') && this.root.querySelector('.sk-move.on')) {
      const t = this.battle.autoTarget(caster ?? p.actor, action);
      if (t) return this.commit(t);
    }
    p.action = action;
    p.caster = caster;
    this.root.classList.add('picking');
    this.drawMoves(p.actor, action, caster);
    this.targets.clear();
    for (const u of this.battle.selectableTargets(caster ?? p.actor, action)) this.targets.add(u.uid);
    for (const [uid, ui] of this.units) ui.el.classList.toggle('can', this.targets.has(uid));
    this.previewOn(null);
    this.refreshTip();
  }

  private pickTarget(u: Unit): void {
    const p = this.picking;
    if (!p || !this.battle.selectableTargets(this.caster()!, p.action).includes(u)) return;
    this.commit(u);
  }

  private commit(target: Unit): void {
    const p = this.picking!;
    this.picking = null;
    this.endPicking(p.actor, p.action, p.caster);
    p.resolve({ action: p.action, target, caster: p.caster ?? undefined });
  }

  private endPicking(actor?: Unit, action?: ActionName, caster: Unit | null = null): void {
    this.root.classList.remove('picking');
    if (actor) this.drawMoves(actor, action ?? null, caster);
    for (const ui of this.units.values()) ui.el.classList.remove('can');
    this.targets.clear();
    this.previews.clear();
    this.hover = null;
  }

  /** Hovering a target: what the chosen move would do to everyone it reaches. */
  private previewOn(u: Unit | null): void {
    this.previews.clear();
    this.hover = u?.uid ?? null;
    const p = this.picking;
    const who = this.caster();
    if (!p || !u || !who || !this.battle.selectableTargets(who, p.action).includes(u)) return;
    for (const pv of this.battle.previewAction(who, p.action, u)) {
      const s = this.shown.get(pv.uid), t = this.battle.unit(pv.uid);
      if (!s || !t) continue;
      const max = Math.max(t.maxHp, s.hp + s.shield);
      const loss = Math.min(s.hp, Math.max(0, pv.damage - s.shield));
      const gain = Math.min(t.maxHp - s.hp, pv.heal);
      if (gain > 0) this.previews.set(pv.uid, { from: s.hp / max, to: (s.hp + gain) / max, heal: true });
      else if (loss > 0) this.previews.set(pv.uid, { from: (s.hp - loss) / max, to: s.hp / max, heal: false });
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'a' || e.key === 'A') return this.setAuto(!this.auto);
    if (!this.picking) return;
    const k = ({ '1': 'attack', '2': 'skill1', '3': 'skill2', '4': 'ult', z: 'attack', x: 'skill1', c: 'skill2', r: 'ult', Z: 'attack', X: 'skill1', C: 'skill2', R: 'ult' } as Record<string, ActionName>)[e.key];
    const assist = ASSIST_SLOTS[ASSIST_KEYS.indexOf(e.key.toUpperCase())];
    if (k) this.select(k);
    else if (assist && this.battle.reserves[0][assist[1]]) this.select(assist[2], this.battle.reserves[0][assist[1]]);
    else if (e.key === ' ' || e.key === 'Enter') {
      const t = this.battle.autoTarget(this.caster()!, this.picking.action);
      if (t) this.commit(t);
    }
  }

  setAuto(on: boolean): void {
    this.auto = on;
    this.autoBtn.className = `bt-btn ${on ? 'k-btnOn on' : 'k-btn'}`;
    this.autoBtn.replaceChildren(px('AUTO', on ? LOOKS.uiGold : LOOKS.ui));
    if (on && this.picking) {
      const p = this.picking;
      const plan = this.battle.planAuto(p.actor);
      if (plan) {
        this.picking = null;
        this.endPicking(p.actor, plan.action, plan.caster ?? null);
        p.resolve({ action: plan.action, target: plan.target, caster: plan.caster });
      }
    }
  }

  setFast(on: boolean): void {
    this.fast = on;
    this.speedBtn.className = `bt-btn ${on ? 'k-btnOn on' : 'k-btn'}`;
    this.speedBtn.replaceChildren(h('span', { class: 'bt-speed' }, ico(FAST), px(on ? 'x2' : 'x1', on ? LOOKS.uiGold : LOOKS.ui)));
  }

  // ---------------------------------------------------------------- the show

  /** The opening: both teams' faces fly in on chips either side of the VS crest, "BATTLE START" under it. */
  intro(): void {
    const faces = (team: 0 | 1) => h('div', { class: `bi-side ${team ? 'foe' : 'ally'}` },
      this.battle.units.filter((u) => u.team === team).map((u, i) => h('div', { class: `bi-face ${team ? 'k-chipFoe' : 'k-chipAlly'}`, style: `--i:${i}` }, h('div', { class: 'bt-chip-face' }, sized(this.hooks.portrait(u))))));
    const box = h('div', { class: 'bt-intro' },
      h('div', { class: 'bi-band' }),
      faces(0),
      h('div', { class: 'bi-mid' }, sized(h('img', { src: 'assets/ui/battle/vs.png', alt: '', draggable: false }), 2), px('VS', LOOKS.gold, 2)),
      faces(1),
      h('div', { class: 'bi-title' }, px('BATTLE START', LOOKS.gold, 2), h('span', null, 'เริ่มต่อสู้!')));
    this.root.appendChild(box);
    window.setTimeout(() => box.remove(), 1900);
  }

  /**
   * An ultimate's cut-in (only the ultimate has one): our own pixel cut (fx/effects/ultCut.ts) on a canvas shaped like
   * the screen - the screen darkens, blades slash a band open in the hero's element colour - and the hero (big) and its
   * move's name ride in it, then a release cut parts it.
   */
  cutin(u: Unit, skill: string, art: HTMLElement, tag = 'ULTIMATE'): Promise<void> {
    const colour = ELEMENTS.find((e) => e.id === u.element)?.color ?? '#ffd75a';
    const speed = this.fast ? 1.7 : 1;
    const W = 400, H = Math.max(160, Math.min(900, Math.round((W * this.root.clientHeight) / Math.max(1, this.root.clientWidth))));
    const canvas = h('canvas', { class: 'uc-canvas' }) as HTMLCanvasElement;
    canvas.width = W;
    canvas.height = H;
    // the hero and the move's name live INSIDE the rift: a layer clipped to it every frame
    const inner = h('div', { class: 'uc-inner' },
      // (on an upright phone the hero smaller, so the name has room beside it)
      h('div', { class: 'uc-art' }, sized(art, narrowScreen() ? 3 : 4)),
      h('div', { class: 'uc-text' }, h('div', { class: 'uc-who' }, px(tag, LOOKS.uiGold), h('small', null, u.name)), h('b', null, skill)));
    const box = h('div', { class: 'bt-ultcut', style: `--el:${colour}; --dur:${(ULT_CUT_DURATION / speed).toFixed(2)}s` }, canvas, inner);
    this.root.appendChild(box);
    const fx = new UltCut(W, H, parseInt(colour.slice(1), 16), Math.floor(Math.random() * 999) + 1, speed);
    const surface = new Surface(W, H, 0, 0);
    const g = canvas.getContext('2d')!, img = g.createImageData(W, H);
    return new Promise((resolve) => {
      let last = performance.now();
      const step = (now: number) => {
        fx.update(Math.min(1 / 30, (now - last) / 1000));
        last = now;
        surface.clear();
        fx.draw(surface);
        surface.write(img.data);
        g.putImageData(img, 0, 0);
        // clip the hero and name to the rift as it is now (a band along its slant; shut: nothing)
        const hh = fx.rift();
        if (hh <= 0.3) inner.style.clipPath = 'polygon(0 0, 0 0, 0 0)';
        else {
          const pc = (y: number) => `${((y / H) * 100).toFixed(2)}%`;
          inner.style.clipPath = `polygon(0 ${pc(fx.mid(0) - hh)}, 100% ${pc(fx.mid(W) - hh)}, 100% ${pc(fx.mid(W) + hh)}, 0 ${pc(fx.mid(0) + hh)})`;
        }
        if (!fx.done) requestAnimationFrame(step);
        else {
          box.remove();
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /** The end: won, lost or a draw - its stars, the MVP, and back to the map. */
  result(kind: 'win' | 'lose' | 'draw', turns: number, onBack: () => void, mvp?: { unit: Unit; damage: number }): void {
    this.endPicking();
    this.root.classList.add('over');
    const title = kind === 'win' ? 'VICTORY' : kind === 'lose' ? 'DEFEAT' : 'DRAW';
    const sub = kind === 'win' ? 'ชนะ! ปราบมอนสเตอร์ได้ทั้งหมด' : kind === 'lose' ? 'พ่ายแพ้ — ลองจัดทีมใหม่ดูนะ' : 'เสมอ — ครบเทิร์น เลือดเหลือพอๆ กัน';
    // stars: a win with everyone standing 3, more than half 2, otherwise 1
    const team = this.battle.units.filter((u) => u.team === 0);
    const up = team.filter((u) => u.alive).length;
    const stars = kind !== 'win' ? 0 : up === team.length ? 3 : up * 2 > team.length ? 2 : 1;
    const look = kind === 'win' ? LOOKS.gold : kind === 'lose' ? LOOKS.dmg : LOOKS.miss;
    const star = (i: number) => {
      const img = h('img', { class: `pxi ${i < stars ? 'on' : ''}`, src: starUrl(i < stars), alt: '', style: `--i:${i}` });
      const k = i === 1 ? 3 : 2;
      img.style.width = img.style.height = `calc(var(--p) * ${15 * k})`;
      return img;
    };
    const box = h('div', { class: `bt-result ${kind}` },
      h('div', { class: 'br-rays' }),
      h('div', { class: 'br-card k-panel' },
        h('div', { class: 'br-title' }, px(title, look, 3)),
        kind === 'win' ? h('div', { class: 'br-stars' }, [0, 1, 2].map(star)) : null,
        h('div', { class: 'br-sub' }, sub),
        mvp && kind === 'win'
          ? h('div', { class: 'br-mvp k-plate' }, h('div', { class: 'bt-chip k-chipNext' }, h('div', { class: 'bt-chip-face' }, sized(this.hooks.portrait(mvp.unit)))),
            h('div', null, px('MVP', LOOKS.gold), h('b', null, mvp.unit.name), h('span', null, 'ดาเมจ', px(String(mvp.damage), LOOKS.crit))))
          : null,
        h('div', { class: 'br-stats' }, h('span', null, px(String(turns)), 'เทิร์น'), h('span', null, 'รอด', px(`${up}/${team.length}`))),
        h('div', { class: 'br-note' }, 'รางวัล (EXP / ของดรอป) ยังรอกำหนด'),
        h('button', { class: 'br-back bt-btn k-btnOn', onclick: () => onBack() }, 'กลับแผนที่')));
    this.root.appendChild(box);
    requestAnimationFrame(() => box.classList.add('show'));
  }

  // ---------------------------------------------------------------- hover cards (PC)

  /** Hovering el (with a mouse) shows a card made by make: beside it (a fighter) or above it (a move). */
  private hoverCard(el: HTMLElement, make: () => TipBody | null, place: 'side' | 'above'): void {
    const show = () => {
      this.tipOn = { el, make, place };
      this.refreshTip();
    };
    const hide = () => {
      if (this.tipOn?.el !== el) return;
      this.tipOn = null;
      this.tip.classList.remove('show');
    };
    // a mouse: shown while it's over it
    if (this.hoverable) {
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
    }
    // a finger (a phone, a tablet): a long press shows it while held; letting go hides it, and that press
    // doesn't count as a tap (no move chosen, no target picked)
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      window.clearTimeout(this.pressTimer);
      this.pressShown = false;
      this.pressTimer = window.setTimeout(() => {
        this.pressShown = true;
        show();
        navigator.vibrate?.(8);
      }, LONG_PRESS_MS);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      window.clearTimeout(this.pressTimer);
      hide();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => {
      if (!this.pressShown) return;
      this.pressShown = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Draw the card again (its numbers change as the battle goes) and keep it by what it's for, on the screen. */
  private refreshTip(): void {
    const on = this.tipOn;
    if (!on) return;
    const body = on.el.isConnected ? on.make() : null;
    if (!body) {
      this.tip.classList.remove('show');
      return;
    }
    this.tip.className = `bt-tip k-tip${body.kind} show`;
    this.tip.replaceChildren(...body.body);
    syncBlinks(this.tip);
    const r = on.el.getBoundingClientRect(), t = this.tip.getBoundingClientRect(), gap = 20, edge = 6;
    let x: number, y: number;
    if (on.place === 'above') {
      x = r.left + r.width / 2 - t.width / 2;
      y = r.top - t.height - gap;
      if (y < edge) y = r.bottom + gap;
    } else {
      x = r.right + gap;
      if (x + t.width > window.innerWidth - edge) x = r.left - t.width - gap;
      y = r.top + r.height / 2 - t.height / 2;
    }
    x = Math.max(edge, Math.min(window.innerWidth - t.width - edge, x));
    y = Math.max(edge, Math.min(window.innerHeight - t.height - edge, y));
    const dpr = window.devicePixelRatio || 1;
    this.tip.style.left = `${Math.round(x * dpr) / dpr}px`;
    this.tip.style.top = `${Math.round(y * dpr) / dpr}px`;
  }

  /** A fighter's card: its face, name, LV, element / class / side; its HP; ATK, DEF, SPD, CRIT; its statuses. */
  /** What the chosen move would do to u (u must be one it can be aimed at); none when nothing is being chosen. */
  private previewFor(u: Unit): ActionPreview | undefined {
    const p = this.picking, who = this.caster();
    if (!p || !who || !u.alive || !this.battle.selectableTargets(who, p.action).includes(u)) return undefined;
    return this.battle.previewAction(who, p.action, u).find((x) => x.uid === u.uid);
  }
  /** The chosen move's name (for the card's guide line). */
  private pickedName(): string {
    const p = this.picking, who = this.caster();
    if (!p || !who) return '';
    return p.action === 'attack' ? 'โจมตีปกติ' : this.battle.skillOf(who, p.action).name ?? '';
  }

  private unitTip(u: Unit): TipBody {
    const b = this.battle;
    const el = ELEMENTS.find((e) => e.id === u.element);
    const cls = u.team === 0 ? CLASSES.find((c) => c.id === u.role)?.name : u.miniBoss ? 'มินิบอส' : 'มอนสเตอร์';
    const s = this.shown.get(u.uid) ?? { hp: u.hp, shield: 0 };
    const hp = Math.max(0, Math.round(s.hp)), pct = Math.round((hp / u.maxHp) * 100);
    const sts = u.alive ? u.statuses : [];
    const stat = (k: string, v: string) => h('div', null, h('small', null, k), px(v, LOOKS.ui));
    // a move is chosen and this one is one it can be used on: what it would do here (no dice, as the bars blink)
    const pv = this.previewFor(u);
    const loss = pv ? previewLoss(pv, hp, s.shield) : null;
    const lossPct = loss ? (loss.hpLoss / u.maxHp) * 100 : 0;
    const healPct = pv ? (Math.min(pv.heal, u.maxHp - hp) / u.maxHp) * 100 : 0;
    const shieldNow = Math.max(0, s.shield - (loss?.shieldLoss ?? 0)) + (pv?.shield ?? 0);
    const change: HTMLElement[] = [];
    if (pv?.immune) change.push(h('span', { class: 'tp-chg immune' }, 'อมตะ · ไม่โดน'));
    else if (loss && (loss.hpLoss > 0 || loss.shieldLoss > 0)) {
      if (loss.shieldLoss > 0) change.push(h('span', { class: 'tp-chg' }, px(`-${num(loss.shieldLoss)}`, LOOKS.shield), h('small', null, 'โล่')));
      if (loss.hpLoss > 0) change.push(px(`-${num(loss.hpLoss)}`, LOOKS.dmg));
      if (loss.ko) change.push(h('span', { class: 'tp-chg ko' }, 'ล้ม!'));
    }
    if (pv && pv.heal > 0) change.push(px(`+${num(Math.min(pv.heal, u.maxHp - hp))}`, LOOKS.heal));
    if (pv && pv.shield > 0) change.push(h('span', { class: 'tp-chg' }, h('small', null, 'โล่'), px(`+${num(pv.shield)}`, LOOKS.shield)));
    // the statuses it would put on (and what it would clear), after the ones it has
    const coming: HTMLElement[] = pv ? [
      ...pv.statuses.map((x) => {
        const good = GOOD_STATUS.has(x.type);
        const has = sts.some((y) => y.type === x.type);
        return h('span', { class: `tp-si new ${good ? 'good' : 'bad'} ${has ? 'has' : ''}` }, ico(statusIcon(x.type, good)), `${statusLabel(x.type)}${x.pct && x.type !== 'stun' ? ` ${x.pct}%` : ''} · ${x.turns} เทิร์น`);
      }),
      ...(pv.dispel ? [h('span', { class: 'tp-si new bad' }, 'ลบผลด้านบวก')] : []),
      ...(pv.cleanse ? [h('span', { class: 'tp-si new good' }, 'ล้างผลด้านลบ')] : []),
    ] : [];
    return {
      kind: u.team ? 'Foe' : 'Ally',
      body: [
        h('div', { class: 'tp-head' },
          h('div', { class: `tp-face ${u.team ? 'k-chipFoe' : 'k-chipAlly'}` }, h('div', { class: 'bt-chip-face' }, sized(this.hooks.portrait(u)))),
          h('div', { class: 'tp-id' },
            h('div', { class: 'tp-row' }, h('b', { class: 'tp-name' }, u.name), h('span', { class: 'tp-lv' }, px('LV', LOOKS.uiGold), px(String(u.level), LOOKS.ui))),
            h('div', { class: 'tp-row tp-meta' }, ico(elementIcon(u.element, rgb(el?.color ?? '#ffffff'))),
              h('span', null, [el ? `ธาตุ${el.name}` : null, cls, u.team ? 'ศัตรู' : 'ฝ่ายเรา'].filter(Boolean).join(' · '))))),
        h('div', { class: `tp-hp ${u.team ? 'foe' : ''}` },
          h('i', { style: `width:${Math.max(0, pct - lossPct)}%` }),
          lossPct > 0 ? h('b', { style: `left:${pct - lossPct}%;width:${lossPct}%` }) : null,
          healPct > 0 ? h('em', { style: `left:${pct}%;width:${healPct}%` }) : null,
          shieldNow > 0 ? h('u', { class: pv?.shield ? 'more' : '', style: `width:${Math.min(100, (shieldNow / u.maxHp) * 100)}%` }) : null),
        h('div', { class: 'tp-row' }, h('span', { class: 'tp-hpn' }, ico(HEART), px(`${num(hp)} / ${num(u.maxHp)}`, LOOKS.ui)),
          change.length ? h('span', { class: 'tp-chgs' }, ...change) : px(`${pct}%`, LOOKS.miss)),
        h('div', { class: 'tp-stats' }, stat('พลังโจมตี', num(b.effAtk(u))), stat('เกราะ', num(u.def)), stat('สปีด', num(b.effSpd(u))), stat('คริ', `${Math.round(b.effCrit(u))}%`)),
        h('div', { class: 'tp-st' }, h('small', null, 'สถานะ'),
          sts.length || coming.length
            ? h('div', { class: 'tp-sts' }, ...sts.filter((x) => !pv?.statuses.some((y) => y.type === x.type)).map((x) => {
              const good = GOOD_STATUS.has(x.type);
              const more = x.type === 'shield' ? ` ${num(x.shieldHp ?? 0)}` : x.pct && x.type !== 'stun' ? ` ${x.pct}%` : '';
              return h('span', { class: `tp-si ${good ? 'good' : 'bad'}` }, ico(statusIcon(x.type, good)), `${statusLabel(x.type)}${more} · ${x.turns} เทิร์น`);
            }), ...coming)
            : h('span', { class: 'tp-none' }, '—')),
        pv ? h('div', { class: 'tp-note' }, `ถ้าใช้ ${this.pickedName()} กับตัวนี้ · ตัวเลขโดยประมาณ (ไม่รวมคริ/หลบ)`) : null,
      ].filter((x) => !!x) as HTMLElement[],
    };
  }

  /** A move's card: its icon, name and cost; who it reaches; what it does, a line each; a note on how it's used. */
  private skillTip(u: Unit, k: ActionName, reserve = false): TipBody | null {
    const b = this.battle;
    const sk = b.skillOf(u, k);
    if (k !== 'attack' && !sk.name) return null;
    const name = k === 'attack' ? 'โจมตีปกติ' : sk.name ?? '';
    const cost = k === 'attack'
      ? [ico(CRYSTAL_SM), px('+1', LOOKS.heal)]
      : k === 'ult' ? [px(`${Math.floor(b.ultShare(u) * 100)}%`, LOOKS.uiGold)]
        : sk.every ? [] : [ico(CRYSTAL_SM), px(String(b.costOf(u, k)), LOOKS.ui)];
    const cd = reserve ? b.reserveCooldown(u) : b.cooldownOf(u, k);
    const note = k === 'attack' ? 'ได้พลังงานทีม +1'
      : k === 'ult' ? 'อัลติเมต · ชาร์จเต็ม 100% แล้วใช้ในเทิร์นของตัวเองได้ · ไม่ใช้พลังงาน ไม่จบเทิร์น'
        : reserve ? `ทีมพิเศษ · เรียก${u.name}ลงมาร่าย แล้วพักทั้ง 2 สกิล ${RESERVE_COOLDOWN} เทิร์น${cd > 0 ? ` (เหลืออีก ${cd} เทิร์น)` : ''}`
          : sk.every ? `ใช้ทุก ${sk.every} เทิร์น${cd > 0 ? ` (อีก ${cd} เทิร์น)` : ''}` : '';
    return {
      kind: 'Skill',
      body: [
        h('div', { class: 'tp-head' },
          h('div', { class: 'tp-icon' }, sized(k === 'ult' ? this.hooks.portrait(u) : this.hooks.moveIcon(u, k))),
          h('div', { class: 'tp-id' },
            h('div', { class: 'tp-row' }, h('b', { class: 'tp-name' }, name), cost.length ? h('span', { class: 'tp-cost' }, ...cost) : null),
            h('div', { class: 'tp-meta' }, reserve ? `${u.name} · ${AREA_LABEL[sk.area] ?? ''}` : AREA_LABEL[sk.area] ?? ''))),
        h('ul', { class: 'tp-fx' }, effectLines(sk).map((l) => h('li', null, l))),
        note ? h('div', { class: 'tp-note' }, note) : null,
      ].filter((x) => !!x) as HTMLElement[],
    };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keys);
    window.removeEventListener('resize', this.resize);
    document.body.classList.remove('in-battle');
    this.root.remove();
  }
}
