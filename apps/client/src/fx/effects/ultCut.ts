import { mixRGB, type RGB, type Surface } from '../surface';

// A hero's ultimate cut-in - "the rift", in the spirit of the Mythoria cut into battle (fx/effects/battleCut.ts),
// drawn on our own engine on a pixel canvas shaped like the screen:
//
//   1. the slash (0 - 0.18 s): the screen dims and a white-hot blade streaks across it on a slant, a glowing line left
//      behind, sparks thrown off its head.
//   2. the tear (0.18 - 0.42 s): the line tears open into a rift - ragged edges, white-hot rims cooling into the hero's
//      element colour, sparks spilling out - and inside it another space: deep ink, the element's light streaming
//      through it. The hero and the move's name show INSIDE the rift (HTML clipped to `rift()`, ui/battleHud.ts).
//   3. the seal (1.3 - 1.52 s): the rift slams shut, its edges flashing white, into a single glowing seam.
//   4. the slide (1.52 - 1.74 s, quick): the seam slides away along its own line and off the screen; the dark lifts.

export const ULT_CUT_DURATION = 1.74;
const SLASH = 0.18, OPEN_AT = 0.18, OPEN_TIME = 0.24, CLOSE_AT = 1.3, CLOSE_TIME = 0.22, SLIDE_AT = 1.52, SLIDE_TIME = 0.22;

const INK: RGB = 0x07060f;
const WHITE: RGB = 0xffffff;
const HOT: RGB = 0xfff2c8;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const outQuart = (t: number) => 1 - (1 - clamp(t)) ** 4;
const outBack = (t: number) => {
  t = clamp(t);
  return 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
};
const inCubic = (t: number) => clamp(t) ** 3;
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  c: RGB;
}

export class UltCut {
  private t = 0;
  private readonly el: RGB;
  private readonly hi: RGB;
  private readonly deep: RGB;
  /** The rift's slope (it rises to the right), its half height when open (px). */
  readonly slope = -0.2;
  private readonly HB: number;
  private readonly sparks: Spark[] = [];
  private rnd: () => number;
  private burstOpen = false;
  private burstClose = false;

  constructor(readonly W: number, readonly H: number, el: RGB, seed = 1, private readonly speed = 1) {
    this.el = el;
    this.hi = mixRGB(el, WHITE, 0.55);
    this.deep = mixRGB(el, INK, 0.8);
    this.HB = Math.round(Math.min(H * 0.21, 74));
    let s = (seed * 9301 + 49297) % 233280 || 1;
    this.rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  }

  get done(): boolean {
    return this.t >= ULT_CUT_DURATION;
  }

  /** The rift's middle line at x. */
  mid(x: number): number {
    return this.H * 0.5 + (x - this.W / 2) * this.slope;
  }

  /** How open the rift is now: its half height (px; 0 shut). The HTML inside is clipped to this. */
  rift(): number {
    const t = this.t;
    if (t < OPEN_AT || t >= CLOSE_AT + CLOSE_TIME) return 0;
    if (t < CLOSE_AT) return this.HB * outBack((t - OPEN_AT) / OPEN_TIME);
    return this.HB * (1 - inCubic((t - CLOSE_AT) / CLOSE_TIME));
  }

  /** The ragged edge's bite at x (px, 0..~4) on one side: it crackles. */
  private jag(x: number, side: number): number {
    const q = Math.floor(x / 3), f = (x % 3) / 3;
    const tick = Math.floor(this.t * 14);
    const a = hash(q, side * 7 + tick * 0.01), b = hash(q + 1, side * 7 + tick * 0.01);
    return (a + (b - a) * f) * 4 + (hash(x, side + tick) > 0.92 ? 2 : 0);
  }

