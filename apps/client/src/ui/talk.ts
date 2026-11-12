import { h } from './dom';
import { addBlocker, openPanel } from './Modal';

/** What a conversation shows. */
export interface Talk {
  name: string;
  role: string;
  lines: string[];
  /** Their face, drawn from their own parts. */
  portrait: HTMLCanvasElement;
  /** The button after the last line, and the panel it opens. */
  action?: { label: string; panel: string };
  onClose?: () => void;
}

let box: HTMLElement | null = null;
let closeIt: (() => void) | null = null;

/** Is someone talking? (The hero keeps still meanwhile.) */
export const talkOpen = (): boolean => !!box;
addBlocker(talkOpen);

/**
 * Talk to someone: a box over the bottom of the screen with their face and name, their lines typed out
 * one at a time (tap, E, Enter or Space: finish the line / next line; Esc: leave), and at the end what
 * they can do for you (open their shop, the guild...) or goodbye.
 */
export function openTalk(t: Talk): void {
  closeTalk();
  const text = h('div', { class: 'tk-text' });
  const more = h('div', { class: 'tk-more' });
  const actions = h('div', { class: 'tk-actions' });
  const face = h('div', { class: 'tk-face px-cut' }, t.portrait);
  const root = h('div', { class: 'talk px-cut', role: 'dialog', 'aria-label': t.name },
    face,
    h('div', { class: 'tk-main' },
      h('div', { class: 'tk-head' }, h('b', { class: 'tk-name' }, t.name), h('span', { class: 'tk-role' }, t.role)),
      text, actions),
    more);
  document.getElementById('ui')?.appendChild(root);
  box = root;
  requestAnimationFrame(() => root.classList.add('show'));

  let line = 0, shown = 0, timer = 0;
  const typing = () => shown < t.lines[line].length;
  const render = () => {
    text.textContent = t.lines[line].slice(0, shown);
    more.classList.toggle('on', !typing() && line < t.lines.length - 1);
  };
  const type = () => {
    window.clearInterval(timer);
    shown = 0;
    render();
    timer = window.setInterval(() => {
      // Thai vowels and tone marks ride on the letter before them: never stop between them
      shown = Math.min(t.lines[line].length, shown + 1);
      while (shown < t.lines[line].length && /[ัิ-ฺ็-๎]/.test(t.lines[line][shown])) shown++;
      render();
      if (!typing()) {
        window.clearInterval(timer);
        if (line === t.lines.length - 1) end();
      }
    }, 28);
  };
  const end = () => {
    if (actions.childElementCount) return;
    if (t.action) {
      const a = t.action;
      actions.append(h('button', { class: 'tk-btn tk-go px-cut', onclick: (e: Event) => (e.stopPropagation(), close(), openPanel(a.panel)) }, a.label));
    }
    actions.append(h('button', { class: 'tk-btn px-cut', onclick: (e: Event) => (e.stopPropagation(), close()) }, 'ลาก่อน'));
  };
  const next = () => {
    if (typing()) {
      shown = t.lines[line].length;
      window.clearInterval(timer);
      render();
      if (line === t.lines.length - 1) end();
    } else if (line < t.lines.length - 1) {
      line++;
      type();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'e') {
      e.preventDefault();
      // at the end, Enter / E does what they offer (or says goodbye)
      if (!typing() && line === t.lines.length - 1) (actions.firstElementChild as HTMLButtonElement | null)?.click();
      else next();
    }
  };
  const close = () => {
    if (box !== root) return;
    window.clearInterval(timer);
    window.removeEventListener('keydown', onKey, true);
    box = null;
    closeIt = null;
    root.classList.remove('show');
    root.classList.add('closing');
    setTimeout(() => root.remove(), 180);
    t.onClose?.();
  };
  root.addEventListener('click', next);
  // the key that opened the talk mustn't also answer it
  setTimeout(() => window.addEventListener('keydown', onKey, true), 0);
  closeIt = close;
  type();
}

export function closeTalk(): void {
  closeIt?.();
}

let prompt: HTMLButtonElement | null = null;
let onPrompt: (() => void) | null = null;

/** "Talk to …" over the bottom of the screen when someone's close enough (null hides it). */
export function talkPrompt(name: string | null, use?: () => void): void {
  onPrompt = use ?? null;
  if (!prompt || !prompt.isConnected) {
    prompt = h('button', { class: 'warp-prompt door-prompt talk-prompt px-cut', onclick: () => onPrompt?.() });
    document.getElementById('ui')?.appendChild(prompt);
  }
  if (name)
    prompt.replaceChildren(
      h('span', { class: 'wp-ico tk-bubble' }, h('i'), h('i'), h('i')),
      h('span', { class: 'wp-text' }, h('b', null, name), h('small', null, 'แตะเพื่อคุย')),
      h('kbd', null, 'E'),
    );
  prompt.classList.toggle('show', !!name);
}
