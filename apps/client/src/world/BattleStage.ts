import * as Phaser from 'phaser';
import { ELEMENTS } from '@mythoria/game-data';
import { Battle, type ActionName, type ActionResult, type Plan, type Unit, type UnitSetup } from '@mythoria/combat';
import { BattleHud, type UnitView } from '../ui/battleHud';
import { BattleLayer } from '../fx/BattleLayer';
import { Dissolve } from '../fx/effects/dissolve';
import { HeroAura, type AuraKind } from '../fx/effects/auras';
import { Alert, ComboBanner, DamagePop, HpBar, hexRGB, Impact, Pillar, reticle, Slash, SummonCircle, SUMMON_SPEED, turnArrow, Bolt, type PopKind } from '../fx/effects/battlePops';
import { LOOKS } from '../fx/pixelFont';
import { paintIcon, statusIcon } from '../fx/pixelIcons';
import { GOOD_STATUS, narrowScreen } from '../ui/battleHud';
import { MasterCharacter, type Held } from './MasterCharacter';
import type { Skin } from '../art/hands';
import { MOVES, type MoveKit } from './moves';
import GEAR from './heroGear.json';
import MONSTER_META from './monsters.json';

/** How far from the middle the back rows stand (the front rows at 42): on a wide screen, and on an upright phone. */
const BACK = { side: 94, middle: 112 };
const BACK_COMPACT = { side: 76, middle: 90 };

// A battle on the stage's battle map (scenes/BattleScene.ts): the heroes line up on the left, the monsters on the
// right, and @mythoria/combat (ported from LineRanger_TurnBased) plays it turn by turn. The player picks each hero's move and target (or switches on auto); the monsters' AI plays
// theirs. Moves are shown here: melee fighters dash in and strike, shooters and casters send a bolt, buffs glow.
// Everything that happens on the field is drawn in pixels on the field (fx/BattleLayer.ts + fx/effects/
// battlePops.ts): the HP bars over the fighters, numbers bursting off hits, crits, combos, slashes, bolts, "!"
// before a monster's skill, a column of light for a buff and for the win.

const gear = GEAR as unknown as Record<string, { front: Held; back?: Held; skin?: Skin }>;
const mmeta = MONSTER_META as Record<string, { w: number; h: number; anims: Record<string, { n: number; fps: number }> }>;
/** A buff's word over its column of light. */
const BUFF_WORD: Record<string, string> = {
  atkUp: 'ATK UP', speedUp: 'SPD UP', critUp: 'CRIT UP', critDmgUp: 'CRIT UP', regen: 'REGEN', shield: 'SHIELD', barrier: 'BARRIER',
  evadeUp: 'EVA UP', skillEvadeUp: 'EVA UP', toughUp: 'TOUGH', taunt: 'TAUNT', hitUp: 'HIT UP', skillHitUp: 'HIT UP', skillResUp: 'RES UP', skillDmgResUp: 'RES UP',
};
const elColour = (u: Unit) => hexRGB(ELEMENTS.find((e) => e.id === u.element)?.color ?? '#ffffff');

/** What each hero carries with it all battle (fx/effects/auras.ts): a lantern's flame, weapons alive with their element,
 * and an aura of their own for the great ones (Dravik, a Legend; Valdris, a Mythic) - quiet, not showy. */
const HERO_AURAS: Record<string, AuraKind[]> = {
  sira: ['lantern'],
  kael: ['fireAxe'],
  dravik: ['frostLance', 'frostBody'],
  valdris: ['bloodBlade', 'bloodBody'],
  nyx: ['shadowDaggers'],
};

/** Who hits from where they stand (the rest dash in). */
const RANGED = new Set(['marksman', 'mage', 'support']);
const FLYING = new Set(['bee', 'bee_queen']);

/** One fighter on the field: a hero (built like the master) or a monster (its frames). */
interface Actor {
  unit: Unit;
  home: { x: number; y: number };
  x: number;
  y: number;
  /** Its height (px) for the bar over it, half its width for tapping it. */
  h: number;
  half: number;
  hero?: MasterCharacter;
  img?: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Ellipse;
  anim: number;
  alt: number;
  /** A hero of the special team, called in for one skill (no HP bar, gone after). */
  called?: boolean;
  /** It has fallen (its dissolve has played). */
  fallen?: boolean;
}

/** A monster's frame as pixels round its feet (as MasterCharacter.snapshot gives a hero's): for the effects that take
 * a body apart (its fall). */
function imageSnap(img: Phaser.GameObjects.Image): { pixels: Uint32Array; w: number; h: number; x: number; y: number } {
  const f = img.frame, W = f.cutWidth, H = f.cutHeight;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  if (img.flipX) {
    g.translate(W, 0);
    g.scale(-1, 1);
  }
  g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, W, H, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const pixels = new Uint32Array(W * H);
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] >= 128) pixels[i] = ((255 << 24) | (d[i * 4 + 2] << 16) | (d[i * 4 + 1] << 8) | d[i * 4]) >>> 0;
  // (origin bottom middle, as the monsters are drawn)
  return { pixels, w: W, h: H, x: -Math.round(W * img.originX), y: -H };
}

export interface StageHooks {
  /** World px → CSS px on screen. */
  project(x: number, y: number): { x: number; y: number };
  /** Where something at (x, y) goes in the draw order. */
  sort(x: number, y: number, w: number, h: number): number;
  /** It's over: back to walking about. */
  done(result: 'win' | 'lose' | 'draw' | 'flee'): void;
}

