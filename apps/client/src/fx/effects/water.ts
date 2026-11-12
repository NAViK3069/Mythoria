// Mythoria's own water and smoke for the town, on our own engine (fx/surface.ts):
//
//  * fountainWater: the water of the town's fountain. The fountain is put back together in layers, its
//    pieces cut from its own picture by tools/fountain_parts.py (world/fountain_parts.json):
//      the dry basin (the picture, placed on the map) → the lower pool → the far half of the falling curtain
//      → the pillar and the upper bowl, above the waterline → the bowl's water → droplets falling behind the
//      statue → the statue → the near half of the curtain, the splashes, the jet and the droplets in front.
//    A jet springs from the top of the statue and rains into the bowl; the bowl brims over its lip and a
//    curtain of water falls all round into the pool below, landing in a ring of splashes; ripples run out;
//    light plays over both pools; what stands in the water shows faintly through it. Everything loops
//    seamlessly (worked out from t).
//  * chimneySmoke: soft puffs of smoke rising from a chimney, drifting with the wind and thinning out.
//
// All the fountain's numbers are measured off its picture: (0, 0) is the picture's bottom centre.

import { mixRGB, type PixelEffect, type RGB, type Surface } from '../surface';
import PARTS from '../../world/fountain_parts.json';

const TAU = Math.PI * 2;
/** A fixed random number for (i, k): the same every frame, so loops stay seamless. */
const hash = (i: number, k: number) => {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Water, deep to bright. */
const WATER = [0x1d4fa8, 0x2a6fd0, 0x3e93e6, 0x5ab9f2, 0x8fdcff, 0xd2f4ff, 0xffffff];

type Oval = { y: number; rx: number; ry: number };
type Run = [number, number, number];
type Pixel = [number, number, number];
const F = (PARTS as unknown as {
  t_fountain: {
    pool: number[]; bowl: number[]; lip: number[]; pillarLine: number[]; statueLine: number[]; spout: number[];
    lower: Run[]; upper: Run[]; pillar: Pixel[]; pillarSunk: Pixel[]; statue: Pixel[]; statueSunk: Pixel[];
  };
}).t_fountain;
const oval = ([y, rx, ry]: number[]): Oval => ({ y, rx, ry });
const POOL = oval(F.pool); // the lower pool's surface, up to its gold ring
const BOWL = oval(F.bowl); // the upper bowl's
const LIP = oval(F.lip); // the bowl's outer lip, where it brims over
const PILLAR_LINE = oval(F.pillarLine); // where the pillar comes out of the pool
const STATUE_LINE = oval(F.statueLine); // where the statue comes out of the bowl's water
/** Where the falling curtain meets the pool: a little wider than the lip (it leaves the lip moving outward). */
const LAND: Oval = { y: POOL.y, rx: LIP.rx * 1.12, ry: LIP.rx * 1.12 * (POOL.ry / POOL.rx) };
const SPOUT = { x: F.spout[0], y: F.spout[1] };

const CANVAS = { w: 140, h: 150, ox: 70, oy: 132 };
const cell = (x: number, y: number) => {
  const X = Math.floor(x + CANVAS.ox), Y = Math.floor(y + CANVAS.oy);
  return X < 0 || Y < 0 || X >= CANVAS.w || Y >= CANVAS.h ? -1 : Y * CANVAS.w + X;
};
/** Which pixels hold water: 1 the lower pool, 2 the upper bowl. */
const WET = new Uint8Array(CANVAS.w * CANVAS.h);
for (const [which, runs] of [[1, F.lower], [2, F.upper]] as const)
  for (const [y, x0, x1] of runs) for (let x = x0; x <= x1; x++) if (cell(x, y) >= 0) WET[cell(x, y)] = which;
const wet = (x: number, y: number) => {
  const i = cell(x, y);
  return i < 0 ? 0 : WET[i];
};
/** What stands in the water, seen through it: the picture's colour there (or -1). */
const SUNK = new Int32Array(CANVAS.w * CANVAS.h).fill(-1);
for (const [y, x, c] of [...F.pillarSunk, ...F.statueSunk]) if (cell(x, y) >= 0) SUNK[cell(x, y)] = c;

const D = 2.4; // the loop

/** A pool's surface over exactly its wet pixels: deeper in the middle, light playing over it, the far side
 * bright with the sky; what stands in the water shows through, tinted. */
function pool(s: Surface, o: Oval, runs: Run[], t: number, shine: number): void {
  for (const [y, x0, x1] of runs)
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5) / o.rx, dy = (y + 0.5 - o.y) / o.ry, d = Math.hypot(dx, dy);
      // caustics: interfering waves drifting across, looping every D seconds
      const w = Math.sin(x * 0.42 + (t / D) * TAU) + Math.sin(y * 1.1 - (t / D) * TAU * 2) + Math.sin((x - y * 2) * 0.23 + (t / D) * TAU);
      let c: RGB = d > 0.9 ? WATER[4] : d > 0.7 ? WATER[3] : d > 0.4 ? WATER[2] : WATER[1];
      if (w > 2.1 * (1 - shine * 0.15)) c = WATER[5];
      else if (w > 1.5) c = mixRGB(c, WATER[4], 0.6);
      if (dy < -0.6) c = mixRGB(c, WATER[4], 0.35);
      const sunk = SUNK[cell(x, y)];
      if (sunk >= 0) c = mixRGB(mixRGB(sunk, WATER[2], 0.55), c, w > 1.5 ? 0.6 : 0.25);
      s.px(x, y, c, sunk >= 0 ? 1 : d > 0.94 ? 0.82 : 0.93);
    }
}

