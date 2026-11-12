import { BladeTrail, GroundSigil } from '../../fx/effects/holy';
import { FrostShell, FrostSwirl, IceSpikes, Snowflakes } from '../../fx/effects/ice';
import { CutLine } from '../../fx/effects/shadow';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Dravik, the frost dragon knight: an ice lance (the owner's, held at its grip) and moves of ice -
//   attack  - แทงหอกน้ำแข็ง: runs in with the lance levelled, draws it back and drives it straight through the foe -
//             a streak of frost along the thrust, shards and snow bursting off it, crystals cracking up at its feet.
//   skill 1 - เกล็ดมังกรเยือกแข็ง: the lance driven point-down into the ground: crystals burst up all round him, a shell
//             of ice closes over him and shatters into scales of frost (his attack up), and a cold war cry goes out.
//   skill 2 - ลมหายใจน้ำแข็ง: the lance raised and brought down - a wave of ice spikes races across the ground to the
//             foes' row and bursts up under each of them, freezing them in ice that shatters.
//   ult     - พิโรธมังกรน้ำแข็ง: the lance held up to the sky in a whirl of frost and snow - then driven down: ice bursts up
//             under every foe, freezing each in a block of ice that shatters.

/** From the hand to the lance's point (world px: the owner's lance, 50 art px at 3/4, held 8 up from its end). */
const BLADE = 30;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });

function recover(k: MoveKit, ms = 220): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
  ]);
}

/** Ice bursting off a foe that's been struck. */
function iceHit(k: MoveKit, x: number, y: number, big = false): void {
  const sp = k.sp, d = k.dir;
  k.layer.add(new Vfx('star', x, y, { r: big ? 14 : 10, pal: 'ice', dur: 0.32 }, sp));
  k.layer.add(new Vfx('spikes', x, y, { r: big ? 22 : 16, n: big ? 11 : 8, a: d > 0 ? 0 : Math.PI, spread: Math.PI * 1.3, pal: 'ice', dur: 0.42 }, sp));
  k.layer.add(new Vfx('ring', x, y, { r: big ? 20 : 14, w: 3, sq: 0.85, pal: 'ice', dur: 0.36 }, sp));
  k.layer.add(new Snowflakes(x, y, big ? 22 : 16, { n: big ? 14 : 9, dur: 1.1 }, sp));
}

/** แทงหอกน้ำแข็ง: run in with the lance levelled, draw it back, drive it straight through. */
async function attack(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir;
  // the run-up, the lance coming down level
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 14, dur: 0.6 }, k.sp));
  void k.tween(h, { swing: 1.5, leanInto: 0.12 }, 180, 'Quad.easeOut');
  void k.tween(h.reachFront, { x: 0, y: 2 }, 180, 'Quad.easeOut');
  await k.moveTo(a, t.x - d * (t.half + 30), t.y + 1, 230, 'Quad.easeIn');
  k.ground.add(new Vfx('dust', a.x + d * 4, a.y, { r: 10, dur: 0.45 }, k.sp));
  // drawn back...
  await Promise.all([
    k.tween(h.reachFront, { x: -7, y: 1 }, 120, 'Quad.easeOut'),
    k.tween(h, { leanInto: -0.1 }, 120, 'Quad.easeOut'),
  ]);
  await k.wait(50);
  // ...and driven through: a streak of frost along it
  const c = chest(t);
  const tr = k.layer.add(new BladeTrail(h.grip, { rIn: BLADE - 10, R: BLADE + 3, pal: 'ice', life: 0.2 }, k.sp));
  await Promise.all([
    k.tween(h.reachFront, { x: 13, y: 1 }, 70, 'Cubic.easeIn'),
    k.tween(h, { leanInto: 0.22 }, 70, 'Cubic.easeIn'),
  ]);
  tr.release();
  k.layer.add(new CutLine(a.x + d * 8, c.y, c.x + d * 22, c.y, { w: 3, pal: 'ice', dur: 0.4 }, k.sp));
  iceHit(k, c.x, c.y);
  k.ground.add(new IceSpikes(t.x + d * 4, t.y + 1, { w: 18, h: 11, n: 4, dur: 0.6 }, k.sp));
  k.land();
  k.hitStop(50);
  await k.wait(220);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 300);
  k.regrip();
}

