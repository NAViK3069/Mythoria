import { describe, expect, it } from 'vitest';
import { STARTER_HEROES, ULT } from '@mythoria/game-data';
import { Battle, ENERGY_START, RESERVE_COOLDOWN, elementMultiplier, heroTeam, monsterTeam, reserveTeam, type CombatStats, type UnitSetup } from '../src';

const plain = (spd = 100, extra: Partial<CombatStats> = {}): CombatStats => ({
  hp: 5000, atk: 300, def: 200, spd, crit: 0, critDmg: 150, evade: 0, hit: 0, skillEvade: 0, skillHit: 0,
  statusRes: 0, skillDmgRes: 0, normalDmgRes: 0, ...extra,
});
const noSkills = { skill1: { kind: 'attack' as const, cost: 99, area: 'single_front' as const, effects: [] }, skill2: { kind: 'attack' as const, cost: 99, area: 'single_front' as const, effects: [] } };
const unit = (id: string, row: 'front' | 'back', lane: number, stats = plain(), more: Partial<UnitSetup> = {}): UnitSetup =>
  ({ id, name: id, row, lane, stats, skills: noSkills, ...more });

/** Play a battle out on auto; the log of who did what. */
function autoPlay(b: Battle): string[] {
  const log: string[] = [];
  while (!b.over) {
    const a = b.nextActor();
    if (!a) break;
    const st = b.beginTurn(a);
    if (st.stunned || !a.alive) {
      b.endTurn(a);
      continue;
    }
    const p = b.planAuto(a);
    if (!p) break;
    const r = b.perform(a, p);
    log.push(`${a.uid}:${p.action}>${p.target.uid}=${r.outcomes.map((o) => o.damage + o.healed).join(',')}`);
    // the ult doesn't end the turn: the move comes after it
    if (p.action === 'ult' && !b.over) {
      const q = b.planAuto(a);
      if (q) b.perform(a, q);
    }
    b.endTurn(a);
  }
  return log;
}

