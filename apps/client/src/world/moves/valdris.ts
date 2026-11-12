import { BloodDrain, BloodLance, BloodMoon, BloodSplash, CurvedCut } from '../../fx/effects/blood';
import { BladeTrail, GroundSigil } from '../../fx/effects/holy';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Valdris, the lord of the blood night: his blood sword (the owner's, its edge turned out) and moves of blood - every
// blow draws the foe's blood out in orbs that fly back into him (his lifesteal).
//   attack  - ฟันโลหิต: in through a red mist, the sword raised and brought down in one heavy crimson stroke; blood
//             bursts off the foe and its orbs stream back into him.
//   skill 1 - คมเลือด: a crimson aura flares off him, he closes in and cuts twice - down, then back up - an X of blood
//             on the foe, then a flurry of sword cuts across it, the blood spraying, a great drain of it.
//   skill 2 - ราตรีกระหายเลือด: a circle of blood opens under him, orbs of blood gather in a fan over his head and fly
//             as lances into the foes' row - and the blood comes back.
//   ult     - จันทร์สีเลือด: the field sinks into crimson, a blood moon rises over the foes and rains lances of blood on
//             them, a circle opens under them - and his stroke sweeps a great crescent across them all, a flurry of cuts across
//             each; every foe's blood streams back into him.

/** From the hand to the sword's point (world px: the owner's sword, 50 art px at 3/4, held 8 up from its end). */
const BLADE = 31;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });
/** The dark under his strokes and cuts (a drop shadow, so they stand off the field). */
const SHADE = 0x1a0208;
const self = (k: MoveKit) => () => ({ x: k.actor.x, y: k.actor.y - 16 });

function recover(k: MoveKit, ms = 220): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
  ]);
}

/** How long a flurry of sword cuts takes to land (ms, at speed 1). */
const FLURRY = 200;

/**
 * A flurry of sword cuts across a foe at (x, y), w across (the owner's choice over a bite): a sweeping cut straight
 * across, then two crossing diagonals one after another - crimson, white at their hearts, each with its dark shadow -
 * and a dark crescent under a crimson one to finish.
 */
function flurry(k: MoveKit, x: number, y: number, w: number): void {
  const d = k.dir, sp = k.sp;
  k.layer.add(new CurvedCut(x - d * w, y - 3, x + d * w, y + 3, { bend: 5, w: 4, dur: 0.42, shadow: SHADE }, sp));
  k.layer.add(new CurvedCut(x - d * w * 0.8, y - w * 0.75, x + d * w * 0.8, y + w * 0.65, { bend: 8 * d, w: 4.5, dur: 0.45, delay: 0.06, shadow: SHADE }, sp));
  k.layer.add(new CurvedCut(x - d * w * 0.8, y + w * 0.65, x + d * w * 0.8, y - w * 0.75, { bend: -8 * d, w: 4.5, dur: 0.45, delay: 0.12, shadow: SHADE }, sp));
  k.layer.add(new Vfx('slash', x - d * 2, y + 1, { r: w + 6, a: d > 0 ? 0.5 : Math.PI - 0.5, sweep: 2.5, dir: d, w: 8, pal: 'night', tilt: 0.7, dur: 0.42, delay: 0.16, shadow: SHADE }, sp));
  k.layer.add(new Vfx('slash', x, y, { r: w + 2, a: d > 0 ? 0.5 : Math.PI - 0.5, sweep: 2.4, dir: d, w: 6, pal: 'blood', tilt: 0.7, dur: 0.38, delay: 0.17, shadow: SHADE }, sp));
  k.layer.add(new Vfx('star', x, y, { r: w * 0.6, pal: 'blood', dur: 0.3, delay: 0.18 }, sp));
}

