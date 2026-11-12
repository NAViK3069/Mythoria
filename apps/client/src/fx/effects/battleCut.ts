import { mixRGB, type RGB, type Surface } from '../surface';

// "The Mythoria cut" - our own screen transition into and out of battle, drawn on our own engine (fx/surface.ts).
//
//   1. three cuts (0 - 0.45 s): three blades slash in across the screen in turn - the top band from the left,
//      the middle from the right, the bottom from the left again. Each leading edge is white-hot, cools through
//      gold to the dark cover behind it, pushes light ahead of it and throws gold sparks back.
//   2. the crest (0.4 - 0.75 s): the screen is covered; the seams between the bands glow gold, and a gold
//      diamond crest snaps open in the middle with a cross of light. (The scene swaps under it - COVERED.)
//   3. the release (0.62 - 1.3 s): a white cut races out from the crest along a slant, then the cover splits
//      along it and the two halves slide apart, their cut edges glowing ice-white and gold, sparks spilling out
//      of the seam.
//
// The canvas takes the screen's own shape (W wide, H tall), so nothing is cropped on any screen.

export const CUT_DURATION = 1.24;
/** Fully covered from about here: swap the scene under it. */
export const CUT_COVERED = 0.47;

const INK: RGB = 0x0b0f1c;
const INK_HI: RGB = 0x161d33;
const WHITE: RGB = 0xffffff;
const HOT: RGB[] = [0xfff6d8, 0xffe38a, 0xffc94a, 0xd9932a, 0x8a5a1a, 0x3a2a1a];
const ICE: RGB = 0xbfe8ff;
const GOLD: RGB = 0xffd75a;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const outCubic = (t: number) => 1 - (1 - t) ** 3;
const outQuart = (t: number) => 1 - (1 - t) ** 4;
const inCubic = (t: number) => t * t * t;
const outBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  c: RGB;
}

/** The three bands: rows of the screen, the side each comes from, when it starts. */
const BANDS = [
  { from: -1, start: 0.0 },
  { from: 1, start: 0.07 },
  { from: -1, start: 0.14 },
];
const BAND_TIME = 0.3;
/** How far the leading edge leans (x per y). */
const LEAN = 0.42;
/** The release: when the cut flashes out, when the halves start to part, how long they take. */
const CUT_AT = 0.62, CUT_RUN = 0.08, SPLIT_AT = 0.72, SPLIT_TIME = 0.5;

export class BattleCut {
  private readonly sparks: Spark[] = [];
  private t = 0;
  private rnd: () => number;
  /** The release cut: through the middle, at this slope (radians), its unit direction and normal. */
  private readonly ang: number;
  private readonly ux: number;
  private readonly uy: number;
  private readonly nx: number;
  private readonly ny: number;
  private cutDone = false;
  private splitDone = false;

  constructor(readonly W: number, readonly H: number, seed = 1) {
    let s = (seed * 9301 + 49297) % 233280 || 1;
    this.rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    this.ang = -0.32 + (this.rnd() - 0.5) * 0.16;
    this.ux = Math.cos(this.ang);
    this.uy = Math.sin(this.ang);
    this.nx = -this.uy;
    this.ny = this.ux;
  }

  get done(): boolean {
    return this.t >= CUT_DURATION;
  }

