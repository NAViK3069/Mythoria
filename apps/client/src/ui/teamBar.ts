// The team HP bars at the top of the battle screen, animated exactly like the fighter's own bar (pixelBar.ts):
//   a drop - the lost part turns white and holds a moment, the bar flashes, then the white drains back to the
//            new level with a bright head leading it (a second hit while it drains carries on from the white);
//   a rise - the new part flashes white and cools into the bar's colour.
// The bars keep their own look (slanted frames, segments in CSS); this only moves them, through CSS variables
// on the track: --lvl (the level), --wht (where the white ends), --rf (where a rise started), all 0..1.

/** How long the white holds before it drains (s), and how fast it drains (share of the bar per s). */
const HOLD = 0.32;
const DRAIN = 1.1;
const RISE = 0.5;

export class TeamBar {
  private level = -1;
  private white = 0;
  private riseFrom = 0;
  private hold = 0;
  private riseT = 9;
  private running = false;
  private last = 0;

  constructor(
    private readonly box: HTMLElement,
    private readonly track: HTMLElement,
    private readonly rise: HTMLElement,
    private readonly head: HTMLElement,
  ) {}

  set(v: number): void {
    v = Math.max(0, Math.min(1, v));
    if (this.level < 0) {
      // the first time: just show it
      this.level = this.white = this.riseFrom = v;
      this.draw();
      return;
    }
    if (Math.abs(v - this.level) < 1e-4) return;
    if (v < this.level) {
      // a drop: what's lost turns white, holds, then drains
      this.white = Math.max(this.white, this.level);
      this.hold = HOLD;
      this.box.classList.remove('hit');
      void this.box.offsetWidth;
      this.box.classList.add('hit');
    } else {
      // a rise: the new part flashes white and cools
      this.riseFrom = this.level;
      this.riseT = 0;
      this.white = v;
    }
    this.level = v;
    this.start();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.riseT += dt;
      if (this.hold > 0) this.hold -= dt;
      else if (this.white > this.level) this.white = Math.max(this.level, this.white - dt * DRAIN);
      this.draw();
      if (this.white > this.level + 1e-4 || this.hold > 0 || this.riseT < RISE) requestAnimationFrame(step);
      else this.running = false;
    };
    requestAnimationFrame(step);
  }

  private draw(): void {
    const t = this.track.style;
    t.setProperty('--lvl', this.level.toFixed(4));
    t.setProperty('--wht', this.white.toFixed(4));
    t.setProperty('--rf', this.riseFrom.toFixed(4));
    // the white is pure white while it holds, a warm cream as it drains
    this.track.classList.toggle('holding', this.hold > HOLD - 0.1);
    this.rise.style.opacity = this.riseT < RISE ? ((1 - this.riseT / RISE) * 0.85).toFixed(3) : '0';
    this.head.style.opacity = this.hold <= 0 && this.white > this.level + 0.002 ? '1' : '0';
  }
}
