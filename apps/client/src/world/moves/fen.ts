import { ARROW_LEN, ChargeGlow, FlyingArrow, LeafBurst, LeafOrb, RootBurst, TreeBloom } from '../../fx/effects/archery';
import { GroundSigil } from '../../fx/effects/holy';
import { glitter, Vfx } from '../../fx/effects/vfx';
import GEAR from '../heroGear.json';
import { HAND_BACK } from '../rig';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Fen, the forest archer: his bow (the owner's) with a string of its own (world/MasterCharacter.ts draws it and pulls it
// back to his other hand) and an arrow nocked on it (assets/characters/heroes/weapons/arrow.png). He shoots from where
// he stands, the bow turned square to wherever he aims - and his arrows are FAST: a comet of green light, a rippling
// streak of energy, rings of light left drifting behind.
//   attack  - ยิงศร: aims, draws, looses - the arrow is there before you see it, a burst of light and leaves.
//   skill 1 - ศรหนาม: a spirit of the forest gathers on the arrow as he draws long; the arrow flies shedding leaves, and
//             roots burst out of the ground round the foe, coil in over it, glow - and blow apart (slowing it).
//   skill 2 - ฝนธนูพงไพร: the bow turned up to the sky, three arrows loosed one after another - then a rain of arrows
//             streaks down on every foe, sticking in the ground round them.
//   ult     - ศรเทพพฤกษา: the field deep green, a circle of the forest opens under him, leaves sweep in, spirits gather
//             on a great arrow of light; loosed, it bursts over the foes into a tree of light whose branches strike every
//             one of them, roots erupting under them, and the whole tree breaks into falling leaves.

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });

/** Where the bow hand rests (feet-local, facing right: tools/hero_parts.py). */
const BOW_REST = (GEAR as unknown as Record<string, { front: { rest: [number, number] } }>).fen.front.rest;
/** How far back the string comes at full draw (px). */
const DRAWN = 12;
/** How far the bow hand rises when he aims up (px, at straight up): shooting at the sky the bow goes up by his head,
 * arms raised - not left down at his hip. */
const LIFT_UP = 12;

/** The arrow's point while it's on the string (world px). */
function tip(k: MoveKit): { x: number; y: number } {
  const at = k.actor.hero!.arrowAt;
  return { x: at.x + Math.cos(at.angle) * ARROW_LEN, y: at.y + Math.sin(at.angle) * ARROW_LEN };
}

/**
 * Nock an arrow and draw on (x, y): the bow turned square to the line to it, the bow hand a touch out along it, the
 * string drawn back along it to his cheek.
 */
async function draw(k: MoveKit, x: number, y: number, ms: number): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir;
  // the aim, in his own frame (facing right): from the bow hand to the mark
  const gx = a.x + d * BOW_REST[0], gy = a.y - a.alt + BOW_REST[1];
  const th = Math.max(-1.25, Math.min(0.55, Math.atan2(y - gy, (x - gx) * d)));
  const c = Math.cos(th), s = Math.sin(th);
  // the bow hand out along the line (up a little when aiming up), the drawing hand back along it
  const G = { x: BOW_REST[0] + 1 + c, y: BOW_REST[1] + (s < 0 ? s * LIFT_UP : s * 2) };
  const B = { x: G.x - c * DRAWN, y: G.y - s * DRAWN };
  h.nocked = true;
  h.setHands('grip', 'pinch');
  await Promise.all([
    k.tween(h, { draw: 1, swing: th, leanInto: -0.06 + th * 0.08 }, ms, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: G.x - BOW_REST[0], y: G.y - BOW_REST[1] }, ms, 'Quad.easeOut'),
    k.tween(h.reachBack, { x: B.x - HAND_BACK.x, y: B.y - HAND_BACK.y }, ms, 'Quad.easeOut'),
  ]);
}

