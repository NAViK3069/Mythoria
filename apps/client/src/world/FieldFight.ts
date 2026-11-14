import * as Phaser from 'phaser';
import { Battle, heroLineup, monsterTeam, reserveTeam, type Outcome, type Unit } from '@mythoria/combat';
import { ELEMENTS, FIELD_FIGHT, heroById, monsterById } from '@mythoria/game-data';
import type { BattleLayer } from '../fx/BattleLayer';
import type { Surface } from '../fx/surface';
import { DamagePop, HpBar, Impact, Pillar, Slash, hexRGB, type PopKind } from '../fx/effects/battlePops';
import { Dissolve } from '../fx/effects/dissolve';
import { changed, lineup } from '../ui/store';
import { showLiveHp } from '../ui/party';
import { fightBarHp } from '../ui/fieldFight';
import { fitTeam, hpShare, setHp } from '../ui/vitals';
import { imageSnap } from './BattleStage';
import type { MasterCharacter } from './MasterCharacter';
import type { Monster } from './Monsters';

// A fight on the map (ADR 0019): the SAME battle as the turn-based screen (@mythoria/combat, the whole team, its
// special team, the monster's group), played on auto in the background, one move every FIELD_FIGHT.step s. On the
// map the team leader stands for the team and the monster for its group: whoever moves in the battle, the leader
// (our side) or the monster (theirs) strikes; every number shows over them - damage, crits, misses, heals - and one
// HP bar each side shows the whole team's HP. Later the server plays the battle and everyone near sees this.

export type FieldEnd = 'win' | 'lose' | 'draw';

export interface FieldFightOpts {
  layer: BattleLayer;
  monster: Monster;
  master: MasterCharacter;
  leader: MasterCharacter;
  foes: string[];
  seed: number;
  /** A battle already going (folded back from the turn-based screen): carried on as it is. */
  battle?: Battle;
  /** It's over: the monster has started to dissolve (a win), or the leader has given way. */
  onEnd: (kind: FieldEnd) => void;
}

/** Draw whoever struck last over the other (the owner's rule: the leader on top when it strikes, the monster when it
 * does) - after both have set their own depth this frame. */
export function strikerOnTop(front: 'us' | 'them', leader: MasterCharacter, monster: Monster): void {
  if (monster.gone) return;
  const ld = leader.root.depth, md = monster.sprite.depth;
  if (front === 'us' && ld <= md) leader.root.setDepth(md + 0.01);
  else if (front === 'them' && md <= ld) monster.sprite.setDepth(ld + 0.01);
}

const elColour = (id: string | undefined) => hexRGB(ELEMENTS.find((e) => e.id === id)?.color ?? '#ffd27a');

export class FieldFight {
  readonly battle: Battle;
  readonly monster: Monster;
  private readonly leader: MasterCharacter;
  private readonly master: MasterCharacter;
  private readonly layer: BattleLayer;
  /** Which way the monster is from us (1: to the right). */
  private readonly side: 1 | -1;
  /** Where the leader stands to fight, and the monster. */
  private readonly spot: { x: number; y: number };
  private readonly foeSpot: { x: number; y: number };
  private readonly ourBar: HpBar;
  private readonly theirBar: HpBar;
  private wait = 0.9;
  private timers: Phaser.Time.TimerEvent[] = [];
  /** Lunges in progress (0..1 out and back): the leader's, the monster's. */
  private lunge = { us: -1, them: -1, usDur: 0.34, themDur: 0.38 };
  private clock = 0;
  /** Who struck last (drawn on top). */
  private front: 'us' | 'them' = 'us';
  ended = false;

