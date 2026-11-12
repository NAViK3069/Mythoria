import { BladeTrail, GroundSigil } from '../../fx/effects/holy';
import { AfterImage, CutLine, ShadowSilhouette, ShadowSmoke, type Snap } from '../../fx/effects/shadow';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Nyx, the assassin of the night: a dagger in each hand (leaning out from her, the front one's edge turned out) and
// moves made of shadow -
//   attack  - แทงมีดคู่: she flickers into the shadows (her shape flares white and is squeezed into a sliver) and
//             out of them in front of the foe, cuts across it with one dagger and back with the other (an X of violet
//             light), and flickers home.
//   skill 1 - เงาเชือด: a dash straight through the foe, ghosts of her strung out behind, a long cut left across it -
//             then three more cuts open on it at once, and the blood runs.
//   skill 2 - ม่านราตรี: she sinks into a pool of shadow; night billows up round the foe; she drops out of it from
//             above with a great crescent stroke down.
//   ult     - เงาประหาร: the field goes dark, she vanishes, a violet circle opens under the foe - and shadows of her
//             strike from every side, cut after cut, until she comes down on it with one great X.

/** From the hand to a dagger's point (world px: the owner's dagger, 33 art px at 3/4, from its grip). */
const BLADE = 17;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });
const snap = (k: MoveKit): Snap => k.actor.hero!.snapshot();

/** Into the shadows where she stands (her shape flares and is squeezed away), and gone. */
async function vanish(k: MoveKit, ms = 160): Promise<void> {
  const a = k.actor;
  k.layer.add(new ShadowSilhouette(snap(k), a.x, a.y, true, { dur: (ms / 1000) * 1.6 }, k.sp));
  glitter(k.layer, a.x, a.y - 14, { r: 12, n: 6, pal: 'violet', dur: 0.2, size: 3 }, k.sp);
  a.hero!.root.setAlpha(0);
  await k.wait(ms);
}

/** Out of the shadows at (x, y): a sliver opening out into her shape, and she's there. */
async function appear(k: MoveKit, x: number, y: number, ms = 140): Promise<void> {
  const a = k.actor;
  a.x = x;
  a.y = y;
  k.layer.add(new ShadowSilhouette(snap(k), x, y, false, { dur: (ms / 1000) * 1.6 }, k.sp));
  await k.wait(ms * 0.6);
  a.hero!.root.setAlpha(1);
  await k.wait(ms * 0.4);
}

function recover(k: MoveKit, ms = 200): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
  ]);
}

/** A cut landing on a foe: the flash of it, sparks and shards, light thrown on. */
function hitFlash(k: MoveKit, x: number, y: number, big = false, pal: 'violet' | 'void' | 'blood' = 'violet'): void {
  const sp = k.sp, d = k.dir;
  k.layer.add(new Vfx('star', x, y, { r: big ? 14 : 9, pal, dur: 0.3 }, sp));
  k.layer.add(new Vfx('spikes', x, y, { r: big ? 20 : 13, n: big ? 11 : 7, a: d > 0 ? 0 : Math.PI, spread: Math.PI * 1.6, pal, dur: 0.38 }, sp));
  k.layer.add(new Vfx('lines', x, y, { r: big ? 34 : 22, dir: d, n: big ? 22 : 12, pal, dur: 0.4 }, sp));
}

/** An X cut across (x, y): two straight cuts crossing, the second a beat after the first. */
function xCut(k: MoveKit, x: number, y: number, r: number, pal: 'violet' | 'void' | 'blood', w = 3, gap = 0.07): void {
  k.layer.add(new CutLine(x - r, y - r * 0.8, x + r, y + r * 0.8, { w, pal, dur: 0.4 }, k.sp));
  k.layer.add(new CutLine(x - r, y + r * 0.8, x + r, y - r * 0.8, { w, pal, dur: 0.4, delay: gap }, k.sp));
}

/** แทงมีดคู่: into the shadows, out in front of the foe, a cut with each dagger (an X), home again. */
async function attack(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, home = { ...a.home };
  // daggers drawn back, a crouch
  await Promise.all([
    k.tween(h, { swing: -1.3, swingBack: 0.9, leanInto: -0.1 }, 110, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -2, y: -3 }, 110, 'Quad.easeOut'),
  ]);
  await vanish(k);
  const c = chest(t);
  await appear(k, t.x - d * (t.half + 11), t.y + 1);
  // the front dagger across, the back one back the other way
  const tr1 = k.layer.add(new BladeTrail(h.grip, { rIn: 4, R: BLADE + 3, pal: 'violet', life: 0.2 }, k.sp));
  await Promise.all([
    k.tween(h, { swing: 1.9, leanInto: 0.16 }, 80, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 6, y: 3 }, 80, 'Cubic.easeIn'),
  ]);
  tr1.release();
  k.layer.add(new CutLine(c.x - d * 14, c.y - 12, c.x + d * 14, c.y + 10, { w: 3, pal: 'violet', dur: 0.36 }, k.sp));
  hitFlash(k, c.x, c.y);
  k.land();
  k.hitStop(35);
  const tr2 = k.layer.add(new BladeTrail(h.gripBack, { rIn: 4, R: BLADE + 3, pal: 'void', life: 0.2 }, k.sp));
  await Promise.all([
    k.tween(h, { swingBack: -1.9 }, 80, 'Cubic.easeIn'),
    k.tween(h.reachBack, { x: 16, y: -4 }, 80, 'Cubic.easeIn'),
  ]);
  tr2.release();
  k.layer.add(new CutLine(c.x - d * 14, c.y + 10, c.x + d * 14, c.y - 12, { w: 3, pal: 'void', dur: 0.36 }, k.sp));
  k.layer.add(new Vfx('star', c.x, c.y, { r: 8, pal: 'void', dur: 0.25 }, k.sp));
  await k.wait(170);
  // back home through the shadows
  await vanish(k, 130);
  void recover(k, 10);
  await appear(k, home.x, home.y, 130);
  k.regrip();
}

