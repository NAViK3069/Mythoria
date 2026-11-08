// The world's colour grade: lush, deep and a little moody (think a mossy forest glade). Yellow-greens are turned
// toward teal-green and deepened, earth and stone are darkened a touch, and
// everything gets a little richer. It is applied to the world art once at load
// (not to the screen), so characters and effects keep their own colours.

/** Hue (deg) the greens are pulled toward, and how far at most. */
const TEAL = 150;
const PULL = 26;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Grade one colour. */
export function gradeColor(r: number, g: number, b: number): [number, number, number] {
  let [h, s, v] = rgbToHsv(r, g, b);
  if (h >= 62 && h <= 165 && s > 0.12) {
    // greens: the yellower the green, the further it turns toward teal; deeper and a bit richer
    const k = 1 - Math.abs(h - 105) / 60; // strongest round 105 (lime)
    h += Math.max(0, Math.min(PULL, (TEAL - h))) * Math.max(0.35, k);
    // the source greens are near-neon: soften them into a deep, natural green
    s = Math.min(0.68, s * 0.82);
    v *= 0.68;
  } else if (h > 165 && h < 260) {
    // blues are left as they are (water has its own colours)
  } else {
    // earth, wood, stone and flowers: a touch darker and cooler so they sit in the same light
    v *= 0.86;
    s = Math.min(1, s * 1.04);
  }
  return hsvToRgb(h % 360, s, v);
}

/** Grade a canvas in place. Colours are cached, since pixel art reuses few of them. */
export function gradeCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const cache = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let out = cache.get(key);
    if (out === undefined) {
      const [r, gg, b] = gradeColor(d[i], d[i + 1], d[i + 2]);
      out = (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b);
      cache.set(key, out);
    }
    d[i] = out >> 16;
    d[i + 1] = (out >> 8) & 255;
    d[i + 2] = out & 255;
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

/** An image as a graded canvas copy. */
export function gradedCopy(img: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return gradeCanvas(c);
}
