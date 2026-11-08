// Layered character rig (same model as ProjectZ): head, body and two legs, each
// drawn on its own 32x32 frame with the feet at (16, 32). Animation moves whole
// parts a pixel or two - never stretches them - so the pixel art stays crisp.
// Hands are separate and float beside the body.

export const ORIGIN_X = 16;
export const ORIGIN_Y = 32;

export const WALK_FPS = 16;
export const IDLE_PERIOD = 1.5; // slow breathing: the head dips a pixel on the exhale
export const SETTLE_TIME = 0.1; // body dips a pixel when stopping

// Walk: 8 frames, two steps. The body rises a pixel while the feet pass each
// other and drops back when a foot lands.
export const WALK_BODY = [0, -1, -1, 0, 0, -1, -1, 0];
// The head rides a pixel higher than the body at the top of each step.
export const WALK_HEAD = [0, -1, -2, -1, 0, -1, -2, -1];
// Each foot is planted for half the cycle sliding back, then swings forward: [dx, lift].
export const FOOT_CYCLE: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [1, 0], [-1, 0], [-2, 0], [-1, 1], [0, 2], [1, 2], [1, 1],
];
export const STEP_FRAMES = new Set([0, 4]); // frames where a foot lands

/**
 * Leg pose for walk frame f: [[dxL, liftL], [dxR, liftR]]. `side` (0..1) is how
 * sideways the movement is - walking up/down the screen shortens the stride.
 */
export function walkLegs(f: number, side: number): [[number, number], [number, number]] {
  const stride = (dx: number) => Math.sign(dx) * Math.round(Math.abs(dx) * (0.5 + 0.5 * side));
  const [rx, rl] = FOOT_CYCLE[f];
  const [lx, ll] = FOOT_CYCLE[(f + 4) % 8];
  return [[stride(lx), ll], [stride(rx), rl]];
}

// Where the floating hands rest, in feet-local pixels (facing right, +y down).
export const HAND_FRONT = { x: 8, y: -8 };
export const HAND_BACK = { x: -6, y: -9 };