  constructor(private readonly scene: Phaser.Scene, private readonly opts: FieldFightOpts) {
    const { monster, master, leader } = opts;
    this.monster = monster;
    this.master = master;
    this.leader = leader;
    this.layer = opts.layer;
    const l = lineup();
    this.battle = opts.battle ?? new Battle(
      [heroLineup(fitTeam(l.front), fitTeam(l.back), 1, hpShare), monsterTeam(opts.foes)],
      opts.seed,
      [reserveTeam(fitTeam(l.special)), []],
    );
    // (picked up again: straight on)
    if (opts.battle) this.wait = 0.4;
    monster.engaged = true;
    monster.giveUp();
    this.side = monster.x >= master.x ? 1 : -1;
    // the leader steps in between, the monster stays where it caught you
    this.foeSpot = { x: monster.x, y: monster.y };
    this.spot = { x: monster.x - this.side * FIELD_FIGHT.gap, y: monster.y };
    leader.faceLock = this.side;
    monster.facing = this.side === 1 ? -1 : 1;
    const ours = this.battle.units.find((u) => u.team === 0);
    this.ourBar = new HpBar(false, elColour(ours ? heroById(ours.id)?.element : undefined), false, this.share(0));
    this.theirBar = new HpBar(true, elColour(monster.def.element), monster.def.miniBoss, this.share(1));
    this.liveHp();
  }

  /** How far the master is from the fight (walking off too far is running away). */
  distance(): number {
    return Math.hypot(this.master.x - this.spot.x, (this.master.y - this.spot.y) * 1.2);
  }

  /** The map's team bar follows the battle as it goes (each hero's HP now). */
  private liveHp(): void {
    const m = new Map<string, number>();
    for (const u of this.battle.units) if (u.team === 0 && !u.reserve) m.set(u.id, Math.max(0, u.hp) / Math.max(1, u.maxHp));
    showLiveHp(m);
  }

  /** A side's HP left, as a share of its total. */
  private share(team: 0 | 1): number {
    let hp = 0, max = 0;
    for (const u of this.battle.units) if (u.team === team) (hp += Math.max(0, u.hp)), (max += u.maxHp);
    return max ? hp / max : 0;
  }

  private later(sec: number, fn: () => void): void {
    this.timers.push(this.scene.time.delayedCall(sec * 1000, () => !this.ended && fn()));
  }

  update(dt: number): void {
    this.clock += dt;
    const L = this.leader;
    // the leader: walks to its spot, lunges at the monster when it strikes
    let tx = this.spot.x, ty = this.spot.y;
    if (this.lunge.us >= 0) {
      this.lunge.us += dt / this.lunge.usDur;
      const k = Math.sin(Math.min(1, this.lunge.us) * Math.PI);
      tx += this.side * 12 * k;
      // the weapon comes down through the strike
      L.swing = -1.4 * Math.sin(Math.min(1, this.lunge.us * 1.4) * Math.PI) + 0.5 * k;
      if (this.lunge.us >= 1) (this.lunge.us = -1), (L.swing = 0);
    }
    const dx = tx - L.x, dy = ty - L.y, d = Math.hypot(dx, dy);
    const ox = L.x, oy = L.y;
    const speed = this.lunge.us >= 0 ? 400 : 110;
    if (d > 0.3) {
      const go = Math.min(d, speed * dt);
      L.x += (dx / d) * go;
      L.y += (dy / d) * go;
    }
    // (a lunge isn't a walk: no steps for it)
    L.vx = this.lunge.us >= 0 ? 0 : (L.x - ox) / Math.max(dt, 1e-3);
    L.vy = this.lunge.us >= 0 ? 0 : (L.y - oy) / Math.max(dt, 1e-3);

    // the monster: it faces the leader striking it (not you), and hops at it when it strikes
    const M = this.monster;
    if (!M.gone) M.facing = L.x < M.x ? -1 : 1;
    if (this.lunge.them >= 0 && !M.gone) {
      this.lunge.them += dt / this.lunge.themDur;
      const k = Math.sin(Math.min(1, this.lunge.them) * Math.PI);
      M.x = this.foeSpot.x - this.side * 10 * k;
      M.alt = 4 * k;
      if (this.lunge.them >= 1) (this.lunge.them = -1), (M.x = this.foeSpot.x), (M.alt = 0);
    }

    strikerOnTop(this.front, L, M);
    this.ourBar.update(dt);
    this.theirBar.update(dt);
    if (this.ended) return;
    this.wait -= dt;
    if (this.wait <= 0) this.turn();
  }

