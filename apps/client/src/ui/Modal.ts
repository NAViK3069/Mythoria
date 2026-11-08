import { h, icon } from './dom';

/** A gold pixel frame round some content. */
export function frame(cls: string, ...content: (Node | string | null | false | undefined)[]): HTMLDivElement {
  return h('div', { class: `frame px-cut ${cls}` }, h('div', { class: 'fill px-cut' }, ...content));
}

export interface PanelDef {
  title: string;
  icon: string;
  narrow?: boolean;
  /** Tabs across the top; the body is rebuilt for each. */
  tabs?: { id: string; label: string }[];
  build(body: HTMLElement, tab: string, ctx: PanelContext): void;
}

export interface PanelContext {
  /** Rebuild the current tab (after data changes). */
  refresh(): void;
  close(): void;
  open(id: string, tab?: string): void;
}

let current: { root: HTMLElement; id: string; tab: string; def: PanelDef } | null = null;
const registry = new Map<string, PanelDef>();

export function registerPanel(id: string, def: PanelDef): void {
  registry.set(id, def);
}

/** Is a panel open? The game ignores movement input while one is. */
export function uiBlocking(): boolean {
  if (current) return true;
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
}

export function closePanel(): void {
  if (!current) return;
  const root = current.root;
  current = null;
  root.classList.add('closing');
  setTimeout(() => root.remove(), 170);
}

export function openPanel(id: string, tab?: string): void {
  const def = registry.get(id);
  if (!def) return;
  if (current) {
    current.root.remove();
    current = null;
  }
  const activeTab = tab ?? def.tabs?.[0]?.id ?? '';
  const body = h('div', { class: 'panel-body' });
  const tabBar = def.tabs
    ? h(
        'div',
        { class: 'tabs' },
        def.tabs.map((t) =>
          h('button', { class: `tab px-cut ${t.id === activeTab ? 'on' : ''}`, 'data-tab': t.id, onclick: () => switchTab(t.id) }, t.label),
        ),
      )
    : null;
  const panel = frame(
    `panel ${def.narrow ? 'narrow' : ''}`,
    h('div', { class: 'panel-head' }, icon(def.icon, 32), h('h2', null, def.title), h('button', { class: 'x-btn px-cut', onclick: closePanel, 'aria-label': 'ปิด' }, '✕')),
    ...(tabBar ? [tabBar] : []),
    body,
  );
  const root = h('div', { class: 'modal-root', onpointerdown: (e: PointerEvent) => e.target === root && closePanel() }, panel);
  // keep taps inside the UI from reaching the game
  root.addEventListener('wheel', (e) => e.stopPropagation());
  document.body.appendChild(root);
  current = { root, id, tab: activeTab, def };

  const ctx: PanelContext = {
    refresh: () => current && current.root === root && render(),
    close: closePanel,
    open: openPanel,
  };
  const render = () => {
    body.replaceChildren();
    def.build(body, current!.tab, ctx);
  };
  const switchTab = (t: string) => {
    if (!current || current.root !== root) return;
    current.tab = t;
    tabBar?.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === t));
    body.scrollTop = 0;
    render();
  };
  render();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePanel();
});
