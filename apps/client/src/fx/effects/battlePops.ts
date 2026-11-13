import { dither, LOOKS, paintMask, paintText, textMask, type TextLook } from '../pixelFont';
import { mixRGB, type RGB, type Surface } from '../surface';

// The battle's pixel effects - our own, drawn on our engine (fx/surface.ts) in world pixels (1 unit = 1 px of the
// battle map), so they are exactly as crisp as the fighters. fx/BattleLayer.ts runs them over the field.
//
//   DamagePop  a number bursts out big and hollow, snaps to size with a flash, a shockwave ring and sparks,
//              floats up and dithers away. A crit is bigger: a spiky orange starburst behind it, a red CRIT tag
//              above, a gold ring - and it burns out to a hollow white number and a last glow.
//   ComboBanner "×5 COMBO" glitches in on speed lines, pulses a ring, fills its bar, glitches out.
//   Alert      a gold "!" springs up with a sparkle and bursts away.
//   Pillar     a column of light from the ground, rings spreading round its foot, the word's letters dropping
//              in one by one with rays behind them; the column burns away to sparks, the letters slide off.
//   Slash / Impact / Bolt   a blade's arc, the flash and sparks where a blow lands, a shot with its trail.

export interface Pop {
  update(dt: number): void;
  draw(s: Surface): void;
  readonly done: boolean;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const outCubic = (t: number) => 1 - (1 - clamp(t)) ** 3;
const outBack = (t: number) => {
  const k = clamp(t) - 1;
  return 1 + 2.70158 * k ** 3 + 1.70158 * k ** 2;
};
const inQuad = (t: number) => clamp(t) ** 2;

export const hexRGB = (hex: string): RGB => parseInt(hex.replace('#', ''), 16);

// ---------------------------------------------------------------- shared bits

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  c: RGB;
  g: number;
  drag: number;
}

/** A handful of sparks, stepped and drawn with a short trail (and a little light). */
export class Sparks {
  readonly list: Spark[] = [];
  burst(x: number, y: number, n: number, colours: RGB[], speed: [number, number], o: { up?: number; spread?: number; dir?: number; g?: number; life?: [number, number]; drag?: number } = {}): void {
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + (Math.random() - 0.5) * (o.spread ?? 1) : Math.random() * Math.PI * 2;
      const v = speed[0] + Math.random() * (speed[1] - speed[0]);
      const life = o.life ?? [0.25, 0.55];
      this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 0), age: 0, life: life[0] + Math.random() * (life[1] - life[0]), c: colours[i % colours.length], g: o.g ?? 90, drag: o.drag ?? 2.2 });
    }
  }
  update(dt: number): void {
    for (const p of this.list) {
      p.age += dt;
      p.vx *= Math.exp(-p.drag * dt);
      p.vy = p.vy * Math.exp(-p.drag * dt) + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].age >= this.list[i].life) this.list.splice(i, 1);
  }
  draw(s: Surface): void {
    for (const p of this.list) {
      const k = 1 - p.age / p.life;
      const sp = Math.hypot(p.vx, p.vy);
      // a streak back along its path when it's quick
      const n = sp > 40 ? 2 : 1;
      for (let j = n; j >= 0; j--) {
        const x = p.x - (p.vx / Math.max(sp, 1)) * j, y = p.y - (p.vy / Math.max(sp, 1)) * j;
        if (j === 0) {
          s.px(x, y, k > 0.6 ? mixRGB(p.c, 0xffffff, 0.6) : p.c, 1);
          s.add(x, y, p.c, 0.35 * k);
        } else if (dither(Math.floor(x), Math.floor(y), k * 0.8)) s.px(x, y, mixRGB(p.c, 0x000000, 0.2), 0.8);
      }
    }
  }
  get empty(): boolean {
    return this.list.length === 0;
  }
}

/** An ellipse ring, dithered by show (0..1). */
export function ring(s: Surface, cx: number, cy: number, rx: number, ry: number, c: RGB, show: number, light = 0): void {
  if (show <= 0 || rx < 0.5) return;
  const n = Math.max(12, Math.ceil(Math.PI * 2 * Math.max(rx, ry)));
  let lx = NaN, ly = NaN;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    if (x === lx && y === ly) continue;
    lx = x;
    ly = y;
    if (!dither(x, y, show)) continue;
    s.px(x, y, c);
    if (light) s.add(x, y, c, light);
  }
}

/** A four-point twinkle (a cross with a bright middle), r its arm length. */
export function twinkle(s: Surface, x: number, y: number, r: number, c: RGB, k = 1): void {
  const X = Math.round(x), Y = Math.round(y);
  s.px(X, Y, 0xffffff, k);
  s.add(X, Y, c, 0.8 * k);
  for (let i = 1; i <= r; i++) {
    const a = k * (1 - i / (r + 1));
    for (const [dx, dy] of [[i, 0], [-i, 0], [0, i], [0, -i]]) {
      s.px(X + dx, Y + dy, i === 1 ? 0xffffff : c, a);
      s.add(X + dx, Y + dy, c, 0.3 * a);
    }
  }
}

/** A filled spiky star: n points, radii r0 (inner) .. r1 (outer), turned by rot. */
function starburst(s: Surface, cx: number, cy: number, r0: number, r1: number, n: number, rot: number, ramp: RGB[], outline: RGB, show = 1): void {
  const R = Math.ceil(r1) + 1;
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      const a = Math.atan2(y + 0.5, x + 0.5) - rot;
      // a triangle wave round the circle: points at the peaks
      const w = Math.abs((((a / (Math.PI * 2)) * n) % 1 + 1) % 1 - 0.5) * 2;
      const r = r0 + (r1 - r0) * w;
      if (d > r) continue;
      const X = Math.round(cx) + x, Y = Math.round(cy) + y;
      if (!dither(X, Y, show)) continue;
      if (d > r - 1) s.px(X, Y, outline);
      else {
        const f = clamp(d / r) * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(f));
        s.px(X, Y, mixRGB(ramp[i], ramp[i + 1], f - i));
      }
    }
}

/** A small up / down arrow (a weak or a resisted hit). */
function arrow(s: Surface, x: number, y: number, up: boolean, c: RGB, show: number): void {
  const rows = up ? ['..#..', '.###.', '#####', '.###.'] : ['.###.', '#####', '.###.', '..#..'];
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    const X = Math.round(x) + i - 2, Y = Math.round(y) + j - 2;
    if (ch === '#' && dither(X, Y, show)) s.px(X, Y, c);
  }));
}

// ---------------------------------------------------------------- damage numbers

