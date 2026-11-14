import * as Phaser from 'phaser';
import { heroLineup, monsterTeam, reserveTeam, type Battle } from '@mythoria/combat';
import { setTexPrefix } from '../art/texPrefix';
import { playTransition } from '../ui/transition';
import { hudReserve, narrowScreen } from '../ui/battleHud';
import { changed, lineup, player } from '../ui/store';
import { fitTeam, hpShare, setHp } from '../ui/vitals';
import { Ambience } from '../world/Ambience';
import { ARENA_CENTER, buildArena } from '../world/arenaMap';
import { BattleStage } from '../world/BattleStage';
import { Critters } from '../world/Critters';
import { MeadowView } from '../world/MeadowView';
import { TILE, waterAt, type MeadowMap, type ShapeOf } from '../world/meadowMap';

export interface BattleData {
  /** The monsters you fight (ids). */
  foes: string[];
  /** Picked up mid-fight from the map (world/FieldFight.ts): each foe's HP as a share of its max, in `foes` order. */
  foeHp?: number[];
  seed: number;
  /** It's over (the world wakes and carries on from here). */
  done: (result: 'win' | 'lose' | 'draw' | 'flee') => void;
  /** A fight already going on the map (ADR 0019): carried on from exactly where it is (HP, energy, cooldowns...). */
  battle?: Battle;
  /** Folded back to the map mid-fight: the battle, to carry on there. Given: a button to do it shows. */
  fold?: (battle: Battle) => void;
}

/**
 * A battle on its own map: the stage's arena (world/arenaMap.ts), drawn and lit like the maps (MeadowView,
 * Ambience - its textures baked under 'bt:' so the sleeping world's stay), butterflies and fireflies about,
 * the camera framing the field. The fight itself is world/BattleStage.ts with the battle HUD.
 */
export class BattleScene extends Phaser.Scene {
  private map!: MeadowMap;
  private view!: MeadowView;
  private ambience!: Ambience;
  private critters!: Critters;
  private stage: BattleStage | null = null;
  private before = new Set<string>();

  constructor() {
    super('Battle');
  }

  create(data: BattleData): void {
    this.before = new Set(this.textures.getTextureKeys());
    setTexPrefix('bt:');
    const atlas = this.textures.get('meadow');
    const shape: ShapeOf = (frame) => {
      const f = atlas.get(frame);
      return { w: f.cutWidth, h: f.cutHeight };
    };
    this.map = buildArena(shape);
    this.view = new MeadowView(this, this.map);
    this.ambience = new Ambience(this, this.map);
    for (const f of this.ambience.followers) this.view.follow(f.owner, f.image, f.offset);
    const ground = (x: number, y: number) => x > 8 && y > 12 && x < this.map.cols * TILE - 8 && y < this.map.rows * TILE - 4 && waterAt(this.map, x, y) < 0.45;
    this.critters = new Critters(this, this.map.butterflies, this.map.flowers, ground);
    setTexPrefix('');

    const cam = this.cameras.main;
    cam.setRoundPixels(false);
    this.fitCamera();
    const onResize = () => this.fitCamera();
    this.scale.on('resize', onResize);

    const k = () => cam.zoom / this.scale.displayScale.x;
    // heroes come in with their lasting HP; the fallen stay out (ui/vitals.ts)
    this.stage = new BattleStage(this, { ...ARENA_CENTER }, heroLineup(fitTeam(lineup().front), fitTeam(lineup().back), 1, hpShare), foesWithHp(data.foes, data.foeHp), data.seed, {
      project: (x, y) => ({ x: (x - cam.worldView.x) * k(), y: (y - cam.worldView.y) * k() }),
      sort: (x, y, w, h) => this.view.depthFor(x, y, w, h),
      done: (result, heroes) => {
        this.stage = null;
        // what they have left is what they keep
        for (const hh of heroes) setHp(hh.id, hh.hp, hh.max);
        changed();
        // the same blade wipes back to the map
        playTransition(() => {
          data.done(result);
          this.scene.stop();
        });
      },
      fold: (battle) => {
        this.stage = null;
        playTransition(() => {
          data.fold?.(battle);
          this.scene.stop();
        });
      },
    }, reserveTeam(fitTeam(player.reserves ?? [])), data.battle);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      // the arena's own textures go with it (the world's were there before it came)
      this.time.delayedCall(0, () => undefined);
      for (const key of this.textures.getTextureKeys()) if (!this.before.has(key)) this.textures.remove(key);
    });
  }

  /** Whole-number zoom that fills the screen with the field (both line-ups and room for the HUD's bars above
   * and below) - the fighters big, as in LineRanger_TurnBased. */
  private fitCamera(): void {
    const cam = this.cameras.main;
    // the field fits in what the HUD leaves free (its bars along the top, its card and moves along the bottom)
    const dpr = cam.width / Math.max(1, window.innerWidth);
    const r = hudReserve();
    const freeH = cam.height - (r.top + r.bottom) * dpr;
    // How wide the line-ups are, with a margin at each edge. An upright phone has its back rows closer in
    // (BattleStage BACK_COMPACT: the outermost at 90 px, plus the fighter and its bar), so ~236 px leaves
    // room at both edges; an upright tablet keeps the full line-up.
    const compact = narrowScreen();
    const fieldW = compact ? 236 : cam.width < cam.height ? 280 : 320;
    // (from the top of the back row's bars to the front's feet the fighters need about 140 px of height)
    const fit = Math.min(cam.width / fieldW, freeH / 140);
    // whole screen pixels per map pixel; only where that would leave the field tiny (under 2 - a phone with few
    // real pixels) the zoom fits the space exactly instead
    const zoom = fit >= 2 ? Math.floor(fit) : Math.max(1, fit);
    cam.setZoom(zoom);
    if (compact) {
      // an upright phone: the field in the middle of the space between the top bars and the dock, so it
      // doesn't sit low against the dock (from the back row's bars, ~92 px above the middle, to the
      // lowest feet, ~48 px below it)
      const freeMid = (r.top * dpr + (cam.height - r.bottom * dpr)) / 2;
      const fieldMid = ARENA_CENTER.y + (48 - 92) / 2;
      cam.centerOn(ARENA_CENTER.x, fieldMid - (freeMid - cam.height / 2) / zoom);
      return;
    }
    // the line the lowest fighters stand on just above the dock: the field as low and as big as it can be, the
    // HUD's top bars over the trees behind it
    const feet = ARENA_CENTER.y + 48;
    const floor = cam.height - r.bottom * dpr;
    cam.centerOn(ARENA_CENTER.x, feet - (floor - cam.height / 2) / zoom);
  }

  update(time: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    const c = ARENA_CENTER;
    this.view.update(dt, c.x, c.y, time / 1000);
    this.ambience.update(dt);
    this.critters.update(dt, c.x, c.y - 400);
    this.stage?.update(dt);
  }
}

/** The foes as battle units, each starting with the HP it had (a fight picked up from the map). */
function foesWithHp(foes: string[], hp?: number[]) {
  const units = monsterTeam(foes);
  if (!hp) return units;
  const used = new Set<number>();
  for (const u of units) {
    // (the formation reorders them: match by id, each share used once)
    const i = foes.findIndex((id, k) => id === u.id && !used.has(k));
    if (i < 0) continue;
    used.add(i);
    if (hp[i] != null && hp[i] < 1) u.hpShare = Math.max(0.01, hp[i]);
  }
  return units;
}
