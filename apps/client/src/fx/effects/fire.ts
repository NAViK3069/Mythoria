// Mythoria's own fires, drawn in code on the pixelfx engine (MIT): a campfire, a cooking fire, a torch on a
// stake, a stone brazier, a hearth fire and a cold blue spirit flame. Each is a looping "pure" effect: the
// frame at time t is worked out from t alone, so it never stutters and loops with no seam.
//
// They are drawn at the map's own scale (1 unit = 1 world px; the hero is 32 px tall), with (0, 0) the
// point the fire stands on. Everything you might want to tune is in the options (colours, height, spread,
// smoke, embers) - FxSprite passes { opts } straight through - or in the small tables below.
//
// The flame-tongue, smoke-puff, ember and spark recipes come from pixelfx's fire kit, which adapts them from
// Sprite Fusion's open-source fire (https://www.spritefusion.com/pixel-art-vfx/fire), MIT License,
// Copyright (c) 2026 Hugo Duprez. The fires themselves (layouts, timing, light, bases) are ours.

import { clamp, fit, hex, mix, Rng, WHITE, type FxModule, type Painter } from 'pixelfx';
import { BACK_LAYERS, BIG_LAYERS, LAYERS, drift, ember, firePuff, flameTongue, floorLight, hotFirst, lick, looped, noiseFor, smokePuff, spark, sparkAt } from 'pixelfx/fx/fire/_lib';

/** Warm fire, dark to bright. */
const FIRE = ['#4a1712', '#8a1f17', '#c9281f', '#f2561d', '#ff8a2a', '#ffc23d', '#ffe26b', '#fff3a6', '#ffffff'];
/** Spirit fire: cold blue-white. */
const SPIRIT = ['#0b1640', '#122a78', '#1a48b0', '#2a78e0', '#3aa6f5', '#62d2ff', '#9ae8ff', '#d4f8ff', '#ffffff'];

export interface FireOpts {
  palette: string[];
  /** Tallest tongue (px). */
  height: number;
  /** Half the width of the bed of flames (px). */
  spread: number;
  /** Number of tongues. */
  tongues: number;
  /** Smoke puffs per loop (0 = none). */
  smoke: number;
  /** Embers per loop. */
  embers: number;
  /** Spark pops per loop. */
  pops: number;
  /** Strength of the light it throws (0..1). */
  glow: number;
  /** Puffs of smoke go a little grey-blue for a spirit fire. */
  smokeTint: string;
  seed: number;
}

interface Tongue {
  x: number;
  y: number;
  h: number;
  w: number;
  back: boolean;
  n: number;
}

/** The tongues of a fire: tall in the middle, low at the sides, the outer ones a row further back. */
function tongues(o: FireOpts): Tongue[] {
  const R = new Rng(o.seed * 31 + 7);
  const out: Tongue[] = [];
  const n = Math.max(1, o.tongues);
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1 .. 1 across the bed
    const centre = 1 - Math.abs(k);
    out.push({
      x: k * o.spread + R.range(-0.5, 0.5),
      y: -1 - centre * 1.5 + (i % 2 ? 0 : -1),
      h: Math.max(3, o.height * (0.35 + 0.65 * centre ** 0.8) * R.range(0.85, 1.1)),
      w: Math.max(1.2, (o.spread / Math.max(2, n)) * 2.1 + centre * 1.5),
      back: i % 2 === 0 && n > 2,
      n: (o.seed * 7 + i) * 13,
    });
  }
  // back row first, then front, tallest last so its heart sits on top
  return out.sort((a, b) => Number(b.back) - Number(a.back) || a.h - b.h);
}

