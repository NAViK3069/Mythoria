import * as Phaser from 'phaser';
import { insideFeet as inside, T, TILE, vertexAt, type Footprint, type MeadowMap, type Placed } from './meadowMap';

// The animals living on the maps - cats, squirrels and sparrows - each put together from parts cut from its
// picture (tools/animal_parts.py → the 'animals' atlas) and moved a whole pixel at a time:
//  * cats wander near their spot, stand with the tail swaying, sit (tail swishing, blinking), curl up and
//    sleep (breathing, little z's); they turn to look at you, and step away if you walk right into them.
//  * squirrels keep to their tree: they bound about, sit up nibbling, flick the tail, and when you come
//    close they dash to the tree, run up the trunk and hide in it for a while.
//  * sparrows hop and peck in little flocks and all fly off together when you come near (or now and then).
// All the pictures face left; an animal facing right is drawn mirrored.

const TAU = Math.PI * 2;
type Free = (x: number, y: number) => boolean;
/** Where a body w wide, h tall standing at (x, y) goes in the draw order (MeadowView.depthFor). */
type Sort = (x: number, y: number, w: number, h: number) => number;

/** Px between the bottom of each picture's canvas and its feet (measured off the atlas). */
const FEET = { stand: 2, sit: 0, sleep: 1, squirrel: 1, sparrow: 0 };
const COATS = ['ginger', 'grey', 'black', 'cream', 'brown'];

const rnd = (seed: number) => {
  let s = Math.floor(seed * 9973) % 2147483647 || 1;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 8; i++) next(); // small seeds start out small: let it run in
  return next;
};

/** A body on the map: its parts in a container, a soft shadow under it. */
class Body {
  x: number;
  y: number;
  /** Height above the ground (px). */
  alt = 0;
  /** -1 faces left (as drawn), 1 right. */
  facing: 1 | -1 = -1;
  readonly root: Phaser.GameObjects.Container;
  readonly shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, shadow: string, readonly parts: Phaser.GameObjects.Image[], feet: number, private readonly size: [number, number], private readonly sort: Sort) {
    this.x = x;
    this.y = y;
    for (const p of parts) p.setOrigin(0.5, 1).setPosition(0, feet);
    this.root = scene.add.container(x, y, parts);
    this.shadow = scene.add.image(x, y, shadow).setAlpha(0.26).setDepth(1.4);
  }

  /** Put a part at a whole-pixel offset (feet: the picture's own feet line). */
  at(i: number, dx: number, dy: number, feet: number): void {
    this.parts[i].setPosition(dx, feet + dy);
  }

  /** Draw it where it is, sorted among the pictures by where its feet are on the ground (a bird in the air
   * by the spot under it); depth: a fixed place in the order instead. */
  place(depth?: number): void {
    this.root.setPosition(this.x, this.y - this.alt).setDepth(depth ?? this.sort(this.x, this.y, this.size[0], this.size[1] + this.alt));
    this.root.scaleX = this.facing < 0 ? 1 : -1;
    this.shadow.setPosition(this.x, this.y).setScale(Math.max(0.4, 1 - this.alt / 30));
  }

  show(on: boolean): void {
    this.root.setVisible(on);
    this.shadow.setVisible(on);
  }
}

// ---------------------------------------------------------------- cats

type CatState = 'stand' | 'walk' | 'sit' | 'sleep';
const C_TAIL = 0, C_LEGFF = 1, C_LEGBF = 2, C_BODY = 3, C_HEAD = 4, C_LEGFN = 5, C_LEGBN = 6;

class Cat {
  readonly b: Body;
  private state: CatState = 'sit';
  private timer: number;
  private phase = 0;
  private speed = 16;
  private target = { x: 0, y: 0 };
  private blink = 0;
  private nextBlink: number;
  private zT = 0;
  private readonly key: string;

  constructor(private readonly scene: Phaser.Scene, readonly home: { x: number; y: number }, coat: string, private readonly seed: number, private readonly free: Free, private readonly r: () => number, sort: Sort) {
    this.key = `cat_${coat}`;
    const img = () => scene.add.image(0, 0, 'animals', `${this.key}_body`);
    this.b = new Body(scene, home.x, home.y, 'an_shadow_m', [img(), img(), img(), img(), img(), img(), img()], FEET.stand, [16, 15], sort);
    this.b.facing = r() < 0.5 ? -1 : 1;
    this.state = (['sit', 'sleep', 'stand'] as CatState[])[Math.floor(r() * 3)];
    this.timer = 2 + r() * 10;
    this.nextBlink = 1 + r() * 4;
  }