  /** Both sides' HP bars, over the leader and the monster (the effect layer's `over`). */
  drawBars(s: Surface): void {
    if (this.ourBar.visible) this.ourBar.draw(s, this.leader.x, this.barY(0));
    if (!this.monster.gone && this.theirBar.visible) this.theirBar.draw(s, this.monster.x, this.barY(1));
  }

  syncBars(): void {
    this.ourBar.set(this.share(0), 0, this.leader.x, this.barY(0));
    this.theirBar.set(this.share(1), 0, this.monster.x, this.barY(1));
    this.liveHp();
    fightBarHp(this.share(1));
  }

  /** Where a side's bar goes: over the leader's head (it has no name tag), over the monster where its tag was
   * (the tag hides while it's fought). */
  private barY(team: 0 | 1): number {
    return team === 0 ? this.leader.y - 37 : this.monster.y - this.monster.top - 5;
  }

  /** Where a number over a side goes. */
  private at(team: 0 | 1): { x: number; y: number } {
    return { x: team === 0 ? this.leader.x : this.monster.x, y: this.barY(team) - 9 };
  }

  private pop(team: 0 | 1, text: string, kind: PopKind, delay = 0, n = 0): void {
    const p = this.at(team);
    const dx = n === 0 ? 0 : (n % 2 ? 7 : -7) * Math.ceil(n / 2);
    this.layer.add(new DamagePop(p.x + dx, p.y - (kind === 'crit' ? 6 : 0) - n * 3, text, kind, delay));
  }

  /** One fighter's turn in the battle, shown by the leader or the monster. */
  private turn(): void {
    const b = this.battle;
    const actor = b.nextActor();
    if (!actor || b.over) return this.finish();
    const st = b.beginTurn(actor);
    const side = actor.team as 0 | 1;
    st.dots.forEach((dd, i) => this.pop(side, `-${dd.damage}`, 'dmg', i * 0.12, i));
    if (st.regen) this.pop(side, `+${st.regen}`, 'heal');
    if (st.dot || st.regen) this.syncBars();
    if (st.killed || !actor.alive || st.stunned) {
      if (st.stunned && actor.alive) this.pop(side, 'STUN', 'miss');
      b.endTurn(actor);
      this.wait = st.dot || st.stunned ? 0.45 : 0.05;
      if (b.over) this.wait = 0.5;
      return;
    }
    let time = 0;
    // its move (after an ultimate - free - it moves again)
    for (let k = 0; k < 2; k++) {
      const plan = b.planAuto(actor);
      if (!plan) break;
      const kindOf = plan.action;
      const skill = b.skillOf(plan.caster ?? actor, kindOf);
      const result = b.perform(actor, plan);
      this.show(actor, kindOf, skill.kind === 'buff' || b.targetsAllies(plan.caster ?? actor, kindOf), result.outcomes, time, !!plan.caster);
      time += FIELD_FIGHT.step + (kindOf === 'ult' ? FIELD_FIGHT.ultExtra : kindOf === 'attack' ? 0 : FIELD_FIGHT.skillExtra);
      if (kindOf !== 'ult' || b.over || !actor.alive) break;
    }
    b.endTurn(actor);
    this.wait = Math.max(time, 0.3);
  }

