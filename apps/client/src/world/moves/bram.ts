import { BladeTrail, DawnRays, GroundSigil, HaloRings, LightColumn, MoteSpiral, ShieldDome, TipStar } from '../../fx/effects/holy';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Bram, the knight of light: his sword (tools/weapon_art.py, held at its grip) and kite shield, and his moves -
//   attack  - runs in, the sword drawn back; raises it high over his head; brings it down in one great stroke (a
//             crescent of gold behind the blade), the blow bursting into a star, shards and lines of light.
//   skill 1 - ปราการแสง: shield up, a shout of light at the foes (the taunt), a dome of light round himself.
//   skill 2 - โล่พิทักษ์: the shield raised high over his head, light drawn up into it, then bursting out of it: a
//             circle of light opens under him and a dome of light rises over each friend.
//   ult     - รุ่งอรุณพิทักษ์: the sword held up to the sky - a column of light comes down onto it, light rises off
//             the ground all round and spirals up into the blade - then driven into the ground: the dawn breaks over
//             the whole team (a wave across the ground, rays rising), a column of light and a dome on each.

/** From the hand to the sword's point, and to just past its guard (world px). */
const BLADE = 15.5;
const GUARD = 4;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });
const tip = (k: MoveKit) => {
  const g = k.actor.hero!.grip;
  return { x: g.x + Math.cos(g.angle) * BLADE, y: g.y + Math.sin(g.angle) * BLADE };
};

/** Back to standing easy: the sword and shield where they rest. */
function recover(k: MoveKit, ms = 220): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
  ]);
}

/** Where a sword blow lands: a star flaring, shards of light, a ring, lines thrown on ahead, a crescent cut. */
function swordHit(k: MoveKit, t: MoveActor, big: boolean): void {
  const { x, y } = chest(t), d = k.dir, sp = k.sp, L = k.layer;
  L.add(new Vfx('slash', x - d * 2, y, { r: big ? 20 : 16, a: d > 0 ? 0.5 : Math.PI - 0.5, sweep: 2.3, dir: d, w: big ? 7 : 5, pal: 'holy', tilt: 0.75, dur: 0.34 }, sp));
  L.add(new Vfx('star', x, y, { r: big ? 13 : 10, pal: 'holy', dur: 0.3 }, sp));
  L.add(new Vfx('spikes', x, y, { r: big ? 20 : 15, n: 9, a: d > 0 ? 0 : Math.PI, spread: Math.PI * 1.4, pal: 'holy', dur: 0.4 }, sp));
  L.add(new Vfx('ring', x, y, { r: big ? 18 : 13, w: 3, sq: 0.8, pal: 'holy', dur: 0.35 }, sp));
  L.add(new Vfx('lines', x, y, { r: big ? 34 : 24, dir: d, n: 16, pal: 'holy', dur: 0.4 }, sp));
  glitter(L, x + d * 4, y, { r: 12, n: 6, pal: 'holy', dur: 0.25, size: 3 }, sp);
}

/** The normal attack: run in, raise the sword over the head, one great stroke down. */
async function attack(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir;
  // the run-up: dust kicked up, leaning in, the sword drawn back
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 14, dur: 0.6 }, k.sp));
  void k.tween(h, { leanInto: 0.12, swing: -0.9 }, 170, 'Quad.easeOut');
  void k.tween(h.reachFront, { x: -3, y: 2 }, 170, 'Quad.easeOut');
  // stop short of it by its own width (a big mini-boss further off), so the stroke lands on its front
  await k.moveTo(a, t.x - d * (t.half + 13), t.y + 1, 240, 'Quad.easeIn');
  // the stop and the wind-up: skidding, the sword raised high over the head, leaning back
  k.ground.add(new Vfx('dust', a.x + d * 4, a.y, { r: 10, dur: 0.45 }, k.sp));
  await Promise.all([
    k.tween(h, { swing: -1.9, leanInto: -0.1 }, 140, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -4, y: -9 }, 140, 'Quad.easeOut'),
  ]);
  await k.wait(70);
  // the stroke: over the top and down, a crescent of gold behind the blade
  const trail = k.layer.add(new BladeTrail(h.grip, { rIn: GUARD, R: BLADE + 4, pal: 'holy', life: 0.26 }, k.sp));
  const stroke = Promise.all([
    k.tween(h, { swing: 2.05, leanInto: 0.2 }, 120, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 7, y: 3 }, 120, 'Cubic.easeIn'),
  ]);
  await k.wait(85);
  swordHit(k, t, false);
  k.land();
  k.hitStop(40);
  await stroke;
  await k.wait(50);
  trail.release();
  // the follow-through held a moment, then back
  await k.wait(190);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 300);
  k.regrip();
}

