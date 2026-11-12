import type { Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL, ph, pixArc } from './vfx';

// Ice effects for the frost dragon knight (Dravik first), in our own pixels on fx/surface.ts: crystals of ice
// bursting up out of the ground and shattering, a block of ice closing round a foe and breaking, snowflakes
// drifting, a whirl of frost. Crisp pixels in the ice palette, white at their edges, soft cold light over them.

const P = PAL.ice; // white .. deep blue

/** A falling bit of broken ice. */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  c: number;
}

function stepBits(bits: Bit[], dt: number): void {
  for (const b of bits) {
    b.age += dt;
    b.vy += 260 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  for (let i = bits.length - 1; i >= 0; i--) if (bits[i].age >= bits[i].life) bits.splice(i, 1);
}
function drawBits(s: Surface, bits: Bit[]): void {
  for (const b of bits) {
    const q = b.age / b.life, X = Math.round(b.x), Y = Math.round(b.y);
    if (!keep(X, Y, 1 - q * q)) continue;
    s.px(X, Y, b.c);
    if (b.life > 0.4) s.px(X + 1, Y, P[3]);
  }
}

/**
 * Crystals of ice bursting up out of the ground along a stretch (x across w, at y): each a tall pointed shard, lit on
 * its left face, shadowed on its right, white along its edge; they hold a moment, then shatter into falling bits.
 */
export class IceSpikes implements Pop {
  private t: number;
  private readonly shards: { x: number; y: number; h: number; w: number; lean: number; at: number }[] = [];
  private readonly bits: Bit[] = [];
  private broken = false;
  /** o.arc: where they stand - along the near side of an oval round (x, y) ('near', the default), its far side
   * ('far'), all round it ('ring'), or in a straight run across (false: a wave's front). */
  constructor(private readonly x: number, private readonly y: number, private readonly o: { w?: number; h?: number; n?: number; dur?: number; delay?: number; grow?: number; arc?: 'near' | 'far' | 'ring' | false } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    const n = o.n ?? 6, W = o.w ?? 24, H = o.h ?? 18, seed = Math.random() * 100, arc = o.arc ?? 'near';
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0.5, mid = 1 - Math.abs(u - 0.5) * 1.2;
      // on the oval (seen from above): the near side bulges toward us (lower on the screen), the far side away
      const side = arc === 'ring' ? (i % 2 ? 1 : -1) : arc === 'far' ? -1 : 1;
      const dy = arc ? side * (W * 0.16) * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) : 0;
      this.shards.push({
        x: this.x - W / 2 + W * u + (hash(i, seed) - 0.5) * 3,
        y: this.y + dy,
        h: H * (0.45 + 0.55 * mid) * (0.75 + 0.35 * hash(i, seed, 1)),
        w: 2 + Math.round(2.5 * hash(i, seed, 2) + mid),
        lean: (hash(i, seed, 3) - 0.5) * 0.5 + (u - 0.5) * 0.4,
        at: (o.grow ?? 0.12) * hash(i, seed, 4),
      });
    }
    // the far ones drawn first
    this.shards.sort((a, b) => a.y - b.y);
  }
  get done(): boolean {
    return this.broken && this.bits.length === 0 && this.t > (this.o.dur ?? 0.8);
  }
  update(dt: number): void {
    dt *= this.speed;
    this.t += dt;
    const D = this.o.dur ?? 0.8;
    if (!this.broken && this.t > D * 0.7) {
      this.broken = true;
      // shatter: every shard into falling bits
      for (const sh of this.shards)
        for (let j = 0; j < 4 + sh.h / 4; j++) {
          const yy = this.y - Math.random() * sh.h;
          this.bits.push({ x: sh.x + sh.lean * (sh.y - yy), y: yy + (sh.y - this.y), vx: (Math.random() - 0.5) * 70, vy: -40 - Math.random() * 60, life: 0.3 + Math.random() * 0.35, age: 0, c: Math.random() < 0.4 ? P[0] : Math.random() < 0.5 ? P[1] : P[2] });
        }
    }
    stepBits(this.bits, dt);
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    if (!this.broken) {
      const D = this.o.dur ?? 0.8;
      s.glow(this.x, this.y - 4, (this.o.w ?? 24) * 0.8, P[2], 0.45, 0.5);
      for (const sh of this.shards) {
        const g = ease((this.t - sh.at) / 0.12);
        if (g <= 0) continue;
        const H = sh.h * g * (1 + 0.08 * Math.sin(Math.min(1, (this.t - sh.at) / 0.2) * Math.PI)), half = sh.w / 2;
        for (let yy = 0; yy < H; yy++) {
          const q = yy / H, wHere = half * (1 - q), cx = sh.x + sh.lean * yy, Y = Math.round(sh.y - yy);
          for (let xx = Math.floor(cx - wHere - 1); xx <= Math.ceil(cx + wHere); xx++) {
            const d = xx + 0.5 - cx;
            if (Math.abs(d) > wHere + 0.6) continue;
            const edge = Math.abs(d) > wHere - 0.4;
            // lit on the left face, shadowed on the right, white along the left edge and at the tip
            const c = q > 0.85 ? P[0] : edge ? (d < 0 ? P[0] : P[5]) : d < 0 ? (q > 0.5 ? P[1] : P[2]) : q > 0.5 ? P[3] : P[4];
            s.px(xx, Y, c);
          }
        }
        if (this.t - sh.at < 0.18) s.glow(sh.x + sh.lean * H, sh.y - H, 5, P[1], 0.6);
      }
      // frost on the ground round their feet
      const w = (this.o.w ?? 24) / 2 + 4;
      pixArc(s, this.x, this.y, w, w * 0.28, 0, Math.PI * 2, P[2], 0.7 * (1 - clamp((this.t - D * 0.5) / (D * 0.2))), 0.3);
    }
    drawBits(s, this.bits);
  }
}