  update(dt: number, t: number, px: number, py: number): void {
    const b = this.b, r = this.r;
    const near = Math.hypot(px - b.x, (py - b.y) * 1.3);
    if (this.state === 'sleep') {
      if (near < 12) this.set('sit', 3 + r() * 4); // woken up: sits and looks at you
    } else if (near < 13 && !(this.state === 'walk' && this.speed > 30)) {
      // too close: steps away from you, quickly
      const a = Math.atan2(b.y - py, b.x - px);
      if (this.walkTo(b.x + Math.cos(a) * 34, b.y + Math.sin(a) * 22, 42)) this.state = 'walk';
    } else if (near < 30 && this.state !== 'walk') b.facing = px < b.x ? -1 : 1; // watches you
    else if (near < 30 && this.speed < 30) this.set('sit', 3 + r() * 4); // curious: stops to look

    this.timer -= dt;
    if (this.state === 'walk') this.walk(dt);
    else if (this.timer <= 0) this.decide();
    this.draw(dt, t);
    b.place();
  }

  private set(s: CatState, time: number): void {
    this.state = s;
    this.timer = time;
    this.speed = 16;
  }

  private decide(): void {
    const r = this.r();
    if (this.state === 'sleep') this.set('sit', 3 + this.r() * 5);
    else if (this.state === 'sit') {
      if (r < 0.3) this.set('sleep', 18 + this.r() * 30);
      else if (r < 0.75) this.set('stand', 1.5 + this.r() * 2.5);
      else this.wander();
    } else {
      if (r < 0.5) this.wander();
      else if (r < 0.85) this.set('sit', 5 + this.r() * 9);
      else this.set('stand', 2 + this.r() * 3);
    }
  }

  private wander(): void {
    for (let i = 0; i < 10; i++) {
      const a = this.r() * TAU, d = 16 + this.r() * 44;
      if (this.walkTo(this.home.x + Math.cos(a) * d, this.home.y + Math.sin(a) * d * 0.7, 14 + this.r() * 5)) {
        this.state = 'walk';
        return;
      }
    }
    this.set('sit', 4);
  }

  /** Head for a spot if the way there is clear. */
  private walkTo(x: number, y: number, speed: number): boolean {
    const b = this.b;
    const d = Math.hypot(x - b.x, y - b.y);
    for (let k = 0; k <= d; k += 4) if (!this.free(b.x + ((x - b.x) * k) / d, b.y + ((y - b.y) * k) / d)) return false;
    this.target = { x, y };
    this.speed = speed;
    return true;
  }

  private walk(dt: number): void {
    const b = this.b;
    const dx = this.target.x - b.x, dy = this.target.y - b.y, d = Math.hypot(dx, dy);
    if (d < 1) {
      this.set('stand', 1 + this.r() * 3);
      return;
    }
    const step = Math.min(d, this.speed * dt);
    b.x += (dx / d) * step;
    b.y += (dy / d) * step;
    if (Math.abs(dx) > 0.5) b.facing = dx < 0 ? -1 : 1;
    this.phase += (step / 9) * TAU;
  }

