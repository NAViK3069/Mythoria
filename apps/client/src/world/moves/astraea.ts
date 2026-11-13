import { CurvedCut } from '../../fx/effects/blood';
import { BladeTrail } from '../../fx/effects/holy';
import { FrozenCuts, PetalGale, SakuraBloom, SakuraConstellation, SakuraPetals } from '../../fx/effects/sakura';
import { AfterImage, CutLine, type Snap } from '../../fx/effects/shadow';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Astraea, the star maiden of the sakura blade (Mythic - the owner: "the coolest hero ever"): the owner's sakura katana
// in both hands, and the petals and stars that follow it.
//   attack  - ฟันซากุระ: a blink-step in (an after-image left behind), one rising diagonal cut - a pink crescent, a
//             blossom of light on the foe, petals flung up.
//   skill 1 - ไออิ: กลีบจันทร์: she lowers the blade, petals gathering round her, a glint of starlight - and she's
//             already past the foe, blade out, a long white line through it; a heartbeat of stillness, then the cut
//             blooms: a great blossom of light, a crescent, petals everywhere.
//   skill 2 - พายุกลีบซากุระ: she whirls, her blade flinging out a gale of petals that sweeps over every foe, each cut
//             by blades of petal-light as it passes.
//   ult     - ดาราซากุระพันคม: night falls and the stars join into a sakura constellation over the foes; she raises the
//             blade to it - and vanishes: after-images of her flash about the foes while a thousand cuts appear frozen
//             in the air; she stands home again and slides the blade back into its sheath - and every cut blooms at
//             once: blossoms of light on every foe, a storm of petals.

/** From her front hand to the katana's point (world px: 66 art rows up its half-size picture, shown at half). */
const TIP = 33;
const SHADE = 0x2a0a20;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });
const snap = (k: MoveKit): Snap => k.actor.hero!.snapshot();
const trail = (k: MoveKit, life = 0.24) => k.layer.add(new BladeTrail(k.actor.hero!.grip, { rIn: TIP - 18, R: TIP + 2, pal: 'sakura', life, shadow: SHADE }, k.sp));

function recover(k: MoveKit, ms = 240): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(k.actor, { alt: 0 }, ms, 'Quad.easeIn'),
  ]).then(() => {
    h.bothHands = true;
    k.regrip();
  });
}

/** A blink-step: an after-image where she stood, petals in the air, and she's at (x, y). */
function blink(k: MoveKit, x: number, y: number): void {
  const a = k.actor;
  k.layer.add(new AfterImage(snap(k), a.x, a.y, { life: 0.3, pal: 'sakura', a: 0.85 }, k.sp));
  k.layer.add(new SakuraPetals(a.x, a.y - 14, { n: 10, v: 30, dur: 0.9, blossoms: 1 }, k.sp));
  k.layer.add(new CutLine(a.x, a.y - 12, x, y - 12, { w: 2, pal: 'sakura', dur: 0.25 }, k.sp));
  a.x = x;
  a.y = y;
}

/** A blow landing: a pink crescent over a darker one, a blossom of light, petals. */
function sakuraHit(k: MoveKit, t: MoveActor, big = false): void {
  const { x, y } = chest(t), d = k.dir, sp = k.sp;
  k.layer.add(new Vfx('slash', x - d * 3, y + 1, { r: big ? 28 : 21, a: d > 0 ? 2.3 : Math.PI - 2.3, sweep: 2.5, dir: -d, w: big ? 10 : 7, pal: 'night', tilt: 0.75, dur: 0.42, shadow: SHADE }, sp));
  k.layer.add(new Vfx('slash', x - d * 2, y, { r: big ? 24 : 18, a: d > 0 ? 2.3 : Math.PI - 2.3, sweep: 2.4, dir: -d, w: big ? 8 : 6, pal: 'sakura', tilt: 0.75, dur: 0.38 }, sp));
  k.layer.add(new SakuraBloom(x, y, { r: big ? 18 : 12, dur: 0.6 }, sp));
}

/** ฟันซากุระ: a blink-step in, one rising diagonal cut. */
async function attack(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir;
  await Promise.all([k.tween(h, { swing: 1.1, leanInto: -0.08 }, 150, 'Quad.easeOut'), k.tween(h.reachFront, { x: 2, y: 4 }, 150, 'Quad.easeOut')]);
  blink(k, t.x - d * (t.half + 16), t.y + 1);
  await k.wait(60);
  const tr = trail(k, 0.22);
  await Promise.all([k.tween(h, { swing: -1.5, leanInto: 0.18 }, 90, 'Cubic.easeIn'), k.tween(h.reachFront, { x: 5, y: -8 }, 90, 'Cubic.easeIn')]);
  tr.release();
  sakuraHit(k, t);
  k.land();
  k.hitStop(50);
  k.shake(80, 0.0016);
  await k.wait(260);
  blink(k, a.home.x, a.home.y);
  await recover(k, 220);
}

