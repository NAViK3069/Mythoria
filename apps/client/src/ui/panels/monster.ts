import { ELEMENTS, RARITIES, STATS, monsterById, type MonsterDef } from '@mythoria/game-data';
import { h, icon } from '../dom';
import { registerPanel, openPanel } from '../Modal';
import { elementIcon } from './heroes';

// A monster you walked up to on the map: what it is, how strong, what it does - and the button that starts the
// fight (world/BattleStage.ts).

let picture: HTMLCanvasElement | null = null;
let fight: (() => void) | null = null;
let fieldFight: (() => void) | null = null;

/**
 * What the fight buttons do (the world starts a battle with the monster whose card is open): `fn` on the turn-based
 * screen (you choose the moves), `field` right here on the map on auto (ADR 0019).
 */
export function setFight(fn: (() => void) | null, field: (() => void) | null = null): void {
  fight = fn;
  fieldFight = field;
}

/** Show a monster's card, with its picture (drawn by the world from its own frames). */
export function showMonster(def: MonsterDef, pic: HTMLCanvasElement): void {
  picture = pic;
  openPanel('monster', def.id);
}

registerPanel('monster', {
  title: 'มอนสเตอร์',
  icon: 'battle',
  build(body, id) {
    const def = monsterById(id);
    if (!def) {
      body.append(h('div', { class: 'empty' }, 'ไม่พบมอนสเตอร์'));
      return;
    }
    const element = ELEMENTS.find((e) => e.id === def.element);
    const fmt = (v: number, pct?: boolean) => (pct ? `${v}%` : v.toLocaleString('en-US'));
    const skill = (tag: string, name: string, text: string, extra?: string) =>
      h('div', { class: 'hd-skill px-cut' },
        h('div', { class: 'hs-head' }, h('span', { class: 'hs-tag' }, tag), h('b', null, name), extra ? h('span', { class: 'hs-cost' }, extra) : null),
        h('div', { class: 'hs-text' }, text));
    body.append(
      h('div', { class: `hero-detail monster-detail ${def.miniBoss ? 'is-boss' : ''}` },
        h('div', { class: 'hd-left' },
          h('div', { class: 'hd-stage md-stage' }, picture ? (picture.classList.add('md-pic'), picture) : null),
          def.miniBoss ? h('div', { class: 'md-boss px-cut' }, 'มินิบอส') : null,
          h('div', { class: 'hd-name' }, def.name),
          h('div', { class: 'hd-tags' },
            h('span', { class: 'hd-tag', style: `color:${RARITIES.find((r) => r.id === def.rarity)?.color ?? '#fff'}` }, RARITIES.find((r) => r.id === def.rarity)?.name ?? ''),
            h('span', { class: 'hd-tag' }, `Lv. ${def.level}`),
            h('span', { class: 'hd-tag' }, elementIcon(def.element, 18), element?.name ?? '')),
          h('div', { class: 'hd-title md-text' }, def.text)),
        h('div', { class: 'hd-right' },
          h('h4', null, 'ค่าสถานะ'),
          h('div', { class: 'hd-stats' },
            STATS.map((s) => h('div', { class: 'hd-stat' }, h('span', null, s.name), h('b', { class: 'num' }, fmt(def.base[s.id], s.pct))))),
          h('h4', null, 'การโจมตีและสกิล'),
          skill('ตีปกติ', def.normal.name, def.normal.text),
          def.skills.map((s) => skill('สกิล', s.name, s.text, `ทุก ${s.every} เทิร์น`)),
          h('div', { class: 'md-fight px-cut' },
            h('button', { class: 'md-fight-btn px-cut', disabled: !fight, onclick: () => fight?.(), title: 'หน้าต่อสู้เทิร์นเบส: เลือกท่าเอง' }, icon('battle', 20), 'ต่อสู้'),
            h('button', { class: 'md-fight-btn field px-cut', disabled: !fieldFight, onclick: () => fieldFight?.(), title: 'สู้ตรงนี้บนแผนที่ แบบออโต้ (เปิดหน้าต่อสู้ทีหลังได้)' }, 'สู้ในแผนที่ (ออโต้)'),
            h('span', null, def.miniBoss ? 'มินิบอสมาพร้อมลูกน้อง 2 ตัว' : 'มากันเป็นกลุ่ม 3 ตัว')))),
    );
  },
});

let prompt: HTMLButtonElement | null = null;
let onPrompt: (() => void) | null = null;

/** "Lv.3 Poison mushroom - tap to look": shown while you stand by a monster (null: hide). */
export function monsterPrompt(def: MonsterDef | null, use?: () => void): void {
  onPrompt = use ?? null;
  if (!prompt || !prompt.isConnected) {
    prompt = h('button', { class: 'warp-prompt door-prompt mon-prompt px-cut', onclick: () => onPrompt?.() });
    document.getElementById('ui')?.appendChild(prompt);
  }
  if (def)
    prompt.replaceChildren(
      h('span', { class: 'wp-ico' }, icon('battle', 22)),
      h('span', { class: 'wp-text' }, h('b', null, `${def.miniBoss ? 'มินิบอส · ' : ''}${def.name}`), h('small', null, `Lv.${def.level} · แตะเพื่อดูข้อมูล`)),
      h('kbd', null, 'E'),
    );
  prompt.classList.toggle('show', !!def);
}