  /** Where band i's leading edge is at row y (its x), and how far along it is (0..1). */
  private edge(i: number, y: number): { x: number; k: number } {
    const b = BANDS[i];
    const k = clamp((this.t - b.start) / BAND_TIME);
    const e = outQuart(k);
    const lean = (y - this.bandMid(i)) * LEAN * b.from;
    // the edge leans up to a sixth of the screen's height either way: it starts that far (and a margin) off one
    // side and ends that far past the other, so a tall screen (a phone held upright) is covered to its corners
    const m = (this.H / 6) * LEAN + 20;
    const span = this.W + 2 * m;
    const x = b.from < 0 ? -m + e * span : this.W + m - e * span;
    return { x: x + lean, k };
  }
  private bandMid(i: number): number {
    return ((i + 0.5) * this.H) / 3;
  }
  private bandOf(y: number): number {
    return Math.min(2, Math.max(0, Math.floor((y * 3) / this.H)));
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t, R = this.rnd;
    // sparks off each blade while it's moving fast
    for (let i = 0; i < 3; i++) {
      const b = BANDS[i];
      const k = (t - b.start) / BAND_TIME;
      if (k < 0 || k > 0.85) continue;
      const n = Math.round((1 - k) * 9 * (dt * 60));
      for (let j = 0; j < n; j++) {
        const y = (i * this.H) / 3 + R() * (this.H / 3);
        const x = this.edge(i, y).x;
        if (x < -4 || x > this.W + 4) continue;
        const sp = 80 + R() * 220;
        this.sparks.push({ x, y, vx: -b.from * sp * (0.4 + R() * 0.6) + b.from * 40, vy: (R() - 0.5) * sp * 0.7, life: 0.18 + R() * 0.3, age: 0, c: HOT[Math.floor(R() * 3)] });
      }
    }
    // the release cut runs out: a burst of sparks along it
    if (!this.cutDone && t >= CUT_AT + CUT_RUN) {
      this.cutDone = true;
      for (let j = 0; j < 40; j++) {
        const s = (R() - 0.5) * this.W * 1.2, x = this.W / 2 + this.ux * s, y = this.H / 2 + this.uy * s;
        const side = R() < 0.5 ? -1 : 1, v = 60 + R() * 160;
        this.sparks.push({ x, y, vx: this.nx * side * v + this.ux * (R() - 0.5) * 80, vy: this.ny * side * v, life: 0.25 + R() * 0.35, age: 0, c: R() < 0.5 ? ICE : HOT[1] });
      }
    }
    // and the halves part: sparks spill out of the seam both ways
    if (!this.splitDone && t >= SPLIT_AT) {
      this.splitDone = true;
      for (let j = 0; j < 60; j++) {
        const s = (R() - 0.5) * this.W * 1.2, x = this.W / 2 + this.ux * s, y = this.H / 2 + this.uy * s;
        const side = R() < 0.5 ? -1 : 1, v = 120 + R() * 260;
        this.sparks.push({ x, y, vx: this.nx * side * v, vy: this.ny * side * v - 20, life: 0.3 + R() * 0.4, age: 0, c: R() < 0.4 ? WHITE : R() < 0.7 ? GOLD : ICE });
      }
    }
    for (const p of this.sparks) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy = p.vy * (1 - 2.2 * dt) + 140 * dt;
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) if (this.sparks[i].age >= this.sparks[i].life) this.sparks.splice(i, 1);
  }

  draw(s: Surface): void {
    const { W, H } = this;
    const t = this.t;
    const splitK = clamp((t - SPLIT_AT) / SPLIT_TIME);
    // how far each half has slid off (along the normal), and a little along the cut, turning away
    const sep = inCubic(splitK) * (H * 0.9 + W * 0.3) + splitK * 6;
    const slide = outCubic(splitK) * 18;
    const cx = W / 2, cy = H / 2;
    const heat = 1 - clamp((t - SPLIT_AT) / 0.45);
    const cutLen = clamp((t - CUT_AT) / CUT_RUN);

    for (let y = 0; y < H; y++) {
      const band = this.bandOf(y + 0.5);
      const e = t < SPLIT_AT ? this.edge(band, y + 0.5) : null;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let d: number; // px behind the leading edge (bands) / from the cut (halves)
        let rimSide = 0;
        if (t < SPLIT_AT) {
          // the bands
          // a band from the left covers what's left of its edge, one from the right what's right of it
          d = (e!.x - (x + 0.5)) * -BANDS[band].from;
          if (d < 0) {
            // light pushed ahead of the blade
            const ahead = -d;
            if (ahead < 16 && e!.k < 1) s.addi(i, HOT[1], 0.5 * (1 - ahead / 16) ** 2);
            continue;
          }
        } else {
          // the halves: which side of the cut this pixel came from, once each half is moved back
          const px = x + 0.5 - cx, py = y + 0.5 - cy;
          const a = (px - this.nx * sep + this.ux * slide) * this.nx + (py - this.ny * sep + this.uy * slide) * this.ny;
          const b = (px + this.nx * sep - this.ux * slide) * this.nx + (py + this.ny * sep - this.uy * slide) * this.ny;
          if (a >= 0) (d = a), (rimSide = 1);
          else if (b < 0) (d = -b), (rimSide = -1);
          else {
            // the gap between them: light pouring out
            const mid = Math.abs(px * this.nx + py * this.ny);
            s.addi(i, ICE, 0.45 * heat * Math.max(0, 1 - mid / (sep + 1)) + 0.15 * heat);
            continue;
          }
        }
        // the cover: ink with a faint woven grain, a white-hot rim cooling to gold at its edge
        let c = (x * 3 + y * 5) % 11 === 0 ? INK_HI : INK;
        if (t < SPLIT_AT && e!.k < 1) {
          // the smear behind a fast blade is long, a slowing one's short
          const L = 8 + 26 * (1 - e!.k);
          if (d < 1.2) c = WHITE;
          else if (d < 2.6) c = HOT[0];
          else if (d < L) c = mixRGB(HOT[Math.min(5, Math.floor(((d - 2.6) / (L - 2.6)) * 5) + 1)], c, Math.max(0, (d - L * 0.6) / (L * 0.4)));
          if (d < 4) s.addi(i, HOT[1], 0.5 * (1 - d / 4));
        } else if (rimSide !== 0 && d < 4 && heat > 0) {
          c = d < 1.2 ? mixRGB(WHITE, ICE, 1 - heat) : d < 2.5 ? mixRGB(GOLD, ICE, 1 - heat) : mixRGB(HOT[3], c, 1 - heat);
          s.addi(i, ICE, 0.25 * heat * (1 - d / 4));
        }
        s.pxi(i, c, 1);
      }
    }

    // the seams between the bands glow gold while the screen is closed
    if (t > 0.3 && t < SPLIT_AT) {
      const k = Math.sin(clamp((t - 0.3) / (SPLIT_AT - 0.3)) * Math.PI) * 0.9;
      for (const yy of [H / 3, (2 * H) / 3]) for (let x = 0; x < W; x++) {
        s.add(x, yy - 0.5, GOLD, 0.6 * k);
        s.add(x, yy + 0.5, HOT[2], 0.25 * k);
      }
    }

    // the crest: a gold diamond snapping open in the middle, a cross of light, then the cut runs out of it
    const ck = clamp((t - 0.38) / 0.22);
    if (ck > 0 && t < SPLIT_AT + 0.06) {
      const r = outBack(ck) * Math.min(W, H) * 0.15;
      const fade = 1 - clamp((t - SPLIT_AT) / 0.06);
      // it spins in, settling square on its corner
      const rot = (1 - outCubic(ck)) * Math.PI * 0.75;
      this.diamond(s, cx, cy, r * 1.3, HOT[3], fade * 0.5, rot * 1.4);
      this.diamond(s, cx, cy, r, GOLD, fade, rot);
      this.diamond(s, cx, cy, r * 0.62, HOT[0], fade * 0.85, -rot);
      this.diamond(s, cx, cy, r * 0.3, WHITE, fade * 0.7, rot * 2);
      // sparkles at its tips
      for (let k = 0; k < 4; k++) {
        const a = rot + (k * Math.PI) / 2 - Math.PI / 2, tw = 0.5 + 0.5 * Math.sin(t * 40 + k * 2);
        const x = cx + Math.cos(a) * r * 1.3, y = cy + Math.sin(a) * r * 1.3;
        s.line(x - 3, y, x + 3, y, WHITE, 0.8 * tw * fade);
        s.line(x, y - 3, x, y + 3, WHITE, 0.8 * tw * fade);
        s.glow(x, y, 5, GOLD, 0.5 * tw * fade);
      }
      const flare = Math.max(0, 1 - Math.abs(ck - 0.55) * 3) * fade;
      if (flare > 0) {
        for (let k = -1; k <= 1; k += 2) {
          s.line(cx, cy, cx + k * r * 3.2, cy, WHITE, (u) => flare * (1 - u));
          s.line(cx, cy, cx, cy + k * r * 2.2, WHITE, (u) => flare * (1 - u));
        }
        s.glow(cx, cy, r * 2.2, HOT[1], 0.5 * flare);
      }
      s.glow(cx, cy, r * 1.4, GOLD, 0.25 * fade);
    }
    // the release cut: a white line racing out both ways from the crest
    if (cutLen > 0 && t < SPLIT_AT + 0.1) {
      const L = cutLen * Math.hypot(W, H) * 0.6, k = 1 - clamp((t - SPLIT_AT) / 0.1);
      for (let u = -L; u <= L; u += 0.5) {
        const x = cx + this.ux * u, y = cy + this.uy * u, taper = 1 - (Math.abs(u) / L) * 0.6;
        s.px(x, y, WHITE, k);
        s.px(x + this.nx, y + this.ny, WHITE, k * taper);
        s.add(x + this.nx * 2, y + this.ny * 2, ICE, 0.7 * k * taper);
        s.add(x - this.nx, y - this.ny, ICE, 0.7 * k * taper);
        s.add(x - this.nx * 2, y - this.ny * 2, ICE, 0.35 * k * taper);
      }
      // the screen flashes as it lands
      if (cutLen >= 1) s.glow(cx, cy, Math.max(W, H) * 0.5, WHITE, 0.25 * k, 0.6);
      s.glow(cx + this.ux * L, cy + this.uy * L, 10, WHITE, 0.6 * k);
      s.glow(cx - this.ux * L, cy - this.uy * L, 10, WHITE, 0.6 * k);
    }

    // sparks: a bright head, a short trail
    for (const p of this.sparks) {
      const k = 1 - p.age / p.life;
      s.line(p.x, p.y, p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.c, (u) => k * (1 - u));
      s.px(p.x, p.y, WHITE, k);
      s.px(p.x + 1, p.y, p.c, k * 0.8);
      s.add(p.x, p.y, p.c, 0.9 * k);
    }
  }

  /** A diamond outline (a square on its corner), radius r. */
  private diamond(s: Surface, x: number, y: number, r: number, c: RGB, a: number, rot = 0): void {
    if (r < 1 || a <= 0) return;
    const pts: [number, number][] = [0, 1, 2, 3, 4].map((k) => {
      const ang = rot + (k * Math.PI) / 2 - Math.PI / 2;
      return [x + Math.cos(ang) * r, y + Math.sin(ang) * r];
    });
    for (let i = 0; i < 4; i++) {
      s.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, a);
      s.line(pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, c, a * 0.6);
    }
    s.glow(pts[0][0], pts[0][1], 4, c, 0.4 * a);
  }
}
