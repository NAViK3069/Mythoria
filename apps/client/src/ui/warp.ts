import { h, icon } from './dom';
import { closePanel, openPanel, registerPanel } from './Modal';

/** A pad you can warp to, as the panel shows it. */
export interface WarpPoint {
  id: string;
  name: string;
  sub: string;
  x: number;
  y: number;
}

interface WarpContext {
  points: WarpPoint[];
  /** Other maps you can travel to from here (a locked one is shown greyed out). */
  maps: { id: string; name: string; sub: string; locked?: boolean }[];
  /** The pad the hero stands on (it can't be picked). */
  here: string | null;
  /** A little picture of the map round (x, y). */
  thumb(x: number, y: number): HTMLCanvasElement;
  go(id: string): void;
}

let ctx: WarpContext | null = null;

registerPanel('warp', {
  title: 'จุดวาป',
  icon: 'map',
  narrow: true,
  build(body) {
    if (!ctx) return;
    const c = ctx;
    const others = c.points.filter((p) => p.id !== c.here);
    body.append(
      h('p', { class: 'warp-hint' }, 'เดินทางไปแผนที่อื่น'),
      h('div', { class: 'warp-maps' },
        c.maps.map((m) =>
          h('button', {
            class: `warp-gate px-cut ${m.locked ? 'locked' : ''}`,
            disabled: !!m.locked,
            onclick: () => {
              closePanel();
              c.go(`map:${m.id}`);
            },
          },
            h('div', { class: 'wg-seal' }, icon(m.locked ? 'key' : 'map', 28)),
            h('div', { class: 'warp-text' }, h('b', null, m.name), h('span', null, m.sub)),
            h('div', { class: `warp-go ${m.locked ? 'locked' : ''}` }, m.locked ? 'ล็อก' : 'เดินทาง')))),
      others.length ? h('p', { class: 'warp-hint' }, 'หรือวาปไปแท่นอื่นในแผนที่นี้') : '',
      h('div', { class: 'warp-list' },
        c.points.map((p) => {
          const here = p.id === c.here;
          return h('button', {
            class: `warp-card px-cut ${here ? 'here' : ''}`,
            disabled: here,
            onclick: () => {
              closePanel();
              c.go(p.id);
            },
          },
            (() => {
              const pic = c.thumb(p.x, p.y);
              return h('div', { class: 'warp-thumb px-cut' }, pic, h('i', { class: 'warp-pin', style: `left:${pic.dataset.pinX ?? '50%'};top:${pic.dataset.pinY ?? '50%'}` }));
            })(),
            h('div', { class: 'warp-text' }, h('b', null, p.name), h('span', null, p.sub)),
            h('div', { class: 'warp-go' }, here ? 'อยู่ที่นี่' : 'วาป'));
        })),
    );
  },
});

let prompt: HTMLButtonElement | null = null;

/** Set what the warp panel offers. */
export function setWarpContext(c: WarpContext): void {
  ctx = c;
}

/** Show the "warp" button while the hero stands on a pad (null hides it). */
export function warpPrompt(here: string | null): void {
  if (ctx) ctx.here = here;
  if (!prompt || !prompt.isConnected) {
    prompt = h('button', { class: 'warp-prompt px-cut', onclick: () => openPanel('warp') },
      h('span', { class: 'wp-ico' }, icon('map', 26)),
      h('span', { class: 'wp-text' }, h('b', null, 'แท่นวาป'), h('small', null, 'แตะเพื่อเลือกจุดหมาย')),
      h('kbd', null, 'E'));
    document.getElementById('ui')?.appendChild(prompt);
  }
  prompt.classList.toggle('show', !!here);
}

/** Open the panel from the keyboard (E / Enter) when on a pad. */
export function openWarpPanel(): void {
  openPanel('warp');
}