export type PopKind = 'dmg' | 'crit' | 'heal' | 'shield' | 'miss' | 'word' | 'good';

const RING_COLOUR: Record<PopKind, RGB> = { dmg: 0xff8a70, crit: 0xffd75a, heal: 0x7affa0, shield: 0x9ad8ff, miss: 0xdfe6f0, word: 0xffffff, good: 0x9affc0 };
const LOOK_OF: Record<PopKind, TextLook> = { dmg: LOOKS.dmg, crit: LOOKS.crit, heal: LOOKS.heal, shield: LOOKS.shield, miss: LOOKS.miss, word: LOOKS.white, good: LOOKS.heal };

export class DamagePop implements Pop {
  private t = 0;
  private readonly sparks = new Sparks();
  private sparked = false;
  private readonly life: number;
  private readonly big: boolean;

  /**
   * text: what to show ("128", "MISS"...); x, y: where (its middle); delay: seconds before it appears; mark: a
   * small arrow after it (up: a weak spot hit, down: resisted).
   */
  constructor(private readonly x: number, private readonly y: number, private readonly text: string, private readonly kind: PopKind, private delay = 0, private readonly mark: 'up' | 'down' | null = null) {
    this.big = kind === 'crit';
    this.life = this.big ? 1.45 : kind === 'word' || kind === 'good' || kind === 'miss' ? 1.05 : 1.15;
  }

  get done(): boolean {
    return this.t >= this.life && this.sparks.empty;
  }

  update(dt: number): void {
    if (this.delay > 0) {
      this.delay -= dt;
      return;
    }
    this.t += dt;
    if (!this.sparked && this.t >= 0.06 && this.kind !== 'word' && this.kind !== 'miss') {
      this.sparked = true;
      const c = RING_COLOUR[this.kind];
      this.sparks.burst(this.x, this.y, this.big ? 16 : 7, this.big ? [0xffffff, 0xffd75a, 0xff9a1e] : [0xffffff, c], this.big ? [70, 150] : [45, 95], { g: 120, life: [0.25, 0.6] });
    }
    this.sparks.update(dt);
  }

  draw(s: Surface): void {
    if (this.delay > 0) return;
    const t = this.t;
    const word = this.kind === 'word' || this.kind === 'good' || this.kind === 'miss';
    const mask = word ? textMask(this.text, false, 1) : this.big ? textMask(this.text, false, 2) : textMask(this.text, true, 1);
    const look = LOOK_OF[this.kind];
    // rises a little, then drifts on up as it dithers away
    const fadeAt = this.life - (this.big ? 0.42 : 0.3);
    const fade = clamp((t - fadeAt) / (this.life - fadeAt));
    const cx = this.x;
    const cy = this.y - outCubic(t / 0.7) * (this.big ? 6 : 8) - inQuad(fade) * 6;
    // the pop: hollow and big, then snapping down to size with a flash
    const P = this.big ? 0.24 : 0.18;
    const start = word ? 1.5 : this.big ? 2.3 : 1.9;
    const scale = t < 0.05 ? start : t < P ? start + (1 - start) * outBack((t - 0.05) / (P - 0.05)) : 1;
    const flash = t < P ? 1 - (t - 0.05) / (P - 0.05) : 0;
    const hollow = t < 0.05;

    // the shockwave ring
    if (!word) {
      const rk = clamp((t - 0.04) / (this.big ? 0.42 : 0.32));
      if (rk > 0 && rk < 1) {
        const R = (this.big ? 6 : 4) + outCubic(rk) * (this.big ? 22 : 13);
        ring(s, cx, cy, R, R * 0.6, RING_COLOUR[this.kind], 1 - rk, 0.4);
        if (this.big) ring(s, cx, cy, R * 0.7, R * 0.42, 0xffffff, (1 - rk) * 0.7, 0.3);
      }
    }
    if (this.big) this.drawCrit(s, cx, cy, t, fade, mask.w);
    // the glow behind it as it lands
    if (t < 0.35 && !word) s.glow(cx, cy, (this.big ? 16 : 9) * (1 + t), RING_COLOUR[this.kind], (0.35 - t) * (this.big ? 1.4 : 0.9), 0.7);
    // a crit burns out: hollow white for its last moments
    const burnt = this.big && t > this.life - 0.42 && t < this.life - 0.2;
    paintMask(s, mask, cx, cy, burnt ? LOOKS.white : look, { scale, flash, hollow: hollow || burnt, show: 1 - fade, slant: this.big || !word ? 0.18 : 0 });
    if (this.mark && !hollow) arrow(s, cx + (mask.w * scale) / 2 + 4, cy - 1, this.mark === 'up', this.mark === 'up' ? 0xffd75a : 0x9aa6b8, 1 - fade);
    this.sparks.draw(s);
  }

  /** The crit's starburst, its CRIT tag, its last glow. */
  private drawCrit(s: Surface, cx: number, cy: number, t: number, fade: number, w: number): void {
    const on = clamp((t - 0.06) / 0.14);
    const off = clamp((t - (this.life - 0.55)) / 0.2);
    if (on > 0 && off < 1) {
      const pulse = 1 + Math.sin(t * 30) * 0.05;
      const r1 = (w * 0.62 + 4) * outBack(on) * pulse;
      starburst(s, cx, cy + 1, r1 * 0.5, r1, 11, t * 0.8, [0xffe27a, 0xff9a1e, 0xe0501a, 0xa02a10], 0x3a1206, 1 - off);
      // a few longer rays out of it
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + t * 0.6;
        const L = r1 + 3 + Math.sin(t * 20 + i) * 2;
        s.line(cx + Math.cos(a) * r1 * 0.8, cy + Math.sin(a) * r1 * 0.8, cx + Math.cos(a) * L, cy + Math.sin(a) * L, 0xffe27a, (u) => (1 - u) * (1 - off));
      }
    }
    // the tag
    const tk = clamp((t - 0.12) / 0.12);
    if (tk > 0 && fade < 1 && t < this.life - 0.42) {
      const tag = textMask('CRIT', false, 1);
      const shake = t < 0.4 ? Math.round(Math.sin(t * 90) * 1) : 0;
      const tx = Math.round(cx - 2 + shake), ty = Math.round(cy - 13 - (1 - outBack(tk)) * 4);
      const hw = Math.ceil(tag.w / 2) + 2, hh = 5;
      for (let y = -hh; y <= hh; y++)
        for (let x = -hw; x <= hw; x++) {
          const edge = Math.abs(x) === hw || Math.abs(y) === hh;
          if (edge && Math.abs(x) === hw && Math.abs(y) === hh) continue;
          s.px(tx + x, ty + y, edge ? 0x2a0606 : y < -1 ? 0xff5a48 : y < 2 ? 0xe02a2a : 0xa81a22);
        }
      paintMask(s, tag, tx, ty, LOOKS.white, { scale: 1 });
    }
    // the last glow where it was
    const gk = clamp((t - (this.life - 0.25)) / 0.25);
    if (gk > 0) {
      s.glow(cx, cy, 8 + gk * 8, 0xffd75a, (1 - gk) * 0.9, 0.7);
      ring(s, cx, cy, 6 + gk * 14, (6 + gk * 14) * 0.55, 0xffd75a, 1 - gk, 0.3);
    }
  }
}