  private draw(dt: number, t: number): void {
    const b = this.b, k = this.key, p = b.parts, s = this.seed;
    const frame = (i: number, f: string) => p[i].setFrame(`${k}_${f}`).setVisible(true);
    const hide = (...is: number[]) => is.forEach((i) => p[i].setVisible(false));
    if (this.state === 'stand' || this.state === 'walk') {
      const walking = this.state === 'walk';
      const ph = this.phase;
      // the body rises a pixel twice a step (gently), and the legs hang from it so they never come apart
      const bob = walking && Math.cos(2 * ph) < -0.6 ? -1 : 0;
      // legs in diagonal pairs: swinging forward (to the left, as drawn) and lifted on the way
      const leg = (i: number, f: string, o: number) => {
        const sn = walking ? Math.sin(ph + o) : 0;
        frame(i, f);
        b.at(i, -Math.round(sn * 1.3), bob + (walking && Math.cos(ph + o) > 0.35 ? -1 : 0), FEET.stand);
      };
      leg(C_LEGFN, 'legFN', 0);
      leg(C_LEGBF, 'legBF', 0);
      leg(C_LEGFF, 'legFF', Math.PI);
      leg(C_LEGBN, 'legBN', Math.PI);
      frame(C_BODY, 'body');
      b.at(C_BODY, 0, bob, FEET.stand);
      // standing, it looks up now and then
      const perk = !walking && Math.sin(t * 0.6 + s * 7) > 0.8 ? -1 : 0;
      frame(C_HEAD, 'head');
      b.at(C_HEAD, 0, bob + perk, FEET.stand);
      const sway = walking ? Math.sin(ph * 0.5 + s) * 1.6 : Math.sin(t * 1.1 + s) * 2.2;
      frame(C_TAIL, `tail${Math.max(-2, Math.min(2, Math.round(sway)))}`);
      b.at(C_TAIL, 0, bob, FEET.stand);
    } else if (this.state === 'sit') {
      hide(C_LEGFF, C_LEGBF, C_LEGFN, C_LEGBN);
      // the tail swishes in spells, rests in between
      const swish = Math.sin(t * 0.35 + s * 3) > -0.2 ? Math.sin(t * 2.6 + s) * 2.4 : 1;
      frame(C_TAIL, `sit_tail${Math.max(-2, Math.min(2, Math.round(swish)))}`);
      b.at(C_TAIL, 0, 0, FEET.sit);
      frame(C_BODY, 'sit_body');
      b.at(C_BODY, 0, 0, FEET.sit);
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blink = 0.14;
        this.nextBlink = 2.5 + this.r() * 4;
      }
      this.blink -= dt;
      frame(C_HEAD, this.blink > 0 ? 'sit_blink' : 'sit_head');
      b.at(C_HEAD, 0, 0, FEET.sit);
    } else {
      hide(C_TAIL, C_LEGFF, C_LEGBF, C_HEAD, C_LEGFN, C_LEGBN);
      // breathing: the upper half rises a pixel, slowly
      frame(C_BODY, (t + s * 5) % 2.8 < 1.2 ? 'sleep1' : 'sleep0');
      b.at(C_BODY, 0, 0, FEET.sleep);
      this.zT -= dt;
      if (this.zT <= 0) {
        this.zT = 2.2 + this.r() * 1.2;
        this.snore();
      }
    }
  }

  /** A little z floating up from a sleeping cat. */
  private snore(): void {
    const b = this.b;
    if (!b.root.visible) return;
    const z = this.scene.add.image(b.x + (b.facing < 0 ? -3 : 3), b.y - 12, 'an_z').setDepth(b.root.depth + 0.01).setAlpha(0);
    this.scene.tweens.add({ targets: z, y: z.y - 9, x: z.x + (b.facing < 0 ? -3 : 3), duration: 1800, ease: 'Sine.easeOut' });
    this.scene.tweens.add({ targets: z, alpha: { from: 0, to: 0.9 }, duration: 450, yoyo: true, hold: 700, onComplete: () => z.destroy() });
  }
}

// ---------------------------------------------------------------- squirrels

type SqState = 'idle' | 'sit' | 'run' | 'climb' | 'hidden' | 'descend';
const S_TAIL = 0, S_LEGB = 1, S_BODY = 2, S_HEAD = 3, S_LEGF = 4;
const CLIMB = 24; // how high up the trunk it goes before it's lost in the leaves

class Squirrel {
  readonly b: Body;
  private state: SqState = 'idle';
  private timer: number;
  private target = { x: 0, y: 0 };
  private speed = 30;
  private hop = 0;
  private flick = 0;
  private fleeing = false;

  constructor(scene: Phaser.Scene, private readonly tree: Placed, private readonly seed: number, private readonly free: Free, private readonly r: () => number, sort: Sort) {
    const img = () => scene.add.image(0, 0, 'animals', 'sq_body');
    const a = r() * TAU;
    this.b = new Body(scene, tree.x + Math.cos(a) * 22, tree.y + 6 + Math.abs(Math.sin(a)) * 10, 'an_shadow_s', [img(), img(), img(), img(), img()], FEET.squirrel, [14, 13], sort);
    if (!free(this.b.x, this.b.y)) (this.b.x = tree.x), (this.b.y = tree.y + 3);
    this.timer = 1 + r() * 4;
  }

