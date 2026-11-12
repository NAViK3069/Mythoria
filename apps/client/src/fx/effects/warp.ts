// Mythoria's warp - our own design, drawn on our own little engine (fx/surface.ts), no outside code.
//
//  * The pad: a ring of runes set flush into the ground, its carved lines glowing and breathing.
//  * Warp out ("ascension"): a sigil opens under the feet and motes spiral in; the hero ignites into light,
//    then comes apart from the feet up, each speck rising in a helix up a soft pillar of light that climbs
//    far into the sky and fades away up there; the pillar thins out and the sigil closes.
//  * Warp in ("descent"): a falling star drops onto the pad; a pillar of light blooms where it lands and a
//    ripple runs out over the ground; motes spiral down and condense into the hero from the feet up, each
//    speck white-hot when it lands and cooling to its own colour; the pillar thins and fades.
//
// Everything is at the map's own scale (1 unit = 1 world px; the hero is 32 px tall) with (0, 0) the hero's
// feet. The timings are the OUT / IN tables below; the look is the colours and the sizes next to them.

import { mixRGB, type PixelEffect, type RGB, type Surface } from '../surface';

const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - clamp(t)) ** 3;
const easeIn = (t: number) => clamp(t) ** 2;
/** A seeded random number generator, so the same warp always looks the same. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Arcane light, deep violet to white. */
const L = [0x140a33, 0x2b1a6e, 0x3a35b8, 0x3f74e8, 0x45b8ff, 0x9ce9ff, 0xe2fbff, 0xffffff];
/** Gold, for a few sparks. */
const GOLD = [0xd8962a, 0xffd36b, 0xfff1b0];

/** The hero, as pixels round their feet (colour 0xAABBGGRR as the snapshot gives, 0 = empty). */
export interface Actor {
  pixels: Uint32Array;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** The hero's filled pixels as 0xRRGGBB colours, and how tall they are. */
function bodyOf(A: Actor) {
  const px: { x: number; y: number; c: RGB; rim: boolean }[] = [];
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < A.w && y < A.h && A.pixels[y * A.w + x] !== 0;
  let top = 0;
  for (let y = 0; y < A.h; y++)
    for (let x = 0; x < A.w; x++) {
      const v = A.pixels[y * A.w + x];
      if (!v) continue;
      const c = ((v & 255) << 16) | (((v >> 8) & 255) << 8) | ((v >> 16) & 255);
      px.push({ x: A.x + x, y: A.y + y, c, rim: !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1) });
      top = Math.min(top, A.y + y);
    }
  return { px, top, height: Math.max(1, -top) };
}

// ---- shared pieces --------------------------------------------------------------------------------------

/**
 * The sigil on the ground: two rings drawn round to `open` (0..1 of a turn), glyphs where the arc has
 * passed, a six-pointed star inside once it's mostly open. k: brightness.
 */
function sigil(s: Surface, open: number, k: number, turn: number, rx = 34, ry = 15): void {
  if (k <= 0.01 || open <= 0) return;
  const start = -Math.PI / 2 + turn;
  const arc = open * TAU;
  const ring = (r: number, step: number, c: RGB, a: number) => {
    for (let g = 0; g < arc; g += step) {
      const x = Math.cos(start + g) * rx * r, y = Math.sin(start + g) * ry * r;
      const head = arc - g < 0.25 && open < 1;
      s.px(x, y, head ? L[6] : c, a * Math.min(1, k));
      s.add(x, y, L[4], 0.12 * k);
    }
  };
  ring(1, 0.035, L[5], 0.95);
  ring(0.7, 0.05, L[4], 0.8);
  // glyphs between the rings: small marks, each its own shape
  for (let i = 0; i < 12; i++) {
    const g = (i / 12) * TAU;
    if (g > arc) continue;
    const x = Math.cos(start + g) * rx * 0.85, y = Math.sin(start + g) * ry * 0.85;
    const a = Math.min(1, k) * (0.6 + 0.4 * Math.sin(turn * 4 + i));
    s.px(x, y, L[6], a);
    if (i % 3 !== 1) s.px(x + (i % 2 ? 1 : -1), y, L[5], a);
    if (i % 3 !== 2) s.px(x, y - 1, L[5], a * 0.8);
    s.glow(x, y, 4, L[4], 0.2 * a);
  }
  // the star: two triangles on the inner ring
  const star = smooth(0.55, 1, open) * Math.min(1, k);
  if (star > 0.02)
    for (const off of [0, Math.PI / 3])
      for (let i = 0; i < 3; i++) {
        const a0 = start + off + (i / 3) * TAU, a1 = a0 + TAU / 3;
        s.line(Math.cos(a0) * rx * 0.7, Math.sin(a0) * ry * 0.7, Math.cos(a1) * rx * 0.7, Math.sin(a1) * ry * 0.7, L[4], star * 0.7);
      }
  s.glow(0, 0, rx * 1.1, L[4], 0.16 * k, 0.45);
}