/** เกล็ดมังกรเยือกแข็ง: the lance driven into the ground, crystals all round, a shell of ice that shatters, a war cry. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp;
  await Promise.all([
    k.tween(h, { swing: -0.1, leanInto: -0.06 }, 200, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -1, y: -9 }, 200, 'Quad.easeOut'),
  ]);
  await k.wait(60);
  // point-down into the ground
  await Promise.all([
    k.tween(h, { swing: 3.05, leanInto: 0.12 }, 90, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 5, y: 5 }, 90, 'Cubic.easeIn'),
  ]);
  k.shake(120, 0.002);
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 44, w: 5, sq: 0.3, pal: 'ice', dur: 0.6 }, sp));
  k.layer.add(new IceSpikes(a.x - 16, a.y + 2, { w: 16, h: 16, n: 4, dur: 1.0 }, sp));
  k.layer.add(new IceSpikes(a.x + 16, a.y + 2, { w: 16, h: 18, n: 4, dur: 1.0, delay: 0.04 }, sp));
  k.ground.add(new IceSpikes(a.x, a.y - 8, { w: 30, h: 14, n: 6, dur: 1.0, delay: 0.02 }, sp));
  k.layer.add(new FrostShell(a.x, a.y + 1, 22, 34, { dur: 0.75, delay: 0.08 }, sp));
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 12, h: 44, pal: 'ice', dur: 1.0 }, sp));
  await k.wait(260);
  // the cold war cry
  k.layer.add(new Vfx('roar', a.x + d * 10, a.y - 16, { r: 100, dir: d, n: 5, pal: 'ice', dur: 0.9 }, sp));
  k.layer.add(new Snowflakes(a.x, a.y - 14, 26, { n: 16, dur: 1.4 }, sp));
  k.land();
  await k.wait(700);
  await recover(k, 240);
  k.regrip();
}

/** ลมหายใจน้ำแข็ง: the lance brought down - a wave of ice spikes races across to the foes' row and bursts under them. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp;
  // raised, then brought down hard in front of him
  await Promise.all([
    k.tween(h, { swing: -0.6, leanInto: -0.1 }, 220, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -3, y: -10 }, 220, 'Quad.easeOut'),
  ]);
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 11, h: 40, pal: 'ice', dur: 0.6 }, sp));
  await k.wait(80);
  const tr = k.layer.add(new BladeTrail(h.grip, { rIn: BLADE - 12, R: BLADE + 2, pal: 'ice', life: 0.24 }, sp));
  await Promise.all([
    k.tween(h, { swing: 2.3, leanInto: 0.2 }, 110, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 8, y: 4 }, 110, 'Cubic.easeIn'),
  ]);
  tr.release();
  k.shake(110, 0.0018);
  // the wave: spikes one after another across the ground to the foes' row
  const tx = k.targets.length ? k.targets.reduce((n, t) => n + t.x, 0) / k.targets.length : a.x + d * 120;
  const ty = k.targets.length ? k.targets.reduce((n, t) => n + t.y, 0) / k.targets.length : a.y;
  const from = a.x + d * 22, steps = Math.max(3, Math.round(Math.abs(tx - from) / 16));
  for (let i = 0; i < steps; i++) {
    const u = i / steps, x = from + (tx - from) * u, y = a.y + (ty - a.y) * u;
    k.ground.add(new IceSpikes(x, y + 1, { w: 14, h: 8 + 6 * u, n: 3, dur: 0.55 }, sp));
    k.ground.add(new Vfx('dust', x, y, { r: 8, pal: 'ice', dur: 0.4 }, sp));
    await k.wait(40);
  }
  // under each of them: a burst of ice, a block of it closing round them, then shattering
  for (const t of k.targets) {
    k.layer.add(new IceSpikes(t.x, t.y + 2, { w: 26, h: 22, n: 6, dur: 0.9 }, sp));
    k.layer.add(new FrostShell(t.x, t.y + 1, Math.max(20, t.half * 2 + 4), t.h + 4, { dur: 0.55, delay: 0.05 }, sp));
    const c = chest(t);
    iceHit(k, c.x, c.y, true);
  }
  k.land();
  k.hitStop(60);
  await k.wait(650);
  await recover(k, 240);
  k.regrip();
}

/** พิโรธมังกรน้ำแข็ง: the lance to the sky in a whirl of frost - then down: ice bursts up under every foe. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, sp = k.sp;
  await Promise.all([
    k.tween(h, { swing: 0, leanInto: -0.07 }, 260, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -2, y: -12 }, 260, 'Quad.easeOut'),
  ]);
  k.layer.add(new FrostSwirl(a.x, a.y, 26, 60, 1.35, sp));
  k.ground.add(new GroundSigil(a.x, a.y, 34, 1.6, 'ice', sp));
  k.layer.add(new Snowflakes(a.x, a.y - 40, 50, { n: 24, dur: 1.6 }, sp));
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 14, h: 54, pal: 'ice', dur: 1.2 }, sp));
  glitter(k.layer, a.x, a.y - 20, { r: 26, n: 14, pal: 'ice', dur: 1.0, size: 4 }, sp);
  await k.wait(1000);
  // driven down: the ice bursts up under them all
  await Promise.all([
    k.tween(h, { swing: 3.05, leanInto: 0.18 }, 100, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 6, y: 6 }, 100, 'Cubic.easeIn'),
  ]);
  k.flash(150, 0xd8f4ff);
  k.shake(200, 0.0028);
  k.hitStop(60);
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 180, w: 9, sq: 0.3, pal: 'ice', dur: 1.0 }, sp));
  k.layer.add(new IceSpikes(a.x, a.y + 3, { w: 44, h: 26, n: 9, dur: 1.2 }, sp));
  k.targets.forEach((t, i) => {
    window.setTimeout(() => {
      k.ground.add(new IceSpikes(t.x, t.y - 6, { w: 34, h: 16, n: 6, dur: 1.4 }, sp));
      k.layer.add(new IceSpikes(t.x, t.y + 3, { w: 38, h: 20, n: 7, dur: 1.4, delay: 0.05 }, sp));
      k.layer.add(new FrostShell(t.x, t.y + 1, Math.max(22, t.half * 2 + 6), t.h + 8, { dur: 0.7, delay: 0.1 }, sp));
      const c = chest(t);
      iceHit(k, c.x, c.y, true);
    }, (80 + i * 70) / sp);
  });
  await k.wait(450);
  k.land();
  await k.wait(900);
  await recover(k, 280);
  k.regrip();
}

export const DRAVIK: HeroMoves = { attack, skill1, skill2, ult };
