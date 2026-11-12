import type * as Phaser from 'phaser';
import type { ActionName, Unit } from '@mythoria/combat';
import type { BattleLayer } from '../../fx/BattleLayer';
import type { MasterCharacter } from '../MasterCharacter';

// A hero's own moves on the battle field: BattleStage hands a move's show this kit (who, at whom, the layers to draw
// on, and its timing helpers), and the show plays it out - the run-up, the stroke, the effects - calling land() the
// moment the blow lands (the numbers, flashes and bars). Each hero that has its own looks its moves up in MOVES.

/** One fighter on the field, as a move sees it. */
export interface MoveActor {
  unit: Unit;
  x: number;
  y: number;
  /** Its height (px), half its width, how high it floats. */
  h: number;
  half: number;
  alt: number;
  home: { x: number; y: number };
  hero?: MasterCharacter;
}

export interface MoveKit {
  scene: Phaser.Scene;
  /** Drawn over the field (strokes, light, sparks). */
  layer: BattleLayer;
  /** Drawn on the ground, under the fighters (circles, rings, halos). */
  ground: BattleLayer;
  actor: MoveActor;
  /** Everyone the move reaches, and the one it was aimed at. */
  targets: MoveActor[];
  main: MoveActor;
  /** Which way is the foe: 1 to the right, -1 to the left. */
  dir: 1 | -1;
  /** How much faster than normal the battle plays (2 on ×2): effects take this. */
  sp: number;
  wait(ms: number): Promise<void>;
  moveTo(a: MoveActor, x: number, y: number, ms: number, ease?: string): Promise<void>;
  /** Tween any numbers on an object (the hero's swing, a hand's reach...). */
  tween(target: object, props: Record<string, number>, ms: number, ease?: string): Promise<void>;
  /** The blow lands: numbers, flashes, bars (once). */
  land(): void;
  /** Everything holds still a moment (a heavy blow). */
  hitStop(ms: number): void;
  shake(ms: number, k: number): void;
  /** The screen flashes (0xRRGGBB). */
  flash(ms: number, colour: number): void;
  /** Put the hands back round what they hold. */
  regrip(): void;
  /** Darken the field (0 = not at all) over ms - the fighters and ground, not the effects over them; colour: the
   * veil's (a deep crimson for blood, night for shadow). */
  dim(alpha: number, ms: number, colour?: number): Promise<void>;
}

export type MoveShow = (k: MoveKit) => Promise<void>;
export type HeroMoves = Partial<Record<ActionName, MoveShow>>;
