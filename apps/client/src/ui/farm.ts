import { FARM, MAP_SPAWNS, monsterById, type MonsterDef } from '@mythoria/game-data';
import { h, toast } from './dom';
import { changed, player } from './store';

// Auto-farm, like Ragnarok (ADR 0019): a button over the dock; it opens a list of the monsters on this map - tick the
// ones to farm (a kind unlocks once you've beaten it, FARM.needWin) - then the master walks to the nearest of them,
// fights it on the map, and goes on to the next, until you walk yourself, tap the button again, or the map changes.

export const farm = {
  on: false,
  /** Which monsters (ids) to go after. */
  picked: new Set<string>(),
};

let button: HTMLButtonElement | null = null;
let autoBtn: HTMLButtonElement | null = null;
/** The two buttons, one over the other. */
let stack: HTMLElement | null = null;

/** Fights on the map on auto (the AUTO switch under the farm button; on by default) - off: the turn-based screen. */
export const autoFight = (): boolean => player.settings.autoFight !== false;
let pop: HTMLElement | null = null;
let mapId = '';
let picture: (look: string) => HTMLCanvasElement = () => document.createElement('canvas');

const canFarm = (id: string) => !FARM.needWin || (player.beaten?.[id] ?? 0) > 0;

function paint(): void {
  if (button) {
    button.classList.toggle('on', farm.on);
    button.querySelector('.fm-state')!.textContent = farm.on ? 'กำลังฟาร์ม' : 'เลือกมอน';
  }
  if (autoBtn) {
    const on = autoFight();
    autoBtn.classList.toggle('on', on);
    autoBtn.querySelector('.fm-state')!.textContent = on ? 'สู้บนแผนที่' : 'เข้าหน้าสู้';
    autoBtn.title = on ? 'AUTO เปิด: สู้บนแผนที่แบบออโต้ (แตะเพื่อปิด = เข้าหน้าเทิร์นเบส)' : 'AUTO ปิด: ทุกการสู้เข้าหน้าเทิร์นเบส (แตะเพื่อเปิด)';
  }
}

/** Turn farming off (you walked, the team can't fight...), with why. */
export function stopFarm(why?: string): void {
  if (!farm.on) return;
  farm.on = false;
  paint();
  if (why) toast(why);
}

function closePop(): void {
  pop?.remove();
  pop = null;
}

function openPop(): void {
  closePop();
  const kinds = (MAP_SPAWNS[mapId] ?? []).map((s) => monsterById(s.monster)).filter((d): d is MonsterDef => !!d);
  const row = (d: MonsterDef) => {
    const ok = canFarm(d.id);
    const on = farm.picked.has(d.id);
    const pic = picture(d.look);
    pic.className = 'fm-pic';
    return h('button', {
      class: `fm-row${on ? ' on' : ''}${ok ? '' : ' locked'}`,
      disabled: !ok,
      title: ok ? d.name : `${d.name} — ชนะ 1 ครั้งก่อนถึงจะฟาร์มได้`,
      onclick: () => {
        if (on) farm.picked.delete(d.id);
        else farm.picked.add(d.id);
        openPop();
      },
    },
      h('span', { class: 'fm-check' }, on ? '✓' : ''),
      pic,
      h('span', { class: 'fm-name' }, d.miniBoss ? h('b', { class: 'fm-boss' }, 'บอส') : null, d.name),
      h('span', { class: 'fm-lv num' }, ok ? `Lv.${d.level}` : 'ล็อก'));
  };
  pop = h('div', { class: 'fm-pop px-cut' },
    h('div', { class: 'fm-title' }, 'เลือกมอนสเตอร์ที่จะฟาร์ม'),
    h('div', { class: 'fm-list' }, kinds.map(row)),
    h('div', { class: 'note fm-note' }, FARM.needWin ? 'ฟาร์มได้เฉพาะมอนที่เคยชนะแล้ว · เดินเอง = หยุดฟาร์ม' : 'เดินเอง = หยุดฟาร์ม'),
    h('div', { class: 'fm-btns' },
      farm.on
        ? h('button', { class: 'fm-go stop px-cut', onclick: () => (stopFarm(), closePop()) }, 'หยุดฟาร์ม')
        : h('button', {
          class: 'fm-go px-cut',
          disabled: ![...farm.picked].some(canFarm),
          onclick: () => {
            farm.on = true;
            paint();
            closePop();
          },
        }, 'เริ่มฟาร์ม'),
      h('button', { class: 'fm-close px-cut', onclick: closePop }, 'ปิด')));
  document.getElementById('ui')?.append(pop);
}

/** The farm button for this map (none on a map without monsters, the town). */
export function setupFarm(map: string, pic: (look: string) => HTMLCanvasElement): void {
  mapId = map;
  picture = pic;
  closePop();
  stack?.remove();
  stack = button = autoBtn = null;
  // (a new map: what was picked there means nothing here)
  farm.on = false;
  for (const id of [...farm.picked]) if (!(MAP_SPAWNS[map] ?? []).some((s) => s.monster === id)) farm.picked.delete(id);
  if (!(MAP_SPAWNS[map] ?? []).length) return;
  button = h('button', { class: 'farm-btn px-cut', title: 'ฟาร์ม: เดินไปสู้มอนที่เลือกเองวนไป', onclick: () => (pop ? closePop() : openPop()) },
    h('span', { class: 'fm-icon' }, 'ฟาร์ม'), h('span', { class: 'fm-state' }, 'เลือกมอน'));
  // under it: the AUTO switch - fights on the map on auto, or on the turn-based screen
  autoBtn = h('button', {
    class: 'farm-btn auto-btn px-cut',
    onclick: () => {
      player.settings.autoFight = !autoFight();
      changed();
      paint();
    },
  }, h('span', { class: 'fm-icon' }, 'AUTO'), h('span', { class: 'fm-state' }, ''));
  stack = h('div', { class: 'farm-stack' }, button, autoBtn);
  document.getElementById('ui')?.append(stack);
  paint();
}

/** Can this one be farmed now (picked, unlocked)? */
export function farmWants(id: string): boolean {
  return farm.on && farm.picked.has(id) && canFarm(id);
}
