// The battle: 5 against 5, turn by turn. No pictures, no real time - the client shows what happens.
// Ported from LineRanger_TurnBased (play/battle.ts), the owner's earlier game; the rules are the same:
//
//   • Stats used = the unit's own + the bonus for its row (rules.ts ROW_BONUS); its role has traits (rules.ts).
//   • Turn order (as in Honkai: Star Rail): Action Value, AV = 10000 / Speed, the lowest goes next.
//       - a speed change (buff / debuff / running out) applies at once: AV left × old Speed / new Speed
//       - action advance X%: AV drops by X% of 10000 / Speed (100% = goes right away); never on oneself
//   • Team energy (shared): starts at 3, at most 10; a normal attack +1; a skill costs what it says.
//     (Monsters' skills cost nothing: each comes round every n of its own turns instead.)
//   • Normal attack: one target, front row first, 100% ATK; evaded by Evade (less the attacker's Hit).
//   • Attack skills are evaded by Skill Evade (less Skill Hit); their debuffs are resisted by status resistance.
//   • Barrier: blocks normal attacks and skills - except a skill that breaks invincibility (goes through and
//     breaks it). It doesn't block damage over time.
//   • Damage over time (poison / burn / bleed): at the start of the bearer's turn, % of the ATK of whoever put it
//     on (when they did), less DEF, by element. No crits, no evading. Different kinds stack; the same kind replaces.
//   • Stun / silence from a wide skill land less often: a row ×0.7, everyone ×0.5.
//   • While the front row stands, "front first" attacks can't reach the back row (assassins can).
//   • Taunt: enemies' normal attacks must go at the taunter (skills choose freely).
//   • Vulnerable / tough: a multiplier on damage taken. Skill (and normal) damage resistance cut theirs.
//   • Turn burn: the target's buffs and debuffs run out n turns sooner; its damage over time ticks n times now.
//   • Heal block: cuts heals, regeneration and lifesteal by % (100% = none).
//   • Damage by the caster's HP (damageHp): the caster's max HP instead of ATK as the base.
//   • Pierce x%: that share of the damage goes past the shield straight into HP.
//   • Element shift: the target becomes another element for a while (both for hitting and being hit).
//   • A price the caster pays: lose HP (% of max, never dying of it) or become vulnerable for a while.
//   • Heals / shields scale with the target's HP (usual), the caster's HP, or the caster's ATK.
//   • Lifesteal (on attack skills): % of the move's total damage healed, shared out evenly to self / own row /
//     all allies.
//   • Energy gain: never more than +1 net per move (the skill's cost + 1).
//   • Shield: takes damage instead of HP until it's gone.
//   • True damage: % of ATK straight into HP - no shield, no DEF, no crits, no variance, no element or role
//     (capped per hit). Barriers still block it; it can be evaded like the skill's other damage.
//   • Damage: ATK(±buffs) × % × (1 − DEF/(DEF+800)) × element × crit × role × 0.85–1.15 × DAMAGE_SCALE × overtime.
//   • Overtime: past turn 48 all damage +6% a turn (so games end).
//   • TURN_LIMIT turns and no winner: the side with more HP left (as % of its total) wins; closer than
//     TIME_UP_DRAW_PCT is a draw.
//   • No stun-locking: after a stun wears off, it can't be stunned again until the end of its next turn.
//   • Statuses count the bearer's turns; the turn it got one doesn't count. The same kind again replaces it.
//   • Reserves (summoned): up to RESERVE_MAX a side, off the field - no turns, can't be hit, not in team HP.
//     On anyone's turn the team can call one in to cast its skill 1 instead (costs that skill, no +1).
//     A called unit: raw stats (no row bonus), no statuses, stands in the caller's row; its self-buffs and
//     lifesteal go to the caller; it can't action-advance the caller. Then RESERVE_COOLDOWN team turns before
//     that one can come again. A silenced caller can't call.
//   • Random with a seed: the same start gives the same battle every time.

import { ULT, type ElementId } from '@mythoria/game-data';
import { BattleAI } from './ai';
import { elementMultiplier, passiveSum, statsWithPosition, traitOf, type RoleTrait } from './rules';
import type { ActionName, LifestealScope, PassiveDef, PassiveType, Role, Row, SkillArea, SkillDef, SkillEffect, Team, UnitSetup, CombatStats, EffectType, UnitSkills } from './types';

/** smart = scores every choice · basic = random move, weakest target · random = random everything. */
export type AiLevel = 'smart' | 'basic' | 'random';

export type DotType = 'poison' | 'burn' | 'bleed';
export type StatusType =
  | 'stun' | 'skillEvadeDown' | 'skillResDown' | 'evadeDown' | 'atkDown' | 'healBlock' | 'silence'
  | 'speedDown' | 'critDown' | 'critDmgDown' | 'hitDown' | 'skillHitDown' | 'vulnerable' | 'sealCleanse' | 'elementShift' | DotType
  | 'atkUp' | 'regen' | 'shield' | 'barrier' | 'evadeUp' | 'skillEvadeUp' | 'skillResUp'
  | 'speedUp' | 'critDmgUp' | 'critUp' | 'hitUp' | 'skillHitUp' | 'toughUp' | 'skillDmgResUp' | 'taunt';

export const DOT_TYPES: DotType[] = ['poison', 'burn', 'bleed'];
export const isDot = (t: StatusType): t is DotType => (DOT_TYPES as StatusType[]).includes(t);
export const DEBUFF_TYPES: StatusType[] = [
  'vulnerable', 'sealCleanse', 'elementShift',
  'stun', 'skillEvadeDown', 'skillResDown', 'evadeDown', 'atkDown', 'healBlock', 'silence',
  'speedDown', 'critDown', 'critDmgDown', 'hitDown', 'skillHitDown', ...DOT_TYPES,
];
export const isDebuff = (t: StatusType): boolean => DEBUFF_TYPES.includes(t);
const STATUS_EFFECTS = new Set<EffectType>([
  ...(DEBUFF_TYPES as EffectType[]),
  'atkUp', 'regen', 'shield', 'barrier', 'evadeUp', 'skillEvadeUp', 'skillResUp', 'speedUp', 'critDmgUp', 'critUp', 'hitUp', 'skillHitUp',
  'toughUp', 'skillDmgResUp', 'taunt',
]);
/** Control: harder to land from wide skills (AREA_CONTROL_CHANCE). */
const CONTROL_TYPES = new Set<StatusType>(['stun', 'silence']);
export const AREA_CONTROL_CHANCE: Partial<Record<SkillArea, number>> = { row: 0.7, all: 0.5 };