// ---------------------------------------------------------------- combo

/** The combo's colours: yellow at the start, through orange, to red as it climbs (red from COMBO_RED hits). */
const COMBO_YELLOW = { ramp: [0xffffff, 0xfff4b0, 0xffd75a, 0xe8a020, 0x9a5a10], outline: 0x2a1804, shadow: 0x140c02, glow: 0xffc83a, dark: 0x4a3008 };
const COMBO_RED = { ramp: [0xffffff, 0xffc8b8, 0xff5a48, 0xd02030, 0x7a0a1a], outline: 0x2a0408, shadow: 0x140204, glow: 0xff3a2a, dark: 0x4a0a10 };
const COMBO_FROM = 2, COMBO_TO = 12;
function comboLook(count: number): { look: TextLook; glow: RGB; dark: RGB; edge: RGB } {
  const k = clamp((count - COMBO_FROM) / (COMBO_TO - COMBO_FROM));
  const m = (a: RGB, b: RGB) => mixRGB(a, b, k);
  return {
    look: { ramp: COMBO_YELLOW.ramp.map((c, i) => m(c, COMBO_RED.ramp[i])), outline: m(COMBO_YELLOW.outline, COMBO_RED.outline), shadow: m(COMBO_YELLOW.shadow, COMBO_RED.shadow) },
    glow: m(COMBO_YELLOW.glow, COMBO_RED.glow),
    dark: m(COMBO_YELLOW.dark, COMBO_RED.dark),
    edge: m(COMBO_YELLOW.outline, COMBO_RED.outline),
  };
}

/**
 * "×n COMBO": slides in from the left (the speed lines stream back behind it, as if it's rushing right), a
 * glitch as it lands; each new hit pops the number; it goes on off to the right as it fades. Yellow at first,
 * redder the higher it climbs.
 */
export class ComboBanner implements Pop {
  private t = 0;
  private bumpT = 1;
  private hold = 1.25;
  private readonly lines: { x: number; y: number; v: number; len: number; c: RGB }[] = [];
  count: number;

  /** (x, y): its middle - placed by the layer up over the field. */
  constructor(public x: number, public y: number, count: number) {
    this.count = count;
    this.streak(14);
  }

  /** More hits: the number pops again and it stays a while longer. */
  bump(count: number): void {
    this.count = count;
    this.bumpT = 0;
    this.hold = this.t + 1.0;
    this.streak(6);
  }

  private streak(n: number): void {
    for (let i = 0; i < n; i++)
      this.lines.push({ x: this.x + (Math.random() - 0.3) * 80, y: this.y + Math.round((Math.random() - 0.5) * 22), v: 260 + Math.random() * 200, len: 6 + Math.random() * 18, c: Math.random() < 0.5 ? comboLook(this.count).glow : 0xffffff });
  }

  get leaving(): boolean {
    return this.t > this.hold;
  }

  get done(): boolean {
    return this.t > this.hold + 0.3;
  }

  update(dt: number): void {
    this.t += dt;
    this.bumpT += dt;
    for (const l of this.lines) l.x -= l.v * dt;
    for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i].x < this.x - 90) this.lines.splice(i, 1);
    if (this.leaving && this.lines.length < 6 && Math.random() < 0.5) this.streak(2);
  }

  draw(s: Surface): void {
    const t = this.t;
    const inK = clamp(t / 0.16);
    const outK = clamp((t - this.hold) / 0.3);
    const glitch = inK < 1 || outK > 0;
    const seed = Math.floor(t * 30);
    const shift = glitch ? (y: number) => ((((y >> 1) * 7919 + seed * 104729) % 13) - 6) * (inK < 1 ? 1 - inK : outK) * 1.6 : undefined;
    const show = inK * (1 - outK);
    const c = comboLook(this.count);
    // it slides in from the left (fast, settling), and on out to the right as it goes
    const cx = this.x - Math.round((1 - outCubic(clamp(t / 0.22))) * 46) + Math.round(outK * outK * 24);
    // speed lines
    for (const l of this.lines) s.line(l.x, l.y, l.x + l.len, l.y, l.c, (u) => (1 - u) * 0.9);
    const num = textMask(`×${this.count}`, false, 2);
    const word = textMask('COMBO', false, 1);
    const bump = this.bumpT < 0.2 ? 1 + 0.6 * (1 - outBack(this.bumpT / 0.2)) : 1;
    const W = num.w + 3 + word.w;
    const nx = cx - W / 2 + num.w / 2, wx = cx - W / 2 + num.w + 3 + word.w / 2;
    // the ring pulse
    const rk = clamp((t - 0.12) / 0.4);
    if (rk > 0 && rk < 1) ring(s, cx, this.y + 1, W * 0.55 + rk * 12, 9 + rk * 5, mixRGB(c.glow, 0xffffff, 0.3), 1 - rk, 0.5);
    if (t < 0.5) s.glow(cx, this.y, W * 0.6, c.glow, (0.5 - t) * 1.2, 0.35);
    paintMask(s, num, nx, this.y, c.look, { scale: bump, show, slant: 0.25, rowShift: shift, flash: this.bumpT < 0.12 ? 1 - this.bumpT / 0.12 : 0 });
    paintMask(s, word, wx, this.y + 2, c.look, { show, slant: 0.2, rowShift: shift });
    // its bar: fills under the word
    const bk = outCubic((t - 0.18) / 0.4);
    const bx0 = Math.round(wx - word.w / 2) - 1, by = Math.round(this.y + 2 + word.h / 2) + 2, bw = word.w + 2;
    for (let i = -1; i <= bw; i++) {
      const X = bx0 + i + (shift ? Math.round(shift(by)) : 0);
      if (!dither(X, by, show)) continue;
      s.px(X, by - 1, c.edge);
      s.px(X, by + 1, c.edge);
      s.px(X, by, i >= 0 && i < bw * bk ? (i > bw * bk - 3 ? 0xffffff : c.look.ramp[2]) : c.dark);
    }
  }
}

