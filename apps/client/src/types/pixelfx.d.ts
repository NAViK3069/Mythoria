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
