import type { RGB, Surface } from '../surface';
import type { Pop } from './battlePops';
import { clamp, hash, keep, PAL } from './vfx';
import { blossom, petal } from './sakura';

// What a hero carries with them all through a battle, in our own pixels on fx/surface.ts - a flame in a lantern, an axe
// that smoulders and throws sparks, a lance breathing frost, a sword wreathed in blood-light, and for the great ones an
// aura of their own: a cold light and snowflakes round a Legend, blood mist and flame-spirits circling a Mythic. Quiet
// enough to live with every turn; they follow the hero (its grip, its body) wherever its moves take it.

/** What an aura needs of its hero: where its weapon hand is and which way the weapon points (world px; up = -PI/2), where
 * its feet are, how high it's off the ground. */
export interface AuraHero {
  readonly grip: { x: number; y: number; angle: number };
  /** The same for the other hand (a second blade). */
  readonly gripBack: { x: number; y: number; angle: number };
  /** Which way it faces (1 right, -1 left). */
  facing: number;
  x: number;
  y: number;
  lift: number;
}

export type AuraKind = 'lantern' | 'fireAxe' | 'frostLance' | 'frostBody' | 'bloodBlade' | 'bloodBody' | 'shadowDaggers' | 'pearlGlow' | 'crystalWand' | 'sakuraBlade' | 'sakuraBody';

const S = PAL.spirit, F = PAL.fire, I = PAL.ice, B = PAL.blood, V = PAL.violet, Wt = PAL.water, Cr = PAL.crystal;
/** The pearl on Marin's coral staff, from her hand (world px: up the staff, and back toward its other side - the same as
 * moves/marin.ts ORB_U / ORB_V). */
export const PEARL_U = 13.5;
export const PEARL_V = -3;
/** The orb on Neris's crystal wand, from her hand (world px; moves/neris.ts). */
export const WAND_U = 15;
export const WAND_V = 0;
/** From Sira's hand to the flame in her lantern (world px: it hangs BELOW her hand, carried from its ring - the lantern
 * tools/weapon_art.py draws, shown at half). */
export const LANTERN_LAMP = 6.5;

/**
 * One aura on one hero - `front` (drawn over the fighters) or the `ground` part of it (drawn under them: what lies on the
 * ground, and what passes behind the hero). Lasts while `alive()`.
 */
export class HeroAura implements Pop {
  private t = Math.random() * 10;
  constructor(private readonly hero: AuraHero, private readonly kind: AuraKind, private readonly alive: () => boolean, private readonly ground = false) {}
  get done(): boolean {
    return !this.alive();
  }
  update(dt: number): void {
    this.t += dt;
  }
  draw(s: Surface): void {
    switch (this.kind) {
      case 'lantern':
        if (!this.ground) this.lantern(s);
        break;
      case 'fireAxe':
        if (!this.ground) this.fireAxe(s);
        break;
      case 'frostLance':
        if (!this.ground) this.frostLance(s);
        break;
      case 'frostBody':
        this.frostBody(s);
        break;
      case 'bloodBlade':
        if (!this.ground) this.bloodBlade(s);
        break;
      case 'bloodBody':
        this.bloodBody(s);
        break;
      case 'shadowDaggers':
        if (!this.ground) this.shadowDaggers(s);
        break;
      case 'pearlGlow':
        if (!this.ground) this.pearlGlow(s);
        break;
      case 'crystalWand':
        if (!this.ground) this.crystalWand(s);
        break;
      case 'sakuraBlade':
        if (!this.ground) this.sakuraBlade(s);
        break;
      case 'sakuraBody':
        if (!this.ground) this.sakuraBody(s);
        break;
    }
  }

