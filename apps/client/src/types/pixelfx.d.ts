// pixelfx (github:patch-gg/pixelfx) is plain JavaScript; these are the bits we use.
declare module 'pixelfx' {
  export interface FxFrame {
    w: number;
    h: number;
    ox: number;
    oy: number;
    color: Uint32Array;
    light: Uint32Array;
  }
  export interface FxMeta {
    name: string;
    size: [number, number];
    origin?: [number, number];
    duration?: number;
    loop?: boolean;
    fps?: number;
    options?: Record<string, unknown>;
  }
  export interface FxModule {
    meta: FxMeta;
  }
  export interface FxInstance {
    meta: FxMeta;
    readonly t: number;
    update(dt: number): void;
    draw(frame: FxFrame, layer?: 'back' | 'front'): void;
    stop(): void;
    done(): boolean;
  }
  export function createFrame(w: number, h: number, ox?: number, oy?: number): FxFrame;
  export function clearFrame(f: FxFrame): FxFrame;
  export function createFx(mod: FxModule, opts?: Record<string, unknown>): FxInstance;
  export function composite(f: FxFrame, out: Uint8ClampedArray, bg?: number | Uint32Array | null, lightK?: number): Uint8ClampedArray;
}

declare module 'pixelfx/fx/*' {
  import type { FxMeta } from 'pixelfx';
  export const meta: FxMeta;
}

// The drawing engine our own effects (src/fx/effects) are written on. Loosely typed: the painter's
// API is documented in node_modules/pixelfx/docs/AUTHORING.md.
declare module 'pixelfx' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Painter = any;
  export function painterFor(f: FxFrame): Painter;
  export const TAU: number;
  export const WHITE: number;
  export function clamp(x: number, a?: number, b?: number): number;
  export function lerp(a: number, b: number, t: number): number;
  export function wrap(x: number, m: number): number;
  export function rand(...ns: number[]): number;
  export function noise(x: number, seed?: number): number;
  export function hex(h: string): number;
  export function mix(a: number, b: number, t: number): number;
  export function fit(r: (string | number)[], n: number): number[];
  export class Rng {
    constructor(seed: number);
    next(): number;
    range(a: number, b: number): number;
    int(a: number, b: number): number;
    chance(p: number): boolean;
  }
}

declare module 'pixelfx/fx/fire/_lib' {
  import type { Painter } from 'pixelfx';
  type N = (rate: number, seed?: number, off?: number) => number;
  type Layers = [number, number, number][];
  export function noiseFor(D: number): (t: number, rate: number, seed?: number, off?: number) => number;
  export function looped<Q extends { life: number }>(t: number, D: number, count: number, seed: number, make: (r: import('pixelfx').Rng, i: number) => Q, draw: (q: Q, age: number, i: number) => void): void;
  export function hotFirst(F: number[]): number[];
  export const LAYERS: Layers;
  export const BIG_LAYERS: Layers;
  export const BACK_LAYERS: Layers;
  export function flameTongue(p: Painter, x: number, y: number, h: number, w: number, sx: number, N: N, n: number, H: number[], layers?: Layers, jit?: number, wob?: number): void;
  export function firePuff(p: Painter, x: number, y: number, k: number, size: number, frac: number, H: number[], glowK?: number, tx?: number, ty?: number): void;
  export function lick(p: Painter, x: number, y: number, k: number, s: number, H: number[]): void;
  export function smokePuff(p: Painter, x: number, y: number, k: number, size: number, col?: number, big?: boolean, aMul?: number): void;
  export function ember(p: Painter, x: number, y: number, k: number, size: number, cols: number[], ph: number): void;
  export function spark(p: Painter, x: number, y: number, vx: number, vy: number, k: number, cols: number[]): void;
  export function drift(x: number, y: number, vx: number, vy: number, t: number, ax: number, ay: number, kx: number, ky: number): [number, number, number, number];
  export function sparkAt(x: number, y: number, vx: number, vy: number, t: number, floor?: number, g?: number, k?: number): [number, number, number, number];
  export function floorLight(p: Painter, x: number, y: number, rx: number, ry: number, c: number, k: number): void;
}