/** The living fire itself: smoke behind, tongues, licks, puffs, pops, embers and its light. */
function flames(p: Painter, t: number, D: number, o: FireOpts): void {
  const F = fit(o.palette, 9);
  const H = hotFirst(F);
  const NL = noiseFor(D);
  const S = o.seed;
  const N = (rate: number, seed = 0, off = 0) => NL(t, rate, seed, off);
  const flick = 0.74 + 0.16 * N(7.3, S + 1) + 0.1 * N(19, S + 2);
  const T = tongues(o);
  const lean = (tt: number) => NL(tt, 0.67, S + 90) * 0.15;
  const height = (q: Tongue, tt: number) => {
    const leap = Math.max(0, NL(tt, 2.6, q.n + 70) - 0.5) * 1.3;
    return (q.h + 0.22 * q.h * NL(tt, 3.3, q.n) + q.h * leap * 0.6) * (0.9 + 0.1 * flick);
  };
  const sweep = (q: Tongue, tt: number, h: number) => NL(tt, 2.2, q.n + 40) * (0.8 + h * 0.06) + lean(tt) * h - clamp(q.x * 0.25, -2, 2);
  const tip = (q: Tongue, tt: number): [number, number] => {
    const h = height(q, tt);
    return [q.x + sweep(q, tt, h) * 0.8, q.y - h * 0.85 + 2];
  };
  const smokeCol = hex(o.smokeTint);

  // smoke curling up and bending in the draught, behind everything
  if (o.smoke > 0)
    looped(t, D, o.smoke, S + 300, (r) => ({ x: r.range(-2, 2), y: -o.height * 0.85 - r.range(0, 4), vx: r.range(-1.5, 1.5), vy: -r.range(7, 12), life: r.range(1.8, 2.8), s: r.range(1.6, 2.8) }), (q, age) => {
      const [x, y] = drift(q.x, q.y, q.vx, q.vy, age, 3, -12, 1.6, 1);
      smokePuff(p, x + NL(t - age, 0.8, S + 60) * (1.5 + 2.5 * age), y, 1 - age / q.life, q.s, smokeCol);
    });

  for (const q of T) {
    if (!q.back) continue;
    const h = height(q, t);
    flameTongue(p, q.x, q.y, h, q.w, sweep(q, t, h), N, q.n, H, BACK_LAYERS, 0.45, 0.9 + h * 0.03);
  }
  // flame puffs licking up off the bed
  looped(t, D, Math.round(o.spread * 4 + 6), S + 210, (r) => ({ x: r.range(-o.spread, o.spread), y: -r.range(1, 4), vx: r.range(-3, 3), vy: -r.range(14, 28), life: r.range(0.14, 0.26), s: r.range(0.7, 1.3), f: r.next() }), (q, age) => {
    const [x, y] = drift(q.x, q.y, q.vx, q.vy, age, 0, -80, 5, 3.2);
    firePuff(p, x, y, 1 - age / q.life, q.s, q.f, H, 0.12);
  });
  for (const q of T) {
    if (q.back) continue;
    const h = height(q, t);
    flameTongue(p, q.x, q.y, h, q.w, sweep(q, t, h), N, q.n, H, q.w > 2.2 ? BIG_LAYERS : LAYERS, 0.45, 0.9 + h * 0.03);
  }
  // licks torn off the tips, rising and shrinking
  looped(t, D, T.length * 8, S + 220, (r, j) => ({ i: j % T.length, vx: r.range(-2, 2), vy: -r.range(10, 18), s: r.range(0.7, 1.2), life: 0.24 }), (q, age) => {
    const [tx, ty] = tip(T[q.i], t - age);
    lick(p, tx + q.vx * age, ty - 1 + q.vy * age, 1 - age / q.life, q.s, H);
  });

  // pops: a crack of light and a few sparks thrown up that bounce on the ground
  const SPARKS = [H[1], H[2], H[4], H[5]];
  if (o.pops > 0)
    looped(t, D, o.pops, S + 400, (r) => ({ x: r.range(-o.spread * 0.7, o.spread * 0.7), y: -r.range(2, 5), n: r.int(2, 4), seed: r.int(0, 1e6), life: 0.6 }), (q, age) => {
      if (age < 0.07) {
        p.px(q.x, q.y, WHITE);
        p.glow(q.x, q.y, 8, H[1], 0.5 * (1 - age / 0.07));
      }
      const r = new Rng(q.seed);
      for (let j = 0; j < q.n; j++) {
        const a = -Math.PI / 2 + r.range(-0.8, 0.8), sp = r.range(70, 140), life = r.range(0.25, 0.5);
        if (age >= life) continue;
        const [x, y, vx, vy] = sparkAt(q.x, q.y, Math.cos(a) * sp, Math.sin(a) * sp, age, 1);
        spark(p, x, y, vx, vy, 1 - age / life, SPARKS);
      }
    });
  // embers carried up on the heat, wandering and cooling
  const EMB = [H[1], H[2], H[4], H[6]];
  looped(t, D, o.embers, S + 500, (r) => ({ x: r.range(-o.spread * 0.6, o.spread * 0.6), y: -r.range(4, o.height * 0.8), vx: r.range(-10, 10), vy: -r.range(18, 40), life: r.range(0.9, 2.1), s: r.chance(0.12) ? 2 : r.range(1, 1.5), a: r.range(0, 6.3) }), (q, age) => {
    const [x, y] = drift(q.x, q.y, q.vx, q.vy, age, 0, -24, 1.6, 1.6);
    ember(p, x + 5 * (Math.sin(age * 2.3 + q.a) - Math.sin(q.a)), y, 1 - age / q.life, q.s, EMB, age * 40 + q.a);
  });

  // light, kept tight round the flames: the wide warm light on the ground comes from the game's own
  // point lights (Ambience.ts), which add to the scene - this glow sits in the sprite, so too much of
  // it would only wash out what's under the fire
  const GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.2);
  const k = o.glow * flick;
  const lx = lean(t) * 8;
  p.glow(lx, -o.height * 0.5, o.height * 0.9 + o.spread * 0.6, GLOW, 0.16 * k);
  p.glow(0, -2, 4 + o.spread * 0.4, H[0], 0.1 * k);
  floorLight(p, 0, 0.5, o.spread * 1.6 + 6, 2.5 + o.spread * 0.2, GLOW, 0.1 * k);
}