// ---------------------------------------------------------------- "!"

export class Alert implements Pop {
  private t = 0;
  private readonly sparks = new Sparks();
  private burst = false;
  constructor(private readonly at: () => { x: number; y: number }, private readonly life = 1.0) {}

  get done(): boolean {
    return this.t > this.life + 0.3 && this.sparks.empty;
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.burst && this.t > this.life) {
      this.burst = true;
      const p = this.at();
      this.sparks.burst(p.x, p.y, 8, [0xffe27a, 0xffffff], [25, 55], { g: 30, life: [0.2, 0.4] });
    }
    this.sparks.update(dt);
  }

  draw(s: Surface): void {
    const { x, y } = this.at();
    const t = this.t;
    if (t < 0.12) s.glow(x, y, 4 + t * 30, 0xffd75a, 0.9, 1);
    if (t >= 0.08 && t < this.life) {
      const k = (t - 0.08) / 0.18;
      // springs up, leans, settles
      const sc = k < 1 ? 0.4 + 0.6 * outBack(k) : 1;
      const lean = k < 1 ? (1 - k) * 0.5 : Math.sin(t * 12) * 0.03;
      paintText(s, '!', x, y - (k < 1 ? (1 - k) * 3 : Math.sin(t * 6) * 0.6), LOOKS.gold, { bold: true, size: 2, scale: sc, slant: lean, flash: k < 1 ? 1 - k : 0 });
      // sparkle rays, blinking
      if (Math.floor(t * 10) % 2 === 0 || t < 0.4)
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.5;
          const r = 9 + ((t * 20 + i) % 3);
          s.px(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, 0xffe27a, 0.9);
          s.add(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, 0xffd75a, 0.3);
        }
    }
    if (t >= this.life) s.glow(x, y, 6 + (t - this.life) * 20, 0xffd75a, (1 - (t - this.life) / 0.3) * 0.8, 1);
    this.sparks.draw(s);
  }
}

// ---------------------------------------------------------------- light pillar + a word

export class Pillar implements Pop {
  private t = 0;
  private readonly sparks = new Sparks();
  private readonly letters: { ch: string; dx: number; w: number }[] = [];
  private readonly width: number;
  private lastPuff = 0;

  /**
   * (x, y): the foot of the column; text: the word over it. look: its colours; colour: the light's. big: the
   * letters at double size (VICTORY!).
   */
  constructor(private readonly x: number, private readonly y: number, readonly text: string, private readonly look: TextLook = LOOKS.gold, private readonly colour: RGB = 0xffd75a, private readonly big = false, private readonly height = 46) {
    const size = big ? 2 : 1;
    let w = 0;
    for (const ch of text) {
      const m = textMask(ch, false, size);
      this.letters.push({ ch, dx: w, w: m.w });
      w += m.w + (ch === ' ' ? 0 : 1);
    }
    this.width = w;
  }

  private get life(): number {
    return 1.8 + this.letters.length * 0.05;
  }

  get done(): boolean {
    return this.t > this.life && this.sparks.empty;
  }

  update(dt: number): void {
    this.t += dt;
    // the column burns away into sparks rising from it
    if (this.t > 0.5 && this.t < 1.4 && this.t - this.lastPuff > 0.04) {
      this.lastPuff = this.t;
      this.sparks.burst(this.x + (Math.random() - 0.5) * 10, this.y - Math.random() * this.height, 1, [this.colour, 0xffffff], [6, 18], { dir: -Math.PI / 2, spread: 1.2, g: -30, life: [0.4, 0.8], drag: 1 });
    }
    this.sparks.update(dt);
  }

  draw(s: Surface): void {
    const t = this.t, x = this.x, y = this.y, H = this.height;
    // rings spreading round its foot
    for (let i = 0; i < 2; i++) {
      const k = clamp((t - 0.05 - i * 0.18) / 0.7);
      if (k > 0 && k < 1) ring(s, x, y, 6 + outCubic(k) * 20, (6 + outCubic(k) * 20) * 0.32, this.colour, 1 - k, 0.4);
    }
    // the column: grows up out of the ground, stands, burns thin and away
    const grow = outCubic(t / 0.18);
    const fade = clamp((t - 0.55) / 0.55);
    if (fade < 1) {
      const half = (4 + 3 * Math.sin(Math.min(1, t / 0.25) * Math.PI)) * (1 - fade * 0.6);
      const top = y - H * grow;
      for (let yy = Math.floor(top); yy <= y; yy++) {
        const v = (y - yy) / H; // 0 at the ground
        const taper = 1 - v * 0.35;
        const hw = half * taper;
        for (let xx = Math.floor(x - hw - 2); xx <= Math.ceil(x + hw + 2); xx++) {
          const d = Math.abs(xx + 0.5 - x) / Math.max(0.5, hw);
          const edgeFade = clamp((yy - top) / 6);
          const k = (1 - fade) * edgeFade * clamp(1.2 - d) * (0.6 + 0.4 * Math.sin(yy * 0.7 - t * 18));
          if (k <= 0) continue;
          if (d < 0.35 && dither(xx, yy, (1 - fade) * edgeFade)) s.px(xx, yy, 0xfffbe8, 0.9);
          s.add(xx, yy, d < 0.6 ? 0xffffff : this.colour, k * (d < 0.6 ? 0.55 : 0.4));
        }
      }
      s.glow(x, y - 2, 14, this.colour, (1 - fade) * 0.7, 0.4);
    }
    // the word: letters drop in one by one; rays behind them; they slide off one by one at the end
    const ty = y - H * 0.62;
    const size = this.big ? 2 : 1;
    const rays = clamp((t - 0.45) / 0.3) * (1 - clamp((t - (this.life - 0.6)) / 0.4));
    if (rays > 0)
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + t * 0.4;
        const r0 = this.width * 0.3, r1 = this.width * 0.55 + 6 + Math.sin(t * 7 + i * 2) * 3;
        s.line(x + Math.cos(a) * r0, ty + Math.sin(a) * r0 * 0.55, x + Math.cos(a) * r1, ty + Math.sin(a) * r1 * 0.55, this.colour, (u) => (1 - u) * rays * 0.5);
      }
    this.letters.forEach((l, i) => {
      if (l.ch === ' ') return;
      const k = (t - 0.28 - i * 0.05) / 0.18;
      if (k <= 0) return;
      const out = clamp((t - (this.life - 0.55) - i * 0.03) / 0.22);
      if (out >= 1) return;
      const lx = x - this.width / 2 + l.dx + l.w / 2 + out * 10;
      const ly = ty - (k < 1 ? (1 - outBack(k)) * 10 : 0) + (k >= 1 ? Math.sin(t * 5 + i * 0.6) * 0.5 : 0);
      paintText(s, l.ch, lx, ly, this.look, { size, flash: k < 1 ? 1 - k : 0, show: 1 - out, scale: k < 1 ? 1 + (1 - k) * 0.6 : 1 });
      if (k < 1.2 && k > 0.8) twinkle(s, lx + l.w / 2, ly - 3 * size, 2, this.colour);
    });
    this.sparks.draw(s);
  }
}