/** A heavy blow landing: a crimson crescent, a hot star, shards, blood bursting off and falling. */
function bloodHit(k: MoveKit, t: MoveActor, big = false): void {
  const { x, y } = chest(t), d = k.dir, sp = k.sp;
  k.layer.add(new Vfx('slash', x - d * 3, y + 1, { r: big ? 28 : 22, a: d > 0 ? 0.5 : Math.PI - 0.5, sweep: 2.5, dir: d, w: big ? 11 : 8, pal: 'night', tilt: 0.75, dur: 0.45, shadow: SHADE }, sp));
  k.layer.add(new Vfx('slash', x - d * 2, y, { r: big ? 24 : 18, a: d > 0 ? 0.5 : Math.PI - 0.5, sweep: 2.4, dir: d, w: big ? 8 : 6, pal: 'blood', tilt: 0.75, dur: 0.38, shadow: SHADE }, sp));
  k.layer.add(new Vfx('star', x, y, { r: big ? 14 : 10, pal: 'blood', dur: 0.32 }, sp));
  k.layer.add(new Vfx('spikes', x, y, { r: big ? 22 : 15, n: big ? 11 : 8, a: d > 0 ? 0 : Math.PI, spread: Math.PI * 1.4, pal: 'blood', dur: 0.4 }, sp));
  k.layer.add(new BloodSplash(x, y, t.y, { n: big ? 22 : 14, dir: d }, sp));
}

/** ฟันโลหิต: in through a red mist, one heavy crimson stroke down, the blood drawn back. */
async function attack(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir;
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 16, pal: 'blood', dur: 0.6 }, k.sp));
  void k.tween(h, { leanInto: 0.12, swing: -0.9 }, 170, 'Quad.easeOut');
  await k.moveTo(a, t.x - d * (t.half + 20), t.y + 1, 240, 'Quad.easeIn');
  await Promise.all([
    k.tween(h, { swing: -1.95, leanInto: -0.1 }, 150, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -4, y: -9 }, 150, 'Quad.easeOut'),
  ]);
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 10, h: 34, pal: 'blood', dur: 0.45 }, k.sp));
  await k.wait(70);
  const tr = k.layer.add(new BladeTrail(h.grip, { rIn: BLADE - 16, R: BLADE + 3, pal: 'blood', life: 0.28, shadow: SHADE }, k.sp));
  const stroke = Promise.all([
    k.tween(h, { swing: 2.05, leanInto: 0.22 }, 120, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 7, y: 3 }, 120, 'Cubic.easeIn'),
  ]);
  await k.wait(85);
  bloodHit(k, t);
  k.land();
  k.hitStop(50);
  await stroke;
  tr.release();
  k.layer.add(new BloodDrain([chest(t)], self(k), { n: 4, dur: 0.6, delay: 0.1 }, k.sp));
  await k.wait(260);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 300);
  k.regrip();
}