export class BattleStage {
  readonly battle: Battle;
  readonly hud: BattleHud;
  private readonly actors = new Map<string, Actor>();
  private readonly views = new Map<string, UnitView>();
  private ended = false;
  /** The result is up: the field's bars and markers go. */
  private over = false;
  private time = 0;
  private portraits = new Map<string, string>();
  private readonly ring: Phaser.GameObjects.Ellipse;
  private readonly ringGlow: Phaser.GameObjects.Ellipse;
  private current: Actor | null = null;
  /** Damage each unit has dealt (the MVP). */
  private readonly dealt = new Map<string, number>();
  /** The pixel layer over the field, everyone's HP bar on it. */
  private readonly layer: BattleLayer;
  private readonly ground: BattleLayer;
  /** The HP bars, statuses, marks and turn arrow - over everything on the field. */
  private readonly top: BattleLayer;
  /** Each called-in hero's sigil (beam, light, the flash as it lands) on a layer of its own, just over where that
   * hero stands - so it glows over the hero it brings, but whatever stands in front still covers it. */
  private readonly summonLayers: { layer: BattleLayer; circle: SummonCircle }[] = [];
  private summonCount = 0;
  private readonly bars = new Map<string, HpBar>();
  /** Hits in a row by our team (a monster's turn ends it), and its banner. */
  private combo = 0;
  private comboBanner: ComboBanner | null = null;
  /** The soft gold light behind a fighter's HP bar while its immortal barrier is on (smooth, not pixels). */
  private readonly barrierGlows = new Map<string, Phaser.GameObjects.Image>();
  /** The dark veil a move can draw over the field (MoveKit.dim). */
  private dimmer: Phaser.GameObjects.Rectangle | null = null;
  /** When the last number popped off each fighter (so a few at once stack up). */
  private readonly lastPop = new Map<string, { t: number; n: number }>();

  constructor(private readonly scene: Phaser.Scene, readonly center: { x: number; y: number }, heroes: UnitSetup[], foes: UnitSetup[], seed: number, private readonly hooks: StageHooks, reserves: UnitSetup[] = []) {
    // the special team (off the field: called in to cast its skill 1)
    this.battle = new Battle([heroes, foes], seed, [reserves, []]);
    this.battle.aiLevel = ['smart', 'smart'];
    for (const u of this.battle.units) {
      this.actors.set(u.uid, this.makeActor(u));
      this.bars.set(u.uid, new HpBar(u.team === 1, elColour(u), !!u.miniBoss));
    }
    this.layer = new BattleLayer(scene);
    // effects on the ground (a summoning circle): just over the ground, under the fighters
    this.ground = new BattleLayer(scene, 1.45, 'fxground');
    // what each hero carries with it all battle (a lantern's flame, a smouldering axe, a Legend's frost...)
    for (const a of this.actors.values()) this.auraOf(a);
    // the HP bars, status icons, target marks and turn arrow: on a layer of their own
    // OVER everything on the field - effects, flying arrows, all of it (the owner's rule: a bar is always on top)
    this.top = new BattleLayer(scene, 9700, 'fxtop');
    this.top.over = (s) => {
      if (this.over) return;
      for (const a of this.actors.values()) {
        const bar = this.bars.get(a.unit.uid);
        if (!bar || !bar.visible) continue;
        bar.preview = this.hud.previews.get(a.unit.uid) ?? null;
        bar.barrier = a.unit.alive && a.unit.statuses.some((x) => x.type === 'barrier');
        bar.draw(s, a.x, this.barY(a));
        // its statuses: small icons along the top of its bar
        if (a.unit.alive) a.unit.statuses.filter((x) => x.type !== 'shield').slice(0, 4).forEach((x, i) => {
          paintIcon(s, Math.round(a.x - 9 + i * 7), this.barY(a) - 9, statusIcon(x.type, GOOD_STATUS.has(x.type)));
        });
        if (this.hud.targets.has(a.unit.uid)) reticle(s, a.x, a.y - a.alt, a.half * 2, a.h, this.time, this.hud.hover === a.unit.uid);
      }
      const c = this.current;
      if (c && c.unit.alive && !this.ended) turnArrow(s, c.x, this.barY(c) - 7, this.time);
    };
    this.hud = new BattleHud(this.battle, { portrait: (u) => this.portrait(u), figure: (u) => this.art(u), moveIcon: (u, a) => moveIcon(u, a), flee: () => this.finish('flee') });
    // a gold ring under whoever's turn it is
    this.ring = scene.add.ellipse(0, 0, 30, 10).setStrokeStyle(1.5, 0xffd75a, 1).setFillStyle(0xffd75a, 0.16).setDepth(1.46).setVisible(false);
    this.ringGlow = scene.add.ellipse(0, 0, 34, 12).setStrokeStyle(1, 0xfff2b0, 0.6).setDepth(1.46).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.hud.energy();
    this.hud.order(null);
    void this.run();
  }

  // ---------------------------------------------------------------- the fighters

  /** Where a unit stands: heroes left, monsters right; the front rows face each other in the middle. */
  private spot(u: Unit): { x: number; y: number } {
    const o = BattleStage.offset(u.team, u.row, u.lane, this.compact);
    return { x: this.center.x + o.x, y: this.center.y + o.y };
  }

  /** A phone held upright: the back rows stand closer behind the front ones, so both line-ups fit the
   * narrow screen with room at its edges. (Fixed for the whole battle, chosen when it starts.) */
  private readonly compact = narrowScreen();