// The frozen chunk's shape (the owner's reference: a cut crystal of ice, not a box): its outline and the facets inside
// it, in a box -1..1 across and 0 (the ground) .. 1 (its top), each facet with its shade (0 the lightest).
type Pt = [number, number];
const OUTLINE: Pt[] = [[-0.85, 0.05], [-0.95, 0.45], [-0.75, 0.62], [-0.7, 0.86], [-0.3, 1], [0.45, 0.97], [0.82, 0.8], [0.96, 0.45], [0.86, 0.1], [0.3, 0], [-0.4, 0]];
const A: Pt = [-0.15, 0.72], B: Pt = [0.36, 0.62], C: Pt = [0.08, 0.3], D: Pt = [-0.55, 0.4], E: Pt = [0.6, 0.24];
const FACETS: { pts: Pt[]; shade: number }[] = [
  { pts: [[-0.7, 0.86], [-0.3, 1], A, [-0.75, 0.62]], shade: 1 },
  { pts: [[-0.3, 1], [0.45, 0.97], B, A], shade: 0 },
  { pts: [[0.45, 0.97], [0.82, 0.8], [0.96, 0.45], B], shade: 3 },
  { pts: [[-0.95, 0.45], [-0.75, 0.62], A, D], shade: 1 },
  { pts: [A, B, C, D], shade: 2 },
  { pts: [B, [0.96, 0.45], E, C], shade: 4 },
  { pts: [[-0.85, 0.05], [-0.95, 0.45], D, [-0.4, 0]], shade: 2 },
  { pts: [D, C, [0.3, 0], [-0.4, 0]], shade: 3 },
  { pts: [C, E, [0.86, 0.1], [0.3, 0]], shade: 4 },
  { pts: [E, [0.96, 0.45], [0.86, 0.1]], shade: 3 },
];
const SHADES = [0xb4f0ff, 0x6fd2f8, 0x3eaeea, 0x2486d6, 0x165eb0];
const inPoly = (x: number, y: number, pts: Pt[]) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * A chunk of ice closing round a fighter standing at (x, footY), w x h: a cut crystal (facets in five blues, light lines
 * along their edges, see-through, a cold glow at its foot) that freezes up from the ground (a white front racing up), a
 * glint sliding across its faces, cracks running through it - and it bursts into falling shards of its own blues.
 */