/** ไออิ: กลีบจันทร์: the blade lowered, petals gathering - and she's already past the foe; a beat, and the cut blooms. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, t = k.main, d = k.dir, sp = k.sp;
  // the stance: blade low and back, petals drawn in round her, a glint runs up the blade
  await Promise.all([k.tween(h, { swing: 1.5, leanInto: -0.16 }, 260, 'Quad.easeOut'), k.tween(h.reachFront, { x: -4, y: 4 }, 260, 'Quad.easeOut')]);
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 26, w: 2, sq: 0.34, pal: 'sakura', dur: 0.6 }, sp));
  k.layer.add(new SakuraPetals(a.x, a.y - 14, { n: 16, v: -30, dur: 0.6, spread: Math.PI * 2, wind: 0, blossoms: 2 }, sp));
  glitter(k.layer, a.x, a.y - 14, { r: 18, n: 8, pal: 'sakura', dur: 0.45, size: 2 }, sp);
  await k.wait(320);
  const g = h.grip, gl = { x: g.x + Math.cos(g.angle) * TIP, y: g.y + Math.sin(g.angle) * TIP };
  k.layer.add(new Vfx('star', gl.x, gl.y, { r: 9, pal: 'sakura', dur: 0.3 }, sp));
  await k.wait(120);
  // the draw: she's past the foe, blade out level behind her, one long white line through it
  const c = chest(t), from = { x: a.x, y: a.y };
  blink(k, t.x + d * (t.half + 22), t.y + 1);
  h.bothHands = false;
  h.swing = -0.15;
  h.reachFront.x = 9;
  h.reachFront.y = -2;
  h.leanInto = 0.24;
  k.layer.add(new CutLine(from.x + d * 6, c.y, a.x + d * 10, c.y - 2, { w: 4, pal: 'sakura', dur: 0.75, shadow: SHADE }, sp));
  k.flash(50, 0xffe6f0);
  // a heartbeat of stillness...
  await k.wait(380);
  // ...and the cut blooms
  sakuraHit(k, t, true);
  k.layer.add(new SakuraBloom(c.x, c.y, { r: 26, dur: 0.8 }, sp));
  k.layer.add(new CurvedCut(c.x - d * 26, c.y - 6, c.x + d * 26, c.y + 4, { bend: 6, w: 5, dur: 0.5, pal: 'sakura', shadow: SHADE }, sp));
  k.flash(90, 0xffb8d4);
  k.land();
  k.hitStop(80);
  k.shake(160, 0.0028);
  await k.wait(420);
  blink(k, a.home.x, a.home.y);
  await recover(k, 240);
}

/** พายุกลีบซากุระ: she whirls, and a gale of petals sweeps over every foe. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp, ts = k.targets.length ? k.targets : [k.main];
  h.bothHands = false;
  // the whirl: two turns of the blade, petals torn off it, a ring at her feet
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 30, w: 3, sq: 0.34, pal: 'sakura', dur: 0.6 }, sp));
  const tr = trail(k, 0.35);
  await Promise.all([k.tween(h, { swing: Math.PI * 4 + 0.4, leanInto: 0.1 }, 520, 'Sine.easeInOut'), k.tween(h.reachFront, { x: 6, y: -4 }, 520, 'Sine.easeInOut')]);
  tr.release();
  h.swing = 0.4;
  k.layer.add(new SakuraPetals(a.x + d * 10, a.y - 16, { n: 22, v: 60, dir: d > 0 ? 0 : Math.PI, spread: 1.4, dur: 0.9 }, sp));
  // the gale over every foe
  const xs = ts.map((t) => t.x), ys = ts.map((t) => t.y);
  const back = d > 0 ? Math.max(...xs) : Math.min(...xs);
  let landed = false;
  const hits = ts.map((t) => ({ x: t.x - d * 6, cb: () => {
    const c = chest(t);
    k.layer.add(new CurvedCut(c.x - d * 16, c.y - 10, c.x + d * 16, c.y + 8, { bend: 6 * d, w: 4, dur: 0.4, pal: 'sakura', shadow: SHADE }, sp));
    k.layer.add(new CurvedCut(c.x - d * 16, c.y + 8, c.x + d * 16, c.y - 10, { bend: -6 * d, w: 4, dur: 0.4, delay: 0.06, pal: 'sakura', shadow: SHADE }, sp));
    k.layer.add(new SakuraBloom(c.x, c.y, { r: 11, dur: 0.5 }, sp));
    if (!landed) {
      landed = true;
      k.land();
    }
    k.shake(50, 0.0014);
  } }));
  await new Promise<void>((done) => k.layer.add(new PetalGale(a.x + d * 14, back + d * 40, Math.min(...ys) - 22, Math.max(...ys) + 6, { dur: 0.75, hits: [...hits, { x: back + d * 36, cb: () => done() }] }, sp)));
  await k.wait(450);
  await recover(k, 260);
}

/** ดาราซากุระพันคม: night, the sakura constellation, she vanishes - a thousand frozen cuts - she sheathes, and all bloom. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp, ts = k.targets.length ? k.targets : [k.main];
  const view = k.layer.view;
  await k.dim(0.62, 300, 0x0a0618);
  // the stars come out and join into a sakura over the foes
  const xs = ts.map((t) => t.x), ys = ts.map((t) => t.y);
  const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.max(view.y + 42, Math.min(...ys) - 50) };
  k.layer.add(new SakuraConstellation(view, mid, 30, { dur: 3.6 }, sp));
  // the blade raised to it, a star at its point
  await Promise.all([k.tween(h, { swing: -0.6, leanInto: -0.12 }, 320, 'Quad.easeOut'), k.tween(h.reachFront, { x: 1, y: -10 }, 320, 'Quad.easeOut')]);
  const g = h.grip, gl = { x: g.x + Math.cos(g.angle) * TIP, y: g.y + Math.sin(g.angle) * TIP };
  k.layer.add(new Vfx('star', gl.x, gl.y, { r: 14, pal: 'sakura', dur: 0.6 }, sp));
  k.layer.add(new SakuraPetals(a.x, a.y - 16, { n: 20, v: 30, dur: 1.2, blossoms: 3 }, sp));
  await k.wait(700);
  // she vanishes - after-images flash about the foes while the cuts appear frozen in the air
  k.layer.add(new AfterImage(snap(k), a.x, a.y, { life: 0.35, pal: 'sakura', a: 0.9 }, sp));
  h.root.setAlpha(0);
  const ghost = snap(k), home = { x: a.x, y: a.y };
  const RELEASE = 1.25;
  let landed = false;
  const release = new Promise<void>((done) =>
    k.layer.add(new FrozenCuts(ts.map(chest), { n: 6 + ts.length * 5, every: 0.04, reach: 30, releaseAt: RELEASE, onRelease: () => done() }, sp)));
  for (let i = 0; i < 9; i++) {
    void k.wait(60 + i * 75).then(() => {
      const t = ts[i % ts.length], side = i % 2 ? 1 : -1;
      k.layer.add(new AfterImage(ghost, t.x + side * (t.half + 12) + (Math.random() - 0.5) * 8, t.y + (Math.random() - 0.5) * 8, { life: 0.22, pal: i % 3 ? 'sakura' : 'violet', a: 0.9 }, sp));
    });
  }
  k.shake(900, 0.001);
  await k.wait(820);
  // home again, the blade drawn back level - and slid into its sheath
  a.x = home.x;
  a.y = home.y;
  h.bothHands = false;
  h.swing = 0.1;
  h.reachFront.x = 8;
  h.reachFront.y = -2;
  h.root.setAlpha(1);
  k.layer.add(new Vfx('ring', a.x, a.y - 14, { r: 14, w: 2, pal: 'sakura', dur: 0.3 }, sp));
  void k.tween(h, { swing: 1.4, leanInto: -0.06 }, 300, 'Cubic.easeIn');
  void k.tween(h.reachFront, { x: -3, y: 3 }, 300, 'Cubic.easeIn');
  await release;
  // every cut blooms at once
  k.flash(130, 0xffe6f0);
  k.shake(300, 0.0036);
  ts.forEach((t, i) => {
    const c = chest(t);
    k.layer.add(new SakuraBloom(c.x, c.y, { r: 22, dur: 0.8, delay: i * 0.04 }, sp));
    k.layer.add(new Vfx('slash', c.x, c.y, { r: 26, a: d > 0 ? 2.3 : Math.PI - 2.3, sweep: 2.6, dir: -d, w: 9, pal: 'sakura', tilt: 0.7, dur: 0.45, delay: i * 0.04, shadow: SHADE }, sp));
    if (!landed) {
      landed = true;
      k.land();
      k.hitStop(90);
    }
  });
  k.layer.add(new SakuraPetals(mid.x, mid.y, { n: 60, v: 90, dur: 1.8, wind: 14, blossoms: 8 }, sp));
  await k.wait(1100);
  void k.dim(0, 400);
  await recover(k, 280);
}

export const ASTRAEA: HeroMoves = { attack, skill1, skill2, ult };
