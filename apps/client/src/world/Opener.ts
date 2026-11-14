import * as Phaser from 'phaser';
import { FIELD_FIGHT } from '@mythoria/game-data';
import type { BattleLayer } from '../fx/BattleLayer';
import { Impact, Slash } from '../fx/effects/battlePops';
import type { MasterCharacter } from './MasterCharacter';
import { strikerOnTop } from './FieldFight';
import type { Monster } from './Monsters';

// The opening blow on the map before the turn-based screen (the owner's rule): the team leader walks up and strikes
// the monster once - or, when the monster caught you, it strikes first - and only then the battle screen opens.
// Just the show: the battle itself starts fresh on the turn-based screen.

const WALK = 130;
const LUNGE = 0.34;

export class Opener {
  done = false;
  private phase: 'walk' | 'strike' | 'hold' = 'walk';
  private t = 0;
  private hit = false;
  private readonly side: 1 | -1;
  private readonly spot: { x: number; y: number };
  private readonly foe: { x: number; y: number };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: BattleLayer,
    private readonly leader: MasterCharacter,
    readonly monster: Monster,
    master: MasterCharacter,
    /** Who strikes first: us (you went for it) or them (it caught you). */
    private readonly first: 'us' | 'them',
    private readonly onDone: () => void,
  ) {
    monster.engaged = true;
    monster.giveUp();
    this.side = monster.x >= master.x ? 1 : -1;
    this.foe = { x: monster.x, y: monster.y };
    this.spot = { x: monster.x - this.side * FIELD_FIGHT.gap, y: monster.y };
    leader.faceLock = this.side;
    monster.facing = this.side === 1 ? -1 : 1;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const L = this.leader, M = this.monster;
    // whoever strikes is drawn on top
    strikerOnTop(this.first, L, M);
    if (this.phase === 'walk') {
      // the leader walks in to its spot facing the monster
      const dx = this.spot.x - L.x, dy = this.spot.y - L.y, d = Math.hypot(dx, dy);
      const ox = L.x, oy = L.y;
      if (d > 1) {
        const go = Math.min(d, WALK * dt);
        L.x += (dx / d) * go;
        L.y += (dy / d) * go;
      }
      L.vx = (L.x - ox) / Math.max(dt, 1e-3);
      L.vy = (L.y - oy) / Math.max(dt, 1e-3);
      if (d <= 1 || this.t > 1.6) (this.phase = 'strike'), (this.t = 0), (L.vx = L.vy = 0);
      return;
    }
    if (this.phase === 'strike') {
      const k = Math.min(1, this.t / LUNGE);
      const out = Math.sin(k * Math.PI);
      if (this.first === 'us') {
        // the leader lunges in, the weapon coming down through the blow
        L.x = this.spot.x + this.side * 12 * out;
        L.swing = -1.4 * Math.sin(Math.min(1, k * 1.4) * Math.PI) + 0.5 * out;
      } else {
        // the monster hops at the leader
        M.x = this.foe.x - this.side * 10 * out;
        M.alt = 4 * out;
      }
      if (!this.hit && k >= 0.5) {
        this.hit = true;
        const onFoe = this.first === 'us';
        const x = onFoe ? M.x : L.x, y = onFoe ? M.y - M.top / 2 : L.y - 16;
        const colour = onFoe ? 0xffe9a0 : 0xff8a70;
        this.layer.add(new Slash(x, y, (onFoe ? this.side : -this.side) as 1 | -1, colour, true));
        this.layer.add(new Impact(x, y + 2, colour, true));
        this.scene.cameras.main.shake(110, 0.003);
      }
      if (k >= 1) {
        L.swing = 0;
        L.x = this.spot.x;
        M.x = this.foe.x;
        M.alt = 0;
        this.phase = 'hold';
        this.t = 0;
      }
      return;
    }
    // a beat for the blow to land, then the battle screen
    if (this.t > 0.25) this.finish();
  }

  /** Called off (you walked away before the blow): the battle screen doesn't open. */
  cancel(): void {
    if (this.done) return;
    this.done = true;
    this.leader.faceLock = null;
    this.leader.swing = 0;
    this.monster.x = this.foe.x;
    this.monster.alt = 0;
    this.monster.engaged = false;
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.leader.faceLock = null;
    this.leader.swing = 0;
    this.monster.engaged = false;
    this.onDone();
  }
}
