// Player data the UI shows. For now it lives in this browser (sample values,
// saved to localStorage); later it comes from the server through GameService.

import { HEROES, STARTER_HEROES } from '@mythoria/game-data';

/**
 * Local sample data only (no summoning yet): the player also gets every other hero, so the owner's new heroes can be
 * seen and tried. Raise when heroes are added; a saved player is topped up once per value.
 */
const SAMPLE_HEROES = 3;

export interface Mail {
  id: string;
  from: string;
  title: string;
  body: string;
  gift?: { gems?: number; gold?: number };
  read: boolean;
  claimed: boolean;
  date: string;
}

export interface Quest {
  id: string;
  group: 'daily' | 'weekly' | 'story' | 'achievement';
  title: string;
  goal: number;
  progress: number;
  reward: { gems?: number; gold?: number };
  claimed: boolean;
}

export interface ChatLine {
  channel: 'world' | 'guild' | 'private' | 'system';
  from: string;
  text: string;
  time: number;
}

/** A hero the player has (what it is - name, class, element, race... - is in @mythoria/game-data HEROES). */
export interface OwnedHero {
  /** Which hero: heroById(id). */
  id: string;
  level: number;
  /** 0..5: each star unlocks the talent of the same number (C1..C5). */
  stars: number;
  /** Spare copies of it, fed in for stars. */
  copies: number;
  /** Its lasting HP as a share of its max (0..1; missing = full) - what it ended its last battle with, until healed
   * (ui/vitals.ts). 0 = down. */
  hp?: number;
  /** When it fell (ms): it gets up by itself VITALS.reviveMinutes later. */
  downAt?: number;
}

export interface Settings {
  music: number;
  sfx: number;
  effects: 'high' | 'low';
  showFps: boolean;
  language: 'th' | 'en';
}

export interface PlayerState {
  name: string;
  uid: string;
  title: string;
  level: number;
  exp: number;
  expMax: number;
  gold: number;
  gems: number;
  energy: number;
  energyMax: number;
  steps: number;
  /** item id -> how many */
  items: Record<string, number>;
  /** login-gift days already claimed, and the date of the last claim */
  loginDays: number;
  loginLast: string;
  mail: Mail[];
  quests: Quest[];
  chat: ChatLine[];
  heroes: OwnedHero[];
  /** The starter heroes have been given (once per player). */
  startersGiven: boolean;
  /** Which SAMPLE_HEROES hand-out this player has had (local sample data). */
  sampleHeroes?: number;
  /** Who fights: up to 5 hero ids (the battle puts tanks and warriors in front). */
  team: string[];
  /** The special team: up to 2 hero ids, off the field - a fighter calls one in to cast its skill 1. */
  reserves: string[];
  settings: Settings;
  /** Where the master character stands (to come back to the same spot after a refresh / next time). */
  place?: SavedPlace;
}

/**
 * Where the master was last seen on the world map. Versioned (`v`): a shape this code doesn't know is dropped.
 * Checked again when the world starts (WorldScene.restorePlace): a map that's gone, or a spot that isn't walkable
 * any more (and can't be nudged to one close by), puts you back in the town.
 */
export interface SavedPlace {
  v: typeof PLACE_VERSION;
  /** A map id (world/maps.ts MAPS) - a string here, as a saved one may name a map that no longer exists. */
  map: string;
  x: number;
  y: number;
  facing: 1 | -1;
  /** When it was saved (ms since 1970). */
  at: number;
}
export const PLACE_VERSION = 1;

/** The first team: tank, warrior, assassin, mage and the healer. */
export const DEFAULT_TEAM = ['bram', 'kael', 'nyx', 'marin', 'sira'];
export const TEAM_SIZE = 5;
/** The first special team: the two starters not in the first team. */
export const DEFAULT_RESERVES = ['fen', 'pip'];
export const RESERVE_SIZE = 2;

const KEY = 'mythoria.player.v1';

function fresh(): PlayerState {
  return {
    name: 'Master',
    uid: String(100000 + Math.floor(Math.random() * 899999)),
    title: 'นักผจญภัยหน้าใหม่',
    level: 1,
    exp: 0,
    expMax: 300,
    gold: 5000,
    gems: 300,
    energy: 120,
    energyMax: 120,
    steps: 0,
    items: { potion: 3, revive: 1, chest: 1, key: 1, book: 1 },
    loginDays: 0,
    loginLast: '',
    mail: [
      {
        id: 'welcome', from: 'ทีมงาน Mythoria', title: 'ยินดีต้อนรับสู่ Mythoria!',
        body: 'ขอบคุณที่มาร่วมทดสอบเกมช่วงแรกนะ รับของขวัญต้อนรับเล็กๆ น้อยๆ ไปก่อนเลย',
        gift: { gems: 300, gold: 2000 }, read: false, claimed: false, date: '2026-11-08',
      },
      {
        id: 'test', from: 'ระบบ', title: 'ช่วงทดสอบ (Prototype)',
        body: 'ตอนนี้ข้อมูลทั้งหมดเก็บไว้ในเครื่องของคุณ เมื่อเปิดเซิร์ฟเวอร์จริง ข้อมูลจะถูกรีเซ็ต',
        read: false, claimed: false, date: '2026-11-08',
      },
    ],
    quests: [
      { id: 'd-steps', group: 'daily', title: 'เดินสำรวจทุ่งหญ้า 300 ก้าว', goal: 300, progress: 0, reward: { gems: 30 }, claimed: false },
      { id: 'd-mail', group: 'daily', title: 'เปิดอ่านจดหมาย', goal: 1, progress: 0, reward: { gold: 500 }, claimed: false },
      { id: 'd-login', group: 'daily', title: 'เข้าเกม', goal: 1, progress: 1, reward: { gold: 300 }, claimed: false },
      { id: 'w-steps', group: 'weekly', title: 'เดินสำรวจ 3,000 ก้าว', goal: 3000, progress: 0, reward: { gems: 150 }, claimed: false },
      { id: 's-shrine', group: 'story', title: 'ไปที่ซากศาลเจ้าทางตะวันออกเฉียงเหนือ', goal: 1, progress: 0, reward: { gems: 50 }, claimed: false },
      { id: 'a-walker', group: 'achievement', title: 'นักเดินทาง: เดินรวม 10,000 ก้าว', goal: 10000, progress: 0, reward: { gems: 300 }, claimed: false },
    ],
    chat: [
      { channel: 'system', from: 'ระบบ', text: 'ยินดีต้อนรับสู่ Mythoria! แชทออนไลน์จะเปิดเมื่อมีเซิร์ฟเวอร์', time: Date.now() },
    ],
    heroes: [...STARTER_HEROES, ...HEROES.map((d) => d.id).filter((id) => !STARTER_HEROES.includes(id))].map((id) => ({ id, level: 1, stars: 0, copies: 0 })),
    startersGiven: true,
    sampleHeroes: SAMPLE_HEROES,
    team: [...DEFAULT_TEAM],
    reserves: [...DEFAULT_RESERVES],
    settings: { music: 70, sfx: 80, effects: 'high', showFps: false, language: 'th' },
  };
}

