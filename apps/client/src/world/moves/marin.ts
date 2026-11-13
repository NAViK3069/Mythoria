import { PEARL_U, PEARL_V } from '../../fx/effects/auras';
import { Droplet, Geyser, Ripples, Splash, WaterOrb, Wave, Whirlpool } from '../../fx/effects/tide';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Marin, the sea mage: her coral staff (its head forking round a sea-blue pearl), and the sea it calls - orbs of
// swirling water, whirlpools, geysers, a great wave.
//   attack  - ลูกน้ำวน: she lifts the staff and an orb of water gathers at its pearl, motes spiralling in; she points
//             and it flies at the foe in front and bursts - a crown of water, droplets, rings on the ground.
//   skill 1 - หอกวารี: the staff raised, then struck down; ripples run out from her feet, a whirlpool opens under every
//             foe in the row and a spear of water bursts up out of each - collapsing into rain.
//   skill 2 - คลื่นยักษ์: she sweeps the staff up and a wave rises in front of the foes, rolls across them all - each
//             drenched in a splash as its crest passes - curls and crashes, foam spilling out.
//   ult     - สึนามิ: the field sinks into the deep blue; she rises over a whirlpool, the staff held high, rain pouring
//             down on the foes over a great whirlpool opening under them - and a towering wave crashes over them all,
//             geysers bursting up under every one of them after it.

/** The pearl on her staff, from her hand (world px, measured off coralstaff.png: 18 art rows up the staff and 4 back
 * toward its other side, at 3/4). */
const ORB_U = PEARL_U;
const ORB_V = PEARL_V;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });

/** Where the pearl is now. */
function orb(k: MoveKit): { x: number; y: number } {
  const h = k.actor.hero!, g = h.grip, f = h.facing, dx = Math.cos(g.angle), dy = Math.sin(g.angle);
  return { x: g.x + dx * ORB_U - dy * ORB_V * f, y: g.y + dy * ORB_U + dx * ORB_V * f };
}

/** The staff lifted up high, the other hand open beneath it. */
function lift(k: MoveKit, ms: number, high = 1): Promise<unknown> {
  const h = k.actor.hero!;
  h.setHands('grip', 'palm');
  return Promise.all([
    k.tween(h, { swing: -0.3, leanInto: -0.08 }, ms, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: 1, y: -8 * high }, ms, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: 3, y: -4 * high }, ms, 'Quad.easeOut'),
  ]);
}

/** The staff pointed at the foe. */
function point(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0.75, leanInto: 0.14 }, ms, 'Cubic.easeOut'),
    k.tween(h.reachFront, { x: 6, y: -4 }, ms, 'Cubic.easeOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Cubic.easeOut'),
  ]);
}

/** The staff struck down at the ground. */
function strike(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0.15, leanInto: 0.1 }, ms, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 4, y: 3 }, ms, 'Cubic.easeIn'),
  ]);
}

function recover(k: MoveKit, ms = 280): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(k.actor, { alt: 0 }, ms, 'Sine.easeInOut'),
  ]).then(() => k.regrip());
}

/** A foe drenched: a splash at its chest, rings on the ground under it. */
function drench(k: MoveKit, t: MoveActor, r = 10): void {
  k.layer.add(new Splash(t.x, t.y, { r, h: t.h * 0.5 + t.alt, dur: 0.75 }, k.sp));
  glitter(k.layer, t.x, t.y - t.h * 0.5, { r: t.half + 4, n: 5, pal: 'water', dur: 0.4, size: 2 }, k.sp);
}