  /** Where a place in the line-up is from the middle of the field (heroes left, monsters right). */
  static offset(team: 0 | 1, row: 'front' | 'back', lane: number, compact = false): { x: number; y: number } {
    const side = team === 0 ? -1 : 1;
    const front = row === 'front';
    const lanes = front ? 2 : 3;
    // room for each one's HP bar and status icons over its head without running into the one behind
    const gapY = 42;
    // the back row's middle one stands further back, so nobody stands right behind someone
    // (compact: the whole back row a little closer in - BACK_COMPACT)
    const back = compact ? BACK_COMPACT : BACK;
    const x = side * (front ? 42 : lane === 1 ? back.middle : back.side);
    return { x, y: (lane - (lanes - 1) / 2) * gapY };
  }

  private makeActor(u: Unit): Actor {
    const home = this.spot(u);
    const a: Actor = { unit: u, home, x: home.x - (u.team === 0 ? 60 : -60), y: home.y, h: 34, half: 9, anim: Math.random() * 5, alt: 0 };
    if (u.team === 0 && u.look) {
      const part = (p: string) => `heroes#${u.look}_${p}`;
      const hero = new MasterCharacter(this.scene, a.x, a.y, { head: part('head'), body: part('body'), legL: part('leg_l'), legR: part('leg_r') });
      const g = gear[u.look];
      if (g) hero.setGear(this.scene, 'heroes', g.front, g.back ?? null);
      // the hands in the hero's own skin (read off its face by tools/hero_parts.py)
      if (g?.skin) hero.setSkin(this.scene, u.look, g.skin);
      // heroes stand on the left: they face right, at the foe, even walking back to their places
      hero.faceLock = 1;
      hero.walkSpeed = 70;
      a.hero = hero;
    } else {
      const look = u.look ?? 'slime';
      const m = mmeta[look];
      a.h = m ? m.h : 30;
      a.half = m ? Math.max(8, m.w * 0.35) : 10;
      a.shadow = this.scene.add.ellipse(a.x, a.y, Math.max(12, (m?.w ?? 20) * 0.7), u.miniBoss ? 7 : 5, 0x0c1e16, 0.32).setDepth(1.4);
      a.img = this.scene.add.image(a.x, a.y, 'monsters', `${look}_idle0`).setOrigin(0.5, 1).setFlipX(true);
      if (FLYING.has(look)) a.alt = 9;
    }
    return a;
  }

  /** A hero's auras (fx/effects/auras.ts, by look - HERO_AURAS): the front part over the fighters, the ground part (what
   * lies on the ground and passes behind it) under them; they last while it's on the field and standing. */
  private auraOf(a: Actor): void {
    const kinds = a.hero && a.unit.look ? HERO_AURAS[a.unit.look] : undefined;
    if (!kinds) return;
    const hero = a.hero!, alive = () => this.actors.get(a.unit.uid) === a && !a.fallen && hero.root.visible && !this.ended;
    for (const kind of kinds) {
      this.layer.add(new HeroAura(hero, kind, alive));
      if (kind === 'bloodBody') this.ground.add(new HeroAura(hero, kind, alive, true));
    }
  }

  /** Where a fighter's HP bar sits (just over its head). */
  private barY(a: Actor): number {
    return Math.round(a.y - a.h - a.alt - 4);
  }