/** A ripple running out over the ground: a thin bright ring, brighter on its near side. */
function ripple(s: Surface, r: number, a: number): void {
  if (a <= 0.01) return;
  for (let g = 0; g < TAU; g += 1.2 / Math.max(6, r)) {
    const x = Math.cos(g) * r, y = Math.sin(g) * r * 0.45;
    s.px(x, y, Math.sin(g) > 0 ? L[6] : L[5], a);
    s.add(x, y, L[4], 0.25 * a);
  }
}

/**
 * The pillar of light: soft, with no hard walls - brightest down its middle, two shimmering strands
 * twisting up it, and it fades away gradually as it climbs (fully gone at `top`). w: half width.
 */
function pillar(s: Surface, w: number, k: number, t: number, top: number, foot = 0): void {
  if (w <= 0.2 || k <= 0.01) return;
  const H = foot - top;
  for (let y = Math.floor(foot) - 1; y > top; y--) {
    const h = foot - y;
    // gone softly up high, and a soft base where it meets the ground
    const fade = (1 - smooth(H * 0.2, H, h)) * smooth(-2, 6, h) * k;
    if (fade <= 0.01) continue;
    const ww = w * (1 + 0.1 * Math.sin(y * 0.15 + t * 7));
    for (let x = Math.floor(-ww * 1.7); x <= Math.ceil(ww * 1.7); x++) {
      const q = Math.abs(x + 0.5) / ww;
      if (q > 1.7) continue;
      const body = q < 1 ? 1 - q * q : 0;
      const halo = Math.max(0, 1 - q / 1.7) * 0.35;
      if (q < 0.28) s.add(x, y, L[7], (0.55 + 0.25 * body) * fade);
      else s.add(x, y, L[5], (body * 0.45 + halo * 0.5) * fade);
    }
    // two strands twisting up round each other
    for (const ph of [0, Math.PI]) {
      const x = Math.sin(y * 0.09 - t * 5 + ph) * ww * 0.75;
      const front = Math.cos(y * 0.09 - t * 5 + ph) > 0;
      s.add(x, y, front ? L[7] : L[5], (front ? 0.9 : 0.4) * fade);
    }
  }
}

/** Little rune shapes (pixel offsets) for the circles. */
const GLYPHS = [
  [[0, -1], [0, 0], [0, 1], [-1, -1], [1, 1]],
  [[-1, 0], [0, 0], [1, 0], [0, -1]],
  [[-1, -1], [1, -1], [0, 0], [0, 1]],
  [[0, -1], [-1, 0], [1, 0], [0, 1]],
  [[-1, 1], [0, 0], [1, -1], [1, 1]],
];

/** The magic circles stacked up the pillar, largest at the bottom: [half width, height above the ground]. */
const CIRCLES: [number, number][] = [[31, 5], [25, 23], [20, 42], [15, 62]];

/**
 * The stack of magic circles floating round the hero, each lying flat (an ellipse), turning - every other
 * one the other way - and bobbing up and down on its own beat. Each has a bright outer ring with ticks, a
 * dotted inner ring, runes between them and a spark of light chasing round. place(i) says where circle i is
 * now: how far up it has drifted (px), how bright it is (0..1+) and how big (1 = as listed).
 * Draw it twice: layer 'back' gives the far halves (behind the hero), 'front' the near halves.
 */