  /** Marin's pearl: a soft sea-blue light breathing round it, a glint, now and then a tiny bubble of light rising off it. */
  private pearlGlow(s: Surface): void {
    const t = this.t, p = this.on(PEARL_U, PEARL_V), k = 0.5 + 0.5 * Math.sin(t * 2.2);
    s.glow(p.x, p.y, 9 + 1.5 * k, Wt[3], 0.2 + 0.08 * k);
    s.glow(p.x, p.y, 4, Wt[1], 0.18 + 0.1 * k);
    if (Math.sin(t * 3.1) > 0.92) s.px(Math.round(p.x - 1), Math.round(p.y - 1), 0xffffff);
    for (let i = 0; i < 2; i++) {
      const q = (t * 0.45 + i * 0.5) % 1, n = Math.floor(t * 0.45 + i * 0.5);
      const X = Math.round(p.x + (hash(n, i) - 0.5) * 6 + Math.sin(t * 3 + i) * 1.2), Y = Math.round(p.y - 3 - q * 10);
      if (keep(X, Y, 0.7 * (1 - q))) s.px(X, Y, q < 0.4 ? Wt[1] : Wt[2]);
    }
  }

  /** Neris's wand: a soft crystal light round its orb and two tiny crystals floating round it, now and then a glint. */
  private crystalWand(s: Surface): void {
    const t = this.t, p = this.on(WAND_U, WAND_V), k = 0.5 + 0.5 * Math.sin(t * 2.6);
    s.glow(p.x, p.y, 8 + 1.5 * k, Cr[3], 0.2 + 0.08 * k);
    s.glow(p.x, p.y, 3.5, Cr[1], 0.2 + 0.1 * k);
    for (let i = 0; i < 2; i++) {
      const a = t * 1.8 + i * Math.PI, X = Math.round(p.x + Math.cos(a) * 7), Y = Math.round(p.y - 2 + Math.sin(a) * 3 - (i ? 3 : 0));
      if (Math.sin(a) < 0 && i === 0) continue; // (behind the orb: hidden)
      s.px(X, Y, Cr[0]);
      s.px(X, Y - 1, Cr[2]);
      s.px(X, Y + 1, Cr[3]);
    }
    if (Math.sin(t * 2.7) > 0.93) s.px(Math.round(p.x - 1), Math.round(p.y - 1), 0xffffff), s.px(Math.round(p.x - 1), Math.round(p.y - 2), Cr[1]);
  }

  /** Astraea's katana (its blade 12 to 33 px up from her hand): a pink sheen along its edge, a glint of starlight
   * running up it now and then, petals coming loose off it and drifting away. */
  private sakuraBlade(s: Surface): void {
    const t = this.t, Ks = PAL.sakura;
    for (let i = 0; i <= 4; i++) {
      const p = this.on(13 + i * 5, 0);
      s.glow(p.x, p.y, 5, Ks[3], 0.16 + 0.06 * Math.sin(t * 3 + i));
    }
    const gq = (t % 2.6) / 0.45;
    if (gq < 1) {
      const p = this.on(13 + gq * 20, 0.5);
      s.px(Math.round(p.x), Math.round(p.y), 0xffffff);
      s.glow(p.x, p.y, 4, 0xffe7a0, 0.55 * (1 - gq));
    }
    for (let i = 0; i < 3; i++) {
      const per = 1.6 + i * 0.37, q = ((t + i * 0.7) % per) / per, n = Math.floor((t + i * 0.7) / per);
      const p = this.on(14 + hash(n, i) * 18, 1);
      petal(s, p.x - this.hero.facing * q * 14 + Math.sin(t * 2 + i) * 2, p.y + q * 12 - q * q * 4, t * 2 + i, 1 - q * q);
    }
  }