  /** Each frame: idle loops, positions, bars over everyone. */
  update(dt: number): void {
    this.time += dt;
    for (const a of this.actors.values()) {
      if (a.hero) {
        const ox = a.hero.x, oy = a.hero.y;
        a.hero.x = a.x;
        a.hero.y = a.y;
        // (a leap: a move lifts it off the ground by its alt)
        a.hero.lift = a.alt;
        a.hero.vx = (a.x - ox) / Math.max(dt, 1e-3);
        a.hero.vy = (a.y - oy) / Math.max(dt, 1e-3);
        a.hero.update(dt);
        a.hero.root.setDepth(this.hooks.sort(a.x, a.y, 16, 30));
      } else if (a.img) {
        a.anim += dt;
        const look = a.unit.look ?? 'slime';
        const an = mmeta[look]?.anims.idle;
        if (an) a.img.setFrame(`${look}_idle${Math.floor(a.anim * an.fps) % an.n}`);
        const bob = FLYING.has(look) ? Math.sin(a.anim * 3.1) * 1.5 : 0;
        a.img.setPosition(a.x, a.y - a.alt - bob).setDepth(this.hooks.sort(a.x, a.y, a.half * 1.4, a.h + a.alt));
        a.shadow?.setPosition(a.x, a.y + 0.5);
      }
      const feet = this.hooks.project(a.x, a.y);
      const top = this.hooks.project(a.x, a.y - a.h - a.alt).y;
      const k = this.hooks.project(1, 0).x - this.hooks.project(0, 0).x;
      this.views.set(a.unit.uid, { feet, top, half: a.half * k, k });
      this.bars.get(a.unit.uid)?.update(dt);
      this.barrierGlow(a);
    }
    // the ring follows whoever's turn it is (round its feet, wherever it dashes)
    const c = this.current;
    const on = !!c && c.unit.alive && !this.ended;
    this.ring.setVisible(on);
    this.ringGlow.setVisible(on);
    if (c && on) {
      const k = 0.5 + 0.5 * Math.sin(this.time * 4);
      const w = Math.max(26, c.half * 2.6);
      this.ring.setPosition(c.x, c.y + 0.5).setSize(w, w * 0.34);
      this.ringGlow.setPosition(c.x, c.y + 0.5).setSize(w + 4 + k * 3, (w + 4 + k * 3) * 0.34).setAlpha(0.3 + 0.5 * k);
    }
    this.hud.place(this.views);
    this.layer.fit();
    this.layer.update(dt);
    this.top.fit();
    this.top.update(dt);
    this.ground.fit();
    this.ground.update(dt);
    for (let i = this.summonLayers.length - 1; i >= 0; i--) {
      const { layer, circle } = this.summonLayers[i];
      layer.fit();
      layer.update(dt);
      // the sigil has folded away: its layer goes with it
      if (circle.done && !layer.pops.length) {
        layer.destroy();
        this.summonLayers.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- the show's pieces

  /** A number or a shout bursting off a fighter (a few at once stack upwards). */
  private pop(uid: string, text: string, kind: PopKind, delay = 0, mark: 'up' | 'down' | null = null): void {
    const a = this.actors.get(uid);
    if (!a) return;
    const last = this.lastPop.get(uid);
    const n = last && this.time - last.t < 0.35 ? last.n + 1 : 0;
    this.lastPop.set(uid, { t: this.time, n });
    // a crit bursts over the body (its starburst on the one it hit), the rest just over the bar
    const y = kind === 'crit' ? Math.round(a.y - a.alt - a.h * 0.55) - n * 14 : this.barY(a) - 15 - n * 9;
    this.layer.add(new DamagePop(a.x + (n % 2 ? 4 : -2), y, text, kind, delay / 1000, mark));
  }

  /** A fighter's HP and shield as the battle has them now: its bar and the HUD. */
  private syncUnit(u: Unit): void {
    this.hud.sync(u);
    const a = this.actors.get(u.uid), bar = this.bars.get(u.uid);
    if (!a || !bar) return;
    const s = this.hud.shown.get(u.uid)!;
    const max = Math.max(u.maxHp, s.hp + s.shield);
    bar.set(s.hp / max, s.shield / max, a.x, this.barY(a));
  }

  /** Our team's hits in a row: "×n COMBO" from the second one. */
  private countCombo(hits: number): void {
    if (hits <= 0) return;
    this.combo += hits;
    if (this.combo < 2) return;
    if (this.comboBanner && !this.comboBanner.done && !this.comboBanner.leaving) return this.comboBanner.bump(this.combo);
    // on the left, just right of the turn order, under the top bars; on a phone held upright (the order a row
    // across the top) in the middle, just under the order
    const o = this.hooks.project(0, 0), k = this.hooks.project(1, 0).x - o.x;
    const narrow = narrowScreen();
    const y = narrow ? (this.hud.railBottom() - o.y) / k + 14 : (this.hud.topBottom() - o.y) / k + 14;
    const x = narrow ? (window.innerWidth / 2 - o.x) / k : (this.hud.leftEdge() - o.x) / k + 40;
    this.comboBanner = this.layer.add(new ComboBanner(Math.round(x), Math.round(y), this.combo));
  }

  /** A unit's big picture for its cut-in: a hero standing with its weapon, a monster's first frame. */
  private art(u: Unit): HTMLElement {
    if (u.team === 0 && u.look) return Object.assign(document.createElement('img'), { src: `assets/characters/heroes/${u.look}_full.png`, alt: '', draggable: false });
    return this.portrait(u);
  }

  /** A unit's picture for the turn order: a hero's face, a monster's first frame. */
  private portrait(u: Unit): HTMLElement {
    if (u.team === 0 && u.look) return Object.assign(document.createElement('img'), { src: `assets/characters/heroes/${u.look}_face.png`, alt: u.name, draggable: false });
    const look = u.look ?? 'slime';
    let src = this.portraits.get(look);
    if (!src) {
      const f = this.scene.textures.getFrame('monsters', `${look}_idle0`);
      const c = document.createElement('canvas');
      const side = Math.max(f.cutWidth, f.cutHeight);
      c.width = c.height = side;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.translate(side, 0);
      g.scale(-1, 1);
      g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, (side - f.cutWidth) / 2, side - f.cutHeight, f.cutWidth, f.cutHeight);
      src = c.toDataURL();
      this.portraits.set(look, src);
    }
    return Object.assign(document.createElement('img'), { src, alt: u.name, draggable: false });
  }

  // ---------------------------------------------------------------- the battle

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.scene.time.delayedCall(this.hud.fast ? ms / 2 : ms, () => r()));
  }
  private moveTo(a: Actor, x: number, y: number, ms: number, ease = 'Quad.easeInOut'): Promise<void> {
    return new Promise((r) => this.scene.tweens.add({ targets: a, x, y, duration: this.hud.fast ? ms / 2 : ms, ease, onComplete: () => r() }));
  }