/** Loose: the string snaps back, the arrow flies to (x, y) - resolves when it strikes. */
function loose(k: MoveKit, x: number, y: number, o: { dur?: number; arc?: number; size?: number; power?: number; leaves?: boolean; stick?: number } = {}): Promise<void> {
  const h = k.actor.hero!, from = tip(k);
  h.nocked = false;
  void k.tween(h, { draw: 0 }, 60, 'Back.easeOut');
  void k.tween(h.reachBack, { x: h.reachBack.x - 3 }, 60, 'Quad.easeOut');
  void k.tween(h, { leanInto: h.leanInto - 0.1 }, 60, 'Quad.easeOut');
  // the snap of the string: a ring of air off the bow, sparks of green
  k.layer.add(new Vfx('ring', from.x, from.y, { r: 5 + (o.power ?? 0) * 3, w: 2, sq: 1, pal: 'leaf', dur: 0.18 }, k.sp));
  glitter(k.layer, from.x, from.y, { r: 4, n: 3 + (o.power ?? 0) * 2, pal: 'leaf', dur: 0.15, size: 2 }, k.sp);
  return new Promise((done) => k.layer.add(new FlyingArrow(k.scene, from.x, from.y, x, y, { ...o, onHit: () => done() }, k.sp)));
}

function recover(k: MoveKit, ms = 240): Promise<unknown> {
  const h = k.actor.hero!;
  h.nocked = false;
  return Promise.all([
    k.tween(h, { swing: 0, leanInto: 0, draw: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
  ]).then(() => k.regrip());
}

/** An arrow striking a foe: a flash of green light, a ring, splinters of light flying on, leaves bursting off. */
function arrowHit(k: MoveKit, t: MoveActor, big = false): void {
  const { x, y } = chest(t), sp = k.sp, d = k.dir;
  k.layer.add(new Vfx('star', x, y, { r: big ? 14 : 10, pal: 'leaf', dur: 0.3 }, sp));
  k.layer.add(new Vfx('ring', x, y, { r: big ? 18 : 12, w: 2, sq: 0.8, pal: 'leaf', dur: 0.3 }, sp));
  k.layer.add(new Vfx('spikes', x, y, { r: big ? 24 : 16, n: big ? 11 : 8, a: d > 0 ? 0 : Math.PI, spread: Math.PI * 0.7, pal: 'leaf', dur: 0.32 }, sp));
  k.layer.add(new LeafBurst(x, y, { r: big ? 20 : 14, n: big ? 14 : 8, dur: 0.9, ground: t.y }, sp));
}

/** ยิงศร: aim, draw, loose - there before you see it. */
async function attack(k: MoveKit): Promise<void> {
  const t = k.main, c = chest(t);
  await draw(k, c.x, c.y, 220);
  await k.wait(70);
  await loose(k, c.x, c.y, { dur: 0.09 });
  arrowHit(k, t);
  k.land();
  await k.wait(320);
  await recover(k);
}

/** ศรหนาม: a forest spirit on the arrow as he draws long; it flies shedding leaves; roots burst up round the foe and blow. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, t = k.main, c = chest(t), sp = k.sp;
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 26, w: 3, sq: 0.32, pal: 'leaf', dur: 0.5 }, sp));
  k.layer.add(new LeafBurst(a.x, a.y - 18, { r: 22, n: 14, dur: 1.0, ground: a.y }, sp));
  await draw(k, c.x, c.y, 260);
  k.layer.add(new LeafOrb(() => tip(k), { dur: 0.55, r: 3 }, sp));
  k.layer.add(new ChargeGlow(() => tip(k), 0.5, 9, sp));
  await k.wait(480);
  await loose(k, c.x, c.y, { dur: 0.12, power: 1, leaves: true, size: 1.15 });
  arrowHit(k, t, true);
  k.land();
  // roots burst out round it, coil in, glow - and blow apart
  const D = 1.6;
  k.layer.add(new RootBurst(t.x, t.y + 1, t.half * 2, t.h * 0.85, { dur: D, n: 5 }, sp));
  await k.wait((RootBurst.BURST * D * 1000) / sp);
  k.shake(120, 0.002);
  k.layer.add(new LeafBurst(t.x, t.y - t.h * 0.4, { r: 22, n: 14, dur: 0.9, ground: t.y }, sp));
  await k.wait(380);
  await recover(k);
}

/** ฝนธนูพงไพร: the bow turned to the sky, three arrows up - then a rain of arrows on every foe. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, d = k.dir, sp = k.sp;
  const targets = k.targets.length ? k.targets : [k.main];
  const view = k.layer.view;
  // three up into the sky, one after another
  for (let i = 0; i < 3; i++) {
    const sky = { x: a.x + d * (40 + i * 16), y: view.y - 30 };
    await draw(k, sky.x, sky.y, i ? 100 : 220);
    void loose(k, sky.x, sky.y, { dur: 0.1, power: 1 });
    await k.wait(70);
  }
  await k.wait(260);
  // and down they come, streaking: on every foe, sticking in the ground round them
  let first = true;
  const hits: Promise<void>[] = [];
  targets.forEach((t, ti) => {
    for (let j = 0; j < 5; j++) {
      const ang = (j / 5) * Math.PI * 2 + ti, r = j === 0 ? 0 : 6 + 6 * Math.random();
      const gx = t.x + Math.cos(ang) * r, gy = t.y + Math.sin(ang) * r * 0.34;
      const struck = j === 0; // (the first of each into the foe itself)
      const to = struck ? chest(t) : { x: gx, y: gy };
      const delay = ti * 0.05 + j * 0.06 + Math.random() * 0.04;
      hits.push(new Promise((done) => k.layer.add(new FlyingArrow(k.scene, to.x - d * 14, view.y - 16, to.x, to.y, {
        dur: 0.11, delay, stick: struck ? 0 : 0.7, power: 1,
        onHit: () => {
          if (struck) {
            arrowHit(k, t);
            if (first) (first = false), k.land();
          } else {
            k.ground.add(new Vfx('dust', gx, gy, { r: 5, pal: 'smoke', dur: 0.4 }, sp));
            k.layer.add(new Vfx('star', gx, gy - 1, { r: 4, pal: 'leaf', dur: 0.18 }, sp));
          }
          done();
        },
      }, sp))));
    }
  });
  await Promise.all(hits);
  k.shake(140, 0.0018);
  await k.wait(500);
  await recover(k);
}

/** ศรเทพพฤกษา: deep green, the forest's circle, spirits on a great arrow - a tree of light striking them all. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, sp = k.sp;
  const targets = k.targets.length ? k.targets : [k.main];
  const fx = targets.reduce((n, t) => n + t.x, 0) / targets.length, fy = targets.reduce((n, t) => n + chest(t).y, 0) / targets.length;
  await k.dim(0.5, 260, 0x041a0c);
  // the forest's circle opens under him, leaves sweep in
  k.ground.add(new GroundSigil(a.x, a.y, 34, 2.4, 'leaf', sp));
  for (let i = 0; i < 2; i++) k.layer.add(new LeafBurst(a.x, a.y - 20, { r: 30, n: 16, dur: 1.4, delay: i * 0.3, ground: a.y }, sp));
  glitter(k.layer, a.x, a.y - 16, { r: 22, n: 14, pal: 'leaf', dur: 1, size: 3, rise: -30 }, sp);
  // a great arrow drawn, spirits of the forest gathering on it
  await draw(k, fx, fy - 6, 380);
  k.layer.add(new ChargeGlow(() => tip(k), 0.9, 16, sp));
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    k.layer.add(new LeafOrb(() => { const p = tip(k), w = ang + Date.now() / 220; return { x: p.x + Math.cos(w) * 9, y: p.y + Math.sin(w) * 6 }; }, { dur: 0.85, r: 2, delay: i * 0.08 }, sp));
  }
  k.layer.add(new LeafOrb(() => tip(k), { dur: 0.9, r: 4 }, sp));
  await k.wait(820);
  k.flash(80, 0xc8ffb0);
  // loosed: a great arrow of light, across to them
  await loose(k, fx, fy - 6, { dur: 0.16, size: 2, power: 2, leaves: true });
  // it bursts into a tree of light, its branches striking every one of them - roots erupting under them
  k.layer.add(new TreeBloom(fx, fy - 6, targets.map(chest), { dur: 1.7 }, sp));
  k.layer.add(new Vfx('ring', fx, fy - 6, { r: 44, w: 4, sq: 1, pal: 'leaf', dur: 0.5 }, sp));
  k.flash(110, 0xb4f07a);
  k.shake(220, 0.003);
  await k.wait(220);
  for (const t of targets) {
    arrowHit(k, t, true);
    k.layer.add(new RootBurst(t.x, t.y + 1, t.half * 2, t.h * 0.8, { dur: 1.3, n: 5 }, sp));
    k.ground.add(new GroundSigil(t.x, t.y, 16, 1.0, 'leaf', sp));
  }
  k.land();
  k.hitStop(80);
  await k.wait(900);
  k.shake(160, 0.0024);
  await k.wait(500);
  void k.dim(0, 400);
  await recover(k, 280);
}

export const FEN: HeroMoves = { attack, skill1, skill2, ult };
