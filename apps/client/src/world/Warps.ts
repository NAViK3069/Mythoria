import * as Phaser from 'phaser';
import { bakeEffect, EffectSprite } from '../fx/surface';
import { WarpVeil } from '../fx/veil';
import { PAD, warpIn, warpOut, warpPad, warpPadGlow, WARP_IN_SHOW, WARP_OUT_HIDE, type Actor } from '../fx/effects/warp';

/** When the veil starts to close over the screen (s after the warp starts): as the pillar of light thins. */
const VEIL_AT = 1.2;

/** One veil for the whole game: it stays over the screen while the world restarts on another map. */
const veil = new WarpVeil();

type Hooks = { hide(): void; show(): void; done(): void; travel?(): void };
import type { MasterCharacter } from './MasterCharacter';
import type { Warp } from './meadowMap';

interface Pad {
  warp: Warp;
  glow: EffectSprite;
  light: Phaser.GameObjects.PointLight;
  seed: number;
}

/**
 * The warp pads on the map - rings of runes set flush into the ground - and the jump between them: the
 * hero ascends as light on the pad they leave (warp out), the screen whites out for a breath, and a falling
 * star brings them down onto the pad they go to (warp in). All drawn in code (fx/effects/warp.ts).
 */
export class Warps {
  private readonly pads: Pad[] = [];
  private readonly shots: EffectSprite[] = [];
  private time = 0;
  /** True from the moment a jump starts until the hero stands whole on the other pad. */
  busy = false;

  constructor(private readonly scene: Phaser.Scene, warps: Warp[]) {
    const [ox, oy] = bakeEffect(scene, 'warp_pad', warpPad);
    warps.forEach((warp, i) => {
      // flat on the ground: under everything that stands, and under the hero's feet
      scene.add.image(warp.x, warp.y, 'warp_pad').setOrigin(ox, oy).setDepth(1.6);
      const glow = new EffectSprite(scene, warpPadGlow, warp.x, warp.y);
      glow.image.setDepth(1.65);
      const light = scene.add.pointlight(warp.x, warp.y - 6, 0x6aa8ff, 64, 0.05, 0.1).setDepth(9500);
      this.pads.push({ warp, glow, light, seed: i * 1.7 });
    });
  }

  /** The pad the feet at (x, y) stand on, if any. */
  padAt(x: number, y: number): Warp | null {
    for (const p of this.pads) {
      const dx = (x - p.warp.x) / (PAD.rx - 4), dy = (y - p.warp.y) / (PAD.ry - 2);
      if (dx * dx + dy * dy < 1) return p.warp;
    }
    return null;
  }

  /** Where to stand on a pad: its middle. */
  standOn(w: Warp): { x: number; y: number } {
    return { x: w.x, y: w.y + 1 };
  }

  update(dt: number): void {
    this.time += dt;
    veil.update(dt);
    for (const p of this.pads) {
      p.glow.update(dt);
      p.light.intensity = 0.05 * (0.8 + 0.2 * Math.sin(this.time * 1.6 + p.seed));
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.update(dt);
      if (s.finished) {
        s.destroy();
        this.shots.splice(i, 1);
      }
    }
  }

  /**
   * Jump the hero from where they stand to `to`. hide/show: what the scene does when the hero vanishes and
   * comes back (the name plate); done: when they stand whole on the far pad.
   */
  jump(m: MasterCharacter, to: Warp | null, hooks: Hooks): void {
    if (this.busy) return;
    this.busy = true;
    const scene = this.scene;
    const cam = scene.cameras.main;
    const actor = m.snapshot();
    this.play(warpOut(actor, 1 + Math.floor(Math.random() * 1e6)), m.x, m.y);
    scene.time.delayedCall(WARP_OUT_HIDE * 1000, () => {
      m.setVisible(false);
      hooks.hide();
      cam.shake(160, 0.0015);
    });
    // the arcane veil closes in on the middle of the screen, the world moves while it's dark, then it
    // opens again from the middle (always the middle: by the edge of the map the camera can't centre the hero)
    scene.time.delayedCall(VEIL_AT * 1000, () => {
      const at = to ? this.standOn(to) : null;
      veil.play(0.5, 0.5, {
        covered: () => {
          // to another map: start the world again there - the new scene lands the hero (see arrive)
          if (!at) {
            hooks.travel?.();
            return;
          }
          m.x = at.x;
          m.y = at.y;
          m.vx = m.vy = 0;
          m.update(0);
          cam.centerOn(at.x, at.y - 16);
        },
        opening: () => {
          if (at) this.land(m, at, actor, hooks);
        },
        done: () => {},
      });
    });
  }

  /** Arrived from another map onto pad `w` (the veil is still over the screen): land there as it opens. */
  arrive(m: MasterCharacter, w: Warp, hooks: Hooks): void {
    this.busy = true;
    m.setVisible(false);
    hooks.hide();
    const at = this.standOn(w);
    const land = () => this.land(m, at, m.snapshot(), hooks);
    if (veil.active) veil.rebind({ covered: () => {}, opening: land, done: () => {} });
    else land();
  }

  /** The warp in on the far pad: the falling star, the hero condensing; then they're back. */
  private land(m: MasterCharacter, at: { x: number; y: number }, actor: Actor, hooks: Hooks): void {
    const scene = this.scene, cam = scene.cameras.main;
    this.play(warpIn(actor, 1 + Math.floor(Math.random() * 1e6)), at.x, at.y);
    scene.time.delayedCall(420, () => cam.shake(160, 0.0025));
    scene.time.delayedCall(WARP_IN_SHOW * 1000, () => {
      m.setVisible(true);
      hooks.show();
    });
    scene.time.delayedCall(WARP_IN_SHOW * 1000 + 250, () => {
      this.busy = false;
      hooks.done();
    });
  }

  /** Play a one-shot: its front layer over the hero, its back layer (if it has one) behind. */
  private play(fx: ReturnType<typeof warpOut>, x: number, y: number): void {
    if (fx.drawBack) {
      const b = new EffectSprite(this.scene, fx, x, y, true, true);
      b.image.setDepth(y - 0.5);
      this.shots.push(b);
    }
    const s = new EffectSprite(this.scene, fx, x, y, true);
    s.image.setDepth(y + 0.5);
    this.shots.push(s);
  }
}

export type { Actor };
