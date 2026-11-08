import * as Phaser from 'phaser';
import { makeCanvas, rowsToCanvas } from '../art/pixel';

// The "walk here" marker (MOBA style): a glowing arrow drops onto the spot,
// squashes as it lands, bounces once and fades, while a double ring spreads
// over the ground and a few sparks fly out. Smooth, every frame.

const ARROW_ROWS = [
  '...ddddd...',
  '...dllmd...',
  '...dllmd...',
  '...dlmmd...',
  '...dlmmd...',
  'ddddlmmdddd',
  'dllllmmmmmd',
  '.dllmmmmmd.',
  '..dlmmmmd..',
  '...dmmmd...',
  '....dmd....',
  '.....d.....',
];
const PAL = { l: '#eaffd8', m: '#7cf26a', d: '#2a9a3c' };
const RING = 0x9dff86;
const LIFE = 0.8;

const ease = {
  inQuad: (t: number) => t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

interface Marker {
  x: number;
  y: number;
  t: number;
  arrow: Phaser.GameObjects.Image;
  glowArrow: Phaser.GameObjects.Image;
  ground: Phaser.GameObjects.Image;
  rings: Phaser.GameObjects.Graphics;
  sparks: { o: Phaser.GameObjects.Rectangle; vx: number; vy: number }[];
}

export class MoveMarkers {
  private readonly live: Marker[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    if (!scene.textures.exists('move_arrow')) {
      scene.textures.addCanvas('move_arrow', rowsToCanvas(ARROW_ROWS, PAL, '#0a3012'));
      // a soft glow, smoothed (it is light, not pixel art)
      const [c, g] = makeCanvas(48, 48);
      g.imageSmoothingEnabled = true;
      const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      gr.addColorStop(0, 'rgba(170,255,150,0.9)');
      gr.addColorStop(0.4, 'rgba(110,240,110,0.35)');
      gr.addColorStop(1, 'rgba(80,220,100,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 48, 48);
      scene.textures.addCanvas('move_glow', c)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  /** Drop a marker at a world point. */
  spawn(x: number, y: number): void {
    // one marker at a time reads best: a new click replaces the last
    for (const m of this.live) m.t = Math.max(m.t, LIFE - 0.12);
    const s = this.scene;
    const ground = s.add.image(x, y, 'move_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(2).setScale(0.6, 0.28).setAlpha(0);
    const rings = s.add.graphics().setDepth(2.1).setBlendMode(Phaser.BlendModes.ADD);
    const glowArrow = s.add.image(x, y, 'move_arrow').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9dff86).setAlpha(0);
    const arrow = s.add.image(x, y, 'move_arrow').setOrigin(0.5, 1).setAlpha(0);
    const sparks = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 26 + Math.random() * 18;
      return { o: s.add.rectangle(x, y, 1.5, 1.5, 0xd8ffc8).setDepth(y + 60).setBlendMode(Phaser.BlendModes.ADD).setVisible(false), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.45 - 8 };
    });
    this.live.push({ x, y, t: 0, arrow, glowArrow, ground, rings, sparks });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const m = this.live[i];
      m.t += dt;
      const t = m.t;
      if (t >= LIFE) {
        m.arrow.destroy();
        m.glowArrow.destroy();
        m.ground.destroy();
        m.rings.destroy();
        for (const s of m.sparks) s.o.destroy();
        this.live.splice(i, 1);
        continue;
      }
      // ---- the arrow: fall, squash, bounce, settle, fade
      let y = 0, sx = 1, sy = 1, a = 1;
      const FALL = 0.15;
      if (t < FALL) {
        const k = ease.inQuad(t / FALL);
        y = -26 * (1 - k);
        a = Math.min(1, t / 0.06);
        sy = 1.15;
        sx = 0.9;
      } else {
        const u = t - FALL;
        // a damped spring for the squash, a little hop after the landing
        const sq = Math.exp(-9 * u) * Math.cos(u * 26);
        sx = 1 + 0.32 * sq;
        sy = 1 - 0.36 * sq;
        y = -Math.max(0, Math.sin(Math.min(1, u / 0.26) * Math.PI)) * 4 * Math.exp(-2 * u);
        const fade = Math.max(0, (t - 0.5) / (LIFE - 0.5));
        a = 1 - ease.inOut(fade);
        sx *= 1 - fade * 0.35;
        sy *= 1 - fade * 0.35;
      }
      const bob = Math.sin(t * 18) * 0.4 * Math.max(0, 1 - t * 3);
      m.arrow.setPosition(m.x, m.y - 2 + y + bob).setScale(sx, sy).setAlpha(a).setDepth(m.y + 60);
      m.glowArrow.setPosition(m.x, m.y - 2 + y + bob).setScale(sx * 1.35, sy * 1.25).setAlpha(a * 0.55).setDepth(m.y + 59);

      // ---- on the ground: a glow and two rings spreading from the landing
      const g = Math.max(0, t - FALL);
      m.ground.setAlpha(t < FALL ? (t / FALL) * 0.5 : 0.9 * Math.exp(-4 * g));
      m.ground.setScale(0.5 + g * 0.6, 0.24 + g * 0.28);
      m.rings.clear();
      for (const [delay, max, w] of [[0, 15, 1.4], [0.1, 10, 1]]) {
        const r = g - delay;
        if (r <= 0) continue;
        const k = Math.min(1, r / 0.5);
        const rx = 2 + (max - 2) * ease.outCubic(k);
        const alpha = (1 - k) * 0.95;
        if (alpha <= 0) continue;
        m.rings.lineStyle(w, RING, alpha);
        m.rings.strokeEllipse(m.x, m.y, rx * 2, rx * 0.9);
      }

      // ---- sparks thrown out on impact
      for (const s of m.sparks) {
        if (t < FALL) continue;
        const u = t - FALL;
        s.o.setVisible(u < 0.45);
        s.o.setPosition(m.x + s.vx * u, m.y - 1 + s.vy * u + 30 * u * u);
        s.o.setAlpha(Math.max(0, 1 - u / 0.45));
      }
    }
  }
}
