import type { Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, ease, hash, keep, PAL, ph, type PalName } from './vfx';

// Blood effects for the vampire lord (Valdris first), in our own pixels on fx/surface.ts: orbs of blood drawn out of the
// foes and back into him (his lifesteal), lances of blood thrown at them, blood bursting off a blow and splashing on the
// ground, a blood moon rising over the field. Crisp crimson pixels, white-hot at their hearts, a red light over them.

const P = PAL.blood; // white .. near black red

/**
 * Orbs of blood drawn out of the struck (each `from`) and flying back on curving paths into `to` (the vampire): a bright
 * head and a tail, one after another; a red flare where they arrive.
 */
export class BloodDrain implements Pop {
  private t: number;
  private readonly orbs: { x: number; y: number; bend: number; delay: number }[] = [];
  constructor(from: { x: number; y: number }[], private readonly to: () => { x: number; y: number }, private readonly o: { n?: number; dur?: number; delay?: number; pal?: PalName } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
    const n = o.n ?? 5, seed = Math.random() * 100;
    for (const f of from)
      for (let i = 0; i < n; i++)
        this.orbs.push({ x: f.x + (hash(i, seed) - 0.5) * 10, y: f.y + (hash(i, seed, 1) - 0.5) * 12, bend: (hash(i, seed, 2) - 0.5) * 50, delay: hash(i, seed, 3) * 0.25 });
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.7) + 0.3;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 0.7, T = this.to(), P = PAL[this.o.pal ?? 'blood'];
    let arrived = 0;
    for (const o of this.orbs) {
      const q = (this.t - o.delay) / (D * 0.75);
      if (q <= 0) continue;
      if (q >= 1) {
        arrived++;
        continue;
      }
      // along a curve from where it was drawn out to the vampire, slow then fast
      const at = (u: number) => {
        const e = u * u, mx = (o.x + T.x) / 2, my = Math.min(o.y, T.y) - 18 + o.bend * 0.3;
        const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
        return { x: a * o.x + b * (mx + o.bend) + c * T.x, y: a * o.y + b * my + c * T.y };
      };
      for (let j = 6; j >= 0; j--) {
        const p = at(Math.max(0, q - j * 0.025)), X = Math.round(p.x), Y = Math.round(p.y);
        if (j === 0) {
          s.px(X, Y, P[0]);
          s.px(X + 1, Y, P[2]);
          s.px(X, Y + 1, P[3]);
          s.px(X + 1, Y + 1, P[3]);
          s.glow(X + 0.5, Y + 0.5, 5, P[3], 0.5);
        } else if (keep(X, Y, 1 - j / 7)) s.px(X, Y, j < 3 ? P[2] : P[4]);
      }
    }
    if (arrived) s.glow(T.x, T.y, 8 + arrived * 0.8, P[3], Math.min(0.7, 0.15 + arrived * 0.04));
  }
}

/**
 * A lance of blood thrown from (x0, y0) to (x1, y1): a pointed bright head racing along with a dark red streak behind
 * it; where it strikes, a burst of droplets.
 */