// ---------------------------------------------------------------- the special team: the summoning sigil

/**
 * Where a hero of the special team is called in - our own sigil, after the owner's reference:
 *   1. gathering (0 - 0.35 s): motes of light drift in from all round and settle into a ring on the ground;
 *   2. the sigil (0.3 - 0.7 s): the ring brightens, a second ring and runes draw in round it, a six-point star
 *      inside, turning the other way - a soft glow on the ground;
 *   3. the beam (beam()): a column of light comes down onto it - a white core, violet sides - a flash and a ring
 *      bursting out where it lands, motes streaming up it; the hero appears inside it; then the beam thins to a
 *      thread and goes by itself (only the arrival) - the circle stays, dimmer, under the hero while it acts;
 *   4. close(): the sigil flashes and shrinks away into motes.
 * Two layers: `ground` (the circle, under the fighters - BattleStage puts it on its ground layer) and this one (the
 * beam and the light, over everything).
 */
/** How long the beam stands after it lands (then it thins away by itself). */
const BEAM_HOLD = 0.5;
/** How long the aimed move's preview takes to fade one way (s) - on the fighters' bars here and on the card
 * (ui/battle.css tp-blink / tp-chip, kept in step by syncBlinks in battleHud.ts). */
export const PREVIEW_BLINK = 0.45;
/** The page's own clock (s) - what CSS animations run on too, so the bars and the card blink together. */
export const pageClock = () => (document.timeline?.currentTime != null ? Number(document.timeline.currentTime) : performance.now()) / 1000;
/** The aimed move's preview on a fighter's bar: how white it is (1 .. 0.25) at page time t, fading in and out
 * PREVIEW_BLINK s each way - in step with the card's preview. */
export const previewPulse = (t: number) => 0.25 + 0.75 * (0.5 + 0.5 * Math.cos((Math.PI * t) / PREVIEW_BLINK));
/** How fast the whole summon plays (gather, beam, landing, warp-out) - BattleStage paces its waits by it too. */
export const SUMMON_SPEED = 1.6;

export class SummonCircle implements Pop {
  private t = 0;
  private beamAt = -1;
  private closedAt = -1;
  private readonly sparks = new Sparks();
  private lastMote = 0;
  private readonly motes: { a: number; r: number; d: number; delay: number }[] = [];
  /** The ground part, for the layer under the fighters. */
  readonly ground: Pop;

  constructor(private readonly x: number, private readonly y: number, private readonly colour: RGB = 0xb48aff, private readonly height = 60) {
    for (let i = 0; i < 26; i++) this.motes.push({ a: (i / 26) * Math.PI * 2 + Math.random() * 0.2, r: 18 + Math.random() * 22, d: Math.random() * 6, delay: Math.random() * 0.12 });
    const self = this;
    this.ground = { update: () => undefined, draw: (s: Surface) => self.drawGround(s), get done() { return self.done; } };
  }

  /** The column of light comes down. */
  beam(): void {
    if (this.beamAt >= 0) return;
    this.beamAt = this.t;
  }

  /** Going back: the beam shoots up off the circle (the hero goes up in it), then the circle folds into motes. */
  close(): void {
    if (this.closedAt >= 0) return;
    this.closedAt = this.t;
    this.sparks.burst(this.x, this.y - 4, 18, [0xffffff, this.colour, 0xe8d8ff], [30, 80], { dir: -Math.PI / 2, spread: 2.8, g: -20, life: [0.3, 0.8], drag: 1.6 });
    // motes streaming up the departing beam
    this.sparks.burst(this.x, this.y - 6, 14, [0xffffff, this.colour], [60, 120], { dir: -Math.PI / 2, spread: 0.25, g: -40, life: [0.4, 0.8], drag: 0.5 });
  }

  get done(): boolean {
    return this.closedAt >= 0 && this.t - this.closedAt > 0.95 && this.sparks.empty;
  }

  private get open(): number {
    const shut = this.closedAt >= 0 ? 1 - clamp((this.t - this.closedAt - 0.45) / 0.4) : 1;
    return outBack(clamp((this.t - 0.25) / 0.3)) * shut;
  }

  update(rawDt: number): void {
    // its own clock runs faster than the battle's (SUMMON_SPEED): every step of it, sparks included
    const dt = rawDt * SUMMON_SPEED;
    this.t += dt;
    const beaming = this.beamAt >= 0 && this.closedAt < 0 && this.t - this.beamAt < BEAM_HOLD + 0.2;
    // motes: off the ring while it's open, up the beam while it shines
    if (this.closedAt < 0 && this.t > 0.35 && this.t - this.lastMote > (beaming ? 0.025 : 0.06)) {
      this.lastMote = this.t;
      if (beaming) this.sparks.burst(this.x + (Math.random() - 0.5) * 8, this.y - Math.random() * 10, 1, [0xffffff, this.colour], [30, 70], { dir: -Math.PI / 2, spread: 0.3, g: -60, life: [0.4, 0.9], drag: 0.6 });
      else {
        const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 12;
        this.sparks.burst(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.36, 1, [this.colour, 0xffffff], [8, 20], { dir: -Math.PI / 2, spread: 0.6, g: -30, life: [0.4, 0.8], drag: 1 });
      }
    }
    // where the beam lands: a burst
    if (this.beamAt >= 0 && this.t - this.beamAt >= 0.12 && this.t - this.beamAt < 0.12 + dt)
      this.sparks.burst(this.x, this.y - 2, 16, [0xffffff, this.colour, 0xe8d8ff], [40, 100], { g: 80, life: [0.2, 0.5] });
    this.sparks.update(dt);
  }