/** คมเลือด: a crimson aura flaring, in close, two cuts - down, then back up - an X of blood, a great drain. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, sp = k.sp;
  // the aura flares
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 13, h: 48, pal: 'blood', dur: 0.8 }, sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 30, w: 4, sq: 0.3, pal: 'blood', dur: 0.5 }, sp));
  glitter(k.layer, a.x, a.y - 16, { r: 16, n: 10, pal: 'blood', dur: 0.4, size: 3, rise: -24 }, sp);
  await Promise.all([
    k.tween(h, { swing: -1.95, leanInto: -0.12 }, 200, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -4, y: -9 }, 200, 'Quad.easeOut'),
  ]);
  await k.wait(80);
  // in close
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 14, pal: 'blood', dur: 0.5 }, sp));
  await k.moveTo(a, t.x - d * (t.half + 16), t.y + 1, 160, 'Cubic.easeIn');
  const c = chest(t);
  // down...
  let tr = k.layer.add(new BladeTrail(h.grip, { rIn: BLADE - 16, R: BLADE + 4, pal: 'blood', life: 0.3, shadow: SHADE }, sp));
  await Promise.all([
    k.tween(h, { swing: 2.05, leanInto: 0.2 }, 100, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 7, y: 3 }, 100, 'Cubic.easeIn'),
  ]);
  tr.release();
  k.layer.add(new CurvedCut(c.x - d * 20, c.y - 18, c.x + d * 18, c.y + 14, { bend: 10 * d, w: 4.5, dur: 0.5, shadow: SHADE }, sp));
  bloodHit(k, t);
  k.land();
  k.hitStop(45);
  // ...and back up
  tr = k.layer.add(new BladeTrail(h.grip, { rIn: BLADE - 16, R: BLADE + 4, pal: 'blood', life: 0.3, shadow: SHADE }, sp));
  await Promise.all([
    k.tween(h, { swing: -1.3, leanInto: 0.05 }, 110, 'Cubic.easeOut'),
    k.tween(h.reachFront, { x: 4, y: -6 }, 110, 'Cubic.easeOut'),
  ]);
  tr.release();
  k.layer.add(new CurvedCut(c.x - d * 20, c.y + 14, c.x + d * 18, c.y - 18, { bend: -10 * d, w: 4.5, dur: 0.5, shadow: SHADE }, sp));
  bloodHit(k, t, true);
  k.shake(120, 0.0022);
  // and a flurry of cuts across it - its blood drawn out
  await k.wait(120);
  flurry(k, c.x, c.y, Math.max(16, t.half + 8));
  await k.wait(FLURRY / sp);
  k.layer.add(new BloodSplash(c.x, c.y, t.y, { n: 18 }, sp));
  k.layer.add(new Vfx('star', c.x, c.y, { r: 12, pal: 'blood', dur: 0.3 }, sp));
  k.shake(100, 0.002);
  k.layer.add(new BloodDrain([c], self(k), { n: 9, dur: 0.75, delay: 0.05 }, sp));
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 12, h: 40, pal: 'blood', dur: 0.7, delay: 0.45 }, sp));
  await k.wait(420);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 300);
  k.regrip();
}

/** ราตรีกระหายเลือด: a circle of blood under him, orbs gathering in a fan over his head, flying as lances into the row. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp;
  void k.dim(0.25, 200, 0x1a0206);
  await Promise.all([
    k.tween(h, { swing: 0, leanInto: -0.08 }, 220, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -2, y: -12 }, 220, 'Quad.easeOut'),
  ]);
  k.ground.add(new GroundSigil(a.x, a.y, 32, 1.6, 'blood', sp));
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 12, h: 44, pal: 'blood', dur: 1.0 }, sp));
  // the orbs gather in a fan over his head
  const n = 6, orbs = Array.from({ length: n }, (_, i) => {
    const ang = -Math.PI / 2 + ((i - (n - 1) / 2) / (n - 1)) * 2.2;
    return { x: a.x + Math.cos(ang) * 22, y: a.y - 26 + Math.sin(ang) * 16 };
  });
  orbs.forEach((o, i) => k.layer.add(new Vfx('star', o.x, o.y, { r: 6, pal: 'blood', dur: 0.75, delay: i * 0.05 }, sp)));
  await k.wait(560);
  // and fly as lances into the row
  const targets = k.targets.length ? k.targets : [k.main];
  orbs.forEach((o, i) => {
    const t = targets[i % targets.length], c = chest(t);
    k.layer.add(new BloodLance(o.x, o.y, c.x + (Math.random() - 0.5) * 6, c.y + (Math.random() - 0.5) * 8, {
      dur: 0.22, delay: i * 0.06,
      onHit: () => k.layer.add(new Vfx('star', c.x, c.y, { r: 8, pal: 'blood', dur: 0.25 }, sp)),
    }, sp));
  });
  await k.wait(240);
  for (const t of targets) k.layer.add(new BloodSplash(chest(t).x, chest(t).y, t.y, { n: 12, dir: d }, sp));
  k.land();
  k.shake(140, 0.002);
  await k.wait(220);
  k.layer.add(new BloodDrain(targets.map(chest), self(k), { n: 4, dur: 0.75 }, sp));
  await k.wait(600);
  void k.dim(0, 300);
  await recover(k, 240);
  k.regrip();
}

/** จันทร์สีเลือด: the field in crimson, a blood moon raining lances, a great crescent across them all, all their blood his. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp;
  const targets = k.targets.length ? k.targets : [k.main];
  const fx = targets.reduce((n, t) => n + t.x, 0) / targets.length, fy = targets.reduce((n, t) => n + t.y, 0) / targets.length;
  const view = k.layer.view;
  await k.dim(0.55, 240, 0x1a0206);
  // the blood moon rises over them
  // (over the foes, high - but under the HUD's top rows, which cover the top of the view on a phone)
  const moon = { x: fx, y: Math.max(view.y + 34, fy - 78) };
  k.layer.add(new BloodMoon(moon.x, moon.y, 16, 2.6, sp));
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 14, h: 56, pal: 'blood', dur: 1.4 }, sp));
  await Promise.all([
    k.tween(h, { swing: 0, leanInto: -0.08 }, 260, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -2, y: -12 }, 260, 'Quad.easeOut'),
  ]);
  k.ground.add(new GroundSigil(fx, fy, 60, 2.2, 'blood', sp));
  await k.wait(380);
  // it rains lances of blood on them
  let i = 0;
  for (const t of targets)
    for (let j = 0; j < 2; j++, i++) {
      const c = chest(t);
      k.layer.add(new BloodLance(moon.x + (Math.random() - 0.5) * 20, moon.y + 10, c.x + (Math.random() - 0.5) * 8, c.y + (Math.random() - 0.5) * 8, {
        dur: 0.26, delay: i * 0.07,
        onHit: () => k.layer.add(new Vfx('star', c.x, c.y, { r: 7, pal: 'blood', dur: 0.22 }, sp)),
      }, sp));
    }
  await k.wait(i * 70 + 220);
  // his stroke: a great crescent across them all
  h.swing = -1.95;
  h.reachFront.x = -4;
  h.reachFront.y = -9;
  const tr = k.layer.add(new BladeTrail(h.grip, { rIn: BLADE - 16, R: BLADE + 6, pal: 'blood', life: 0.32, shadow: SHADE }, sp));
  await Promise.all([
    k.tween(h, { swing: 2.1, leanInto: 0.24 }, 120, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 8, y: 3 }, 120, 'Cubic.easeIn'),
  ]);
  tr.release();
  k.layer.add(new Vfx('slash', fx - d * 4, fy - 12, { r: 78, a: d > 0 ? 0.3 : Math.PI - 0.3, sweep: 2.5, dir: d, w: 20, pal: 'night', tilt: 0.55, dur: 0.6, shadow: SHADE }, sp));
  k.layer.add(new Vfx('slash', fx, fy - 14, { r: 70, a: d > 0 ? 0.3 : Math.PI - 0.3, sweep: 2.4, dir: d, w: 14, pal: 'blood', tilt: 0.55, dur: 0.55, shadow: SHADE }, sp));
  k.layer.add(new CurvedCut(fx - d * 70, fy - 40, fx + d * 60, fy + 20, { bend: 14 * d, w: 5, dur: 0.55, shadow: SHADE }, sp));
  for (const t of targets) bloodHit(k, t, true);
  k.flash(140, 0xff4050);
  k.land();
  k.hitStop(90);
  k.shake(220, 0.003);
  await k.wait(260);
  // a flurry of cuts across every one of them - and their blood streams back into him
  for (const t of targets) flurry(k, chest(t).x, chest(t).y, Math.max(14, t.half + 6));
  await k.wait(FLURRY / sp);
  for (const t of targets) k.layer.add(new BloodSplash(chest(t).x, chest(t).y, t.y, { n: 12 }, sp));
  k.shake(140, 0.0024);
  k.layer.add(new BloodDrain(targets.map(chest), self(k), { n: 6, dur: 0.9 }, sp));
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 14, h: 50, pal: 'blood', dur: 0.9, delay: 0.5 }, sp));
  await k.wait(900);
  void k.dim(0, 400);
  await recover(k, 280);
  k.regrip();
}

export const VALDRIS: HeroMoves = { attack, skill1, skill2, ult };
