import * as Phaser from 'phaser';
import { Controls } from '../input/Controls';
import { Ambience } from '../world/Ambience';
import { MasterCharacter } from '../world/MasterCharacter';
import { MeadowView } from '../world/MeadowView';
import { buildMeadow, COLS, ROWS, TILE, waterAt, type Footprint, type MeadowMap, type Shape, type ShapeOf } from '../world/meadowMap';

const SPEED = 62; // px/s
/** The player's own footprint: an ellipse under the body, as wide as the body (13 px). */
const FOOT_RX = 6;
const FOOT_RY = 3;

/** The world map: walk the master character round the meadow. */
export class WorldScene extends Phaser.Scene {
  private map!: MeadowMap;
  private feet: Footprint[] = [];
  private view!: MeadowView;
  private ambience!: Ambience;
  private master!: MasterCharacter;
  private controls!: Controls;
  private marker!: Phaser.GameObjects.Image;

  constructor() {
    super('World');
  }

  create(): void {
    this.map = buildMeadow(this.shapeReader());
    // Bushes are soft: you walk through them (they rustle), like mushrooms and flowers.
    this.feet = this.map.objects.flatMap((o) => (o.foot && o.kind !== 'bush' ? [o.foot] : []));
    this.view = new MeadowView(this, this.map);

    this.master = new MasterCharacter(this, this.map.spawn.x, this.map.spawn.y);
    this.master.walkSpeed = SPEED;
    this.master.onStep = (x, y) => this.dust(x, y);

    this.ambience = new Ambience(this, this.map);

    this.marker = this.add.image(0, 0, this.markerTexture()).setDepth(2).setVisible(false);
    this.controls = new Controls(this);
    this.controls.onTarget = (x, y) => {
      this.marker.setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(1);
    };

    const cam = this.cameras.main;
    cam.setBounds(0, 0, COLS * TILE, ROWS * TILE);
    cam.setRoundPixels(false);
    cam.startFollow(this.master.root, false, 0.12, 0.12);
    this.fitZoom();
    this.scale.on('resize', () => this.fitZoom());
  }

  /** Reads the atlas pixels once so footprints can follow each picture's solid base. */
  private shapeReader(): ShapeOf {
    const atlas = this.textures.get('meadow');
    const img = atlas.getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const alpha = g.getImageData(0, 0, c.width, c.height).data;
    const cache = new Map<string, Shape>();
    return (frame) => {
      let s = cache.get(frame);
      if (s) return s;
      const f = atlas.get(frame);
      const { cutX: fx, cutY: fy, cutWidth: w, cutHeight: h } = f;
      const spans = new Map<number, [number, number]>();
      s = {
        w,
        h,
        span(rows: number) {
          const k = Math.max(1, Math.min(h, Math.round(rows)));
          let r = spans.get(k);
          if (!r) {
            let l = w, rr = -1;
            for (let y = h - k; y < h; y++)
              for (let x = 0; x < w; x++)
                if (alpha[((fy + y) * c.width + fx + x) * 4 + 3] > 100) {
                  if (x < l) l = x;
                  if (x > rr) rr = x;
                }
            r = rr < 0 ? [-2, 2] : [l - w / 2, rr + 1 - w / 2];
            spans.set(k, r);
          }
          return r;
        },
      };
      cache.set(frame, s);
      return s;
    };
  }

  /**
   * Whole-number zoom (in device pixels) so pixels stay square. Aim to show about
   * 540 world px across the short side of a computer/iPad screen, 360 on a phone.
   */
  private fitZoom(): void {
    const dpr = this.scale.displayScale.x;
    const cssShort = Math.min(window.innerWidth, window.innerHeight);
    const target = cssShort < 500 ? 360 : 540;
    const zoom = Phaser.Math.Clamp(Math.round((dpr * cssShort) / target), 1, 8);
    this.cameras.main.setZoom(zoom);
  }

