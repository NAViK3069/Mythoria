import { FireBurst, GroundCracks, SmokeBillow, StarBurst } from '../../fx/effects/blaze';
import { BladeTrail } from '../../fx/effects/holy';
import { CutLine } from '../../fx/effects/shadow';
import { glitter, Vfx } from '../../fx/effects/vfx';
import { FlameLance, SpearFlame } from '../../fx/effects/firespear';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Fenrir, the fire-wolf hunter: the owner's spear (its blade recoloured to fire), held diagonally in BOTH hands (heroGear `twoHand`: the back hand
// rides the same shaft), and fire - lances of flame driven out of his spear's point or called down out of the sky.
//   attack  - แทงหอก: in low, the spear levelled and drawn back - and driven through, a streak of fire along it, flames
//             bursting up off the foe.
//   skill 1 - หอกเพลิง: fire spirals up the spear as he twirls it; he closes in, sweeps it up in a burning arc and drives
//             it home - the foe blown open in flame, embers left burning on it.
//   skill 2 - ล่าเหยื่อ: drawn far back, fire winding up the spear and gathering at its point - he drives it at the foe
//             from where he stands and a lance of flame streaks out of it and through; he springs high after it and
//             comes down spear-first - the ground split and smoking, fire bursting up.
//   ult     - ฝนหอกเพลิง: the field goes dark; he raises the spear to the sky, fire roaring round him, and shoots a lance
//             of flame up out of its point - lances of flame rain down round the foe, the last and greatest through it; he leaps, the spear
//             wreathed in fire, and plunges it down - a pillar of flame, a starburst, the ground split, smoke rolling out.

/** From his front hand to the spear's point (world px: 44 art rows up at 3/4). */
const TIP = 33;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });

function recover(k: MoveKit, ms = 240): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(k.actor, { alt: 0 }, ms, 'Quad.easeIn'),
  ]).then(() => {
    h.bothHands = true;
    k.regrip();
  });
}

const trail = (k: MoveKit, life = 0.24) => k.layer.add(new BladeTrail(k.actor.hero!.grip, { rIn: TIP - 12, R: TIP + 2, pal: 'fire', life }, k.sp));

/** The spear levelled at the foe (its point forward), drawn back. */
function level(k: MoveKit, ms: number, back = -6): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0.66, leanInto: -0.08 }, ms, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: back, y: 3 }, ms, 'Quad.easeOut'),
  ]);
}

/** And driven forward. */
function thrust(k: MoveKit, ms: number, far = 12): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h.reachFront, { x: far, y: 2 }, ms, 'Cubic.easeIn'),
    k.tween(h, { leanInto: 0.24 }, ms, 'Cubic.easeIn'),
  ]);
}

/** A burning blow landing on a foe: flames bursting up off it, a starburst, embers. */
function fireHit(k: MoveKit, t: MoveActor, big = false): void {
  const { x, y } = chest(t), d = k.dir, sp = k.sp;
  k.layer.add(new FireBurst(t.x - d * 2, t.y, { r: big ? 36 : 26, dir: d, dur: 0.6 }, sp));
  k.layer.add(new StarBurst(x, y, { r: big ? 20 : 14, dur: 0.8 }, sp));
  glitter(k.layer, x, y, { r: 14, n: big ? 10 : 6, pal: 'fire', dur: 0.4, size: 2, rise: -18 }, sp);
}

/** แทงหอก: in low, levelled, driven through - a streak of fire. */
async function attack(k: MoveKit): Promise<void> {
  const a = k.actor, t = k.main, d = k.dir;
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 14, pal: 'smoke', dur: 0.6 }, k.sp));
  void level(k, 180, 0);
  await k.moveTo(a, t.x - d * (t.half + 34), t.y + 1, 230, 'Quad.easeIn');
  await level(k, 110, -7);
  await k.wait(50);
  const c = chest(t), tr = trail(k, 0.2);
  await thrust(k, 70, 13);
  tr.release();
  k.layer.add(new CutLine(a.x + d * 8, c.y, c.x + d * 24, c.y, { w: 3, pal: 'fire', dur: 0.4 }, k.sp));
  fireHit(k, t);
  k.land();
  k.hitStop(50);
  await k.wait(240);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 300);
}