function circles(s: Surface, t: number, layer: 'back' | 'front', place: (i: number) => { up: number; k: number; scale: number }): void {
  CIRCLES.forEach(([R, h], i) => {
    const { up, k, scale } = place(i);
    if (k <= 0.01) return;
    const rx = R * scale, ry = rx * 0.38;
    const cy = -(h + up + Math.sin(t * 2.4 + i * 1.7) * 2.5);
    const dir = i % 2 ? -1 : 1;
    const rot = t * (0.9 + i * 0.35) * dir;
    const a = Math.min(1, k);
    const half = (g: number) => (Math.sin(g) > 0) === (layer === 'front');
    const n = Math.ceil(rx * 7);
    for (let j = 0; j < n; j++) {
      const g = (j / n) * TAU;
      if (!half(g)) continue;
      const near = layer === 'front';
      // the outer ring, a spark chasing round it
      const x = Math.cos(g) * rx, y = cy + Math.sin(g) * ry;
      const chase = Math.cos(g - rot * 2);
      s.px(x, y, chase > 0.93 ? L[6] : near ? L[5] : L[4], a * (near ? 0.9 : 0.55));
      // a second line just inside it: the ring reads as a band, not a thread
      s.px(Math.cos(g) * (rx - 1.2), cy + Math.sin(g) * (ry - 0.5), near ? L[5] : L[3], a * (near ? 0.8 : 0.45));
      s.add(x, y, L[4], (chase > 0.93 ? 0.2 : 0.1) * k);
      // ticks standing out from it
      if (j % Math.max(3, Math.round(n / 16)) === 0) s.px(Math.cos(g) * rx * 1.09, cy + Math.sin(g) * ry * 1.09, L[5], a * (near ? 0.9 : 0.5));
      // the dotted inner ring
      if (j % 2 === 0) s.px(Math.cos(g) * rx * 0.72, cy + Math.sin(g) * ry * 0.72, near ? L[5] : L[3], a * (near ? 0.85 : 0.5));
    }
    // runes between the rings, turning with the circle
    const runes = 6 + i * 2;
    for (let j = 0; j < runes; j++) {
      const g = (j / runes) * TAU + rot;
      if (!half(g)) continue;
      const x = Math.cos(g) * rx * 0.86, y = cy + Math.sin(g) * ry * 0.86;
      const glow = 0.6 + 0.4 * Math.sin(t * 6 + j + i);
      for (const [dx, dy] of GLYPHS[(j + i) % GLYPHS.length]) s.px(x + dx, y + dy * 0.5, layer === 'front' ? L[6] : L[4], a * glow * (layer === 'front' ? 1 : 0.6));
      s.add(x, y, L[4], 0.3 * k * glow);
    }
    if (layer === 'front') s.glow(0, cy, rx * 1.2, L[4], 0.1 * k, 0.4);
  });
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: RGB;
  big: boolean;
}

/** Specks of light that drift up, slow down and fade, twinkling. */
function stepMotes(list: Mote[], dt: number, rise: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    m.life -= dt;
    if (m.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    m.vx *= Math.exp(-2.2 * dt);
    m.vy = m.vy * Math.exp(-1.6 * dt) - rise * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
  }
}
function drawMotes(s: Surface, list: Mote[], t: number): void {
  for (const m of list) {
    const k = m.life / m.max, a = Math.min(1, k * 2.5) * (0.65 + 0.35 * Math.sin(t * 22 + m.x));
    s.px(m.x, m.y, m.c, a);
    if (m.big) s.px(m.x - 1, m.y, m.c, a * 0.5), s.px(m.x + 1, m.y, m.c, a * 0.5), s.px(m.x, m.y - 1, m.c, a * 0.5), s.px(m.x, m.y + 1, m.c, a * 0.5);
    s.glow(m.x, m.y, m.big ? 5 : 3, m.c, 0.3 * a);
  }
}

/** How tall the warp's canvas reaches: the pillar climbs to here, faded out well before it. */
const TOP = -300;
/** The canvas, and redrawn every frame (up to 120 a second) so the motion is as smooth as the game. */
const CANVAS = { w: 120, h: 330, ox: 60, oy: 310, fps: 120 };

// ---- warp out: ascension ---------------------------------------------------------------------------------

/** Its beats (seconds). */
const OUT = { GATHER: 0.62, IGNITE: 0.66, RISE0: 0.72, RISE1: 1.45, FADE: 1.75, END: 2.7 };
/** When the real character should vanish (the effect has the body from then), and when the jump can happen. */
export const WARP_OUT_HIDE = OUT.IGNITE;
export const WARP_OUT_GONE = 1.8;