  /** The circle on the ground (under the fighters). */
  private drawGround(s: Surface): void {
    const t = this.t, x = this.x, y = this.y, sq = 0.36;
    // 1. gathering: motes drifting in to the ring
    const gather = clamp((t - 0.0) / 0.35);
    if (gather < 1)
      for (const m of this.motes) {
        const k = outCubic(clamp((t - m.delay) / 0.3));
        const r = m.r + (16 - m.r) * k, a = m.a + k * 0.8;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * sq - (1 - k) * m.d;
        s.px(px, py, k > 0.8 ? 0xffffff : this.colour, 0.4 + 0.6 * k);
        s.add(px, py, this.colour, 0.4 * k);
      }
    const k = this.open;
    if (k <= 0.02) return;
    const R = 17 * k;
    const lit = this.closedAt >= 0 ? 1 : this.beamAt >= 0 ? 1 - 0.4 * clamp((t - this.beamAt - BEAM_HOLD) / 0.4) : 0.6;
    s.glow(x, y, R + 8, this.colour, (0.6 + 0.5 * lit) * k, 0.4);
    // the rings
    ring(s, x, y, R, R * sq, mixRGB(this.colour, 0xffffff, 0.2 * lit), 1, 0.5 * lit);
    ring(s, x, y, R - 3.5, (R - 3.5) * sq, mixRGB(this.colour, 0xffffff, 0.55), 0.9, 0.3);
    if (t > 0.5) ring(s, x, y, R + 3, (R + 3) * sq, this.colour, clamp((t - 0.5) / 0.2) * 0.7, 0.2);
    // runes round it, turning
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + t * 1.2;
      const rx = x + Math.cos(a) * (R - 1.7), ry = y + Math.sin(a) * (R - 1.7) * sq;
      if (i % 2 === 0) twinkle(s, rx, ry, 1, this.colour, k);
      else s.px(rx, ry, 0xffffff, 0.9 * k);
    }
    // the six-point star, turning the other way
    const r2 = R - 5;
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 - t * 0.8;
      return [x + Math.cos(a) * r2, y + Math.sin(a) * r2 * sq] as const;
    });
    for (let i = 0; i < 6; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 2) % 6];
      s.line(ax, ay, bx, by, mixRGB(this.colour, 0xffffff, 0.35), 0.85 * k);
    }
    // a ring bursting out where the beam lands
    if (this.beamAt >= 0) {
      const b = clamp((t - this.beamAt - 0.1) / 0.45);
      if (b > 0 && b < 1) ring(s, x, y, R + b * 22, (R + b * 22) * sq, 0xffffff, 1 - b, 0.5);
    }
    // closing: a last flash
    if (this.closedAt >= 0) {
      const f = clamp((t - this.closedAt - 0.45) / 0.2);
      if (f < 1) s.glow(x, y, R + 6, 0xffffff, (1 - f) * 0.8, 0.4);
    }
  }

  /**
   * The beam and the light (over everything): on arrival it comes down from above onto the circle, on departure it
   * shoots up off it - each holds a moment and thins to a thread by itself.
   */
  draw(s: Surface): void {
    if (this.beamAt >= 0) this.drawBeam(s, this.t - this.beamAt, false);
    if (this.closedAt >= 0) this.drawBeam(s, this.t - this.closedAt, true);
    this.sparks.draw(s);
  }

  /** One beam, bt seconds after it started; up: rising off the ground (going back) rather than coming down. */
  private drawBeam(s: Surface, bt: number, up: boolean): void {
    const t = this.t, x = this.x, y = this.y, H = this.height;
    const hold = up ? 0.3 : BEAM_HOLD;
    const reach = outCubic(clamp(bt / (up ? 0.16 : 0.12)));
    const thin = clamp((bt - hold) / 0.35);
    if (thin >= 1) return;
    const half = (bt < 0.2 ? 7 - bt * 15 : 4 + Math.sin(t * 20) * 0.6) * (1 - thin * 0.85);
    // coming down: the top fixed high, the bottom reaching the ground; going up: the bottom on the ground, the top
    // rising - and its foot lifting off last, so it leaves upward
    const top = up ? y - H * reach : y - H;
    const bottom = up ? y - H * clamp((bt - hold) / 0.35) * 0.6 : y - H + (H + 2) * reach;
    for (let yy = Math.floor(top); yy <= bottom; yy++) {
      const v = (yy - (y - H)) / H; // 0 at the top
      const fadeTop = clamp(v * 4);
      for (let xx = Math.floor(x - half * 2.6); xx <= Math.ceil(x + half * 2.6); xx++) {
        const d = Math.abs(xx + 0.5 - x) / Math.max(0.6, half);
        const kk = (1 - thin) * fadeTop * clamp(2.6 - d) / 1.6;
        if (kk <= 0) continue;
        const ripple = 0.75 + 0.25 * Math.sin(yy * 0.6 + (up ? 24 : -24) * t);
        // a white core, pale violet round it, a violet aura dithering out at the sides
        if (d < 0.3) s.px(xx, yy, 0xffffff, Math.min(1, kk * 1.3));
        else if (d < 0.75) s.px(xx, yy, mixRGB(this.colour, 0xffffff, 0.6), Math.min(1, kk * 1.1));
        else if (d < 1.3) s.px(xx, yy, mixRGB(this.colour, 0xffffff, 0.15), Math.min(1, kk * 0.9));
        else if (dither(xx, yy, kk * 0.55)) s.px(xx, yy, mixRGB(this.colour, 0x2a0a50, 0.2), 0.7);
        s.add(xx, yy, d < 0.5 ? 0xffffff : this.colour, kk * ripple * (d < 0.5 ? 0.4 : 0.35));
      }
    }
    // the flash on the ground as it lands / as it leaves
    if (bt < 0.35) s.glow(x, y - 3, 16 - bt * 20, 0xffffff, (0.35 - bt) * 3, 0.6);
  }
}

// ---------------------------------------------------------------- blows

/** A blade's arc across the target, white at its edge, the element's colour behind. dir: 1 swinging rightwards. */
export class Slash implements Pop {
  private t = 0;
  constructor(private readonly x: number, private readonly y: number, private readonly dir: 1 | -1, private readonly colour: RGB, private readonly big = false) {}

  get done(): boolean {
    return this.t > 0.3;
  }
  update(dt: number): void {
    this.t += dt;
  }
  draw(s: Surface): void {
    const k = clamp(this.t / 0.12), fade = clamp((this.t - 0.1) / 0.2);
    const R = this.big ? 17 : 12;
    // from upper back to lower front: the head of the arc sweeps, its tail follows
    const a0 = -2.2, a1 = 0.9;
    const head = a0 + (a1 - a0) * outCubic(k), tail = a0 + (a1 - a0) * outCubic(clamp((this.t - 0.05) / 0.16));
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const a = tail + (head - tail) * (i / n);
      const u = i / n; // 0 tail .. 1 head
      const thick = (this.big ? 3 : 2) * Math.sin(u * Math.PI) + 0.5;
      for (let j = 0; j <= thick * 2; j++) {
        const r = R - thick + j;
        const X = this.x + Math.cos(a) * r * this.dir, Y = this.y + Math.sin(a) * r * 0.55;
        if (!dither(Math.floor(X), Math.floor(Y), 1 - fade)) continue;
        const edge = j >= thick * 2 - 1;
        s.px(X, Y, edge ? 0xffffff : mixRGB(this.colour, 0xffffff, u * 0.5));
        s.add(X, Y, this.colour, 0.35 * (1 - fade));
      }
    }
  }
}

