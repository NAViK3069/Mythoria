import { BloodDrain, CurvedCut } from '../../fx/effects/blood';
import { FireBurst, GroundCracks, SmokeBillow, StarBurst } from '../../fx/effects/blaze';
import { BladeTrail } from '../../fx/effects/holy';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Kael, the fire-wolf warrior: his flaming axe and moves of fire and stone - heavy, wild blows that hit the ground
// as hard as the foe.
//   attack  - ฟันขวาน: runs in, hops with the axe raised high and brings it down in one burning chop - flames burst up
//             off the foe with a curl of white-hot light, a starburst, the ground cracks and smokes under the blow.
//   skill 1 - เขี้ยวเพลิง: flames gather on the axe; he closes in and strikes down then up - three burning fang marks
//             from above, three from below, the jaws of a fire wolf closing on the foe - and it blows up in fire (burns).
//   skill 2 - หมาป่าคลั่ง: a howl of fire, then he tears down the foes' row like a wolf on the hunt, a burning stroke
//             through each one in turn - and their life burns back into him.
//   ult     - อัคคีหมาป่าคลั่ง: the field goes dark and red, he howls with fire roaring up round him, leaps high over the
//             foes' row and comes down axe-first: the ground splits, a gold blast, smoke billows out, fire erupts under
//             every foe one after another - and their life burns back into him.

/** From the hand to the axe head's far edge (world px: the axe is 22 px tall, held 4 up from its end). */
const BLADE = 19;
/** The dark under his strokes (a drop shadow, so they stand off the field). */
const SHADE = 0x2a0a04;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });
const self = (k: MoveKit) => () => ({ x: k.actor.x, y: k.actor.y - 16 - k.actor.alt });

function recover(k: MoveKit, ms = 220): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(k.actor, { alt: 0 }, ms, 'Quad.easeIn'),
  ]);
}

const trail = (k: MoveKit, life = 0.3) => k.layer.add(new BladeTrail(k.actor.hero!.grip, { rIn: BLADE - 12, R: BLADE + 3, pal: 'fire', life, shadow: SHADE }, k.sp));

/** The axe raised high behind his head (a hop takes him up with it). */
function raise(k: MoveKit, ms: number, hop = 0): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: -2.3, leanInto: -0.14 }, ms, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -3, y: -11 }, ms, 'Quad.easeOut'),
    hop ? k.tween(k.actor, { alt: hop }, ms, 'Quad.easeOut') : Promise.resolve(),
  ]);
}

/** And brought down hard (back to the ground). */
function chop(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 2.2, leanInto: 0.26 }, ms, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 8, y: 5 }, ms, 'Cubic.easeIn'),
    k.tween(k.actor, { alt: 0 }, ms, 'Quad.easeIn'),
  ]);
}

/** A burning blow landing on a foe: a fire crescent, flames bursting up off it, a starburst, embers. */
function fireHit(k: MoveKit, t: MoveActor, big = false): void {
  const { x, y } = chest(t), d = k.dir, sp = k.sp;
  k.layer.add(new Vfx('slash', x - d * 2, y, { r: big ? 24 : 19, a: d > 0 ? 0.5 : Math.PI - 0.5, sweep: 2.4, dir: d, w: big ? 9 : 7, pal: 'fire', tilt: 0.75, dur: 0.36, shadow: SHADE }, sp));
  k.layer.add(new FireBurst(t.x - d * 3, t.y, { r: big ? 34 : 26, dir: d, dur: 0.6 }, sp));
  k.layer.add(new StarBurst(x, y, { r: big ? 20 : 14, dur: 0.8 }, sp));
  glitter(k.layer, x, y, { r: 14, n: big ? 10 : 6, pal: 'fire', dur: 0.4, size: 2, rise: -18 }, sp);
}

/** The ground taking a heavy blow at (x, y): split, smoking, stones flying. */
function groundHit(k: MoveKit, x: number, y: number, w: number): void {
  k.ground.add(new GroundCracks(x, y, { w, dur: 1.8, n: w > 30 ? 10 : 6 }, k.sp));
  k.layer.add(new SmokeBillow(x, y, { w, dur: w > 30 ? 2 : 1.3, n: w > 30 ? 20 : 9, heap: w > 30 ? 6 : 2 }, k.sp));
}

/** Three burning fang marks across (x, y), drawn from above (down) or from below (up). */
function fangs(k: MoveKit, x: number, y: number, down: boolean): void {
  const d = k.dir;
  for (let i = -1; i <= 1; i++) {
    const ox = i * 6, oy = i * 2.5;
    const y0 = down ? y - 18 : y + 14, y1 = down ? y + 12 : y - 16;
    k.layer.add(new CurvedCut(x - d * 16 + ox, y0 + oy, x + d * 12 + ox, y1 + oy, { bend: (down ? 8 : -8) * d, w: 3, dur: 0.5, delay: (i + 1) * 0.035, shadow: SHADE, pal: 'fire' }, k.sp));
  }
}