  update(dt: number, t: number, px: number, py: number): void {
    const b = this.b, r = this.r;
    const near = Math.hypot(px - b.x, (py - b.y) * 1.3);
    // you came close: off to the tree and up it
    if (near < 36 && !this.fleeing && (this.state === 'idle' || this.state === 'sit' || this.state === 'run')) {
      this.fleeing = true;
      this.runTo(this.tree.x + (r() - 0.5) * 4, this.tree.y + 2, 62, true);
    }
    this.timer -= dt;
    switch (this.state) {
      case 'run':
        this.run(dt);
        break;
      case 'climb':
        b.alt = Math.min(CLIMB, b.alt + 34 * dt);
        b.root.setAlpha(Math.min(1, (CLIMB - b.alt) / 8));
        if (b.alt >= CLIMB) {
          this.state = 'hidden';
          this.timer = 7 + r() * 9;
          b.show(false);
        }
        break;
      case 'hidden':
        if (this.timer <= 0 && Math.hypot(px - b.x, py - b.y) > 60) {
          this.state = 'descend';
          b.show(true);
        }
        break;
      case 'descend':
        b.alt = Math.max(0, b.alt - 20 * dt);
        b.root.setAlpha(Math.min(1, (CLIMB - b.alt) / 8));
        if (b.alt <= 0) {
          this.fleeing = false;
          this.state = 'idle';
          this.timer = 1 + r() * 2;
        }
        break;
      default:
        if (this.timer <= 0) this.decide();
    }
    this.draw(dt, t);
    // on the trunk it is in front of the tree; otherwise where it stands
    b.place(this.state === 'climb' || this.state === 'descend' ? Math.max(b.y, this.tree.y + 1) : undefined);
    b.shadow.setVisible(b.root.visible && b.alt < 4);
  }

  private decide(): void {
    const r = this.r();
    if (this.state === 'idle' && r < 0.4) {
      this.state = 'sit';
      this.timer = 2 + this.r() * 4;
      return;
    }
    if (r < 0.75) {
      for (let i = 0; i < 8; i++) {
        const a = this.r() * TAU, d = 14 + this.r() * 40;
        if (this.runTo(this.tree.x + Math.cos(a) * d, this.tree.y + 4 + Math.abs(Math.sin(a)) * d * 0.6, 26 + this.r() * 10)) return;
      }
    }
    this.state = 'idle';
    this.timer = 1 + this.r() * 3;
  }

  private runTo(x: number, y: number, speed: number, force = false): boolean {
    const b = this.b;
    const d = Math.hypot(x - b.x, y - b.y);
    if (!force) for (let k = 0; k <= d; k += 4) if (!this.free(b.x + ((x - b.x) * k) / d, b.y + ((y - b.y) * k) / d)) return false;
    this.target = { x, y };
    this.speed = speed;
    this.state = 'run';
    return true;
  }

  private run(dt: number): void {
    const b = this.b;
    const dx = this.target.x - b.x, dy = this.target.y - b.y, d = Math.hypot(dx, dy);
    // bounding: hop after hop, each a little arc
    this.hop += dt / (this.speed > 45 ? 0.2 : 0.27);
    const k = this.hop % 1;
    b.alt = k < 0.7 ? Math.sin((k / 0.7) * Math.PI) * (this.speed > 45 ? 2 : 2.6) : 0;
    if (d < 1.2) {
      b.alt = 0;
      if (this.fleeing) {
        this.state = 'climb';
        b.facing = this.r() < 0.5 ? -1 : 1;
      } else {
        this.state = 'idle';
        this.timer = 0.6 + this.r() * 2;
      }
      return;
    }
    const step = Math.min(d, this.speed * dt);
    const nx = b.x + (dx / d) * step, ny = b.y + (dy / d) * step;
    if (!this.fleeing && !this.free(nx, ny)) {
      this.state = 'idle';
      this.timer = 0.5;
      return;
    }
    b.x = nx;
    b.y = ny;
    if (Math.abs(dx) > 0.5) b.facing = dx < 0 ? -1 : 1;
  }

