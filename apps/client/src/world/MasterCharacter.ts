import * as Phaser from 'phaser';
import { HAND_ART, HAND_POSES, handCanvas, type HandPose, type Skin } from '../art/hands';
import { FOOT_LIFT, FOOT_REACH, FRAME, HAND_BACK, HAND_FRONT, ORIGIN_X, ORIGIN_Y, PIVOT, Spring, STRIDE } from './rig';

/** Texture keys for one look (head / body / legs): a texture, or 'atlas#frame'. */
export interface Look {
  head: string;
  body: string;
  legL: string;
  legR: string;
}

/** Something held (a hero's weapon / off-hand): an atlas frame, the pixel the hand holds, covers the hand?,
 * and where that hand rests (feet-local, facing right). tools/hero_parts.py → world/heroGear.json. */
export interface Held {
  frame: string;
  x: number;
  y: number;
  w: number;
  h: number;
  over: boolean;
  rest: [number, number];
  /** Drawn fine (tools/weapon_art.py: 2 art pixels to a world pixel): shown at this size. */
  scale?: number;
  /** Held leaning out from the body (radians, clockwise facing right); the fist turns with it. */
  tilt?: number;
  /** Held in BOTH hands (a spear): the back hand grips this far further down the shaft from the front hand (world px). */
  twoHand?: number;
  /** How the hand holds it (default an upright grip; 'open' - the round hand over its ring, carrying it hung below). */
  pose?: HandPose;
  /** A bow: where its string is tied (picture px: top x, y, bottom x, y) - drawn here, pulled back to the other hand. */
  string?: [number, number, number, number];
  /** And the arrow nocked on it (an atlas frame, its nock's pixel, its size, shown at scale). */
  arrow?: { frame: string; x: number; y: number; w: number; h: number; scale?: number };
}

