import type { MonsterDef } from '@mythoria/game-data';
import { h, icon } from './dom';

// The bar shown while a fight runs on the map (world/FieldFight.ts): just the monster - its name, level and HP (its
// whole group's) - and หน้าต่อสู้ to carry the same fight on to the turn-based screen. No flee button: walking away
// from the fight is fleeing (the owner's call). Over the dock on a computer; on an upright phone up top, in the clear
// space under the top bar between the minimap and the side menu.

let bar: HTMLElement | null = null;
let fill: HTMLElement | null = null;
let pct: HTMLElement | null = null;

/** The monster's side's HP (a share of its group's total). */
export function fightBarHp(them: number): void {
  const k = Math.max(0, Math.min(1, them));
  if (fill) fill.style.width = `${k * 100}%`;
  if (pct) pct.textContent = `${Math.ceil(k * 100)}%`;
}

export function showFightBar(def: MonsterDef, actions: { open: () => void }): void {
  hideFightBar();
  fill = h('i', { class: 'ff-fill' });
  pct = h('span', { class: 'ff-pct num' }, '100%');
  bar = h('div', { class: `ff-bar px-cut${def.miniBoss ? ' boss' : ''}` },
    h('div', { class: 'ff-info' },
      h('div', { class: 'ff-who' },
        icon('battle', 16),
        h('span', { class: 'ff-lv num' }, `Lv.${def.level}`),
        h('span', { class: 'ff-name' }, def.name)),
      h('div', { class: 'ff-hp' }, h('span', { class: 'ff-gauge' }, fill), pct)),
    h('button', { class: 'ff-btn open px-cut', onclick: actions.open, title: 'เปิดการต่อสู้นี้ในหน้าเทิร์นเบส (เลือกท่าเอง)' }, 'หน้าต่อสู้'));
  document.getElementById('ui')?.append(bar);
}

export function hideFightBar(): void {
  bar?.remove();
  bar = fill = pct = null;
}