/** เงาเชือด: a dash straight through the foe with ghosts strung out behind, then the cuts open and the blood runs. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, home = { ...a.home }, sp = k.sp;
  const c = chest(t);
  await Promise.all([
    k.tween(h, { swing: -1.4, swingBack: 1.2, leanInto: 0.22 }, 130, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -4, y: 1 }, 130, 'Quad.easeOut'),
  ]);
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 16, dur: 0.5 }, sp));
  // the dash: right through it, to the far side, a ghost of her every few frames
  const from = { x: a.x, y: a.y }, to = { x: t.x + d * (t.half + 16), y: t.y + 1 };
  let ghosts = true;
  const trail = async () => {
    while (ghosts) {
      k.layer.add(new AfterImage(snap(k), a.x, a.y, { life: 0.32, pal: 'violet' }, sp));
      await k.wait(28);
    }
  };
  void trail();
  const tr = k.layer.add(new BladeTrail(h.grip, { rIn: 4, R: BLADE + 3, pal: 'violet', life: 0.18 }, sp));
  void k.tween(h, { swing: 2.0 }, 120, 'Cubic.easeIn');
  await k.moveTo(a, to.x, to.y, 150, 'Cubic.easeIn');
  ghosts = false;
  tr.release();
  k.layer.add(new CutLine(from.x + d * 10, c.y + 4, to.x - d * 4, c.y - 2, { w: 3, pal: 'violet', dur: 0.45 }, sp));
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 14, dur: 0.5 }, sp));
  await k.wait(110);
  // the cuts open on it, all at once - and the blood runs
  k.layer.add(new CutLine(c.x - 10, c.y - 14, c.x + 10, c.y + 12, { w: 3, pal: 'blood', dur: 0.4 }, sp));
  k.layer.add(new CutLine(c.x - 12, c.y + 10, c.x + 12, c.y - 12, { w: 3, pal: 'blood', dur: 0.4, delay: 0.04 }, sp));
  k.layer.add(new CutLine(c.x, c.y - 16, c.x, c.y + 14, { w: 2, pal: 'violet', dur: 0.4, delay: 0.08 }, sp));
  hitFlash(k, c.x, c.y, true, 'blood');
  glitter(k.layer, c.x, c.y, { r: 14, n: 8, pal: 'blood', dur: 0.35, size: 3, rise: 20 }, sp);
  k.land();
  k.hitStop(55);
  k.shake(110, 0.002);
  await k.wait(260);
  // back: through the shadows
  await vanish(k, 120);
  void recover(k, 10);
  await appear(k, home.x, home.y, 130);
  k.regrip();
}

/** ม่านราตรี: into a pool of shadow, night billowing up round the foe, out of it from above with a great stroke down. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, home = { ...a.home }, sp = k.sp;
  const c = chest(t);
  // sinking into a pool of shadow
  k.ground.add(new ShadowSmoke(a.x, a.y, 16, { dur: 0.7, up: 4 }, sp));
  await k.tween(h, { leanInto: -0.12 }, 120, 'Quad.easeOut');
  await vanish(k, 180);
  // night billows up round the foe
  k.layer.add(new ShadowSmoke(t.x, t.y - 6, 34, { dur: 1.3, n: 18, up: 16 }, sp));
  k.layer.add(new Vfx('ring', t.x, t.y, { r: 40, w: 4, sq: 0.32, pal: 'void', dur: 0.6 }, sp));
  void k.dim(0.32, 200);
  await k.wait(320);
  // out of it, above and in front of the foe, both daggers raised - and down
  h.swing = -1.9;
  h.swingBack = 1.5;
  h.reachFront.y = -8;
  h.reachBack.y = -8;
  await appear(k, t.x - d * (t.half + 9), t.y - 14, 120);
  const tr1 = k.layer.add(new BladeTrail(h.grip, { rIn: 4, R: BLADE + 5, pal: 'violet', life: 0.26 }, sp));
  const tr2 = k.layer.add(new BladeTrail(h.gripBack, { rIn: 4, R: BLADE + 5, pal: 'void', life: 0.26 }, sp));
  await Promise.all([
    k.tween(h, { swing: 2.1, swingBack: -2.0, leanInto: 0.2 }, 110, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 6, y: 4 }, 110, 'Cubic.easeIn'),
    k.tween(h.reachBack, { x: 12, y: 4 }, 110, 'Cubic.easeIn'),
    k.moveTo(a, a.x, t.y + 1, 110, 'Cubic.easeIn'),
  ]);
  tr1.release();
  tr2.release();
  k.layer.add(new Vfx('slash', c.x, c.y - 4, { r: 26, a: Math.PI / 2, sweep: 2.6, dir: d, w: 8, pal: 'violet', tilt: 0.9, dur: 0.4 }, sp));
  k.layer.add(new CutLine(c.x, c.y - 26, c.x + d * 4, c.y + 16, { w: 4, pal: 'void', dur: 0.45 }, sp));
  hitFlash(k, c.x, c.y, true, 'void');
  k.layer.add(new Vfx('ring', c.x, c.y, { r: 24, w: 4, sq: 0.9, pal: 'violet', dur: 0.4 }, sp));
  k.land();
  k.hitStop(70);
  k.shake(140, 0.0025);
  await k.wait(300);
  void k.dim(0, 300);
  await vanish(k, 130);
  void recover(k, 10);
  await appear(k, home.x, home.y, 130);
  k.regrip();
}

/** เงาประหาร: the field goes dark, shadows of her strike from every side, and she comes down with one great X. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, home = { ...a.home }, sp = k.sp;
  const c = chest(t);
  await k.dim(0.55, 220);
  k.layer.add(new Vfx('aura', a.x, a.y, { r: 12, h: 44, pal: 'violet', dur: 0.5 }, sp));
  await k.wait(120);
  const ghost = snap(k);
  await vanish(k, 200);
  // a violet circle opens under the foe
  k.ground.add(new GroundSigil(t.x, t.y, 34, 1.8, 'violet', sp));
  k.ground.add(new Vfx('ring', t.x, t.y, { r: 60, w: 5, sq: 0.3, pal: 'void', dur: 0.7 }, sp));
  await k.wait(160);
  // shadows of her strike from every side: a ghost, a cut through the foe, again and again
  const n = 6;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + 0.4, R = 26;
    const gx = t.x + Math.cos(ang) * R, gy = t.y + Math.sin(ang) * R * 0.45;
    k.layer.add(new AfterImage(ghost, gx, gy, { life: 0.3, pal: i % 2 ? 'void' : 'violet', a: 0.9 }, sp));
    const ox = Math.cos(ang + Math.PI) * 22, oy = Math.sin(ang + Math.PI) * 16;
    k.layer.add(new CutLine(c.x - ox, c.y - oy, c.x + ox, c.y + oy, { w: 3, pal: i % 3 === 2 ? 'blood' : 'violet', dur: 0.32 }, sp));
    k.layer.add(new Vfx('star', c.x + (Math.random() - 0.5) * 8, c.y + (Math.random() - 0.5) * 8, { r: 7, pal: 'violet', dur: 0.2 }, sp));
    k.shake(50, 0.0012);
    await k.wait(75);
  }
  // she comes down on it: one great X
  h.swing = -1.9;
  h.swingBack = 1.5;
  h.reachFront.y = -9;
  h.reachBack.y = -9;
  await appear(k, t.x - d * (t.half + 10), t.y - 10, 110);
  const tr1 = k.layer.add(new BladeTrail(h.grip, { rIn: 4, R: BLADE + 6, pal: 'violet', life: 0.3 }, sp));
  const tr2 = k.layer.add(new BladeTrail(h.gripBack, { rIn: 4, R: BLADE + 6, pal: 'void', life: 0.3 }, sp));
  await Promise.all([
    k.tween(h, { swing: 2.1, swingBack: -2.0, leanInto: 0.22 }, 110, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 7, y: 4 }, 110, 'Cubic.easeIn'),
    k.tween(h.reachBack, { x: 13, y: 4 }, 110, 'Cubic.easeIn'),
    k.moveTo(a, a.x, t.y + 1, 110, 'Cubic.easeIn'),
  ]);
  tr1.release();
  tr2.release();
  xCut(k, c.x, c.y, 34, 'violet', 5, 0.05);
  k.layer.add(new Vfx('slash', c.x, c.y, { r: 30, a: d > 0 ? 0.4 : Math.PI - 0.4, sweep: 2.8, dir: d, w: 9, pal: 'void', tilt: 0.8, dur: 0.45 }, sp));
  hitFlash(k, c.x, c.y, true, 'void');
  k.layer.add(new Vfx('ring', c.x, c.y, { r: 44, w: 6, sq: 0.85, pal: 'violet', dur: 0.5 }, sp));
  glitter(k.layer, c.x, c.y, { r: 26, n: 16, pal: 'violet', dur: 0.6, size: 4, rise: 14 }, sp);
  k.flash(120, 0xe0c0ff);
  k.land();
  k.hitStop(90);
  k.shake(200, 0.003);
  await k.wait(380);
  void k.dim(0, 350);
  await vanish(k, 130);
  void recover(k, 10);
  await appear(k, home.x, home.y, 140);
  k.regrip();
}

export const NYX: HeroMoves = { attack, skill1, skill2, ult };