/** The field the foes stand on: its middle, how wide it reaches, its far and near edges, its front and back. */
function field(k: MoveKit) {
  const ts = k.targets.length ? k.targets : [k.main], d = k.dir;
  const xs = ts.map((t) => t.x), ys = ts.map((t) => t.y);
  const front = d > 0 ? Math.min(...xs) : Math.max(...xs), back = d > 0 ? Math.max(...xs) : Math.min(...xs);
  return { ts, front, back, top: Math.min(...ys), bot: Math.max(...ys), cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** ลูกน้ำวน: an orb of water gathers at the pearl and flies at the foe in front - bursting. */
async function attack(k: MoveKit): Promise<void> {
  const t = k.main, sp = k.sp;
  await lift(k, 200, 0.8);
  const hit = new Promise<void>((done) => k.layer.add(new WaterOrb(() => orb(k), () => chest(t), { r: 5, hold: 0.36, dur: 0.24, arc: 12, onHit: () => done() }, sp)));
  await k.wait(320);
  void point(k, 90);
  await hit;
  const c = chest(t);
  drench(k, t, 11);
  k.ground.add(new Ripples(t.x, t.y, 26, { n: 3, dur: 0.8 }, sp));
  k.layer.add(new Vfx('ring', c.x, c.y, { r: 14, w: 2, pal: 'water', dur: 0.3 }, sp));
  k.land();
  k.shake(70, 0.0014);
  await k.wait(320);
  await recover(k, 260);
}

/** หอกวารี: the staff struck down - a whirlpool under each foe in the row, a spear of water bursting up out of each. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, sp = k.sp, f = field(k);
  await lift(k, 220, 1.1);
  glitter(k.layer, orb(k).x, orb(k).y, { r: 10, n: 7, pal: 'water', dur: 0.35, size: 2 }, sp);
  k.layer.add(new Vfx('star', orb(k).x, orb(k).y, { r: 9, pal: 'water', dur: 0.4 }, sp));
  await k.wait(160);
  await strike(k, 110);
  k.ground.add(new Ripples(a.x, a.y, 30, { n: 3, dur: 0.8 }, sp));
  k.layer.add(new Splash(a.x + k.dir * 8, a.y, { r: 6, dur: 0.5 }, sp));
  k.shake(60, 0.0012);
  // a whirlpool opening under each, then the spears of water
  f.ts.forEach((t, i) => k.ground.add(new Whirlpool(t.x, t.y, t.half + 12, { dur: 1.1, delay: i * 0.07, spin: 9 }, sp)));
  await k.wait(300);
  let landed = false;
  f.ts.forEach((t, i) =>
    k.layer.add(new Geyser(t.x, t.y + 1, { h: 50, w: 5, dur: 0.8, delay: i * 0.07, onHit: () => {
      k.layer.add(new Splash(t.x, t.y, { r: 9, h: t.h * 0.4, dur: 0.6 }, sp));
      k.ground.add(new Ripples(t.x, t.y, 24, { n: 2, dur: 0.7 }, sp));
      if (!landed) {
        landed = true;
        k.land();
        k.hitStop(40);
      }
      k.shake(60, 0.0016);
    } }, sp)),
  );
  await k.wait(f.ts.length * 70 + 700);
  await recover(k, 260);
}

/** คลื่นยักษ์: a wave rises in front of the foes, rolls across them all and crashes. */
async function skill2(k: MoveKit): Promise<void> {
  const d = k.dir, sp = k.sp, f = field(k), h = k.actor.hero!;
  // the staff swept up, the other hand raised with it
  h.setHands('grip', 'palm');
  await Promise.all([
    k.tween(h, { swing: -0.5, leanInto: -0.14 }, 240, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -2, y: -10 }, 240, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: 4, y: -8 }, 240, 'Quad.easeOut'),
  ]);
  k.layer.add(new Vfx('star', orb(k).x, orb(k).y, { r: 10, pal: 'water', dur: 0.4 }, sp));
  k.ground.add(new Ripples(k.actor.x, k.actor.y, 26, { n: 2, dur: 0.6 }, sp));
  await k.wait(120);
  void point(k, 160);
  let landed = false;
  const hits = f.ts.map((t) => ({ x: t.x - d * 4, cb: () => {
    drench(k, t, 12);
    if (!landed) {
      landed = true;
      k.land();
    }
    k.shake(60, 0.0018);
  } }));
  const x0 = f.front - d * 34, x1 = f.back + d * 30;
  await new Promise<void>((done) => k.layer.add(new Wave(x0, x1, f.top - 16, f.bot + 8, { h: 42, dur: 0.9, hits: [...hits, { x: x1, cb: () => done() }] }, sp)));
  k.shake(160, 0.0024);
  f.ts.forEach((t, i) => k.ground.add(new Ripples(t.x, t.y, 22, { n: 2, dur: 0.7, delay: i * 0.04 }, sp)));
  await k.wait(450);
  await recover(k, 280);
}

