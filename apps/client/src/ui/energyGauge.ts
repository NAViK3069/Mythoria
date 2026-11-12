import { Sparks } from '../fx/effects/battlePops';
import { mixRGB, Surface, type RGB } from '../fx/surface';

// The team's energy gauge - our own, drawn by our engine on a small canvas at the HUD's pixel size:
//   a cut crystal at its left end, then one bar like the HP bar - ten cells (one = 10 %) joined, a thin leaning
//   notch between them; a full cell is glassy blue with a bright top edge and a glint; an empty one is dark glass.
//   it rises - the new cells light up one after another, flashing white and cooling into blue, a sparkle on each;
//   it drops - the spent cells flash white, hold, fade, and burst into shards; the crystal flashes either way;
//   full - a shine sweeps along it now and then (the skills are all paid for).
// The canvas is a little bigger than the gauge so the sparks and the glow have room.

const PAD_X = 4, PAD_Y = 6;
const FILL: RGB[] = [0xe8fbff, 0x8ae6ff, 0x46bcf4, 0x2a8ae2, 0x1c5cc0];
const EMPTY: RGB[] = [0x2a3450, 0x1a2236, 0x161c2e, 0x121828];
const EDGE: RGB = 0x05070d;
const GLOW: RGB = 0x5ad0ff;
// the crystal: light facet, mid, dark facet
const GEM = { light: 0xc8f4ff, mid: 0x46bcf4, dark: 0x1c5cc0, deep: 0x123a8a };

export class EnergyGauge {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private surface!: Surface;
  private img!: ImageData;
  private W = 0;
  private H = 0;
  /** Shown level, in cells (0..cells). */
  private level = -1;
  private readonly lit: number[];
  private readonly lost: number[];
  private gemT = 9;
  private t = 0;
  private last = 0;
  private running = false;
  private readonly sparks = new Sparks();

  /** w x h: its size in pixels (the crystal included); cells: how many (each the same share). */
  constructor(private w: number, private h: number, private readonly cells = 10) {
    this.lit = Array(cells).fill(9);
    this.lost = Array(cells).fill(9);
    this.el = document.createElement('canvas');
    this.el.className = 'pxbar';
    this.ctx = this.el.getContext('2d')!;
    this.build();
  }

  /** A new size (the tile it sits in changed). */
  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
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

  // ---------------------------------------------------------------- where things are
  /** The crystal stands out over the gauge, two pixels above and below. */
  private get gemH(): number {
    return this.h + 4;
  }
  private get gemW(): number {
    return Math.round(this.gemH * 0.65) | 1;
  }
  /** The frame's left edge, under the crystal; the first cell starts just right of it. */
  private get left(): number {
    return this.gemW - 4;
  }
  private get x0(): number {
    return this.gemW - 1;
  }
  /** How far the notches between the cells lean. */
  private get slant(): number {
    return Math.max(2, Math.round(this.h / 4));
  }
  private get cw(): number {
    return (this.w - 1 - this.x0) / this.cells;
  }
  /** The middle of cell i, for the sparks. */
  private cellMid(i: number): number {
    return this.x0 + (i + 0.5) * this.cw;
  }

  /** Show `v` (0..1); `jump` sets it without the show (the first time). */
  set(v: number, jump = false): void {
    const n = Math.max(0, Math.min(1, v)) * this.cells;
    if (jump || this.level < 0) {
      this.level = n;
      this.lit.fill(9);
      this.lost.fill(9);
      this.draw();
      if (this.full) this.start();
      return;
    }
    if (Math.abs(n - this.level) < 1e-4) return;
    const from = this.level;
    if (n > from)
      for (let i = Math.floor(from); i < Math.ceil(n); i++) {
        this.lit[i] = -0.06 * (i - Math.floor(from));
        this.sparks.burst(this.cellMid(i), this.h / 2, 3, [0xffffff, GLOW], [18, 40], { dir: -Math.PI / 2, spread: 1.6, g: 50, life: [0.25, 0.5] });
      }
    else
      for (let i = Math.floor(n); i < Math.ceil(from); i++) {
        this.lost[i] = 0;
        this.sparks.burst(this.cellMid(i), this.h / 2, 4, [0xffffff, GLOW, 0xc8f4ff], [30, 70], { dir: -Math.PI / 2, spread: 2.6, g: 140, life: [0.2, 0.5] });
      }
    this.gemT = 0;
    this.level = n;
    this.start();
  }