/** หอกเพลิง: fire spiralling up the spear as he twirls it, a burning sweep up, the thrust home - blown open in flame. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, sp = k.sp;
  // the twirl: one hand lets go, the spear spins round, fire running up it
  h.bothHands = false;
  k.layer.add(new SpearFlame(h.grip, { from: -12, to: TIP, dur: 0.9 }, sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 26, w: 3, sq: 0.32, pal: 'fire', dur: 0.5 }, sp));
  await k.tween(h, { swing: Math.PI * 2 + 0.2 }, 420, 'Sine.easeInOut');
  h.swing = 0.2;
  h.bothHands = true;
  await k.wait(60);
  // in close
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 14, pal: 'smoke', dur: 0.5 }, sp));
  void level(k, 150, -3);
  await k.moveTo(a, t.x - d * (t.half + 30), t.y + 1, 170, 'Cubic.easeIn');
  const c = chest(t);
  // the burning sweep up
  let tr = trail(k, 0.3);
  await Promise.all([
    k.tween(h, { swing: -0.6, leanInto: 0.1 }, 110, 'Cubic.easeOut'),
    k.tween(h.reachFront, { x: 6, y: -6 }, 110, 'Cubic.easeOut'),
  ]);
  tr.release();
  k.layer.add(new Vfx('slash', c.x - d * 4, c.y + 2, { r: 22, a: d > 0 ? 2.2 : Math.PI - 2.2, sweep: 2.4, dir: -d, w: 7, pal: 'fire', tilt: 0.75, dur: 0.38 }, sp));
  k.layer.add(new FireBurst(t.x - d * 3, t.y, { r: 22, dir: d, dur: 0.5 }, sp));
  k.land();
  k.hitStop(40);
  // and driven home
  await level(k, 90, -6);
  tr = trail(k, 0.22);
  await thrust(k, 70, 14);
  tr.release();
  k.layer.add(new CutLine(a.x + d * 6, c.y, c.x + d * 28, c.y, { w: 4, pal: 'fire', dur: 0.45 }, sp));
  k.layer.add(new StarBurst(c.x, c.y, { r: 24, dur: 0.9 }, sp));
  k.layer.add(new FireBurst(t.x, t.y, { r: 38, dir: d, dur: 0.7, n: 18, spread: 2.0 }, sp));
  fireHit(k, t, true);
  k.flash(90, 0xffa040);
  k.shake(140, 0.0026);
  k.hitStop(70);
  // the burn: embers rising off it
  for (let i = 0; i < 3; i++) glitter(k.layer, t.x, t.y - t.h * 0.4, { r: t.half + 4, n: 5, pal: 'fire', dur: 0.6, size: 2, rise: -22 }, sp);
  await k.wait(380);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 300);
}

/** Where the spear's point is now. */
function tip(k: MoveKit): { x: number; y: number } {
  const g = k.actor.hero!.grip;
  return { x: g.x + Math.cos(g.angle) * TIP, y: g.y + Math.sin(g.angle) * TIP };
}

/** Fire winding up the spear, sparks gathering at its point, a star flaring there. */
function charge(k: MoveKit, ms: number): void {
  const h = k.actor.hero!, sp = k.sp, p = tip(k);
  k.layer.add(new SpearFlame(h.grip, { from: -10, to: TIP, dur: ms / 1000 + 0.2 }, sp));
  glitter(k.layer, p.x, p.y, { r: 14, n: 9, pal: 'fire', dur: ms / 1000, size: 2 }, sp);
  k.layer.add(new Vfx('star', p.x, p.y, { r: 12, pal: 'fire', dur: ms / 1000 + 0.15 }, sp));
}

