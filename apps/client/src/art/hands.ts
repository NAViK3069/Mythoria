import { rowsToCanvas } from './pixel';

// Floating hands (the characters have no arms - see ProjectZ). Drawn facing
// right (fingers toward +x, thumb on top); the character mirrors them when it
// faces left. Skin matches the face: I highlight, i base, j shade, k deep shade.
const SKIN = { I: '#fbe8df', i: '#efc6ba', j: '#d9ada0', k: '#b8877c' };
const OUTLINE = '#1c1214';

interface HandArt {
  rows: string[];
  /** The pixel (in rows coordinates) that sits on the point the hand is placed at. */
  at: { x: number; y: number };
}

const ART = {
  /** Relaxed, fingers loosely together - walking, idle. */
  open: {
    rows: [
      '.II...',
      'Iiii..',
      'iiiiII',
      'iiiiij',
      'jiiijj',
      '.kjjk.',
    ],
    at: { x: 2.5, y: 2.5 },
  },
  /** Closed fist, knuckles forward - punching, bracing. */
  fist: {
    rows: [
      '.IIi.',
      'IiiiI',
      'iijij',
      'iiiij',
      'jijjk',
      '.kkk.',
    ],
    at: { x: 2, y: 2.5 },
  },
  /** Fist closed round a handle, fingers stacked - swords, staffs, tools (draw the handle through it). */
  grip: {
    rows: [
      '.IIi.',
      'Iiiij',
      'jjjjk',
      'iiiij',
      'jjjjk',
      'iiiij',
      '.kkk.',
    ],
    at: { x: 2, y: 3 },
  },
  /** Index finger out - pointing, choosing a target. */
  point: {
    rows: [
      '.II.....',
      'IiiiiiII',
      'iiijjjjk',
      'iiiij...',
      'jijjk...',
      '.kkk....',
    ],
    at: { x: 2, y: 2.5 },
  },
  /** Palm out, fingers spread - casting, stopping, shielding. */
  palm: {
    rows: [
      '.I.I.I.',
      '.i.i.i.',
      '.iIiIi.',
      'IiiiiiI',
      'iiiiiij',
      '.jiiij.',
      '..kjk..',
    ],
    at: { x: 3, y: 3.5 },
  },
  /** Fingers curled like claws - charging magic, grabbing. */
  claw: {
    rows: [
      'I.I.I.',
      'i.i.i.',
      'iiiiiI',
      'iiiiij',
      'jiiijj',
      '.kjjk.',
    ],
    at: { x: 2.5, y: 3 },
  },
  /** Thumbs up - victory, emotes. */
  thumb: {
    rows: [
      '.I...',
      '.iI..',
      'IiiiI',
      'iijjj',
      'iiiij',
      'jijjk',
      '.kkk.',
    ],
    at: { x: 2, y: 4 },
  },
  /** Finger and thumb together - holding a small item (potion, coin, card). */
  pinch: {
    rows: [
      '.II..',
      'Iii.I',
      'iij.i',
      'iiiij',
      'jijjk',
      '.kkk.',
    ],
    at: { x: 2, y: 3 },
  },
} satisfies Record<string, HandArt>;

export type HandPose = keyof typeof ART;
export const HAND_POSES = Object.keys(ART) as HandPose[];

/** Hand canvases (rows plus a 1px outline) and the anchor point inside each canvas. */
export const HAND_ART: Record<HandPose, { canvas: HTMLCanvasElement; ax: number; ay: number }> = Object.fromEntries(
  HAND_POSES.map((k) => {
    const a: HandArt = ART[k];
    return [k, { canvas: rowsToCanvas(a.rows, SKIN, OUTLINE), ax: a.at.x + 1, ay: a.at.y + 1 }];
  }),
) as Record<HandPose, { canvas: HTMLCanvasElement; ax: number; ay: number }>;