/**
 * Warp out's circles: they open one after another round the hero while the light gathers, flare at the
 * ignition, then rise with the hero - the higher ones faster, so the stack pulls apart - and fade up there.
 */
function outCircle(i: number, t: number) {
  const appear = smooth(0.1 + i * 0.1, 0.35 + i * 0.1, t);
  const rise = Math.max(0, t - OUT.IGNITE);
  const up = rise * 22 + rise * rise * 45 * (1 + i * 0.5);
  const flare = 1 + 0.8 * Math.exp(-Math.abs(t - OUT.IGNITE) * 8);
  const k = appear * (1 - smooth(OUT.RISE1 - 0.1, OUT.FADE + 0.3, t)) * flare;
  return { up, k, scale: 0.6 + 0.4 * appear };
}

export function warpOut(actor: Actor, seed: number): PixelEffect {
  const r = rng(seed);
  const { px, top, height } = bodyOf(actor);
  // each speck of the body leaves in turn, feet first, and climbs a helix round the pillar
  const specks = px.map((p) => ({
    ...p,
    t0: OUT.RISE0 + (1 - (p.y - top) / height) * (OUT.RISE1 - OUT.RISE0 - 0.2) + r() * 0.2,
    phase: (p.x < 0 ? Math.PI : 0) + r() * 0.6,
    radius: Math.max(2, Math.abs(p.x) + 2 + r() * 3),
    speed: 70 + r() * 70,
    j: r(),
  }));
  const motes: Mote[] = [];
  // motes spiralling in while it gathers
  const inward = Array.from({ length: 34 }, () => ({ a: r() * TAU, rad: 26 + r() * 18, h: -4 - r() * 34, t0: r() * (OUT.GATHER - 0.32), life: 0.32 + r() * 0.12, gold: r() < 0.2 }));
  let ignited = false;

  return {
    ...CANVAS,
    duration: OUT.END,
    loop: false,
    update(dt, t) {
      if (t >= OUT.IGNITE && !ignited) {
        ignited = true;
        for (let i = 0; i < 26; i++) {
          const a = r() * TAU, sp = 20 + r() * 60;
          motes.push({ x: Math.cos(a) * 6, y: -14 + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 20, life: 0.6 + r() * 0.8, max: 1.4, c: r() < 0.3 ? GOLD[2] : L[6], big: r() < 0.25 });
        }
      }
      // specks shed from the helix as it climbs, drifting on up
      if (t > OUT.RISE0 && t < OUT.FADE && r() < 0.6) {
        motes.push({ x: (r() - 0.5) * 14, y: -10 - r() * 120, vx: (r() - 0.5) * 16, vy: -10 - r() * 20, life: 0.8 + r() * 0.8, max: 1.6, c: r() < 0.2 ? GOLD[1] : L[5 + Math.floor(r() * 2)], big: r() < 0.1 });
      }
      stepMotes(motes, dt, 14);
    },
    drawBack(s, t) {
      // the sigil opens under the feet, glows through the warp, closes as the pillar fades
      const k = smooth(0, 0.3, t) * (1 - smooth(OUT.FADE, OUT.END - 0.2, t));
      sigil(s, easeOut(t / 0.5), k * (1 + 0.6 * Math.exp(-Math.abs(t - OUT.IGNITE) * 10)), t * 0.8);
      // the ground answers the ignition: a ripple racing out
      const rp = (t - OUT.IGNITE) / 0.6;
      if (rp > 0 && rp < 1) ripple(s, 8 + easeOut(rp) * 40, 1 - rp);
      // the pillar: grows from the ignition, holds while the body climbs it, then thins and fades
      const w = t < OUT.IGNITE ? 0 : t < OUT.RISE1 ? 1.5 + 5.5 * easeOut((t - OUT.IGNITE) / 0.3) : 7 * (1 - smooth(OUT.RISE1, OUT.FADE + 0.35, t));
      pillar(s, w, 1 - smooth(OUT.FADE, OUT.FADE + 0.5, t), t, TOP);
      circles(s, t, 'back', (i) => outCircle(i, t));
    },
    draw(s, t) {
      circles(s, t, 'front', (i) => outCircle(i, t));

      // gathering: motes spiral in to the body, leaving short trails
      for (const m of inward) {
        const u = (t - m.t0) / m.life;
        if (u < 0 || u > 1) continue;
        for (let k2 = 0; k2 < 4; k2++) {
          const uu = Math.max(0, u - k2 * 0.04);
          const rad = m.rad * (1 - uu) ** 1.6, a = m.a + uu * 4;
          const x = Math.cos(a) * rad, y = lerpN(m.h, -14, uu) + Math.sin(a) * rad * 0.35;
          s.px(x, y, k2 === 0 ? (m.gold ? GOLD[2] : L[7]) : L[5], (1 - k2 * 0.25) * (0.4 + 0.6 * u));
          if (k2 === 0) s.add(x, y, L[4], 0.4);
        }
      }
      // the body brightening as it gathers (light laid over the real character)
      if (t < OUT.IGNITE) {
        const b = smooth(0.25, OUT.IGNITE, t);
        for (const p of px) s.add(p.x, p.y, p.rim ? L[6] : L[5], b * (p.rim ? 0.8 : 0.45));
        s.glow(0, -14, 22, L[4], 0.3 * b);
      }
      // the body, ignited: light-coloured, then each speck rising up the helix in turn
      if (t >= OUT.IGNITE) {
        const flash = Math.exp(-(t - OUT.IGNITE) * 14);
        for (const p of specks) {
          const a = t - p.t0;
          if (a < 0) {
            s.px(p.x, p.y, flash > 0.3 ? L[7] : mixRGB(p.c, p.rim ? L[6] : L[5], 0.6), 1);
            s.add(p.x, p.y, L[5], 0.25 + 0.6 * flash);
            continue;
          }
          // climbing: speeding up, the helix tightening towards the middle as it goes
          const climb = p.speed * a + 90 * a * a;
          const y = p.y - climb;
          if (y < TOP + 40) continue;
          const rad = 2 + (p.radius - 2) * Math.exp(-climb / 60);
          const ang = p.phase + a * 7;
          const x = Math.sin(ang) * rad;
          const fade = 1 - smooth(-60, TOP + 60, y) * 0.85;
          const c = p.j > 0.9 ? GOLD[2] : mixRGB(mixRGB(p.c, L[7], 0.7), L[5], clamp(climb / 120));
          s.px(x, y, c, fade);
          if (p.j < 0.3) s.line(x, y, x - Math.cos(ang) * rad * 0.2, y + Math.min(6, 1 + climb * 0.04), L[5], 0.5 * fade);
          s.add(x, y, L[5], 0.35 * fade);
        }
        s.glow(0, -14, 30, L[5], 0.8 * flash);
        // the flash: a cross of light through the body
        if (flash > 0.05) {
          s.line(-22 * flash - 2, -14, 22 * flash + 2, -14, L[7], flash);
          s.line(0, -14 - 26 * flash, 0, -14 + 12 * flash, L[7], flash);
        }
      }
      drawMotes(s, motes, t);
    },
  };
}