describe('battle (ported from LineRanger_TurnBased)', () => {
  it('is the same battle every time from the same seed', () => {
    const teams = (): [UnitSetup[], UnitSetup[]] => [heroTeam(STARTER_HEROES.slice(0, 5)), monsterTeam(['slime_king', 'slime', 'slime'])];
    const a = autoPlay(new Battle(teams(), 42));
    const b = autoPlay(new Battle(teams(), 42));
    expect(a.length).toBeGreaterThan(5);
    expect(a).toEqual(b);
  });

  it('lets the faster unit act first (AV = 10000 / Speed)', () => {
    const b = new Battle([[unit('slow', 'front', 0, plain(80))], [unit('fast', 'front', 0, plain(120))]], 1);
    expect(b.nextActor()!.id).toBe('fast');
    expect(b.nextActor()!.id).toBe('slow');
  });

  it('uses the element wheel: winning ×1.5, losing ×0.5, light and dark beat each other', () => {
    expect(elementMultiplier('water', 'fire')).toBe(1.5);
    expect(elementMultiplier('fire', 'water')).toBe(0.5);
    expect(elementMultiplier('light', 'dark')).toBe(1.5);
    expect(elementMultiplier('dark', 'light')).toBe(1.5);
    expect(elementMultiplier('fire', 'fire')).toBe(1);
  });

  it('starts teams on 3 energy (+1 with a support), +1 for a normal attack', () => {
    const b = new Battle([[unit('a', 'front', 0, plain(), { role: 'support' })], [unit('b', 'front', 0)]], 1);
    expect(b.energy).toEqual([ENERGY_START + 1, ENERGY_START]);
    const me = b.unit('0-front-0')!;
    b.commitAction(me, 'attack');
    expect(b.energy[0]).toBe(ENERGY_START + 2);
  });

  it("keeps the back row out of reach while the front row stands (assassins aside)", () => {
    const b = new Battle([[unit('me', 'front', 0), unit('ninja', 'back', 0, plain(), { role: 'assassin' })], [unit('wall', 'front', 0), unit('archer', 'back', 0)]], 1);
    const me = b.unit('0-front-0')!, ninja = b.unit('0-back-0')!;
    expect(b.selectableTargets(me, 'attack').map((u) => u.id)).toEqual(['wall']);
    expect(b.selectableTargets(ninja, 'attack').map((u) => u.id).sort()).toEqual(['archer', 'wall']);
  });

  it('makes normal attacks go at a taunter', () => {
    const b = new Battle([[unit('me', 'front', 0)], [unit('x', 'front', 0), unit('y', 'front', 1)]], 1);
    const y = b.unit('1-front-1')!;
    y.statuses.push({ type: 'taunt', pct: 0, turns: 2, appliedTurn: 0 });
    expect(b.selectableTargets(b.unit('0-front-0')!, 'attack').map((u) => u.id)).toEqual(['y']);
  });

  it("brings a monster's skill round every n of its turns", () => {
    const b = new Battle([heroTeam(['bram']), monsterTeam(['slime'])], 7);
    const slime = b.units.find((u) => u.id === 'slime')!;
    const used: string[] = [];
    for (let i = 0; i < 12 && !b.over; i++) {
      const a = b.nextActor()!;
      b.beginTurn(a);
      const p = b.planAuto(a)!;
      if (a === slime) used.push(p.action);
      b.perform(a, p);
      b.endTurn(a);
    }
    // slime: เมือกเหนียว every 3 turns
    expect(used.slice(0, 6)).toEqual(['attack', 'attack', 'skill1', 'attack', 'attack', 'skill1']);
  });

  it('blocks damage with a barrier, and ticks damage over time at the start of a turn', () => {
    const b = new Battle([[unit('me', 'front', 0)], [unit('foe', 'front', 0)]], 3);
    const me = b.unit('0-front-0')!, foe = b.unit('1-front-0')!;
    foe.statuses.push({ type: 'barrier', pct: 0, turns: 2, appliedTurn: 0 });
    const r = b.resolveAction(me, 'attack', foe);
    expect(r.outcomes[0].immune).toBe(true);
    expect(foe.hp).toBe(foe.maxHp);
    foe.statuses = [{ type: 'burn', pct: 30, turns: 2, appliedTurn: 0, srcAtk: 300 }];
    const st = b.beginTurn(foe);
    expect(st.dot).toBeGreaterThan(0);
    expect(foe.hp).toBe(foe.maxHp - st.dot);
  });

  it('ends: the starter heroes beat the meadow monsters, a mini-boss included', () => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const b = new Battle([heroTeam(STARTER_HEROES.slice(0, 5)), monsterTeam(['shroom_king', 'shroom', 'shroom'])], seed);
      autoPlay(b);
      expect(b.over).toBe(true);
      if (b.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(8);
  });

  it('reserves: called in for their skill 1 or 2 (not the attack, not the ult), then both rest; never on the field', () => {
    const b = new Battle([heroTeam(STARTER_HEROES.slice(0, 5)), monsterTeam(['slime', 'slime', 'slime'])], 3, [reserveTeam(STARTER_HEROES.slice(5, 7)), []]);
    expect(b.reserves[0].length).toBe(2);
    expect(b.units.some((u) => u.reserve)).toBe(false);
    const caller = b.units.find((u) => u.team === 0)!;
    const r = b.reserves[0][0];
    b.energy[0] = 10;
    expect(b.canSummon(caller, r, 'skill2')).toBe(true);
    expect(b.canSummon(caller, r, 'attack')).toBe(false);
    expect(b.canSummon(caller, r, 'ult')).toBe(false);
    expect(b.canSummon(caller, r, 'skill1')).toBe(true);
    b.prepareSummon(caller, r);
    const target = b.selectableTargets(r, 'skill1')[0];
    b.perform(caller, { action: 'skill1', target, caster: r });
    expect(b.reserveCooldown(r)).toBe(RESERVE_COOLDOWN);
    expect(b.canSummon(caller, r, 'skill1')).toBe(false);
    expect(b.canSummon(caller, r, 'skill2')).toBe(false);
  });

  it('ultimate: charges by % (attack, skill, hits taken, kills), free, own turn only when full, then starts again', () => {
    const b = new Battle([heroTeam(['kael']), monsterTeam(['slime', 'slime'])], 5);
    const kael = b.units.find((u) => u.id === 'kael')!;
    const slime = b.units.find((u) => u.team === 1)!;
    expect(kael.ult).toBe(ULT.start);
    expect(b.canUse(kael, 'ult')).toBe(false);
    // a normal attack charges it
    b.perform(kael, { action: 'attack', target: slime });
    expect(kael.ult).toBeGreaterThanOrEqual(ULT.attack);
    // monsters have none and never charge
    expect(slime.ult).toBe(0);
    expect(b.ultShare(slime)).toBe(0);
    kael.ult = ULT.max;
    expect(b.canUse(kael, 'ult')).toBe(true);
    const energy = b.energy[0];
    b.perform(kael, { action: 'ult', target: b.units.find((u) => u.team === 1 && u.alive)! });
    expect(b.energy[0]).toBe(energy); // costs no team energy
    expect(kael.ult).toBeGreaterThanOrEqual(ULT.afterUlt);
    expect(kael.ult).toBeLessThan(ULT.max);
  });
});
