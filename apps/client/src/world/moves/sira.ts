import { CleanseWisps } from '../../fx/effects/flora';
import { DawnRays, GroundSigil, HaloRings } from '../../fx/effects/holy';
import { Crescent, CrystalStreamers, Reticle, SoulFlame, SpiritBurst, SpiritWisp } from '../../fx/effects/spirit';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Sira, the spirit healer: her spirit lantern, and the spirits that answer it - wisps of cool spirit-fire, a crystal of
// light, a flame that heals, and the dawn.
//   attack  - ประกายวิญญาณ: she lifts the lantern and a spark of spirit-light gathers in it; a ring marks the foe, and
//             three wisps leave the lantern, swing out wide and home in on it - a burst of spirit light, rings and sparks.
//   skill 1 - แสงตะเกียงภูติ: the lantern flares; a great wisp floats to her friend and wraps it in a cool spirit flame
//             with little spirits circling it - its ailments drawn out as dark wisps that break into light.
//   skill 2 - ลมหายใจภูติ: a crystal of light rises over her, trailing long streamers out to every friend like a comet's
//             tail; spirals of light run down them, and each friend shines as they arrive (a heal that lingers).
//   ult     - อรุณแห่งภูติ: night falls over the field and her crescent moon rises behind her; she floats up over a circle
//             of spirits, the lantern blazing in rings of light - and with the dawn, rays of light sweep over her friends
//             as a wisp flies to each and wraps it in spirit flame, every ailment drawn out and gone.

/** From her hand to the flame in her lantern (world px: her small lantern, carried from its ring at the top - the flame
 * is BELOW her hand, behind the glass; auras.ts LANTERN_LAMP). */
const LAMP = 6.5;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });

/** The light in her lantern (world px). */
function lamp(k: MoveKit): { x: number; y: number } {
  const g = k.actor.hero!.grip;
  // (the lantern points up from her fist's ring, so its glass is back down the other way)
  return { x: g.x - Math.cos(g.angle) * LAMP, y: g.y - Math.sin(g.angle) * LAMP };
}

/** The lantern lifted up high, the other hand open beneath it. */
function lift(k: MoveKit, ms: number, high = 1): Promise<unknown> {
  const h = k.actor.hero!;
  h.setHands('open', 'palm');
  return Promise.all([
    k.tween(h, { swing: -0.1, leanInto: -0.08 }, ms, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: 1, y: -9 * high }, ms, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: 3, y: -4 }, ms, 'Quad.easeOut'),
  ]);
}

/** The lantern held out toward someone (sending a wisp). */
function offer(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0.35, leanInto: 0.12 }, ms, 'Cubic.easeOut'),
    k.tween(h.reachFront, { x: 5, y: -5 }, ms, 'Cubic.easeOut'),
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

/** A friend healed by the spirits: a ring of light on the ground, motes rising. */
function blessed(k: MoveKit, t: MoveActor): void {
  k.ground.add(new Vfx('ring', t.x, t.y, { r: 20, w: 3, sq: 0.32, pal: 'spirit', dur: 0.6 }, k.sp));
  glitter(k.layer, t.x, t.y - t.h * 0.4, { r: t.half + 6, n: 8, pal: 'spirit', dur: 0.8, size: 3, rise: -26 }, k.sp);
}

/** ประกายวิญญาณ: a spark in the lantern, a ring on the foe, three wisps swinging out and homing in - a burst of spirit light. */
async function attack(k: MoveKit): Promise<void> {
  const t = k.main, sp = k.sp, c = chest(t);
  await lift(k, 200, 0.7);
  k.layer.add(new Vfx('star', lamp(k).x, lamp(k).y, { r: 7, pal: 'spirit', dur: 0.35 }, sp));
  glitter(k.layer, lamp(k).x, lamp(k).y, { r: 9, n: 6, pal: 'spirit', dur: 0.3, size: 2 }, sp);
  k.layer.add(new Reticle(c.x, c.y, { r: 9, dur: 1.0 }, sp));
  await k.wait(220);
  void offer(k, 100);
  const from = lamp(k);
  const bends = [-26, 26, 0];
  await Promise.all(bends.map((bend, i) => new Promise<void>((done) => k.layer.add(new SpiritWisp(from.x, from.y, () => chest(t), {
    bend, dur: 0.42, delay: i * 0.06, blue: i === 2, onHit: () => done(),
  }, sp)))));
  k.layer.add(new SpiritBurst(c.x, c.y, { r: 16, dur: 0.75 }, sp));
  k.layer.add(new SpiritBurst(c.x, c.y, { r: 10, dur: 0.5, blue: true }, sp));
  k.land();
  k.shake(90, 0.0016);
  await k.wait(380);
  await recover(k);
}