export class FrostShell implements Pop {
  private t: number;
  private readonly bits: Bit[] = [];
  private broken = false;
  constructor(private readonly x: number, private readonly footY: number, private readonly w: number, private readonly h: number, private readonly o: { dur?: number; delay?: number; shatter?: boolean } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t > (this.o.dur ?? 1) && this.bits.length === 0;
  }
  update(dt: number): void {
    dt *= this.speed;
    this.t += dt;
    const D = this.o.dur ?? 1;
    if (!this.broken && this.t >= D) {
      this.broken = true;
      if (this.o.shatter !== false)
        for (let j = 0; j < 30; j++)
          this.bits.push({ x: this.x + (Math.random() - 0.5) * this.w, y: this.footY - Math.random() * this.h, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, life: 0.35 + Math.random() * 0.4, age: 0, c: SHADES[Math.floor(Math.random() * 5)] });
    }
    stepBits(this.bits, dt);
  }
  /** Which facet (pixel at x, y on the field) - or -1 outside the chunk. */
  private facetAt(x: number, y: number): number {
    const nx = (x + 0.5 - this.x) / (this.w / 2), ny = (this.footY - (y + 0.5)) / this.h;
    if (!inPoly(nx, ny, OUTLINE)) return -1;
    for (let i = 0; i < FACETS.length; i++) if (inPoly(nx, ny, FACETS[i].pts)) return i;
    return 4;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1, k = this.t / D;
    if (!this.broken) {
      const up = ease(k / 0.25), top = Math.floor(this.footY - this.h * up), x0 = Math.floor(this.x - this.w / 2 - 1), x1 = Math.ceil(this.x + this.w / 2 + 1), y1 = Math.round(this.footY);
      const glint = -0.4 + ((this.t * 1.3) % 1.8);
      // the cold glow at its foot, and through it
      s.glow(this.x, this.footY, this.w * 0.75, P[2], 0.55, 0.28);
      s.glow(this.x, this.footY - this.h * 0.45, Math.max(this.w, this.h) * 0.6, P[2], 0.25, this.h / this.w);
      const rows: number[][] = [];
      for (let y = top - 1; y <= y1 + 1; y++) {
        const row: number[] = [];
        for (let x = x0 - 1; x <= x1 + 1; x++) row.push(this.facetAt(x, y));
        rows.push(row);
      }
      for (let y = top; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const ry = y - (top - 1), rx = x - (x0 - 1), f = rows[ry][rx];
          if (f < 0) continue;
          const nb = [rows[ry - 1][rx], rows[ry + 1][rx], rows[ry][rx - 1], rows[ry][rx + 1]];
          const outer = nb.some((n) => n < 0), seam = !outer && nb.some((n) => n !== f && n >= 0);
          const u = (x - x0) / Math.max(1, x1 - x0), v = (y - top) / Math.max(1, y1 - top);
          let c = SHADES[FACETS[f]?.shade ?? 2], a = 0.76;
          if (outer) (c = v < 0.5 || u < 0.4 ? 0xeaffff : 0x1c5ea8), (a = 1);
          else if (seam) (c = 0xc8f4ff), (a = 0.9);
          // the glint: a slanting band of light across its faces
          if (Math.abs(u * 0.8 - v * 0.6 - glint) < 0.06) (c = 0xffffff), (a = 0.95);
          // the front of the ice as it freezes up
          if (y <= top + 1 && up < 1) (c = 0xffffff), (a = 1);
          s.px(x, y, c, a);
        }
      // cracks running through it near the end
      if (k > 0.55) {
        const n = Math.round(((k - 0.55) / 0.45) * 4) + 1;
        for (let i = 0; i < n; i++) {
          let cx = this.x + (hash(i, 3) - 0.5) * this.w * 0.6, cy = this.footY - this.h * (0.2 + 0.6 * hash(i, 5));
          for (let j = 0; j < 7; j++) {
            if (this.facetAt(Math.round(cx), Math.round(cy)) >= 0) s.px(Math.round(cx), Math.round(cy), 0xffffff);
            cx += (hash(i, j) - 0.5) * 3;
            cy += hash(i, j, 2) > 0.5 ? 1.5 : -1.5;
          }
        }
      }
    }
    drawBits(s, this.bits);
  }
}