  private draw(dt: number, t: number): void {
    const b = this.b, p = b.parts, s = this.seed;
    const frame = (i: number, f: string) => p[i].setFrame(f).setVisible(true);
    if (this.state === 'sit') {
      [S_TAIL, S_LEGB, S_HEAD, S_LEGF].forEach((i) => p[i].setVisible(false));
      // nibbling in quick bursts
      const nib = Math.sin(t * 0.9 + s * 4) > 0 && Math.sin(t * 22) > 0;
      frame(S_BODY, nib ? 'sq_nibble' : 'sq_sit');
      b.at(S_BODY, 0, 0, FEET.squirrel);
      return;
    }
    const air = b.alt > 0.6;
    frame(S_LEGF, 'sq_legF');
    frame(S_LEGB, 'sq_legB');
    // in the air the legs stretch out, front forward and back behind
    b.at(S_LEGF, air ? -1 : 0, 0, FEET.squirrel);
    b.at(S_LEGB, air ? 1 : 0, 0, FEET.squirrel);
    frame(S_BODY, 'sq_body');
    b.at(S_BODY, 0, 0, FEET.squirrel);
    frame(S_HEAD, 'sq_head');
    const climbing = this.state === 'climb' || this.state === 'descend';
    b.at(S_HEAD, 0, climbing ? -1 : 0, FEET.squirrel);
    // the tail flicks now and then, and lags behind each hop
    this.flick -= dt;
    if (this.state === 'idle' && this.flick <= -2 - (s % 2)) this.flick = 0.18;
    frame(S_TAIL, 'sq_tail');
    b.at(S_TAIL, 0, this.flick > 0 ? -1 : this.state === 'run' && b.alt > 1.4 ? 1 : 0, FEET.squirrel);
  }
}

// ---------------------------------------------------------------- sparrows

interface Bird {
  b: Body;
  state: 'ground' | 'fly';
  timer: number;
  pecks: number;
  hop: { fx: number; fy: number; tx: number; ty: number; t: number } | null;
  target: { x: number; y: number };
  cruise: number;
  delay: number;
  flap: number;
}

class Flock {
  private readonly birds: Bird[] = [];
  private center: { x: number; y: number };
  private restless: number;

  constructor(scene: Phaser.Scene, at: { x: number; y: number }, n: number, private readonly spots: () => { x: number; y: number } | null, private readonly free: Free, private readonly r: () => number, sort: Sort) {
    this.center = at;
    this.restless = 20 + r() * 30;
    for (let i = 0; i < n; i++) {
      let x = at.x, y = at.y;
      for (let k = 0; k < 6; k++) {
        const tx = at.x + (r() - 0.5) * 22, ty = at.y + (r() - 0.5) * 12;
        if (free(tx, ty)) {
          x = tx;
          y = ty;
          break;
        }
      }
      const b = new Body(scene, x, y, 'an_shadow_xs', [scene.add.image(0, 0, 'animals', 'sp_stand')], FEET.sparrow, [8, 7], sort);
      b.facing = r() < 0.5 ? -1 : 1;
      this.birds.push({ b, state: 'ground', timer: r() * 1.5, pecks: 0, hop: null, target: { x, y }, cruise: 16, delay: 0, flap: r() * 4 });
    }
  }

  get x(): number {
    return this.center.x;
  }
  get y(): number {
    return this.center.y;
  }

  update(dt: number, px: number, py: number, seen: boolean): void {
    const flying = this.birds.some((b) => b.state === 'fly');
    this.restless -= dt;
    if (!flying && (this.birds.some((b) => Math.hypot(px - b.b.x, (py - b.b.y) * 1.3) < 30) || this.restless <= 0)) this.takeOff(px, py);
    for (const bird of this.birds) {
      if (bird.state === 'fly') this.fly(bird, dt);
      else this.ground(bird, dt);
      bird.b.place();
      bird.b.show(seen);
    }
  }

  private takeOff(px: number, py: number): void {
    const r = this.r;
    this.restless = 25 + r() * 35;
    // somewhere else, away from you
    let to = null as { x: number; y: number } | null;
    for (let i = 0; i < 12 && !to; i++) {
      const s = this.spots();
      if (!s) continue;
      const d = Math.hypot(s.x - this.center.x, s.y - this.center.y);
      const away = Math.hypot(s.x - px, s.y - py) > Math.hypot(this.center.x - px, this.center.y - py);
      if (d > 60 && d < 220 && away) to = s;
    }
    if (!to) return;
    this.center = to;
    for (const bird of this.birds) {
      let tx = to.x, ty = to.y;
      for (let k = 0; k < 6; k++) {
        const x = to.x + (r() - 0.5) * 24, y = to.y + (r() - 0.5) * 12;
        if (this.free(x, y)) {
          tx = x;
          ty = y;
          break;
        }
      }
      Object.assign(bird, { state: 'fly', target: { x: tx, y: ty }, cruise: 14 + r() * 10, delay: r() * 0.3, hop: null });
    }
  }

