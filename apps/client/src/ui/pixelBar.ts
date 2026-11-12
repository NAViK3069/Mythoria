import { Sparks } from '../fx/effects/battlePops';
import { paintIcon, type Icon } from '../fx/pixelIcons';
import { mixRGB, Surface, type RGB } from '../fx/surface';

// A segmented pixel bar for the battle HUD (the fighter's HP, the team's energy), drawn by our own engine on a
// small canvas at the HUD's pixel size, and animated like the owner's reference:
//   it drops - the lost cells turn cream-white and hold, the frame and the icon flash, sparks fly off the cut,
//              a glow swells behind it; then the white drains back to the new level, a bright head leading it;
//   it rises - the new cells flash white and cool into their colour, a sparkle at the new edge, the icon flashes.
// The canvas is a little bigger than the bar, so the sparks and the glow have room.

export interface BarLook {
  /** Fill colours, top row to bottom. */
  fill: RGB[];
  /** The glow behind it when it changes. */
  glow: RGB;
  /** The icon at its left end (heart, crystal). */
  icon: Icon;
}

export const BAR_LOOKS = {
  ally: { fill: [0xd8ffcc, 0x6ae882, 0x2eb85a, 0x1a8a46], glow: 0x5ee87a } as Omit<BarLook, 'icon'>,
  foe: { fill: [0xffd8cc, 0xff6a5a, 0xe03a48, 0xa81e36], glow: 0xff5a48 } as Omit<BarLook, 'icon'>,
  energy: { fill: [0xd8f6ff, 0x6ad8ff, 0x2a9ae8, 0x1a5ab8], glow: 0x5ad0ff } as Omit<BarLook, 'icon'>,
};

const PAD_X = 4, PAD_Y = 6;

export class PixelBar {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private surface!: Surface;
  private img!: ImageData;
  private W = 0;
  private H = 0;
  /** Shown level (0..1), where the white chunk ends, the level a rise started from. */
  private level = -1;
  private white = 0;
  private riseFrom = 0;
  private hold = 0;
  private hitT = 9;
  private riseT = 9;
  private t = 0;
  private last = 0;
  private running = false;
  private readonly sparks = new Sparks();
  /** The shield (0..1 of the bar, white after the HP) and the immortal barrier (a glowing gold frame). */
  private shield = 0;
  private barrier = false;

  /** w x h: the bar's own size in pixels (icon included); cells: how many segments, each the same share of it
   * (10 = one per 10 %; 0: one per 4 px). */
  constructor(private look: BarLook, private w: number, private readonly h: number, private readonly cells = 0) {
    this.el = document.createElement('canvas');
    this.el.className = 'pxbar';
    this.ctx = this.el.getContext('2d')!;
    this.build();
  }

  /** A new length, in pixels (the tile it sits in changed size). */
  resize(w: number): void {
    if (w === this.w) return;
    this.w = w;
    this.build();
    if (this.level >= 0) this.draw();
  }

  private build(): void {
    this.W = this.w + PAD_X * 2;
    this.H = this.h + PAD_Y * 2;
    this.el.width = this.W;
    this.el.height = this.H;
    this.el.style.width = `calc(var(--p) * ${this.W})`;
    this.el.style.height = `calc(var(--p) * ${this.H})`;
    this.el.style.margin = `calc(var(--p) * ${-PAD_Y}) calc(var(--p) * ${-PAD_X})`;
    this.surface = new Surface(this.W, this.H, PAD_X, PAD_Y);
    this.img = new ImageData(this.W, this.H);
  }

  setLook(look: BarLook): void {
    this.look = look;
    this.draw();
  }

  /** Show `v` (0..1); `jump` sets it without the show (a new fighter's card). */
  set(v: number, jump = false): void {
    v = Math.max(0, Math.min(1, v));
    if (jump || this.level < 0) {
      this.level = this.white = this.riseFrom = v;
      this.hitT = this.riseT = 9;
      this.draw();
      return;
    }
    if (Math.abs(v - this.level) < 1e-4) return;
    const { x0, span } = this.cellsAt;
    if (v < this.level) {
      // a drop: what's lost turns white, holds, then drains
      this.white = Math.max(this.white, this.level);
      this.hold = 0.32;
      this.hitT = 0;
      const ex = x0 + v * span;
      this.sparks.burst(ex, 1, 7, [0xffffff, this.look.glow, mixRGB(this.look.glow, 0xffffff, 0.5)], [30, 70], { dir: -Math.PI / 2, spread: 2.4, g: 140, life: [0.2, 0.5] });
    } else {
      this.riseFrom = this.level;
      this.riseT = 0;
      this.white = v;
      this.sparks.burst(x0 + v * span, 1, 5, [0xffffff, this.look.glow], [20, 45], { dir: -Math.PI / 2, spread: 1.6, g: 60, life: [0.2, 0.45] });
    }
    this.level = v;
    this.start();
  }

