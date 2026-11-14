import * as Phaser from 'phaser';
import { heroById } from '@mythoria/game-data';
import type { Skin } from '../art/hands';
import { MasterCharacter, type Held } from './MasterCharacter';
import GEAR from './heroGear.json';

const gear = GEAR as unknown as Record<string, { front: Held; back?: Held; skin?: Skin }>;

/** How far behind the master the leader walks (px, measured along the way the master went). */
const GAP = 30;
/** It lets you get this far from where it should be before it sets off (px), and stops when this close: so it
 * doesn't shuffle after every little step - it walks when you've really gone somewhere. */
const SLACK = 14;
const SETTLE = 3;
/** Stood still, it stands a little to the side of your way (px), not right in your footsteps. */
const ASIDE = 7;
/** Farther than this from where it should be (a warp, a jump): it's simply put there. */
const SNAP = 140;
/** Its top speed (px/s): a bit quicker than the master, so it catches up after a stop. */
const SPEED = 110;

/**
 * The team leader on the map: it walks behind the master in the master's own footsteps (a trail of the points the
 * master walked through), so it never cuts through a wall or a pond. Built like the battle's heroes (its own parts
 * from the 'heroes' atlas, its weapon, its skin).
 */
export class Follower {
  private hero: MasterCharacter | null = null;
  private id: string | null = null;
  /** The master's last positions, newest last. */
  private trail: { x: number; y: number }[] = [];
  private hidden = false;
  /** Walking after you (else standing, until you're SLACK px off). */
  private walking = false;
  /** Which side of your way it stands at when you stop (picked as it stops). */
  private aside = 1;
  /** A fight on the map moves it (world/FieldFight.ts): it only animates here, and doesn't follow. */
  held = false;

  /** The leader's figure (null: nobody follows). */
  get body(): MasterCharacter | null {
    return this.hero;
  }

  constructor(private readonly scene: Phaser.Scene, private readonly sort: (x: number, y: number) => number) {}

  /** Who follows (a hero id; null = nobody). A new one appears just behind the master. */
  set(id: string | null, mx: number, my: number, facing: 1 | -1): void {
    if (id === this.id) return;
    this.hero?.destroy();
    this.hero = null;
    this.id = id;
    const def = id ? heroById(id) : undefined;
    if (!def) return;
    const part = (p: string) => `heroes#${def.look}_${p}`;
    const h = new MasterCharacter(this.scene, mx - facing * GAP, my, { head: part('head'), body: part('body'), legL: part('leg_l'), legR: part('leg_r') });
    const g = gear[def.look];
    if (g) h.setGear(this.scene, 'heroes', g.front, g.back ?? null);
    if (g?.skin) h.setSkin(this.scene, def.look, g.skin);
    h.facing = facing;
    h.walkSpeed = SPEED * 0.8;
    h.setVisible(!this.hidden);
    this.hero = h;
    this.reset(mx, my, facing);
  }

  /** Start the trail again from here (a warp landed the master somewhere else). */
  reset(mx: number, my: number, facing: 1 | -1): void {
    // a short straight trail behind the master, so the leader has somewhere to stand
    this.trail = [{ x: mx - facing * GAP, y: my }, { x: mx, y: my }];
    if (this.hero) (this.hero.x = mx - facing * GAP), (this.hero.y = my), (this.hero.vx = this.hero.vy = 0);
  }

  /** Hide it (mid-warp, the master is between pads). */
  setHidden(on: boolean): void {
    this.hidden = on;
    this.hero?.setVisible(!on);
  }

  update(dt: number, mx: number, my: number): void {
    const h = this.hero;
    if (!h) return;
    if (this.held) {
      h.update(dt);
      h.root.setDepth(this.sort(h.x, h.y));
      return;
    }
    const t = this.trail;
    const last = t[t.length - 1];
    if (!last || Math.hypot(mx - last.x, my - last.y) >= 2) t.push({ x: mx, y: my });
    if (t.length > 240) t.splice(0, t.length - 240);

    // where it should be: GAP px back along the trail from the master
    let target = t[0];
    let run = 0;
    let px = mx, py = my;
    for (let i = t.length - 1; i >= 0; i--) {
      const d = Math.hypot(t[i].x - px, t[i].y - py);
      if (run + d >= GAP) {
        const k = (GAP - run) / Math.max(1e-6, d);
        target = { x: px + (t[i].x - px) * k, y: py + (t[i].y - py) * k };
        break;
      }
      run += d;
      (px = t[i].x), (py = t[i].y);
      target = t[i];
    }

    // stood still: a little to the side of the way you came, not right in your footsteps
    const still = Math.hypot(mx - (t[t.length - 2]?.x ?? mx), my - (t[t.length - 2]?.y ?? my)) < 2.5 && !this.walking;
    const wx = mx - target.x, wy = my - target.y, wl = Math.hypot(wx, wy) || 1;
    const goal = { x: target.x + (-wy / wl) * ASIDE * this.aside * (still ? 1 : 0.4), y: target.y + (wx / wl) * ASIDE * this.aside * (still ? 1 : 0.4) };

    const dx = goal.x - h.x, dy = goal.y - h.y;
    const dist = Math.hypot(dx, dy);
    const ox = h.x, oy = h.y;
    if (dist > SNAP) {
      h.x = goal.x;
      h.y = goal.y;
    } else {
      // sets off only once you've really gone somewhere; comes to a soft stop
      if (!this.walking && dist > SLACK) this.walking = true;
      if (this.walking && dist < SETTLE) {
        this.walking = false;
        this.aside = Math.random() < 0.5 ? -1 : 1;
      }
      if (this.walking) {
        const step = Math.min(dist, Math.min(SPEED, 20 + dist * 4) * dt);
        h.x += (dx / dist) * step;
        h.y += (dy / dist) * step;
      }
    }
    // standing about: it turns to you now and then
    if (!this.walking && Math.abs(mx - h.x) > 4) h.facing = mx < h.x ? -1 : 1;
    h.vx = dist > SNAP ? 0 : (h.x - ox) / Math.max(dt, 1e-3);
    h.vy = dist > SNAP ? 0 : (h.y - oy) / Math.max(dt, 1e-3);
    h.update(dt);
    h.root.setDepth(this.sort(h.x, h.y));
  }

  destroy(): void {
    this.hero?.destroy();
    this.hero = null;
    this.id = null;
  }
}