function load(): PlayerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p: PlayerState = { ...fresh(), ...JSON.parse(raw) };
      // a player from before the hero system: hand out the starters now
      if (!JSON.parse(raw).startersGiven) {
        p.heroes = fresh().heroes;
        p.startersGiven = true;
      }
      // sample data: hand out heroes added since (see SAMPLE_HEROES)
      if ((JSON.parse(raw).sampleHeroes ?? 0) < SAMPLE_HEROES) {
        for (const d of HEROES) if (!p.heroes.some((h) => h.id === d.id)) p.heroes.push({ id: d.id, level: 1, stars: 0, copies: 0 });
        p.sampleHeroes = SAMPLE_HEROES;
      }
      // no team yet, or heroes in it the player doesn't have: the default team
      p.team = (p.team ?? []).filter((id) => p.heroes.some((h) => h.id === id)).slice(0, TEAM_SIZE);
      if (!p.team.length) p.team = DEFAULT_TEAM.filter((id) => p.heroes.some((h) => h.id === id));
      // the special team: heroes the player has, not already in the team
      const own = (id: string) => p.heroes.some((h) => h.id === id) && !p.team.includes(id);
      p.reserves = (Array.isArray(p.reserves) ? p.reserves : DEFAULT_RESERVES).filter(own).slice(0, RESERVE_SIZE);
      // a save from before revive potions: one to start with
      if (p.items.revive == null) p.items = { ...p.items, revive: 1 };
      if (!validPlace(p.place)) delete p.place;
      return p;
    }
  } catch {
    /* storage blocked: play without saving */
  }
  return fresh();
}

/** A saved place of the shape this code writes (whether the map and the spot are still good is the world's call). */
function validPlace(p: unknown): p is SavedPlace {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    o.v === PLACE_VERSION && typeof o.map === 'string' && Number.isFinite(o.x) && Number.isFinite(o.y) &&
    (o.facing === 1 || o.facing === -1)
  );
}

export const player: PlayerState = load();

const listeners = new Set<() => void>();
let saveTimer = 0;
/** The saved data was wiped (the page is about to reload): never write it back. */
let wiped = false;

function write(): void {
  clearTimeout(saveTimer);
  if (wiped) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(player));
  } catch {
    /* ignore */
  }
}

/** Something changed: redraw whatever shows player data, and save soon. */
export function changed(): void {
  for (const fn of listeners) fn();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(write, 300);
}

/** Remember where the master stands, now (nothing to redraw, so no listeners). */
export function savePlace(map: string, x: number, y: number, facing: 1 | -1): void {
  player.place = { v: PLACE_VERSION, map, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, facing, at: Date.now() };
  write();
}

/** Forget the saved place (it was no good): the next start is in the town. */
export function clearPlace(): void {
  if (!player.place) return;
  delete player.place;
  write();
}

/** Write anything waiting to be saved now (the page is going away). */
export function flushSave(): void {
  write();
}

/** Throw away everything saved in this browser (the page reloads after). */
export function wipeSave(): void {
  wiped = true;
  clearTimeout(saveTimer);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function onChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function giveReward(r: { gems?: number; gold?: number }): string {
  const parts: string[] = [];
  if (r.gems) {
    player.gems += r.gems;
    parts.push(`เพชร +${r.gems}`);
  }
  if (r.gold) {
    player.gold += r.gold;
    parts.push(`ทอง +${r.gold.toLocaleString('en-US')}`);
  }
  changed();
  return parts.join('  ');
}

/** Move quests along (the caller saves with changed()). */
export function progressQuests(kind: 'steps' | 'mail' | 'shrine', amount = 1): void {
  const ids = { steps: ['d-steps', 'w-steps', 'a-walker'], mail: ['d-mail'], shrine: ['s-shrine'] }[kind];
  for (const q of player.quests) if (ids.includes(q.id) && q.progress < q.goal) q.progress = Math.min(q.goal, q.progress + amount);
}

export const unreadMail = () => player.mail.filter((m) => !m.read || (m.gift && !m.claimed)).length;
export const claimableQuests = () => player.quests.filter((q) => !q.claimed && q.progress >= q.goal).length;
