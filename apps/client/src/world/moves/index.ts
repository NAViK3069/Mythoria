import { ASTRAEA } from './astraea';
import { BRAM } from './bram';
import { DRAVIK } from './dravik';
import { FEN } from './fen';
import { FENRIR } from './fenrir';
import { KAEL } from './kael';
import { KUROHA } from './kuroha';
import { MARIN } from './marin';
import { NERIS } from './neris';
import { PIP } from './pip';
import { NYX } from './nyx';
import { SIRA } from './sira';
import { SYLVA } from './sylva';
import { VALDRIS } from './valdris';
import type { HeroMoves } from './kit';

/** Heroes with their own moves on the field, by look (the rest use BattleStage's plain dash / bolt / glow). */
export const MOVES: Record<string, HeroMoves> = {
  bram: BRAM,
  kael: KAEL,
  fen: FEN,
  fenrir: FENRIR,
  marin: MARIN,
  neris: NERIS,
  pip: PIP,
  kuroha: KUROHA,
  astraea: ASTRAEA,
  sylva: SYLVA,
  sira: SIRA,
  nyx: NYX,
  dravik: DRAVIK,
  valdris: VALDRIS,
};

export type { MoveKit, MoveActor, MoveShow } from './kit';