/** Snowflakes round (x, y), r across: little six-armed flakes drifting down and out, twinkling, melting away. */
export class Snowflakes implements Pop {
  private t: number;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly y: number, private readonly r: number, private readonly o: { n?: number; dur?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.4);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 1.4, n = this.o.n ?? 10;
    for (let i = 0; i < n; i++) {
      const life = D * (0.55 + 0.45 * hash(i, this.seed)), st = (D - life) * hash(i, this.seed, 1), q = (this.t - st) / life;
      if (q <= 0 || q >= 1) continue;
      const a = hash(i, this.seed, 2) * Math.PI * 2, d = this.r * (0.3 + 0.7 * hash(i, this.seed, 3)) * (0.4 + 0.6 * ease(q * 2));
      const X = Math.round(this.x + Math.cos(a) * d + Math.sin(this.t * 3 + i) * 2), Y = Math.round(this.y + Math.sin(a) * d * 0.6 + q * 14);
      const A = Math.sin(Math.PI * q), big = hash(i, this.seed, 4) > 0.55, turn = Math.floor(this.t * 6 + i) % 2;
      if (!keep(X, Y, A)) continue;
      s.px(X, Y, P[0]);
      s.add(X, Y, P[2], 0.4 * A);
      const arms = turn ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [-1, -1], [1, -1], [-1, 1]];
      for (const [dx, dy] of arms) s.px(X + dx, Y + dy, P[1]);
      if (big) for (const [dx, dy] of arms) s.px(X + dx * 2, Y + dy * 2, P[2]);
    }
  }
}

/**
 * A whirl of frost round (x, footY), r across and h tall: streaks of cold light circling and rising round it, wider as
 * they rise, white flecks among them - opening out, then thinning away.
 */
export class FrostSwirl implements Pop {
  private t = 0;
  private readonly seed = Math.random() * 100;
  constructor(private readonly x: number, private readonly footY: number, private readonly r: number, private readonly h: number, private readonly dur = 1.2, private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= this.dur;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const k = this.t / this.dur, A = clamp(k / 0.15) * (1 - clamp((k - 0.7) / 0.3)), n = 26;
    s.glow(this.x, this.footY - this.h * 0.45, this.r * 1.3, P[2], 0.3 * A, this.h / (this.r * 2));
    for (let i = 0; i < n; i++) {
      const lift = ((this.t * (0.5 + 0.5 * hash(i, this.seed)) + hash(i, this.seed, 1)) % 1), y = this.footY - lift * this.h;
      const rad = this.r * (0.35 + 0.65 * lift), ang = this.t * (5 + 3 * hash(i, this.seed, 2)) + i * 1.7;
      // a short streak along its orbit, the front of it brightest
      for (let j = 0; j < 5; j++) {
        const a = ang - j * 0.12, X = Math.round(this.x + Math.cos(a) * rad), Y = Math.round(y + Math.sin(a) * rad * 0.3);
        if (!keep(X, Y, A * (1 - j / 5))) continue;
        s.px(X, Y, j === 0 ? P[0] : Math.sin(a) > 0 ? P[1] : P[3]);
      }
      if (ph(i, Math.floor(this.t * 12), 3) > 0.7) s.px(Math.round(this.x + Math.cos(ang + 1) * rad * 0.8), Math.round(y - 2), P[0]);
    }
  }
}