// ---- warp in: descent ------------------------------------------------------------------------------------

const IN = { FALL: 0.4, FORM0: 0.5, FORM1: 1.35, COOL: 0.3, CLOSE: 1.7, END: 2.8 };
/** When the hero is whole again and the real character comes back. */
export const WARP_IN_SHOW = IN.FORM1 + IN.COOL;

/**
 * Warp in's circles: they come down out of the sky after the falling star, one after another, settle round
 * the hero while they form, then sink to the ground and fade.
 */
function inCircle(i: number, t: number) {
  const settle = easeOut((t - IN.FALL - 0.05 - (3 - i) * 0.07) / 0.55);
  if (settle <= 0) return { up: 0, k: 0, scale: 1 };
  const sink = smooth(IN.CLOSE - 0.1, IN.END - 0.5, t);
  const up = (1 - settle) * (120 + i * 25) - sink * CIRCLES[i][1] * 0.8;
  const k = smooth(0, 0.3, settle) * (1 - smooth(IN.CLOSE, IN.END - 0.4, t)) * (1 + 0.6 * Math.exp(-Math.max(0, t - IN.FALL - 0.4) * 6));
  return { up, k, scale: 1 - 0.25 * sink };
}

export function warpIn(actor: Actor, seed: number): PixelEffect {
  const r = rng(seed);
  const { px, top, height } = bodyOf(actor);
  // each speck of the body arrives in turn, feet first, spiralling down from above
  const specks = px.map((p) => ({
    ...p,
    t1: IN.FORM0 + (1 - (p.y - top) / height) * (IN.FORM1 - IN.FORM0 - 0.15) + r() * 0.15,
    fly: 0.22 + r() * 0.12,
    a0: r() * TAU,
    j: r(),
  }));
  const motes: Mote[] = [];
  let landed = false;

  return {
    ...CANVAS,
    duration: IN.END,
    loop: false,
    update(dt, t) {
      if (t >= IN.FALL && !landed) {
        landed = true;
        // the star bursts where it lands: specks thrown out low, drifting up
        for (let i = 0; i < 40; i++) {
          const a = r() * TAU, sp = 40 + r() * 110;
          motes.push({ x: Math.cos(a) * 3, y: -2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.4 - 25 - r() * 30, life: 0.5 + r() * 0.9, max: 1.4, c: r() < 0.25 ? GOLD[2] : L[6 + Math.floor(r() * 2)], big: r() < 0.2 });
        }
      }
      if (t > IN.FORM1 && t < IN.CLOSE + 0.4 && r() < 0.5) {
        motes.push({ x: (r() - 0.5) * 18, y: -2 - r() * 30, vx: (r() - 0.5) * 10, vy: -8 - r() * 16, life: 0.7 + r() * 0.8, max: 1.5, c: r() < 0.2 ? GOLD[1] : L[5], big: false });
      }
      stepMotes(motes, dt, 12);
    },
    drawBack(s, t) {
      // the sigil: opens as the star falls, flares when it lands, closes as the pillar goes
      const k = smooth(0, IN.FALL, t) * (1 - smooth(IN.CLOSE, IN.END - 0.2, t));
      sigil(s, easeOut(t / (IN.FALL + 0.1)), k * (1 + 0.8 * Math.exp(-Math.abs(t - IN.FALL) * 9)), t * 0.8);
      const rp = (t - IN.FALL) / 0.7;
      if (rp > 0 && rp < 1) ripple(s, 6 + easeOut(rp) * 48, 1 - rp);
      if (rp > 0 && rp < 0.5) ripple(s, 4 + easeOut(rp * 2) * 22, (1 - rp * 2) * 0.7);
      if (t >= IN.FALL) {
        const bloom = Math.exp(-(t - IN.FALL) * 8);
        const w = (t < IN.CLOSE ? 6 : 6 * (1 - smooth(IN.CLOSE, IN.END - 0.6, t))) * (1 + 0.8 * bloom);
        pillar(s, w, 1 - smooth(IN.CLOSE + 0.2, IN.END - 0.4, t), t, TOP);
        s.glow(0, -4, 34, L[5], 0.7 * bloom, 0.6);
      }
      circles(s, t, 'back', (i) => inCircle(i, t));
    },
    draw(s, t) {
      circles(s, t, 'front', (i) => inCircle(i, t));

      // the falling star: a white head and a long tail of fading light
      if (t < IN.FALL) {
        const y = lerpN(TOP + 20, 0, easeIn(t / IN.FALL));
        for (let i = 0; i < 70; i++) {
          const yy = y - i * 1.4;
          const a = (1 - i / 70) ** 1.5;
          s.add(0, yy, i < 3 ? L[7] : L[5], a * 0.9);
          if (i < 30) s.add(i % 2 ? -1 : 1, yy, L[4], a * 0.35);
        }
        s.px(0, y, L[7]), s.px(-1, y, L[6]), s.px(1, y, L[6]), s.px(0, y - 1, L[6]);
        s.glow(0, y, 10, L[5], 0.6);
      }

      // the body condensing: specks spiral down onto their places, land white-hot, cool to their colours
      if (t >= IN.FORM0 - 0.4 && t < WARP_IN_SHOW) {
        for (const p of specks) {
          const a = t - p.t1;
          if (a < -p.fly) continue;
          if (a < 0) {
            const u = 1 + a / p.fly; // 0 .. 1 on the way in
            const ang = p.a0 + u * 5, rad = 14 * (1 - u) ** 1.2;
            const x = p.x + Math.cos(ang) * rad, y = p.y - (1 - u) * 26 + Math.sin(ang) * rad * 0.3;
            s.px(x, y, p.j > 0.88 ? GOLD[2] : L[6], 0.5 + 0.5 * u);
            s.add(x, y, L[5], 0.3);
            continue;
          }
          const cool = clamp(a / IN.COOL);
          const c = cool < 0.15 ? L[7] : mixRGB(p.rim ? L[6] : L[5], p.c, (cool - 0.15) / 0.85);
          s.px(p.x, p.y, c, 1);
          if (cool < 1) s.add(p.x, p.y, L[5], 0.5 * (1 - cool));
        }
        // a ring rising up the body with the forming front
        const f = (t - IN.FORM0) / (IN.FORM1 - IN.FORM0);
        if (f > 0 && f < 1.05) {
          const y = lerpN(0, top - 2, easeOut(f));
          for (let g = 0; g < TAU; g += 0.15) {
            const x = Math.cos(g) * 11, yy = y + Math.sin(g) * 2.5;
            s.px(x, yy, Math.sin(g) > 0 ? L[7] : L[5], (Math.sin(g) > 0 ? 0.9 : 0.4) * (1 - smooth(0.85, 1.05, f)));
          }
          s.glow(0, y, 14, L[5], 0.35);
        }
      }
      drawMotes(s, motes, t);
    },
  };
}

