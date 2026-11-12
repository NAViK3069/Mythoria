import { mixRGB, Surface, type RGB } from '../fx/surface';

// The chosen move's highlight: two comets of light running round its frame, each with a fading trail and a soft
// glow, sparkling where they pass - pixel art drawn by our own engine on a canvas just bigger than the button,
// at the HUD's pixel size. It runs while it's on the page, and stops itself when taken off.

export class Swirl {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly surface: Surface;
  private readonly img: ImageData;
  private readonly W: number;
  private readonly path: [number, number][] = [];
  private t = Math.random();
  private last = 0;

  /** size: the button's (square) size in pixels; colour: the light's. */
  constructor(size: number, private readonly colour: RGB = 0xffd75a) {
    const pad = 4;
    this.W = size + pad * 2;
    this.el = document.createElement('canvas');
    this.el.width = this.el.height = this.W;
    this.el.className = 'pxswirl';
    this.el.style.width = this.el.style.height = `calc(var(--p) * ${this.W})`;
    this.el.style.inset = `calc(var(--p) * ${-pad})`;
    this.ctx = this.el.getContext('2d')!;
    this.surface = new Surface(this.W, this.W, 0, 0);
    this.img = new ImageData(this.W, this.W);
    // the track: round the frame's edge, its corners cut like the frame's
    const a = pad + 1, b = this.W - pad - 2, c = 5;
    const pts: [number, number][] = [[a + c, a], [b - c, a], [b, a + c], [b, b - c], [b - c, b], [a + c, b], [a, b - c], [a, a + c]];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k < n; k++) this.path.push([Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n)]);
    }
    this.last = performance.now();
    const step = (now: number) => {
      this.t += Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.draw();
      if (this.el.isConnected || this.t < 0.2) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private draw(): void {
    const s = this.surface, n = this.path.length;
    s.clear();
    const speed = n * 0.9; // about a lap in 1.1 s
    const trail = Math.round(n * 0.28);
    for (const offset of [0, n / 2]) {
      const head = (this.t * speed + offset) % n;
      for (let k = 0; k < trail; k++) {
        const i = Math.floor((head - k + n) % n);
        const [x, y] = this.path[i];
        const f = 1 - k / trail;
        s.px(x, y, k < 2 ? 0xffffff : mixRGB(this.colour, 0xffffff, f * 0.5), Math.min(1, f * 1.4));
        s.add(x, y, this.colour, f * 0.6);
        // a little width near the head
        if (k < trail * 0.3) {
          const [px2, py2] = this.path[(i + 1) % n];
          const nx = py2 - y, ny = -(px2 - x);
          s.px(x + nx, y + ny, this.colour, f * 0.6);
        }
      }
      const [hx, hy] = this.path[Math.floor(head)];
      s.glow(hx, hy, 5, this.colour, 0.9, 1);
      // a sparkle at the head now and then
      if (Math.floor(this.t * 12 + offset) % 3 === 0) {
        s.px(hx - 2, hy, 0xffffff, 0.8);
        s.px(hx + 2, hy, 0xffffff, 0.8);
        s.px(hx, hy - 2, 0xffffff, 0.8);
        s.px(hx, hy + 2, 0xffffff, 0.8);
      }
    }
    s.write(this.img.data);
    this.ctx.putImageData(this.img, 0, 0);
  }
}
