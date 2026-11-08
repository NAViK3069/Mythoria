// A tiny DOM builder: h('div', { class: 'x', onclick }, child, 'text', ...)

type Child = Node | string | number | false | null | undefined | Child[];
type Attrs = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** A pixel icon from assets/ui/icons. */
export function icon(name: string, size = 32, cls = ''): HTMLImageElement {
  return h('img', { class: `px-icon ${cls}`, src: `assets/ui/icons/${name}.png`, width: size, height: size, alt: '', draggable: false });
}

/** 12500 -> "12,500"; 1250000 -> "1.25M" */
export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  return n.toLocaleString('en-US');
}

let toastTimer = 0;
/** A short message at the top of the screen. */
export function toast(text: string): void {
  let t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast' });
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.remove('show');
  void t.offsetWidth; // restart the animation
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 2200);
}
