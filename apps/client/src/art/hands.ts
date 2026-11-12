import { rowsToCanvas } from './pixel';

// Floating hands (the characters have no arms - see ProjectZ), drawn the way ProjectZ draws them: small,
// rounded mitts a few pixels across (about as wide as the boots), the face's three skin tones, a black
// outline. Drawn facing right (fingers toward +x); the character mirrors them when it faces left.
// Skin matches the face: I highlight, i base, j shade.
// H the brightest catch of light, k / l shadow in the creases, o the dark line inside a fist (the thumb's edge, the
// gaps between the curled fingers).
const SKIN = { H: '#fff0ea', I: '#f9e2db', i: '#efc6ba', j: '#d9ada0', k: '#c4927f', l: '#a8786a', o: '#5a3028', '#': '#000000' };
const OUTLINE = '#000000';

interface HandArt {
  rows: string[];
  /** The pixel (in rows coordinates) that sits on the point the hand is placed at. */
  at: { x: number; y: number };
  /** Drawn fine: two art pixels to a world pixel (shown at HAND_FINE instead of HAND_SCALE). */
  fine?: boolean;
}

// All the poses are hand-drawn grids, shown at HAND_SCALE (a pose marked `fine` would be twice the detail at HAND_FINE).
const ART = {
  /** Relaxed and rounded - walking, idle. */
  open: { rows: ['.iiII.', 'iiiiIi', 'iiiiii', 'jiiiij', '.jjjj.'], at: { x: 3, y: 2.5 } },
  /** Closed fist, the knuckles showing - punching, bracing. */
  fist: { rows: ['.II.', 'iiiI', 'ijij', '.jj.'], at: { x: 2, y: 2 } },
  /** An upright fist closed round a handle - swords, staffs, tools (the handle runs up and down behind it, showing
   * above and below): short, the fingers' creases across it, so it reads as gripping, not hanging under the weapon. */
  grip: { rows: ['IiI', 'kkj', 'iij', 'kkj', 'iij', 'jjj'], at: { x: 1, y: 2.5 } },
  /** Index finger out - pointing, choosing a target. */
  point: { rows: ['.iI...', 'iiiIII', 'jiij..', '.jj...'], at: { x: 2, y: 2 } },
  /** Palm out, fingers up - casting, stopping, shielding. */
  palm: { rows: ['.I.I.', 'iiIii', 'iiiii', 'jiiij', '.jjj.'], at: { x: 2.5, y: 2.5 } },
  /** Fingers curled forward - charging magic, grabbing. */
  claw: { rows: ['.iiI.', 'iIiiI', 'iiii.', 'jiiI.', '.jj..'], at: { x: 2, y: 2.5 } },
  /** Thumb up - victory, emotes. */
  thumb: { rows: ['.I..', '.I..', 'iiiI', 'jiij', '.jj.'], at: { x: 2, y: 3 } },
  /** Finger and thumb together at the front - holding a small item (potion, coin, card). */
  pinch: { rows: ['.iI..', 'iiiII', 'jiij.', '.jj..'], at: { x: 2, y: 2 } },
  /** A fist round a grip, the index finger along the trigger - guns, wands held like one. */
  trigger: { rows: ['iiII.', 'iiiiI', 'jiij.', '.jj..'], at: { x: 2, y: 1 } },
  /** A half fist under a handguard, round a long handle - the second hand on a two-handed weapon. */
  support: { rows: ['IiiI', 'jiij', '.jj.'], at: { x: 2.5, y: 1.5 } },
} satisfies Record<string, HandArt>;

/** How big the hands are shown (world px per art px): the owner found them too big at 1 - 3/4, the size the fine
 * weapons are shown at too (tools/hero_parts.py HAND_SHOW draws the pictures the same). */
export const HAND_SCALE = 0.75;
/** The fine hands' size: half (two art pixels to a world pixel) - the same size as the others at HAND_SCALE. */
export const HAND_FINE = 0.5;

export type HandPose = keyof typeof ART;
export const HAND_POSES = Object.keys(ART) as HandPose[];

/** A character's own skin tones for its hands (keys as SKIN above; tools/hero_parts.py reads each hero's off its face
 * → `skin` in heroGear.json). What's left out stays the master's. */
export type Skin = Partial<Record<keyof typeof SKIN, string>>;

/** A pose drawn in a character's own skin. */
export function handCanvas(pose: HandPose, skin: Skin): HTMLCanvasElement {
  return rowsToCanvas((ART[pose] as HandArt).rows, { ...SKIN, ...skin }, OUTLINE);
}

/** Hand canvases (rows plus a 1px outline), the anchor point inside each canvas, and the size to show it at. */
export const HAND_ART: Record<HandPose, { canvas: HTMLCanvasElement; ax: number; ay: number; scale: number }> = Object.fromEntries(
  HAND_POSES.map((k) => {
    const a: HandArt = ART[k];
    return [k, { canvas: rowsToCanvas(a.rows, SKIN, OUTLINE), ax: a.at.x + 1, ay: a.at.y + 1, scale: a.fine ? HAND_FINE : HAND_SCALE }];
  }),
) as Record<HandPose, { canvas: HTMLCanvasElement; ax: number; ay: number; scale: number }>;