export class BloodLance implements Pop {
  private t: number;
  private readonly drops: { x: number; y: number; vx: number; vy: number; life: number; age: number }[] = [];
  private hit = false;
  constructor(private readonly x0: number, private readonly y0: number, private readonly x1: number, private readonly y1: number, private readonly o: { dur?: number; delay?: number; onHit?: () => void } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.hit && this.drops.length === 0;
  }
  update(dt: number): void {
    dt *= this.speed;
    this.t += dt;
    const D = this.o.dur ?? 0.22;
    if (!this.hit && this.t >= D) {
      this.hit = true;
      this.o.onHit?.();
      const a = Math.atan2(this.y1 - this.y0, this.x1 - this.x0);
      for (let i = 0; i < 12; i++) {
        const b = a + Math.PI + (Math.random() - 0.5) * 2.2, v = 40 + Math.random() * 70;
        this.drops.push({ x: this.x1, y: this.y1, vx: Math.cos(b) * v, vy: Math.sin(b) * v - 30, life: 0.3 + Math.random() * 0.3, age: 0 });
      }
    }
    for (const d of this.drops) {
      d.age += dt;
      d.vy += 240 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    for (let i = this.drops.length - 1; i >= 0; i--) if (this.drops[i].age >= this.drops[i].life) this.drops.splice(i, 1);
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    if (!this.hit) {
      const q = ease(this.t / (this.o.dur ?? 0.22)), hx = this.x0 + (this.x1 - this.x0) * q, hy = this.y0 + (this.y1 - this.y0) * q;
      const dx = this.x1 - this.x0, dy = this.y1 - this.y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, tail = Math.min(26, L * q);
      for (let i = 0; i <= tail; i += 0.6) {
        const X = Math.round(hx - ux * i), Y = Math.round(hy - uy * i), u = i / tail;
        if (!keep(X, Y, 1 - u * 0.8)) continue;
        s.px(X, Y, u < 0.12 ? P[0] : u < 0.4 ? P[2] : P[4]);
        if (u < 0.3) s.px(Math.round(X - uy), Math.round(Y + ux), P[3]), s.px(Math.round(X + uy), Math.round(Y - ux), P[3]);
      }
      s.glow(hx, hy, 7, P[3], 0.6);
    }
    for (const d of this.drops) {
      const X = Math.round(d.x), Y = Math.round(d.y), q = d.age / d.life;
      if (keep(X, Y, 1 - q * q)) s.px(X, Y, q < 0.3 ? P[2] : P[4]);
    }
  }
}

/** Blood bursting off a blow at (x, y): droplets thrown out and falling, splashing dark on the ground (groundY). */
export class BloodSplash implements Pop {
  private t = 0;
  private readonly drops: { x: number; y: number; vx: number; vy: number; landed: boolean; c: number; land: number }[] = [];
  constructor(x: number, y: number, private readonly groundY: number, private readonly o: { n?: number; dir?: number; dur?: number } = {}, private readonly speed = 1) {
    const n = o.n ?? 16, dir = o.dir ?? 0;
    for (let i = 0; i < n; i++) {
      const a = dir ? (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.4 - 0.6 * (dir > 0 ? 1 : -1) * 0 : Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 80;
      // where on the oval it lands: -1 the far side .. 1 the near side, a few px either way
      this.drops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, landed: false, c: Math.random() < 0.3 ? P[2] : Math.random() < 0.6 ? P[3] : P[4], land: (Math.random() * 2 - 1) * 5 });
    }
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 1.1);
  }
  update(dt: number): void {
    dt *= this.speed;
    this.t += dt;
    for (const d of this.drops) {
      if (d.landed) continue;
      d.vy += 260 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      // the ground round the struck one: an oval seen from above, so the drops thrown toward us land lower
      const floor = this.groundY + (d.vy > 0 ? Math.sin(Math.atan2(d.vy, d.vx)) * 0 : 0) + d.land;
      if (d.y >= floor) (d.landed = true), (d.y = Math.round(floor));
    }
  }
  draw(s: Surface): void {
    const A = 1 - clamp((this.t - (this.o.dur ?? 1.1) * 0.55) / ((this.o.dur ?? 1.1) * 0.45));
    for (const d of this.drops) {
      const X = Math.round(d.x), Y = Math.round(d.y);
      if (!keep(X, Y, A)) continue;
      if (d.landed) {
        s.px(X, Y, P[4]);
        s.px(X + 1, Y, P[5]);
      } else {
        s.px(X, Y, d.c);
        s.px(X, Y - 1, P[4], 0.7);
      }
    }
  }
}

/**
 * A blood moon over the field at (x, y), r across: rising out of the dark, crimson with darker seas on it and a white-hot
 * rim on its lit side, a red light all round it - held, then sinking away.
 */