  private async run(): Promise<void> {
    // the slash wipe is still opening over the field: then everyone walks in, and the battle is announced
    await this.wait(650);
    await Promise.all([...this.actors.values()].map((a) => this.moveTo(a, a.home.x, a.home.y, 600, 'Sine.easeOut')));
    this.hud.intro();
    await this.wait(1500);
    const b = this.battle;
    while (!b.over && !this.ended) {
      const actor = b.nextActor();
      if (!actor) break;
      this.current = this.actors.get(actor.uid) ?? null;
      this.hud.order(actor);
      this.hud.energy();
      const st = b.beginTurn(actor);
      // a monster's turn breaks our combo
      if (actor.team === 1) this.combo = 0;
      st.dots.forEach((d, i) => this.pop(actor.uid, `-${d.damage}`, 'dmg', i * 120));
      if (st.regen) this.pop(actor.uid, `+${st.regen}`, 'heal');
      if (st.dot || st.regen) {
        this.syncUnit(actor);
        this.flash(actor.uid, st.dot > 0);
        await this.wait(450);
      }
      if (st.killed || !actor.alive) {
        await this.fall(actor);
        b.endTurn(actor);
        continue;
      }
      if (st.stunned) {
        this.pop(actor.uid, 'STUN', 'miss');
        this.hud.float(actor.uid, 'มึนงง', 'bad', this.views);
        await this.wait(550);
        b.endTurn(actor);
        continue;
      }
      // the turn: its move - after an ultimate (free, it doesn't end the turn) it chooses again
      for (;;) {
        let plan: Plan | null;
        if (actor.team === 0 && !this.hud.auto) {
          await this.wait(120);
          const p = await this.hud.choose(actor);
          plan = { action: p.action, target: p.target, caster: p.caster };
        } else {
          await this.wait(actor.team === 0 ? 250 : 380);
          plan = b.planAuto(actor);
        }
        if (this.ended) return;
        if (!plan) break;
        const skill = b.skillOf(plan.caster ?? actor, plan.action);
        // the special team: the one called in comes down onto a circle beside its caller first
        const circle = plan.caster ? await this.callIn(actor, plan.caster) : null;
        // the ultimate: a column of gold light on the hero, then its cut-in (only the ultimate has one); a monster's
        // skill warns with a "!" over its head
        if (plan.action === 'ult') {
          const a = this.actors.get(actor.uid)!;
          this.layer.add(new Pillar(a.x, a.y, 'ULTIMATE', LOOKS.gold, 0xffd75a, false, 52));
          await this.wait(this.hud.fast ? 380 : 620);
          await this.hud.cutin(actor, skill.name ?? '', this.art(actor), 'ULTIMATE');
        } else if (plan.action !== 'attack' && actor.team === 1 && !plan.caster) {
          // (a cut-in only for an ultimate - the owner's call; a monster's skill still warns with a "!")
          const a = this.actors.get(actor.uid)!;
          this.layer.add(new Alert(() => ({ x: a.x, y: this.barY(a) - 12 }), 0.75));
          await this.wait(650);
        }
        if (this.ended) return;
        const result = b.perform(actor, plan);
        this.hud.energy();
        await this.show(plan.caster ?? actor, plan, result);
        if (plan.caster && circle) await this.sendBack(plan.caster, circle);
        if (plan.action !== 'ult' || b.over || !actor.alive || this.ended) break;
        this.hud.order(actor);
      }
      b.endTurn(actor);
    }
    if (this.ended) return;
    this.current = null;
    await this.wait(500);
    const kind = b.winner === 0 ? 'win' : b.winner === 1 ? 'lose' : 'draw';
    // the win: a column of light in the middle of the field, VICTORY! dropping in over it
    if (kind === 'win') {
      this.layer.add(new Pillar(this.center.x, this.center.y + 14, 'VICTORY!', LOOKS.gold, 0xffd75a, true, 70));
      await this.wait(1900);
    }
    let mvp: { unit: Unit; damage: number } | undefined;
    for (const u of b.units) if (u.team === 0 && (this.dealt.get(u.uid) ?? 0) > (mvp?.damage ?? 0)) mvp = { unit: u, damage: this.dealt.get(u.uid)! };
    this.over = true;
    this.hud.result(kind, b.turn, () => this.finish(kind), mvp);
  }

  /** Show what a move did: the run-up or the bolt, then the numbers on everyone it reached. */
  private async show(actor: Unit, plan: Plan, r: ActionResult): Promise<void> {
    const b = this.battle;
    const a = this.actors.get(actor.uid)!;
    const skill = b.skillOf(actor, plan.action);
    const targets = r.outcomes.map((o) => this.actors.get(o.uid)).filter((x): x is Actor => !!x);
    // a hero with moves of its own (world/moves): its show plays it out
    const own = a.hero && actor.look ? MOVES[actor.look]?.[plan.action] : undefined;
    if (own) {
      await own(this.kit(a, targets, this.actors.get(plan.target.uid) ?? targets[0] ?? a, r));
      return;
    }
    if (skill.kind === 'buff') {
      a.hero?.setHands('palm', 'palm');
      await this.wait(260);
      for (const t of targets) this.glow(t, 0x9bffb0);
      // a column of light on each, the buff's name over it
      r.outcomes.forEach((o, i) => {
        const t = this.actors.get(o.uid);
        const word = o.applied.map((x) => BUFF_WORD[x]).find(Boolean) ?? (o.healed > 0 ? 'HEAL' : 'BUFF');
        if (t) this.scene.time.delayedCall(i * 90, () => this.layer.add(new Pillar(t.x, t.y, word, LOOKS.heal, 0x7affa0, false, 34)));
      });
      this.land(r, actor);
      await this.wait(520);
      if (a.hero) this.regrip(a);
      return;
    }
    const ranged = actor.team === 0 ? RANGED.has(actor.role) : false;
    if (ranged) {
      // a bolt to each target, in the hero's element's colour
      const colour = elColour(actor);
      a.hero && (a.hero.swing = -0.6);
      await Promise.all(targets.map((t) => this.bolt(a, t, colour)));
      if (a.hero) a.hero.swing = 0;
      this.land(r, actor);
      await this.wait(420);
      return;
    }
    // melee: dash to the target (a wide move: to the front of the group), strike, back
    const main = this.actors.get(plan.target.uid) ?? targets[0];
    const wide = skill.area === 'row' || skill.area === 'row_any' || skill.area === 'all';
    const tx = wide ? targets.reduce((n, t) => n + t.x, 0) / Math.max(1, targets.length) : main.x;
    const ty = wide ? targets.reduce((n, t) => n + t.y, 0) / Math.max(1, targets.length) : main.y;
    const side = actor.team === 0 ? -1 : 1;
    await this.moveTo(a, tx + side * (wide ? 26 : 16), ty + 1, 260, 'Quad.easeIn');
    if (a.hero) {
      a.hero.swing = -1.4;
      this.scene.tweens.add({ targets: a.hero, swing: 0.7, duration: this.hud.fast ? 70 : 140, ease: 'Back.easeOut' });
    } else if (a.img) {
      this.scene.tweens.add({ targets: a, x: a.x - side * 5, duration: this.hud.fast ? 60 : 110, yoyo: true, ease: 'Quad.easeOut' });
    }
    await this.wait(110);
    const big = plan.action !== 'attack';
    for (const t of wide ? targets : [main]) this.layer.add(new Slash(t.x, t.y - t.h * 0.5 - t.alt, actor.team === 0 ? 1 : -1, elColour(actor), big));
    this.land(r, actor);
    await this.wait(260);
    if (a.hero) a.hero.swing = 0;
    await this.moveTo(a, a.home.x, a.home.y, 300);
  }