/** A ripple: a thin ring on a pool's surface, brighter on its near side, only on that pool's water. */
function ring(s: Surface, which: number, cy: number, r: number, ry: number, a: number): void {
  if (a <= 0.02) return;
  for (let g = 0; g < TAU; g += 0.9 / Math.max(4, r)) {
    const x = Math.cos(g) * r, y = cy + Math.sin(g) * ry;
    if (wet(x, y) !== which) continue;
    s.px(x, y, Math.sin(g) > 0 ? WATER[5] : WATER[4], a * (Math.sin(g) > 0 ? 0.9 : 0.55));
  }
}

/** A piece of the fountain's own picture, drawn back over the water. */
function piece(s: Surface, pixels: Pixel[]): void {
  for (const [y, x, c] of pixels) s.px(x, y, c, 1);
}

/** Foam where something stands in the water: the near half of its waterline, shimmering. */
function waterline(s: Surface, o: Oval, t: number, k: number): void {
  const n = Math.round(o.rx * 2.4);
  for (let j = 0; j <= n; j++) {
    const g = (j / n) * Math.PI;
    const x = Math.cos(g) * (o.rx + 0.5), y = o.y + Math.sin(g) * (o.ry + 0.5);
    const a = 0.45 + 0.4 * Math.sin((t / D) * TAU * 2 + j * 1.3);
    s.px(x, y, a > 0.6 ? WATER[6] : WATER[5], a * k);
  }
}

/** The curtain falling from the bowl's lip into the pool: strands round the lip; front: the near half
 * (in front of the pillar) or the far half (behind it). */
function curtain(s: Surface, t: number, front: boolean): void {
  const strands = 64;
  for (let j = 0; j < strands; j++) {
    const g = ((j + 0.5) / strands) * TAU;
    if (Math.sin(g) > 0 !== front) continue;
    const x0 = Math.cos(g) * LIP.rx, y0 = LIP.y + Math.sin(g) * LIP.ry;
    const x1 = Math.cos(g) * LAND.rx, y1 = LAND.y + Math.sin(g) * LAND.ry;
    const len = Math.max(1, Math.ceil(y1 - y0));
    const flow = ((t / D) * 4 + hash(j, 1)) % 1;
    for (let k = 0; k <= len; k++) {
      const u = k / len;
      // it spills over the lip moving outward, then falls faster and faster
      const x = x0 + (x1 - x0) * Math.sqrt(u);
      const y = y0 + (y1 - y0) * (u * u * 0.45 + u * 0.55);
      const streak = Math.abs(u - flow) < 0.08 || Math.abs(u - ((flow + 0.5) % 1)) < 0.05;
      const c = streak ? WATER[6] : u < 0.12 ? WATER[5] : WATER[4];
      // thin at the sides, where you see the sheet edge-on
      const side = 0.55 + 0.45 * Math.abs(Math.sin(g));
      s.px(x, y, c, (front ? 0.5 : 0.45) * side * (streak ? 1.35 : 1));
    }
  }
}