/** Where a blow lands: a star of light, a ring, sparks. */
export class Impact implements Pop {
  private t = 0;
  private readonly sparks = new Sparks();
  constructor(private readonly x: number, private readonly y: number, private readonly colour: RGB, private readonly big = false) {
    this.sparks.burst(x, y, big ? 14 : 8, [0xffffff, colour, mixRGB(colour, 0xffffff, 0.5)], big ? [60, 140] : [40, 90], { g: 140, life: [0.15, 0.4] });
  }
  get done(): boolean {
    return this.t > 0.35 && this.sparks.empty;
  }
  update(dt: number): void {
    this.t += dt;
    this.sparks.update(dt);
  }
  draw(s: Surface): void {
    const k = clamp(this.t / 0.22);
    if (k < 1) {
      const r = Math.round((this.big ? 7 : 5) * (1 - k * 0.6));
      twinkle(s, this.x, this.y, r, this.colour, 1 - k);
      // the diagonal arms, shorter
      for (let i = 1; i <= r * 0.6; i++)
        for (const [dx, dy] of [[i, i], [-i, i], [i, -i], [-i, -i]]) s.px(this.x + dx, this.y + dy, this.colour, (1 - k) * (1 - i / r));
      ring(s, this.x, this.y, 3 + k * (this.big ? 14 : 9), (3 + k * (this.big ? 14 : 9)) * 0.7, mixRGB(this.colour, 0xffffff, 0.4), 1 - k, 0.3);
      s.glow(this.x, this.y, 10, this.colour, (1 - k) * 0.9, 0.8);
    }
    this.sparks.draw(s);
  }
}

/** A shot from one place to another: a bright head, a dithered trail; calls arrive() when it gets there. */
export class Bolt implements Pop {
  private t = 0;
  private readonly trail: { x: number; y: number; age: number }[] = [];
  private arrived = false;
  constructor(private readonly x0: number, private readonly y0: number, private readonly x1: number, private readonly y1: number, private readonly colour: RGB, private readonly time: number, private readonly arrive: () => void) {}

  get done(): boolean {
    return this.arrived && this.trail.length === 0;
  }
  private pos(k: number): { x: number; y: number } {
    const e = k * k * (3 - 2 * k) * 0.3 + k * 0.7;
    // a slight arc up
    return { x: this.x0 + (this.x1 - this.x0) * e, y: this.y0 + (this.y1 - this.y0) * e - Math.sin(e * Math.PI) * 8 };
  }
  update(dt: number): void {
    this.t += dt;
    if (!this.arrived) {
      const p = this.pos(clamp(this.t / this.time));
      this.trail.push({ ...p, age: 0 });
      if (this.t >= this.time) {
        this.arrived = true;
        this.arrive();
      }
    }
    for (const q of this.trail) q.age += dt;
    while (this.trail.length && this.trail[0].age > 0.22) this.trail.shift();
  }
  draw(s: Surface): void {
    for (const q of this.trail) {
      const k = 1 - q.age / 0.22;
      for (let i = -1; i <= 1; i++) if (dither(Math.floor(q.x + i), Math.floor(q.y), k)) s.px(q.x + i * 0.5, q.y, mixRGB(this.colour, 0xffffff, k * 0.4), k);
      s.add(q.x, q.y, this.colour, 0.4 * k);
    }
    if (!this.arrived) {
      const p = this.pos(clamp(this.t / this.time));
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
        const d = Math.abs(x) + Math.abs(y);
        if (d <= 2) s.px(p.x + x, p.y + y, d === 0 ? 0xffffff : d === 1 ? mixRGB(this.colour, 0xffffff, 0.6) : this.colour);
      }
      s.glow(p.x, p.y, 7, this.colour, 0.8);
    }
  }
}

// ---------------------------------------------------------------- the HP bar over a fighter

const ALLY_RAMP = [0xc8ffb8, 0x6ae882, 0x2eb85a, 0x1a8a46];
const FOE_RAMP = [0xffc0b0, 0xff6a5a, 0xe03a48, 0xa81e36];

/**
 * A fighter's pixel HP bar: a dark frame, the element's gem at its end, a segmented fill. When HP drops, the lost
 * part flashes white, sparks fly off the cut and the frame blinks, then it drains away; a heal glows in; a shield
 * lies over it in pale blue; the move being aimed shows what it would take off, blinking.
 */
/** Gold light round a bar, only OUTSIDE it (the bar's own colours stay as they are): (x0, y0) its top-left, w x h
 * its size, r how far the light reaches. */
export function auraOut(s: Surface, x0: number, y0: number, w: number, h: number, r: number, c: RGB, k: number): void {
  for (let y = y0 - r; y < y0 + h + r; y++)
    for (let x = x0 - r; x < x0 + w + r; x++) {
      const dx = x < x0 ? x0 - x : x >= x0 + w ? x - (x0 + w - 1) : 0, dy = y < y0 ? y0 - y : y >= y0 + h ? y - (y0 + h - 1) : 0;
      if (!dx && !dy) continue;
      const d = Math.hypot(dx, dy) / (r + 0.5);
      if (d < 1) s.add(x, y, c, k * (1 - d) * (1 - d));
    }
}

export class HpBar {
  /** HP as shown (fractions of the bar). */
  hp = 1;
  private white = 1;
  private hold = 0;
  private healFrom = 1;
  private healT = 1;
  private hitT = 1;
  shield = 0;
  /** The immortal barrier is on it: a glowing gold frame (as LineRanger_TurnBased shows it). */
  barrier = false;
  preview: { from: number; to: number; heal: boolean } | null = null;
  private readonly sparks = new Sparks();
  private t = Math.random() * 3;
  readonly W = 22;

  /** start: what it shows from the first frame (0..1 of max - a hero coming in hurt, its lasting HP), no animation. */
  constructor(readonly foe: boolean, readonly gem: RGB, readonly boss: boolean, start = 1, shield = 0) {
    this.hp = this.white = this.healFrom = clamp(start);
    this.shield = clamp(shield);
  }

  /** Still something to show (alive, or its last chunk still draining). */
  get visible(): boolean {
    return this.hp > 0 || this.white > 0.002 || !this.sparks.empty;
  }