  /** The shield's share of the bar and whether the immortal barrier is on (LineRanger_TurnBased's HP bar). */
  setGuard(shield: number, barrier: boolean): void {
    shield = Math.max(0, Math.min(1, shield));
    if (Math.abs(shield - this.shield) < 1e-4 && barrier === this.barrier) return;
    this.shield = shield;
    this.barrier = barrier;
    this.el.classList.toggle('barrier', barrier);
    this.draw();
  }

  /** Where the cells run: from just inside the icon's right edge to the end (the icon covers the frame's left end). */
  private get cellsAt(): { left: number; x0: number; span: number } {
    const left = Math.max(6, this.look.icon.rows[0].length - 4);
    const x0 = left + 3;
    return { left, x0, span: this.w - x0 - 1 };
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.hitT += dt;
      this.riseT += dt;
      if (this.hold > 0) this.hold -= dt;
      else if (this.white > this.level) this.white = Math.max(this.level, this.white - dt * 1.1);
      this.sparks.update(dt);
      this.draw();
      const busy = this.white > this.level + 1e-4 || this.hitT < 0.5 || this.riseT < 0.6 || !this.sparks.empty;
      if (busy && this.el.isConnected) requestAnimationFrame(step);
      else this.running = false;
    };
    requestAnimationFrame(step);
  }

  private draw(): void {
    const s = this.surface, w = this.w, h = this.h;
    s.clear();
    const hit = this.hitT < 0.16, rise = this.riseT < 0.5;
    // the glow behind it, swelling then fading
    const g = Math.max(this.hitT < 0.5 ? 1 - this.hitT / 0.5 : 0, rise ? (1 - this.riseT / 0.5) * 0.7 : 0);
    if (g > 0) s.glow(w / 2, h / 2, w * 0.55, this.look.glow, g * 0.9, 0.35);
    // the frame: dark, flashing white / colour on a hit; gold under the immortal barrier (its soft light round the
    // bar is CSS, .pxbar.barrier - smooth, not pixels)
    const frame = hit ? (Math.floor(this.hitT * 40) % 2 ? 0xffffff : this.look.glow) : this.barrier ? 0xffc23a : 0x05070d;
    const { left, x0, span } = this.cellsAt; // the cells start under the icon's right edge
    for (let y = 1; y < h - 1; y++)
      for (let x = left; x < w; x++) {
        const edge = y === 1 || y === h - 2 || x === left || x === w - 1;
        if (edge && (x === left || x === w - 1) && (y === 1 || y === h - 2)) continue;
        if (edge) {
          s.px(x, y, frame);
          continue;
        }
        if (x < x0) {
          s.px(x, y, 0x0a0d16);
          continue;
        }
        const f = (x - x0 + 0.5) / span;
        const row = Math.min(this.look.fill.length - 1, Math.floor(((y - 2) / Math.max(1, h - 4)) * this.look.fill.length));
        // the cells: a dark notch between them
        // a dark notch where one cell ends and the next begins
        const cellW = this.cells ? span / this.cells : 4;
        const notch = x > x0 && Math.floor((x - x0) / cellW) !== Math.floor((x - x0 + 1) / cellW) && x < x0 + span - 1;
        let c: RGB;
        if (f <= this.level) {
          c = this.look.fill[Math.min(this.look.fill.length - 1, row + (notch ? 1 : 0))];
          if (rise && f > this.riseFrom) c = mixRGB(c, 0xffffff, (1 - this.riseT / 0.5) * 0.85);
          if (this.barrier) c = mixRGB(c, 0xffd24a, 0.32);
        } else if (this.shield > 0 && f <= this.level + this.shield) {
          // the shield: white, after the HP
          c = notch ? 0xc4ccdc : [0xffffff, 0xf2f5fb, 0xe0e6f0, 0xc8d0de][Math.min(3, row)];
        } else if (f <= this.white) c = this.hold > 0.22 ? 0xffffff : row === 0 ? 0xfff6e8 : 0xffdcb8;
        else c = row === 0 ? 0x2a2a3e : notch ? 0x101420 : 0x1a1c2a;
        // the head of the draining chunk: one bright column
        if (this.hold <= 0 && this.white > this.level + 0.002 && Math.abs(f - this.white) < 1 / span) c = 0xffffff;
        s.px(x, y, c);
      }
    // the icon over the left end, flashing white on a change
    paintIcon(s, 0, Math.round((h - this.look.icon.rows.length) / 2) - 1, hit || (rise && this.riseT < 0.12) ? { ...this.look.icon, pal: { ...this.look.icon.pal, a: 0xffffff, b: 0xe8f0ff } } : this.look.icon);
    this.sparks.draw(s);
    s.write(this.img.data);
    this.ctx.putImageData(this.img, 0, 0);
  }
}