  private get full(): boolean {
    return this.level >= this.cells - 1e-4;
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.gemT += dt;
      for (let i = 0; i < this.cells; i++) {
        this.lit[i] += dt;
        this.lost[i] += dt;
      }
      this.sparks.update(dt);
      this.draw();
      const busy = this.gemT < 0.3 || this.lit.some((x) => x < 0.5) || this.lost.some((x) => x < 0.6) || !this.sparks.empty || this.full;
      if (busy && this.el.isConnected) requestAnimationFrame(step);
      else this.running = false;
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- drawing
  private draw(): void {
    const s = this.surface, w = this.w, h = this.h;
    s.clear();
    const change = Math.max(...this.lit.map((x) => (x >= 0 && x < 0.4 ? 1 - x / 0.4 : 0)), ...this.lost.map((x) => (x < 0.5 ? 1 - x / 0.5 : 0)));
    if (change > 0) s.glow(w / 2, h / 2, w * 0.55, GLOW, change * 0.8, 0.35);
    this.drawCells(s);
    this.drawGem(s);
    this.sparks.draw(s);
    s.write(this.img.data);
    this.ctx.putImageData(this.img, 0, 0);
  }

  /** One bar like the HP bar - one dark frame, the cells joined, a thin leaning notch between them. */
  private drawCells(s: Surface): void {
    const h = this.h, w = this.w, left = this.left, x0 = this.x0, sl = this.slant, cw = this.cw, total = cw * this.cells;
    const y1 = 2, y2 = h - 3; // the inside rows
    // a shine sweeping along it when it's full, every two seconds
    const sweep = this.full ? ((this.t * 1.1) % 2) * (w + 20) - 10 : -99;
    for (let y = 1; y < h - 1; y++) {
      const off = ((y2 - y) / Math.max(1, y2 - y1)) * sl - sl / 2;
      const row = Math.min(FILL.length - 1, Math.floor(((y - y1) / Math.max(1, y2 - y1 + 1)) * FILL.length));
      const erow = Math.min(EMPTY.length - 1, Math.floor(((y - y1) / Math.max(1, y2 - y1 + 1)) * EMPTY.length));
      for (let x = left; x < w; x++) {
        const edge = y === 1 || y === h - 2 || x === left || x === w - 1;
        if (edge && (x === left || x === w - 1) && (y === 1 || y === h - 2)) continue;
        if (edge) {
          s.px(x, y, EDGE);
          continue;
        }
        if (x < x0) {
          s.px(x, y, 0x0a0d16);
          continue;
        }
        const raw = x + 0.5 - x0 - off;
        const sx = Math.max(0, Math.min(total - 0.001, raw));
        const i = Math.floor(sx / cw);
        const notch = raw > 1 && raw + 1 < total && Math.floor(raw / cw) !== Math.floor((raw + 1) / cw);
        const filled = sx < this.level * cw;
        let c: RGB;
        if (filled) {
          c = y === y1 ? FILL[0] : FILL[Math.min(FILL.length - 1, row + (notch ? 2 : 0))];
          // a glint: one bright leaning stroke near each cell's left
          const g = sx - i * cw - 1.5 - (y2 - y) * 0.35;
          if (!notch && y > y1 && y < y2 && g >= 0 && g < 1) c = mixRGB(c, 0xffffff, 0.5);
          const lt = this.lit[i];
          if (lt >= 0 && lt < 0.4) c = mixRGB(c, 0xffffff, (1 - lt / 0.4) * 0.9);
          if (Math.abs(x - y * 0.5 - sweep) < 2) c = mixRGB(c, 0xffffff, 0.6);
        } else {
          c = notch ? 0x101420 : y === y1 ? EMPTY[0] : EMPTY[erow];
          const lt = this.lost[i];
          if (lt < 0.2) c = 0xffffff;
          else if (lt < 0.5) c = mixRGB(c, 0xfff0d8, 1 - (lt - 0.2) / 0.3);
        }
        s.px(x, y, c);
      }
    }
  }

  /** The cut crystal at the left end: a diamond, light facet on the left, dark on the right, a glint. */
  private drawGem(s: Surface): void {
    const h = this.gemH, gw = this.gemW, cx = (gw - 1) / 2, cy = (h - 1) / 2, top = -2;
    const flash = this.gemT < 0.16 ? (Math.floor(this.gemT * 40) % 2 ? 1 : 0.5) : 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < gw; x++) {
        const dx = (x - cx) / (gw / 2), dy = (y - cy) / (h / 2);
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > 1) continue;
        let c: RGB;
        if (d > 1 - 2.2 / h) c = EDGE;
        else if (dy < -0.25 && dx < 0.15) c = GEM.light; // the top-left facet
        else if (dx < 0) c = GEM.mid;
        else if (dy < 0) c = GEM.dark;
        else c = GEM.deep;
        if (flash) c = mixRGB(c, 0xffffff, flash * 0.85);
        s.px(x, y + top, c);
      }
    // the glint
    s.px(Math.round(cx - gw * 0.18), Math.round(cy - h * 0.22) + top, 0xffffff);
    if (this.full) s.glow(cx, cy + top, h * 0.7, GLOW, 0.35 + 0.2 * Math.sin(this.t * 5), 1);
  }
}