/** ฟันขวาน: run in, hop with the axe high, one burning chop - the foe in flames, the ground cracked and smoking. */
async function attack(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir;
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 16, pal: 'smoke', dur: 0.6 }, k.sp));
  void k.tween(h, { leanInto: 0.12, swing: -0.8 }, 170, 'Quad.easeOut');
  await k.moveTo(a, t.x - d * (t.half + 18), t.y + 1, 230, 'Quad.easeIn');
  await raise(k, 160, 7);
  glitter(k.layer, h.grip.x, h.grip.y - 12, { r: 8, n: 6, pal: 'fire', dur: 0.25, size: 2, rise: -10 }, k.sp);
  await k.wait(60);
  const tr = trail(k);
  const stroke = chop(k, 115);
  await k.wait(85);
  fireHit(k, t);
  groundHit(k, t.x - d * 8, t.y + 1, 16);
  k.land();
  k.hitStop(60);
  k.shake(100, 0.002);
  await stroke;
  tr.release();
  await k.wait(300);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 300);
  k.regrip();
}

/** เขี้ยวเพลิง: fire gathering on the axe, down then up - the jaws of a fire wolf closing on the foe - and it blows up. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, sp = k.sp;
  // the flames gather on the axe
  k.layer.add(new FireBurst(a.x, a.y, { r: 20, dir: d, dur: 0.55, n: 10, spread: 1.4 }, sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 28, w: 4, sq: 0.32, pal: 'fire', dur: 0.5 }, sp));
  await raise(k, 220);
  for (let i = 0; i < 3; i++) glitter(k.layer, h.grip.x, h.grip.y - 14, { r: 12, n: 6, pal: 'fire', dur: 0.3, size: 3, rise: -14 }, sp);
  k.layer.add(new FireBurst(a.x, a.y, { r: 18, dir: d, dur: 0.5, n: 9 }, sp));
  await k.wait(240);
  // in close
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 14, pal: 'smoke', dur: 0.5 }, sp));
  await k.moveTo(a, t.x - d * (t.half + 16), t.y + 1, 170, 'Cubic.easeIn');
  const c = chest(t);
  // down: the upper fangs
  let tr = trail(k);
  await chop(k, 100);
  tr.release();
  fangs(k, c.x, c.y, true);
  k.layer.add(new FireBurst(t.x - d * 3, t.y, { r: 22, dir: d, dur: 0.5 }, sp));
  k.land();
  k.hitStop(45);
  // and back up: the lower ones - the jaws shut
  tr = trail(k);
  await Promise.all([
    k.tween(h, { swing: -1.4, leanInto: 0.04 }, 110, 'Cubic.easeOut'),
    k.tween(h.reachFront, { x: 5, y: -7 }, 110, 'Cubic.easeOut'),
  ]);
  tr.release();
  fangs(k, c.x, c.y, false);
  await k.wait(120);
  // it blows up in fire
  k.layer.add(new StarBurst(c.x, c.y, { r: 24, dur: 0.9 }, sp));
  k.layer.add(new FireBurst(t.x, t.y, { r: 38, dir: d, dur: 0.7, n: 18, spread: 2.0 }, sp));
  fireHit(k, t, true);
  k.flash(90, 0xffa040);
  k.shake(140, 0.0026);
  k.hitStop(70);
  // the burn: embers rising off it
  for (let i = 0; i < 3; i++) glitter(k.layer, t.x, t.y - t.h * 0.4, { r: t.half + 4, n: 5, pal: 'fire', dur: 0.6, size: 2, rise: -22 }, sp);
  await k.wait(420);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 300);
  k.regrip();
}

/** หมาป่าคลั่ง: a howl of fire, then tearing down the foes' row, a burning stroke through each in turn; their life his. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp;
  const targets = (k.targets.length ? k.targets : [k.main]).slice().sort((p, q) => p.y - q.y);
  // the howl
  await Promise.all([
    k.tween(h, { swing: -0.6, leanInto: -0.22 }, 180, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -2, y: -4 }, 180, 'Quad.easeOut'),
  ]);
  k.layer.add(new Vfx('roar', a.x + d * 6, a.y - 26, { r: 44, dir: d, pal: 'fire', n: 3, dur: 0.6 }, sp));
  k.layer.add(new FireBurst(a.x, a.y, { r: 24, dir: d, dur: 0.6, n: 12, spread: 1.4 }, sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 32, w: 4, sq: 0.32, pal: 'fire', dur: 0.5 }, sp));
  k.shake(160, 0.0018);
  await k.wait(360);
  // down the row: a burning stroke through each, down and up in turn
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    k.ground.add(new Vfx('dust', a.x, a.y, { r: 12, pal: 'smoke', dur: 0.45 }, sp));
    void (i % 2 ? raise(k, 100) : k.tween(h, { swing: 2.0, leanInto: 0.2 }, 100));
    await k.moveTo(a, t.x - d * (t.half + 14), t.y + 1, i ? 120 : 160, 'Quad.easeIn');
    const tr = trail(k, 0.26);
    if (i % 2) await chop(k, 90);
    else
      await Promise.all([
        k.tween(h, { swing: -2.1, leanInto: 0.1 }, 90, 'Cubic.easeOut'),
        k.tween(h.reachFront, { x: 5, y: -9 }, 90, 'Cubic.easeOut'),
      ]);
    tr.release();
    fireHit(k, t);
    if (i === 0) k.land();
    k.hitStop(35);
    k.shake(80, 0.0016);
  }
  await k.wait(200);
  // their life burns back into him
  k.layer.add(new BloodDrain(targets.map(chest), self(k), { n: 4, dur: 0.75, pal: 'fire' }, sp));
  glitter(k.layer, a.x, a.y - 16, { r: 12, n: 8, pal: 'fire', dur: 0.5, size: 2, rise: -20 }, sp);
  await k.wait(700);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 320);
  k.regrip();
}

/** อัคคีหมาป่าคลั่ง: dark and red, a howl of fire, a leap over the row, the axe down - the ground split, fire erupting. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp;
  const targets = k.targets.length ? k.targets : [k.main];
  const fx = targets.reduce((n, t) => n + t.x, 0) / targets.length, fy = targets.reduce((n, t) => n + t.y, 0) / targets.length;
  await k.dim(0.5, 240, 0x2a0a04);
  // the howl, fire roaring up round him
  await Promise.all([
    k.tween(h, { swing: -0.6, leanInto: -0.24 }, 200, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -2, y: -4 }, 200, 'Quad.easeOut'),
  ]);
  k.layer.add(new Vfx('roar', a.x + d * 6, a.y - 26, { r: 56, dir: d, pal: 'fire', n: 4, dur: 0.8 }, sp));
  k.layer.add(new FireBurst(a.x, a.y, { r: 26, dir: d, dur: 0.7, n: 12, spread: 1.2, delay: 0.3 }, sp));
  k.layer.add(new FireBurst(a.x, a.y, { r: 34, dir: d, dur: 0.8, n: 18, spread: 2.6 }, sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 40, w: 5, sq: 0.32, pal: 'fire', dur: 0.6 }, sp));
  for (let i = 0; i < 3; i++) glitter(k.layer, a.x, a.y - 20, { r: 18, n: 8, pal: 'fire', dur: 0.7, size: 3, rise: -30 }, sp);
  k.shake(200, 0.002);
  await k.wait(520);
  // the leap: high over the row, the axe raised
  const land = { x: fx - d * 26, y: fy + 1 };
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 18, pal: 'smoke', dur: 0.7 }, sp));
  void raise(k, 260);
  void k.tween(a, { alt: 48 }, 260, 'Quad.easeOut');
  await k.moveTo(a, (a.x + land.x) / 2, (a.y + land.y) / 2, 260, 'Linear');
  // ...and down, axe first
  const tr = trail(k, 0.34);
  void k.moveTo(a, land.x, land.y, 170, 'Linear');
  await chop(k, 170);
  tr.release();
  const P = { x: fx - d * 8, y: fy + 1 };
  groundHit(k, P.x, P.y, 56);
  k.layer.add(new StarBurst(P.x, P.y - 12, { r: 32, dur: 1 }, sp));
  k.layer.add(new FireBurst(P.x, P.y, { r: 44, dir: d, dur: 0.8, n: 20, spread: 2.4 }, sp));
  k.flash(110, 0xffb040);
  k.land();
  k.hitStop(100);
  k.shake(280, 0.0036);
  await k.wait(200);
  // fire erupts under every foe, one after another (burning them)
  targets.forEach((t, i) => {
    k.layer.add(new FireBurst(t.x, t.y, { r: 36, dir: d, dur: 0.75, n: 16, delay: i * 0.09 }, sp));
    k.layer.add(new StarBurst(chest(t).x, chest(t).y, { r: 16, dur: 0.7, delay: i * 0.09 + 0.05 }, sp));
    glitter(k.layer, t.x, t.y - t.h * 0.4, { r: t.half + 4, n: 8, pal: 'fire', dur: 0.8, size: 2, rise: -26 }, sp);
  });
  k.shake(200, 0.0026);
  await k.wait(targets.length * 90 + 400);
  // their life burns back into him
  k.layer.add(new BloodDrain(targets.map(chest), self(k), { n: 6, dur: 0.9, pal: 'fire' }, sp));
  glitter(k.layer, a.x, a.y - 16, { r: 14, n: 10, pal: 'fire', dur: 0.6, size: 2, rise: -24 }, sp);
  await k.wait(950);
  void k.dim(0, 400);
  void recover(k, 260);
  await k.moveTo(a, a.home.x, a.home.y, 380);
  k.regrip();
}

export const KAEL: HeroMoves = { attack, skill1, skill2, ult };