  update(time: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.controls.update();
    const m = this.master;
    let { x: dx, y: dy } = this.controls.dir;

    const target = this.controls.target;
    if (target && !dx && !dy) {
      const tx = target.x - m.x;
      const ty = target.y - m.y;
      const dist = Math.hypot(tx, ty);
      if (dist < 1.5) {
        this.controls.target = null;
      } else {
        const k = Math.min(1, dist / 6); // ease in on the last few pixels
        dx = (tx / dist) * k;
        dy = (ty / dist) * k;
      }
    }
    if (!this.controls.target) this.marker.setAlpha(Math.max(0, this.marker.alpha - dt * 4));

    const ox = m.x;
    const oy = m.y;
    this.move(m, dx * SPEED * dt, dy * SPEED * dt);
    m.vx = (m.x - ox) / dt;
    m.vy = (m.y - oy) / dt;
    // Walking into something on the way to a tap target: give up instead of pushing forever.
    if (this.controls.target && Math.hypot(m.vx, m.vy) < SPEED * 0.15) this.controls.target = null;
    m.update(dt);

    this.view.moving = Math.hypot(m.vx, m.vy) > 5;
    this.view.update(dt, m.x, m.y, time / 1000);
    this.ambience.update(dt);
  }

  /** Move, then let footprints push the feet out - so the player slides round trunks and along walls. */
  private move(m: MasterCharacter, mx: number, my: number): void {
    // pond banks: slide along them
    if (this.ground(m.x + mx, m.y + my)) {
      m.x += mx;
      m.y += my;
    } else if (this.ground(m.x + mx, m.y)) {
      m.x += mx;
    } else if (this.ground(m.x, m.y + my)) {
      m.y += my;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const f of this.feet) {
        // Nearest point of the footprint's inner rectangle; the feet touch it on the
        // rounded ring round that rectangle (corner radius + the feet's own size).
        const ix = f.hw - f.r;
        const iy = f.hd - f.r;
        const cx = Phaser.Math.Clamp(m.x, f.x - ix, f.x + ix);
        const cy = Phaser.Math.Clamp(m.y, f.y - iy, f.y + iy);
        const a = f.r + FOOT_RX;
        const b = f.r + FOOT_RY;
        const ex = (m.x - cx) / a;
        const ey = (m.y - cy) / b;
        const d = Math.hypot(ex, ey);
        if (d >= 1) continue;
        const nx = d > 1e-4 ? cx + (ex / d) * a : m.x;
        const ny = d > 1e-4 ? cy + (ey / d) * b : cy + b;
        if (this.ground(nx, ny)) {
          m.x = nx;
          m.y = ny;
        }
      }
    }
  }

  /** Walkable ground: inside the map and not in a pond. */
  private ground(x: number, y: number): boolean {
    if (x < 8 || y < 12 || x > COLS * TILE - 8 || y > ROWS * TILE - 4) return false;
    return waterAt(this.map, x, y) < 0.45;
  }

  /** A little puff of dust where a foot lands. */
  private dust(x: number, y: number): void {
    const behind = -this.master.facing * 3;
    for (let i = 0; i < 2; i++) {
      const p = this.add
        .rectangle(x + behind + (i ? 2 : -1), y - 1, 2, 2, 0xe6dcc0, 0.7)
        .setDepth(y - 0.5);
      this.tweens.add({
        targets: p,
        y: p.y - 3,
        x: p.x + behind,
        alpha: 0,
        scale: 0.4,
        duration: 380,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private markerTexture(): string {
    const key = 'marker';
    if (!this.textures.exists(key)) {
      const c = document.createElement('canvas');
      c.width = 9;
      c.height = 5;
      const g = c.getContext('2d')!;
      g.fillStyle = '#ffffff';
      for (const [x, y] of [[4, 0], [2, 1], [6, 1], [0, 2], [8, 2], [2, 3], [6, 3], [4, 4], [1, 2], [7, 2], [3, 1], [5, 1], [3, 3], [5, 3]]) g.fillRect(x, y, 1, 1);
      this.textures.addCanvas(key, c);
    }
    return key;
  }
}
