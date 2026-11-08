import * as Phaser from 'phaser';
import { Controls } from '../input/Controls';
import { Ambience } from '../world/Ambience';
import { MasterCharacter } from '../world/MasterCharacter';
import { MeadowView } from '../world/MeadowView';
import { buildMeadow, COLS, ROWS, TILE, waterAt, type MeadowMap } from '../world/meadowMap';

const SPEED = 62; // px/s
const PLAYER_R = 4; // collision radius at the feet

/** The world map: walk the master character round the meadow. */
export class WorldScene extends Phaser.Scene {
  private map!: MeadowMap;
  private view!: MeadowView;
  private ambience!: Ambience;
  private master!: MasterCharacter;
  private controls!: Controls;
  private marker!: Phaser.GameObjects.Image;

  constructor() {
    super('World');
  }

  create(): void {
    this.map = buildMeadow();
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

  /** Whole-number zoom so pixels stay square; about 400 world px across the long side of the screen. */
  private fitZoom(): void {
    const { width, height } = this.scale.gameSize;
    const zoom = Phaser.Math.Clamp(Math.round(Math.max(width, height) / 420), 2, 6);
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
    this.moveWithSlide(m, dx * SPEED * dt, dy * SPEED * dt);
    m.vx = (m.x - ox) / dt;
    m.vy = (m.y - oy) / dt;
    // Walking into something on the way to a tap target: give up instead of pushing forever.
    if (this.controls.target && Math.hypot(m.vx, m.vy) < SPEED * 0.15) this.controls.target = null;
    m.update(dt);

    this.view.update(dt, m.x, m.y, time / 1000);
    this.ambience.update(dt);
  }

  /** Move, sliding along walls and pond banks instead of stopping dead. */
  private moveWithSlide(m: MasterCharacter, mx: number, my: number): void {
    if (this.free(m.x + mx, m.y + my)) {
      m.x += mx;
      m.y += my;
    } else if (this.free(m.x + mx, m.y)) {
      m.x += mx;
    } else if (this.free(m.x, m.y + my)) {
      m.y += my;
    }
    this.pushOut(m);
  }

  private free(x: number, y: number): boolean {
    if (x < 8 || y < 12 || x > COLS * TILE - 8 || y > ROWS * TILE - 4) return false;
    return waterAt(this.map, x, y) < 0.45;
  }

  /** Round blockers (trees, rocks, walls) push the feet out smoothly. */
  private pushOut(m: MasterCharacter): void {
    for (const b of this.map.objects) {
      if (!b.r) continue;
      const dx = m.x - b.x;
      const dy = m.y - (b.y - 2);
      const min = b.r + PLAYER_R;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001;
        const nx = b.x + (dx / d) * min;
        const ny = b.y - 2 + (dy / d) * min;
        if (this.free(nx, ny)) {
          m.x = nx;
          m.y = ny;
        }
      }
    }
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
