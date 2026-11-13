import { VITALS } from '@mythoria/game-data';
import { changed, player, type OwnedHero } from './store';

// Heroes' lasting HP (like Honkai: Star Rail): a battle starts each hero with the HP it ended the last one with, and
// writes back what's left; outside battle only a potion heals, a revive potion (or a long wait) gets a fallen hero up.
// Numbers: VITALS in @mythoria/game-data (first draft).

const owned = (id: string): OwnedHero | undefined => player.heroes.find((h) => h.id === id);

const COOLDOWN = VITALS.reviveMinutes * 60_000;

/** A fallen hero whose wait is over gets up (with VITALS.reviveHpPct). True if anyone did. */
export function wakeFallen(now = Date.now()): boolean {
  let any = false;
  for (const h of player.heroes)
    if (h.hp === 0 && (h.downAt == null || now - h.downAt >= COOLDOWN)) {
      h.hp = VITALS.reviveHpPct / 100;
      delete h.downAt;
      any = true;
    }
  if (any) changed();
  return any;
}

/** Its HP now as a share of its max (0..1). */
export function hpShare(id: string): number {
  const h = owned(id);
  return h?.hp ?? 1;
}

export const isDown = (id: string): boolean => hpShare(id) <= 0;

/** How long until a fallen hero gets up by itself (ms; 0 if it isn't down). */
export function downLeft(id: string, now = Date.now()): number {
  const h = owned(id);
  if (!h || h.hp !== 0) return 0;
  return Math.max(0, (h.downAt ?? now) + COOLDOWN - now);
}

/** After a battle: what it has left (HP, max). 0 = it fell. */
export function setHp(id: string, hp: number, max: number): void {
  const h = owned(id);
  if (!h) return;
  const share = Math.max(0, Math.min(1, hp / Math.max(1, max)));
  if (share <= 0) {
    if (h.hp !== 0) h.downAt = Date.now();
    h.hp = 0;
  } else {
    h.hp = share >= 0.999 ? undefined : share;
    delete h.downAt;
  }
}

/** Heroes in the team who can fight (not down). */
export function fitTeam(ids: string[]): string[] {
  return ids.filter((id) => !isDown(id));
}

/** Use a potion on a hero: heals VITALS.items.potion.healPct of its max. An error to show, or null if it worked. */
export function usePotion(id: string): string | null {
  const h = owned(id);
  if (!h) return 'ไม่มีฮีโร่ตัวนี้';
  if ((player.items.potion ?? 0) <= 0) return 'ยาฟื้นฟูหมดแล้ว';
  if (isDown(id)) return 'ฮีโร่ล้มอยู่ ต้องใช้ยาชุบชีวิต';
  if (hpShare(id) >= 1) return 'เลือดเต็มอยู่แล้ว';
  player.items.potion--;
  const s = Math.min(1, hpShare(id) + VITALS.items.potion.healPct / 100);
  h.hp = s >= 1 ? undefined : s;
  changed();
  return null;
}

/** Use a revive potion on a fallen hero: up with VITALS.items.revive.hpPct. */
export function useRevive(id: string): string | null {
  const h = owned(id);
  if (!h) return 'ไม่มีฮีโร่ตัวนี้';
  if (!isDown(id)) return 'ฮีโร่ตัวนี้ยังไม่ล้ม';
  if ((player.items.revive ?? 0) <= 0) return 'ยาชุบชีวิตหมดแล้ว';
  player.items.revive--;
  h.hp = VITALS.items.revive.hpPct / 100;
  delete h.downAt;
  changed();
  return null;
}

/** m:ss / h:mm:ss for a wait. */
export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}