  /** Astraea herself (a Mythic): petals always drifting down round her on a gentle wind, now and then a whole blossom,
   * a few stars twinkling about her and a soft pink light. */
  private sakuraBody(s: Surface): void {
    const t = this.t, x = this.hero.x, y = this.hero.y - this.hero.lift, f = this.hero.facing;
    s.glow(x, y - 16, 18, PAL.sakura[3], 0.1 + 0.03 * Math.sin(t * 2));
    for (let i = 0; i < 9; i++) {
      const per = 2.4 + hash(i, 1) * 1.6, q = ((t + i * 0.53) % per) / per, n = Math.floor((t + i * 0.53) / per);
      const px = x + (hash(n, i) - 0.5) * 34 - f * q * 10 + Math.sin(t * 1.7 + i) * 3, py = y - 38 + hash(n, i, 2) * 8 + q * 40;
      const a = Math.min(1, q * 5) * (1 - clamp((q - 0.8) / 0.2));
      if (i === 0) blossom(s, px, py, 1.2, t * 2, a * 0.9);
      else petal(s, px, py, t * (1.5 + hash(i, 3)) + i, a * 0.85);
    }
    for (let i = 0; i < 3; i++) {
      const tw = Math.sin(t * 3 + i * 2.1);
      if (tw < 0.6) continue;
      const X = Math.round(x + Math.cos(i * 2.4 + t * 0.3) * 16), Y = Math.round(y - 20 + Math.sin(i * 1.7) * 12);
      s.px(X, Y, 0xffffff), s.px(X + 1, Y, 0xffe7a0), s.px(X - 1, Y, 0xffe7a0), s.px(X, Y - 1, 0xffe7a0), s.px(X, Y + 1, 0xffe7a0);
    }
  }

  /** A point d px along the weapon from the hand (negative: back the other way). */
  private along(d: number): { x: number; y: number } {
    const g = this.hero.grip;
    return { x: g.x + Math.cos(g.angle) * d, y: g.y + Math.sin(g.angle) * d };
  }

