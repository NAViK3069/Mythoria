import { heroById } from '@mythoria/game-data';
import { h, icon, toast } from './dom';
import { openPanel } from './Modal';
import { onChange, player } from './store';

/** The leader of the team in use (a crown on its picture). */
const leaderId = () => player.teams[player.activeTeam]?.leader ?? null;
import { clock, downLeft, hpShare, isDown, usePotion, useRevive, wakeFallen } from './vitals';

// The team on the map (like Honkai: Star Rail): the five heroes in the team down the left side, each with its lasting
// HP (ui/vitals.ts) - a fallen one greyed out with the time until it gets up. Tap one for a potion / a revive potion;
// with no team, a tap opens the team panel.

/** The bar, and a function to place it (Hud.ts puts it under the quest tracker). */
/** While a fight runs on the map: each hero's HP in it right now (shown instead of the lasting HP, live). */
let live: Map<string, number> | null = null;
let redraw: (() => void) | null = null;

/** Show the HP a fight on the map has them at (null: back to their lasting HP). */
export function showLiveHp(m: Map<string, number> | null): void {
  live = m;
  redraw?.();
}

export function partyBar(): HTMLElement {
  const list = h('div', { class: 'pt-list' });
  const bar = h('div', { class: 'party' }, list);
  let pop: HTMLElement | null = null;
  const closePop = () => {
    pop?.remove();
    pop = null;
  };
  document.addEventListener('pointerdown', (e) => {
    if (pop && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.pt-row')) closePop();
  });

  /** The potions for one hero, by its row. */
  const openPop = (id: string, row: HTMLElement) => {
    const was = pop?.dataset.id;
    closePop();
    if (was === id) return;
    const d = heroById(id);
    if (!d) return;
    const down = isDown(id);
    const act = (label: string, ico: string, n: number, use: () => string | null, ok: string) =>
      h('button', {
        class: 'pt-act px-cut', disabled: n <= 0,
        onclick: () => {
          const err = use();
          toast(err ?? ok);
          if (!err) closePop();
        },
      }, icon(ico, 22), h('span', null, label), h('b', { class: 'num' }, `x${n}`));
    pop = h('div', { class: 'pt-pop px-cut', 'data-id': id },
      h('div', { class: 'pt-pop-name' }, d.name, h('span', { class: 'num' }, down ? 'ล้มอยู่' : `เลือด ${Math.round(hpShare(id) * 100)}%`)),
      down
        ? act('ยาชุบชีวิต', 'revive', player.items.revive ?? 0, () => useRevive(id), `${d.name} ฟื้นแล้ว!`)
        : act('ยาฟื้นฟู', 'potion', player.items.potion ?? 0, () => usePotion(id), `${d.name} ฟื้นเลือดแล้ว`),
      h('button', { class: 'pt-act px-cut ghost', onclick: () => (closePop(), openPanel('team')) }, icon('team', 22), h('span', null, 'จัดทีม')));
    bar.appendChild(pop);
    pop.style.top = `${row.offsetTop}px`;
    // no room below (the dock): it opens upward from the row's bottom instead
    if (pop.getBoundingClientRect().bottom > window.innerHeight - 110) pop.style.top = `${row.offsetTop + row.offsetHeight - pop.offsetHeight}px`;
  };

  const rows = new Map<string, { row: HTMLElement; fill: HTMLElement; trail: HTMLElement; hp: HTMLElement; face: HTMLElement }>();
  const build = () => {
    rows.clear();
    closePop();
    const team = player.team.filter((id) => heroById(id));
    if (!team.length) {
      list.replaceChildren(h('button', { class: 'pt-empty px-cut', onclick: () => openPanel('team') }, icon('team', 22), 'จัดทีม'));
      return;
    }
    list.replaceChildren(...team.map((id) => {
      const d = heroById(id)!;
      // its element: before its name (PC), on the face's bottom-left corner (an upright phone, where there's no name)
      const face = h('div', { class: 'pt-face' },
        h('div', { class: 'pt-pic px-cut' }, h('img', { src: `assets/characters/heroes/${d.look}_face.png`, alt: '', draggable: false })),
        icon(`el_${d.element}`, 14, 'pt-el-corner'),
        // the team leader: a crown on the picture's top right corner
        id === leaderId() ? h('span', { class: 'tb-crown pt-crown', title: 'หัวหน้าทีม' }) : null);
      const fill = h('i', { class: 'pt-fill' });
      const trail = h('i', { class: 'pt-trail' });
      const hp = h('span', { class: 'pt-hp num' });
      const row = h('div', { class: 'pt-row', role: 'button', title: d.name, onclick: () => openPop(id, row) },
        face,
        h('div', { class: 'pt-info' },
          h('span', { class: 'pt-name' }, icon(`el_${d.element}`, 14, 'pt-el'), d.name),
          h('div', { class: 'pt-bar' }, trail, fill, h('i', { class: 'pt-ticks' })),
          hp));
      rows.set(id, { row, fill, trail, hp, face });
      return row;
    }));
    refresh();
  };
  let teamKey = '';
  const refresh = () => {
    const key = `${player.team.join(',')}|${leaderId()}`;
    if (key !== teamKey) {
      teamKey = key;
      build();
      return;
    }
    for (const [id, r] of rows) {
      const lv = live?.get(id);
      const s = lv ?? hpShare(id), down = s <= 0;
      r.row.classList.toggle('down', down);
      r.row.classList.toggle('low', !down && s < 0.3);
      r.row.classList.toggle('mid', !down && s >= 0.3 && s < 0.6);
      // the fill moves at once; a pale trail follows it down (a loss shows as a fading strip)
      r.fill.style.width = r.trail.style.width = `${s * 100}%`;
      // (a share, not HP points: the battle's max HP has row bonuses on top of the hero's own)
      if (down && lv != null) r.hp.textContent = 'ล้ม';
      else if (down) r.hp.replaceChildren(h('span', { class: 'pt-hp-lbl' }, 'ฟื้นใน '), clock(downLeft(id)));
      else r.hp.textContent = `${Math.round(s * 100)}%`;
    }
  };
  onChange(refresh);
  redraw = refresh;
  // the fallen's clocks tick; one whose wait is over gets up
  setInterval(() => {
    if (!wakeFallen() && [...rows.keys()].some(isDown)) refresh();
  }, 1000);
  wakeFallen();
  build();
  return bar;
}