  private fly(bird: Bird, dt: number): void {
    const b = bird.b;
    if ((bird.delay -= dt) > 0) return;
    const dx = bird.target.x - b.x, dy = bird.target.y - b.y, d = Math.hypot(dx, dy);
    const step = Math.min(d, 78 * dt);
    if (d > 0.01) {
      b.x += (dx / d) * step;
      b.y += (dy / d) * step;
      if (Math.abs(dx) > 0.5) b.facing = dx < 0 ? -1 : 1;
    }
    // up to cruising height, then down to land
    const want = Math.min(bird.cruise, d * 0.45);
    b.alt += (want - b.alt) * Math.min(1, dt * 6);
    bird.flap += dt * 16;
    const gliding = d < 14 || Math.sin(bird.flap * 0.21) > 0.75;
    b.parts[0].setFrame(gliding ? 'sp_fly1' : `sp_fly${[0, 1, 2, 1][Math.floor(bird.flap) % 4]}`);
    if (d < 0.6 && b.alt < 0.8) {
      b.alt = 0;
      bird.state = 'ground';
      bird.timer = 0.3 + this.r() * 0.6;
      b.parts[0].setFrame('sp_stand');
    }
  }

  private ground(bird: Bird, dt: number): void {
    const b = bird.b, r = this.r;
    if (bird.hop) {
      const h = bird.hop;
      h.t = Math.min(1, h.t + dt / 0.15);
      b.x = h.fx + (h.tx - h.fx) * h.t;
      b.y = h.fy + (h.ty - h.fy) * h.t;
      b.alt = Math.sin(h.t * Math.PI) * 2;
      b.parts[0].setFrame('sp_hop');
      if (h.t >= 1) {
        bird.hop = null;
        b.alt = 0;
        b.parts[0].setFrame('sp_stand');
      }
      return;
    }
    bird.timer -= dt;
    if (bird.timer > 0) return;
    if (bird.pecks > 0) {
      // peck, peck: head down, up again
      bird.pecks--;
      const down = b.parts[0].frame.name !== 'sp_peck';
      b.parts[0].setFrame(down ? 'sp_peck' : 'sp_stand');
      bird.timer = down ? 0.16 : 0.12;
      if (!down && bird.pecks > 0) bird.pecks++;
      return;
    }
    const k = r();
    if (k < 0.4) {
      // a hop or two, keeping near the others
      const a = r() * TAU;
      let tx = b.x + Math.cos(a) * (2 + r() * 3), ty = b.y + Math.sin(a) * (1 + r() * 2);
      if (Math.hypot(tx - this.center.x, ty - this.center.y) > 16) (tx = b.x + (this.center.x - b.x) * 0.3), (ty = b.y + (this.center.y - b.y) * 0.3);
      if (this.free(tx, ty)) {
        bird.hop = { fx: b.x, fy: b.y, tx, ty, t: 0 };
        if (Math.abs(tx - b.x) > 0.3) b.facing = tx < b.x ? -1 : 1;
      }
      bird.timer = 0.15 + r() * 0.5;
    } else if (k < 0.75) {
      bird.pecks = 1 + Math.floor(r() * 3);
      bird.timer = 0;
    } else if (k < 0.88) {
      b.facing = b.facing < 0 ? 1 : -1;
      bird.timer = 0.3 + r() * 0.8;
    } else bird.timer = 0.5 + r() * 1.5;
  }
}

// ---------------------------------------------------------------- the lot

export class Animals {
  private readonly cats: Cat[] = [];
  private readonly squirrels: Squirrel[] = [];
  private readonly flocks: Flock[] = [];
  private time = 0;

