import { StarBurst } from '../../fx/effects/blaze';
import { EnergyArc, Gear, PowerArrows, Sparks, SteamPuff } from '../../fx/effects/steam';
import { glitter, Vfx } from '../../fx/effects/vfx';
import type { HeroMoves, MoveActor, MoveKit } from './kit';

// Pip, the steam engineer: his hammer (redrawn after the owner's: a dark iron head banded in orange, a green core), and his
// workshop - sparks off the hammer, puffs of steam, brass gears turning, power crackling into his friends.
//   attack  - ทุบค้อน: he runs in, swings the hammer up over his shoulder and brings it down on the foe - sparks flying, a
//             puff of steam, a ring on the ground.
//   skill 1 - จูนเครื่อง: the hammer's core glows green; he taps it on the ground and a brass gear spins off it to his
//             friend - gears turning round it, chevrons of power rising, a breath of steam at its feet.
//   skill 2 - เทอร์โบไอน้ำ: he strikes the ground and steam bursts out round him; a jet of steam roars up under every
//             friend, a little gear whirring over each, and they're off faster.
//   ult     - โอเวอร์โหลด: the field dims; a great brass gear rises behind him, a smaller one turning against it; he
//             raises the hammer, its core blazing, and slams it down - a ring of force, steam bursting out, sparks - and
//             arcs of power crackle from the hammer into every friend, each one charged up.

/** From his hand to the middle of the hammer's head (world px: 24 art rows up steamhammer.png, shown at half). */
const HEAD = 12;

const chest = (t: MoveActor) => ({ x: t.x, y: t.y - t.h * 0.55 - t.alt });

/** The middle of the hammer's head now. */
function head(k: MoveKit): { x: number; y: number } {
  const g = k.actor.hero!.grip;
  return { x: g.x + Math.cos(g.angle) * HEAD, y: g.y + Math.sin(g.angle) * HEAD };
}

/** The hammer swung up over his shoulder. */
function windUp(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: -1.4, leanInto: -0.16 }, ms, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: -3, y: -8 }, ms, 'Quad.easeOut'),
  ]);
}

