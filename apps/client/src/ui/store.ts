// Player data the UI shows. For now it lives in this browser (sample values,
// saved to localStorage); later it comes from the server through GameService.

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
  settings: Settings;
}

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
    items: { potion: 3, chest: 1, key: 1, book: 1 },
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
    settings: { music: 70, sfx: 80, effects: 'high', showFps: false, language: 'th' },
  };
}

function load(): PlayerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    /* storage blocked: play without saving */
  }
  return fresh();
}

export const player: PlayerState = load();

const listeners = new Set<() => void>();
let saveTimer = 0;

/** Something changed: redraw whatever shows player data, and save soon. */
export function changed(): void {
  for (const fn of listeners) fn();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(player));
    } catch {
      /* ignore */
    }
  }, 300);
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
