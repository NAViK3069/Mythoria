import type { Footprint } from './meadowMap';

/**
 * Click-to-move pathfinding (ADR 0015): a walkability grid built once per map from the SAME collision the
 * walking uses (the ground test + the footprint outlines pushed against the player's oval feet), A* on it
 * (8-way, no cutting corners), then the path pulled tight (line-of-sight shortcuts) into a few waypoints.
 */

/** Grid cell size, world px. */
export const NAV_CELL = 4;

export interface NavOptions {
  /** The map's size in px. */
  width: number;
  height: number;
  /** Walkable ground at a point (inside the map, not water). */
  ground: (x: number, y: number) => boolean;
  /** Everything that blocks the feet. */
  feet: readonly Footprint[];
  /** The player's feet: an oval of these half sizes. */
  footRx: number;
  footRy: number;
  /** Extra room kept from outlines (px), so a path doesn't brush every trunk it passes. */
  pad?: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Push a circle (centre px, py, radius r) out of an outline, in a space where y is stretched by k.
 * Returns where the centre has to go, or null if it doesn't touch. (The walking's collision.)
 */
export function pushOut(poly: number[], px: number, py: number, r: number, k: number): [number, number] | null {
  let inside = false;
  let best = Infinity, qx = 0, qy = 0;
  const n = poly.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = poly[j], ay = poly[j + 1] * k, bx = poly[i], by = poly[i + 1] * k;
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const cx = ax + dx * t, cy = ay + dy * t;
    const d = (px - cx) ** 2 + (py - cy) ** 2;
    if (d < best) (best = d), (qx = cx), (qy = cy);
  }
  const d = Math.sqrt(best);
  if (!inside && d >= r) return null;
  if (d < 1e-6) return [qx, qy + r];
  // inside: out through the nearest edge; outside but too close: back off to r
  const s = inside ? -1 : 1;
  return [qx + ((px - qx) / d) * r * s, qy + ((py - qy) / d) * r * s];
}

