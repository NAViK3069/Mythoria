import { h, icon, toast } from './dom';
import { openPanel } from './Modal';
import type { Door } from '../world/meadowMap';

/** The icon on a door's prompt, by the panel it opens. */
const ICON: Record<string, string> = { shop: 'shop', guild: 'guild', summon: 'summon', quests: 'quest' };

let prompt: HTMLButtonElement | null = null;
let current: Door | null = null;

/** Go in: open the door's panel, or say it isn't open yet. */
export function useDoor(d: Door): void {
  if (d.panel) openPanel(d.panel);
  else toast(`${d.name} — เร็วๆ นี้`);
}

/** Show the prompt for the door the hero stands at (null hides it). */
export function doorPrompt(d: Door | null): void {
  current = d;
  if (!prompt || !prompt.isConnected) {
    prompt = h('button', { class: 'warp-prompt door-prompt px-cut', onclick: () => current && useDoor(current) });
    document.getElementById('ui')?.appendChild(prompt);
  }
  if (d)
    prompt.replaceChildren(
      h('span', { class: 'wp-ico' }, icon(d.panel ? ICON[d.panel] ?? 'key' : 'key', 26)),
      h('span', { class: 'wp-text' }, h('b', null, d.name), h('small', null, d.panel ? d.sub : 'ยังไม่เปิด — เร็วๆ นี้')),
      h('kbd', null, 'E'),
    );
  prompt.classList.toggle('show', !!d);
}
