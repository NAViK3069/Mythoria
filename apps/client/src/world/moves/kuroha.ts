import { AfterImage, type Snap } from '../../fx/effects/shadow';
import { EnergyArc } from '../../fx/effects/steam';
import { FlyingStar, LightningStrike, StormVortex, VortexBurst } from '../../fx/effects/storm';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Kuroha, the ninja of violet lightning: her giant shuriken (held by its hub; thrown, it comes spinning back to her
// hand), a ninja's tricks - after-images, a puff of smoke and she's gone - and the storm in it.
//   attack  - ดาวกระจาย: she draws the star back and whips it at the foe in front - it strikes in a vortex of light and
//             comes spinning home.
//   skill 1 - ดาวสายฟ้า: lightning gathers in the star; she springs up and hurls it down at any foe - the star bites, a
//             bolt of violet lightning comes down on it, a great vortex bursts.
//   skill 2 - พายุดาวกระจาย: she spins, the star blurring in her hand, and a storm of small stars fans out of it at every
//             foe, after-images of her left behind.
//   ult     - วังวนสายฟ้าทมิฬ: the field goes dark violet; lightning crackles round her, a bolt strikes her and she's a streak
//             of lightning shooting up - flashing back in high in the air she throws the giant star to hang over the foes - it spins up a storm vortex, lightning lashing down on every one of
//             them, bolts from the sky - and bursts; it comes home and she drops back down.

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });
const snap = (k: MoveKit): Snap => k.actor.hero!.snapshot();
const frame = (k: MoveKit) => `weapon_${k.actor.unit.look}`;

/** Where the star is held (its hub, in her hand). */
const hand = (k: MoveKit) => ({ x: k.actor.hero!.grip.x, y: k.actor.hero!.grip.y });

/** The star drawn back behind her. */
function windUp(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: -1.2, leanInto: -0.14, gearSpin: -2 }, ms, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -5, y: -3 }, ms, 'Quad.easeOut'),
  ]);
}

/** And whipped forward (the hand follows through). */
function whip(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0.9, leanInto: 0.2 }, ms, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 7, y: -2 }, ms, 'Cubic.easeIn'),
  ]);
}

function recover(k: MoveKit, ms = 240): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 0, swingBack: 0, leanInto: 0, gearSpin: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachFront, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(h.reachBack, { x: 0, y: 0 }, ms, 'Sine.easeInOut'),
    k.tween(k.actor, { alt: 0 }, ms, 'Sine.easeInOut'),
  ]).then(() => {
    h.gearShown = true;
    h.gearSpin = 0;
    k.regrip();
  });
}

/** Throw the held star at `to`: it leaves her hand (hidden there) and comes home. Resolves when it strikes; `home`
 * when it's back. */
function hurl(k: MoveKit, to: () => { x: number; y: number }, o: { dur?: number; size?: number; arc?: number; hold?: number; spin?: number; onHit?: () => void } = {}): { hit: Promise<void>; home: Promise<void> } {
  const h = k.actor.hero!;
  let hitDone!: () => void, homeDone!: () => void;
  const hit = new Promise<void>((r) => (hitDone = r)), home = new Promise<void>((r) => (homeDone = r));
  h.gearShown = false;
  k.layer.add(new FlyingStar(k.scene, frame(k), () => hand(k), to, {
    dur: o.dur ?? 0.22, size: o.size ?? 1, arc: o.arc ?? 6, hold: o.hold, spin: o.spin ?? 4, back: true, backDur: 0.28,
    onHit: () => {
      o.onHit?.();
      hitDone();
    },
    onBack: () => {
      h.gearShown = true;
      k.layer.add(new Vfx('star', hand(k).x, hand(k).y, { r: 6, pal: 'void', dur: 0.25 }, k.sp));
      homeDone();
    },
  }, k.sp));
  return { hit, home };
}

/** A foe struck by a star: the vortex burst, sparks of lightning. */
function struck(k: MoveKit, t: MoveActor, r = 12): void {
  const c = chest(t);
  k.layer.add(new VortexBurst(c.x, c.y, { r, dur: 0.6 }, k.sp));
  glitter(k.layer, c.x, c.y, { r: t.half + 4, n: 5, pal: 'volt', dur: 0.35, size: 2 }, k.sp);
}