export class BloodMoon implements Pop {
  private t = 0;
  constructor(private readonly x: number, private readonly y: number, private readonly r: number, private readonly dur = 2.2, private readonly speed = 1) {}
  get done(): boolean {
    return this.t >= this.dur;
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  draw(s: Surface): void {
    const k = this.t / this.dur, A = ease(k / 0.25) * (1 - clamp((k - 0.8) / 0.2)), rise = (1 - ease(k / 0.3)) * 14;
    if (A <= 0) return;
    const cx = this.x, cy = this.y + rise, R = this.r;
    s.glow(cx, cy, R * 3, P[3], 0.55 * A);
    s.glow(cx, cy, R * 1.6, P[2], 0.5 * A);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / R;
        if (d > 1 || !keep(x, y, A)) continue;
        // lit from the upper left: a hot rim there, darker toward the lower right; seas of darker red on it
        const lit = (-dx - dy) / R;
        const sea = hash(Math.floor(x / 3), Math.floor(y / 3), 7) > 0.72 || Math.hypot(dx + R * 0.25, dy - R * 0.2) < R * 0.28;
        let c: number = lit > 0.7 && d > 0.8 ? P[1] : d > 0.92 ? (lit > 0 ? P[2] : P[4]) : lit > 0.3 ? P[2] : lit > -0.4 ? P[3] : P[4];
        if (sea && d < 0.88) c = lit > 0 ? P[3] : P[5];
        s.px(x, y, c);
      }
  }
}

/**
 * A curving cut, like a sweeping stroke of a blade, from (x0, y0) to (x1, y1) bowed out by `bend` (px, to its left): it
 * races along (thick in its middle, pointed at both ends, white at its heart, crimson round it, a dark drop shadow
 * under it), flings droplets off its tail, holds a moment, then thins and breaks up.
 */
export class CurvedCut implements Pop {
  private t: number;
  constructor(private readonly x0: number, private readonly y0: number, private readonly x1: number, private readonly y1: number, private readonly o: { bend?: number; w?: number; dur?: number; delay?: number; shadow?: number; pal?: PalName } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.42);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  private at(u: number): { x: number; y: number } {
    const mx = (this.x0 + this.x1) / 2, my = (this.y0 + this.y1) / 2, dx = this.x1 - this.x0, dy = this.y1 - this.y0, L = Math.hypot(dx, dy) || 1;
    const b = this.o.bend ?? 12, cx = mx - (dy / L) * b * 2, cy = my + (dx / L) * b * 2;
    const a = (1 - u) * (1 - u), m = 2 * (1 - u) * u, c = u * u;
    return { x: a * this.x0 + m * cx + c * this.x1, y: a * this.y0 + m * cy + c * this.y1 };
  }
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 0.42, k = this.t / D, W = this.o.w ?? 3.5, P = PAL[this.o.pal ?? 'blood'];
    const head = ease(k / 0.24), thin = 1 - clamp((k - 0.32) / 0.68);
    if (thin <= 0) return;
    const L = Math.hypot(this.x1 - this.x0, this.y1 - this.y0) * 1.2, n = Math.ceil(L * 2);
    for (const shade of this.o.shadow !== undefined ? [true, false] : [false])
      for (let i = 0; i <= n * head; i++) {
        const u = i / n, p = this.at(u), q = this.at(Math.min(1, u + 0.01)), tx = q.x - p.x, ty = q.y - p.y, tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl, half = W * Math.pow(Math.sin(Math.PI * u), 0.7) * thin;
        for (let j = -Math.ceil(half); j <= Math.ceil(half); j++) {
          if (Math.abs(j) > half + 0.3) continue;
          const X = Math.round(p.x + nx * j), Y = Math.round(p.y + ny * j + (shade ? 1.5 : 0));
          if (k > 0.45 && ph(X, Y, 11) > thin * 1.4) continue;
          if (shade) {
            s.px(X, Y, this.o.shadow!, 0.85);
            continue;
          }
          const r = Math.abs(j) / Math.max(0.5, half);
          s.px(X, Y, r < 0.3 ? P[0] : r < 0.65 ? P[2] : P[3]);
          if (r < 0.5) s.add(X, Y, P[3], 0.3 * thin);
        }
      }
    // droplets flung off the tail as it goes
    for (let i = 0; i < 6; i++) {
      const u = 0.75 + 0.25 * hash(i, 3), p = this.at(Math.min(head, u)), fly = k * (8 + 10 * hash(i, 5));
      const X = Math.round(p.x + (hash(i, 7) - 0.5) * fly * 2), Y = Math.round(p.y + fly * 0.6 - 4 * hash(i, 9));
      if (keep(X, Y, thin)) s.px(X, Y, hash(i, 2) > 0.5 ? P[2] : P[4]), s.px(X + 1, Y, P[3]);
    }
    const g = this.at(head * 0.6);
    s.glow(g.x, g.y, 14 + W * 2, P[3], 0.35 * thin);
  }
}