  /** What a hero's own move (world/moves) works with: who, at whom, the layers, the timing. */
  private kit(a: Actor, targets: Actor[], main: Actor, r: ActionResult): MoveKit {
    const sp = this.hud.fast ? 2 : 1;
    let landed = false;
    return {
      scene: this.scene,
      layer: this.layer,
      ground: this.ground,
      actor: a,
      targets,
      main,
      dir: a.unit.team === 0 ? 1 : -1,
      sp,
      wait: (ms) => this.wait(ms),
      moveTo: (who, x, y, ms, ease) => this.moveTo(who as Actor, x, y, ms, ease),
      tween: (target, props, ms, ease = 'Quad.easeInOut') =>
        new Promise<void>((done) => this.scene.tweens.add({ targets: target, ...props, duration: ms / sp, ease, onComplete: () => done() })),
      land: () => {
        if (landed) return;
        landed = true;
        this.land(r, a.unit);
      },
      hitStop: (ms) => {
        this.scene.tweens.pauseAll();
        this.scene.time.paused = true;
        window.setTimeout(() => {
          this.scene.tweens.resumeAll();
          this.scene.time.paused = false;
        }, ms);
      },
      shake: (ms, k) => this.scene.cameras.main.shake(ms, k),
      flash: (ms, c) => this.scene.cameras.main.flash(ms, (c >> 16) & 255, (c >> 8) & 255, c & 255),
      regrip: () => this.regrip(a),
      dim: (alpha, ms, colour) => {
        // a dark veil over the field (under the effects' layer): made once, kept over the view
        if (!this.dimmer) this.dimmer = this.scene.add.rectangle(0, 0, 4000, 4000, 0x0a0614, 1).setDepth(9400).setAlpha(0);
        if (colour !== undefined) this.dimmer.setFillStyle(colour, 1);
        const cam = this.scene.cameras.main;
        this.dimmer.setPosition(cam.midPoint.x, cam.midPoint.y);
        return new Promise<void>((done) => this.scene.tweens.add({ targets: this.dimmer, alpha, duration: ms / sp, onComplete: () => done() }));
      },
    };
  }

  /** The hits land: numbers, flashes, bars, falls. */
  private land(r: ActionResult, by?: Unit): void {
    let crit = false, heavy = false, hits = 0;
    r.outcomes.forEach((o, i) => {
      const u = this.battle.unit(o.uid);
      if (!u) return;
      const delay = i * 60;
      if (o.evaded) this.pop(o.uid, 'MISS', 'miss', delay);
      else if (o.immune) this.pop(o.uid, 'IMMUNE', 'miss', delay);
      else {
        if (o.damage > 0) {
          if (by && by.team !== u.team) this.dealt.set(by.uid, (this.dealt.get(by.uid) ?? 0) + o.damage);
          crit ||= o.crit;
          heavy ||= o.damage >= u.maxHp * 0.25;
          if (by && by.team === 0 && u.team === 1) hits++;
          this.pop(o.uid, o.crit ? `${o.damage}!` : `-${o.damage}`, o.crit ? 'crit' : 'dmg', delay, o.elementMult > 1 ? 'up' : o.elementMult < 1 ? 'down' : null);
          const t = this.actors.get(o.uid);
          if (t) this.layer.add(new Impact(t.x + (Math.random() - 0.5) * 6, t.y - t.h * 0.5 - t.alt, by ? elColour(by) : 0xffffff, o.crit));
          this.flash(o.uid, true);
          this.knock(o.uid);
        }
        if (o.healed > 0) this.pop(o.uid, `+${o.healed}`, 'heal', delay);
        for (const s of o.applied) if (s !== 'shield') this.hud.float(o.uid, labelOf(s), GOOD_STATUS.has(s) ? 'good' : 'bad', this.views, delay + 220);
        if (o.applied.includes('shield')) this.pop(o.uid, 'SHIELD', 'shield', delay + 160);
        for (const s of o.resisted) this.hud.float(o.uid, `ต้าน ${labelOf(s)}`, 'info', this.views, delay + 220);
        if (o.cleansed) this.hud.float(o.uid, 'ล้างผลด้านลบ', 'good', this.views, delay + 220);
        if (o.advanced) this.hud.float(o.uid, 'เร่งเทิร์น', 'good', this.views, delay + 260);
      }
      this.syncUnit(u);
      if (o.killed) this.scene.time.delayedCall(250, () => void this.fall(u));
    });
    this.countCombo(hits);
    // a crit (or a heavy blow) lands hard: the screen jolts and everything holds still for a beat
    if (crit || heavy) {
      // a short, small jolt (a strong one is tiring to watch)
      this.scene.cameras.main.shake(crit ? 120 : 80, crit ? 0.0025 : 0.0014);
      this.scene.tweens.pauseAll();
      this.scene.time.paused = true;
      window.setTimeout(() => {
        this.scene.tweens.resumeAll();
        this.scene.time.paused = false;
      }, crit ? 75 : 45);
    }
    for (const l of r.lifesteal) {
      this.pop(l.uid, `+${l.amount}`, 'heal', 200);
      const u = this.battle.unit(l.uid);
      if (u) this.syncUnit(u);
    }
  }