export interface Status {
  type: StatusType;
  pct: number;
  turns: number;
  /** A shield's HP left; a regeneration's HP a turn. */
  shieldHp?: number;
  /** The game turn it came on (that turn doesn't count down). */
  appliedTurn: number;
  /** Damage over time: the ATK and element of whoever put it on, when they did. */
  srcAtk?: number;
  srcElement?: ElementId;
  /** Element shift: the bearer's element meanwhile. */
  element?: ElementId;
}

export interface Unit {
  uid: string;
  id: string;
  name: string;
  look?: string;
  miniBoss?: boolean;
  level: number;
  team: Team;
  row: Row;
  lane: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
  critDmg: number;
  evade: number;
  hit: number;
  skillEvade: number;
  skillHit: number;
  statusRes: number;
  skillDmgRes: number;
  normalDmgRes: number;
  element?: ElementId;
  role: Role;
  skills: UnitSkills;
  passives: PassiveDef[];
  /** The ultimate's charge, 0..ULT.max (heroes; a unit without an ult never charges). */
  ult: number;
  statuses: Status[];
  /** Own turns until a skill that comes round every n turns is ready (0 = ready). */
  cd: Record<'skill1' | 'skill2', number>;
  /** No stun-locking: turns until it can be stunned again (0 = it can). */
  stunGuard: number;
  av: number;
  /** The speed its AV was last worked out with (a change rescales the AV left). */
  spdNow: number;
  alive: boolean;
  /** Reserve: called in to cast, then back. */
  reserve?: boolean;
  summoner?: Unit | null;
}

/** A turn's choice: its own move, or `caster` = a reserve called in to cast its skill1 / skill2. */
export interface Plan {
  action: ActionName;
  target: Unit;
  caster?: Unit;
}

export const RESERVE_MAX = 2;
export const RESERVE_COOLDOWN = 8;

export const ENERGY_START = 3;
export const ENERGY_MAX = 10;
export const ATTACK_ENERGY_GAIN = 1;

/**
 * The most these chances really are (%) - so nothing is unhittable: evade 60, skill evade 60, status
 * resistance 70, crit 100, damage resistances 60. (5 a side and a turn each: 90% evade would make skills moot.)
 */
export const CAPS = { crit: 100, evade: 60, skillEvade: 60, statusRes: 70, dmgRes: 60 };

/** How hard everything hits (tuned with the per-hit cap so a battle runs about 45 turns). */
export const DAMAGE_SCALE = 1.7;
/** At most this share of the target's max HP in one hit (overtime raises it). */
export const MAX_HIT_RATIO = 0.5;
export const OVERTIME_TURN = 48;
export const OVERTIME_STEP = 0.06;
export const TURN_LIMIT = 80;
export const TIME_UP_DRAW_PCT = 0.1;
const AV_BASE = 10000;
const DEF_K = 800;
const MIN_ATK_RATIO = 0.2;
const MIN_SPD_RATIO = 0.5;

/** The normal attack: one target, front row first, 100% (Evade instead of Skill Evade). */
export const NORMAL_ATTACK: SkillDef = { kind: 'attack', cost: 0, area: 'single_front', effects: [{ type: 'damage', pct: 100 }] };
/** What a unit without an ultimate would cast (never: it can't charge). */
const NO_ULT: SkillDef = { kind: 'attack', cost: 0, area: 'single_front', effects: [], name: '' };

export interface Outcome {
  uid: string;
  damage: number;
  crit: boolean;
  killed: boolean;
  elementMult: number;
  evaded: boolean;
  /** Blocked by a barrier. */
  immune: boolean;
  barrierBroken: boolean;
  shieldAbsorbed: number;
  healed: number;
  resisted: StatusType[];
  applied: StatusType[];
  dispelled: number;
  cleansed: number;
  trueDamage: number;
  advanced: boolean;
  burned: boolean;
  hpBefore: number;
}

/** What a move would do to one unit (shown before choosing): no dice, no evading, no crits, no resisting. */
export interface ActionPreview {
  uid: string;
  damage: number;
  trueDamage: number;
  immune: boolean;
  heal: number;
  shield: number;
  statuses: { type: StatusType; pct: number; turns: number }[];
  dispel: boolean;
  cleanse: boolean;
}

/** Of a previewed hit: what the shield and the HP would lose. */
export function previewLoss(p: { damage: number; trueDamage?: number }, hp: number, shield: number): { shieldLoss: number; hpLoss: number; ko: boolean } {
  const tr = Math.min(p.trueDamage ?? 0, p.damage);
  const normal = p.damage - tr;
  const shieldLoss = Math.min(shield, normal);
  const hpLoss = Math.min(hp, normal - shieldLoss + tr);
  return { shieldLoss, hpLoss, ko: hp > 0 && hpLoss >= hp };
}

export interface ActionResult {
  outcomes: Outcome[];
  energyGained: number;
  lifesteal: { uid: string; amount: number }[];
}

export interface TurnStart {
  stunned: boolean;
  regen: number;
  dots: { type: DotType; damage: number }[];
  dot: number;
  killed: boolean;
}

export interface HitResult {
  damage: number;
  crit: boolean;
  killed: boolean;
  elementMult: number;
}