/** A fire effect: flames, plus an optional base drawn under them (a torch stake, a brazier bowl). */
function fireFx(name: string, size: [number, number], origin: [number, number], defaults: Partial<FireOpts>, base?: (p: Painter) => void): FxModule & { draw(p: Painter, t: number, o: FireOpts): void } {
  const D = 3;
  return {
    meta: {
      name,
      size,
      origin,
      duration: D,
      loop: true,
      fps: 30,
      options: { palette: FIRE, height: 14, spread: 5, tongues: 5, smoke: 10, embers: 14, pops: 2, glow: 1, smokeTint: '#5b5566', seed: 1, ...defaults },
    },
    draw(p, t, o) {
      base?.(p);
      flames(p, t, D, o);
    },
  };
}

// --- the bases ---------------------------------------------------------------------------------------------

const WOOD = ['#1c100a', '#3b2216', '#5a3520', '#8a5a34'];
const IRON = ['#141218', '#2c2a34', '#4a4856', '#7a7888'];
const STONE = ['#1e2024', '#3c4048', '#5f6570', '#8c94a0'];

/** A wooden stake with an iron cup on top; the flames sit in the cup, 22 px up. */
function torchBase(p: Painter): void {
  const [ink, dark, mid, lite] = WOOD.map(hex);
  // the stake, lit on its left, a ring of binding near the top
  for (let y = -22; y <= 0; y++) {
    p.px(-2, y, ink), p.px(2, y, ink);
    p.px(-1, y, lite), p.px(0, y, mid), p.px(1, y, dark);
  }
  p.px(-1, 1, ink), p.px(0, 1, ink), p.px(1, 1, ink);
  const [iInk, iDark, iMid, iLite] = IRON.map(hex);
  for (const y of [-14, -13]) for (let x = -2; x <= 2; x++) p.px(x, y, y === -14 ? iMid : iDark);
  // the cup
  for (let x = -4; x <= 4; x++) p.px(x, -26, iInk);
  for (let x = -4; x <= 4; x++) p.px(x, -25, Math.abs(x) === 4 ? iInk : x < 0 ? iLite : iMid);
  for (let x = -3; x <= 3; x++) p.px(x, -24, Math.abs(x) === 3 ? iInk : iDark);
  for (let x = -2; x <= 2; x++) p.px(x, -23, iInk);
}