/** ดาวกระจาย: drawn back and whipped at the foe in front - a vortex of light - and it comes spinning home. */
async function attack(k: MoveKit): Promise<void> {
  const t = k.main;
  await windUp(k, 170);
  void whip(k, 70);
  await k.wait(50);
  const { hit, home } = hurl(k, () => chest(t), { dur: 0.2 });
  await hit;
  struck(k, t);
  k.land();
  k.shake(70, 0.0014);
  await home;
  await recover(k, 220);
}

/** ดาวสายฟ้า: lightning in the star, a spring into the air, hurled down - a bolt from the sky and a great vortex. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, t = k.main, h = a.hero!, sp = k.sp;
  // lightning gathering in the star
  await Promise.all([k.tween(h, { swing: -0.4, gearSpin: 6 }, 380, 'Sine.easeIn'), k.tween(h.reachFront, { x: 2, y: -6 }, 380, 'Sine.easeIn')]);
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.3;
    k.layer.add(new EnergyArc(() => hand(k), () => ({ x: hand(k).x + Math.cos(ang) * 14, y: hand(k).y + Math.sin(ang) * 10 }), { dur: 0.35, pal: 'void', jag: 3, delay: i * 0.06 }, sp));
  }
  k.layer.add(new Vfx('star', hand(k).x, hand(k).y, { r: 10, pal: 'volt', dur: 0.4 }, sp));
  await k.wait(200);
  // the spring
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 12, pal: 'smoke', dur: 0.5 }, sp));
  k.layer.add(new AfterImage(snap(k), a.x, a.y, { life: 0.3, pal: 'violet' }, sp));
  await Promise.all([k.tween(a, { alt: 26 }, 200, 'Quad.easeOut'), windUp(k, 200)]);
  void whip(k, 70);
  await k.wait(50);
  const { hit, home } = hurl(k, () => chest(t), { dur: 0.2, size: 1.35, arc: -4, spin: 6 });
  await hit;
  k.layer.add(new LightningStrike(t.x, t.y, { h: 140, dur: 0.45 }, sp));
  struck(k, t, 20);
  k.flash(80, 0xc8a0ff);
  k.land();
  k.hitStop(50);
  k.shake(140, 0.0026);
  void k.tween(a, { alt: 0 }, 260, 'Quad.easeIn');
  await home;
  await recover(k, 220);
}

/** พายุดาวกระจาย: she spins, and a storm of small stars fans out at every foe. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, sp = k.sp, ts = k.targets.length ? k.targets : [k.main];
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 22, w: 2, sq: 0.34, pal: 'void', dur: 0.5 }, sp));
  // the spin: the star blurring in her hand, after-images of her
  const spin = k.tween(h, { gearSpin: Math.PI * 8, swing: 0.6 }, 520, 'Quad.easeIn');
  for (let i = 0; i < 4; i++) void k.wait(i * 110).then(() => k.layer.add(new AfterImage(snap(k), a.x, a.y, { life: 0.3, pal: i % 2 ? 'void' : 'violet', a: 0.8 }, sp)));
  await spin;
  void whip(k, 80);
  // the storm of stars: three to each foe, fanning out
  let landed = false;
  ts.forEach((t, i) => {
    for (let j = 0; j < 3; j++) {
      const off = (j - 1) * 7, delay = i * 0.05 + j * 0.06;
      k.layer.add(new FlyingStar(k.scene, frame(k), () => hand(k), () => ({ x: chest(t).x + off * 0.4, y: chest(t).y + off }), {
        dur: 0.22, size: 0.45, arc: (j - 1) * 18, spin: 6, delay,
        onHit: () => {
          k.layer.add(new VortexBurst(chest(t).x, chest(t).y + off, { r: 7, dur: 0.45 }, sp));
          if (!landed) {
            landed = true;
            k.land();
          }
          if (j === 2) k.shake(50, 0.0014);
        },
      }, sp));
    }
  });
  await k.wait(ts.length * 50 + 600);
  await recover(k, 240);
}

/** วังวนสายฟ้าทมิฬ: dark violet, a lightning blink up into the air - the giant star spins a storm over the foes and bursts. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, h = a.hero!, d = k.dir, sp = k.sp, ts = k.targets.length ? k.targets : [k.main];
  await k.dim(0.55, 260, 0x12061e);
  // lightning crackling round her as she crouches
  await Promise.all([k.tween(h, { leanInto: -0.18, swing: -0.6, gearSpin: 4 }, 260, 'Quad.easeOut'), k.tween(h.reachFront, { x: -2, y: 2 }, 260, 'Quad.easeOut')]);
  const body = () => ({ x: a.x, y: a.y - a.alt - 14 });
  for (let i = 0; i < 5; i++) {
    const ang = -Math.PI / 2 + (i - 2) * 0.7;
    k.layer.add(new EnergyArc(body, () => ({ x: a.x + Math.cos(ang) * 18, y: a.y - 14 + Math.sin(ang) * 16 }), { dur: 0.3, pal: 'void', jag: 4, delay: i * 0.05 }, sp));
  }
  await k.wait(260);
  // the blink: a bolt strikes her, she's a streak of lightning shooting up...
  const from = { x: a.x, y: a.y - 14 }, apex = { x: a.x + d * 26, y: a.y, alt: 46 };
  k.layer.add(new LightningStrike(a.x, a.y, { h: 130, dur: 0.35 }, sp));
  k.layer.add(new AfterImage(snap(k), a.x, a.y, { life: 0.35, pal: 'violet', a: 0.9 }, sp));
  k.flash(60, 0xd8b8ff);
  h.root.setAlpha(0);
  void windUp(k, 120);
  k.layer.add(new EnergyArc(() => from, () => ({ x: apex.x, y: apex.y - apex.alt - 14 }), { dur: 0.22, pal: 'void', jag: 8 }, sp));
  await k.wait(110);
  // ...and flashes back in up in the air, the star already drawn back
  a.x = apex.x;
  a.alt = apex.alt;
  const top = body();
  // (a ring of crackle round her, not a flash over her - she must be seen arriving)
  k.layer.add(new Vfx('ring', top.x, top.y, { r: 16, w: 2, pal: 'void', dur: 0.35 }, sp));
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    k.layer.add(new EnergyArc(body, () => ({ x: a.x + Math.cos(ang) * 16, y: a.y - a.alt - 14 + Math.sin(ang) * 14 }), { dur: 0.25, pal: 'void', jag: 3, delay: i * 0.03 }, sp));
  }
  h.root.setAlpha(1);
  await k.wait(40);
  // the giant star thrown to hang over the foes
  const xs = ts.map((t) => t.x), ys = ts.map((t) => t.y);
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.max(k.layer.view.y + 40, Math.min(...ys) - 46) };
  void whip(k, 80);
  await k.wait(50);
  const HOLD = 1.5;
  let landed = false;
  const { hit, home } = hurl(k, () => centre, { dur: 0.3, size: 2.6, arc: 10, hold: HOLD, spin: 3 });
  // she comes back down while it flies, after-images trailing her
  void (async () => {
    for (let i = 0; i < 4; i++) void k.wait(i * 80).then(() => k.layer.add(new AfterImage(snap(k), a.x, a.y - a.alt, { life: 0.28, pal: i % 2 ? 'void' : 'violet', a: 0.7 }, sp)));
    void k.moveTo(a, a.home.x, a.home.y, 320, 'Quad.easeIn');
    await k.tween(a, { alt: 0 }, 320, 'Quad.easeIn');
    k.ground.add(new Vfx('dust', a.x, a.y, { r: 14, pal: 'smoke', dur: 0.5 }, sp));
    k.ground.add(new Vfx('ring', a.x, a.y, { r: 16, w: 2, sq: 0.34, pal: 'void', dur: 0.4 }, sp));
  })();
  await hit;
  k.layer.add(new StormVortex(centre.x, centre.y, 40, () => ts.map(chest), { dur: HOLD }, sp));
  k.shake(HOLD * 1000, 0.0012);
  // bolts from the sky on every one of them
  ts.forEach((t, i) => {
    k.layer.add(new LightningStrike(t.x, t.y, { h: 150, dur: 0.4, delay: 0.25 + i * 0.18, onHit: () => {
      struck(k, t, 10);
      if (!landed) {
        landed = true;
        k.land();
      }
    } }, sp));
  });
  await k.wait(HOLD * 1000 - 80);
  // it bursts
  k.layer.add(new VortexBurst(centre.x, centre.y, { r: 42, dur: 0.8 }, sp));
  ts.forEach((t, i) => k.layer.add(new VortexBurst(chest(t).x, chest(t).y, { r: 14, dur: 0.6, delay: 0.05 + i * 0.04 }, sp)));
  k.flash(110, 0xd8b8ff);
  k.shake(240, 0.0032);
  await home;
  void k.dim(0, 400);
  await recover(k, 300);
}

export const KUROHA: HeroMoves = { attack, skill1, skill2, ult };
