import { WAND_U, WAND_V } from '../../fx/effects/auras';
import { GroundSigil, HaloRings } from '../../fx/effects/holy';
import { CrystalBurst, CrystalSpear, CrystalStar, PrismBeam } from '../../fx/effects/prism';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Neris, the crystal spirit of light: her crystal wand (a blue shaft banded in gold, a crystal orb ringed like a planet)
// and the crystal light it calls - a beam, spears of crystal, a rain of crystal, and the crystal star.
//   attack  - ลำแสงผลึก: she lifts the wand and light gathers in its orb; she points and a beam of crystal light strikes
//             the foe in front - a burst of crystal shards.
//   skill 1 - หอกผลึก: the wand raised high, rings of light round the orb - spears of crystal form in the air over every
//             foe in the row and plunge into them, stand shining, and shatter.
//   skill 2 - ฝนผลึกแสง: the wand held up to the sky, a sigil of light over the foes - crystals rain down on all of them,
//             each struck by its own, shards everywhere.
//   ult     - ดาราผลึก: night falls; she rises over a circle of light, the wand blazing, and over the foes the crystal star
//             forms - eight points of crystal, a ring circling it with crystals riding it - glowing brighter until it
//             bursts: rays of light, its points flying off, crystals raining on every foe.

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });

/** The orb on her wand (world px; auras.ts WAND_U / WAND_V). */
function orb(k: MoveKit): { x: number; y: number } {
  const h = k.actor.hero!, g = h.grip, f = h.facing, dx = Math.cos(g.angle), dy = Math.sin(g.angle);
  return { x: g.x + dx * WAND_U - dy * WAND_V * f, y: g.y + dy * WAND_U + dx * WAND_V * f };
}

/** The wand lifted, the other hand open beneath it. */
function lift(k: MoveKit, ms: number, high = 1): Promise<unknown> {
  const h = k.actor.hero!;
  h.setHands('grip', 'palm');
  return Promise.all([
    k.tween(h, { swing: -0.25, leanInto: -0.08 }, ms, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: 1, y: -8 * high }, ms, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: 3, y: -4 * high }, ms, 'Quad.easeOut'),
  ]);
}

/** The wand pointed at the foe. */
function point(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0.95, leanInto: 0.14 }, ms, 'Cubic.easeOut'),
    k.tween(h.reachFront, { x: 6, y: -5 }, ms, 'Cubic.easeOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Cubic.easeOut'),
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

/** Light gathering in the orb: a star, sparkles drawn in. */
function charge(k: MoveKit, r = 9): void {
  const p = orb(k);
  k.layer.add(new Vfx('star', p.x, p.y, { r, pal: 'crystal', dur: 0.4 }, k.sp));
  glitter(k.layer, p.x, p.y, { r: r + 2, n: 7, pal: 'crystal', dur: 0.35, size: 2 }, k.sp);
}

/** The foes' field: who, its middle, its far and near edges. */
function field(k: MoveKit) {
  const ts = k.targets.length ? k.targets : [k.main];
  const xs = ts.map((t) => t.x), ys = ts.map((t) => t.y);
  return { ts, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), top: Math.min(...ys), bot: Math.max(...ys) };
}

/** ลำแสงผลึก: light gathers in the orb, a beam of crystal light strikes the foe in front. */
async function attack(k: MoveKit): Promise<void> {
  const t = k.main, sp = k.sp;
  await lift(k, 200, 0.7);
  charge(k);
  await k.wait(260);
  await point(k, 90);
  k.layer.add(new PrismBeam(() => orb(k), () => chest(t), { dur: 0.3, w: 2.5 }, sp));
  await k.wait(60);
  const c = chest(t);
  k.layer.add(new CrystalBurst(c.x, c.y, { r: 11, dur: 0.6 }, sp));
  k.land();
  k.shake(70, 0.0014);
  await k.wait(420);
  await recover(k, 260);
}

/** หอกผลึก: spears of crystal form over every foe in the row and plunge into them. */
async function skill1(k: MoveKit): Promise<void> {
  const sp = k.sp, f = field(k);
  await lift(k, 220, 1.1);
  const p = orb(k);
  k.layer.add(new HaloRings(p.x, p.y, 12, 0.8, 'crystal', sp));
  charge(k, 11);
  await k.wait(160);
  void point(k, 140);
  let landed = false;
  await Promise.all(f.ts.map((t, i) => new Promise<void>((done) => k.layer.add(new CrystalSpear(t.x, t.y, { h: 72, len: 28, w: 4.5, form: 0.3, fall: 0.09, stay: 0.32, delay: i * 0.08, onHit: () => {
    k.layer.add(new CrystalBurst(t.x, t.y - t.h * 0.4, { r: 10, dur: 0.5, n: 8 }, sp));
    k.ground.add(new Vfx('ring', t.x, t.y, { r: 18, w: 2, sq: 0.36, pal: 'crystal', dur: 0.5 }, sp));
    if (!landed) {
      landed = true;
      k.land();
      k.hitStop(40);
    }
    k.shake(60, 0.0016);
    done();
  } }, sp)))));
  await k.wait(700);
  await recover(k, 260);
}

