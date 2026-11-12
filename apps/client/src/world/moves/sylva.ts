import { ChargeGlow, LeafOrb } from '../../fx/effects/archery';
import { Bloom, CleanseWisps, DewDrop, LeafStream, LeafTornado, PetalRain, ThornRow, VineLash } from '../../fx/effects/flora';
import { GroundSigil, ShieldDome } from '../../fx/effects/holy';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Sylva, the elf guardian of the deep wood: her druid staff (a crook of living wood round a seed of light) and the
// forest itself answering her - horns of wood out of the ground, a thorny vine's lash, flowers that bloom with healing
// light, whirls of wind and leaves.
//   attack  - เมล็ดหนาม: she flicks a seed of light from her staff; it strikes the ground before her and horns of wood
//             burst up one after another toward the foe, and a thorny vine breaks out at its feet and lashes it.
//   skill 1 - น้ำค้างชีวิต: light gathers on her staff and a drop of dew-light floats to her friend; flowers spring up
//             either side of it, bud and bloom in a burst of light, healing motes rising (a heal that lingers).
//   skill 2 - ร่มไม้คุ้มภัย: she sweeps her staff round and a whirl of wind and leaves rises round her; it streams out in
//             ribbons of leaves to every friend, wrapping each in its own whirl and a shimmering shield.
//   ult     - พรแห่งพงไพร: the field sinks into deep green, she rises off the ground in a great whirl of leaves over the
//             forest's circle, light gathering on her staff; drops of dew-light fly to every friend - flowers bloom round
//             each, ailments are drawn out of them as dark wisps that break into light, petals rain down over them all.

/** From her hand to the light at her staff's head (world px: the staff is 20 px, held 4 up from its foot). */
const STAFF_TIP = 13;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });

/** The light at the head of her staff (world px). */
function tip(k: MoveKit): { x: number; y: number } {
  const g = k.actor.hero!.grip;
  return { x: g.x + Math.cos(g.angle) * STAFF_TIP, y: g.y + Math.sin(g.angle) * STAFF_TIP };
}

/** The staff raised up high (a little out in front, the other hand open). */
function raise(k: MoveKit, ms: number, high = 1): Promise<unknown> {
  const h = k.actor.hero!;
  h.setHands('grip', 'palm');
  return Promise.all([
    k.tween(h, { swing: -0.25 * high, leanInto: -0.08 }, ms, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: 1, y: -8 * high }, ms, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: 2, y: -3 }, ms, 'Quad.easeOut'),
  ]);
}

/** The staff swung forward, pointing (a flick, a cast). */
function point(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 1.05, leanInto: 0.14 }, ms, 'Cubic.easeOut'),
    k.tween(h.reachFront, { x: 5, y: -2 }, ms, 'Cubic.easeOut'),
  ]);
}

function recover(k: MoveKit, ms = 260): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(k.actor, { alt: 0 }, ms, 'Sine.easeInOut'),
  ]).then(() => k.regrip());
}

/** A friend touched by the forest's healing: a ring of light on the ground, motes rising. */
function healed(k: MoveKit, t: MoveActor, big = false): void {
  k.ground.add(new Vfx('ring', t.x, t.y, { r: big ? 24 : 18, w: 3, sq: 0.32, pal: 'leaf', dur: 0.6 }, k.sp));
  glitter(k.layer, t.x, t.y - t.h * 0.4, { r: t.half + 6, n: big ? 10 : 6, pal: 'leaf', dur: 0.8, size: 3, rise: -26 }, k.sp);
}

/** เมล็ดหนาม: a seed of light flicked off the staff; horns of wood burst up toward the foe; a thorny vine lashes it. */
async function attack(k: MoveKit): Promise<void> {
  const a = k.actor, t = k.main, d = k.dir, sp = k.sp;
  await raise(k, 180, 0.6);
  k.layer.add(new LeafOrb(() => tip(k), { dur: 0.32, r: 2 }, sp));
  await k.wait(160);
  void point(k, 90);
  await k.wait(60);
  // the seed: off the staff, into the ground in front of her
  // (where it lands: past our front row, toward the foe - the horns mustn't burst up under a friend)
  const foot = { x: t.x - d * (t.half + 7), y: t.y + 1 };
  const from = tip(k), land = { x: d > 0 ? Math.max(a.x + d * 20, foot.x - 58) : Math.min(a.x + d * 20, foot.x + 58), y: (a.y + foot.y) / 2 + 2 };
  await new Promise<void>((done) => k.layer.add(new DewDrop(from.x, from.y, land.x, land.y, { dur: 0.2, arc: 10, onHit: () => done() }, sp)));
  // horns of wood bursting up toward the foe, and the vine breaking out at its feet
  const row = new ThornRow(land.x + d * 4, land.y, foot.x - d * 6, foot.y, { n: 6, gap: 0.055, hold: 0.5 }, sp);
  k.layer.add(row);
  const c = chest(t);
  await k.wait((row.last * 1000) / sp - 120);
  await new Promise<void>((done) => k.layer.add(new VineLash(foot.x, foot.y, c.x, c.y, { dur: 1.1, onHit: () => done() }, sp)));
  k.layer.add(new Vfx('star', c.x, c.y, { r: 10, pal: 'leaf', dur: 0.3 }, sp));
  k.layer.add(new Vfx('spikes', c.x, c.y, { r: 16, n: 8, a: d > 0 ? 0.3 : Math.PI - 0.3, spread: Math.PI * 0.9, pal: 'leaf', dur: 0.32 }, sp));
  k.land();
  k.shake(90, 0.0016);
  await k.wait(420);
  await recover(k);
}

