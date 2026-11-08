import * as Phaser from 'phaser';
import { HAND_ART, type HandPose } from '../art/hands';
import {
  HAND_BACK, HAND_FRONT, IDLE_PERIOD, ORIGIN_X, ORIGIN_Y, SETTLE_TIME,
  STEP_FRAMES, WALK_BODY, WALK_FPS, WALK_HEAD, walkLegs,
} from './rig';

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
  for (const [pose, canvas] of Object.entries(HAND_ART)) {
    const key = `hand_${pose}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  }
}

/**
 * The player's master character on the world map: layered parts + floating
 * hands, facing only left or right. The scene moves it (x, y, vx, vy); this
 * class animates and draws it.
 */
export class MasterCharacter {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  /** Walking speed (px/s) that counts as a full stride. */
  walkSpeed = 60;

  readonly root: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly legL: Phaser.GameObjects.Image;
  private readonly legR: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly handBack: Phaser.GameObjects.Image;
  private readonly handFront: Phaser.GameObjects.Image;

  private state: 'idle' | 'walk' = 'idle';
  private animT = 0;
  private time = 0;
  private frame = -1;
  private settle = 0;

  /** Called on each footfall (for dust / sound). */
  onStep?: (x: number, y: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, look: Look = MASTER_LOOK) {
    this.x = x;
    this.y = y;
    this.shadow = scene.add.ellipse(0, 0, 14, 4, 0x000000, 0.28).setDepth(1);
    const img = (key: string) => scene.add.image(0, 0, key).setOrigin(0, 0);
    // Draw order inside the container = back to front.
    this.handBack = img('hand_open');
    this.legL = img(look.legL);
    this.legR = img(look.legR);
    this.body = img(look.body);
    this.head = img(look.head);
    this.handFront = img('hand_open');
    this.root = scene.add.container(x, y, [this.handBack, this.legL, this.legR, this.body, this.head, this.handFront]);
    this.place();
  }

  setHands(front: HandPose, back: HandPose = front): void {
    this.handFront.setTexture(`hand_${front}`);
    this.handBack.setTexture(`hand_${back}`);
  }

  update(dt: number): void {
    this.time += dt;
    this.settle = Math.max(0, this.settle - dt);
    const speed = Math.hypot(this.vx, this.vy);
    if (Math.abs(this.vx) > 4) this.facing = this.vx > 0 ? 1 : -1;

    const state = speed > 4 ? 'walk' : 'idle';
    if (state !== this.state) {
      if (state === 'idle') this.settle = SETTLE_TIME;
      this.state = state;
      this.animT = 0;
      this.frame = -1;
    }

    // Pose in feet-local pixels, facing right.
    let legL: [number, number] = [0, 0];
    let legR: [number, number] = [0, 0];
    let body = 0;
    let head = 0;
    let headX = 0;
    let swing = 0; // front hand forward(+)/back(-)
    let floatF = 0;
    let floatB = 0;

    if (state === 'walk') {
      const k = Math.min(1.6, speed / this.walkSpeed);
      this.animT += dt * (0.55 + 0.45 * k);
      const f = Math.floor(this.animT * WALK_FPS) % 8;
      if (f !== this.frame) {
        this.frame = f;
        if (STEP_FRAMES.has(f)) this.onStep?.(this.x, this.y);
      }
      const side = speed > 0 ? Math.abs(this.vx) / speed : 1;
      [legL, legR] = walkLegs(f, side);
      body = WALK_BODY[f];
      head = WALK_HEAD[f];
      headX = side > 0.3 ? 1 : 0; // lean into the walk
      // Hands swing against the legs: the front hand goes back as the front (right) foot goes forward.
      swing = -legR[0];
      floatF = body;
      floatB = body;
    } else {
      this.animT += dt;
      head = this.animT % IDLE_PERIOD < IDLE_PERIOD / 2 ? 0 : 1;
      // Floating hands drift gently, a little out of step with each other.
      floatF = Math.round(Math.sin(this.time * 2.4) * 0.9);
      floatB = Math.round(Math.sin(this.time * 2.4 + 1.3) * 0.9);
    }
    if (this.settle > 0) body = head = 1;

    const ox = -ORIGIN_X;
    const oy = -ORIGIN_Y;
    this.legL.setPosition(ox + legL[0], oy - legL[1]);
    this.legR.setPosition(ox + legR[0], oy - legR[1]);
    this.body.setPosition(ox, oy + body);
    this.head.setPosition(ox + headX, oy + head);
    this.placeHand(this.handFront, HAND_FRONT.x + swing, HAND_FRONT.y + floatF);
    this.placeHand(this.handBack, HAND_BACK.x - swing, HAND_BACK.y + floatB);
    this.place();
  }

  /** Puts a hand canvas so its centre pixel sits on (x, y). */
  private placeHand(h: Phaser.GameObjects.Image, x: number, y: number): void {
    h.setPosition(Math.round(x - h.width / 2), Math.round(y - h.height / 2));
  }

  private place(): void {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    // Mirroring a 32px frame around x: +1 keeps the body's centre column in place.
    this.root.setPosition(this.facing < 0 ? x + 1 : x, y);
    this.root.setScale(this.facing, 1);
    this.root.setDepth(y);
    this.shadow.setPosition(x + 0.5, y);
  }

  destroy(): void {
    this.root.destroy();
    this.shadow.destroy();
  }
}
