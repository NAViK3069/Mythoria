import * as Phaser from 'phaser';
import { AGGRO, ELEMENTS, MAP_SPAWNS, monsterById, type Habitat, type MonsterDef } from '@mythoria/game-data';
import type { Surface } from '../fx/surface';
import { drawPin } from './noticePin';
import META from './monsters.json';
import { insideFeet, T, TILE, vertexAt, waterAt, type Footprint, type MeadowMap } from './meadowMap';

// The monsters roaming a map (MAP_SPAWNS in @mythoria/game-data says which, how many, where they keep).
// Each kind keeps to its own kind of place - slimes by the ponds, horned rabbits on the open grass, poison
// mushrooms by the mushroom clumps, stumps and mossy logs, walking saplings among the trees, bees round the flowers - and each kind's
// mini-boss holds a lair of its own, as far from the crossroads as its kind of place goes.
//
// Their pictures and in-place loops are PixelLab's (tools/monster_parts.py → the 'monsters' atlas, all facing
// right); getting about is done here: slimes and rabbits hop (an arc, squashing as they land), mushrooms and
// saplings walk (their walk loop), bees fly (bobbing in the air, a shadow on the ground under them).
// They notice you when you come near: a pin over a normal one's head with a ring filling round it (AGGRO in
// game-data); full, a "!" and it comes after you - if it catches you, a fight starts on the map (the world's call).
// It gives up after a while or too far from home and goes back the way it came. Mini-bosses only notice. Walk up to
// one (or tap it) to see what it is and fight it yourself.

type Gait = 'hop' | 'walk' | 'fly';
interface Move {
  gait: Gait;
  /** Ground covered, px/s. */
  speed: number;
  /** A hop: how long, how high. */
  hop?: number;
  lift?: number;
  /** Height it flies at. */
  fly?: number;
}
const MOVES: Record<string, Move> = {
  slime: { gait: 'hop', speed: 18, hop: 0.46, lift: 3.5 },
  hornbun: { gait: 'hop', speed: 38, hop: 0.3, lift: 4.5 },
  shroom: { gait: 'walk', speed: 13 },
  sapling: { gait: 'walk', speed: 11 },
  bee: { gait: 'fly', speed: 24, fly: 10 },
};

/** How close (px, feet to feet) you have to be to look at a monster; a mini-boss is bigger. */
const RANGE = 24;
const BOSS_RANGE = 32;
/** It notices you here. */
const NOTICE = 64;

type Meta = { w: number; h: number; anims: Record<string, { n: number; fps: number }> };
const meta = META as Record<string, Meta>;

const TAU = Math.PI * 2;
const rnd = (seed: number) => {
  let s = Math.floor(seed * 9973) % 2147483647 || 1;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 8; i++) next();
  return next;
};