  /**
   * Call in a hero of the special team: a summoning circle opens on the ground just behind its caller, a column of
   * light comes down onto it, and the hero appears in it - white at first, then itself.
   */
  private async callIn(caller: Unit, r: Unit): Promise<SummonCircle> {
    const ca = this.actors.get(caller.uid)!;
    // `side` points away from the enemy: behind the caller is +side, in front of it is -side
    const side = caller.team === 0 ? -1 : 1;
    // Where it comes in depends on the caller's row: a front-row caller brings it in BEHIND itself, a back-row
    // caller IN FRONT of itself (towards the enemy, between the rows). Of those spots the clearest; only if
    // they are all crowded, any spot round the caller.
    const ahead = caller.row === 'back' ? -side : side;
    const preferred = [[ahead * 26, 0], [ahead * 22, 16], [ahead * 22, -16]];
    const fallback = [[-ahead * 24, 0], [-ahead * 22, 16], [-ahead * 22, -16], [0, 22], [0, -22]];
    const others = [...this.actors.values()].filter((o) => o.unit.alive || o.called);
    const clearest = (offs: number[][]) => offs
      .map(([dx, dy]) => ({ x: Math.round(ca.x + dx), y: Math.round(ca.y + dy) }))
      .map((p) => ({ p, d: Math.min(...others.filter((o) => o.unit !== caller).map((o) => Math.hypot(o.x - p.x, (o.y - p.y) * 1.6))) }))
      .sort((a, b) => b.d - a.d)[0];
    const first = clearest(preferred);
    const spot = (first.d >= 16 ? first : clearest([...preferred, ...fallback])).p;
    const colour = 0xb48aff;
    // the sigil: its circle on the ground (under the fighters); its beam and light just over the hero it brings
    // (a layer of its own at that hero's depth, not over everything)
    const above = new BattleLayer(this.scene, this.hooks.sort(spot.x, spot.y, 16, 30) + 0.01, `fxsummon${this.summonCount++}`);
    const circle = above.add(new SummonCircle(spot.x, spot.y, colour));
    this.summonLayers.push({ layer: above, circle });
    this.ground.add(circle.ground);
    this.hud.float(caller.uid, `เรียก ${r.name}`, 'info', this.views);
    // paced with the sigil, which plays SUMMON_SPEED times as fast as everything else
    const S = SUMMON_SPEED;
    await this.wait(620 / S);
    circle.beam();
    await this.wait(140 / S);
    const a = this.makeActor(r);
    a.home = { ...spot };
    a.x = spot.x;
    a.y = spot.y;
    a.called = true;
    this.actors.set(r.uid, a);
    this.auraOf(a);
    const parts = a.hero ? a.hero.parts() : [];
    a.hero?.root.setAlpha(0);
    for (const p of parts) p.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    if (a.hero) this.scene.tweens.add({ targets: a.hero.root, alpha: 1, duration: (this.hud.fast ? 140 : 260) / S });
    await this.wait(320 / S);
    for (const p of parts) p.active && p.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    above.add(new Impact(spot.x, spot.y - 16, colour, false));
    await this.wait(160 / S);
    return circle;
  }

  /** Back it goes: a burst of light off the circle as it folds up, the hero fading out of it. */
  private async sendBack(r: Unit, circle: SummonCircle): Promise<void> {
    const a = this.actors.get(r.uid);
    // back on its circle first (a melee one has dashed out and back already)
    const S = SUMMON_SPEED;
    await this.wait(120 / S);
    circle.close();
    if (a?.hero) {
      const parts = a.hero.parts();
      for (const p of parts) p.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      // it goes up in the departing beam: white, lifting, fading
      const fade = (this.hud.fast ? 180 : 340) / S;
      this.scene.tweens.add({ targets: a, y: a.y - 10, duration: fade, ease: 'Quad.easeIn' });
      await new Promise<void>((done) => this.scene.tweens.add({ targets: a.hero!.root, alpha: 0, duration: fade, onComplete: () => done() }));
      a.hero.destroy();
    }
    this.actors.delete(r.uid);
    this.views.delete(r.uid);
    await this.wait(120 / S);
  }

  /** A shot from one fighter to another on the pixel layer; resolves when it gets there (a flash where it hits). */
  private bolt(from: Actor, to: Actor, colour: number): Promise<void> {
    const sx = from.x + (from.unit.team === 0 ? 10 : -10), sy = from.y - 16 - from.alt;
    const tx = to.x, ty = to.y - to.h * 0.5 - to.alt;
    return new Promise((r) => {
      this.layer.add(new Bolt(sx, sy, tx, ty, colour, this.hud.fast ? 0.14 : 0.26, () => r()));
    });
  }