// ---- the pad: a great ring of runes set flush into the ground ----------------------------------------------

/** Half width / half depth of the pad (a flat ellipse round its middle, which is the warp's (x, y)). */
export const PAD = { rx: 36, ry: 16 };
const STONE = [0x23252e, 0x434755, 0x646a77, 0x868d99, 0xaab1ba];
/** The rune tiles set in the rim, and the rings of the inlay (as shares of the pad's size). */
const TILES = 8;
const RIM = { outer: 0.95, inner: 0.8 };
const RING = { main: 0.7, inner: 0.48, seal: 0.2, script: 0.59 };

/** The stone inlay, a still picture: a rim of cut stones set with rune tiles round a dark carved slab. */
export const warpPad: PixelEffect = {
  w: 80,
  h: 40,
  ox: 40,
  oy: 20,
  duration: 1,
  loop: true,
  draw(s) {
    const { rx, ry } = PAD;
    for (let y = -ry - 1; y <= ry + 1; y++)
      for (let x = -rx - 1; x <= rx + 1; x++) {
        const dx = (x + 0.5) / rx, dy = (y + 0.5) / ry, d = Math.hypot(dx, dy);
        if (d > 1) continue;
        const ang = Math.atan2(dy, dx), lit = -dx * 0.5 - dy * 0.7;
        if (d > RIM.outer) {
          s.px(x, y, STONE[0]);
          continue;
        }
        if (d > RIM.inner) {
          // the rim: cut stones lit from the upper left; every so often a dark rune tile set into it
          const f = ((ang + Math.PI) / TAU) * 24, seg = Math.floor(f);
          const tile = Math.abs(((ang + Math.PI) / TAU) * TILES - Math.round(((ang + Math.PI) / TAU) * TILES)) < 0.12;
          if (tile) {
            s.px(x, y, d > RIM.outer - 0.03 || d < RIM.inner + 0.03 ? STONE[0] : 0x262c3e);
            continue;
          }
          const joint = Math.abs(f - seg - 0.5) > 0.42;
          s.px(x, y, joint ? STONE[1] : lit > 0.25 ? STONE[4] : lit > -0.2 ? STONE[3] : STONE[2]);
          continue;
        }
        if (d > RIM.inner - 0.04) {
          s.px(x, y, STONE[0]);
          continue;
        }
        // the slab: dark blue-grey stone in two bands, the carved grooves darker still (the light lives in them)
        const groove = Math.abs(d - RING.main) < 0.025 || Math.abs(d - RING.inner) < 0.02 || Math.abs(d - RING.seal) < 0.03;
        if (groove) {
          s.px(x, y, 0x1a1e2c);
          continue;
        }
        const band = d > RING.inner ? 0 : 1;
        s.px(x, y, lit > 0.2 ? (band ? 0x3a4258 : 0x353d52) : band ? 0x30374b : 0x2b3144);
      }
  },
};