/** mulberry32: random numbers from a seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const emptyOutcome = (uid: string, hpBefore = 0): Outcome => ({
  uid, hpBefore, damage: 0, crit: false, killed: false, elementMult: 1, evaded: false, immune: false, barrierBroken: false,
  shieldAbsorbed: 0, healed: 0, resisted: [], applied: [], dispelled: 0, cleansed: 0, trueDamage: 0, advanced: false, burned: false,
});

export class Battle {
  units: Unit[];
  energy: [number, number] = [ENERGY_START, ENERGY_START];
  skillsUsed: [number, number] = [0, 0];
  turn = 0;
  private rand: () => number;
  reserves: [Unit[], Unit[]] = [[], []];
  reserveCd: Record<string, number> = {};
  timeUpResult: { winner: Team | null; pct: [number, number] } | null = null;
  aiLevel: [AiLevel, AiLevel] = ['smart', 'smart'];
  private ai: BattleAI;
  /** The AI looks ahead by playing copies (a copy doesn't look ahead again). */
  aiSearch = true;

  constructor(teams: [UnitSetup[], UnitSetup[]], seed = 1, reserves: [UnitSetup[], UnitSetup[]] = [[], []]) {
    this.rand = rng(seed);
    this.ai = new BattleAI(this, this.rand);
    this.units = [];
    teams.forEach((list, t) => {
      list.forEach((u, i) => {
        const s = statsWithPosition(u.stats, u.row);
        // equal speeds would tie for ever: a hair's difference keeps the order sure, the sides taking turns
        const spd = Math.max(1, s.spd) + (5 - i) * 0.01 + (t === 0 ? 0.001 : 0);
        this.units.push(this.makeUnit(u, t as Team, s, spd, `${t}-${u.row}-${u.lane}`));
      });
    });
    reserves.forEach((list, t) => {
      list.slice(0, RESERVE_MAX).forEach((u, i) => {
        const r = this.makeUnit(u, t as Team, u.stats, Math.max(1, u.stats.spd), `${t}-sup-${i}`);
        r.reserve = true;
        r.lane = i;
        this.reserves[t as Team].push(r);
        this.reserveCd[r.uid] = 0;
      });
    });
    this.startEnergy();
  }

  private makeUnit(u: UnitSetup, t: Team, s: CombatStats, spd: number, uid: string): Unit {
    const cdOf = (k: 'skill1' | 'skill2') => Math.max(0, (u.skills[k].every ?? 0) - 1);
    return {
      uid, id: u.id, name: u.name, look: u.look, miniBoss: u.miniBoss,
      level: u.level ?? 1, team: t, row: u.row, lane: u.lane,
      hp: s.hp, maxHp: s.hp, atk: s.atk, def: s.def, spd,
      crit: s.crit, critDmg: s.critDmg, evade: s.evade, hit: s.hit, skillEvade: s.skillEvade, skillHit: s.skillHit,
      statusRes: s.statusRes, skillDmgRes: s.skillDmgRes, normalDmgRes: s.normalDmgRes,
      element: u.element, role: u.role ?? 'warrior', skills: u.skills, passives: u.passives ?? [],
      statuses: [], cd: { skill1: cdOf('skill1'), skill2: cdOf('skill2') }, ult: u.skills.ult ? ULT.start : 0,
      stunGuard: 0, av: AV_BASE / spd, spdNow: spd, alive: true,
    };
  }

  // ---------------------------------------------------------------- reserves

  reserveOf(uid: string): Unit | undefined {
    return this.reserves[0].find((r) => r.uid === uid) ?? this.reserves[1].find((r) => r.uid === uid);
  }
  reserveCooldown(r: Unit): number {
    return this.reserveCd[r.uid] ?? 0;
  }
  /** Ready a reserve to cast for its caller: the caller's row, full HP, no statuses. */
  prepareSummon(summoner: Unit, r: Unit): void {
    r.row = summoner.row;
    r.summoner = summoner;
    r.statuses = [];
    r.hp = r.maxHp;
    r.alive = true;
  }
  canSummon(summoner: Unit, r: Unit, action: ActionName): boolean {
    // a reserve is called in for its skill 1 or skill 2 - never its normal attack or its ultimate (the owner's
    // rule); either one rests it (both skills) for RESERVE_COOLDOWN turns
    if ((action !== 'skill1' && action !== 'skill2') || !summoner.alive || r.team !== summoner.team) return false;
    if (this.has(summoner, 'silence') || this.reserveCooldown(r) > 0) return false;
    return this.energy[summoner.team] >= this.costOf(r, action);
  }
  commitSummon(summoner: Unit, r: Unit, action: ActionName): void {
    this.prepareSummon(summoner, r);
    const t = summoner.team;
    this.skillsUsed[t]++;
    this.energy[t] = clamp(this.energy[t] - this.costOf(r, action), 0, ENERGY_MAX);
    this.reserveCd[r.uid] = RESERVE_COOLDOWN;
  }

  /** Carry out a turn's plan (its own move or a call) - pay, then resolve. */
  perform(actor: Unit, plan: Plan): ActionResult {
    let r: ActionResult;
    if (plan.caster) {
      this.commitSummon(actor, plan.caster, plan.action);
      r = this.resolveAction(plan.caster, plan.action, plan.target);
    } else {
      this.commitAction(actor, plan.action);
      r = this.resolveAction(actor, plan.action, plan.target);
    }
    this.chargeUlts(actor, plan, r);
    return r;
  }

  // ---------------------------------------------------------------- the ultimate

  /** Has it an ultimate, and is it charged? */
  ultReady(u: Unit): boolean {
    return !!u.skills.ult && u.alive && !u.reserve && u.ult >= ULT.max;
  }
  /** Its ult's charge as a share (0..1; no ult: 0). */
  ultShare(u: Unit): number {
    return u.skills.ult ? Math.min(1, u.ult / ULT.max) : 0;
  }
  private charge(u: Unit | undefined, n: number): void {
    if (!u || !u.skills.ult || !u.alive || u.reserve) return;
    u.ult = clamp(u.ult + n, 0, ULT.max);
  }
  /**
   * After a move: whoever moved charges (its attack, its skill - or calling in the special team - and each enemy
   * it finished off); everyone hit by it charges a little. The ult itself starts its charge again.
   */
  private chargeUlts(actor: Unit, plan: Plan, r: ActionResult): void {
    if (plan.action === 'ult') actor.ult = ULT.afterUlt;
    else this.charge(actor, plan.action === 'attack' && !plan.caster ? ULT.attack : ULT.skill);
    for (const o of r.outcomes) {
      const t = this.unit(o.uid);
      if (!t || t.team === actor.team) continue;
      if (o.killed) this.charge(actor, ULT.kill);
      if (o.damage > 0 || o.trueDamage > 0) this.charge(t, ULT.hit);
    }
  }

  /** A team's starting energy: 3 + its role bonus (a support: +1, at most once). */
  private startEnergy(): void {
    for (const t of [0, 1] as Team[]) {
      const bonus = Math.max(0, ...this.units.filter((u) => u.team === t).map((u) => traitOf(u.role).energyBonus ?? 0));
      this.energy[t] = Math.min(ENERGY_MAX, ENERGY_START + bonus);
    }
  }

  trait(u: Unit): RoleTrait {
    return traitOf(u.role);
  }
  unit(uid: string): Unit | undefined {
    return this.units.find((u) => u.uid === uid);
  }

  get winner(): Team | null {
    if (this.timeUpResult) return this.timeUpResult.winner;
    const alive = (t: Team) => this.units.some((u) => u.team === t && u.alive);
    if (!alive(1)) return 0;
    if (!alive(0)) return 1;
    return null;
  }
  get over(): boolean {
    return this.timeUpResult !== null || this.winner !== null;
  }
  get isDraw(): boolean {
    return this.timeUpResult !== null && this.timeUpResult.winner === null;
  }
  /** A team's HP left, as % of its total (shields don't count). */
  hpPct(team: Team): number {
    const list = this.units.filter((u) => u.team === team);
    const max = list.reduce((n, u) => n + u.maxHp, 0);
    const hp = list.reduce((n, u) => n + (u.alive ? u.hp : 0), 0);
    return max ? (hp / max) * 100 : 0;
  }
  timeUp(): { winner: Team | null; pct: [number, number] } {
    if (this.timeUpResult) return this.timeUpResult;
    const pct: [number, number] = [this.hpPct(0), this.hpPct(1)];
    const winner: Team | null = Math.abs(pct[0] - pct[1]) < TIME_UP_DRAW_PCT ? null : pct[0] > pct[1] ? 0 : 1;
    this.timeUpResult = { winner, pct };
    return this.timeUpResult;
  }

  // ---------------------------------------------------------------- numbers in force (with buffs / debuffs)

  has(u: Unit, type: StatusType): boolean {
    return u.statuses.some((s) => s.type === type);
  }
  private pctOf(u: Unit, type: StatusType): number {
    return u.statuses.filter((s) => s.type === type).reduce((n, s) => n + s.pct, 0);
  }
  passive(u: Unit, type: PassiveType): number {
    return passiveSum(u.passives, type);
  }
  effElement(u: Unit): ElementId | undefined {
    return u.statuses.find((s) => s.type === 'elementShift')?.element ?? u.element;
  }
  effAtk(u: Unit): number {
    return u.atk * (1 + this.passive(u, 'atkUp') / 100) * Math.max(MIN_ATK_RATIO, 1 + (this.pctOf(u, 'atkUp') - this.pctOf(u, 'atkDown')) / 100);
  }
  effSpd(u: Unit): number {
    return u.spd * (1 + this.passive(u, 'speedUp') / 100) * Math.max(MIN_SPD_RATIO, 1 + (this.pctOf(u, 'speedUp') - this.pctOf(u, 'speedDown')) / 100);
  }
  effCrit(u: Unit): number {
    return clamp(u.crit + this.passive(u, 'critUp') + this.pctOf(u, 'critUp') - this.pctOf(u, 'critDown'), 0, CAPS.crit);
  }
  effCritDmg(u: Unit): number {
    return Math.max(100, u.critDmg + this.pctOf(u, 'critDmgUp') - this.pctOf(u, 'critDmgDown'));
  }
  canHeal(u: Unit): boolean {
    return u.alive && this.healFactor(u) > 0;
  }
  effEvade(u: Unit): number {
    return u.evade + this.pctOf(u, 'evadeUp') - this.pctOf(u, 'evadeDown');
  }
  effHit(u: Unit): number {
    return u.hit + this.pctOf(u, 'hitUp') - this.pctOf(u, 'hitDown');
  }
  effSkillEvade(u: Unit): number {
    return u.skillEvade + this.pctOf(u, 'skillEvadeUp') - this.pctOf(u, 'skillEvadeDown');
  }
  effSkillHit(u: Unit): number {
    return u.skillHit + this.pctOf(u, 'skillHitUp') - this.pctOf(u, 'skillHitDown');
  }
  effStatusRes(u: Unit): number {
    return u.statusRes + this.pctOf(u, 'skillResUp') - this.pctOf(u, 'skillResDown');
  }
  effSkillDmgRes(u: Unit): number {
    return u.skillDmgRes + this.pctOf(u, 'skillDmgResUp');
  }
  /**
   * × on the damage a target takes: vulnerable − tough (instead of DEF up / down); then its resistance to
   * skill (or normal-attack) damage. Never below 10%.
   */
  takenMult(target: Unit, isSkill: boolean): number {
    const amp = Math.max(0.1, 1 + (this.pctOf(target, 'vulnerable') - this.pctOf(target, 'toughUp') - this.passive(target, 'tough')) / 100);
    const res = 1 - clamp(isSkill ? this.effSkillDmgRes(target) : target.normalDmgRes, 0, CAPS.dmgRes) / 100;
    return amp * res;
  }
  healFactor(u: Unit): number {
    if (!this.has(u, 'healBlock')) return 1;
    const cut = this.pctOf(u, 'healBlock') || 100;
    return Math.max(0, 1 - cut / 100);
  }
  evadeChance(attacker: Unit, target: Unit, normal: boolean): number {
    return normal
      ? clamp(this.effEvade(target) - this.effHit(attacker), 0, CAPS.evade)
      : clamp(this.effSkillEvade(target) - this.effSkillHit(attacker), 0, CAPS.skillEvade);
  }
  resistChance(target: Unit): number {
    return clamp(this.effStatusRes(target), 0, CAPS.statusRes);
  }

  // ---------------------------------------------------------------- turns

  /** Whose turn next: time runs on until someone's AV reaches 0. */
  nextActor(): Unit | null {
    if (this.over) return null;
    const alive = this.units.filter((u) => u.alive);
    const actor = alive.reduce((a, b) => (b.av < a.av ? b : a));
    const dt = actor.av;
    for (const u of alive) u.av -= dt;
    actor.spdNow = this.effSpd(actor);
    actor.av = AV_BASE / actor.spdNow;
    this.turn++;
    return actor;
  }
  /** A speed changed: rescale the AV left (AV × old Speed / new Speed). */
  syncSpeed(): void {
    for (const u of this.units) {
      if (!u.alive) continue;
      const now = this.effSpd(u);
      if (Math.abs(now - u.spdNow) < 1e-9) continue;
      u.av = (u.av * u.spdNow) / now;
      u.spdNow = now;
    }
  }
  advance(u: Unit, pct: number): void {
    u.av = Math.max(0, u.av - ((pct / 100) * AV_BASE) / this.effSpd(u));
  }
  previewOrder(n: number): Unit[] {
    return this.previewSchedule(n).map((e) => e.unit);
  }
  /** The next n turns, and how long until each (in AV from now). */
  previewSchedule(n: number): { unit: Unit; wait: number }[] {
    const sim = this.units.filter((u) => u.alive).map((u) => ({ u, av: u.av }));
    const out: { unit: Unit; wait: number }[] = [];
    if (!sim.length) return out;
    let elapsed = 0;
    for (let i = 0; i < n; i++) {
      const next = sim.reduce((a, b) => (b.av < a.av ? b : a));
      const dt = next.av;
      elapsed += dt;
      for (const s of sim) s.av -= dt;
      next.av = AV_BASE / this.effSpd(next.u);
      out.push({ unit: next.u, wait: elapsed });
    }
    return out;
  }
  /** Start of a turn: damage over time, then regeneration (unless blocked); is it stunned? */
  beginTurn(u: Unit): TurnStart {
    const dots: TurnStart['dots'] = [];
    let dot = 0;
    for (const s of u.statuses.filter((st) => isDot(st.type))) {
      if (!u.alive) break;
      const damage = this.dotTick(u, s);
      this.takeDamage(u, damage, emptyOutcome(u.uid, u.hp));
      dots.push({ type: s.type as DotType, damage });
      dot += damage;
    }
    let regen = 0;
    const r = u.statuses.find((s) => s.type === 'regen');
    if (r && this.canHeal(u)) {
      regen = Math.min(u.maxHp - u.hp, Math.round((r.shieldHp ?? (u.maxHp * r.pct) / 100) * this.healFactor(u)));
      u.hp += regen;
    }
    return { stunned: u.alive && this.has(u, 'stun'), regen, dots, dot, killed: !u.alive };
  }
  /** One tick of damage over time (no crit, no dice; capped like a hit). */
  dotTick(target: Unit, s: Status): number {
    const defFactor = 1 - target.def / (target.def + DEF_K);
    const raw = (s.srcAtk ?? 0) * (s.pct / 100) * defFactor * elementMultiplier(s.srcElement, this.effElement(target))
      * this.damageMult * (traitOf(target.role).damageTaken ?? 1) * this.takenMult(target, false);
    return Math.max(1, Math.round(this.capDamage(raw, target)));
  }
  /** End of a turn: its statuses count down (not ones it got this turn); cooldowns too. */
  endTurn(u: Unit): void {
    for (const r of this.reserves[u.team]) if ((this.reserveCd[r.uid] ?? 0) > 0) this.reserveCd[r.uid]--;
    if (u.cd.skill1 > 0) u.cd.skill1--;
    if (u.cd.skill2 > 0) u.cd.skill2--;
    if (u.stunGuard > 0) u.stunGuard--;
    const wasStunned = this.has(u, 'stun');
    for (const s of u.statuses) if (s.appliedTurn !== this.turn) s.turns--;
    u.statuses = u.statuses.filter((s) => s.turns > 0 && !(s.type === 'shield' && (s.shieldHp ?? 0) <= 0));
    if (wasStunned && !this.has(u, 'stun')) u.stunGuard = 2;
    this.syncSpeed();
    if (this.turn >= TURN_LIMIT && this.winner === null) this.timeUp();
  }
  get overtimeMult(): number {
    return 1 + Math.max(0, this.turn - OVERTIME_TURN) * OVERTIME_STEP;
  }

  // ---------------------------------------------------------------- moves and targets

  canStrikeAnyone(attacker: Unit): boolean {
    return traitOf(attacker.role).strikeAnyone === true;
  }
  skillOf(u: Unit, action: ActionName): SkillDef {
    if (action === 'attack') return this.canStrikeAnyone(u) ? { ...NORMAL_ATTACK, area: 'single_any' } : NORMAL_ATTACK;
    if (action === 'ult') return u.skills.ult ?? NO_ULT;
    return u.skills[action];
  }
  costOf(u: Unit, action: ActionName): number {
    return action === 'attack' || action === 'ult' ? 0 : Math.max(0, u.skills[action].cost);
  }
  /** Turns until a monster's skill comes round (0 = ready; heroes' skills: always 0). */
  cooldownOf(u: Unit, action: ActionName): number {
    return action === 'attack' || action === 'ult' ? 0 : u.cd[action];
  }
  canUse(u: Unit, action: ActionName): boolean {
    if (action === 'attack') return true;
    if (action === 'ult') return this.ultReady(u) && !this.has(u, 'silence');
    return !this.has(u, 'silence') && this.energy[u.team] >= this.costOf(u, action) && u.cd[action] <= 0;
  }
  targetsAllies(u: Unit, action: ActionName): boolean {
    return this.skillOf(u, action).kind === 'buff';
  }
  /** Who can be picked. */
  selectableTargets(actor: Unit, action: ActionName): Unit[] {
    const enemies = this.units.filter((u) => u.alive && u.team !== actor.team);
    const allies = this.units.filter((u) => u.alive && u.team === actor.team);
    const front = enemies.filter((u) => u.row === 'front');
    if (action === 'attack') {
      const taunting = enemies.filter((u) => this.has(u, 'taunt'));
      if (taunting.length) return taunting;
    }
    switch (this.skillOf(actor, action).area) {
      case 'single_front': return front.length ? front : enemies;
      case 'single_any': return enemies;
      case 'row': return front.length ? front : enemies;
      case 'row_any': return enemies;
      case 'all': return enemies;
      case 'self': return [actor.summoner ?? actor];
      case 'own_row': return allies.filter((u) => u.row === actor.row);
      case 'ally_single': return allies;
      case 'ally_all': return allies;
    }
  }
  /** Everyone a move reaches, when `chosen` is picked. */
  affectedUnits(actor: Unit, action: ActionName, chosen: Unit): Unit[] {
    const enemies = this.units.filter((u) => u.alive && u.team !== actor.team);
    const allies = this.units.filter((u) => u.alive && u.team === actor.team);
    switch (this.skillOf(actor, action).area) {
      case 'single_front':
      case 'single_any':
      case 'ally_single': return chosen.alive ? [chosen] : [];
      case 'row':
      case 'row_any': return enemies.filter((u) => u.row === chosen.row);
      case 'all': return enemies;
      case 'self': { const me = actor.summoner ?? actor; return me.alive ? [me] : []; }
      case 'own_row': return allies.filter((u) => u.row === actor.row);
      case 'ally_all': return allies;
    }
  }

  /** A copy for the AI to play ahead in: its own numbers, statuses and dice (skills are shared, read only). */
  clone(seed: number): Battle {
    const c = Object.create(Battle.prototype) as Battle;
    Object.assign(c, this);
    c.units = this.units.map((u) => ({ ...u, statuses: u.statuses.map((s) => ({ ...s })), cd: { ...u.cd } }));
    c.reserves = [this.reserves[0].map((r) => ({ ...r, statuses: [] })), this.reserves[1].map((r) => ({ ...r, statuses: [] }))];
    c.reserveCd = { ...this.reserveCd };
    c.energy = [this.energy[0], this.energy[1]];
    c.skillsUsed = [this.skillsUsed[0], this.skillsUsed[1]];
    c.timeUpResult = this.timeUpResult ? { ...this.timeUpResult, pct: [...this.timeUpResult.pct] as [number, number] } : null;
    c.aiLevel = [this.aiLevel[0], this.aiLevel[1]];
    c.rand = rng(seed);
    c.ai = new BattleAI(c, c.rand);
    c.aiSearch = false;
    return c;
  }
  nextRandom(): number {
    return this.rand();
  }
  get energyMax(): number {
    return ENERGY_MAX;
  }
  get damageMult(): number {
    return DAMAGE_SCALE * this.overtimeMult;
  }
  capDamage(raw: number, target: Unit): number {
    return Math.min(raw, target.maxHp * MAX_HIT_RATIO * this.overtimeMult);
  }
  /**
   * × from roles. The attacker: a mage's skills, a warrior's desperation, a marksman against a target over half
   * HP, an execute against one under half. The target: a tank takes less.
   */
  roleDamageMult(attacker: Unit, target: Unit, normal: boolean): number {
    const a = traitOf(attacker.role);
    let m = normal ? a.normalDamage ?? 1 : a.skillDamage ?? 1;
    if (a.desperation) m *= 1 + a.desperation * (1 - attacker.hp / Math.max(1, attacker.maxHp));
    if (a.bigTargetDamage && target.hp >= target.maxHp / 2) m *= 1 + a.bigTargetDamage;
    if (target.hp < target.maxHp / 2) m *= (a.executeDamage ?? 1) * (1 + this.passive(attacker, 'execute') / 100);
    return m * (traitOf(target.role).damageTaken ?? 1);
  }
  /** Average damage expected (no dice, no evading) - for the AI. */
  expectedDamage(attacker: Unit, target: Unit, pct: number, normal = false, base?: number): number {
    const critExp = 1 + (this.effCrit(attacker) / 100) * (this.effCritDmg(attacker) / 100 - 1);
    const defFactor = 1 - target.def / (target.def + DEF_K);
    const raw = (base ?? this.effAtk(attacker)) * (pct / 100) * defFactor * elementMultiplier(this.effElement(attacker), this.effElement(target)) * critExp * this.damageMult
      * this.roleDamageMult(attacker, target, normal) * this.takenMult(target, !normal);
    return this.capDamage(raw, target);
  }

  /**
   * The move and target for this turn, chosen by the side's AI. A monster whose skill has come round uses it
   * (its best target); otherwise as LineRanger_TurnBased's bots do.
   */
  planAuto(u: Unit): Plan | null {
    // a charged ult goes first (the turn goes on after it: the move is planned again)
    if (this.canUse(u, 'ult')) {
      const t = this.ai.bestTarget(u, 'ult');
      if (t) return { action: 'ult', target: t.target };
    }
    for (const k of ['skill2', 'skill1'] as const) {
      if (u.skills[k].every && this.canUse(u, k)) {
        const t = this.ai.bestTarget(u, k);
        if (t) return { action: k, target: t.target };
      }
    }
    if (this.aiLevel[u.team] === 'smart') {
      const c = this.ai.choose(u);
      return c ? { action: c.action, target: c.target, caster: c.caster } : null;
    }
    const usable = (['attack', 'skill1', 'skill2'] as ActionName[]).filter((a) => this.canUse(u, a));
    const action = usable[Math.floor(this.rand() * usable.length)];
    const list = this.selectableTargets(u, action);
    if (!list.length) return null;
    if (this.aiLevel[u.team] === 'random') return { action, target: list[Math.floor(this.rand() * list.length)] };
    const ally = this.targetsAllies(u, action);
    return { action, target: list.reduce((a, b) => ((ally ? b.hp / b.maxHp < a.hp / a.maxHp : b.hp < a.hp) ? b : a)) };
  }
  autoAction(u: Unit): ActionName {
    return this.planAuto(u)?.action ?? 'attack';
  }
  autoTarget(u: Unit, action: ActionName = 'attack'): Unit | null {
    return this.ai.bestTarget(u, action)?.target ?? null;
  }
  /** Pay (or gain) energy as a move starts; a monster's skill starts its count again. */
  commitAction(u: Unit, action: ActionName): void {
    const t = u.team;
    if (action === 'ult') {
      this.skillsUsed[t]++;
      return;
    }
    if (action !== 'attack') {
      this.skillsUsed[t]++;
      const every = u.skills[action].every;
      if (every) u.cd[action] = every;
    }
    const gain = action === 'attack' ? ATTACK_ENERGY_GAIN : 0;
    this.energy[t] = clamp(this.energy[t] - this.costOf(u, action) + gain, 0, ENERGY_MAX);
  }

  // ---------------------------------------------------------------- what a move does

  private addStatus(target: Unit, type: StatusType, pct: number, turns: number, shieldHp?: number, src?: Unit): void {
    target.statuses = target.statuses.filter((s) => s.type !== type);
    const st: Status = { type, pct, turns: Math.max(1, turns), shieldHp, appliedTurn: this.turn };
    if (src && isDot(type)) {
      st.srcAtk = this.effAtk(src);
      st.srcElement = src.element;
    }
    target.statuses.push(st);
  }
  /** Turn burn: damage over time ticks n times now; every status runs n turns shorter (works through barriers). */
  private burnTurns(t: Unit, n: number, o: Outcome): void {
    for (const st of [...t.statuses]) {
      if (isDot(st.type)) {
        for (let i = 0; i < Math.min(n, st.turns) && t.alive; i++) {
          const d = this.dotTick(t, st);
          o.damage += d;
          this.takeDamage(t, d, o);
        }
      }
      st.turns -= n;
    }
    t.statuses = t.statuses.filter((st) => st.turns > 0 && !(st.type === 'shield' && (st.shieldHp ?? 0) <= 0));
    o.burned = true;
  }
  private rollDamage(attacker: Unit, target: Unit, pct: number, normal = false, base?: number): { damage: number; crit: boolean; elementMult: number } {
    const crit = this.rand() * 100 < this.effCrit(attacker);
    const variance = 0.85 + this.rand() * 0.3;
    const defFactor = 1 - target.def / (target.def + DEF_K);
    const elementMult = elementMultiplier(this.effElement(attacker), this.effElement(target));
    const raw = (base ?? this.effAtk(attacker)) * (pct / 100) * defFactor * elementMult
      * (crit ? this.effCritDmg(attacker) / 100 : 1) * variance * this.damageMult * this.roleDamageMult(attacker, target, normal)
      * this.takenMult(target, !normal);
    return { damage: Math.max(1, Math.round(this.capDamage(raw, target))), crit, elementMult };
  }
  private dealWithPierce(target: Unit, damage: number, o: Outcome, pierce = 0): void {
    const through = Math.round((damage * Math.max(0, Math.min(100, pierce))) / 100);
    if (through > 0) this.takeDamage(target, through, o, true);
    if (damage - through > 0) this.takeDamage(target, damage - through, o);
  }
  /** Damage: the shield takes it first, then HP. */
  private takeDamage(target: Unit, damage: number, o: Outcome, ignoreShield = false): void {
    let left = damage;
    const shield = ignoreShield ? undefined : target.statuses.find((s) => s.type === 'shield');
    if (shield && (shield.shieldHp ?? 0) > 0) {
      const absorb = Math.min(shield.shieldHp!, left);
      shield.shieldHp! -= absorb;
      left -= absorb;
      o.shieldAbsorbed += absorb;
      if (shield.shieldHp! <= 0) target.statuses = target.statuses.filter((s) => s !== shield);
    }
    target.hp = Math.max(0, target.hp - left);
    if (target.hp === 0) {
      target.alive = false;
      target.statuses = [];
      o.killed = true;
    }
  }
  /** What a heal / shield is worked out from: the target's HP (usual), the caster's HP or ATK. */
  healBase(caster: Unit, target: Unit, e: SkillEffect): number {
    const pct = (e.pct ?? 0) / 100;
    const power = (traitOf(caster.role).supportPower ?? 1) * (1 + this.passive(caster, 'healUp') / 100);
    const base = e.scale === 'casterHp' ? caster.maxHp : e.scale === 'casterAtk' ? this.effAtk(caster) : target.maxHp;
    return base * pct * power;
  }
  private healUnit(u: Unit, amount: number): number {
    if (!this.canHeal(u) || amount <= 0) return 0;
    const got = Math.min(u.maxHp - u.hp, Math.round(amount * this.healFactor(u)));
    u.hp += got;
    return got;
  }
  lifestealTargets(actor: Unit, scope: LifestealScope): Unit[] {
    const allies = this.units.filter((u) => u.alive && u.team === actor.team);
    const me = actor.summoner ?? actor;
    return scope === 'ally_all' ? allies : scope === 'own_row' ? allies.filter((u) => u.row === actor.row) : me.alive ? [me] : [];
  }
  /** Before choosing: what this move would do to everyone it'd reach (chosen: the one pointed at). */
  previewAction(actor: Unit, action: ActionName, chosen: Unit | null): ActionPreview[] {
    const skill = this.skillOf(actor, action);
    const normal = action === 'attack';
    const pool = this.selectableTargets(actor, action);
    const picks = chosen && pool.includes(chosen) ? [chosen] : pool;
    const targets = [...new Set(picks.flatMap((t) => this.affectedUnits(actor, action, t)))];
    const breaks = skill.effects.some((e) => e.type === 'breakInvincible');
    return targets.map((t) => {
      const p: ActionPreview = { uid: t.uid, damage: 0, trueDamage: 0, immune: false, heal: 0, shield: 0, statuses: [], dispel: false, cleanse: false };
      if (skill.kind === 'attack') {
        if (this.has(t, 'barrier') && !breaks) {
          p.immune = true;
          return p;
        }
        for (const e of skill.effects) {
          if (e.type === 'damage') p.damage += this.previewHit(actor, t, e.pct ?? 100, normal);
          else if (e.type === 'damageHp') p.damage += this.previewHit(actor, t, e.pct ?? 100, normal, actor.maxHp);
          else if (e.type === 'trueDamage') {
            const d = this.trueHit(actor, t, e.pct ?? 100);
            p.damage += d;
            p.trueDamage += d;
          } else if (e.type === 'dispelBuffs') p.dispel = true;
          else if (STATUS_EFFECTS.has(e.type)) p.statuses.push({ type: e.type as StatusType, pct: e.pct ?? 0, turns: e.turns ?? 1 });
        }
      } else {
        for (const e of skill.effects) {
          if (e.type === 'heal') p.heal += Math.round(this.healBase(actor, t, e) * this.healFactor(t));
          else if (e.type === 'shield') p.shield += Math.round(this.healBase(actor, t, e));
          else if (e.type === 'cleanse') p.cleanse = true;
          else if (STATUS_EFFECTS.has(e.type)) p.statuses.push({ type: e.type as StatusType, pct: e.pct ?? 0, turns: e.turns ?? 1 });
        }
        p.heal = Math.min(p.heal, t.maxHp - t.hp);
      }
      return p;
    });
  }
  trueHit(attacker: Unit, target: Unit, pct: number): number {
    return Math.max(1, Math.round(this.capDamage(this.effAtk(attacker) * (pct / 100) * this.damageMult * this.takenMult(target, true), target)));
  }
  private previewHit(attacker: Unit, target: Unit, pct: number, normal: boolean, base?: number): number {
    const defFactor = 1 - target.def / (target.def + DEF_K);
    const raw = (base ?? this.effAtk(attacker)) * (pct / 100) * defFactor * elementMultiplier(this.effElement(attacker), this.effElement(target))
      * this.damageMult * this.roleDamageMult(attacker, target, normal) * this.takenMult(target, !normal);
    return Math.max(1, Math.round(this.capDamage(raw, target)));
  }

  /** Use a move: work it out and apply it to everyone it reaches. */
  resolveAction(actor: Unit, action: ActionName, chosen: Unit): ActionResult {
    const skill = this.skillOf(actor, action);
    const normal = action === 'attack';
    // never on the wrong side (an attack on a friend, a buff on a foe): the move's best target instead
    if ((skill.kind === 'attack') === (chosen.team === actor.team)) {
      const fix = this.autoTarget(actor, action);
      if (fix) chosen = fix;
    }
    const targets = this.affectedUnits(actor, action, chosen);
    const outcomes: Outcome[] = [];
    let energyGained = 0;
    const healed = new Map<string, number>();
    const addHeal = (u: Unit, amount: number) => {
      const got = this.healUnit(u, amount);
      if (got > 0) healed.set(u.uid, (healed.get(u.uid) ?? 0) + got);
    };
    for (const e of skill.effects) {
      if (e.type === 'selfHpCost') actor.hp = Math.max(1, actor.hp - Math.round((actor.maxHp * (e.pct ?? 0)) / 100));
      else if (e.type === 'selfVulnerable') this.addStatus(actor, 'vulnerable', e.pct ?? 0, e.turns ?? 1);
    }

    if (skill.kind === 'attack') {
      const breaks = skill.effects.some((e) => e.type === 'breakInvincible');
      const traitSteal = (traitOf(actor.role).lifesteal ?? 0) + this.passive(actor, 'lifesteal') / 100;
      const controlChance = AREA_CONTROL_CHANCE[skill.area] ?? 1;
      let dealt = 0;
      for (const t of targets) {
        const o = emptyOutcome(t.uid, t.hp);
        outcomes.push(o);
        if (!t.alive) continue;
        if (this.rand() * 100 < this.evadeChance(actor, t, normal)) {
          o.evaded = true;
          continue;
        }
        if (this.has(t, 'barrier')) {
          if (!breaks) {
            for (const e of skill.effects) if (e.type === 'turnBurn') this.burnTurns(t, Math.max(1, e.turns ?? 1), o);
            o.immune = true;
            continue;
          }
          t.statuses = t.statuses.filter((s) => s.type !== 'barrier');
          o.barrierBroken = true;
        }
        for (const e of skill.effects) {
          if (e.type === 'damage' || e.type === 'damageHp') {
            const base = e.type === 'damageHp' ? actor.maxHp : undefined;
            const r = this.rollDamage(actor, t, e.pct ?? 100, normal, base);
            o.damage += r.damage;
            o.crit ||= r.crit;
            o.elementMult = r.elementMult;
            this.dealWithPierce(t, r.damage, o, e.pierce ?? 0);
            dealt += r.damage;
            if (traitSteal > 0) addHeal(actor, r.damage * traitSteal);
          } else if (e.type === 'trueDamage') {
            const d = this.trueHit(actor, t, e.pct ?? 100);
            o.damage += d;
            o.trueDamage += d;
            this.takeDamage(t, d, o, true);
            dealt += d;
            if (traitSteal > 0) addHeal(actor, d * traitSteal);
          }
        }
        if (!t.alive) continue;
        for (const e of skill.effects) {
          if (e.type === 'turnBurn') this.burnTurns(t, Math.max(1, e.turns ?? 1), o);
          else if (e.type === 'energyGain') {
            const before = this.energy[actor.team];
            const amount = Math.min(e.amount ?? 1, Math.max(0, skill.cost) + 1);
            this.energy[actor.team] = clamp(before + amount, 0, ENERGY_MAX);
            energyGained += this.energy[actor.team] - before;
          } else if (e.type === 'dispelBuffs') {
            const before = t.statuses.length;
            t.statuses = t.statuses.filter((s) => isDebuff(s.type));
            o.dispelled += before - t.statuses.length;
          } else if (STATUS_EFFECTS.has(e.type)) {
            const type = e.type as StatusType;
            if (type === 'stun' && (t.stunGuard > 0 || this.has(t, 'stun'))) o.resisted.push(type);
            else if (this.rand() * 100 < this.resistChance(t)) o.resisted.push(type);
            else if (CONTROL_TYPES.has(type) && this.rand() >= controlChance) o.resisted.push(type);
            else {
              this.addStatus(t, type, e.pct ?? 0, e.turns ?? 1, undefined, actor);
              if (type === 'elementShift') {
                const st = t.statuses.find((x) => x.type === 'elementShift');
                if (st) st.element = e.element;
              }
              o.applied.push(type);
            }
          }
        }
      }
      for (const e of skill.effects) {
        if (e.type !== 'lifesteal' || dealt <= 0) continue;
        const list = this.lifestealTargets(actor, e.scope ?? 'self');
        for (const u of list) addHeal(u, (dealt * (e.pct ?? 0)) / 100 / list.length);
      }
    } else {
      for (const e of skill.effects) {
        if (e.type === 'energyGain') {
          const before = this.energy[actor.team];
          const amount = Math.min(e.amount ?? 1, Math.max(0, skill.cost) + 1);
          this.energy[actor.team] = clamp(before + amount, 0, ENERGY_MAX);
          energyGained += this.energy[actor.team] - before;
        }
      }
      for (const t of targets) {
        const o = emptyOutcome(t.uid, t.hp);
        outcomes.push(o);
        if (!t.alive) continue;
        for (const e of skill.effects) {
          if (e.type === 'heal') o.healed += this.healUnit(t, this.healBase(actor, t, e));
          else if (e.type === 'cleanse') {
            if (!this.has(t, 'sealCleanse')) {
              const before = t.statuses.length;
              t.statuses = t.statuses.filter((s) => !isDebuff(s.type));
              o.cleansed += before - t.statuses.length;
            }
          } else if (e.type === 'shield') {
            this.addStatus(t, 'shield', e.pct ?? 0, e.turns ?? 1, Math.round(this.healBase(actor, t, e)));
            o.applied.push('shield');
          } else if (STATUS_EFFECTS.has(e.type)) {
            this.addStatus(t, e.type as StatusType, e.pct ?? 0, e.turns ?? 1);
            if (e.type === 'regen') {
              const st = t.statuses.find((x) => x.type === 'regen');
              if (st) st.shieldHp = Math.round(this.healBase(actor, t, e));
            }
            o.applied.push(e.type as StatusType);
          }
        }
      }
    }
    this.syncSpeed();
    if (skill.kind === 'buff') {
      for (const e of skill.effects) {
        if (e.type !== 'actionAdvance') continue;
        for (const o of outcomes) {
          const t = this.unit(o.uid);
          if (!t || !t.alive || t === actor || t === actor.summoner) continue;
          this.advance(t, e.pct ?? 0);
          o.advanced = true;
        }
      }
    }
    return { outcomes, energyGained, lifesteal: [...healed].map(([uid, amount]) => ({ uid, amount })) };
  }

  /** One hit, no evading or barrier check (for tests). */
  applyHit(attacker: Unit, target: Unit, action: ActionName, pct?: number): HitResult {
    if (!target.alive) return { damage: 0, crit: false, killed: false, elementMult: 1 };
    const p = pct ?? this.skillOf(attacker, action).effects.find((e) => e.type === 'damage')?.pct ?? 100;
    const r = this.rollDamage(attacker, target, p, action === 'attack');
    const o = emptyOutcome(target.uid);
    this.takeDamage(target, r.damage, o);
    return { ...r, killed: o.killed };
  }
}