  update(dt: number): void {
    dt *= this.speed;
    this.t += dt;
    const t = this.t, R = this.rnd, W = this.W;
    // sparks off the slash's head
    if (t < SLASH) {
      const hx = W * outQuart(t / SLASH);
      for (let j = 0; j < Math.round(10 * dt * 60); j++)
        this.sparks.push({ x: hx, y: this.mid(hx), vx: -60 - R() * 160, vy: (R() - 0.5) * 220, life: 0.2 + R() * 0.3, age: 0, c: R() < 0.5 ? HOT : this.hi });
    }
    // the tear: sparks spill out of both edges
    if (!this.burstOpen && t >= OPEN_AT) {
      this.burstOpen = true;
      for (let j = 0; j < 70; j++) {
        const x = R() * W, side = R() < 0.5 ? -1 : 1, v = 80 + R() * 240;
        this.sparks.push({ x, y: this.mid(x), vx: (R() - 0.5) * 120, vy: side * v, life: 0.3 + R() * 0.4, age: 0, c: R() < 0.35 ? WHITE : R() < 0.7 ? this.hi : this.el });
      }
    }
    // the seal: a burst along the seam
    if (!this.burstClose && t >= CLOSE_AT + CLOSE_TIME * 0.8) {
      this.burstClose = true;
      for (let j = 0; j < 50; j++) {
        const x = R() * W, side = R() < 0.5 ? -1 : 1, v = 50 + R() * 180;
        this.sparks.push({ x, y: this.mid(x), vx: 40 + R() * 160, vy: side * v * 0.6, life: 0.25 + R() * 0.35, age: 0, c: R() < 0.5 ? WHITE : this.hi });
      }
    }
    for (const p of this.sparks) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.4 * dt;
      p.vy = p.vy * (1 - 2.4 * dt) + 120 * dt;
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) if (this.sparks[i].age >= this.sparks[i].life) this.sparks.splice(i, 1);
  }

  draw(s: Surface): void {
    const { W, H } = this;
    const t = this.t, el = this.el, hi = this.hi;
    // the dark over the battle
    const veil = 0.6 * clamp(t / 0.12) * (1 - clamp((t - SLIDE_AT) / SLIDE_TIME));
    if (veil > 0) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) s.px(x, y, 0x05040c, veil);

    // 1. the slash: a blade of light streaking across, a glowing line left behind
    if (t < OPEN_AT + 0.05) {
      const k = clamp(t / SLASH), head = W * outQuart(k), fade = 1 - clamp((t - OPEN_AT) / 0.05);
      for (let x = 0; x <= head; x++) {
        const y = this.mid(x), near = Math.max(0, 1 - (head - x) / 60);
        s.px(x, y, WHITE, fade);
        s.px(x, y - 1, near > 0.2 ? WHITE : hi, fade * (0.5 + 0.5 * near));
        s.px(x, y + 1, hi, fade * (0.4 + 0.6 * near));
        s.add(x, y - 2, el, 0.5 * fade);
        s.add(x, y + 2, el, 0.5 * fade);
      }
      if (k < 1) {
        s.glow(head, this.mid(head), 22, el, 0.9);
        s.glow(head, this.mid(head), 7, WHITE, 1);
      }
    }

    // 2-3. the rift: torn open, another space inside it, white-hot ragged rims
    const hh = this.rift();
    if (hh > 0.3) {
      const heat = clamp(1 - (t - OPEN_AT) / 0.5) * 0.6 + 0.4;
      const closing = t >= CLOSE_AT ? clamp((t - CLOSE_AT) / CLOSE_TIME) : 0;
      for (let x = 0; x < W; x++) {
        const m = this.mid(x), open = hh / this.HB;
        const top = m - hh - this.jag(x, 1) * open, bot = m + hh + this.jag(x, 2) * open;
        for (let y = Math.floor(top) - 4; y <= Math.ceil(bot) + 4; y++) {
          if (y < 0 || y >= H) continue;
          const dTop = top - y, dBot = y - bot; // > 0: outside that edge
          const out = Math.max(dTop, dBot);
          if (out > 0) {
            // the rim: white-hot, cooling into the element's colour, a dark lip
            if (out < 1.3) s.px(x, y, closing > 0.3 ? WHITE : HOT);
            else if (out < 2.6) s.px(x, y, mixRGB(hi, WHITE, closing));
            else if (out < 4) s.px(x, y, mixRGB(el, 0x0a0812, 0.4), 0.9);
            if (out < 4) s.add(x, y, el, 0.45 * heat * (1 - out / 4));
            continue;
          }
          // inside: deep ink, the element's light streaming through it, brightest along the torn edges
          const inner = Math.min(-dTop, -dBot), f = clamp(inner / Math.max(4, hh * 0.9));
          let c = mixRGB(this.deep, INK, f);
          // drifting bands of light (the other space moving past)
          const band = Math.sin((x * 0.045 - t * 9) + y * 0.12) * Math.sin(x * 0.013 + t * 2);
          if (band > 0.55) c = mixRGB(c, el, (band - 0.55) * 1.1);
          if ((y & 3) === 0) c = mixRGB(c, 0x000000, 0.2);
          s.px(x, y, c);
          if (inner < 3) s.add(x, y, hi, 0.35 * (1 - inner / 3));
        }
      }
      // speed lines streaming through the rift
      for (let i = 0; i < 24; i++) {
        const v = 600 + 420 * hash(i, 3), len = 30 + 70 * hash(i, 4), dyF = (hash(i, 5) * 2 - 1) * 0.8;
        const x0 = W - ((t * v + hash(i, 6) * (W + len)) % (W + len));
        for (let k = 0; k < len; k++) {
          const x = Math.round(x0 + k);
          if (x < 0 || x >= W) continue;
          s.px(x, Math.round(this.mid(x) + dyF * hh), k < 4 ? WHITE : i % 3 === 0 ? hi : el, 1 - k / len);
        }
      }
      // the moment it slams shut: a white flash along it
      if (closing > 0.6) for (let x = 0; x < W; x++) s.add(x, this.mid(x), WHITE, (closing - 0.6) * 2);
    }

    // 4. the seam left by the seal: it slides away along the SAME slant the slash cut (left to right, up the diagonal) -
    // its tail racing after its head, the whole of it fading as it goes, light streaming off its tail along the line
    if (t >= CLOSE_AT + CLOSE_TIME * 0.9 && t < ULT_CUT_DURATION) {
      const k = clamp((t - SLIDE_AT) / SLIDE_TIME), fade = 1 - k * k;
      const tail = inCubic(k) * (W + 40) - 20, len = W * (1 - 0.35 * k);
      const ux = 1 / Math.hypot(1, this.slope), uy = this.slope * ux; // along the slant
      for (let x = Math.max(0, Math.floor(tail)); x < Math.min(W, tail + len); x++) {
        const y = this.mid(x), near = clamp((x - tail) / 30); // thin at its tail
        s.px(x, y, WHITE, fade * near);
        s.px(x, y - 1, hi, fade * 0.8 * near);
        s.px(x, y + 1, hi, fade * 0.8 * near);
        s.add(x, y - 2, el, 0.5 * fade * near);
        s.add(x, y + 2, el, 0.5 * fade * near);
      }
      // streaks of light flying off its tail, along the slant
      if (k > 0 && tail < W)
        for (let i = 0; i < 6; i++) {
          const d = ((t * 420 + i * 23) % 70), o = (hash(i, 9) - 0.5) * 6;
          const x = tail + d, y = this.mid(tail) + uy / ux * d + o;
          s.line(x, y, x - ux * 10, y - uy * 10, i % 2 ? hi : el, (u) => fade * (1 - d / 70) * (1 - u));
        }
      if (tail < W) s.glow(Math.max(0, tail), this.mid(Math.max(0, tail)), 12, el, 0.6 * fade);
    }

    // sparks: a bright head, a short trail
    for (const p of this.sparks) {
      const k = 1 - p.age / p.life;
      s.line(p.x, p.y, p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.c, (u) => k * (1 - u));
      s.px(p.x, p.y, WHITE, k);
      s.add(p.x, p.y, p.c, 0.9 * k);
    }
  }
}