  private glow(t: Actor, colour: number): void {
    const ring = this.scene.add.ellipse(t.x, t.y, 22, 7).setStrokeStyle(1, colour, 1).setDepth(1.5).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    for (let i = 0; i < 6; i++) {
      const p = this.scene.add.rectangle(t.x + (Math.random() - 0.5) * 16, t.y - Math.random() * 10, 1, 2, colour).setDepth(9000).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: p, y: p.y - 14 - Math.random() * 10, alpha: 0, duration: 700 + Math.random() * 300, delay: i * 40, onComplete: () => p.destroy() });
    }
  }

  /** A white flash on a hit (red-ish on damage over time). */
  private flash(uid: string, hurt: boolean): void {
    const a = this.actors.get(uid);
    if (!a) return;
    const parts = a.hero ? a.hero.parts() : a.img ? [a.img] : [];
    for (const p of parts) p.setTint(hurt ? 0xffffff : 0x9bffb0).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(90, () => parts.forEach((p) => p.active && p.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)));
  }

  private knock(uid: string): void {
    const a = this.actors.get(uid);
    if (!a) return;
    const side = a.unit.team === 0 ? -1 : 1;
    this.scene.tweens.add({ targets: a, x: a.x + side * 3, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
  }

  /**
   * A fighter falls - anyone, hero or monster, the same way: its own shape flares white in a cold light, turns to a
   * pale stone statue and crumbles from the head down into specks the wind carries off (fx/effects/dissolve.ts).
   */
  private async fall(u: Unit): Promise<void> {
    const a = this.actors.get(u.uid);
    if (!a || a.fallen) return;
    a.fallen = true;
    const snap = a.hero ? a.hero.snapshot() : a.img ? imageSnap(a.img) : null;
    // the specks blow away from the foe
    const wind = u.team === 0 ? -1 : 1;
    if (snap) {
      this.layer.add(new Dissolve(snap, Math.round(a.x), Math.round(a.y - a.alt), wind, this.hud.fast ? 2 : 1));
      if (a.hero) a.hero.setVisible(false);
      a.img?.setVisible(false);
    }
    // the shadow thins out as the body goes
    if (a.shadow) this.scene.tweens.add({ targets: a.shadow, alpha: 0, duration: 900, delay: 400 });
    // the battle goes on once it has started to crumble (the rest blows away while it does)
    await this.wait(((Dissolve.CRUMBLE + 0.45) * 1000) / (this.hud.fast ? 2 : 1));
  }

  /** The barrier's soft light round a fighter's bar: a smooth gold glow (a texture drawn once, filtered smooth),
   * added on, breathing - behind the bar's pixels, so it only shows round it. */
  private barrierGlow(a: Actor): void {
    const bar = this.bars.get(a.unit.uid);
    const on = !this.over && !!bar?.visible && a.unit.alive && a.unit.statuses.some((x) => x.type === 'barrier');
    let g = this.barrierGlows.get(a.unit.uid);
    if (!on) {
      g?.setVisible(false);
      return;
    }
    if (!g) {
      const key = 'bt:barrierGlow';
      if (!this.scene.textures.exists(key)) {
        const tex = this.scene.textures.createCanvas(key, 128, 48)!;
        const c = tex.getContext();
        const gr = c.createRadialGradient(64, 24, 0, 64, 24, 64);
        gr.addColorStop(0, 'rgba(255, 214, 110, 0.95)');
        gr.addColorStop(0.45, 'rgba(255, 190, 60, 0.45)');
        gr.addColorStop(1, 'rgba(255, 170, 40, 0)');
        c.setTransform(1, 0, 0, 0.375, 0, 15);
        c.fillStyle = gr;
        c.fillRect(0, -40, 128, 208);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      g = this.scene.add.image(0, 0, key).setBlendMode(Phaser.BlendModes.ADD).setDepth(9499);
      this.barrierGlows.set(a.unit.uid, g);
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 * 0.8);
    g.setVisible(true).setPosition(a.x + 2, this.barY(a)).setDisplaySize(40, 15).setAlpha(0.45 + 0.4 * pulse);
  }

  private regrip(a: Actor): void {
    const g = a.unit.look ? gear[a.unit.look] : undefined;
    a.hero!.setHands(g && !g.front.over ? (g.front.pose ?? 'grip') : 'open', g?.back && !g.back.over ? (g.back.pose ?? 'grip') : 'open');
  }

  private finish(result: 'win' | 'lose' | 'draw' | 'flee'): void {
    if (this.ended && result !== 'flee') return;
    this.ended = true;
    this.hud.destroy();
    this.ring.destroy();
    this.layer.destroy();
    this.top.destroy();
    this.ground.destroy();
    for (const { layer } of this.summonLayers) layer.destroy();
    this.summonLayers.length = 0;
    this.ringGlow.destroy();
    for (const g of this.barrierGlows.values()) g.destroy();
    this.dimmer?.destroy();
    for (const a of this.actors.values()) {
      a.hero?.destroy();
      a.img?.destroy();
      a.shadow?.destroy();
    }
    this.hooks.done(result);
  }
}

/** A move's icon: a hero's own (its weapon for the normal attack, its skills' icons); a monster's element. */
function moveIcon(u: Unit, action: ActionName): HTMLElement {
  const src = u.team === 0 && u.look
    ? `assets/ui/skills/${action === 'attack' ? `${u.look}_attack` : `${u.id}_${action}`}.png`
    : `assets/ui/icons/${action === 'attack' ? 'battle' : `el_${u.element ?? 'fire'}`}.png`;
  return Object.assign(document.createElement('img'), { src, alt: '', draggable: false });
}

const labelOf = (s: string) => {
  const t: Record<string, string> = { stun: 'มึนงง', silence: 'ห้ามสกิล', poison: 'พิษ', burn: 'ไฟไหม้', bleed: 'เลือดไหล', taunt: 'ยั่วยุ', barrier: 'อมตะ' };
  return t[s] ?? (s.endsWith('Up') ? 'บัฟ' : s.endsWith('Down') ? 'ดีบัฟ' : s === 'regen' ? 'ฟื้นฟู' : s === 'vulnerable' ? 'เปราะบาง' : s);
};
