import * as Phaser from 'phaser';
import { MasterCharacter } from './MasterCharacter';
import { insideFeet, waterAt, type Footprint, type MeadowMap } from './meadowMap';
import { NPC_PLACES, NPCS, type NpcDef, type NpcPlace } from './npcData';
import type { MapId } from './maps';

/** How close (px, feet to feet) you have to be to talk. */
export const TALK_RANGE = 26;

export interface Npc {
  def: NpcDef;
  body: MasterCharacter;
  /** Where it stands, and the way it faces when nobody's about. */
  x: number;
  y: number;
  rest: 1 | -1;
  /** Where it blocks (a small oval round its feet). */
  foot: Footprint;
  /** Its name over its head (HTML, so Thai stays sharp). */
  tag: HTMLButtonElement;
}

const FOOT = { rx: 5.5, ry: 2.6 };

/**
 * The people on this map: built like the hero (head, body, legs, floating hands - MasterCharacter with
 * their own look), standing in front of the shops and the places that matter, idling the way the hero does
 * (breathing, a tilt of the head, hands drifting). They turn to you when you come near, you can't walk
 * through them, and their names float over their heads; talk to them with E or by tapping them.
 */
export class Npcs {
  readonly list: Npc[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    map: MeadowMap,
    feet: Footprint[],
    onTap: (n: Npc) => void,
  ) {
    const blocked = (x: number, y: number) =>
      x < 12 || y < 16 || x > map.cols * 16 - 12 || y > map.rows * 16 - 8 || waterAt(map, x, y) > 0.3 ||
      insideFeet(feet, x, y) || insideFeet(feet, x - 6, y) || insideFeet(feet, x + 6, y) || insideFeet(feet, x, y - 3) || insideFeet(feet, x, y + 3);
    const ui = document.getElementById('ui');
    for (const p of placesFor(map)) {
      const def = NPCS[p.id];
      if (!def) continue;
      const at = nearestFree(p.x, p.y, (x, y) => blocked(x, y) || this.list.some((n) => Math.hypot(n.x - x, (n.y - y) * 1.6) < 16));
      const look = (part: string) => `npcs#${def.look}_${part}`;
      const body = new MasterCharacter(scene, at.x, at.y, { head: look('head'), body: look('body'), legL: look('leg_l'), legR: look('leg_r') });
      body.facing = p.facing ?? 1;
      // a little out of step with each other
      body.skip(Math.random() * 3);
      body.update(0);
      const tag = document.createElement('button');
      tag.className = 'npc-tag';
      tag.innerHTML = `<span class="nt-bubble"></span><span class="nt-name"></span>`;
      (tag.lastChild as HTMLElement).textContent = def.name;
      tag.title = `คุยกับ${def.name}`;
      ui?.prepend(tag); // under the menus
      const npc: Npc = { def, body, x: at.x, y: at.y, rest: body.facing, foot: oval(at.x, at.y), tag };
      tag.addEventListener('click', () => onTap(npc));
      this.list.push(npc);
    }
    scene.events.once('shutdown', () => this.list.forEach((n) => n.tag.remove()));
  }

  /** Their footprints, to walk round. */
  get feet(): Footprint[] {
    return this.list.map((n) => n.foot);
  }

  /** The one you're close enough to talk to (the nearest), if any. */
  near(px: number, py: number): Npc | null {
    let best: Npc | null = null, bd = TALK_RANGE;
    for (const n of this.list) {
      const d = Math.hypot(n.x - px, (n.y - py) * 1.4);
      if (d < bd) (best = n), (bd = d);
    }
    return best;
  }

  /** Whose body is at a point on the map (a tap on them), if anyone's. */
  at(x: number, y: number): Npc | null {
    return this.list.find((n) => Math.abs(x - n.x) < 9 && y < n.y + 3 && y > n.y - 30) ?? null;
  }

  update(dt: number, px: number, py: number, sort: (x: number, y: number, w: number, h: number) => number): void {
    const v = this.scene.cameras.main.worldView;
    for (const n of this.list) {
      const seen = n.x > v.x - 40 && n.x < v.right + 40 && n.y > v.y - 10 && n.y < v.bottom + 50;
      n.body.setVisible(seen);
      if (!seen) continue;
      // they look at you when you're near, and back the way they were when you've gone
      const d = Math.hypot(px - n.x, py - n.y);
      n.body.facing = d < 64 && Math.abs(px - n.x) > 2 ? (px < n.x ? -1 : 1) : n.rest;
      n.body.update(dt);
      n.body.root.setDepth(sort(n.x, n.y, 16, 30));
    }
  }

  /** Pin each name over its head (called once the camera has moved this frame). */
  placeTags(cam: Phaser.Cameras.Scene2D.Camera, k: number, hidden: boolean): void {
    const v = cam.worldView;
    for (const n of this.list) {
      const on = !hidden && n.x > v.x - 20 && n.x < v.right + 20 && n.y > v.y && n.y - 34 < v.bottom;
      n.tag.classList.toggle('show', on);
      if (on) n.tag.style.transform = `translate3d(${((n.x - v.x) * k).toFixed(1)}px, ${((n.y - 33 - v.y) * k).toFixed(1)}px, 0)`;
    }
  }
}

/** Where everyone stands on this map. */
function placesFor(map: MeadowMap): NpcPlace[] {
  const places = [...(NPC_PLACES[map.id as MapId] ?? [])];
  if (map.id === 'meadow') {
    const camp = map.fires.find((f) => f.kind === 'campfire');
    if (camp) places.push({ id: 'adventurer', x: camp.x + 26, y: camp.y + 4, facing: -1 });
    const house = map.objects.find((o) => o.kind === 'house');
    if (house) places.push({ id: 'villager', x: house.x + 4, y: house.y + 26, facing: 1 });
  }
  return places;
}

/** The free spot nearest to (x, y), looking outward in rings. */
function nearestFree(x: number, y: number, blocked: (x: number, y: number) => boolean): { x: number; y: number } {
  if (!blocked(x, y)) return { x, y };
  for (let r = 3; r < 80; r += 3)
    for (let a = 0; a < 16; a++) {
      const tx = x + Math.cos((a / 16) * Math.PI * 2) * r, ty = y + Math.sin((a / 16) * Math.PI * 2) * r * 0.7;
      if (!blocked(tx, ty)) return { x: tx, y: ty };
    }
  return { x, y };
}

function oval(x: number, y: number): Footprint {
  const poly: number[] = [];
  for (let i = 0; i < 10; i++) poly.push(x + Math.cos((i / 10) * Math.PI * 2) * FOOT.rx, y - 1 + Math.sin((i / 10) * Math.PI * 2) * FOOT.ry);
  return { x, y: y - 1, hw: FOOT.rx, hd: FOOT.ry, poly, front: y - 1 + FOOT.ry };
}