export class Monster {
  x: number;
  y: number;
  alt = 0;
  /** 1 faces right (as drawn). */
  facing: 1 | -1 = 1;
  readonly move: Move;
  readonly sprite: Phaser.GameObjects.Image;
  readonly tag: HTMLButtonElement;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly aura: Phaser.GameObjects.Image | null = null;
  private readonly m: Meta;
  private state: 'idle' | 'move' = 'idle';
  private timer: number;
  private target = { x: 0, y: 0 };
  private anim = 0;
  private hopT = 0;
  private land = 0;
  private noticed = false;
  /** Held still while you look at it. */
  held = false;
  /** Beaten: away until it comes back (MAP_SPAWNS respawn). */
  gone = false;
  /** How much it has noticed you (0..1; full: it comes after you). */
  meter = 0;
  /** Coming after you. */
  chasing = false;
  private chaseT = 0;
  /** The way it came while chasing, to go back home along. */
  private back: { x: number; y: number }[] = [];
  private stuckT = 0;
  /** Someone is fighting it (one fighter per monster). */
  engaged = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly def: MonsterDef,
    readonly home: { x: number; y: number },
    private readonly roam: number,
    private readonly free: (x: number, y: number) => boolean,
    private readonly r: () => number,
    onTap: (m: Monster) => void,
  ) {
    this.x = home.x;
    this.y = home.y;
    this.m = meta[def.look];
    this.move = { ...MOVES[def.kind] };
    if (def.miniBoss) {
      this.move.speed *= 0.6;
      if (this.move.lift) this.move.lift *= 1.3;
      if (this.move.hop) this.move.hop *= 1.4;
    }
    this.shadow = scene.add.image(this.x, this.y, 'mo_shadow').setAlpha(0.3).setDepth(1.4).setScale((this.m.w * 0.7) / 16, def.miniBoss ? 1.4 : 1);
    if (def.miniBoss) {
      const tint = Phaser.Display.Color.HexStringToColor(ELEMENTS.find((e) => e.id === def.element)?.color ?? '#ffd27a').color;
      this.aura = scene.add.image(this.x, this.y, 'mo_aura').setDepth(1.45).setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
    }
    this.sprite = scene.add.image(this.x, this.y, 'monsters', `${def.look}_idle0`).setOrigin(0.5, 1);
    this.facing = r() < 0.5 ? -1 : 1;
    this.timer = r() * 3;
    this.anim = r() * 10;
    if (this.move.gait === 'fly') this.alt = this.move.fly!;

    const tag = document.createElement('button');
    tag.className = `mon-tag${def.miniBoss ? ' boss' : ''}`;
    tag.innerHTML = `${def.miniBoss ? '<span class="mt-boss">มินิบอส</span>' : ''}<span class="mt-lv"></span><span class="mt-name"></span>`;
    (tag.querySelector('.mt-lv') as HTMLElement).textContent = `Lv.${def.level}`;
    (tag.querySelector('.mt-name') as HTMLElement).textContent = def.name;
    tag.title = def.name;
    tag.addEventListener('click', () => onTap(this));
    document.getElementById('ui')?.prepend(tag);
    this.tag = tag;
  }

  get range(): number {
    return this.def.miniBoss ? BOSS_RANGE : RANGE;
  }

  /** Its top, above the feet (to pin the tag, to test a tap). */
  get top(): number {
    return this.m.h + this.alt;
  }

  /**
   * aggro: may it notice you and come after you now (not mid-fight, mid-warp, right after a fight...). Returns true
   * when it has caught you.
   */
  update(dt: number, px: number, py: number, sort: (x: number, y: number, w: number, h: number) => number, aggro = false): boolean {
    this.anim += dt;
    const d = Math.hypot(px - this.x, (py - this.y) * 1.3);
    let caught = false;
    if (this.def.miniBoss || this.held || this.engaged) {
      // a mini-boss only turns to you (a "!" as before); one being looked at or fought does nothing more
      this.meter = 0;
      if (d < NOTICE) {
        if (!this.noticed && !this.engaged) this.alert();
        this.noticed = true;
        // (one being fought faces the leader striking it - FieldFight turns it - not you)
        if (!this.engaged && (this.state === 'idle' || this.held)) this.facing = px < this.x ? -1 : 1;
      } else if (d > NOTICE * 1.6) this.noticed = false;
    } else if (this.chasing) {
      caught = this.chase(dt, px, py, aggro);
    } else {
      // the meter: fills while you're near (faster the nearer), empties once you're away
      if (aggro && d < AGGRO.radius) {
        const k = Math.min(1, d / AGGRO.radius);
        this.meter = Math.min(1, this.meter + dt / (AGGRO.fillNear + (AGGRO.fillFar - AGGRO.fillNear) * k));
        if (this.state === 'idle') this.facing = px < this.x ? -1 : 1;
        if (this.meter >= 1) {
          this.alert();
          this.chasing = true;
          this.chaseT = 0;
          this.stuckT = 0;
          this.back = [{ x: this.x, y: this.y }];
          this.state = 'idle';
        }
      } else this.meter = Math.max(0, this.meter - dt * AGGRO.drain);
    }

    if (this.held || this.engaged) this.state = 'idle';
    else if (this.chasing) {
      /* moved by chase() */
    } else if (this.back.length) this.goBack(dt);
    else if (this.state === 'idle') {
      this.timer -= dt;
      if (this.timer <= 0) this.wander();
    } else this.step(dt);

    if (this.move.gait === 'fly') this.alt = this.move.fly! + Math.sin(this.anim * 3.1) * 1.5;
    this.draw(dt);
    const depth = sort(this.x, this.y, this.m.w * 0.6, this.m.h + this.alt);
    this.sprite.setPosition(this.x, this.y - this.alt).setDepth(depth).setFlipX(this.facing < 0);
    this.shadow.setPosition(this.x, this.y + 0.5);
    if (this.move.gait !== 'fly') this.shadow.setAlpha(0.3 * Math.max(0.4, 1 - this.alt / 10));
    if (this.aura) {
      const k = 0.5 + 0.5 * Math.sin(this.anim * 2.2);
      this.aura.setPosition(this.x, this.y + 0.5).setAlpha(0.22 + 0.2 * k).setScale((this.m.w * 0.95) / 32 * (1 + 0.06 * k));
    }
    return caught;
  }

  /** Its speed coming after you (px/s). */
  private get chaseSpeed(): number {
    return Math.max(AGGRO.chaseMin, this.move.speed * AGGRO.chaseMult);
  }

  /** After you: straight at you, sliding along what's in the way (stuck: it gives up). True when it caught you. */
  private chase(dt: number, px: number, py: number, aggro: boolean): boolean {
    this.chaseT += dt;
    const dx = px - this.x, dy = py - this.y, d = Math.hypot(dx, dy);
    if (aggro && d <= AGGRO.catch) return true;
    const far = Math.hypot(this.x - this.home.x, this.y - this.home.y) > AGGRO.leash;
    if (!aggro || this.chaseT > AGGRO.chaseSeconds || far || this.stuckT > 0.8) {
      this.giveUp();
      return false;
    }
    this.facing = dx < 0 ? -1 : 1;
    const go = Math.min(d, this.chaseSpeed * dt);
    const fly = this.move.gait === 'fly';
    const nx = this.x + (dx / d) * go, ny = this.y + (dy / d) * go;
    const ox = this.x, oy = this.y;
    if (fly || this.free(nx, ny)) (this.x = nx), (this.y = ny);
    else if (this.free(nx, this.y)) this.x = nx;
    else if (this.free(this.x, ny)) this.y = ny;
    this.stuckT = Math.hypot(this.x - ox, this.y - oy) < go * 0.3 ? this.stuckT + dt : 0;
    const last = this.back[this.back.length - 1];
    if (!last || Math.hypot(this.x - last.x, this.y - last.y) > 6) this.back.push({ x: this.x, y: this.y });
    // a hopper bounds along, a walker walks, a bee flies
    if (this.move.gait === 'hop') this.alt = Math.abs(Math.sin((this.chaseT * Math.PI) / (this.move.hop! * 0.8))) * this.move.lift!;
    if (this.move.gait === 'walk') this.state = 'move';
    return false;
  }

  /** Lost interest: back home the way it came. */
  giveUp(): void {
    this.chasing = false;
    this.meter = 0;
    this.state = 'idle';
  }

  /** Going home along its own way back (so it never cuts through a wall). */
  private goBack(dt: number): void {
    const p = this.back[this.back.length - 1];
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    const go = this.move.speed * 1.4 * dt;
    if (d <= go) {
      this.x = p.x;
      this.y = p.y;
      this.back.pop();
      if (!this.back.length) this.rest();
      return;
    }
    this.facing = dx < 0 ? -1 : 1;
    this.x += (dx / d) * go;
    this.y += (dy / d) * go;
    if (this.move.gait === 'hop') this.alt = Math.abs(Math.sin(this.anim * 6)) * this.move.lift! * 0.6;
    if (this.move.gait === 'walk') this.state = 'move';
  }

  /** Its notice pin and ring, on the map's effect layer (pixels, like the battle's). */
  drawMeter(s: Surface, t: number): void {
    if (this.gone || this.engaged || this.held || !this.sprite.visible || (!this.chasing && this.meter <= 0.01)) return;
    drawPin(s, Math.round(this.x), Math.round(this.y - this.top - 3), this.chasing ? 1 : this.meter, this.chasing, t);
  }

  setVisible(on: boolean): void {
    this.sprite.setVisible(on);
    this.shadow.setVisible(on);
    this.aura?.setVisible(on);
  }

  /** A little "!" over its head: it has seen you. */
  private alert(): void {
    if (!this.sprite.visible) return;
    const e = this.scene.add.image(this.x, this.y - this.top - 3, 'mo_alert').setOrigin(0.5, 1).setDepth(9000).setAlpha(0);
    this.scene.tweens.add({ targets: e, y: e.y - 4, alpha: { from: 0, to: 1 }, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: e, alpha: 0, delay: 900, duration: 300, onComplete: () => e.destroy() });
  }

  /** Off somewhere near home (a way that's clear), or a rest. */
  private wander(): void {
    const fly = this.move.gait === 'fly';
    for (let i = 0; i < 10; i++) {
      const a = this.r() * TAU, dist = (0.3 + this.r() * 0.7) * this.roam;
      const x = this.home.x + Math.cos(a) * dist, y = this.home.y + Math.sin(a) * dist * 0.7;
      const len = Math.hypot(x - this.x, y - this.y);
      let clear = len > 6;
      for (let k = 0; clear && k <= len; k += 4) clear = fly || this.free(this.x + ((x - this.x) * k) / len, this.y + ((y - this.y) * k) / len);
      if (clear && (fly || this.free(x, y))) {
        this.target = { x, y };
        this.state = 'move';
        this.hopT = 0;
        return;
      }
    }
    this.timer = 1 + this.r() * 2;
  }

  private step(dt: number): void {
    const mv = this.move;
    const dx = this.target.x - this.x, dy = this.target.y - this.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.5) this.facing = dx < 0 ? -1 : 1;
    if (mv.gait === 'hop') {
      // hop after hop: off the ground, along, down; a beat on the ground between
      this.hopT += dt / mv.hop!;
      const k = this.hopT % 1.35;
      if (k < 1) {
        this.alt = Math.sin(k * Math.PI) * mv.lift!;
        const go = Math.min(d, (mv.speed * 1.35) * dt);
        if (d > 0.01) (this.x += (dx / d) * go), (this.y += (dy / d) * go);
      } else {
        if (this.alt > 0) this.land = 1;
        this.alt = 0;
        if (d < 1.5) return this.rest();
      }
      return;
    }
    const go = Math.min(d, mv.speed * dt * (mv.gait === 'fly' ? Math.min(1, d / 12 + 0.3) : 1));
    if (d < 0.8) return this.rest();
    this.x += (dx / d) * go;
    this.y += (dy / d) * go;
  }

  private rest(): void {
    this.state = 'idle';
    this.alt = this.move.gait === 'fly' ? this.alt : 0;
    this.timer = (this.def.miniBoss ? 2.5 : 1.2) + this.r() * 3.5;
  }

  private draw(dt: number): void {
    const look = this.def.look, anims = this.m.anims;
    const walking = this.state === 'move' && this.move.gait === 'walk' && anims.move;
    const a = walking ? 'move' : 'idle';
    const { n, fps } = anims[a];
    this.sprite.setFrame(`${look}_${a}${Math.floor(this.anim * fps) % n}`);
    // a hopper squashes as it lands and stretches in the air (a pixel or so, no more)
    let sx = 1, sy = 1;
    if (this.move.gait === 'hop') {
      if (this.land > 0) {
        this.land = Math.max(0, this.land - dt / 0.16);
        const s = Math.sin(this.land * Math.PI) * (this.def.kind === 'slime' ? 0.14 : 0.07);
        sx = 1 + s;
        sy = 1 - s;
      } else if (this.alt > 0.5) {
        sx = 0.95;
        sy = 1.05;
      }
    }
    this.sprite.setScale(sx, sy);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.aura?.destroy();
    this.tag.remove();
  }
}