  /** Set what it shows now (0..1 of max), shield too. */
  set(hp: number, shield: number, x: number, y: number): void {
    hp = clamp(hp);
    if (hp < this.hp - 1e-4) {
      // the cut: a white chunk, sparks off its edge
      if (this.white < this.hp) this.white = this.hp;
      this.hold = 0.42;
      this.hitT = 0;
      const ex = x - this.W / 2 + 2 + hp * (this.W - 2);
      this.sparks.burst(ex, y, 5, [0xffffff, this.foe ? 0xff8a70 : 0x9affb0, 0xffe27a], [25, 60], { dir: -Math.PI / 2, spread: 2.2, g: 160, life: [0.2, 0.45] });
    } else if (hp > this.hp + 1e-4) {
      this.healFrom = this.hp;
      this.healT = 0;
      this.white = hp;
    }
    this.hp = hp;
    this.shield = clamp(shield);
  }

  update(dt: number): void {
    this.t += dt;
    this.hitT += dt;
    this.healT += dt;
    if (this.hold > 0) this.hold -= dt;
    else if (this.white > this.hp) this.white = Math.max(this.hp, this.white - dt * 0.9);
    this.sparks.update(dt);
  }

  /** Draw it with its middle at (x, y). */
  draw(s: Surface, x: number, y: number, show = 1): void {
    const W = this.W, H = 5;
    const x0 = Math.round(x - W / 2) + 2, y0 = Math.round(y - H / 2);
    const hit = this.hitT < 0.16;
    // the immortal barrier: the frame turns from black to gold and the HP takes a light see-through gold over it
    // (the soft light round the bar is a smooth glow sprite of the stage's, not pixels: BattleStage.barrierGlow)
    const frame = hit ? (Math.floor(this.hitT * 40) % 2 ? 0xffffff : 0xff4a4a) : this.barrier ? 0xffc23a : 0x0a0c16;
    const inner = W - 2;
    const fill = (i: number) => (i + 0.5) / inner;
    const ramp = this.foe ? FOE_RAMP : ALLY_RAMP;
    for (let yy = 0; yy < H; yy++)
      for (let xx = 0; xx < W; xx++) {
        const X = x0 + xx, Y = y0 + yy;
        if (!dither(X, Y, show)) continue;
        const corner = (xx === 0 || xx === W - 1) && (yy === 0 || yy === H - 1);
        if (corner) continue;
        if (xx === 0 || yy === 0 || xx === W - 1 || yy === H - 1) {
          s.px(X, Y, frame);
          continue;
        }
        const f = fill(xx - 1), row = yy - 1; // 0..2
        // segments: a darker notch every 4 px
        const notch = (xx - 1) % 4 === 3;
        let c: RGB;
        if (f <= this.hp) {
          c = ramp[Math.min(ramp.length - 1, row + (notch ? 1 : 0))];
          if (this.healT < 0.5 && f > this.healFrom) c = mixRGB(c, 0xffffff, (1 - this.healT / 0.5) * 0.8);
          if (this.barrier) c = mixRGB(c, 0xffd24a, 0.32);
        } else if (this.shield > 0 && f <= this.hp + this.shield) {
          // the shield: white, after the HP in the same bar (LineRanger_TurnBased's way)
          c = notch ? 0xc4ccdc : [0xffffff, 0xeef2fa, 0xd4dcea][row];
        } else if (f <= this.white) c = this.hold > 0.3 ? 0xffffff : row === 0 ? 0xfff6e0 : 0xffd8b0;
        else c = row === 0 ? 0x3a2a3a : notch ? 0x1a1420 : 0x261c2a;
        // what the aimed move would take: blinks
        const p = this.preview;
        // (a soft pulse on the page clock: every bar and the card's preview blink together)
        if (p && f > p.from && f <= p.to) c = mixRGB(c, p.heal ? 0xb8ffc0 : 0xffffff, previewPulse(pageClock()));
        s.px(X, Y, c);
      }
    // the gem: a small diamond in the element's colour, over the bar's left end
    const gx = x0 - 1, gy = y0 + 2;
    const gem = ['..#..', '.#o#.', '#ooo#', '.#o#.', '..#..'];
    gem.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch === '.') return;
      const X = gx + i - 2, Y = gy + j - 2;
      if (!dither(X, Y, show)) return;
      s.px(X, Y, ch === '#' ? 0x0a0c16 : i === 2 && j === 1 ? mixRGB(this.gem, 0xffffff, 0.7) : j >= 3 ? mixRGB(this.gem, 0x000000, 0.25) : this.gem);
    }));
    if (this.boss) {
      // a little crown over the gem
      const crown = ['#.#.#', '#####'];
      crown.forEach((r, j) => [...r].forEach((ch, i) => ch === '#' && s.px(gx + i - 2, gy - 5 + j, j ? 0xe0a030 : 0xffd75a)));
    }
    this.sparks.draw(s);
  }
}

/** A gold arrow bobbing over whoever's turn it is. */
export function turnArrow(s: Surface, x: number, y: number, t: number): void {
  const b = Math.round(Math.sin(t * 6) * 1.5);
  const rows = ['#######', '.#ooo#.', '..#o#..', '...#...'];
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.') return;
    const X = Math.round(x) + i - 3, Y = Math.round(y) + j + b - 4;
    s.px(X, Y, ch === '#' ? (j === 0 ? 0xfff2b0 : 0x6a4010) : 0xffd75a);
    s.add(X, Y, 0xffd75a, 0.15);
  }));
}

/** Corner brackets round a fighter that can be picked as the target (lit when the pointer is on it). */
export function reticle(s: Surface, x: number, y: number, w: number, h: number, t: number, lit: boolean): void {
  const pad = lit ? 1 : 2 + Math.round((Math.sin(t * 8) + 1) * 0.8);
  const x0 = Math.round(x - w / 2 - pad), x1 = Math.round(x + w / 2 + pad), y0 = Math.round(y - h - pad), y1 = Math.round(y + pad);
  const c = lit ? 0xffffff : 0xff5a48;
  const L = 4;
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    for (let i = -1; i <= L; i++) {
      // a dark edge inside the bracket, so it reads on any ground
      s.px(cx + i * sx, cy + sy, 0x1a0606);
      s.px(cx + sx, cy + i * sy, 0x1a0606);
    }
    for (let i = 0; i < L; i++) {
      s.px(cx + i * sx, cy, c);
      s.px(cx, cy + i * sy, c);
      s.add(cx + i * sx, cy, c, 0.35);
      s.add(cx, cy + i * sy, c, 0.35);
    }
  }
}