/** แสงตะเกียงภูติ: the lantern flares, a great wisp floats to the friend and wraps it in spirit flame - its ailments drawn out. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, t = k.main, sp = k.sp;
  k.ground.add(new GroundSigil(a.x, a.y, 24, 1.5, 'spirit', sp));
  await lift(k, 240);
  const l = lamp(k);
  k.layer.add(new HaloRings(l.x, l.y, 14, 0.8, 'spirit', sp));
  glitter(k.layer, l.x, l.y, { r: 12, n: 10, pal: 'spirit', dur: 0.5, size: 3 }, sp);
  await k.wait(420);
  void offer(k, 140);
  const from = lamp(k);
  await new Promise<void>((done) => k.layer.add(new SpiritWisp(from.x, from.y, () => chest(t), { bend: -22, dur: 0.6, size: 1.6, onHit: () => done() }, sp)));
  k.layer.add(new SpiritBurst(chest(t).x, chest(t).y, { r: 12, dur: 0.5 }, sp));
  k.layer.add(new SoulFlame(t.x, t.y + 1, t.half * 2, t.h, { dur: 1.7, spirits: 4 }, sp));
  k.layer.add(new CleanseWisps(t.x, t.y, t.h, { dur: 1.1, delay: 0.35, blue: true }, sp));
  await k.wait(260);
  blessed(k, t);
  k.land();
  await k.wait(1000);
  await recover(k);
}

/** ลมหายใจภูติ: a crystal of light over her, streamers out to every friend, spirals of light running down them. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, sp = k.sp;
  const targets = k.targets.length ? k.targets : [k.main];
  k.ground.add(new GroundSigil(a.x, a.y, 30, 2.2, 'spirit', sp));
  await lift(k, 260, 1.1);
  // the crystal rises out of the lantern and hangs over her
  const rise = { y: 0 };
  void k.tween(rise, { y: 1 }, 500, 'Sine.easeOut');
  const D = 2.1;
  k.layer.add(new CrystalStreamers(() => { const l = lamp(k); return { x: l.x, y: l.y - 4 - rise.y * 20 }; }, targets.map(chest), { dur: D, size: 1.1 }, sp));
  await k.wait((CrystalStreamers.TRAVEL * D * 1000) / sp);
  targets.forEach((t, i) => {
    k.layer.add(new SpiritBurst(chest(t).x, chest(t).y, { r: 11, dur: 0.55, delay: i * 0.05 }, sp));
    blessed(k, t);
  });
  k.land();
  await k.wait(1200);
  await recover(k);
}

/** อรุณแห่งภูติ: night, her moon rising, she floats up, the lantern blazing - and with the dawn, spirit flame on every friend. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, d = k.dir, sp = k.sp;
  const targets = k.targets.length ? k.targets : [k.main];
  await k.dim(0.55, 280, 0x040a1e);
  // night: her crescent moon rises behind her; she floats up over a circle of spirits
  k.layer.add(new Crescent(a.x - d * 10, a.y - 52, 11, { dur: 3.4 }, sp));
  k.ground.add(new GroundSigil(a.x, a.y, 40, 3.2, 'spirit', sp));
  void k.tween(a, { alt: 12 }, 500, 'Sine.easeOut');
  await lift(k, 420, 1.2);
  const l = lamp(k);
  k.layer.add(new HaloRings(l.x, l.y, 20, 1.2, 'spirit', sp));
  for (let i = 0; i < 3; i++) glitter(k.layer, l.x, l.y, { r: 20, n: 10, pal: 'spirit', dur: 0.9, size: 3 }, sp);
  k.layer.add(new SpiritBurst(l.x, l.y, { r: 14, dur: 0.9, delay: 0.3 }, sp));
  await k.wait(780);
  // the dawn: rays of light sweep over her friends, a wisp flies to each and wraps it in spirit flame
  const xs = targets.map((t) => t.x), ys = targets.map((t) => t.y);
  k.layer.add(new DawnRays(Math.min(...xs) - 30, Math.max(...xs) + 30, Math.min(...ys) - 70, Math.max(...ys), { n: 7, dur: 2.0, pal: 'spirit' }, sp));
  k.flash(110, 0xc8f8ff);
  const from = lamp(k);
  await Promise.all(targets.map((t, i) => new Promise<void>((done) => k.layer.add(new SpiritWisp(from.x, from.y, () => chest(t), {
    bend: (i % 2 ? 1 : -1) * (18 + i * 6), dur: 0.55, delay: i * 0.07, size: 1.4, blue: i % 3 === 2,
    onHit: () => {
      k.layer.add(new SpiritBurst(chest(t).x, chest(t).y, { r: 14, dur: 0.6 }, sp));
      k.layer.add(new SoulFlame(t.x, t.y + 1, t.half * 2, t.h, { dur: 1.8, spirits: 3 }, sp));
      k.layer.add(new CleanseWisps(t.x, t.y, t.h, { dur: 1.1, delay: 0.3, blue: true }, sp));
      done();
    },
  }, sp)))));
  await k.wait(250);
  for (const t of targets) blessed(k, t);
  k.flash(120, 0xd8fff8);
  k.land();
  await k.wait(1300);
  void k.dim(0, 400);
  await recover(k, 380);
}

export const SIRA: HeroMoves = { attack, skill1, skill2, ult };