/** ล่าเหยื่อ: a lance of flame driven out of his spear's point through the foe; he springs after it and comes down spear-first. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, sp = k.sp;
  // drawn far back, fire winding up the spear and gathering at its point
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 28, w: 3, sq: 0.32, pal: 'fire', dur: 0.6 }, sp));
  await level(k, 200, -11);
  charge(k, 380);
  await k.wait(380);
  // driven at the foe - and the lance streaks out of it and through
  const tr = trail(k, 0.2);
  void thrust(k, 70, 10);
  await k.wait(50);
  tr.release();
  const p = tip(k), c = chest(t);
  k.flash(50, 0xffc060);
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 16, pal: 'smoke', dur: 0.5 }, sp));
  await new Promise<void>((done) => k.layer.add(new FlameLance(p.x, p.y, c.x, c.y, { dur: 0.13, scale: 1.2, over: 70, onHit: () => done() }, sp)));
  fireHit(k, t);
  k.land();
  k.hitStop(50);
  k.shake(100, 0.002);
  await k.wait(160);
  // he springs high after it...
  const land = { x: t.x - d * (t.half + 14), y: t.y + 1 };
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 16, pal: 'smoke', dur: 0.6 }, sp));
  void k.tween(h, { swing: 1.9, leanInto: 0.1 }, 260, 'Quad.easeOut');
  void k.tween(h.reachFront, { x: 4, y: -2 }, 260, 'Quad.easeOut');
  void k.tween(a, { alt: 44 }, 260, 'Quad.easeOut');
  await k.moveTo(a, (a.x + land.x) / 2, (a.y + land.y) / 2, 260, 'Linear');
  k.layer.add(new SpearFlame(h.grip, { from: -8, to: TIP, dur: 0.5 }, sp));
  // ...and down, spear-first
  const tr2 = trail(k, 0.3);
  void k.moveTo(a, land.x, land.y, 160, 'Linear');
  await Promise.all([k.tween(a, { alt: 0 }, 160, 'Quad.easeIn'), k.tween(h.reachFront, { x: 8, y: 6 }, 160, 'Cubic.easeIn')]);
  tr2.release();
  const P = { x: t.x - d * 4, y: t.y + 1 };
  k.ground.add(new GroundCracks(P.x, P.y, { w: 30, dur: 1.6, n: 8 }, sp));
  k.layer.add(new SmokeBillow(P.x, P.y, { w: 30, dur: 1.4, n: 12, heap: 3 }, sp));
  fireHit(k, t, true);
  k.flash(80, 0xffa040);
  k.shake(160, 0.003);
  k.hitStop(70);
  await k.wait(380);
  void recover(k, 260);
  await k.moveTo(a, a.home.x, a.home.y, 320);
}

/** ฝนหอกเพลิง: dark, the spear raised, a lance of flame shot into the sky - lances of flame rain down - then the spear plunged down in fire. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, sp = k.sp;
  const view = k.layer.view;
  await k.dim(0.55, 260, 0x2a0604);
  // the spear raised to the sky, fire roaring up round him
  await Promise.all([
    k.tween(h, { swing: -0.95, leanInto: -0.2 }, 240, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: 0, y: -8 }, 240, 'Quad.easeOut'),
  ]);
  k.layer.add(new Vfx('roar', a.x + d * 6, a.y - 24, { r: 56, dir: d, pal: 'fire', n: 4, dur: 0.8 }, sp));
  k.layer.add(new FireBurst(a.x, a.y, { r: 30, dir: d, dur: 0.8, n: 16, spread: 2.6 }, sp));
  k.layer.add(new SpearFlame(h.grip, { from: -12, to: TIP, dur: 2.2 }, sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 40, w: 5, sq: 0.32, pal: 'fire', dur: 0.6 }, sp));
  const p = tip(k);
  k.layer.add(new StarBurst(p.x, p.y, { r: 16, dur: 0.7 }, sp));
  k.shake(200, 0.002);
  await k.wait(300);
  // a lance of flame shot up out of its point into the sky...
  k.layer.add(new FlameLance(p.x, p.y, p.x + d * 10, view.y - 60, { dur: 0.16, scale: 1.4, burst: false }, sp));
  k.flash(50, 0xffc060);
  await k.wait(320);
  // ...and down they rain round the foe...
  const N = 6;
  for (let i = 0; i < N; i++) {
    const ex = t.x + (((i * 7) % N) / (N - 1) - 0.5) * 70, ey = t.y + (((i * 5) % 3) - 1) * 9;
    const hit = () => {
      k.ground.add(new GroundCracks(ex, ey, { w: 14, dur: 1.2, n: 4 }, sp));
      k.layer.add(new FireBurst(ex, ey, { r: 16, dir: d, dur: 0.5 }, sp));
      k.shake(60, 0.0014);
    };
    k.layer.add(new FlameLance(ex - d * 26, view.y - 20, ex, ey, { dur: 0.13, delay: i * 0.075, scale: 1.3, burst: false, onHit: hit }, sp));
  }
  await k.wait(N * 75 + 60);
  // ...the last and greatest through it
  const c = chest(t);
  await new Promise<void>((done) => k.layer.add(new FlameLance(t.x - d * 34, view.y - 30, c.x, c.y, { dur: 0.15, scale: 2, over: 40, onHit: () => done() }, sp)));
  fireHit(k, t, true);
  k.land();
  k.flash(70, 0xffb040);
  k.hitStop(60);
  k.shake(160, 0.0026);
  await k.wait(160);
  // he leaps high, the spear wreathed in fire...
  const land = { x: t.x - d * (t.half + 14), y: t.y + 1 };
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 18, pal: 'smoke', dur: 0.7 }, sp));
  void k.tween(h, { swing: 2.0, leanInto: 0.1 }, 280, 'Quad.easeOut');
  void k.tween(h.reachFront, { x: 4, y: -2 }, 280, 'Quad.easeOut');
  void k.tween(a, { alt: 52 }, 280, 'Quad.easeOut');
  await k.moveTo(a, (a.x + land.x) / 2, (a.y + land.y) / 2, 280, 'Linear');
  // ...and plunges it down
  const tr = trail(k, 0.34);
  void k.moveTo(a, land.x, land.y, 170, 'Linear');
  await Promise.all([k.tween(a, { alt: 0 }, 170, 'Quad.easeIn'), k.tween(h.reachFront, { x: 9, y: 7 }, 170, 'Cubic.easeIn')]);
  tr.release();
  const P = { x: t.x - d * 4, y: t.y + 1 };
  k.ground.add(new GroundCracks(P.x, P.y, { w: 50, dur: 1.8, n: 10 }, sp));
  k.layer.add(new SmokeBillow(P.x, P.y, { w: 50, dur: 2, n: 18, heap: 5 }, sp));
  k.layer.add(new FireBurst(P.x, P.y, { r: 48, dir: d, dur: 0.9, n: 22, spread: 2.2 }, sp));
  k.layer.add(new StarBurst(P.x, P.y - 14, { r: 32, dur: 1 }, sp));
  fireHit(k, t, true);
  k.flash(120, 0xffb040);
  k.hitStop(100);
  k.shake(280, 0.0036);
  for (let i = 0; i < 3; i++) glitter(k.layer, t.x, t.y - t.h * 0.4, { r: t.half + 6, n: 8, pal: 'fire', dur: 0.8, size: 2, rise: -28 }, sp);
  await k.wait(900);
  void k.dim(0, 400);
  void recover(k, 280);
  await k.moveTo(a, a.home.x, a.home.y, 380);
}

export const FENRIR: HeroMoves = { attack, skill1, skill2, ult };