/** The bowstring's colour (pale sinew), and how thick it's drawn (world px). */
const STRING = 0xe8dfc4;
const STRING_W = 0.75;

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
  /** Whose skin the hands are drawn in ('' = the master's; setSkin). */
  private skinId = '';
  /** Where the hands rest (feet-local, facing right); moved out when holding a weapon. */
  private rest = { front: { ...HAND_FRONT }, back: { ...HAND_BACK } };
  /** Is the front weapon in the hand (false while it's thrown - Kuroha's shuriken), and how far it's turned in the hand
   * on top of its grip (a shuriken twirled). */
  gearShown = true;
  gearSpin = 0;
  private gearFront: { img: Phaser.GameObjects.Image; held: Held } | null = null;
  private gearBack: { img: Phaser.GameObjects.Image; held: Held } | null = null;
  /** A swing of the front hand (radians, set by whoever animates an attack). */
  swing = 0;
  /** The same for the back hand (a shield raised, a second blade). */
  swingBack = 0;
  /** Where an attack moves each hand to, on top of where it rests (px, facing right) - straight away, no spring
   * (a sword stroke must be where it's drawn), and the body leaning into it (radians). */
  reachFront = { x: 0, y: 0 };
  reachBack = { x: 0, y: 0 };
  leanInto = 0;
  /** The front hand's grip and the way its weapon points (world px; the angle on screen, up = -PI/2), as last drawn. */
  readonly grip = { x: 0, y: 0, angle: -Math.PI / 2 };
  /** The same for the back hand. */
  readonly gripBack = { x: 0, y: 0, angle: -Math.PI / 2 };
  /** Both hands on a two-handed weapon (`Held.twoHand`); a move can let go with the back hand (false). */
  bothHands = true;
  /** A bow's string pulled back (0 straight between the tips .. 1 at the back hand), and an arrow on it. */
  draw = 0;
  nocked = false;
  private bowString: Phaser.GameObjects.Graphics | null = null;
  private arrowImg: Phaser.GameObjects.Image | null = null;
  /** The nocked arrow's nock and the way it points, as last drawn (world px, angle on screen) - where a shot leaves. */
  readonly arrowAt = { x: 0, y: 0, angle: 0 };
  /** How high off the ground it is (px) - a leap: the body rises, its shadow stays on the ground. */
  lift = 0;
  /** Always face this way, whichever way it walks (a hero in battle faces the foe, even walking back). */
  faceLock: 1 | -1 | null = null;

  private time = 0;
  private phase = 0; // walk cycle, radians
  private move = 0; // 0 standing .. 1 walking, eased
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
    // a part is a texture, or 'atlas#frame'; a picture bigger than the 32 px frame (a plume over a helmet) has the
    // frame at its bottom, centred - the pivot is moved by the extra
    const part = (key: string, pivot: { x: number; y: number }) => {
      const [tex, frame] = key.split('#');
      const img = scene.add.image(0, 0, tex, frame);
      const w = img.frame.realWidth, h = img.frame.realHeight;
      return img.setOrigin((pivot.x + (w - FRAME) / 2) / w, (pivot.y + (h - FRAME)) / h);
    };
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

  /**
   * Start t seconds into the idle (breathing, the head's tilt, the hands' drift) without stepping the springs -
   * so people standing together aren't in step. (Stepping the springs by a big dt flings the parts off and
   * they fall back into place.)
   */
  skip(t: number): void {
    this.time += t;
  }

  /**
   * Hold a weapon in the front hand (and something in the back one): drawn over the head, the fist round its
   * grip (a shield covers its hand). The hands rest where the weapon needs them.
   */
  setGear(scene: Phaser.Scene, atlas: string, front: Held | null, back: Held | null = null): void {
    for (const g of [this.gearFront, this.gearBack]) g?.img.destroy();
    this.gearFront = this.gearBack = null;
    this.bowString?.destroy();
    this.arrowImg?.destroy();
    this.bowString = this.arrowImg = null;
    const make = (held: Held) => scene.add.image(0, 0, atlas, held.frame).setOrigin(held.x / held.w, held.y / held.h).setScale(held.scale ?? 1);
    const list = this.root.list as Phaser.GameObjects.GameObject[];
    if (back) {
      const img = make(back);
      // like the front weapon: over the head and body, the fist round its grip (a shield is held up over its hand)
      this.root.addAt(img, back.over ? list.indexOf(this.handBack) + 1 : list.indexOf(this.handBack));
      this.gearBack = { img, held: back };
      this.rest.back = { x: back.rest[0], y: back.rest[1] };
    } else this.rest.back = { ...HAND_BACK };
    if (front) {
      const img = make(front);
      this.root.addAt(img, front.over ? list.indexOf(this.handFront) + 1 : list.indexOf(this.handFront));
      this.gearFront = { img, held: front };
      this.rest.front = { x: front.rest[0], y: front.rest[1] };
      if (front.twoHand) {
        // the back hand grips the same shaft: drawn over it, not under
        this.root.remove(this.handBack);
        this.root.addAt(this.handBack, (this.root.list as Phaser.GameObjects.GameObject[]).indexOf(img) + 1);
      }
      if (front.string) {
        // the string just under the bow; the arrow over it (both under the front fist)
        this.bowString = scene.add.graphics();
        this.root.addAt(this.bowString, list.indexOf(img));
        if (front.arrow) {
          const ar = front.arrow;
          this.arrowImg = scene.add.image(0, 0, atlas, ar.frame).setOrigin(ar.x / ar.w, ar.y / ar.h).setScale(ar.scale ?? 1).setVisible(false);
          this.root.addAt(this.arrowImg, list.indexOf(img) + 1);
        }
      }
    } else this.rest.front = { ...HAND_FRONT };
    this.hands.fx.x = this.rest.front.x;
    this.hands.fy.x = this.rest.front.y;
    this.hands.bx.x = this.rest.back.x;
    this.hands.by.x = this.rest.back.y;
    this.setHands(front && !front.over ? (front.pose ?? 'grip') : 'open', (back && !back.over) || front?.twoHand ? (back?.pose ?? 'grip') : 'open');
  }

  /** Hands in this character's own skin (`id` names its textures, once per game - a hero's look). */
  setSkin(scene: Phaser.Scene, id: string, skin: Skin): void {
    for (const pose of HAND_POSES) {
      const key = `hand_${pose}@${id}`;
      if (!scene.textures.exists(key)) scene.textures.addCanvas(key, handCanvas(pose, skin));
    }
    this.skinId = id;
    this.setHands(this.poseFront, this.poseBack);
  }

  /** Change hand poses (e.g. 'grip' to hold a sword, 'palm' to cast). */
  setHands(front: HandPose, back: HandPose = front): void {
    this.poseFront = front;
    this.poseBack = back;
    const own = this.skinId ? `@${this.skinId}` : '';
    this.handFront.setTexture(`hand_${front}${own}`);
    this.handBack.setTexture(`hand_${back}${own}`);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    const speed = Math.hypot(this.vx, this.vy);
    if (this.faceLock) this.facing = this.faceLock;
    else if (Math.abs(this.vx) > 6) this.facing = this.vx > 0 ? 1 : -1;

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

    // Hips: a light bounce as the feet pass each other. The legs hang from the hips, so
    // the body and legs always stay joined (no gap at the waist).
    const breathe = Math.sin(t * 2.1);
    const hipY = -(1 - Math.abs(s)) * 0.7 * m;
    // Landing/stopping squash only ever pushes the body DOWN into the legs.
    const sq = Math.max(0, this.squash.step(0, dt));
    const bodyY = hipY + sq * 0.1 + (1 - m) * breathe * 0.2;
    const lean = this.lean.step(m * 0.07 * (0.4 + 0.6 * side), dt) + this.leanInto;
    // Head: follows the body on a spring (lags behind the bob), nods a touch with each step.
    const headY = this.headY.step(bodyY * 1.2 + (1 - m) * (breathe * 0.4 + 0.2), dt) + sq * 0.12;
    const tilt = this.headTilt.step(m * (0.05 + Math.sin(this.phase * 2) * 0.025) + (1 - m) * Math.sin(t * 1.3) * 0.02, dt);

    const ox = -ORIGIN_X;
    const oy = -ORIGIN_Y;
    this.legL.setPosition(ox + PIVOT.legL.x + footL.x, oy + PIVOT.legL.y + hipY - footL.lift);
    this.legR.setPosition(ox + PIVOT.legR.x + footR.x, oy + PIVOT.legR.y + hipY - footR.lift);
    this.legL.setRotation(-footL.x * 0.05);
    this.legR.setRotation(-footR.x * 0.05);
    this.body.setPosition(ox + PIVOT.body.x, oy + PIVOT.body.y + bodyY);
    this.body.setRotation(lean);
    this.body.setScale(1 + sq * 0.012, 1 - sq * 0.015);
    this.head.setPosition(ox + PIVOT.head.x + lean * 9, oy + PIVOT.head.y + headY);
    this.head.setRotation(tilt);

    // Hands: swing against the feet when walking, drift slowly when idle; springs make them trail softly.
    const swing = 2.4 * (0.5 + 0.5 * side) * m;
    const f = this.hands;
    const rf = this.rest.front, rb = this.rest.back;
    const fx = f.fx.step(rf.x - s * swing + lean * 6, dt) + this.reachFront.x;
    const fy = f.fy.step(rf.y + bodyY + Math.abs(s) * 0.6 * m + (1 - m) * Math.sin(t * 2.4) * 0.9, dt) + this.reachFront.y;
    const bx = f.bx.step(rb.x + s * swing + lean * 6, dt) + this.reachBack.x;
    const by = f.by.step(rb.y + bodyY + Math.abs(s) * 0.6 * m + (1 - m) * Math.sin(t * 2.4 + 1.4) * 0.9, dt) + this.reachBack.y;
    const ft = this.gearFront?.held.tilt ?? 0, bt = this.gearBack?.held.tilt ?? 0;
    const fr = -s * 0.18 * m + this.swing;
    let br = s * 0.18 * m + this.swingBack;
    // a two-handed weapon: the back hand on the same shaft, further down it, turning with it
    const two = this.gearFront?.held.twoHand;
    let bx2 = bx, by2 = by;
    if (two && this.bothHands) {
      const r = fr + ft;
      bx2 = fx - Math.sin(r) * two;
      by2 = fy + Math.cos(r) * two;
      br = fr + ft - bt;
    }
    // (a fist round a tilted handle turns with it)
    this.placeHand(this.handFront, this.poseFront, fx, fy, fr + ft);
    this.placeHand(this.handBack, this.poseBack, bx2, by2, br + bt);
    this.gearFront?.img.setPosition(fx, fy).setRotation(fr + ft + this.gearSpin).setVisible(this.gearShown);
    this.gearBack?.img.setPosition(bx, by).setRotation(br + bt);
    // (for effects that follow the blade: mirrored with the body when it faces left)
    const onScreen = (g: { x: number; y: number; angle: number }, hx: number, hy: number, r: number) => {
      g.x = this.x + hx * this.facing;
      g.y = this.y - this.lift + hy;
      const a = -Math.PI / 2 + r;
      g.angle = Math.atan2(Math.sin(a), Math.cos(a) * this.facing);
    };
    onScreen(this.grip, fx, fy, fr + ft);
    onScreen(this.gripBack, bx2, by2, br + bt);
    this.drawString(fx, fy, bx, by);

    // Turning: mirror instantly round the middle of the body.
    this.root.setPosition(this.x, this.y - this.lift);
    this.root.setScale(this.facing, 1);
    this.root.setDepth(this.y);
    // (the shadow stays on the ground under a leap, smaller and fainter the higher it goes)
    this.shadow.setPosition(this.x, this.y + 0.5);
    const up = Math.max(0, 1 - this.lift / 60);
    this.shadow.setScale((1 - (bodyY + headY) * 0.03) * (0.55 + 0.45 * up), 0.55 + 0.45 * up);
  }

  /** A bow's string between its tips - pulled back to the back hand as far as `draw` - and the arrow nocked on it,
   * pointing from the string through the bow's grip. */
  private drawString(fx: number, fy: number, bx: number, by: number): void {
    const g = this.gearFront, s = g?.held.string;
    if (!g || !s || !this.bowString) return;
    const img = g.img, k = g.held.scale ?? 1, c = Math.cos(img.rotation), sn = Math.sin(img.rotation);
    const at = (px: number, py: number) => {
      const lx = (px - img.originX * g.held.w) * k, ly = (py - img.originY * g.held.h) * k;
      return { x: img.x + lx * c - ly * sn, y: img.y + lx * sn + ly * c };
    };
    const top = at(s[0], s[1]), bottom = at(s[2], s[3]);
    const mid = { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 };
    const d = Math.max(0, Math.min(1, this.draw));
    const pull = { x: mid.x + (bx - mid.x) * d, y: mid.y + (by - mid.y) * d };
    const gr = this.bowString;
    gr.clear();
    gr.lineStyle(STRING_W, STRING, 1);
    gr.beginPath();
    gr.moveTo(top.x, top.y);
    if (d > 0.02) gr.lineTo(pull.x, pull.y);
    gr.lineTo(bottom.x, bottom.y);
    gr.strokePath();
    // the arrow: its nock on the string, pointing through the grip
    const ang = Math.atan2(fy - pull.y, fx - pull.x);
    if (this.arrowImg) this.arrowImg.setVisible(this.nocked).setPosition(pull.x, pull.y).setRotation(ang);
    this.arrowAt.x = this.x + pull.x * this.facing;
    this.arrowAt.y = this.y - this.lift + pull.y;
    this.arrowAt.angle = Math.atan2(Math.sin(ang), Math.cos(ang) * this.facing);
  }

  /** Its pictures (head, body, legs, hands, what it holds) - not the bowstring, which is drawn, not a picture. */
  parts(): Phaser.GameObjects.Image[] {
    return (this.root.list as Phaser.GameObjects.GameObject[]).filter((o): o is Phaser.GameObjects.Image => o instanceof Phaser.GameObjects.Image);
  }

  /** Show or hide the whole character (a warp hides it while the effect draws it). */
  setVisible(on: boolean): void {
    this.root.setVisible(on);
    this.shadow.setVisible(on);
  }

  /**
   * The character as it looks right now, as pixels round its feet - for effects that take the body apart
   * and put it back together (a warp). Colours are packed the way the effects use them (ABGR).
   */
  snapshot(): { pixels: Uint32Array; w: number; h: number; x: number; y: number } {
    const W = 44, H = 46, ox = 22, oy = 42;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingEnabled = false;
    g.translate(ox, oy);
    g.scale(this.facing, 1);
    for (const part of this.parts()) {
      if (!part.visible) continue;
      const f = part.frame;
      g.save();
      g.translate(part.x, part.y);
      g.rotate(part.rotation);
      g.scale(part.scaleX, part.scaleY);
      g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, -part.originX * f.cutWidth, -part.originY * f.cutHeight, f.cutWidth, f.cutHeight);
      g.restore();
    }
    const d = g.getImageData(0, 0, W, H).data;
    const pixels = new Uint32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (d[i * 4 + 3] < 128) continue;
      pixels[i] = ((255 << 24) | (d[i * 4 + 2] << 16) | (d[i * 4 + 1] << 8) | d[i * 4]) >>> 0;
    }
    return { pixels, w: W, h: H, x: -ox, y: -oy };
  }

  private placeHand(h: Phaser.GameObjects.Image, pose: HandPose, x: number, y: number, rot: number): void {
    const a = HAND_ART[pose];
    h.setOrigin(a.ax / a.canvas.width, a.ay / a.canvas.height).setScale(a.scale);
    h.setPosition(x, y);
    h.setRotation(rot);
  }

  destroy(): void {
    this.root.destroy();
    this.shadow.destroy();
  }
}