export class Monsters {
  readonly list: Monster[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    map: MeadowMap,
    ground: (x: number, y: number) => boolean,
    feet: Footprint[],
    onTap: (m: Monster) => void,
  ) {
    const spawns = MAP_SPAWNS[map.id];
    if (!spawns) return;
    makeTextures(scene);
    const r = rnd(map.id.length * 7 + 41);
    const W = map.cols * TILE, H = map.rows * TILE;
    const free = (x: number, y: number) =>
      ground(x, y) && x > 60 && y > 70 && x < W - 60 && y < H - 60 && !insideFeet(feet, x, y) && !insideFeet(feet, x - 6, y) && !insideFeet(feet, x + 6, y) && !insideFeet(feet, x, y + 3);
    // keep clear of where people are: the crossroads you arrive at, the camp, the village, the warp pads
    const keepOff = [
      { x: map.spawn.x, y: map.spawn.y, r: 230 },
      ...map.fires.filter((f) => f.kind === 'campfire' || f.kind === 'cookfire' || f.kind === 'hearth').map((f) => ({ x: f.x, y: f.y, r: 190 })),
      ...map.objects.filter((o) => o.kind === 'house' || o.kind === 'tent').map((o) => ({ x: o.x, y: o.y, r: 130 })),
      ...map.warps.map((w) => ({ x: w.x, y: w.y, r: 90 })),
    ];
    const away = (x: number, y: number) => keepOff.every((k) => Math.hypot(x - k.x, (y - k.y) * 1.1) > k.r);
    const ok = (x: number, y: number) => free(x, y) && away(x, y);
    const terrain = (x: number, y: number) => vertexAt(map, Math.round(x / TILE), Math.round(y / TILE));
    const wet = (x: number, y: number, rr: number) => {
      for (let a = 0; a < 8; a++) if (waterAt(map, x + Math.cos((a / 8) * TAU) * rr, y + Math.sin((a / 8) * TAU) * rr) > 0.45) return true;
      return false;
    };
    const trees = map.objects.filter((o) => o.kind === 'tree');
    const shady = [...map.decals.filter((d) => d.frame.startsWith('mushroom')), ...map.objects.filter((o) => /^(stump|mossylog|log)\d*$/.test(o.frame))];
    const nearTree = (x: number, y: number, lo: number, hi: number) => trees.some((t) => { const d = Math.hypot(x - t.x, (y - t.y) * 1.3); return d > lo && d < hi; });
    const fits: Record<Habitat, (x: number, y: number) => boolean> = {
      pond: (x, y) => wet(x, y, 26) && !wet(x, y, 8),
      grass: (x, y) => terrain(x, y) === T.Grass && !wet(x, y, 40) && !nearTree(x, y, 0, 36),
      shade: (x, y) => shady.some((o) => { const d = Math.hypot(x - o.x, (y - o.y) * 1.3); return d > 10 && d < 48; }),
      trees: (x, y) => nearTree(x, y, 16, 44),
      flowers: () => true,
    };
    const spot = (habitat: Habitat): { x: number; y: number } | null => {
      for (let i = 0; i < 3000; i++) {
        let x: number, y: number;
        if (habitat === 'flowers' && map.flowers.length) {
          const f = map.flowers[Math.floor(r() * map.flowers.length)];
          (x = f.x + (r() - 0.5) * 30), (y = f.y + (r() - 0.5) * 20);
        } else (x = 70 + r() * (W - 140)), (y = 80 + r() * (H - 150));
        if (ok(x, y) && fits[habitat](x, y)) return { x, y };
      }
      return null;
    };

    // the mini-bosses' lairs first: each as far from the crossroads as its kind of place goes, apart
    const lairs: { x: number; y: number }[] = [];
    const homes: { x: number; y: number }[] = [];
    for (const s of spawns.filter((sp) => monsterById(sp.monster)?.miniBoss)) {
      const def = monsterById(s.monster)!;
      let best: { x: number; y: number } | null = null, bd = -1;
      for (let i = 0; i < 70; i++) {
        const p = spot(s.habitat);
        if (!p || lairs.some((l) => Math.hypot(l.x - p.x, l.y - p.y) < 420)) continue;
        const d = Math.hypot(p.x - map.spawn.x, p.y - map.spawn.y);
        if (d > bd) (bd = d), (best = p);
      }
      if (!best) continue;
      lairs.push(best);
      this.list.push(new Monster(scene, def, best, 34, ok, r, onTap));
    }
    // then the rest, spread out (a few near their mini-boss)
    for (const s of spawns.filter((sp) => !monsterById(sp.monster)?.miniBoss)) {
      const def = monsterById(s.monster);
      if (!def) continue;
      for (let n = 0; n < s.count; n++) {
        let p: { x: number; y: number } | null = null;
        for (let i = 0; i < 80 && !p; i++) {
          const q = spot(s.habitat);
          if (q && homes.every((h) => Math.hypot(h.x - q.x, h.y - q.y) > 56) && lairs.every((l) => Math.hypot(l.x - q.x, l.y - q.y) > 60)) p = q;
        }
        if (!p) continue;
        homes.push(p);
        this.list.push(new Monster(scene, def, p, 56, ok, r, onTap));
      }
    }
    scene.events.once('shutdown', () => this.list.forEach((m) => m.destroy()));
  }