const SQRT2 = Math.SQRT2;
// the 8 neighbours: dx, dy
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  /** 1 = blocked. */
  private readonly blocked: Uint8Array;
  /** Which connected patch of ground each free cell is on (0 = blocked), to know at once what can be reached. */
  private readonly region: Int32Array;
  // A* scratch, reused every search
  private readonly g: Float32Array;
  private readonly from: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private stamp = 0;
  // the open list (a binary heap; a cell may sit in it more than once, so it grows when it has to)
  private heap: Int32Array;
  private heapF: Float32Array;

  constructor(opts: NavOptions) {
    const C = NAV_CELL;
    const cols = (this.cols = Math.ceil(opts.width / C));
    const rows = (this.rows = Math.ceil(opts.height / C));
    const n = cols * rows;
    const b = (this.blocked = new Uint8Array(n));
    const pad = opts.pad ?? 1.5;
    // the ground (and water): a cell is walkable if its centre and the points round it are
    const e = 1.5;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * C, y = (r + 0.5) * C;
        if (!opts.ground(x, y) || !opts.ground(x - e, y) || !opts.ground(x + e, y) || !opts.ground(x, y - e) || !opts.ground(x, y + e))
          b[r * cols + c] = 1;
      }
    // the outlines: a cell is blocked where the feet (an oval, made a circle by stretching y) would touch one
    const K = opts.footRx / opts.footRy;
    const R = opts.footRx + pad;
    const RY = R / K;
    for (const f of opts.feet) {
      const c0 = Math.max(0, Math.floor((f.x - f.hw - R) / C)), c1 = Math.min(cols - 1, Math.floor((f.x + f.hw + R) / C));
      const r0 = Math.max(0, Math.floor((f.y - f.hd - RY) / C)), r1 = Math.min(rows - 1, Math.floor((f.y + f.hd + RY) / C));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const i = r * cols + c;
          if (b[i]) continue;
          if (pushOut(f.poly, (c + 0.5) * C, (r + 0.5) * C * K, R, K)) b[i] = 1;
        }
    }
    // patches of connected ground (8-way, no corner cutting - the same moves A* makes)
    const region = (this.region = new Int32Array(n));
    const stack = new Int32Array(n);
    let id = 0;
    for (let s = 0; s < n; s++) {
      if (b[s] || region[s]) continue;
      id++;
      let top = 0;
      stack[top++] = s;
      region[s] = id;
      while (top) {
        const i = stack[--top];
        const c = i % cols, r = (i - c) / cols;
        for (let k = 0; k < 8; k++) {
          const j = this.step(c, r, k);
          if (j >= 0 && !region[j]) (region[j] = id), (stack[top++] = j);
        }
      }
    }
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(1024);
    this.heapF = new Float32Array(1024);
  }

  /** The cell a move k from (c, r) lands on, or -1 if it can't be made (off the grid, blocked, or cutting a corner). */
  private step(c: number, r: number, k: number): number {
    const nc = c + DX[k], nr = r + DY[k];
    if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) return -1;
    const b = this.blocked, cols = this.cols;
    if (b[nr * cols + nc]) return -1;
    if (k >= 4 && (b[r * cols + nc] || b[nr * cols + c])) return -1;
    return nr * cols + nc;
  }

  private cellOf(x: number, y: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x / NAV_CELL)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor(y / NAV_CELL)));
    return r * this.cols + c;
  }

  private centre(i: number): Point {
    const c = i % this.cols;
    return { x: (c + 0.5) * NAV_CELL, y: ((i - c) / this.cols + 0.5) * NAV_CELL };
  }

  /** Can the feet stand at this point? */
  free(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.cols * NAV_CELL || y >= this.rows * NAV_CELL) return false;
    return !this.blocked[this.cellOf(x, y)];
  }

  /**
   * The free cell nearest to (x, y) - on patch `region` if given (0 = any) - searching out ring by ring
   * up to `maxR` cells. -1 if none.
   */
  private nearest(x: number, y: number, region: number, maxR: number): number {
    const cols = this.cols, rows = this.rows;
    const fc = x / NAV_CELL - 0.5, fr = y / NAV_CELL - 0.5;
    const c0 = Math.round(fc), r0 = Math.round(fr);
    let best = -1, bestD = Infinity;
    for (let R = 0; R <= maxR; R++) {
      // every cell in a later ring is at least (R - 1) cells away
      if (best >= 0 && (R - 1) * (R - 1) > bestD) break;
      for (let r = r0 - R; r <= r0 + R; r++) {
        if (r < 0 || r >= rows) continue;
        const edge = r === r0 - R || r === r0 + R;
        for (let c = c0 - R; c <= c0 + R; c += edge ? 1 : 2 * R || 1) {
          if (c < 0 || c >= cols) continue;
          const i = r * cols + c;
          if (this.blocked[i] || (region && this.region[i] !== region)) continue;
          const d = (c - fc) ** 2 + (r - fr) ** 2;
          if (d < bestD) (bestD = d), (best = i);
        }
      }
    }
    return best;
  }

  /** The patch of ground at (x, y), or of the nearest free cell within `maxR` cells (0 = none). */
  regionAt(x: number, y: number, maxR = 6): number {
    let i = this.cellOf(x, y);
    if (this.blocked[i]) i = this.nearest(x, y, 0, maxR);
    return i < 0 ? 0 : this.region[i];
  }

  /** The middle of the free cell nearest to (x, y) within `maxR` cells, on patch `region` if given; null if none. */
  nearestFree(x: number, y: number, maxR: number, region = 0): Point | null {
    const i = this.nearest(x, y, region, maxR);
    return i < 0 ? null : this.centre(i);
  }

  /** Is the straight walk from a to b clear of blocked cells (checked every px)? */
  clear(ax: number, ay: number, bx: number, by: number): boolean {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      if (this.blocked[this.cellOf(ax + (bx - ax) * t, ay + (by - ay) * t)]) return false;
    }
    return true;
  }

  /**
   * The way from (sx, sy) to (tx, ty): waypoints to walk through, the last one where you end up - the
   * target itself, or the nearest point to it you can reach (a click on a house stops at its wall, one
   * on a pond at its bank). Empty if there's nowhere to go.
   */
  find(sx: number, sy: number, tx: number, ty: number): Point[] {
    const reach = Math.max(this.cols, this.rows);
    // standing in a padded cell (brushing a trunk): start from the nearest free one
    let s = this.cellOf(sx, sy);
    if (this.blocked[s]) s = this.nearest(sx, sy, 0, 6);
    if (s < 0) return [];
    const region = this.region[s];
    let t = this.cellOf(tx, ty);
    let end: Point = { x: tx, y: ty };
    if (this.blocked[t] || this.region[t] !== region) {
      t = this.nearest(tx, ty, region, reach);
      if (t < 0) return [];
      end = this.centre(t);
    }
    // straight there: no search needed
    if (this.clear(sx, sy, end.x, end.y)) return [end];
    const cells = this.astar(s, t);
    if (!cells) return [end];
    // pull the path tight: from each corner, go as far along it as can be seen in a straight line
    const out: Point[] = [];
    let ax = sx, ay = sy;
    // the first cell may be off to the side if we started padded: walk to it first
    if (this.blocked[this.cellOf(sx, sy)]) {
      const p = this.centre(cells[0]);
      out.push(p);
      (ax = p.x), (ay = p.y);
    }
    let last = this.centre(cells[0]);
    for (let k = 1; k < cells.length; k++) {
      const p = k === cells.length - 1 ? end : this.centre(cells[k]);
      if (!this.clear(ax, ay, p.x, p.y)) {
        out.push(last);
        (ax = last.x), (ay = last.y);
      }
      last = p;
    }
    out.push(end);
    return out;
  }

  /** A* from cell s to cell t (same patch). The cells along the way, s first, t last. */
  private astar(s: number, t: number): number[] | null {
    const cols = this.cols;
    const g = this.g, from = this.from, seen = this.seen, closed = this.closed;
    let heap = this.heap, hf = this.heapF;
    const st = ++this.stamp;
    const tc = t % cols, tr = (t - tc) / cols;
    // octile distance, nudged up a hair so ties go to cells nearer the goal (fewer cells opened)
    const h = (i: number) => {
      const c = i % cols, r = (i - c) / cols;
      const dx = Math.abs(c - tc), dy = Math.abs(r - tr);
      return (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)) * 1.001;
    };
    let size = 0;
    const push = (i: number, f: number) => {
      if (size === heap.length) {
        const nh = new Int32Array(size * 2), nf = new Float32Array(size * 2);
        nh.set(heap);
        nf.set(hf);
        heap = this.heap = nh;
        hf = this.heapF = nf;
      }
      let k = size++;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hf[p] <= f) break;
        heap[k] = heap[p];
        hf[k] = hf[p];
        k = p;
      }
      heap[k] = i;
      hf[k] = f;
    };
    const pop = () => {
      const top = heap[0];
      const li = heap[--size], lf = hf[size];
      let k = 0;
      for (;;) {
        let m = 2 * k + 1;
        if (m >= size) break;
        if (m + 1 < size && hf[m + 1] < hf[m]) m++;
        if (hf[m] >= lf) break;
        heap[k] = heap[m];
        hf[k] = hf[m];
        k = m;
      }
      heap[k] = li;
      hf[k] = lf;
      return top;
    };
    g[s] = 0;
    from[s] = -1;
    seen[s] = st;
    push(s, h(s));
    while (size) {
      const i = pop();
      if (closed[i] === st) continue;
      closed[i] = st;
      if (i === t) {
        const path: number[] = [];
        for (let k = t; k >= 0; k = from[k]) path.push(k);
        return path.reverse();
      }
      const c = i % cols, r = (i - c) / cols;
      for (let k = 0; k < 8; k++) {
        const j = this.step(c, r, k);
        if (j < 0 || closed[j] === st) continue;
        const ng = g[i] + (k < 4 ? 1 : SQRT2);
        if (seen[j] === st && ng >= g[j]) continue;
        seen[j] = st;
        g[j] = ng;
        from[j] = i;
        push(j, ng + h(j));
      }
    }
    return null;
  }
}
