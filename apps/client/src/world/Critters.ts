import * as Phaser from 'phaser';
import { bakeButterfly, FOLDS, SIZE, SPECIES, type Species } from '../fx/effects/butterflies';
import { makeCanvas } from '../art/pixel';

const LAST = FOLDS.length - 1;

interface Butterfly {
  sp: Species;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  home: { x: number; y: number };
  x: number;
  y: number;
  /** Height above the ground (px). */
  alt: number;
  vx: number;
  vy: number;
  target: { x: number; y: number; land: boolean };
  state: 'fly' | 'rest';
  /** Flapping (true) or gliding, and time left in that. */
  flap: boolean;
  burst: number;
  phase: number;
  rest: number;
  seed: number;
  dustT: number;
}

/**
 * Butterflies living on the map: each keeps to its own patch, flutters in bursts of wingbeats and glides,
 * settles on flowers to bask (wings slowly opening and closing) and takes off when you come close.
 * Their pictures are drawn in code (fx/effects/butterflies.ts).
 */
export class Critters {
  private readonly flies: Butterfly[] = [];
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    spots: { x: number; y: number }[],
    private readonly flowers: { x: number; y: number }[],
    private readonly walkable: (x: number, y: number) => boolean,
  ) {
    for (const sp of SPECIES) {
      const key = `bf_${sp.id}`;
      if (scene.textures.exists(key)) continue;
      const strip = bakeButterfly(sp);
      const tex = scene.textures.addCanvas(key, strip.canvas)!;
      FOLDS.forEach((_, i) => tex.add(i, 0, i * strip.w, 0, strip.w, strip.h));
      tex.customData = { ox: strip.cx / strip.w, oy: (strip.cy + 0.5) / strip.h };
    }
    if (!scene.textures.exists('bf_shadow')) {
      const [c, g] = makeCanvas(5, 2);
      g.fillStyle = '#0c1e16';
      g.fillRect(1, 0, 3, 2);
      g.fillRect(0, 0, 5, 1);
      scene.textures.addCanvas('bf_shadow', c);
    }
    if (!scene.textures.exists('bf_glow')) scene.textures.addCanvas('bf_glow', softDot(24));
    if (!scene.textures.exists('bf_dust')) {
      const [c, g] = makeCanvas(3, 3);
      g.fillStyle = '#ffffff';
      g.fillRect(1, 0, 1, 3);
      g.fillRect(0, 1, 3, 1);
      scene.textures.addCanvas('bf_dust', c);
    }
    this.dust = scene.add
      .particles(0, 0, 'bf_dust', {
        lifespan: { min: 700, max: 1300 },
        speedX: { min: -6, max: 6 },
        speedY: { min: 4, max: 14 },
        scale: { start: 1, end: 0.3 },
        alpha: { onUpdate: (_p: unknown, _k: string, t: number) => (1 - t) * (0.6 + 0.4 * Math.sin(t * 40)) },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(9600);

    // a few of each kind, the rarer magical ones only now and then
    const weights = SPECIES.map((s) => (s.id === 'lumen' ? 0.5 : s.id === 'luna' ? 0.7 : 1));
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const s of spots) {
      let k = rnd() * weights.reduce((a, b) => a + b, 0);
      let sp = SPECIES[0];
      for (let i = 0; i < SPECIES.length; i++) if ((k -= weights[i]) <= 0) {
        sp = SPECIES[i];
        break;
      }
      this.add(sp, s.x, s.y, rnd() * 100);
    }
  }

  private add(sp: Species, x: number, y: number, seed: number): void {
    const key = `bf_${sp.id}`;
    const o = this.scene.textures.get(key).customData as { ox: number; oy: number };
    const img = this.scene.add.image(x, y, key, 0).setOrigin(o.ox, o.oy);
    const shadow = this.scene.add.image(x, y, 'bf_shadow').setAlpha(0.28).setDepth(1.4);
    const glow = sp.glow
      ? this.scene.add.image(x, y, 'bf_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Display.Color.HexStringToColor(sp.glow).color).setAlpha(0.5).setScale(0.65 + SIZE * 0.35).setDepth(9550)
      : undefined;
    const b: Butterfly = {
      sp, img, shadow, glow, home: { x, y }, x, y, alt: 12, vx: 0, vy: 0, target: { x, y, land: false }, state: 'fly',
      flap: true, burst: 0.5, phase: seed, rest: 0, seed, dustT: 0,
    };
    this.pick(b);
    this.flies.push(b);
  }

  /** Somewhere new to go: a flower to land on now and then, or just another spot in its patch. */
  private pick(b: Butterfly, away?: { x: number; y: number }): void {
    const r = Math.random;
    if (!away && r() < b.sp.lands) {
      const near = this.flowers.filter((f) => Math.abs(f.x - b.home.x) < 100 && Math.abs(f.y - b.home.y) < 80);
      if (near.length) {
        const f = near[Math.floor(r() * near.length)];
        b.target = { x: f.x, y: f.y - 2, land: true };
        return;
      }
    }
    for (let i = 0; i < 8; i++) {
      let x = b.home.x + (r() - 0.5) * 160;
      let y = b.home.y + (r() - 0.5) * 110;
      if (away) {
        const dx = b.x - away.x, dy = b.y - away.y, d = Math.hypot(dx, dy) || 1;
        x = b.x + (dx / d) * 70 + (r() - 0.5) * 40;
        y = b.y + (dy / d) * 50 + (r() - 0.5) * 30;
      }
      if (this.walkable(x, y) || i === 7) {
        b.target = { x, y, land: false };
        return;
      }
    }
  }

  update(dt: number, px: number, py: number): void {
    this.time += dt;
    const view = this.scene.cameras.main.worldView;
    for (const b of this.flies) {
      const seen = b.x > view.x - 80 && b.x < view.right + 80 && b.y > view.y - 80 && b.y < view.bottom + 80;
      b.img.setVisible(seen);
      b.shadow.setVisible(seen);
      b.glow?.setVisible(seen);
      if (!seen) continue;
      const near = Math.hypot(b.x - px, (b.y - py) * 1.3);
      if (b.state === 'rest') this.rest(b, dt, near, px, py);
      else this.fly(b, dt, near, px, py);

      const sx = b.x, sy = b.y - b.alt;
      b.img.setPosition(sx, sy).setDepth(b.y + 2);
      b.shadow.setPosition(b.x + 1, b.y + 1).setScale(Math.max(0.5, 1 - b.alt / 40));
      if (b.glow) {
        const tw = 0.42 + 0.12 * Math.sin(this.time * 3 + b.seed);
        b.glow.setPosition(sx, sy - 1).setAlpha(tw);
      }
      if (b.sp.dust && b.state === 'fly') {
        b.dustT -= dt;
        if (b.dustT <= 0) {
          b.dustT = 0.07 + Math.random() * 0.08;
          this.dust.setParticleTint(Phaser.Display.Color.HexStringToColor(b.sp.dust).color);
          this.dust.emitParticleAt(sx + (Math.random() - 0.5) * 8, sy + 2, 1);
        }
      }
    }
  }

  private fly(b: Butterfly, dt: number, near: number, px: number, py: number): void {
    if (near < 22) this.pick(b, { x: px, y: py });
    // bursts of quick wingbeats (climbing), then a short glide (sinking)
    b.burst -= dt;
    if (b.burst <= 0) {
      b.flap = !b.flap;
      b.burst = b.flap ? 0.35 + Math.random() * 0.7 : 0.15 + Math.random() * 0.35;
    }
    const tx = b.target.x - b.x, ty = b.target.y - b.y, d = Math.hypot(tx, ty) || 1;
    const speed = b.flap ? 30 : 22;
    // a fluttering, wandering line, not a straight one
    const wob = Math.sin(this.time * 2.3 + b.seed) * 0.7 + Math.sin(this.time * 5.1 + b.seed * 2) * 0.4;
    const dx = tx / d, dy = ty / d;
    const want = Math.min(1, d / 18);
    const ax = (dx - dy * wob) * speed * want, ay = (dy + dx * wob) * speed * want * 0.8;
    const k = Math.min(1, dt * 3);
    b.vx += (ax - b.vx) * k;
    b.vy += (ay - b.vy) * k;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    const landing = b.target.land && d < 26;
    const goalAlt = landing ? 1 + d * 0.4 : 10 + Math.sin(this.time * 1.3 + b.seed) * 4;
    b.alt += ((b.flap ? goalAlt + 2 : goalAlt - 2) - b.alt) * Math.min(1, dt * 2.5);

    if (b.flap) {
      b.phase += dt * b.sp.beat * Math.PI * 2;
      b.img.setFrame(Math.round((0.5 - 0.5 * Math.cos(b.phase)) * LAST));
    } else {
      b.img.setFrame(Math.sin(this.time * 2 + b.seed) > 0.6 ? 1 : 0);
    }

    if (d < 2.5) {
      if (b.target.land) {
        b.state = 'rest';
        b.rest = 2 + Math.random() * 5;
        b.vx = b.vy = 0;
      } else this.pick(b);
    }
  }

  private rest(b: Butterfly, dt: number, near: number, px: number, py: number): void {
    b.alt += (1 - b.alt) * Math.min(1, dt * 6);
    b.rest -= dt;
    // basking: wings open wide, close slowly, open again
    const bask = 0.5 - 0.5 * Math.cos(this.time * 1.6 + b.seed);
    b.img.setFrame(Math.round(bask * 3));
    if (near < 34 || b.rest <= 0) {
      b.state = 'fly';
      b.flap = true;
      b.burst = 0.6;
      this.pick(b, near < 34 ? { x: px, y: py } : undefined);
    }
  }
}

/** A soft round glow, bright in the middle (for additive light). */
function softDot(size: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(size, size);
  g.imageSmoothingEnabled = true;
  const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}
