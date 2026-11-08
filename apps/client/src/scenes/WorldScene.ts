import * as Phaser from 'phaser';
import { bushCanvas, groundCanvas, rockCanvas, treeCanvas } from '../art/props';
import { rng } from '../art/pixel';
import { Controls } from '../input/Controls';
import { MasterCharacter } from '../world/MasterCharacter';

const WORLD_W = 960;
const WORLD_H = 640;
const SPEED = 60; // px/s
const PLAYER_R = 4; // collision radius at the feet

interface Blocker {
  x: number;
  y: number;
  r: number;
}

/** Test map: walk the master character around a small meadow. */
export class WorldScene extends Phaser.Scene {
  private master!: MasterCharacter;
  private controls!: Controls;
  private blockers: Blocker[] = [];
  private marker!: Phaser.GameObjects.Image;

  constructor() {
    super('World');
  }

  create(): void {
    const path = (x: number) => WORLD_H / 2 + Math.sin(x / 140) * 60 + Math.sin(x / 47) * 10;
    this.textures.addCanvas('ground', groundCanvas(WORLD_W, WORLD_H, path));
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(0);
    this.makeProps(path);

    this.master = new MasterCharacter(this, 120, path(120));
    this.master.walkSpeed = SPEED;
    this.master.onStep = (x, y) => this.dust(x, y);

    this.marker = this.add.image(0, 0, this.markerTexture()).setDepth(2).setVisible(false);
    this.controls = new Controls(this);
    this.controls.onTarget = (x, y) => {
      this.marker.setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(1);
    };

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.startFollow(this.master.root, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on('resize', () => this.fitZoom());
  }

  /** Whole-number zoom so pixels stay square: bigger on large screens, at least 2x. */
  private fitZoom(): void {
    const { width, height } = this.scale.gameSize;
    const zoom = Phaser.Math.Clamp(Math.round(Math.min(width, height) / 130), 2, 4);
    this.cameras.main.setZoom(zoom);
  }

  update(_time: number, deltaMs: number): void {
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
    m.x += dx * SPEED * dt;
    m.y += dy * SPEED * dt;
    this.collide(m);
    m.vx = (m.x - ox) / dt;
    m.vy = (m.y - oy) / dt;
    // Walking into a wall towards a tap target: give up instead of pushing forever.
    if (this.controls.target && Math.hypot(m.vx, m.vy) < SPEED * 0.15) this.controls.target = null;
    m.update(dt);
  }

  private collide(m: MasterCharacter): void {
    for (const b of this.blockers) {
      const dx = m.x - b.x;
      const dy = m.y - b.y;
      const min = b.r + PLAYER_R;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001;
        m.x = b.x + (dx / d) * min;
        m.y = b.y + (dy / d) * min;
      }
    }
    m.x = Phaser.Math.Clamp(m.x, 8, WORLD_W - 8);
    m.y = Phaser.Math.Clamp(m.y, 12, WORLD_H - 4);
  }

  private makeProps(path: (x: number) => number): void {
    const r = rng(42);
    for (let i = 0; i < 6; i++) this.textures.addCanvas(`tree${i}`, treeCanvas(100 + i));
    for (let i = 0; i < 3; i++) this.textures.addCanvas(`bush${i}`, bushCanvas(200 + i));
    this.textures.addCanvas('rock', rockCanvas());

    const free = (x: number, y: number, gap: number) =>
      Math.abs(y - path(x)) > 22 && this.blockers.every((b) => Math.hypot(b.x - x, b.y - y) > b.r + gap);
    const place = (key: string, x: number, y: number, r0: number) => {
      // origin at the bottom centre = where it stands
      this.add.image(Math.round(x), Math.round(y), key).setOrigin(0.5, 1).setDepth(Math.round(y));
      this.blockers.push({ x, y: y - 2, r: r0 });
    };

    // a ring of trees round the edge
    for (let x = 0; x <= WORLD_W; x += 22) {
      for (const y of [18, WORLD_H + 6]) if (free(x, y, 4) || Math.abs(y - path(x)) > 22) place(`tree${Math.floor(r() * 6)}`, x + r() * 6, y, 6);
    }
    for (let y = 40; y < WORLD_H; y += 24) {
      for (const x of [6, WORLD_W - 6]) if (free(x, y, 4)) place(`tree${Math.floor(r() * 6)}`, x, y + r() * 6, 6);
    }
    // scattered trees, bushes and rocks
    const scatter = (n: number, key: () => string, rad: number, gap: number) => {
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const x = 40 + r() * (WORLD_W - 80);
        const y = 50 + r() * (WORLD_H - 90);
        if (!free(x, y, gap) || Math.hypot(x - 120, y - path(120)) < 50) continue;
        place(key(), x, y, rad);
        i++;
      }
    };
    scatter(38, () => `tree${Math.floor(r() * 6)}`, 6, 22);
    scatter(30, () => `bush${Math.floor(r() * 3)}`, 6, 12);
    scatter(22, () => 'rock', 5, 10);
  }

  /** A little puff of dust where a foot lands. */
  private dust(x: number, y: number): void {
    const behind = -this.master.facing * 3;
    for (let i = 0; i < 2; i++) {
      const p = this.add
        .rectangle(Math.round(x + behind + (i ? 2 : -1)), Math.round(y - 1), 2, 2, 0xd8cfb4, 0.8)
        .setDepth(y - 0.5);
      this.tweens.add({
        targets: p,
        y: p.y - 3,
        x: p.x + behind,
        alpha: 0,
        duration: 320,
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