/** Where the curtain lands: droplets hopping up and foam on the ring, the near or the far half. */
function landing(s: Surface, t: number, front: boolean): void {
  for (let i = 0; i < 48; i++) {
    const g = hash(i, 2) * TAU;
    if (Math.sin(g) > 0 !== front) continue;
    const life = 0.35 + hash(i, 3) * 0.3;
    const age = ((t + hash(i, 4) * D) % D) % (life + 0.25);
    if (age > life) continue;
    const k = age / life;
    const x = Math.cos(g) * (LAND.rx + (hash(i, 5) - 0.3) * 6 * k);
    const y = LAND.y + Math.sin(g) * LAND.ry - (8 + hash(i, 6) * 9) * k + 24 * k * k;
    s.px(x, y, k < 0.3 ? WATER[6] : WATER[5], 1 - k * 0.6);
  }
  for (let j = 0; j < 44; j++) {
    const g = ((j + 0.5) / 44) * TAU;
    if (Math.sin(g) > 0 !== front) continue;
    const x = Math.cos(g) * LAND.rx, y = LAND.y + Math.sin(g) * LAND.ry;
    if (wet(x, y) !== 1) continue;
    const a = 0.45 + 0.35 * Math.sin((t / D) * TAU * 3 + j * 1.7);
    s.px(x, y, WATER[6], a);
    if (j % 3 === 0) s.px(x + 1, y, WATER[5], a * 0.7);
  }
}

/** The jet's droplets: arcing out from its top and raining into the bowl, each landing somewhere on the
 * bowl's water; far: those landing behind the statue's middle (drawn before the statue) or in front. */
function droplets(s: Surface, t: number, top: number, far: boolean): void {
  for (let i = 0; i < 96; i++) {
    const depth = (hash(i, 14) - 0.5) * 1.6; // where on the bowl it lands: -0.8 far side .. 0.8 near side
    if (depth < 0 !== far) continue;
    const life = 0.9;
    const age = ((t + hash(i, 8) * D) % D) % life;
    const vx = (hash(i, 9) - 0.5) * 30, vy = -16 - hash(i, 10) * 24, g = 160;
    const x = vx * age;
    const y = top + vy * age + 0.5 * g * age * age;
    const u = Math.min(1, Math.abs(x) / (BOWL.rx - 2));
    const land = BOWL.y + depth * (BOWL.ry - 2) * Math.sqrt(1 - u * u);
    if (y > land) continue;
    const fall = vy + g * age > 0;
    s.px(x, y, fall ? WATER[5] : WATER[6], fall ? 0.8 : 0.95);
    if (fall && i % 4 === 0) s.px(x, y - 1, WATER[4], 0.45);
  }
}

