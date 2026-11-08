import * as Phaser from 'phaser';
import { HAND_ART, HAND_POSES, type HandPose } from '../art/hands';
import { FOOT_LIFT, FOOT_REACH, FRAME, HAND_BACK, HAND_FRONT, ORIGIN_X, ORIGIN_Y, PIVOT, Spring, STRIDE } from './rig';

/** Texture keys for one look (head / body / legs). */
export interface Look {
  head: string;
  body: string;
  legL: string;
  legR: string;
}

export const MASTER_LOOK: Look = {
  head: 'master_head',
  body: 'master_body',
  legL: 'master_leg_l',
  legR: 'master_leg_r',
};

/** Makes the hand textures once per game. */
export function registerHandTextures(scene: Phaser.Scene): void {
  for (const pose of HAND_POSES) {
    const key = `hand_${pose}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, HAND_ART[pose].canvas);
  }
}

const TAU = Math.PI * 2;

/**
 * The player's master character on the world map: layered parts + two
 * floating hands in front, facing only left or right. The scene moves it
 * (x, y, vx, vy); this class animates and draws it - smoothly, with springs.
 */
export class MasterCharacter {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  /** Speed (px/s) that counts as a full walk. */
  walkSpeed = 60;

  readonly root: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly legL: Phaser.GameObjects.Image;
  private readonly legR: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly handBack: Phaser.GameObjects.Image;
  private readonly handFront: Phaser.GameObjects.Image;
  private poseFront: HandPose = 'open';
  private poseBack: HandPose = 'open';

  private time = 0;
  private phase = 0; // walk cycle, radians
  private move = 0; // 0 standing .. 1 walking, eased
  private flip = new Spring(1, 260, 26); // turning round: squashes through 0 instead of snapping
  private headY = new Spring(0, 220, 18);
  private headTilt = new Spring(0, 160, 14);
  private lean = new Spring(0, 140, 16);
  private squash = new Spring(0, 260, 12); // landing / stopping bounce
  private hands = {
    fx: new Spring(HAND_FRONT.x, 120, 13),
    fy: new Spring(HAND_FRONT.y, 120, 13),
    bx: new Spring(HAND_BACK.x, 110, 12),
    by: new Spring(HAND_BACK.y, 110, 12),
  };

  /** Called on each footfall (for dust / sound). */
  onStep?: (x: number, y: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, look: Look = MASTER_LOOK) {
    this.x = x;
    this.y = y;
    this.shadow = scene.add.ellipse(x, y, 15, 5, 0x0b1a10, 0.32).setDepth(2);
    const part = (key: string, pivot: { x: number; y: number }) =>
      scene.add.image(0, 0, key).setOrigin(pivot.x / FRAME, pivot.y / FRAME);
    const hand = () => scene.add.image(0, 0, 'hand_open');
    this.legL = part(look.legL, PIVOT.legL);
    this.legR = part(look.legR, PIVOT.legR);
    this.body = part(look.body, PIVOT.body);
    this.head = part(look.head, PIVOT.head);
    // Both hands float on top of everything (draw order = back to front).
    this.handBack = hand();
    this.handFront = hand();
    this.root = scene.add.container(x, y, [this.legL, this.legR, this.body, this.head, this.handBack, this.handFront]);
    this.setHands('open');
    this.update(0);
  }

  /** Change hand poses (e.g. 'grip' to hold a sword, 'palm' to cast). */
  setHands(front: HandPose, back: HandPose = front): void {
    this.poseFront = front;
    this.poseBack = back;
    this.handFront.setTexture(`hand_${front}`);
    this.handBack.setTexture(`hand_${back}`);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    const speed = Math.hypot(this.vx, this.vy);
    if (Math.abs(this.vx) > 6) this.facing = this.vx > 0 ? 1 : -1;

    // Ease in and out of walking, and bounce a little when stopping.
    const moving = speed > 4 ? Math.min(1.3, speed / this.walkSpeed) : 0;
    const wasMoving = this.move > 0.5;
    this.move += (moving - this.move) * Math.min(1, dt * 10);
    if (wasMoving && this.move <= 0.5) this.squash.kick(14);
    if (!wasMoving && this.move > 0.5) this.squash.kick(-8);

    // The cycle advances with the ground covered, so the feet don't skate.
    const prevPhase = this.phase;
    this.phase += (speed * dt / STRIDE) * TAU;
    // a footfall at each half cycle
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI) && this.move > 0.3) this.onStep?.(this.x, this.y);
    const m = Math.min(1, this.move);
    const side = speed > 0 ? Math.abs(this.vx) / speed : 1; // walking up/down the screen: shorter stride
    const reach = FOOT_REACH * (0.45 + 0.55 * side) * m;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    // Feet: forward/back with the cycle, lifted only while swinging forward.
    const footR = { x: s * reach, lift: Math.max(0, c) * FOOT_LIFT * m };
    const footL = { x: -s * reach, lift: Math.max(0, -c) * FOOT_LIFT * m };

    // Body: rises as the feet pass each other, breathes when idle, leans into the walk.
    const breathe = Math.sin(t * 2.1);
    const bob = -(1 - Math.abs(s)) * 1.1 * m;
    const sq = this.squash.step(0, dt);
    const bodyY = bob + sq * 0.12 + (1 - m) * breathe * 0.25;
    const lean = this.lean.step(m * 0.07 * (0.4 + 0.6 * side), dt);
    // Head: follows the body on a spring (lags behind the bob), nods a touch with each step.
    const headY = this.headY.step(bodyY * 1.25 + (1 - m) * (breathe * 0.45 + 0.2), dt) + sq * 0.15;
    const tilt = this.headTilt.step(m * (0.05 + Math.sin(this.phase * 2) * 0.025) + (1 - m) * Math.sin(t * 1.3) * 0.02, dt);

    const ox = -ORIGIN_X;
    const oy = -ORIGIN_Y;
    this.legL.setPosition(ox + PIVOT.legL.x + footL.x, oy + PIVOT.legL.y - footL.lift);
    this.legR.setPosition(ox + PIVOT.legR.x + footR.x, oy + PIVOT.legR.y - footR.lift);
    this.legL.setRotation(-footL.x * 0.05);
    this.legR.setRotation(-footR.x * 0.05);
    this.body.setPosition(ox + PIVOT.body.x, oy + PIVOT.body.y + bodyY);
    this.body.setRotation(lean);
    this.body.setScale(1 - sq * 0.012, 1 + sq * 0.015 * -1);
    this.head.setPosition(ox + PIVOT.head.x + lean * 9, oy + PIVOT.head.y + headY);
    this.head.setRotation(tilt);

    // Hands: swing against the feet when walking, drift slowly when idle; springs make them trail softly.
    const swing = 2.4 * (0.5 + 0.5 * side) * m;
    const f = this.hands;
    const fx = f.fx.step(HAND_FRONT.x - s * swing + lean * 6, dt);
    const fy = f.fy.step(HAND_FRONT.y + bodyY + Math.abs(s) * 0.6 * m + (1 - m) * Math.sin(t * 2.4) * 0.9, dt);
    const bx = f.bx.step(HAND_BACK.x + s * swing + lean * 6, dt);
    const by = f.by.step(HAND_BACK.y + bodyY + Math.abs(s) * 0.6 * m + (1 - m) * Math.sin(t * 2.4 + 1.4) * 0.9, dt);
    this.placeHand(this.handFront, this.poseFront, fx, fy, -s * 0.18 * m);
    this.placeHand(this.handBack, this.poseBack, bx, by, s * 0.18 * m);

    // Turning: the flip spring passes through 0 so the turn reads as a quick squash, not a snap.
    const sx = this.flip.step(this.facing, dt);
    this.root.setPosition(this.x, this.y);
    this.root.setScale(Math.sign(sx || 1) * Math.max(0.25, Math.abs(sx)), 1);
    this.root.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y + 0.5);
    this.shadow.setScale(1 - (bodyY + headY) * 0.03, 1);
  }

  private placeHand(h: Phaser.GameObjects.Image, pose: HandPose, x: number, y: number, rot: number): void {
    const a = HAND_ART[pose];
    h.setOrigin(a.ax / a.canvas.width, a.ay / a.canvas.height);
    h.setPosition(x, y);
    h.setRotation(rot);
  }

  destroy(): void {
    this.root.destroy();
    this.shadow.destroy();
  }
}