  /** One move, as the map shows it: the leader (or the monster) strikes, the numbers come up, the bars move. */
  private show(actor: Unit, action: string, onAllies: boolean, outcomes: Outcome[], delay: number, assist: boolean): void {
    const side = actor.team as 0 | 1;
    const other = (1 - side) as 0 | 1;
    this.later(delay, () => {
      // a skill / an ultimate / the special team: its word over whoever stands for that side
      if (action === 'ult') this.pop(side, 'ULTIMATE', 'good');
      else if (assist) this.pop(side, 'ASSIST', 'word');
      else if (action !== 'attack') this.pop(side, 'SKILL', 'word');
      if (onAllies) {
        // a heal / a buff on its own side: a little column of light, no lunge
        const f = side === 0 ? this.leader : this.monster;
        this.layer.add(new Pillar(f.x, f.y + 1, '', undefined, side === 0 ? 0x9affc0 : 0xffb0a0, false, 24));
      } else if (side === 0) (this.lunge.us = 0), (this.front = 'us');
      else (this.lunge.them = 0), (this.front = 'them');
    });
    // the hit lands a beat later
    this.later(delay + (onAllies ? 0.25 : 0.17), () => {
      let n = 0;
      let hit = false;
      for (const o of outcomes) {
        const u = this.battle.unit(o.uid);
        const t = (u?.team ?? other) as 0 | 1;
        if (o.evaded) this.pop(t, 'MISS', 'miss', n * 0.08, n++);
        else if (o.immune) this.pop(t, 'IMMUNE', 'miss', n * 0.08, n++);
        else if (o.damage > 0) {
          this.pop(t, `${o.damage}`, o.crit ? 'crit' : 'dmg', n * 0.08, n++);
          hit = true;
        }
        if (o.healed > 0) this.pop(t, `+${o.healed}`, 'heal', n * 0.08, n++);
        if (o.shieldAbsorbed > 0) this.pop(t, `${o.shieldAbsorbed}`, 'shield', n * 0.08, n++);
      }
      if (hit) {
        const p = this.at(other);
        const colour = side === 0 ? 0xffe9a0 : 0xff8a70;
        this.layer.add(new Slash(p.x, p.y + 20, side === 0 ? this.side : (-this.side as 1 | -1), colour, outcomes.some((o) => o.crit)));
        this.layer.add(new Impact(p.x, p.y + 22, colour, outcomes.some((o) => o.crit)));
        if (outcomes.some((o) => o.crit)) this.scene.cameras.main.shake(90, 0.0025);
      }
      this.syncBars();
      if (this.battle.over) this.later(0.5, () => this.finish());
    });
  }

  /** The battle is over: the loser gives way, what the heroes have left is what they keep. */
  private finish(): void {
    if (this.ended) return;
    const b = this.battle;
    const kind: FieldEnd = b.winner === 0 ? 'win' : b.winner === 1 ? 'lose' : 'draw';
    this.writeBack();
    this.release();
    const M = this.monster;
    if (kind === 'win') {
      // the monster turns to stone and blows away; VICTORY! over the leader
      const snap = imageSnap(M.sprite);
      this.layer.add(new Dissolve(snap, Math.round(M.x), Math.round(M.y - M.alt), this.side, 1.3));
      this.layer.add(new Pillar(this.leader.x, this.leader.y + 2, 'VICTORY!', undefined, 0xffd75a, false, 40));
    } else {
      this.pop(0, kind === 'lose' ? 'DEFEAT' : 'DRAW', 'miss');
    }
    this.opts.onEnd(kind);
  }

  /** What the heroes have left is what they keep (ui/vitals.ts; the leader never stays down). */
  writeBack(): void {
    for (const u of this.battle.units) if (u.team === 0 && !u.reserve && heroById(u.id)) setHp(u.id, Math.max(0, u.hp), u.maxHp);
    changed();
  }

  /** Each foe still standing, with its HP as a share of its max (to pick the fight up on the turn-based screen). */
  foesLeft(): { ids: string[]; hp: number[] } {
    const left = this.battle.units.filter((u) => u.team === 1 && u.alive && monsterById(u.id));
    return { ids: left.map((u) => u.id), hp: left.map((u) => u.hp / Math.max(1, u.maxHp)) };
  }

  /** Hand the battle over (to the turn-based screen): it stops here, as it is - nothing written back yet. */
  handOver(): Battle {
    this.release();
    return this.battle;
  }

  /** Stop here (fled): nothing more happens on the map. */
  stop(): void {
    if (this.ended) return;
    this.writeBack();
    this.release();
  }

  private release(): void {
    this.ended = true;
    for (const t of this.timers) t.remove(false);
    this.timers = [];
    this.leader.faceLock = null;
    this.leader.swing = 0;
    showLiveHp(null);
    const M = this.monster;
    M.engaged = false;
    M.x = this.foeSpot.x;
    M.alt = 0;
  }
}