  /** Beaten in battle: gone until it comes back, at home, `seconds` later. */
  defeat(m: Monster, seconds: number): void {
    m.gone = true;
    m.setVisible(false);
    this.scene.time.delayedCall(seconds * 1000, () => {
      m.gone = false;
      m.x = m.home.x;
      m.y = m.home.y;
    });
  }

  /** Nobody notices you until then (seconds on this clock): after a fight, a flight. */
  private graceUntil = 0;
  private clock = 0;

  /** Leave the player alone for a while (AGGRO.grace s): every chase stops, every meter empties. */
  calm(seconds: number = AGGRO.grace): void {
    this.graceUntil = this.clock + seconds;
    for (const m of this.list) {
      if (m.chasing) m.giveUp();
      m.meter = 0;
    }
  }

  /**
   * aggro: may monsters notice you and come after you now; level: the master's (much weaker ones leave you alone).
   * Returns the one that caught you, if one did.
   */
  update(dt: number, px: number, py: number, sort: (x: number, y: number, w: number, h: number) => number, aggro = false, level = 1): Monster | null {
    this.clock += dt;
    const v = this.scene.cameras.main.worldView;
    let caught: Monster | null = null;
    const on = aggro && this.clock >= this.graceUntil;
    for (const m of this.list) {
      if (m.gone) continue;
      const seen = m.chasing || (m.x > v.x - 50 && m.x < v.right + 50 && m.y > v.y - 10 && m.y - 50 < v.bottom);
      m.setVisible(seen);
      if (!seen) continue;
      const may = on && !caught && level - m.def.level < AGGRO.ignoreBelow;
      if (m.update(dt, px, py, sort, may) && !caught) caught = m;
    }
    return caught;
  }