/**
 * The pad's living light, kept soft: the carved rings and a six-pointed star glowing and breathing, a ring
 * of rune script turning slowly, the rim's rune tiles lighting one after another, a calm spark gliding round
 * the main ring, motes drifting up.
 */
export const warpPadGlow: PixelEffect = {
  w: 90,
  h: 130,
  ox: 45,
  oy: 108,
  duration: 8,
  loop: true,
  draw(s, t) {
    const { rx, ry } = PAD;
    const breathe = 0.75 + 0.25 * Math.sin((t / 8) * TAU * 3);
    const at = (r: number, g: number): [number, number] => [Math.cos(g) * rx * r, Math.sin(g) * ry * r];
    // the main ring, with one soft spark gliding round it
    const n = 150;
    for (let i = 0; i < n; i++) {
      const g = (i / n) * TAU;
      const [x, y] = at(RING.main, g);
      const chase = Math.cos(g - (t / 8) * TAU * 2);
      s.px(x, y, chase > 0.93 ? L[6] : L[5], (0.55 + 0.25 * breathe) * (chase > 0.93 ? 1 : 0.85));
      if (chase > 0.93) s.add(x, y, L[4], 0.15);
    }
    // the inner ring, dotted, and the seal in the middle
    for (let i = 0; i < 90; i += 2) {
      const [x, y] = at(RING.inner, (i / 90) * TAU);
      s.px(x, y, L[4], 0.55 * breathe);
    }
    for (let i = 0; i < 40; i++) {
      const [x, y] = at(RING.seal, (i / 40) * TAU);
      s.px(x, y, L[5], 0.6 * breathe);
    }
    for (let i = -2; i <= 2; i++) s.px(i, 0, L[5], 0.7 * breathe), s.px(0, i * 0.5, L[5], 0.7 * breathe);
    // the six-pointed star on the main ring
    for (const off of [0, Math.PI / 3])
      for (let i = 0; i < 3; i++) {
        const a0 = -Math.PI / 2 + off + (i / 3) * TAU, a1 = a0 + TAU / 3;
        const [x0, y0] = at(RING.main, a0), [x1, y1] = at(RING.main, a1);
        s.line(x0, y0, x1, y1, L[4], 0.42 * breathe);
      }
    // a ring of rune script between the rings, turning slowly
    const turn = (t / 8) * TAU * 0.5;
    for (let i = 0; i < 18; i++) {
      const g = (i / 18) * TAU + turn;
      const [x, y] = at(RING.script, g);
      for (const [dx, dy] of GLYPHS[i % GLYPHS.length]) s.px(x + dx, y + dy * 0.6, L[5], 0.5 * breathe);
    }
    // the rune tiles in the rim, lighting one after another round the pad
    for (let i = 0; i < TILES; i++) {
      const g = (i / TILES) * TAU - Math.PI;
      const [x, y] = at((RIM.outer + RIM.inner) / 2, g);
      const on = Math.max(0, Math.cos(g + Math.PI - (t / 8) * TAU * 2) * 1.4 - 0.4);
      for (const [dx, dy] of GLYPHS[(i * 2) % GLYPHS.length]) s.px(x + dx, y + dy * 0.6, on > 0.5 ? L[6] : L[4], 0.35 + 0.5 * on);
      if (on > 0.2) s.glow(x, y, 4, L[4], 0.15 * on);
    }
    // a soft pool of light over it all
    s.glow(0, 0, rx * 0.9, L[3], 0.12 * breathe, ry / rx);
    // motes drifting up off the main ring
    for (let i = 0; i < 18; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12345.678;
      const f1 = h1 - Math.floor(h1), f2 = h2 - Math.floor(h2);
      const life = 2.2 + f1 * 2, born = f2 * 8;
      const age = (((t - born) % 8) + 8) % 8;
      if (age > life) continue;
      const k = age / life, g = f1 * TAU * 3;
      const [x0, y0] = at(RING.main, g);
      const a = Math.sin(k * Math.PI) * 0.8;
      const x = x0 + Math.sin(age * 2 + i) * 1.5, y = y0 - age * 14;
      s.px(x, y, i % 6 === 0 ? GOLD[2] : L[5], a);
      s.glow(x, y, 3, L[4], 0.2 * a);
    }
  },
};