/** น้ำค้างชีวิต: light on the staff, a drop of dew-light to her friend, flowers blooming either side of it. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, t = k.main, sp = k.sp;
  k.ground.add(new GroundSigil(a.x, a.y, 24, 1.4, 'leaf', sp));
  await raise(k, 240);
  k.layer.add(new LeafOrb(() => tip(k), { dur: 0.7, r: 3 }, sp));
  k.layer.add(new ChargeGlow(() => tip(k), 0.6, 10, sp));
  glitter(k.layer, a.x, a.y - 16, { r: 14, n: 8, pal: 'leaf', dur: 0.6, size: 2, rise: -20 }, sp);
  await k.wait(560);
  const from = tip(k), c = chest(t);
  void point(k, 120);
  await new Promise<void>((done) => k.layer.add(new DewDrop(from.x, from.y, c.x, c.y, { dur: 0.5, arc: 22, big: true, onHit: () => done() }, sp)));
  // flowers either side of it - they bloom, and it's healed
  const D = 1.9;
  for (const side of [-1, 1]) k.layer.add(new Bloom(t.x + side * (t.half + 5), t.y + 2, { scale: 1.4, dur: D, motes: 9 }, sp));
  k.layer.add(new Bloom(t.x + 2, t.y + 6, { scale: 1, dur: D, delay: 0.08, motes: 6 }, sp));
  await k.wait((Bloom.OPEN * D * 1000) / sp);
  healed(k, t, true);
  k.land();
  await k.wait(800);
  await recover(k);
}

/** ร่มไม้คุ้มภัย: a whirl of wind and leaves round her, streaming out to every friend, wrapping each in its own and a shield. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, sp = k.sp;
  const targets = k.targets.length ? k.targets : [k.main];
  k.ground.add(new GroundSigil(a.x, a.y, 30, 1.8, 'leaf', sp));
  k.layer.add(new LeafTornado(a.x, a.y + 1, 44, 50, { dur: 1.6, n: 40 }, sp));
  // the staff swept round
  await raise(k, 200);
  await k.tween(h, { swing: 0.9 }, 220, 'Sine.easeInOut');
  await k.tween(h, { swing: -0.4 }, 220, 'Sine.easeInOut');
  // out to every friend in ribbons of leaves
  const from = tip(k);
  let first = true;
  await Promise.all(targets.map((t, i) => new Promise<void>((done) => k.layer.add(new LeafStream(from.x, from.y, () => chest(t), {
    n: 10, dur: 0.5, delay: i * 0.06, arc: 18 + (i % 3) * 6,
    onHit: () => {
      k.layer.add(new LeafTornado(t.x, t.y + 1, 30, 36, { dur: 1.3, n: 22 }, sp));
      k.layer.add(new ShieldDome(t.x, t.y, 26, 34, { dur: 1.2, pal: 'leaf' }, sp));
      if (first) (first = false), k.land();
      done();
    },
  }, sp)))));
  await k.wait(900);
  await recover(k);
}

/** พรแห่งพงไพร: deep green, she rises in a great whirl of leaves, dew-light to every friend - flowers, wisps of ailment gone, petals. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, sp = k.sp;
  const targets = k.targets.length ? k.targets : [k.main];
  await k.dim(0.5, 260, 0x06200e);
  // she rises off the ground in a great whirl of leaves over the forest's circle
  k.ground.add(new GroundSigil(a.x, a.y, 40, 3.2, 'leaf', sp));
  k.layer.add(new LeafTornado(a.x, a.y + 1, 58, 70, { dur: 2.4, n: 60, spin: 6 }, sp));
  void k.tween(a, { alt: 12 }, 500, 'Sine.easeOut');
  await raise(k, 400, 1.2);
  k.layer.add(new LeafOrb(() => tip(k), { dur: 1.1, r: 4 }, sp));
  k.layer.add(new ChargeGlow(() => tip(k), 1.0, 16, sp));
  for (let i = 0; i < 3; i++) glitter(k.layer, a.x, a.y - 20 - a.alt, { r: 22, n: 10, pal: 'leaf', dur: 0.9, size: 3, rise: -30 }, sp);
  await k.wait(820);
  k.flash(90, 0xd8ffc0);
  // drops of dew-light fly to every friend
  const from = tip(k), D = 2.0;
  await Promise.all(targets.map((t, i) => new Promise<void>((done) => k.layer.add(new DewDrop(from.x, from.y, chest(t).x, chest(t).y, {
    dur: 0.5, delay: i * 0.08, arc: 26, big: true,
    onHit: () => {
      // flowers round each, its ailments drawn out and broken into light
      for (const side of [-1, 1]) k.layer.add(new Bloom(t.x + side * (t.half + 5), t.y + 2, { scale: 1.4, dur: D, motes: 10 }, sp));
      k.layer.add(new CleanseWisps(t.x, t.y, t.h, { dur: 1.1, delay: 0.5 }, sp));
      k.ground.add(new GroundSigil(t.x, t.y, 18, 1.6, 'leaf', sp));
      done();
    },
  }, sp)))));
  // and petals rain down over them all
  const xs = targets.map((t) => t.x), ys = targets.map((t) => t.y);
  const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 60, y1 = Math.max(...ys);
  k.layer.add(new PetalRain(x0, y0, x1 - x0, y1 - y0 + 10, { dur: 2.0, n: 50 }, sp));
  await k.wait((Bloom.OPEN * D * 1000) / sp);
  for (const t of targets) healed(k, t, true);
  k.flash(110, 0xc8ffb0);
  k.land();
  await k.wait(1100);
  void k.dim(0, 400);
  await recover(k, 360);
}

export const SYLVA: HeroMoves = { attack, skill1, skill2, ult };
