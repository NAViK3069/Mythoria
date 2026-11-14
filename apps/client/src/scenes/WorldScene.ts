import * as Phaser from 'phaser';
import { Controls } from '../input/Controls';
import { MoveMarkers } from '../world/MoveMarker';
import { createHud, type Hud } from '../ui/Hud';
import { Ambience } from '../world/Ambience';
import { Critters } from '../world/Critters';
import { Animals } from '../world/Animals';
import { Npcs, type Npc } from '../world/Npcs';
import { Monsters, type Monster } from '../world/Monsters';
import { monsterPrompt, setFight, showMonster } from '../ui/panels/monster';
import type { BattleData } from './BattleScene';
import { playTransition } from '../ui/transition';
import { FARM, FIELD_FIGHT, MAP_SPAWNS, encounterOf } from '@mythoria/game-data';
import { autoFight, farm, farmWants, setupFarm, stopFarm } from '../ui/farm';
import type { Battle } from '@mythoria/combat';
import { closePanel } from '../ui/Modal';
import { swordCursor } from '../ui/cursor';
import { drawOutline } from '../world/outline';
import { closeTalk, openTalk, talkOpen, talkPrompt } from '../ui/talk';
import { Warps } from '../world/Warps';
import { uiBlocking } from '../ui/Modal';
import { openWarpPanel, setWarpContext, warpPrompt } from '../ui/warp';
import { doorPrompt, useDoor } from '../ui/door';
import { MAPS, START_MAP, travelFrom, type MapId } from '../world/maps';
import { MINIMAP_SCALE } from '../world/minimap';
import { MasterCharacter } from '../world/MasterCharacter';
import { MeadowView } from '../world/MeadowView';
import { renderMinimap } from '../world/minimap';
import { BEYOND, TILE, waterAt, type Door, type Footprint, type MeadowMap, type ShapeOf } from '../world/meadowMap';
import { NAV_CELL, NavGrid, pushOut, type Point } from '../world/pathfind';
import { clearPlace, flushSave, onChange, player, savePlace, type SavedPlace } from '../ui/store';
import { Follower } from '../world/Follower';
import { toast } from '../ui/dom';
import { fitTeam, wakeFallen } from '../ui/vitals';
import { BattleLayer } from '../fx/BattleLayer';
import { FieldFight, type FieldEnd } from '../world/FieldFight';
import { Opener } from '../world/Opener';
import { hideFightBar, showFightBar } from '../ui/fieldFight';
import { changed } from '../ui/store';

/** The textures that exist when the world first starts (art loaded at boot); everything else is per map. */
let bootTextures: Set<string> | null = null;

const SPEED = 92; // px/s
/** The player's own footprint: an ellipse under the body, as wide as the body (13 px). */
const FOOT_RX = 6;
const FOOT_RY = 3;
/** How far above the feet the name plate floats (world px; the character is 32 px tall). */
const NAME_HEIGHT = 33;
/** While the target keeps moving (mouse held, a monster walking off), plan again at most this often (s). */
const REPLAN_EVERY = 0.2;
/** While walking, save where you are at most this often (s); stopping saves at once. */
const SAVE_EVERY = 1;
/** A saved spot that's now blocked (art moved, a prop put there) is moved to a free one at most this far (grid cells). */
const NUDGE_CELLS = 8;
/** Coming back to the saved spot after longer than this (ms) counts as arriving: the area's name pops up again. */
const ANNOUNCE_AFTER = 10 * 60 * 1000;

/** The world: walk the master character round a map (the town, the meadow, ...); warp pads travel between them. */
export class WorldScene extends Phaser.Scene {
  private map!: MeadowMap;
  private feet: Footprint[] = [];
  private view!: MeadowView;
  private ambience!: Ambience;
  private critters!: Critters;
  private animals!: Animals;
  private npcs!: Npcs;
  /** Who the hero is close enough to talk to, and who they're walking over to talk to. */
  private npcHere: Npc | null = null;
  private talkTo: Npc | null = null;
  private monsters!: Monsters;
  /** The monster the hero stands by, and the one they're walking over to. */
  private monHere: Monster | null = null;
  private lookAt: Monster | null = null;
  /** The one whose card is open: it keeps still meanwhile. */
  private inspected: Monster | null = null;
  /** Off fighting (the map sleeps meanwhile). */
  private battling = false;
  /** A fight on the map (world/FieldFight.ts), and the pixel layer its numbers / the notice pins draw on. */
  private fight: FieldFight | null = null;
  /** The opening blow on the map before the turn-based screen (world/Opener.ts). */
  private opener: Opener | null = null;
  private fx!: BattleLayer;
  /** Auto-farm's current quarry (ui/farm.ts), and when it last looked for one (scene s). */
  private farmMon: Monster | null = null;
  /** The monster under the mouse (sword cursor, white-red outline), and the one you clicked to fight. */
  private hoverMon: Monster | null = null;
  private goFight: Monster | null = null;
  /** Is the mouse over the map itself (not over a menu on top of it)? */
  private overMap = false;
  private farmLook = -1;
  /** The team leader, walking behind the master (world/Follower.ts). */
  private follower!: Follower;
  private warpWas = false;
  private warps!: Warps;
  /** The warp pad the hero stands on. */
  private padHere: string | null = null;
  /** The pad under the hero's feet, warping or not (undefined until the first frame: landing on a pad by warp
   * doesn't count as stepping onto it). Stepping onto one opens the warp panel by itself. */
  private padRaw: string | null | undefined = undefined;
  /** The door the hero stands at. */
  private door: Door | null = null;
  private mapId: MapId = START_MAP;
  private master!: MasterCharacter;
  private controls!: Controls;
  private markers!: MoveMarkers;
  private hud!: Hud;
  /** Where the feet can go, for finding a way round things to a clicked spot (world/pathfind.ts). */
  private nav!: NavGrid;
  /** The way to the click target: waypoints, the last one where you end up. */
  private route: Point[] = [];
  /** The target the route was planned for, and when (scene seconds). */
  private routeFor: Point | null = null;
  private plannedAt = -1;
  /** How long the hero has been stuck on the way (s), and how many times the way was planned again for it. */
  private stuck = 0;
  private replans = 0;
  /** What was last saved of where the hero stands (and when, scene seconds). */
  private saved: { x: number; y: number; facing: 1 | -1; t: number } | null = null;
  /** Starting over on another map before this one was set up (a bad saved spot): don't update meanwhile. */
  private leaving = false;