/** ปราการแสง: shield up, a shout of light at the foes (the taunt), a dome of light round himself. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp;
  // the shield brought round in front, the sword raised
  k.ground.add(new HaloRings(a.x, a.y, 30, 1.6, 'holy', sp));
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 12, h: 46, pal: 'holy', dur: 1.0 }, sp));
  await Promise.all([
    k.tween(h.reachBack, { x: 12, y: -3 }, 170, 'Back.easeOut'),
    k.tween(h, { swing: -0.4, leanInto: -0.05 }, 170, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -3, y: -6 }, 170, 'Quad.easeOut'),
  ]);
  // the dome rises round him; the shout goes out at the foes
  k.layer.add(new ShieldDome(a.x, a.y + 1, 42, 46, { dur: 1.6, pal: 'holy' }, sp));
  k.layer.add(new LightColumn(a.x, a.y, { w: 5, top: 160, dur: 0.7 }, sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 40, w: 6, sq: 0.32, pal: 'holy', dur: 0.7 }, sp));
  k.layer.add(new Vfx('roar', a.x + d * 10, a.y - 16, { r: 110, dir: d, n: 5, pal: 'fire', dur: 0.95 }, sp));
  k.layer.add(new Vfx('lines', a.x + d * 8, a.y - 16, { r: 46, dir: d, n: 18, pal: 'holy', dur: 0.5 }, sp));
  k.layer.add(new Vfx('star', a.x + d * 12, a.y - 18, { r: 14, pal: 'holy', dur: 0.35 }, sp));
  k.shake(120, 0.0016);
  await k.wait(240);
  k.land();
  glitter(k.layer, a.x, a.y - 16, { r: 16, n: 10, pal: 'holy', dur: 0.6, size: 3 }, sp);
  await k.wait(650);
  await recover(k);
  k.regrip();
}

/** โล่พิทักษ์: the shield raised high over his head - light gathers on it and bursts out - a dome over each friend. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, sp = k.sp;
  // the shield lifted high, the sword lowered to his side; light drawn up off the ground into the shield
  const gather = { v: 0 };
  const star = k.layer.add(new TipStar(h.gripBack, 0, () => gather.v));
  const shieldAt = () => ({ x: h.gripBack.x, y: h.gripBack.y });
  k.ground.add(new HaloRings(a.x, a.y, 30, 1.5, 'holy', sp));
  k.layer.add(new MoteSpiral(a.x, a.y, 60, shieldAt, 0.75, 'holy', sp));
  await Promise.all([
    k.tween(h.reachBack, { x: 9, y: -15 }, 240, 'Back.easeOut'),
    k.tween(h, { swing: 0.7, leanInto: -0.08 }, 240, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -3, y: 3 }, 240, 'Quad.easeOut'),
    k.tween(gather, { v: 1 }, 420, 'Quad.easeIn'),
  ]);
  await k.wait(80);
  // thrust up a touch more: the light bursts out of it
  star.end();
  await k.tween(h.reachBack, { x: 9, y: -18 }, 80, 'Cubic.easeOut');
  const g = shieldAt();
  k.layer.add(new Vfx('star', g.x, g.y, { r: 20, pal: 'holy', dur: 0.45 }, sp));
  k.layer.add(new Vfx('ring', g.x, g.y, { r: 30, w: 5, sq: 1, pal: 'holy', dur: 0.5 }, sp));
  k.layer.add(new Vfx('lines', g.x, g.y, { r: 50, dir: 0, n: 26, pal: 'holy', dur: 0.5 }, sp));
  k.ground.add(new GroundSigil(a.x, a.y, 40, 1.6, 'holy', sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 80, w: 7, sq: 0.3, pal: 'holy', dur: 0.8 }, sp));
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 14, h: 44, pal: 'holy', dur: 0.8 }, sp));
  k.flash(110, 0xfff4d0);
  k.shake(120, 0.0018);
  // a dome of light over each friend, one after another
  k.targets.forEach((t, i) => {
    window.setTimeout(() => {
      k.layer.add(new LightColumn(t.x, t.y, { w: 5, top: 160, dur: 0.7 }, sp));
      k.layer.add(new ShieldDome(t.x, t.y + 1, 34, 40, { dur: 1.5, pal: 'holy' }, sp));
      k.ground.add(new HaloRings(t.x, t.y, 18, 1.3, 'holy', sp));
      glitter(k.layer, t.x, t.y - 14, { r: 12, n: 6, pal: 'holy', dur: 0.5, size: 3 }, sp);
    }, (100 + i * 80) / sp);
  });
  await k.wait(400);
  k.land();
  await k.wait(650);
  await recover(k, 260);
  k.regrip();
}

/** รุ่งอรุณพิทักษ์: the sword held up to the sky, a column of light onto it - then the dawn breaks over the team. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp;
  // held up to the sky
  await Promise.all([
    k.tween(h, { swing: 0, leanInto: -0.07 }, 260, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -2, y: -12 }, 260, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: -2, y: 1 }, 260, 'Quad.easeOut'),
  ]);
  const t0 = tip(k);
  const charge = { v: 0 };
  const star = k.layer.add(new TipStar(h.grip, BLADE, () => charge.v));
  k.layer.add(new LightColumn(t0.x, t0.y, { w: 9, top: 240, dur: 1.3 }, sp));
  k.ground.add(new HaloRings(a.x, a.y, 44, 2.0, 'holy', sp));
  k.ground.add(new GroundSigil(a.x, a.y, 30, 1.3, 'holy', sp));
  k.layer.add(new MoteSpiral(a.x, a.y, 90, () => tip(k), 1.15, 'holy', sp));
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 14, h: 56, pal: 'holy', dur: 1.25 }, sp));
  await k.tween(charge, { v: 1 }, 1050, 'Quad.easeIn');
  // driven into the ground: the dawn breaks
  star.end();
  const trail = k.layer.add(new BladeTrail(h.grip, { rIn: GUARD, R: BLADE + 5, pal: 'holy', life: 0.3 }, sp));
  await Promise.all([
    k.tween(h, { swing: 3.0, leanInto: 0.2 }, 110, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 6, y: 6 }, 110, 'Cubic.easeIn'),
  ]);
  trail.release();
  k.flash(170, 0xfff4d0);
  k.shake(220, 0.003);
  k.hitStop(60);
  const px = a.x + d * 14;
  k.ground.add(new GroundSigil(px, a.y, 56, 1.9, 'holy', sp));
  k.ground.add(new Vfx('ring', px, a.y, { r: 190, w: 10, sq: 0.3, pal: 'holy', dur: 1.0 }, sp));
  k.ground.add(new Vfx('ring', px, a.y, { r: 110, w: 6, sq: 0.3, pal: 'holy', dur: 0.8, delay: 0.08 }, sp));
  k.layer.add(new Vfx('lines', px, a.y - 8, { r: 70, dir: 0, n: 30, pal: 'holy', dur: 0.6 }, sp));
  k.layer.add(new Vfx('star', px, a.y - 3, { r: 24, pal: 'holy', dur: 0.5 }, sp));
  k.layer.add(new Vfx('aura', px, a.y, { r: 20, h: 70, pal: 'holy', dur: 0.9 }, sp));
  const all = [a, ...k.targets];
  const xs = all.map((t) => t.x), ys = all.map((t) => t.y);
  k.layer.add(new DawnRays(Math.min(...xs) - 30, Math.max(...xs) + 30, Math.min(...ys) - 6, Math.max(...ys) + 6, { n: 44, h: 100, dur: 1.6 }, sp));
  // a column of light and a dome on each of the team
  k.targets.forEach((t, i) => {
    window.setTimeout(() => {
      k.layer.add(new LightColumn(t.x, t.y, { w: 9, top: 240, dur: 1.1 }, sp));
      k.layer.add(new ShieldDome(t.x, t.y + 1, 36, 42, { dur: 1.7, pal: 'holy', delay: 0.15 }, sp));
      k.ground.add(new HaloRings(t.x, t.y, 20, 1.6, 'holy', sp));
      glitter(k.layer, t.x, t.y - 14, { r: 14, n: 10, pal: 'holy', dur: 0.8, size: 4 }, sp);
    }, (140 + i * 70) / sp);
  });
  await k.wait(380);
  k.land();
  await k.wait(900);
  await recover(k, 280);
  k.regrip();
}

export const BRAM: HeroMoves = { attack, skill1, skill2, ult };
