import { BattleCut, CUT_COVERED } from '../fx/effects/battleCut';
import { Surface } from '../fx/surface';

// Our own screen transition into and out of battle - "the Mythoria cut" (fx/effects/battleCut.ts), drawn on our
// own engine (fx/surface.ts) every animation frame onto a pixel canvas shaped like the screen (about 400 px
// across) and stretched over everything, pixelated. It covers the screen, holds, then uncovers: `covered` is
// called while the screen is fully covered, to swap what's under it.

let running = false;

/** Is a transition playing? (Input waits.) */
export const transitioning = (): boolean => running;

export function playTransition(covered: () => void, opts: { seed?: number; done?: () => void } = {}): void {
  // pixels: about 400 across, as many down as the screen's shape gives (never cropped)
  const W = 400;
  const H = Math.max(160, Math.min(900, Math.round((W * window.innerHeight) / Math.max(1, window.innerWidth))));
  const fx = new BattleCut(W, H, opts.seed ?? Math.floor(Math.random() * 1000) + 1);
  const surface = new Surface(W, H, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'screen-wipe';
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(W, H);
  running = true;
  let swapped = false, last = performance.now(), t = 0;
  const step = (now: number) => {
    // a long frame (the battle being built under the cover) never jumps the cut ahead
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    t += dt;
    fx.update(dt);
    surface.clear();
    fx.draw(surface);
    surface.write(img.data);
    g.putImageData(img, 0, 0);
    if (!swapped && t >= CUT_COVERED) {
      swapped = true;
      covered();
      // building what's under it can take a moment: start timing again after it
      last = performance.now();
    }
    if (!fx.done) requestAnimationFrame(step);
    else {
      canvas.remove();
      running = false;
      opts.done?.();
    }
  };
  requestAnimationFrame(step);
}