  /** Draw every notice pin (the map's effect layer calls this each frame). */
  drawMeters(s: Surface): void {
    for (const m of this.list) m.drawMeter(s, this.clock);
  }

  /** The one you're close enough to look at (the nearest), if any. */
  near(px: number, py: number): Monster | null {
    let best: Monster | null = null, bd = Infinity;
    for (const m of this.list) {
      const d = Math.hypot(m.x - px, (m.y - py) * 1.4);
      if (!m.gone && d < m.range && d < bd) (best = m), (bd = d);
    }
    return best;
  }

  /** Whose picture is at a point on the map (a tap on it), if any's. */
  at(x: number, y: number): Monster | null {
    return this.list.find((m) => !m.gone && m.sprite.visible && Math.abs(x - m.x) < m.sprite.displayWidth / 2 - 2 && y < m.y + 3 && y > m.y - m.top) ?? null;
  }

  /** Pin each name over its head (called once the camera has moved this frame). Mini-bosses' always show;
   * other monsters' when you're near enough to care. */
  placeTags(cam: Phaser.Cameras.Scene2D.Camera, k: number, hidden: boolean, px: number, py: number): void {
    const v = cam.worldView;
    for (const m of this.list) {
      const close = m.def.miniBoss || Math.hypot(px - m.x, py - m.y) < 120;
      const on = !hidden && !m.gone && !m.engaged && close && m.sprite.visible && m.x > v.x - 20 && m.x < v.right + 20 && m.y > v.y && m.y - m.top < v.bottom;
      m.tag.classList.toggle('show', on);
      if (on) m.tag.style.transform = `translate3d(${((m.x - v.x) * k).toFixed(1)}px, ${((m.y - m.top - 2 - v.y) * k).toFixed(1)}px, 0)`;
    }
  }

  /** A monster's picture for its card: its first idle frame. */
  picture(m: Monster): HTMLCanvasElement {
    const f = this.scene.textures.getFrame('monsters', `${m.def.look}_idle0`);
    const c = document.createElement('canvas');
    c.width = f.cutWidth;
    c.height = f.cutHeight;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    return c;
  }
}

/** The shadow, the mini-boss's ring and the "!", drawn once. */
function makeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('mo_shadow')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x0c1e16, 1).fillEllipse(8, 2.5, 16, 5);
    g.generateTexture('mo_shadow', 16, 5);
    g.destroy();
  }
  if (!scene.textures.exists('mo_aura')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 6; i++) {
      g.lineStyle(1, 0xffffff, 0.18 + i * 0.12);
      g.strokeEllipse(16, 5, 32 - i * 1.6, 10 - i * 0.5);
    }
    g.generateTexture('mo_aura', 32, 10);
    g.destroy();
  }
  if (!scene.textures.exists('mo_alert')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x2a1004, 1).fillRect(0, 0, 4, 9);
    g.fillStyle(0xffe04a, 1).fillRect(1, 1, 2, 4).fillRect(1, 6, 2, 2);
    g.generateTexture('mo_alert', 4, 9);
    g.destroy();
  }
}