/**
 * The vampire's bite on a foe at (x, y), w across: two rows of fangs - the upper jaw arched over it, the lower cupped
 * under it, a great canine at each side - open wide, then snapping shut on it with a flash; then they fade.
 */
export class FangBite implements Pop {
  private t: number;
  constructor(private readonly x: number, private readonly y: number, private readonly w: number, private readonly o: { dur?: number; delay?: number } = {}, private readonly speed = 1) {
    this.t = -(o.delay ?? 0);
  }
  get done(): boolean {
    return this.t >= (this.o.dur ?? 0.8);
  }
  update(dt: number): void {
    this.t += dt * this.speed;
  }
  /** When the jaws close (s into it). */
  static readonly SNAP = 0.26;
  draw(s: Surface): void {
    if (this.t < 0) return;
    const D = this.o.dur ?? 0.8, t = this.t, W = this.w / 2;
    const open = t < 0.12 ? 1 : t < FangBite.SNAP ? 1 - ease((t - 0.12) / (FangBite.SNAP - 0.12)) : 0;
    const A = clamp(t / 0.08) * (1 - clamp((t - D * 0.6) / (D * 0.4)));
    const gap = 3 + open * W * 0.9, flash = t >= FangBite.SNAP && t < FangBite.SNAP + 0.08;
    if (flash) s.glow(this.x, this.y, W * 2.2, P[2], 0.9);
    s.glow(this.x, this.y, W * 1.6, P[3], 0.35 * A);
    for (const upper of [true, false]) {
      const sgn = upper ? -1 : 1;
      for (let xx = -Math.ceil(W); xx <= Math.ceil(W); xx++) {
        const u = xx / W, arch = (1 - u * u) * W * 0.32;
        // the gum: a curved band, its edge toward the bite
        const edge = this.y + sgn * (gap + arch * 0.55);
        for (let d = 0; d < 3; d++) {
          const X = Math.round(this.x + xx), Y = Math.round(edge + sgn * d);
          if (keep(X, Y, A)) s.px(X, Y, flash ? P[0] : d === 0 ? P[3] : d === 1 ? P[4] : P[5]);
        }
        // the teeth: a small fang every 3 px, a great canine at each side
        const canine = Math.abs(Math.abs(u) - 0.72) < 0.08, tooth = Math.abs(xx) % 3 === 1 || canine;
        if (!tooth) continue;
        const len = canine ? Math.max(3, W * 0.42) : 2 + ((xx + 40) % 2);
        for (let d = 1; d <= len; d++) {
          const X = Math.round(this.x + xx), Y = Math.round(edge - sgn * d), tip = d === Math.round(len);
          if (keep(X, Y, A)) s.px(X, Y, flash ? P[0] : tip ? P[1] : canine && d < len * 0.5 ? P[2] : P[1]);
          if (canine && d < len - 1) {
            const X2 = X + (u > 0 ? -1 : 1);
            if (keep(X2, Y, A)) s.px(X2, Y, P[3]);
          }
        }
      }
    }
  }
}