  /** Sira's lantern: a cool blue flame burning behind its glass (always rising, however the lantern swings), its light
   * round it, specks of spirit-light drifting up out of its top. */
  private lantern(s: Surface): void {
    const t = this.t, c = this.along(-LANTERN_LAMP), fl = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3);
    s.glow(c.x, c.y, 8 * fl, S[3], 0.45);
    s.glow(c.x, c.y, 2.5, 0xffffff, 0.45 * fl);
    // the flame: a teardrop of blue fire, white at its heart, licking up and swaying
    const H = 3.2 + Math.sin(t * 9) * 0.6 + Math.sin(t * 15.7) * 0.4, base = c.y + 1.8;
    for (let r = 0; r <= H; r += 0.5) {
      const f = r / H, half = 1.1 * Math.pow(1 - f, 0.7) * (f < 0.15 ? 0.75 + f * 1.6 : 1), sway = Math.sin(t * 8 + r * 0.8) * 0.4 * f;
      for (let j = -Math.ceil(half); j <= Math.ceil(half); j++) {
        if (Math.abs(j) > half + 0.2) continue;
        const X = Math.round(c.x + j + sway), Y = Math.round(base - r);
        const edge = Math.abs(j) / Math.max(0.5, half);
        s.px(X, Y, f < 0.4 && edge < 0.5 ? 0xffffff : f < 0.7 && edge < 0.8 ? S[1] : S[3]);
      }
    }
    // specks of spirit-light rising out of the top
    for (let i = 0; i < 4; i++) {
      const q = (t * 0.7 + i / 4) % 1, X = Math.round(c.x + Math.sin(t * 2 + i * 2) * 3 * q), Y = Math.round(c.y - 7 - q * 12);
      if (keep(X, Y, 1 - q)) s.px(X, Y, q < 0.3 ? 0xffffff : S[2]);
    }
  }

  /** A point on the weapon in its own frame: u px up it from the hand, v px out to its blade's side (the side it faces). */
  private on(u: number, v: number, back = false): { x: number; y: number } {
    const g = back ? this.hero.gripBack : this.hero.grip, f = this.hero.facing;
    const dx = Math.cos(g.angle), dy = Math.sin(g.angle);
    // (the blade's side: the weapon's direction turned a quarter toward where the hero faces)
    return { x: g.x + dx * u - dy * v * f, y: g.y + dy * u + dx * v * f };
  }

  /** Kael's axe: fire hugging its CUTTING EDGE - the blade's outer curve, traced off the picture (rows 0-13: 11, 12, 13, 14,
   * 15 x6, 14, 13, 12, 11 - the edge pixels, in the hand's frame) - a white-hot line along the edge, tongues of flame
   * licking out of it and up, a red heat over the blade, embers, and now and then a spray of sparks off the edge. */
  private fireAxe(s: Surface): void {
    const t = this.t, pulse = 0.85 + 0.15 * Math.sin(t * 6);
    // the edge, top to bottom (u up the haft from the hand, v out to the blade's side; pixel centres)
    const rows = [11, 12, 13, 14, 15, 15, 15, 15, 15, 15, 14, 13, 12, 11];
    const E = rows.map((px, py) => ({ u: 18 - py - 0.5, v: px + 0.5 - 6 }));
    const mid = { u: 11, v: 4.5 }; // the blade's middle - the edge's normals point away from it
    const c = this.on(mid.u, mid.v);
    s.glow(c.x, c.y, 11 * pulse, F[4], 0.3);
    // walk the edge in small steps
    let n = 0;
    for (let i = 0; i < E.length - 1; i++)
      for (let k = 0; k < 2; k++, n++) {
        const f = k / 2, u = E[i].u + (E[i + 1].u - E[i].u) * f, v = E[i].v + (E[i + 1].v - E[i].v) * f;
        const p = this.on(u, v);
        // outward: from the blade's middle through this point (in world px), leaning up a little - fire rises
        const q = this.on(mid.u, mid.v), ox = p.x - q.x, oy = p.y - q.y, ol = Math.hypot(ox, oy) || 1;
        let dx = ox / ol, dy = oy / ol - 0.45;
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl;
        dy /= dl;
        // the edge itself, white-hot
        s.px(Math.round(p.x), Math.round(p.y), Math.sin(t * 9 + n) > 0.3 ? F[0] : F[1]);
        // a tongue of flame out of it
        const len = 1.5 + 3.5 * Math.abs(Math.sin(t * 7 + n * 0.9)) * (0.6 + 0.4 * Math.sin(n * 1.7 + t * 3));
        for (let r = 1; r <= len; r += 0.7) {
          const w = Math.sin(t * 11 + n + r) * 0.5, X = Math.round(p.x + dx * r - dy * w), Y = Math.round(p.y + dy * r + dx * w);
          const g = r / len;
          if (keep(X, Y, 0.95 - g * 0.55)) s.px(X, Y, g < 0.3 ? F[1] : g < 0.6 ? F[2] : g < 0.85 ? F[3] : F[4]);
        }
        if (n % 4 === 0) s.add(Math.round(p.x + dx * 2), Math.round(p.y + dy * 2), F[3], 0.3 * pulse);
      }
    // embers drifting up off the edge
    for (let i = 0; i < 6; i++) {
      const q = (t * 0.8 + i / 6) % 1, e = E[Math.floor(hash(i, 1) * E.length)], p = this.on(e.u, e.v);
      const X = Math.round(p.x + 1 + Math.sin(t * 3 + i) * 3 * q), Y = Math.round(p.y - 3 - q * 16);
      if (keep(X, Y, 1 - q)) s.px(X, Y, q < 0.4 ? F[1] : F[3]);
    }
    // now and then, a spray of sparks off the edge
    const cyc = t % 1.6;
    if (cyc < 0.45) {
      const n2 = Math.floor(t / 1.6), e = E[4 + Math.floor(hash(n2, 3) * 6)], o = this.on(e.u, e.v);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (hash(i, n2) - 0.5) * 2.6, v = 30 + 30 * hash(i, n2, 1);
        const X = Math.round(o.x + Math.cos(a) * v * cyc), Y = Math.round(o.y + Math.sin(a) * v * cyc + 70 * cyc * cyc);
        if (!keep(X, Y, 1 - cyc / 0.45)) continue;
        s.px(X, Y, i % 2 ? F[1] : F[2]);
        s.px(X, Y + 1, F[4]);
      }
    }
  }

  /** A snowflake at (x, y): six arms of white and pale ice (r 1 small, 2 large), its middle bright. */
  private flake(s: Surface, x: number, y: number, r: number, a: number): void {
    const X = Math.round(x), Y = Math.round(y);
    if (!keep(X, Y, a)) return;
    s.px(X, Y, 0xffffff);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) s.px(X + dx, Y + dy, I[1]);
    if (r > 1) {
      for (const [dx, dy] of [[0, -2], [0, 2], [-2, -1], [2, -1], [-2, 1], [2, 1]]) s.px(X + dx, Y + dy, I[2]);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.px(X + dx, Y + dy, I[3]);
    }
    s.add(X, Y, I[2], 0.4 * a);
  }

  /** Dravik's lance: a cold light along its blade, a glint running up it now and then, motes of frost rising off it and
   * snowflakes coming loose to drift down and away. */
  private frostLance(s: Surface): void {
    const t = this.t;
    for (let i = 0; i <= 4; i++) {
      const p = this.along(12 + i * 4.5);
      s.glow(p.x, p.y, 6, I[3], 0.16 + 0.06 * Math.sin(t * 3 + i));
    }
    // motes of frost rising off it
    for (let i = 0; i < 6; i++) {
      const q = (t * 0.6 + i / 6) % 1, p = this.along(12 + hash(i, 2) * 18);
      const X = Math.round(p.x + (hash(i, 3) - 0.5) * 6 + Math.sin(t * 2 + i) * 2 * q), Y = Math.round(p.y - q * 12);
      if (keep(X, Y, 0.9 * (1 - q))) s.px(X, Y, q < 0.3 ? 0xffffff : I[2]);
    }
    // a glint running up the blade
    const gq = (t % 2.2) / 0.5;
    if (gq < 1) {
      const p = this.along(12 + gq * 18);
      s.px(Math.round(p.x), Math.round(p.y), 0xffffff);
      s.glow(p.x, p.y, 4, I[1], 0.6 * (1 - gq));
    }
    // snowflakes coming loose, drifting down
    for (let i = 0; i < 3; i++) {
      const per = 1.4 + i * 0.41, q = ((t + i * 0.6) % per) / per, n = Math.floor((t + i * 0.6) / per);
      const p = this.along(14 + hash(n, i) * 16);
      this.flake(s, p.x + Math.sin(t * 1.5 + i) * 3 * q + (hash(n, i, 1) - 0.5) * 8 * q, p.y + q * 14, hash(n, i, 2) > 0.5 ? 2 : 1, 1 - q * q);
    }
  }

  /** Dravik himself (a Legend): a faint cold light round him, and now and then a breath of frost - a few snowflakes that
   * bloom in a soft light round him and drift down, fading. (No crystal - the owner's call.) */
  private frostBody(s: Surface): void {
    if (this.ground) return;
    const t = this.t, x = this.hero.x, y = this.hero.y, lift = this.hero.lift;
    s.glow(x, y - lift - 16, 16, I[3], 0.08 + 0.04 * Math.sin(t * 2.2));
    // a breath of frost now and then: snowflakes blooming in a soft light round him, drifting down, fading
    const per = 2.6, q = (t % per) / per, n = Math.floor(t / per);
    if (q < 0.75) {
      const u = q / 0.75;
      if (u < 0.25) s.glow(x, y - lift - 18, 14, I[2], 0.22 * (1 - u / 0.25));
      for (let i = 0; i < 5; i++) {
        const fx = x + (hash(n, i) - 0.5) * 26, fy = y - lift - 8 - hash(n, i, 1) * 22 + u * 10;
        this.flake(s, fx + Math.sin(t * 2 + i) * 2, fy, hash(n, i, 2) > 0.45 ? 2 : 1, Math.min(1, u * 6) * (1 - u * u));
      }
    }
  }

  /** Nyx's daggers (both): shadow wreathing their blades - a violet glow, dark flames licking up off their edges, sparks of
   * violet now and then (the blades: 7 to 19 px up from the hand). */
  private shadowDaggers(s: Surface): void {
    const t = this.t;
    for (const back of [false, true]) {
      for (let i = 0; i <= 3; i++) {
        const p = this.on(8 + i * 3.6, 0, back);
        s.glow(p.x, p.y, 5, V[3], 0.24 + 0.08 * Math.sin(t * 5 + i + (back ? 2 : 0)));
      }
      for (let i = 0; i < 8; i++) {
        const u = 8 + (i / 7) * 10, side = i % 2 ? 1 : -1, p = this.on(u, side * 1.6, back);
        const len = 1.5 + 3 * Math.abs(Math.sin(t * 8 + i * 1.3 + (back ? 1 : 0)));
        for (let r = 0; r < len; r++) {
          const X = Math.round(p.x + Math.sin(t * 10 + i + r) * 0.5), Y = Math.round(p.y - r);
          const f = r / len;
          if (keep(X, Y, 0.8 - f * 0.5)) s.px(X, Y, f < 0.3 ? V[2] : f < 0.7 ? 0x5a2ab0 : 0x1e0a3a);
        }
      }
      for (let i = 0; i < 3; i++) {
        const q = (t * 0.7 + i / 3 + (back ? 0.5 : 0)) % 1, p = this.on(9 + hash(i, back ? 9 : 8) * 9, 0, back);
        const X = Math.round(p.x + Math.sin(t * 3 + i) * 2 * q), Y = Math.round(p.y - q * 12);
        if (keep(X, Y, 1 - q)) s.px(X, Y, q < 0.3 ? V[1] : V[3]);
      }
    }
  }

  /** Valdris's sword: wreathed in blood-light - a crimson glow along the blade, flames of dark red licking up off its edges,
   * drops of red light drifting up from it. */
  private bloodBlade(s: Surface): void {
    const t = this.t, g = this.hero.grip, nx = -Math.sin(g.angle), ny = Math.cos(g.angle);
    for (let i = 0; i <= 5; i++) {
      const p = this.along(8 + i * 4.6);
      s.glow(p.x, p.y, 6, B[3], 0.26 + 0.08 * Math.sin(t * 5 + i));
    }
    for (let i = 0; i < 12; i++) {
      const d = 8 + (i / 11) * 23, p = this.along(d), side = i % 2 ? 1 : -1;
      const len = 2 + 3 * Math.abs(Math.sin(t * 8 + i * 1.3));
      for (let r = 0; r < len; r++) {
        const X = Math.round(p.x + nx * side * (2 + r * 0.4) + Math.sin(t * 10 + i + r) * 0.5), Y = Math.round(p.y + ny * side * (2 + r * 0.4) - r);
        const f = r / len;
        if (keep(X, Y, 0.8 - f * 0.5)) s.px(X, Y, f < 0.3 ? B[2] : f < 0.7 ? B[3] : 0x4a0618);
      }
    }
    for (let i = 0; i < 5; i++) {
      const q = (t * 0.6 + i / 5) % 1, p = this.along(10 + hash(i, 4) * 20), X = Math.round(p.x + Math.sin(t * 2 + i) * 3 * q), Y = Math.round(p.y - q * 16);
      if (keep(X, Y, 1 - q)) s.px(X, Y, q < 0.3 ? B[1] : B[3]);
    }
  }

  /** Valdris himself (a Mythic): a blood-red aura, a crimson mist low on the ground round him, and three flame-spirits of
   * blood circling him (behind him on the ground layer, in front of him on the front one). */
  private bloodBody(s: Surface): void {
    const t = this.t, x = this.hero.x, y = this.hero.y, bodyY = y - this.hero.lift - 16;
    if (this.ground) {
      // the mist low round his feet
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + t * 0.4, r = 12 + Math.sin(t * 1.3 + i) * 2;
        const mx = x + Math.cos(a) * r, my = y + Math.sin(a) * r * 0.34, R = 2.5 + Math.sin(t * 2 + i * 1.7);
        for (let yy = Math.floor(my - R); yy <= Math.ceil(my + R); yy++)
          for (let xx = Math.floor(mx - R); xx <= Math.ceil(mx + R); xx++) {
            const d = Math.hypot(xx - mx, yy - my) / R;
            if (d <= 1 && keep(xx, yy, 0.45 * (1 - d * d))) s.px(xx, yy, d < 0.5 ? 0x7a0a24 : 0x3a0414);
          }
      }
      s.glow(x, y, 16, B[4], 0.25, 0.34);
    } else {
      s.glow(x, bodyY, 22, B[4], 0.22 + 0.07 * Math.sin(t * 2.4));
      s.glow(x, bodyY + 4, 12, B[3], 0.1 + 0.05 * Math.sin(t * 3.1));
      // embers of blood-light rising off him
      for (let i = 0; i < 6; i++) {
        const q = (t * 0.5 + i / 6) % 1, X = Math.round(x + (hash(i, 7) - 0.5) * 18 + Math.sin(t * 2 + i) * 2 * q), Y = Math.round(y - 4 - q * 34);
        if (keep(X, Y, 0.9 * (1 - q))) s.px(X, Y, q < 0.3 ? B[1] : B[3]);
      }
    }
    // the flame-spirits circling his waist - all on the front layer (the ground layer lies under the field's grass and
    // flowers, so a spirit passing behind him there was lost behind them); one behind him is hidden only where his body
    // stands in front of it
    if (this.ground) return;
    const lift = this.hero.lift, behind = (X: number, Y: number) => Math.abs(X - x) <= 7 && Y >= y - lift - 30 && Y <= y - lift;
    for (let i = 0; i < 3; i++) {
      const ang = t * 1.9 + (i / 3) * Math.PI * 2, front = Math.sin(ang) > 0;
      const R = 16, cy = y - lift - 9 + Math.sin(t * 2.3 + i * 2) * 1.5;
      // a flame-spirit: a bright head, a tongue of blood-fire streaming back and up behind it
      const dot = (X: number, Y: number, c: RGB) => {
        if (!front && behind(X, Y)) return;
        s.px(X, Y, c);
      };
      for (let j = 10; j >= 0; j--) {
        const a = ang - j * 0.11, X = Math.round(x + Math.cos(a) * R), Y = Math.round(cy + Math.sin(a) * R * 0.34 - j * 0.35 + Math.sin(t * 12 + j) * 0.6);
        if (!keep(X, Y, 1 - j / 11)) continue;
        const c: RGB = j === 0 ? 0xffe8ee : j < 3 ? B[1] : j < 6 ? B[2] : j < 8 ? B[3] : 0x5a0820;
        dot(X, Y, c);
        if (j < 6) dot(X, Y - 1, j < 2 ? 0xffffff : B[2]);
        if (j < 3) dot(X + 1, Y, B[2]), dot(X - 1, Y, B[3]);
      }
      const hx = x + Math.cos(ang) * R, hy = cy + Math.sin(ang) * R * 0.34;
      // (its light softer while it passes right in front of him - his face stays clear - and behind him)
      const near = clamp(Math.abs(Math.cos(ang)) / 0.5);
      // behind him: its light only where it isn't behind his body (none of it spills over him), fading as it goes in
      const clear = clamp((Math.abs(hx - x) - 7) / 6);
      const k = front ? 0.4 + 0.6 * near : clear;
      if (k <= 0) continue;
      s.glow(hx, hy, 7, B[3], 0.6 * k);
      s.glow(hx, hy, 3, 0xffd8e0, 0.5 * k);
    }
  }
}