/** ฝนผลึกแสง: a sigil of light over the foes, crystals raining on every one of them. */
async function skill2(k: MoveKit): Promise<void> {
  const sp = k.sp, f = field(k), h = k.actor.hero!;
  h.setHands('grip', 'palm');
  await Promise.all([
    k.tween(h, { swing: -0.45, leanInto: -0.12 }, 240, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: 0, y: -11 }, 240, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: 4, y: -6 }, 240, 'Quad.easeOut'),
  ]);
  charge(k, 12);
  k.layer.add(new PrismBeam(() => orb(k), () => ({ x: orb(k).x, y: orb(k).y - 140 }), { dur: 0.25, w: 2 }, sp));
  // the sigil of light over the foes
  const sky = { x: f.cx, y: f.top - 70 };
  k.layer.add(new HaloRings(sky.x, sky.y, Math.max(26, f.w * 0.6), 1.6, 'crystal', sp));
  k.ground.add(new GroundSigil(f.cx, f.cy, Math.max(40, f.w * 0.7 + 20), 1.8, 'crystal', sp));
  await k.wait(280);
  // the rain: crystals everywhere, and one for each foe
  for (let i = 0; i < 20; i++) {
    const x = f.cx + (Math.random() - 0.5) * (f.w + 70), y = f.top - 12 + Math.random() * (f.bot - f.top + 24);
    k.layer.add(new CrystalSpear(x, y, { h: 90, len: 11, w: 2, form: 0.1, fall: 0.08, stay: 0.14, delay: i * 0.035 }, sp));
  }
  let landed = false;
  await Promise.all(f.ts.map((t, i) => new Promise<void>((done) => k.layer.add(new CrystalSpear(t.x, t.y, { h: 90, len: 16, w: 3, form: 0.14, fall: 0.08, stay: 0.2, delay: 0.12 + i * 0.07, onHit: () => {
    k.layer.add(new CrystalBurst(t.x, t.y - t.h * 0.45, { r: 9, dur: 0.5, n: 7 }, sp));
    if (!landed) {
      landed = true;
      k.land();
    }
    k.shake(50, 0.0014);
    done();
  } }, sp)))));
  await k.wait(650);
  await recover(k, 280);
}

/** ดาราผลึก: night; the crystal star forms over the foes, glowing brighter until it bursts. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, sp = k.sp, f = field(k), h = a.hero!;
  await k.dim(0.55, 260, 0x060a24);
  // she rises over a circle of light, the wand blazing
  k.ground.add(new GroundSigil(a.x, a.y, 26, 3.4, 'crystal', sp));
  h.setHands('grip', 'palm');
  await Promise.all([
    k.tween(a, { alt: 10 }, 320, 'Sine.easeOut'),
    k.tween(h, { swing: -0.35, leanInto: -0.1 }, 320, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: 0, y: -11 }, 320, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: 4, y: -6 }, 320, 'Quad.easeOut'),
  ]);
  charge(k, 14);
  k.layer.add(new HaloRings(orb(k).x, orb(k).y, 16, 1.2, 'crystal', sp));
  // the crystal star over the foes
  const star = { x: f.cx, y: Math.max(k.layer.view.y + 46, f.top - 48) };
  k.layer.add(new PrismBeam(() => orb(k), () => star, { dur: 0.25, w: 1.5 }, sp));
  const burst = new Promise<void>((done) => k.layer.add(new CrystalStar(star.x, star.y, 20, { burstAt: 1.5, onBurst: () => done() }, sp)));
  k.shake(500, 0.001);
  await burst;
  // it bursts: light everywhere, crystals raining on every foe
  k.flash(110, 0xc4f0ff);
  k.shake(260, 0.0032);
  let landed = false;
  f.ts.forEach((t, i) => {
    k.layer.add(new CrystalSpear(t.x, t.y, { h: 60, len: 22, w: 4, form: 0.06, fall: 0.08, stay: 0.3, delay: 0.05 + i * 0.05, onHit: () => {
      k.layer.add(new CrystalBurst(t.x, t.y - t.h * 0.45, { r: 13, dur: 0.6, n: 10 }, sp));
      k.ground.add(new Vfx('ring', t.x, t.y, { r: 22, w: 3, sq: 0.36, pal: 'crystal', dur: 0.6 }, sp));
      if (!landed) {
        landed = true;
        k.land();
        k.hitStop(60);
      }
      k.shake(70, 0.002);
    } }, sp));
  });
  for (let i = 0; i < 18; i++) {
    const x = f.cx + (Math.random() - 0.5) * (f.w + 80), y = f.top - 12 + Math.random() * (f.bot - f.top + 24);
    k.layer.add(new CrystalSpear(x, y, { h: 80, len: 10, w: 2, form: 0.06, fall: 0.08, stay: 0.14, delay: 0.1 + i * 0.03 }, sp));
  }
  await k.wait(f.ts.length * 50 + 1100);
  void k.dim(0, 400);
  await recover(k, 320);
}

export const NERIS: HeroMoves = { attack, skill1, skill2, ult };