/** A squat stone pedestal with an iron bowl; flames 18 px up. */
function brazierBase(p: Painter): void {
  const [sInk, sDark, sMid, sLite] = STONE.map(hex);
  // the pedestal: a wider foot, a column, a cap
  const rows: [number, number][] = [[0, 6], [-1, 6], [-2, 5], [-3, 4], [-4, 3], [-5, 3], [-6, 3], [-7, 3], [-8, 3], [-9, 3], [-10, 4], [-11, 5]];
  for (const [y, hw] of rows) {
    for (let x = -hw; x <= hw; x++) {
      const edge = Math.abs(x) === hw;
      p.px(x, y, edge ? sInk : x < -hw + 2 ? sLite : x > hw - 2 ? sDark : sMid);
    }
  }
  for (let x = -6; x <= 6; x++) p.px(x, 1, sInk);
  for (let x = -5; x <= 5; x++) p.px(x, -12, sInk);
  // the bowl: an iron dish with a lit rim
  const [iInk, iDark, iMid, iLite] = IRON.map(hex);
  const bowl: [number, number][] = [[-13, 5], [-14, 7], [-15, 8], [-16, 8], [-17, 8]];
  for (const [y, hw] of bowl) for (let x = -hw; x <= hw; x++) p.px(x, y, Math.abs(x) === hw || y === -13 ? iInk : y === -17 ? (x < 0 ? iLite : iMid) : iDark);
  for (let x = -7; x <= 7; x++) p.px(x, -18, iInk);
  // glowing coals in the bowl
  for (let x = -6; x <= 6; x += 2) p.px(x, -17, hex('#ff8a2a'));
}

// --- the fires -----------------------------------------------------------------------------------------------

/** A big campfire for the PixelLab fire pit (stones and logs are the pit's own art). */
export const campfire = fireFx('Campfire', [72, 96], [36, 84], { height: 22, spread: 8.5, tongues: 8, smoke: 14, embers: 18, pops: 3, glow: 1, seed: 3 });

/** A low cooking fire under the pot on its tripod. */
export const cookfire = fireFx('Cook fire', [48, 56], [24, 48], { height: 8, spread: 5, tongues: 5, smoke: 0, embers: 8, pops: 1, glow: 0.8, seed: 5 });

/** A small fire in the old hearth. */
export const hearthfire = fireFx('Hearth fire', [40, 52], [20, 44], { height: 9, spread: 4, tongues: 4, smoke: 6, embers: 6, pops: 1, glow: 0.8, seed: 8 });

/** A cold blue spirit flame (the wayside shrine's). */
export const spiritflame = fireFx('Spirit flame', [36, 52], [18, 44], { palette: SPIRIT, height: 11, spread: 2, tongues: 3, smoke: 0, embers: 10, pops: 0, glow: 1, smokeTint: '#6a7aa0', seed: 11 });

/** Flames for a torch / brazier, drawn standing on (0, 0) of their own canvas; WorldScene stacks them on the bases. */
export const torchflame = fireFx('Torch flame', [32, 48], [16, 40], { height: 11, spread: 2.5, tongues: 3, smoke: 4, embers: 6, pops: 0, glow: 0.8, seed: 13 });
export const brazierflame = fireFx('Brazier flame', [40, 52], [20, 44], { height: 11, spread: 5, tongues: 5, smoke: 6, embers: 10, pops: 1, glow: 0.9, seed: 17 });

/** The torch stake and the brazier pedestal as still pictures (they don't move), drawn in code. */
export const torchStand = { meta: { name: 'Torch stand', size: [12, 30] as [number, number], origin: [6, 28] as [number, number], duration: 1, loop: true, fps: 1 }, draw: (p: Painter) => torchBase(p) };
export const brazierStand = { meta: { name: 'Brazier stand', size: [20, 22] as [number, number], origin: [10, 19] as [number, number], duration: 1, loop: true, fps: 1 }, draw: (p: Painter) => brazierBase(p) };
