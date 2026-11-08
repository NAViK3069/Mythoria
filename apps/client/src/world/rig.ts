// Layered character rig (same parts as ProjectZ): head, body and two legs, each
// drawn on its own 32x32 frame with the feet at (16, 32). Unlike ProjectZ the
// parts move smoothly (sub-pixel offsets, small rotations, springs) instead of
// snapping by whole pixels, so the character feels soft and alive at 60 FPS.
// Hands are separate, float in front of the body and follow on springs.

export const FRAME = 32;
export const ORIGIN_X = 16;
export const ORIGIN_Y = 32;

/** Pivots inside the 32px frame (where each part bends from). */
export const PIVOT = {
  head: { x: 16, y: 20 }, // the neck
  body: { x: 16, y: 28 }, // the hips
  legL: { x: 12, y: 28 },
  legR: { x: 20, y: 28 },
};

/** Ground covered by one full step cycle (two steps), in px. Keeps the feet from sliding. */
export const STRIDE = 22;
/** How far a foot reaches forward/back, and how high it lifts, in px. */
export const FOOT_REACH = 1.8;
export const FOOT_LIFT = 1.6;

/** Where the floating hands rest, in feet-local pixels (facing right, +y down). */
export const HAND_FRONT = { x: 8.5, y: -8.5 };
export const HAND_BACK = { x: -7, y: -9 };

/** A critically-damped-ish spring for one number: smooth follow with a little overshoot. */
export class Spring {
  v = 0;
  constructor(public x = 0, public k = 180, public d = 16) {}
  step(target: number, dt: number): number {
    this.v += (this.k * (target - this.x) - this.d * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(dv: number): void {
    this.v += dv;
  }
}