/** And brought down. */
function slam(k: MoveKit, ms: number): Promise<unknown> {
  const h = k.actor.hero!;
  return Promise.all([
    k.tween(h, { swing: 1.45, leanInto: 0.26 }, ms, 'Cubic.easeIn'),
    k.tween(h.reachFront, { x: 6, y: 3 }, ms, 'Cubic.easeIn'),
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

/** The hammer meets the ground (or a foe) at `p`: sparks, steam, a ring. */
function impact(k: MoveKit, p: { x: number; y: number }, groundY: number, big = false): void {
  const sp = k.sp;
  k.layer.add(new Sparks(p.x, p.y, { n: big ? 26 : 16, v: big ? 80 : 60, dur: 0.6 }, sp));
  k.layer.add(new SteamPuff(p.x, p.y, { r: big ? 8 : 6, n: big ? 8 : 5, far: big ? 26 : 16, spread: 1.4, dur: 0.8 }, sp));
  k.ground.add(new Vfx('ring', p.x, groundY, { r: big ? 34 : 20, w: 3, sq: 0.34, pal: 'brass', dur: 0.5 }, sp));
  k.layer.add(new StarBurst(p.x, p.y, { r: big ? 16 : 11, dur: 0.6 }, sp));
}

/** A friend charged up: chevrons of power rising, gears turning round it, a breath of steam at its feet. */
function charged(k: MoveKit, t: MoveActor, pal: 'fire' | 'steam' = 'fire', gears = 3): void {
  const sp = k.sp;
  k.layer.add(new PowerArrows(t.x, t.y, t.half * 2 + 6, t.h + 8, { dur: 1.0, pal, n: 6 }, sp));
  k.ground.add(new Vfx('ring', t.x, t.y, { r: 18, w: 2, sq: 0.34, pal: 'brass', dur: 0.6 }, sp));
  k.layer.add(new SteamPuff(t.x - 6, t.y, { r: 4, n: 3, far: 8, dir: Math.PI, spread: 0.6, rise: 6, dur: 0.6 }, sp));
  k.layer.add(new SteamPuff(t.x + 6, t.y, { r: 4, n: 3, far: 8, dir: 0, spread: 0.6, rise: 6, dur: 0.6 }, sp));
  const c = chest(t);
  for (let i = 0; i < gears; i++) {
    const a0 = (i / gears) * Math.PI * 2, born = k.scene.time.now;
    const at = () => {
      const a = a0 + ((k.scene.time.now - born) / 1000) * 3 * sp;
      return { x: c.x + Math.cos(a) * (t.half + 9), y: c.y + Math.sin(a) * 6 };
    };
    k.layer.add(new Gear(at, 3, { teeth: 6, dur: 0.9, spin: i % 2 ? -1.6 : 1.6 }, sp));
  }
  glitter(k.layer, c.x, c.y, { r: t.half + 4, n: 6, pal: 'brass', dur: 0.6, size: 2, rise: -16 }, sp);
}

/** ทุบค้อน: runs in, the hammer up over his shoulder and down on the foe. */
async function attack(k: MoveKit): Promise<void> {
  const a = k.actor, t = k.main, d = k.dir;
  k.ground.add(new Vfx('dust', a.x, a.y, { r: 12, pal: 'smoke', dur: 0.5 }, k.sp));
  void windUp(k, 220);
  await k.moveTo(a, t.x - d * (t.half + 14), t.y + 1, 240, 'Quad.easeIn');
  await k.wait(60);
  await slam(k, 90);
  const p = head(k), c = chest(t);
  impact(k, { x: (p.x + c.x) / 2, y: Math.max(p.y, c.y) }, t.y);
  k.land();
  k.hitStop(50);
  k.shake(90, 0.002);
  await k.wait(240);
  void recover(k, 240);
  await k.moveTo(a, a.home.x, a.home.y, 300);
}

/** จูนเครื่อง: the core glows, a tap on the ground, a gear spins off to his friend - who's charged up. */
async function skill1(k: MoveKit): Promise<void> {
  const a = k.actor, t = k.main, sp = k.sp, h = a.hero!;
  await Promise.all([k.tween(h, { swing: -0.5, leanInto: -0.08 }, 180, 'Quad.easeOut'), k.tween(h.reachFront, { x: 0, y: -6 }, 180, 'Quad.easeOut')]);
  k.layer.add(new Vfx('star', head(k).x, head(k).y, { r: 9, pal: 'mint', dur: 0.4 }, sp));
  glitter(k.layer, head(k).x, head(k).y, { r: 8, n: 5, pal: 'mint', dur: 0.3, size: 2 }, sp);
  await k.wait(200);
  // the tap
  await Promise.all([k.tween(h, { swing: 0.9, leanInto: 0.12 }, 90, 'Cubic.easeIn'), k.tween(h.reachFront, { x: 4, y: 2 }, 90, 'Cubic.easeIn')]);
  const p = head(k);
  k.layer.add(new Sparks(p.x, p.y, { n: 10, v: 45, dur: 0.45 }, sp));
  k.ground.add(new Vfx('ring', p.x, a.y, { r: 14, w: 2, sq: 0.34, pal: 'brass', dur: 0.4 }, sp));
  // a gear spins off to the friend
  const from = { ...p }, to = chest(t), born = k.scene.time.now, flight = 380;
  const at = () => {
    const u = Math.min(1, (k.scene.time.now - born) / (flight / sp));
    return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - 22 * Math.sin(Math.PI * u) };
  };
  k.layer.add(new Gear(at, 4, { teeth: 7, dur: flight / 1000 + 0.15, spin: 3 }, sp));
  await k.wait(flight);
  charged(k, t, 'fire', 3);
  k.layer.add(new Vfx('lines', to.x, to.y, { r: 22, dir: k.dir, pal: 'brass', n: 6 }, sp));
  k.land();
  await k.wait(500);
  await recover(k, 260);
}

/** เทอร์โบไอน้ำ: a strike on the ground, steam bursting out - a jet of steam under every friend, and off they go. */
async function skill2(k: MoveKit): Promise<void> {
  const a = k.actor, sp = k.sp, ts = k.targets.length ? k.targets : [k.main];
  await windUp(k, 200);
  await k.wait(60);
  await slam(k, 90);
  const p = head(k);
  impact(k, p, a.y);
  k.layer.add(new SteamPuff(a.x, a.y, { r: 9, n: 8, far: 24, dir: Math.PI, spread: 0.8, rise: 14, dur: 0.9 }, sp));
  k.layer.add(new SteamPuff(a.x, a.y, { r: 9, n: 8, far: 24, dir: 0, spread: 0.8, rise: 14, dur: 0.9 }, sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 60, w: 3, sq: 0.34, pal: 'steam', dur: 0.7 }, sp));
  k.shake(110, 0.002);
  await k.wait(160);
  let landed = false;
  ts.forEach((t, i) => {
    const delay = i * 0.07;
    k.layer.add(new SteamPuff(t.x, t.y, { r: 6, n: 7, far: 6, dir: -Math.PI / 2, spread: 0.5, rise: 26, dur: 0.8, delay }, sp));
    k.layer.add(new PowerArrows(t.x, t.y, t.half * 2 + 4, t.h + 6, { dur: 0.9, pal: 'steam', n: 5, delay }, sp));
    const c = chest(t);
    k.layer.add(new Gear(() => ({ x: c.x, y: t.y - t.h - 8 }), 3.5, { teeth: 6, dur: 0.9, spin: 4, delay }, sp));
    void k.wait(delay * 1000).then(() => {
      k.layer.add(new Vfx('lines', c.x, c.y, { r: 20, dir: k.dir, pal: 'steam', n: 6 }, sp));
      if (!landed) {
        landed = true;
        k.land();
      }
    });
  });
  await k.wait(ts.length * 70 + 650);
  await recover(k, 260);
}

/** โอเวอร์โหลด: gears rise behind him, the hammer slammed down - arcs of power into every friend. */
async function ult(k: MoveKit): Promise<void> {
  const a = k.actor, d = k.dir, sp = k.sp, ts = k.targets.length ? k.targets : [k.main], h = a.hero!;
  await k.dim(0.5, 260, 0x1a0a04);
  // a great brass gear rising behind him, a smaller one turning against it
  // (up behind his back, clear of him: the effects layer is in front of the fighters)
  const big = () => ({ x: a.x - d * 16, y: a.y - 54 }), small = () => ({ x: a.x - d * 16 + d * 25, y: a.y - 70 });
  k.layer.add(new Gear(big, 16, { teeth: 12, dur: 2.9, spin: 0.4 }, sp));
  k.layer.add(new Gear(small, 8, { teeth: 8, dur: 2.8, spin: -0.8, delay: 0.1 }, sp));
  k.layer.add(new SteamPuff(a.x - d * 16, a.y - 40, { r: 7, n: 6, far: 18, dir: -Math.PI / 2, spread: 1.2, rise: 16, dur: 1.0 }, sp));
  // the hammer raised, its core blazing
  await Promise.all([
    k.tween(h, { swing: -0.35, leanInto: -0.12 }, 320, 'Quad.easeOut'),
    k.tween(h.reachFront, { x: 0, y: -11 }, 320, 'Quad.easeOut'),
  ]);
  const top = head(k);
  k.layer.add(new Vfx('star', top.x, top.y, { r: 14, pal: 'mint', dur: 0.7 }, sp));
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    k.layer.add(new EnergyArc(() => head(k), () => ({ x: head(k).x + Math.cos(ang) * 16, y: head(k).y + Math.sin(ang) * 12 }), { dur: 0.5, pal: 'mint', jag: 3, delay: i * 0.08 }, sp));
  }
  k.shake(400, 0.0012);
  await k.wait(560);
  // slammed down
  await windUp(k, 120);
  await slam(k, 90);
  const p = head(k);
  impact(k, p, a.y, true);
  k.layer.add(new SteamPuff(a.x, a.y, { r: 8, n: 7, far: 34, dir: Math.PI, spread: 0.8, rise: 18, dur: 1.0 }, sp));
  k.layer.add(new SteamPuff(a.x, a.y, { r: 8, n: 7, far: 34, dir: 0, spread: 0.8, rise: 18, dur: 1.0 }, sp));
  k.ground.add(new Vfx('ring', a.x, a.y, { r: 80, w: 4, sq: 0.34, pal: 'fire', dur: 0.8 }, sp));
  k.flash(100, 0xffc070);
  k.shake(220, 0.0032);
  await k.wait(120);
  // arcs of power into every friend
  let landed = false;
  ts.forEach((t, i) => {
    const delay = i * 0.07;
    k.layer.add(new EnergyArc(() => head(k), () => chest(t), { dur: 0.5, pal: 'fire', jag: 7, delay }, sp));
    void k.wait(delay * 1000 + 80).then(() => {
      charged(k, t, 'fire', 3);
      k.layer.add(new Vfx('aura', t.x, t.y, { r: t.half + 6, h: t.h + 6, pal: 'fire', dur: 0.8 }, sp));
      if (!landed) {
        landed = true;
        k.land();
      }
    });
  });
  await k.wait(ts.length * 70 + 1000);
  void k.dim(0, 400);
  await recover(k, 300);
}

export const PIP: HeroMoves = { attack, skill1, skill2, ult };
