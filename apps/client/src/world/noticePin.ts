import type { RGB, Surface } from '../fx/surface';

// The pin a monster shows over its head as it notices you (world/Monsters.ts), drawn after the owner's sketch: a map
// pin with a turning arrow inside, and round its head a ring that fills like a loading bar. Our own pixels, drawn on
// the map's effect layer each frame.

/** '#' outline, 'o' fill, 'a' the turning arrow (a "C" round to an arrowhead at the top right). */
const PIN = [
  '...#####...',
  '..#ooooo#..',
  '.#oaaaaoo#.',
  '#oaooooaoo#',
  '#oaoooaaao#',
  '#oaooooaoo#',
  '#oaooooooo#',
  '.#oaaaooo#.',
  '..#ooooo#..',
  '...#ooo#...',
  '....#o#....',
  '.....#.....',
];
const W = PIN[0].length;
/** The pin's head: where the ring goes round. */
const HEAD = { x: 5, y: 4.5 };
const R = 8;

/** The ring's pixels in order, clockwise from the top. */
const RING: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(Math.cos(a) * R), y = Math.round(Math.sin(a) * R);
    const k = `${x},${y}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ x, y });
    }
  }
  return out;
})();

/**
 * The pin with its tip at (x, y); k: how full the ring is (0..1). chasing: full and red, pulsing (it's after you).
 * t: a clock (s) for the pulse.
 */
export function drawPin(s: Surface, x: number, y: number, k: number, chasing: boolean, t: number): void {
  const x0 = x - Math.floor(W / 2), y0 = y - PIN.length + 1;
  const cx = x0 + Math.round(HEAD.x), cy = y0 + Math.round(HEAD.y);
  // the ring: a dark track, lit clockwise from the top - gold, orange, then red as it fills
  const lit = Math.round(RING.length * Math.min(1, k));
  const hot: RGB = chasing ? 0xff4040 : k > 0.75 ? 0xff7a3a : k > 0.45 ? 0xffb43a : 0xffe07a;
  const pulse = chasing ? 0.7 + 0.3 * Math.sin(t * 12) : 1;
  RING.forEach((p, i) => {
    if (i < lit) s.px(cx + p.x, cy + p.y, hot, pulse);
    else s.px(cx + p.x, cy + p.y, 0x0c1218, 0.6);
  });
  // the head of the bar: a white spark where the light has got to
  if (!chasing && lit > 0 && lit < RING.length) {
    const p = RING[lit - 1];
    s.px(cx + p.x, cy + p.y, 0xffffff);
  }
  const fill: RGB = chasing ? 0xffe2dc : 0xfff6dc, arrow: RGB = chasing ? 0xd02020 : 0x3a2a12;
  PIN.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '.') continue;
      s.px(x0 + i, y0 + j, c === '#' ? 0x1a0f06 : c === 'a' ? arrow : fill);
    }
  });
}