  constructor() {
    super('World');
  }

  create(data: { map?: MapId; arrive?: string } = {}): void {
    // A clean start each time the scene starts on a map: drop the last map's textures, reset its state.
    if (!bootTextures) bootTextures = new Set(this.textures.getTextureKeys());
    // (a battle's arena keeps its own, 'bt:...')
    else for (const k of this.textures.getTextureKeys()) if (!bootTextures.has(k) && !k.startsWith('bt:')) this.textures.remove(k);
    this.padHere = null;
    this.padRaw = undefined;
    this.door = null;
    this.leaving = false;
    // Starting the game (not travelling): back to the map and spot saved last time, if that map still exists.
    let place: SavedPlace | undefined = data.map ? undefined : player.place;
    if (place && !(place.map in MAPS)) (place = undefined), clearPlace();
    this.mapId = data.map ?? (place?.map as MapId | undefined) ?? START_MAP;
    const def = MAPS[this.mapId];
    this.map = def.build(this.shapeReader());
    const arriving = data.arrive ? this.map.warps.find((w) => w.id === data.arrive) : undefined;
    let start: Point = arriving ? { x: arriving.x, y: arriving.y + 1 } : place ?? this.map.spawn;
    // Bushes are soft: you walk through them (they rustle), like mushrooms and flowers.
    this.feet = this.map.objects.flatMap((o) => (o.foot && o.kind !== 'bush' ? [o.foot] : []));
    if (new URLSearchParams(location.search).has('hitboxes')) this.time.delayedCall(0, () => this.drawHitboxes());
    this.view = new MeadowView(this, this.map);

    this.master = new MasterCharacter(this, start.x, start.y);
    this.master.walkSpeed = SPEED;
    this.hud = createHud(() => this.game.loop.actualFps);
    this.master.onStep = (x, y) => {
      this.dust(x, y);
      this.hud.step();
    };

    this.ambience = new Ambience(this, this.map);
    for (const f of this.ambience.followers) this.view.follow(f.owner, f.image, f.offset);
    this.warps = new Warps(this, this.map.warps);
    // came by warp from another map: land on the pad (the veil is still over the screen)
    if (arriving)
      this.warps.arrive(this.master, arriving, {
        hide: () => this.hud.nameVisible(false),
        show: () => this.hud.nameVisible(true),
        done: () => (this.padHere = null),
      });
    this.critters = new Critters(this, this.map.butterflies, this.map.flowers, (x, y) => this.ground(x, y));
    // the people: they stand where they stand (nobody walks through them, animals included)
    this.npcs = new Npcs(this, this.map, this.feet, (n) => this.approach(n));
    this.feet.push(...this.npcs.feet);
    // the walkability grid for click-to-move: the same tests the walking makes (ground + footprints)
    this.nav = new NavGrid({
      width: this.map.cols * TILE,
      height: this.map.rows * TILE,
      ground: (x, y) => this.ground(x, y),
      feet: this.feet,
      footRx: FOOT_RX,
      footRy: FOOT_RY,
    });
    this.route = [];
    this.routeFor = null;
    this.saved = null;
    if (place) {
      // the saved spot must still be walkable (or nearly: then it moves to the nearest free spot); if not, the town
      const at = this.restorePlace(place);
      if (!at) {
        clearPlace();
        if (this.mapId !== START_MAP) {
          // (the saved map is fine but the spot isn't: start again, in the town)
          this.leaving = true;
          this.scene.restart({});
          return;
        }
        start = this.map.spawn;
      } else {
        start = at;
        this.master.facing = place.facing;
      }
      this.master.x = start.x;
      this.master.y = start.y;
      this.master.update(0);
      // (moved: that's the new saved spot; the same: nothing to write)
      if (at && at.x === place.x && at.y === place.y) this.saved = { x: at.x, y: at.y, facing: place.facing, t: 0 };
      else this.keepPlace(true);
    } else if (data.map) {
      // came here from another map: this is where you are now (saved under the veil - the landing is still to come)
      savePlace(this.mapId, start.x, start.y, this.master.facing);
      this.saved = { x: start.x, y: start.y, facing: this.master.facing, t: 0 };
    }
    // the team leader walks behind you (it changes when the team or its leader does)
    this.follower = new Follower(this, (x, y) => this.view.depthFor(x, y, 16, 30));
    const leader = () => player.teams[player.activeTeam]?.leader ?? null;
    this.follower.set(leader(), start.x, start.y, this.master.facing);
    // (came by warp: it lands with you, after the veil)
    if (arriving) this.follower.setHidden(true);
    this.warpWas = !!arriving;
    const offLeader = onChange(() => this.follower.set(leader(), this.master.x, this.master.y, this.master.facing));
    this.events.once('shutdown', () => (offLeader(), this.follower.destroy()));
    this.animals = new Animals(this, this.map, (x, y) => this.ground(x, y), (x, y, w, h) => this.view.depthFor(x, y, w, h), this.npcs.feet);
    this.monsters = new Monsters(this, this.map, (x, y) => this.ground(x, y), this.feet, (mo) => this.approachMonster(mo));
    // auto-farm (none in the town): the button, its list drawn with each monster's own picture
    this.farmMon = null;
    setupFarm(this.mapId, (look) => this.monsterPic(look));
    this.monHere = this.lookAt = this.inspected = null;
    this.battling = false;
    setFight(null);
    // tapping someone walks you over to talk to them (a monster: to look at it)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const n = this.npcs.at(p.worldX, p.worldY);
      if (n) return this.approach(n);
      const mo = this.monsters.at(p.worldX, p.worldY);
      if (mo) this.approachMonster(mo);
    });
    // the page going away (refresh, closed, sent to the background): save where you are now
    const onHide = () => {
      if (document.visibilityState === 'hidden') this.keepPlace(true);
    };
    const onPageHide = () => this.keepPlace(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    });
    // the map's own pixel-effect layer: the monsters' notice pins, a fight's numbers and bars (made once the camera is
    // set up, below)
    this.fight = null;
    this.opener = null;
    const canvas = this.game.canvas;
    const onMove = (e: PointerEvent) => (this.overMap = e.pointerType === 'mouse' && e.target === canvas);
    const onOut = () => (this.overMap = false);
    window.addEventListener('pointermove', onMove);
    document.addEventListener('mouseleave', onOut);
    this.hoverMon = this.goFight = null;
    this.events.once('shutdown', () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseleave', onOut);
      swordCursor(false);
    });
    this.events.once('shutdown', () => {
      this.fight?.stop();
      this.fight = null;
      hideFightBar();
      this.fx?.destroy();
    });
    this.events.once('shutdown', () => {
      closeTalk();
      talkPrompt(null);
      monsterPrompt(null);
    });

    this.markers = new MoveMarkers(this);
    this.controls = new Controls(this);
    // the marker lands where you'll really end up (by a house's wall, at a pond's bank)
    // a click on a monster attacks it, on someone talks to them - not a walk there
    this.controls.taken = (x, y) => !!(this.npcs.at(x, y) || this.monsters.at(x, y));
    this.controls.onTarget = (x, y) => {
      // walking yourself stops auto-farm, and calls off an attack (like LoL: to attack again, click the monster again)
      stopFarm('หยุดฟาร์มออโต้แล้ว (เดินเอง)');
      this.cancelAttack();
      this.markTo(x, y);
    };

    const cam = this.cameras.main;
    cam.setRoundPixels(false);
    // follow the middle of the hero (16 px above the feet) - the same point it starts centred on, so
    // nothing glides into place when the page loads
    cam.startFollow(this.master.root, false, 0.12, 0.12, 0, 16);
    this.fitZoom();
    this.fx = new BattleLayer(this, 9600, 'mapfx');
    const onResize = () => this.fitZoom();
    this.scale.on('resize', onResize);
    // once the menus have slid in (they're measured mid-slide at first), measure them again
    const settle = window.setTimeout(() => this.fitBounds(), 900);
    this.events.once('shutdown', () => window.clearTimeout(settle));
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
    cam.centerOn(start.x, start.y - 16);

    const shrine = this.map.braziers[0];
    const mini = renderMinimap(this, this.map);
    this.hud.attachMap({
      image: mini,
      width: this.map.cols * TILE,
      height: this.map.rows * TILE,
      quest: shrine ? { id: 's-shrine', x: shrine.x + 24, y: shrine.y } : undefined,
      warps: this.map.warps.map((w) => ({ x: w.x, y: w.y })),
      name: def.name,
      sub: def.sub,
    });
    setWarpContext({
      points: this.map.warps,
      maps: travelFrom(this.mapId),
      here: null,
      thumb: (x, y) => {
        // the minimap round the pad, 64 x 40 of its pixels (256 x 160 world px)
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 40;
        // kept inside the map (a pad by the edge sits off-centre in it), the pin where the pad really is
        const sx = Phaser.Math.Clamp(x / MINIMAP_SCALE - 32, 0, mini.width - 64);
        const sy = Phaser.Math.Clamp(y / MINIMAP_SCALE - 20, 0, mini.height - 40);
        c.getContext('2d')!.drawImage(mini, sx, sy, 64, 40, 0, 0, 64, 40);
        c.dataset.pinX = `${((x / MINIMAP_SCALE - sx) / 64) * 100}%`;
        c.dataset.pinY = `${((y / MINIMAP_SCALE - sy) / 40) * 100}%`;
        return c;
      },
      go: (id) => this.warpTo(id),
    });
    // E / Enter: use what you stand at - a warp pad, someone to talk to, or a door
    const use = () => {
      if (this.warps.busy || uiBlocking()) return;
      if (this.padHere) openWarpPanel();
      else if (this.npcHere) this.talk(this.npcHere);
      else if (this.monHere) this.inspect(this.monHere);
      else if (this.door) useDoor(this.door);
    };
    this.input.keyboard?.on('keydown-E', use);
    this.input.keyboard?.on('keydown-ENTER', use);
    // the area's name, on arriving - not on a refresh back to the same spot (it was shown when you got here)
    const back = place && Date.now() - place.at < ANNOUNCE_AFTER;
    if (!back) this.time.delayedCall(arriving ? 1400 : 500, () => this.hud.announceArea(def.name, def.sub));

    // Pin the name plate over the master's head once the camera has moved for this frame.
    cam.on('followupdate', () => {
      const v = cam.worldView;
      const k = cam.zoom / this.scale.displayScale.x; // world px -> CSS px
      this.hud.placeName((this.master.x - v.x) * k, (this.master.y - NAME_HEIGHT - v.y) * k);
      this.npcs.placeTags(cam, k, talkOpen());
      this.monsters.placeTags(cam, k, talkOpen(), this.master.x, this.master.y);
    });
  }

  /** The size of an atlas picture. */
  private shapeReader(): ShapeOf {
    const atlas = this.textures.get('meadow');
    return (frame) => {
      const f = atlas.get(frame);
      return { w: f.cutWidth, h: f.cutHeight };
    };
  }

  /** ?hitboxes in the address: draw every object's outline and the player's feet, to check them. */
  private drawHitboxes(): void {
    const g = this.add.graphics().setDepth(9800);
    g.lineStyle(1, 0xff3030, 1).fillStyle(0xff3030, 0.25);
    for (const f of this.feet) {
      const pts = [];
      for (let i = 0; i < f.poly.length; i += 2) pts.push(new Phaser.Math.Vector2(f.poly[i], f.poly[i + 1]));
      g.fillPoints(pts, true).strokePoints(pts, true);
    }
    const me = this.add.ellipse(0, 0, FOOT_RX * 2, FOOT_RY * 2).setStrokeStyle(1, 0x30ff60).setDepth(9801);
    // and the click-to-move grid's blocked cells, and the way being walked
    const grid = this.add.graphics().setDepth(9799).fillStyle(0x3080ff, 0.18);
    for (let y = NAV_CELL / 2; y < this.map.rows * TILE; y += NAV_CELL)
      for (let x = NAV_CELL / 2; x < this.map.cols * TILE; x += NAV_CELL)
        if (!this.nav.free(x, y)) grid.fillRect(x - NAV_CELL / 2, y - NAV_CELL / 2, NAV_CELL, NAV_CELL);
    const way = this.add.graphics().setDepth(9802);
    this.events.on('update', () => {
      me.setPosition(this.master.x, this.master.y);
      way.clear();
      if (!this.controls.target || !this.route.length) return;
      way.lineStyle(1, 0xffe040, 1).beginPath().moveTo(this.master.x, this.master.y);
      for (const p of this.route) way.lineTo(p.x, p.y);
      way.strokePath();
    });
  }

  /**
   * Whole-number zoom (in device pixels) so pixels stay square. Aim to show about
   * 540 world px across the short side of a computer/iPad screen, 360 on a phone.
   */
  private fitZoom(): void {
    this.fitFx();
    const dpr = this.scale.displayScale.x;
    const cssShort = Math.min(window.innerWidth, window.innerHeight);
    const target = cssShort < 500 ? 360 : 540;
    const zoom = Phaser.Math.Clamp(Math.round((dpr * cssShort) / target), 1, 8);
    this.cameras.main.setZoom(zoom);
    this.fitBounds();
  }

  /** The effect layer follows the camera's size and zoom. */
  private fitFx(): void {
    this.time.delayedCall(0, () => this.fx?.fit());
  }

  /**
   * How far the camera may go: the map, and past each edge as far as the menus reach in from that edge
   * of the screen - so whatever is at the edge of the map (a warp pad where a road leaves it) can always
   * be brought out from under them. The ground goes on past the edges (MeadowView.bakeBeyond).
   */
  private fitBounds(): void {
    const cam = this.cameras.main;
    const inset = this.hud.insets();
    const perCss = cam.height / cam.zoom / Math.max(1, window.innerHeight);
    const past = (css: number) => (css > 0 ? Math.min(BEYOND - TILE, Math.ceil(css * perCss) + 8) : 0);
    const l = past(inset.left), r = past(inset.right), t = past(inset.top), b = past(inset.bottom);
    cam.setBounds(-l, -t, this.map.cols * TILE + l + r, this.map.rows * TILE + t + b);
  }

  update(time: number, deltaMs: number): void {
    if (this.leaving) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    this.controls.update();
    const m = this.master;
    let { x: dx, y: dy } = this.controls.dir;
    if ((dx || dy) && this.goFight) this.cancelAttack();

    // mid-warp the hero doesn't walk (mid-fight on the map it may: walking too far off is running away)
    if (this.warps.busy) {
      dx = dy = 0;
      this.controls.target = null;
    }
    const now = this.time.now / 1000;
    const target = this.controls.target;
    let easing = false;
    if (!target) (this.route = []), (this.routeFor = null), (this.stuck = this.replans = 0);
    else if (!dx && !dy) {
      // a new target (or one that has moved off): find the way there again
      const rf = this.routeFor;
      const moved = !rf || Math.abs(rf.x - target.x) > NAV_CELL || Math.abs(rf.y - target.y) > NAV_CELL;
      if (moved && (!this.route.length || !rf || now - this.plannedAt >= REPLAN_EVERY)) this.plan(target.x, target.y, now);
      // past a waypoint, or the next one is in plain sight already (pushed off the line by something): on to the next
      const r = this.route;
      while (r.length > 1 && (Math.hypot(r[0].x - m.x, r[0].y - m.y) < 3 || this.nav.clear(m.x, m.y, r[1].x, r[1].y))) r.shift();
      const wp = r[0];
      if (!wp) {
        this.controls.target = null;
      } else {
        const tx = wp.x - m.x;
        const ty = wp.y - m.y;
        const dist = Math.hypot(tx, ty);
        if (r.length === 1 && dist < 1.5) {
          // there (when the mouse is held, it stays the target: nothing more to do till it moves)
          this.route = [];
          this.controls.target = null;
        } else {
          // ease in on the last few pixels
          const k = r.length === 1 ? Math.min(1, dist / 6) : 1;
          easing = k < 1;
          dx = (tx / dist) * k;
          dy = (ty / dist) * k;
        }
      }
    }
    this.markers.update(dt);

    const ox = m.x;
    const oy = m.y;
    this.move(m, dx * SPEED * dt, dy * SPEED * dt);
    m.vx = (m.x - ox) / dt;
    m.vy = (m.y - oy) / dt;
    // Stuck on the way (pressed against something the grid didn't see): find the way again; still stuck,
    // give up instead of pushing forever.
    if (this.controls.target && (dx || dy) && !easing && Math.hypot(m.vx, m.vy) < SPEED * 0.15) {
      this.stuck += dt;
      if (this.stuck > 0.25) {
        this.stuck = 0;
        if (this.replans++ < 2) this.routeFor = null;
        else if (!this.controls.steering) this.controls.target = null;
      }
    } else if (Math.hypot(m.vx, m.vy) > SPEED * 0.5) {
      this.stuck = 0;
      this.replans = 0;
    }
    m.update(dt);
    // the leader: hidden while a warp carries you, starting again behind you where you land
    if (this.warps.busy !== this.warpWas) {
      this.warpWas = this.warps.busy;
      this.follower.setHidden(this.warps.busy);
      if (!this.warps.busy) this.follower.reset(m.x, m.y, m.facing);
    }
    this.follower.update(dt, m.x, m.y);

    this.view.moving = Math.hypot(m.vx, m.vy) > 5;
    // the leader walking with you, and the monster you're fighting, show through what's in front of them too
    const lead = this.follower.body;
    this.view.also = [
      ...(lead ? [{ x: lead.x, y: lead.y }] : []),
      ...(this.fight && !this.fight.monster.gone ? [{ x: this.fight.monster.x, y: this.fight.monster.y }] : []),
    ];
    this.view.update(dt, m.x, m.y, time / 1000);
    const shrine = this.map.braziers[0];
    if (shrine && Math.hypot(m.x - shrine.x - 24, m.y - shrine.y) < 70) this.hud.reached('shrine');
    this.ambience.update(dt);
    this.critters.update(dt, m.x, m.y);
    this.animals.update(dt, m.x, m.y);
    this.npcs.update(dt, m.x, m.y, (x, y, w, h) => this.view.depthFor(x, y, w, h));
    this.warps.update(dt);
    // standing on a pad offers a warp; standing at a door offers to go in
    const pad = this.warps.busy ? null : this.warps.padAt(m.x, m.y)?.id ?? null;
    if (pad !== this.padHere) {
      this.padHere = pad;
      warpPrompt(pad);
    }
    // walked onto a pad: its destinations open at once (no E); not on landing there by warp, and only once per step on
    const raw = this.warps.padAt(m.x, m.y)?.id ?? null;
    if (this.padRaw === undefined) this.padRaw = raw;
    else if (raw !== this.padRaw) {
      this.padRaw = raw;
      if (raw && !this.warps.busy && !uiBlocking()) openWarpPanel();
    }
    // someone to talk to (and the one you walked over to talk to: talk now)
    const npc = this.warps.busy || pad ? null : this.npcs.near(m.x, m.y);
    if (npc !== this.npcHere) {
      this.npcHere = npc;
      talkPrompt(npc && npc.def.name, npc ? () => this.talk(npc) : undefined);
    }
    if (npc && npc === this.talkTo && !uiBlocking()) this.talk(npc);
    // a monster: see what it is (the fight will start from here)
    // they notice you and come after you (not mid-fight, mid-warp, with a panel up, or when nobody can fight)
    const aggro = !this.fight && !this.opener && !this.battling && !this.warps.busy && !uiBlocking() && fitTeam(player.team).length > 0;
    if (farm.on && (dx || dy) && !this.controls.target) stopFarm('หยุดฟาร์มออโต้แล้ว (เดินเอง)');
    this.farmStep(now);
    const caught = this.monsters.update(dt, m.x, m.y, (x, y, w, h) => this.view.depthFor(x, y, w, h), aggro, player.level);
    if (caught) this.engage(caught, 'them');
    this.fight?.update(dt);
    this.opener?.update(dt);
    if (this.fight && !this.fight.ended && this.fight.distance() > FIELD_FIGHT.leash) this.fleeFieldFight();
    // the effect layer only draws while there's something on it (a pin, a fight)
    // the monster under the mouse: the sword cursor and a white-red outline (one you could fight: not one being fought)
    let hover: Monster | null = null;
    if (this.overMap && !uiBlocking() && !this.battling) {
      const p = this.input.activePointer;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      hover = this.monsters.at(wp.x, wp.y);
      if (hover && (hover.engaged || hover.gone)) hover = null;
    }
    if (hover !== this.hoverMon) swordCursor(!!hover);
    this.hoverMon = hover;
    this.goFightStep();
    this.fx.over = this.fight || this.opener || hover || this.monsters.list.some((mo) => mo.chasing || mo.meter > 0.01) ? (s) => {
      if (this.hoverMon) drawOutline(s, this.hoverMon.sprite, now);
      this.monsters.drawMeters(s);
      this.fight?.drawBars(s);
    } : null;
    this.fx.update(dt);
    if (this.inspected && !uiBlocking()) (this.inspected.held = false), (this.inspected = null);
    const mon = this.warps.busy || pad || npc || this.fight ? null : this.monsters.near(m.x, m.y);
    if (mon !== this.monHere) {
      this.monHere = mon;
      monsterPrompt(mon && mon.def, mon ? () => this.inspect(mon) : undefined);
    }
    if (this.lookAt && !uiBlocking()) {
      if (mon === this.lookAt) this.inspect(mon);
      else if (this.controls.target) this.controls.target = { x: this.lookAt.x + (m.x < this.lookAt.x ? -14 : 14), y: this.lookAt.y + 4 };
      else this.lookAt = null;
    }
    const door = this.warps.busy || pad || npc || mon ? null : this.map.doors.find((d) => Math.hypot(m.x - d.x, (m.y - d.y) * 1.4) < d.r) ?? null;
    if (door !== this.door) {
      this.door = door;
      doorPrompt(door);
    }
    this.hud.track(m.x, m.y, m.facing, this.cameras.main.worldView);
    this.keepPlace();
  }

  /**
   * Save where the hero stands (ui/store.ts savePlace): while walking at most every SAVE_EVERY s, at once when it
   * stops or `now` (the page going away, a battle starting, arriving on a map). Never mid-warp (the veil is up and
   * the hero is between pads) or while a battle runs (the map sleeps; a refresh then comes back to where it began).
   */
  private keepPlace(now = false): void {
    if (this.battling || this.warps.busy) {
      if (now) flushSave();
      return;
    }
    const m = this.master;
    const t = this.time.now / 1000;
    const last = this.saved;
    if (last && Math.abs(last.x - m.x) < 0.5 && Math.abs(last.y - m.y) < 0.5 && last.facing === m.facing) {
      if (now) flushSave();
      return;
    }
    const walking = Math.hypot(m.vx, m.vy) > 5;
    if (!now && walking && last && t - last.t < SAVE_EVERY) return;
    savePlace(this.mapId, m.x, m.y, m.facing);
    this.saved = { x: m.x, y: m.y, facing: m.facing, t };
  }

  /**
   * Where a saved spot puts you on this map, by the same collision the walking uses: the spot itself if the feet fit
   * there and it's on the same ground as the map's spawn (not shut in somewhere), else the nearest free cell on that
   * ground within NUDGE_CELLS; null if there's none (or the numbers are off the map).
   */
  private restorePlace(p: SavedPlace): Point | null {
    const w = this.map.cols * TILE, h = this.map.rows * TILE;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > w || p.y > h) return null;
    const home = this.nav.regionAt(this.map.spawn.x, this.map.spawn.y);
    if (!home) return null;
    if (this.fits(p.x, p.y) && this.nav.nearestFree(p.x, p.y, 2, home)) return { x: p.x, y: p.y };
    return this.nav.nearestFree(p.x, p.y, NUDGE_CELLS, home);
  }

  /** Can the feet stand right here - on the ground, touching no footprint (what move() would push them out of)? */
  private fits(x: number, y: number): boolean {
    if (!this.ground(x, y)) return false;
    const K = FOOT_RX / FOOT_RY;
    for (const f of this.feet) {
      if (Math.abs(x - f.x) > f.hw + FOOT_RX + 1 || Math.abs(y - f.y) > f.hd + FOOT_RY + 1) continue;
      if (pushOut(f.poly, x, y * K, FOOT_RX, K)) return false;
    }
    return true;
  }

  /** Find the way to (x, y) from where the hero stands (it ends at the nearest reachable spot if that one isn't). */
  private plan(x: number, y: number, now = this.time.now / 1000): void {
    this.route = this.nav.find(this.master.x, this.master.y, x, y);
    this.routeFor = { x, y };
    this.plannedAt = now;
  }

  /** A new target: plan the way there now and drop the move marker where it ends. */
  private markTo(x: number, y: number): void {
    this.plan(x, y);
    const end = this.route[this.route.length - 1] ?? { x, y };
    this.markers.spawn(end.x, end.y);
  }

  /** Go and talk to someone: right away if they're close, or walk over to them first. */
  private approach(n: Npc): void {
    stopFarm();
    if (this.warps.busy || uiBlocking()) return;
    const m = this.master;
    if (Math.hypot(n.x - m.x, (n.y - m.y) * 1.4) < 26) return this.talk(n);
    // stand in front of them, on the side you're coming from
    const side = m.x < n.x ? -1 : 1;
    this.controls.target = { x: n.x + side * 12, y: n.y + 6 };
    this.markTo(this.controls.target.x, this.controls.target.y);
    this.talkTo = n;
  }

  /** Go and look at a monster: right away if it's close, or walk over to it first (it may wander off). */
  /**
   * Auto-farm (ui/farm.ts): walk to the nearest monster of the picked kinds and fight it on the map; then the next.
   * Stops by itself when only the leader is left standing (the leader never falls, the rest would keep falling).
   */
  private farmStep(now: number): void {
    if (!farm.on || this.fight || this.opener || this.battling || this.warps.busy || uiBlocking()) return;
    const m = this.master;
    let mo = this.farmMon;
    if (!mo || mo.gone || mo.engaged || !farmWants(mo.def.id)) {
      // look for the next (not every frame)
      if (now - this.farmLook < 0.5) return;
      this.farmLook = now;
      mo = this.farmMon = this.nearestFarm();
      if (!mo) return;
    }
    // near enough, in plain sight: stop there - the leader walks in and fights (the master needn't go up to it)
    if (this.inReach(mo)) {
      this.controls.target = null;
      this.farmMon = null;
      this.engage(mo);
      return;
    }
    // (stand on its near side; the way there is found and re-found as it moves)
    this.controls.target = { x: mo.x + (m.x < mo.x ? -14 : 14), y: mo.y + 3 };
  }

  /** The nearest monster auto-farm wants that can be walked to. */
  private nearestFarm(): Monster | null {
    const m = this.master;
    const near = this.monsters.list
      .filter((mo) => !mo.gone && !mo.engaged && farmWants(mo.def.id) && Math.hypot(mo.x - m.x, mo.y - m.y) < FARM.range)
      .sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))
      .slice(0, 4);
    for (const mo of near) {
      const way = this.nav.find(m.x, m.y, mo.x, mo.y);
      const end = way[way.length - 1];
      if (end && Math.hypot(end.x - mo.x, end.y - mo.y) < 26) return mo;
    }
    return null;
  }

  /** A monster kind's picture (its first idle frame), for auto-farm's list. */
  private monsterPic(look: string): HTMLCanvasElement {
    const c = document.createElement('canvas');
    if (!this.textures.get('monsters').has(`${look}_idle0`)) return c;
    const f = this.textures.getFrame('monsters', `${look}_idle0`);
    c.width = f.cutWidth;
    c.height = f.cutHeight;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    return c;
  }

  /**
   * Clicking a monster (the sword): go and fight it - walk until it's within FARM.reach in plain sight, then the team
   * leader walks in and the fight starts on the map (the master needn't go up to it). Its card stays on the "look"
   * prompt you get standing by it.
   */
  private approachMonster(mo: Monster): void {
    stopFarm();
    if (this.warps.busy || uiBlocking() || this.fight || this.opener || mo.engaged || mo.gone) return;
    this.lookAt = null;
    // within reach: stand where you are, the leader goes (like a ranged champion attacking from range)
    if (this.inReach(mo)) {
      this.goFight = null;
      this.controls.target = null;
      this.route = [];
      return this.engage(mo);
    }
    // too far: walk only until it is within reach (no move marker - it's an attack, not a walk)
    this.goFight = mo;
    const m = this.master;
    this.controls.target = { x: mo.x + (m.x < mo.x ? -14 : 14), y: mo.y + 4 };
    this.plan(this.controls.target.x, this.controls.target.y);
  }

  /**
   * A walk command calls off an attack not yet begun (still walking up to the monster). A fight already going keeps
   * going while you walk about - only walking out of range (FIELD_FIGHT.leash) ends it.
   */
  private cancelAttack(): void {
    this.goFight = null;
  }

  /** Is a monster within FARM.reach, with nothing in the way (a line to just short of it - it may stand by a trunk)? */
  private inReach(mo: Monster): boolean {
    const m = this.master;
    const d = Math.hypot(mo.x - m.x, (mo.y - m.y) * 1.3);
    if (d >= FARM.reach) return false;
    const k = Math.max(0, (d - 20) / Math.max(1, d));
    return this.nav.clear(m.x, m.y, m.x + (mo.x - m.x) * k, m.y + (mo.y - m.y) * k);
  }

  /** A fight begins (you caught up with it, it caught you, farming): on the map on auto, or - the AUTO switch off -
   * on the turn-based screen. */
  private engage(mo: Monster, first: 'us' | 'them' = 'us'): void {
    if (this.fight || this.opener || this.battling) return;
    if (autoFight()) return this.startFieldFight(mo);
    this.toBattle(mo, first);
  }

  /** The turn-based screen opens only after a first blow on the map: the leader's (or the monster's, if it caught you). */
  private toBattle(mo: Monster, first: 'us' | 'them' = 'us'): void {
    if (this.fight || this.opener || this.battling || mo.gone) return;
    const leader = this.follower.body;
    if (!leader || !fitTeam(player.team).length) return this.startBattle(mo);
    this.follower.held = true;
    this.controls.target = null;
    this.opener = new Opener(this, this.fx, leader, mo, this.master, first, () => {
      this.opener = null;
      this.follower.held = false;
      this.startBattle(mo);
    });
  }

  /** On the way to a monster you clicked: near enough and in plain sight, the fight starts. */
  private goFightStep(): void {
    const mo = this.goFight;
    if (!mo) return;
    if (this.fight || this.opener || this.battling || mo.gone || mo.engaged || this.warps.busy) {
      this.goFight = null;
      return;
    }
    const m = this.master;
    if (this.inReach(mo)) {
      this.goFight = null;
      this.controls.target = null;
      this.route = [];
      this.engage(mo);
      return;
    }
    // walked off yourself (the target was dropped): forget it
    if (!this.controls.target) this.goFight = null;
    else this.controls.target = { x: mo.x + (m.x < mo.x ? -14 : 14), y: mo.y + 4 };
  }

  /** Face a monster and open its card. */
  private inspect(mo: Monster): void {
    this.lookAt = null;
    this.controls.target = null;
    this.master.facing = mo.x < this.master.x ? -1 : 1;
    mo.held = true;
    this.inspected = mo;
    mo.facing = this.master.x < mo.x ? -1 : 1;
    monsterPrompt(null);
    this.monHere = null;
    setFight(() => {
      closePanel();
      mo.held = false;
      this.inspected = null;
      this.toBattle(mo);
    }, () => {
      closePanel();
      mo.held = false;
      this.inspected = null;
      this.startFieldFight(mo);
    });
    showMonster(mo.def, this.monsters.picture(mo));
  }

  /**
   * Fight a monster here on the map (ADR 0019): the same battle on auto, the team leader striking for the team
   * (world/FieldFight.ts). One fighter per monster: one already being fought can't be picked.
   */
  private startFieldFight(mo: Monster, battle?: Battle): void {
    if (this.fight || this.battling || mo.engaged || mo.gone) return;
    wakeFallen();
    const leader = this.follower.body;
    if (!fitTeam(player.team).length || !leader) {
      toast('ฮีโร่ในทีมล้มหมด — ใช้ยาชุบชีวิต หรือรอให้ฟื้นก่อน');
      this.monsters.calm();
      return;
    }
    closePanel();
    monsterPrompt(null);
    talkPrompt(null);
    this.controls.target = null;
    this.route = [];
    this.lookAt = this.inspected = this.monHere = null;
    this.keepPlace(true);
    this.follower.held = true;
    const fight = new FieldFight(this, {
      layer: this.fx,
      monster: mo,
      master: this.master,
      leader,
      foes: encounterOf(mo.def.id),
      seed: Math.floor(Math.random() * 1e9),
      battle,
      onEnd: (kind) => this.endFieldFight(mo, kind),
    });
    this.fight = fight;
    this.monsters.calm(9999);
    showFightBar(mo.def, { open: () => this.fieldToTurnBased() });
    fight.syncBars();
  }

  /** The fight on the map is over (FieldFight has written the heroes' HP back). */
  private endFieldFight(mo: Monster, kind: FieldEnd): void {
    hideFightBar();
    this.fight = null;
    this.follower.held = false;
    this.monsters.calm();
    if (kind === 'win') {
      const spawn = MAP_SPAWNS[this.map.id]?.find((sp) => sp.monster === mo.def.id);
      // (it's dissolving on the effect layer; its picture goes now)
      this.monsters.defeat(mo, spawn?.respawn ?? 60);
      this.beat(mo);
    }
  }

  /** Run: the fight stops where it is (the heroes keep what they have left; the monster loses interest). */
  private fleeFieldFight(why = 'หนีออกจากการต่อสู้แล้ว'): void {
    const f = this.fight;
    if (!f) return;
    stopFarm();
    f.stop();
    hideFightBar();
    this.fight = null;
    this.follower.held = false;
    this.monsters.calm();
    toast(why);
  }

  /** Carry the fight on on the turn-based screen (you choose the moves), from where it has got to. */
  private fieldToTurnBased(): void {
    const f = this.fight;
    if (!f) return;
    if (f.battle.over) return;
    const battle = f.handOver();
    hideFightBar();
    this.fight = null;
    this.follower.held = false;
    this.startBattle(f.monster, battle);
  }

  /** A monster kind beaten (once is enough to unlock farming it on auto later). */
  private beat(mo: Monster): void {
    const b = (player.beaten ??= {});
    b[mo.def.id] = (b[mo.def.id] ?? 0) + 1;
    changed();
  }

  /**
   * Fight a monster (and the ones that come with it): a blade slashes across the screen (ui/transition.ts) and
   * under its cover the map sleeps and the battle opens on the stage's arena (BattleScene); when it's over the
   * same wipe takes you back and the map wakes where you were.
   */
  private startBattle(mo: Monster, live?: Battle): void {
    if (this.battling) return;
    // nobody in the team who can fight (all down): heal or revive them first
    wakeFallen();
    if (!fitTeam(player.team).length) {
      toast('ฮีโร่ในทีมล้มหมด — ใช้ยาชุบชีวิต หรือรอให้ฟื้นก่อน');
      return;
    }
    // a refresh mid-battle comes back here, on the map (the battle itself isn't resumed)
    this.keepPlace(true);
    this.battling = true;
    closePanel();
    monsterPrompt(null);
    talkPrompt(null);
    this.controls.target = null;
    this.lookAt = this.inspected = this.monHere = null;
    mo.held = true;
    const cam = this.cameras.main;
    const zoom = cam.zoom;
    // a push in on the hero as the blade comes across; the battle is set up under the cover
    cam.zoomTo(zoom * 1.25, 700, 'Quad.easeIn');
    const data: BattleData = {
      foes: encounterOf(mo.def.id),
      seed: Math.floor(Math.random() * 1e9),
      // a fight from the map: carried on exactly where it is, and it can be folded back there
      battle: live,
      // (any battle can be folded back to the map: it carries on there on auto)
      fold: (battle) => {
        this.scene.wake();
        this.battling = false;
        mo.held = false;
        cam.zoomEffect.reset();
        this.fitZoom();
        this.startFieldFight(mo, battle);
      },
      done: (result) => {
        this.scene.wake();
        this.battling = false;
        mo.held = false;
        mo.engaged = false;
        this.monsters.calm();
        if (result === 'win') {
          const spawn = MAP_SPAWNS[this.map.id]?.find((sp) => sp.monster === mo.def.id);
          this.monsters.defeat(mo, spawn?.respawn ?? 60);
          this.beat(mo);
        }
        // stop the push-in (it was cut off when the map went to sleep and would carry on, leaving the camera
        // closer after every battle) and go back to the map's own zoom for this screen
        cam.zoomEffect.reset();
        this.fitZoom();
      },
    };
    playTransition(() => {
      this.scene.launch('Battle', data);
      this.scene.sleep();
    });
  }

  /** Talk to someone: face each other and open the conversation. */
  private talk(n: Npc): void {
    this.talkTo = null;
    this.controls.target = null;
    this.master.facing = n.x < this.master.x ? -1 : 1;
    talkPrompt(null);
    this.npcHere = null;
    openTalk({ name: n.def.name, role: n.def.role, lines: n.def.lines, action: n.def.action, portrait: this.portrait(n.def.look) });
  }

  /** Someone's face for a conversation: their head and shoulders, from their own parts. */
  private portrait(look: string): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 26;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (const part of ['body', 'head']) {
      const f = this.textures.getFrame('npcs', `${look}_${part}`);
      g.drawImage(f.source.image as CanvasImageSource, f.cutX + 3, f.cutY, 26, 26, 0, 0, 26, 26);
    }
    return c;
  }

  /** Jump to the warp pad `id` on this map, or (`map:<id>`) travel to another map's arrival pad. */
  private warpTo(id: string): void {
    if (this.warps.busy) return;
    const hooks = {
      hide: () => this.hud.nameVisible(false),
      show: () => this.hud.nameVisible(true),
      done: () => (this.padHere = null),
    };
    if (id.startsWith('map:')) {
      const map = id.slice(4) as MapId;
      if (!(map in MAPS)) return;
      warpPrompt(null);
      // the veil closes, the scene starts again on the other map, and the warp lands there
      this.warps.jump(this.master, null, { ...hooks, travel: () => this.scene.restart({ map, arrive: MAPS[map].arrive }) });
      return;
    }
    const to = this.map.warps.find((w) => w.id === id);
    if (!to) return;
    warpPrompt(null);
    this.warps.jump(this.master, to, hooks);
  }

  /**
   * Move, then let footprints push the feet out - so the player slides round trunks, along walls and
   * round the corners of a tent. The feet are an oval (FOOT_RX x FOOT_RY); stretching the world
   * upright by FOOT_RX / FOOT_RY turns them into a circle, which is pushed out of each outline.
   */
  private move(m: MasterCharacter, mx: number, my: number): void {
    // pond banks: slide along them
    if (this.ground(m.x + mx, m.y + my)) {
      m.x += mx;
      m.y += my;
    } else if (this.ground(m.x + mx, m.y)) {
      m.x += mx;
    } else if (this.ground(m.x, m.y + my)) {
      m.y += my;
    }
    const K = FOOT_RX / FOOT_RY;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const f of this.feet) {
        if (Math.abs(m.x - f.x) > f.hw + FOOT_RX + 1 || Math.abs(m.y - f.y) > f.hd + FOOT_RY + 1) continue;
        const out = pushOut(f.poly, m.x, m.y * K, FOOT_RX, K);
        if (!out) continue;
        const nx = out[0], ny = out[1] / K;
        if (this.ground(nx, ny)) {
          m.x = nx;
          m.y = ny;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  /** Walkable ground: inside the map and not in a pond. */
  private ground(x: number, y: number): boolean {
    if (x < 8 || y < 12 || x > this.map.cols * TILE - 8 || y > this.map.rows * TILE - 4) return false;
    return waterAt(this.map, x, y) < 0.45;
  }

  /** A little puff of dust where a foot lands. */
  private dust(x: number, y: number): void {
    const behind = -this.master.facing * 3;
    for (let i = 0; i < 2; i++) {
      const p = this.add
        .rectangle(x + behind + (i ? 2 : -1), y - 1, 2, 2, 0xe6dcc0, 0.7)
        .setDepth(y - 0.5);
      this.tweens.add({
        targets: p,
        y: p.y - 3,
        x: p.x + behind,
        alpha: 0,
        scale: 0.4,
        duration: 380,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }
}