  constructor(private readonly scene: Phaser.Scene, map: MeadowMap, ground: (x: number, y: number) => boolean, sort: Sort, people: Footprint[] = []) {
    makeTextures(scene);
    const feet = [...map.objects.flatMap((o) => (o.foot && o.kind !== 'bush' ? [o.foot] : [])), ...people];
    // room for a small animal: on walkable ground and clear of everything, a little round it
    const free: Free = (x, y) => ground(x, y) && !inside(feet, x, y) && !inside(feet, x - 4, y) && !inside(feet, x + 4, y) && !inside(feet, x, y + 2);
    const r = rnd(map.id === 'town' ? 11 : 23);
    const W = map.cols * TILE, H = map.rows * TILE;
    const near = (o: { x: number; y: number }, dx: number, dy: number) => {
      for (let i = 0; i < 12; i++) {
        const x = o.x + (r() - 0.5) * dx * 2, y = o.y + (r() - 0.5) * dy * 2;
        if (free(x, y)) return { x, y };
      }
      return null;
    };
    const paved = (x: number, y: number) => vertexAt(map, Math.round(x / TILE), Math.round(y / TILE)) === T.Path;
    // somewhere on the paths (the town's cobbles, the meadow's trails)
    const pathSpot = () => {
      for (let i = 0; i < 40; i++) {
        const x = 20 + r() * (W - 40), y = 30 + r() * (H - 50);
        if (paved(x, y) && free(x, y)) return { x, y };
      }
      return null;
    };

    // cats by the doors and the houses, by the camp
    const homes: { x: number; y: number }[] = map.id === 'town'
      ? [...map.doors.map((d) => ({ x: d.x, y: d.y + 16 })), ...map.objects.filter((o) => o.frame === 't_stonebench' || o.frame === 't_redbench').map((o) => ({ x: o.x, y: o.y + 8 }))]
      : [...map.objects.filter((o) => o.kind === 'house').map((o) => ({ x: o.x, y: o.y + 14 })), ...map.fires.filter((f) => f.kind === 'campfire').map((f) => ({ x: f.x, y: f.y + 18 }))];
    const nCats = map.id === 'town' ? 7 : 4;
    const coats = [...COATS].sort(() => r() - 0.5);
    for (let i = 0; i < nCats && homes.length; i++) {
      const h = homes.splice(Math.floor(r() * homes.length), 1)[0];
      const at = near(h, 14, 8);
      if (at) this.cats.push(new Cat(scene, at, coats[i % coats.length], r() * 10, free, r, sort));
    }

    // squirrels in the trees (ones you can get round, near enough to the paths to be seen)
    const trees = map.objects.filter((o) => o.kind === 'tree' && free(o.x, o.y + 6) && o.x > 40 && o.x < W - 40 && o.y > 60 && o.y < H - 20);
    const nSq = map.id === 'town' ? 5 : 10;
    for (let i = 0; i < nSq && trees.length; i++) {
      const t = trees.splice(Math.floor(r() * trees.length), 1)[0];
      if (this.squirrels.some((s) => Math.hypot(s.b.x - t.x, s.b.y - t.y) < 120)) continue;
      this.squirrels.push(new Squirrel(scene, t, r() * 10, free, r, sort));
    }

    // sparrows on the paths
    const nFlocks = map.id === 'town' ? 6 : 7;
    for (let i = 0; i < nFlocks; i++) {
      const at = pathSpot();
      if (at) this.flocks.push(new Flock(scene, at, 3 + Math.floor(r() * 3), pathSpot, free, r, sort));
    }
  }

  update(dt: number, px: number, py: number): void {
    this.time += dt;
    const v = this.scene.cameras.main.worldView;
    const seen = (x: number, y: number, m = 60) => x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
    for (const c of this.cats) {
      const on = seen(c.b.x, c.b.y);
      c.b.show(on);
      if (on) c.update(dt, this.time, px, py);
    }
    for (const s of this.squirrels) if (seen(s.b.x, s.b.y)) s.update(dt, this.time, px, py);
    // a flock off screen keeps still, but one on its way somewhere finishes the flight
    for (const f of this.flocks) {
      const on = seen(f.x, f.y, 140);
      if (on) f.update(dt, px, py, true);
    }
  }
}

/** The shadows and the sleeping cat's z, drawn once. */
function makeTextures(scene: Phaser.Scene): void {
  const dot = (key: string, w: number, h: number) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x0c1e16, 1);
    g.fillEllipse(w / 2, h / 2, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  };
  dot('an_shadow_m', 14, 4);
  dot('an_shadow_s', 10, 3);
  dot('an_shadow_xs', 6, 2);
  if (!scene.textures.exists('an_z')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xf2f0ff, 1);
    g.fillRect(0, 0, 3, 1);
    g.fillRect(1, 1, 1, 1);
    g.fillRect(0, 2, 3, 1);
    g.generateTexture('an_z', 3, 3);
    g.destroy();
  }
}
