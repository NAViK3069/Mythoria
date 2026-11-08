import { fmt, h, icon } from './dom';

export interface RewardItem {
  icon: string;
  amount: number;
  label?: string;
}

/** gems/gold reward -> popup items */
export function rewardItems(r: { gems?: number; gold?: number }): RewardItem[] {
  const out: RewardItem[] = [];
  if (r.gems) out.push({ icon: 'gem', amount: r.gems, label: 'เพชร' });
  if (r.gold) out.push({ icon: 'gold', amount: r.gold, label: 'ทอง' });
  return out;
}

let open: HTMLElement | null = null;

/**
 * The "you got something" moment: light rays turn behind a gold ribbon, each
 * item pops in after the last, sparks fly. Tap anywhere (or Esc / Enter) to close.
 */
export function showRewards(items: RewardItem[], title = 'ได้รับรางวัล!'): void {
  open?.remove();
  const sparks = h('div', { class: 'rw-sparks' },
    Array.from({ length: 18 }, (_, i) => {
      const s = h('i');
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const d = 120 + Math.random() * 110;
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d * 0.7}px`);
      s.style.animationDelay = `${0.15 + Math.random() * 0.25}s`;
      return s;
    }));
  const root = h('div', { class: 'reward-pop', role: 'dialog' },
    h('div', { class: 'rw-rays' }),
    sparks,
    h('div', { class: 'rw-box' },
      h('div', { class: 'rw-title' }, h('span', null, title)),
      h('div', { class: 'rw-items' },
        items.map((it, i) =>
          h('div', { class: 'rw-item', style: `animation-delay:${0.25 + i * 0.12}s` },
            h('div', { class: 'rw-slot px-cut' }, h('span', { class: 'px-cut' }, icon(it.icon, 56))),
            h('div', { class: 'rw-amt num' }, `x${fmt(it.amount)}`),
            it.label ? h('div', { class: 'rw-lbl' }, it.label) : null))),
      h('div', { class: 'rw-hint' }, 'แตะเพื่อปิด')));
  const close = () => {
    if (open !== root) return;
    open = null;
    window.removeEventListener('keydown', onKey, true);
    root.classList.add('closing');
    setTimeout(() => root.remove(), 200);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation(); // don't also close the panel underneath
      close();
    }
  };
  // ignore the tap that opened it
  setTimeout(() => root.addEventListener('pointerdown', close), 350);
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(root);
  open = root;
}

/** Is a reward popup showing? (the game stands still meanwhile) */
export const rewardOpen = () => !!open;