/** สึนามิ: the deep blue, rain over a great whirlpool under the foes - a towering wave - geysers under every one. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, d = k.dir, sp = k.sp, f = field(k), h = a.hero!;
  await k.dim(0.5, 260, 0x04183a);
  // she rises over a whirlpool, the staff held high
  k.ground.add(new Whirlpool(a.x, a.y, 24, { dur: 3.4, spin: 5 }, sp));
  h.setHands('grip', 'palm');
  await Promise.all([
    k.tween(a, { alt: 10 }, 320, 'Sine.easeOut'),
    k.tween(h, { swing: -0.35, leanInto: -0.1 }, 320, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: 0, y: -11 }, 320, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: 4, y: -6 }, 320, 'Quad.easeOut'),
  ]);
  const p = orb(k);
  k.layer.add(new Vfx('star', p.x, p.y, { r: 14, pal: 'water', dur: 0.6 }, sp));
  k.layer.add(new Vfx('ring', p.x, p.y, { r: 22, w: 3, pal: 'water', dur: 0.5 }, sp));
  // a great whirlpool opening under the foes, rain pouring down on them
  const W = Math.max(60, Math.abs(f.back - f.front) + 56);
  k.ground.add(new Whirlpool(f.cx, f.cy, W / 2, { dur: 3.0, spin: 4, arms: 5 }, sp));
  for (let i = 0; i < 26; i++) {
    const x = f.cx + (Math.random() - 0.5) * W, y = f.top - 10 + Math.random() * (f.bot - f.top + 20);
    k.layer.add(new Droplet(x, y, { h: 110, fall: 0.26, delay: i * 0.035, r: 4 }, sp));
  }
  k.shake(300, 0.0012);
  await k.wait(900);
  // the towering wave
  void point(k, 200);
  let landed = false;
  const hits = f.ts.map((t) => ({ x: t.x - d * 6, cb: () => {
    drench(k, t, 14);
    if (!landed) {
      landed = true;
      k.land();
      k.hitStop(60);
    }
    k.shake(80, 0.0022);
  } }));
  const x0 = f.front - d * 40, x1 = f.back + d * 36;
  await new Promise<void>((done) => k.layer.add(new Wave(x0, x1, f.top - 22, f.bot + 10, { h: 68, dur: 1.0, hits: [...hits, { x: x1, cb: () => done() }] }, sp)));
  k.flash(90, 0x9ae6ff);
  k.shake(260, 0.0034);
  // and geysers bursting up under every one of them
  await k.wait(200);
  f.ts.forEach((t, i) => {
    k.ground.add(new Ripples(t.x, t.y, 30, { n: 3, dur: 0.9, delay: i * 0.06 }, sp));
    k.layer.add(new Geyser(t.x, t.y + 1, { h: 64, w: 6, dur: 0.85, delay: i * 0.06, onHit: () => {
      k.layer.add(new Splash(t.x, t.y, { r: 12, h: t.h * 0.5, dur: 0.7 }, sp));
      k.shake(70, 0.002);
    } }, sp));
  });
  await k.wait(f.ts.length * 60 + 900);
  void k.dim(0, 400);
  await recover(k, 320);
}

export const MARIN: HeroMoves = { attack, skill1, skill2, ult };