export const fountainWater: PixelEffect = {
  ...CANVAS,
  duration: D,
  loop: true,
  fps: 60,
  draw(s, t) {
    // the lower pool, its ripples running out from where the curtain lands, glints now and then
    pool(s, POOL, F.lower, t, 1);
    for (let i = 0; i < 4; i++) {
      const ph = ((t / D) * 2 + i / 4) % 1;
      ring(s, 1, POOL.y, LAND.rx + ph * (POOL.rx - LAND.rx), LAND.ry + ph * (POOL.ry - LAND.ry), (1 - ph) * 0.7);
    }
    for (let i = 0; i < 6; i++) {
      const ph = ((t / D) * 1.5 + hash(i, 11)) % 1;
      if (ph > 0.18) continue;
      const g = hash(i, 12) * TAU, rr = 0.62 + hash(i, 13) * 0.3;
      const x = Math.cos(g) * POOL.rx * rr, y = POOL.y + Math.sin(g) * POOL.ry * rr;
      if (wet(x, y) !== 1) continue;
      const k = Math.sin((ph / 0.18) * Math.PI);
      s.px(x, y, WATER[6], k);
      if (k > 0.6) s.px(x - 1, y, WATER[5], k * 0.7), s.px(x + 1, y, WATER[5], k * 0.7), s.px(x, y - 1, WATER[5], k * 0.5), s.px(x, y + 1, WATER[5], k * 0.5);
    }

    // behind the pillar: the far half of the curtain and of its landing
    curtain(s, t, false);
    landing(s, t, false);

    // the pillar and the bowl, standing out of the pool, foam round the pillar where it meets the water
    piece(s, F.pillar);
    waterline(s, PILLAR_LINE, t, 0.8);

    // the bowl's water, ripples where the jet rains into it
    pool(s, BOWL, F.upper, t + 0.7, 0.5);
    for (let i = 0; i < 3; i++) {
      const ph = ((t / D) * 3 + i / 3) % 1;
      ring(s, 2, BOWL.y, STATUE_LINE.rx + 1 + ph * (BOWL.rx - STATUE_LINE.rx - 1), STATUE_LINE.ry + 1 + ph * (BOWL.ry - STATUE_LINE.ry - 1), (1 - ph) * 0.6);
    }

    // the jet: a column springing from the top of the statue, a crown of spray, droplets raining down
    const top = SPOUT.y - 12 - Math.sin((t / D) * TAU * 4) * 1.2;
    droplets(s, t, top, true);
    piece(s, F.statue);
    waterline(s, STATUE_LINE, t + 0.5, 0.7);

    // in front: the near half of the curtain, its landing, mist
    curtain(s, t, true);
    landing(s, t, true);
    s.glow(0, LAND.y - 2, LAND.rx + 6, WATER[5], 0.08, 0.45);

    for (let y = SPOUT.y; y > top; y--) {
      const k = (SPOUT.y - y) / (SPOUT.y - top);
      s.px(SPOUT.x, y, k > 0.7 ? WATER[6] : WATER[5], 0.9);
      if (k < 0.6) s.px(SPOUT.x + (y % 2 ? -1 : 1), y, WATER[4], 0.45);
    }
    s.glow(SPOUT.x, top + 2, 7, WATER[5], 0.28);
    droplets(s, t, top, false);
    s.glow(0, POOL.y, POOL.rx, WATER[3], 0.05, 0.42);
  },
};

/** Soft smoke from a chimney. */
export const chimneySmoke: PixelEffect = {
  w: 64,
  h: 90,
  ox: 18,
  oy: 84,
  duration: 6,
  loop: true,
  fps: 30,
  draw(s, t) {
    for (let i = 0; i < 10; i++) {
      const life = 4.2;
      const age = (((t - i * 0.6) % 6) + 6) % 6;
      if (age > life) continue;
      const k = age / life;
      const x = 18 * k * k + Math.sin(age * 1.6 + i) * 1.6 + 1 * hash(i, 1);
      const y = -age * 13 + 2 * k * k;
      const r = 2 + k * 5.5;
      const a = Math.min(1, 0.35 + age * 5) * Math.pow(1 - k, 0.8) * 0.8;
      for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++)
        for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
          const d = Math.hypot(xx + 0.5 - x, (yy + 0.5 - y) * 1.15) / r;
          if (d > 1) continue;
          // lit on top, a touch darker underneath
          const c = yy + 0.5 < y - r * 0.2 ? 0xe6e9ef : yy + 0.5 > y + r * 0.35 ? 0x9da3b0 : 0xc7ccd6;
          s.px(xx, yy, c, a * Math.min(1, (1 - d * d) * 1.6));
        }
    }
  },
};
