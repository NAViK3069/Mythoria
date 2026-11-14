import { h, toast } from '../dom';
import { registerPanel, type PanelContext } from '../Modal';
import {
  CLASSES, ELEMENTS, MAX_STARS, RARITIES, heroById,
  type ClassId, type ElementId, type HeroDef, type RarityId,
} from '@mythoria/game-data';
import { MAX_TEAMS, changed, emptyTeam, fixLeader, player, syncTeam, type OwnedHero, type TeamSetup } from '../store';
import { classIcon, elementIcon } from './heroes';

// The teams (laid out like the owner's earlier project): a list of teams, each a row of slots - FRONT (2), BACK (3)
// and SPECIAL (2, off the field: called in to cast a skill) - with edit / delete; the one in use is marked. Editing a
// team: its slots across the top (pick one, then tap a hero below; × takes a hero out), filters by element, rarity
// and class, sorting by grade / level / favourite, and the heroes in two rows that scroll sideways.

type Row = 'front' | 'back' | 'special';
interface SlotRef { row: Row; i: number }

const ROWS: { row: Row; label: string }[] = [
  { row: 'front', label: 'แถวหน้า' },
  { row: 'back', label: 'แถวหลัง' },
  { row: 'special', label: 'ทีมพิเศษ' },
];
const RAR_ORDER: RarityId[] = ['mythic', 'legend', 'epic', 'rare'];

/** What's being edited (kept while the game runs, like the hero list's filter). */
const ui = {
  editing: null as number | null,
  slot: { row: 'front', i: 0 } as SlotRef,
  element: null as ElementId | null,
  rarity: null as RarityId | null,
  cls: null as ClassId | null,
  sort: 'grade' as 'grade' | 'level' | 'fav',
  /** Where the heroes were scrolled to (a refresh rebuilds them): sideways on a computer, down on a phone. */
  scroll: 0,
  scrollY: 0,
};

const owned = (id: string) => player.heroes.find((o) => o.id === id);
const face = (look: string) => h('img', { class: 'hero-pic tb-face', src: `assets/characters/heroes/${look}_face.png`, alt: '', draggable: false });
const starRow = (n: number) => h('div', { class: 'star-row' }, Array.from({ length: MAX_STARS }, (_, i) => h('i', { class: i < n ? 'on' : '' })));
const elColor = (id: ElementId) => ELEMENTS.find((e) => e.id === id)?.color ?? '#3fa8ff';
/** The leader's crown (our own pixel crown, ui.css .tb-crown). */
const crown = (cls = '') => h('span', { class: `tb-crown ${cls}`, 'aria-label': 'หัวหน้าทีม' });

/** A hero's tile: its face on its element's colour, the element at the top left, the level at the bottom left. */
function heroTile(def: HeroDef, own: OwnedHero | undefined, cls: string, attrs: Record<string, unknown> = {}, ...extra: (Node | null)[]) {
  return h('button', { class: `tb-tile r-${def.rarity} ${cls}`, style: `--el:${elColor(def.element)}`, ...attrs },
    h('span', { class: 'tb-art' }, face(def.look)),
    h('span', { class: 'tb-el' }, elementIcon(def.element, 18)),
    h('span', { class: 'tb-lv num' }, `Lv.${own?.level ?? 1}`),
    ...extra);
}

/** The slots of a team: FRONT | BACK | SPECIAL, each group under its label. */
function slotRows(t: TeamSetup, tile: (ref: SlotRef, id: string | null) => HTMLElement) {
  return h('div', { class: 'tb-rows' },
    ROWS.map(({ row, label }) =>
      h('div', { class: `tb-group ${row}` },
        h('div', { class: 'tb-glabel' }, label),
        h('div', { class: 'tb-gslots' }, t[row].map((id, i) => tile({ row, i }, id))))));
}

function save(ctx: PanelContext): void {
  for (const t of player.teams) fixLeader(t);
  syncTeam();
  changed();
  ctx.refresh();
}

registerPanel('team', {
  title: 'ทีม',
  icon: 'team',
  build(body, _tab, ctx) {
    // editing: the slots stay put at the top, only the heroes scroll
    body.classList.toggle('tb-fill', ui.editing != null && !!player.teams[ui.editing]);
    if (ui.editing != null && player.teams[ui.editing]) buildEdit(body, ctx, ui.editing);
    else {
      ui.editing = null;
      buildList(body, ctx);
    }
  },
});

/** Every team, one under another. */
function buildList(body: HTMLElement, ctx: PanelContext): void {
  const edit = (i: number, slot?: SlotRef) => {
    ui.editing = i;
    ui.slot = slot ?? firstEmpty(player.teams[i]) ?? { row: 'front', i: 0 };
    ui.scroll = ui.scrollY = 0;
    ctx.refresh();
  };
  const list = h('div', { class: 'tb-list' },
    player.teams.map((t, ti) => {
      const active = ti === player.activeTeam;
      const tile = (ref: SlotRef, id: string | null) => {
        const def = id ? heroById(id) : undefined;
        if (!def) return h('button', { class: 'tb-tile empty', onclick: () => edit(ti, ref), title: 'เพิ่มฮีโร่' }, h('span', { class: 'tb-plus' }, '+'));
        const lead = def.id === t.leader;
        return heroTile(def, owned(def.id), lead ? 'lead' : '', { onclick: () => edit(ti, ref), title: lead ? `${def.name} (หัวหน้าทีม)` : def.name }, lead ? crown() : null);
      };
      return h('section', { class: `tb-team${active ? ' active' : ''}` },
        h('div', { class: 'tb-head' },
          h('span', { class: 'tb-lab' }, 'ทีม :'),
          h('b', { class: 'tb-name' }, t.name),
          active ? h('span', { class: 'tb-using' }, 'ใช้อยู่') : null,
          h('div', { class: 'tb-btns' },
            active ? null : h('button', { class: 'tb-btn use', onclick: () => use(ti, ctx) }, 'ใช้ทีมนี้'),
            h('button', { class: 'tb-btn', onclick: () => edit(ti) }, 'แก้ไข'),
            h('button', { class: 'tb-btn', onclick: () => remove(ti, ctx) }, 'ลบ'))),
        h('div', { class: 'tb-box' }, slotRows(t, tile)));
    }),
    player.teams.length < MAX_TEAMS
      ? h('button', { class: 'tb-add', onclick: () => {
        player.teams.push(emptyTeam(`ทีม ${player.teams.length + 1}`));
        changed();
        edit(player.teams.length - 1);
      } }, '+ เพิ่มทีม')
      : null,
    h('p', { class: 'note tb-note' }, 'ทีมที่ "ใช้อยู่" คือทีมที่ลงต่อสู้ · แถวหน้า 2 ตัว (ถึกขึ้น) · แถวหลัง 3 ตัว (ตีแรงขึ้น) · ทีมพิเศษ 2 ตัว ไม่ลงสนาม เพื่อนเรียกลงมาร่ายสกิล'),
  );
  body.append(list);
}

function use(ti: number, ctx: PanelContext): void {
  const t = player.teams[ti];
  if (![...t.front, ...t.back].some(Boolean)) return toast('ทีมนี้ยังไม่มีฮีโร่ลงสนาม');
  player.activeTeam = ti;
  toast(`ใช้ ${t.name} แล้ว`);
  save(ctx);
}

function remove(ti: number, ctx: PanelContext): void {
  if (player.teams.length <= 1) return toast('ต้องมีอย่างน้อย 1 ทีม');
  if (!confirm(`ลบ ${player.teams[ti].name}?`)) return;
  player.teams.splice(ti, 1);
  if (player.activeTeam === ti) player.activeTeam = 0;
  else if (player.activeTeam > ti) player.activeTeam--;
  save(ctx);
}

function firstEmpty(t: TeamSetup, from?: SlotRef): SlotRef | null {
  const all: SlotRef[] = ROWS.flatMap(({ row }) => t[row].map((_, i) => ({ row, i })));
  const start = from ? all.findIndex((s) => s.row === from.row && s.i === from.i) : -1;
  for (let k = 1; k <= all.length; k++) {
    const s = all[(start + k + all.length) % all.length];
    if (!t[s.row][s.i]) return s;
  }
  return null;
}

/** One team: its slots, then the heroes to put in them. */
function buildEdit(body: HTMLElement, ctx: PanelContext, ti: number): void {
  const t = player.teams[ti];
  const where = (id: string): SlotRef | null => {
    for (const { row } of ROWS) {
      const i = t[row].indexOf(id);
      if (i >= 0) return { row, i };
    }
    return null;
  };
  const sel = ui.slot;
  const keepScroll = () => ((ui.scroll = pool.scrollLeft), (ui.scrollY = pool.scrollTop));
  const put = (id: string) => {
    keepScroll();
    const from = where(id);
    if (from && from.row === sel.row && from.i === sel.i) return;
    // already in the team: it moves to the picked slot, whoever was there takes its old place
    if (from) t[from.row][from.i] = t[sel.row][sel.i];
    t[sel.row][sel.i] = id;
    ui.slot = firstEmpty(t, sel) ?? sel;
    save(ctx);
  };
  const take = (ref: SlotRef) => {
    keepScroll();
    t[ref.row][ref.i] = null;
    ui.slot = ref;
    save(ctx);
  };
  const done = () => {
    ui.editing = null;
    if (ti === player.activeTeam && ![...t.front, ...t.back].some(Boolean)) toast('ทีมที่ใช้อยู่ยังไม่มีฮีโร่ลงสนาม');
    save(ctx);
  };

  const tile = (ref: SlotRef, id: string | null) => {
    const on = ref.row === sel.row && ref.i === sel.i;
    const pick = () => {
      keepScroll();
      ui.slot = ref;
      ctx.refresh();
    };
    const def = id ? heroById(id) : undefined;
    if (!def) return h('button', { class: `tb-tile empty${on ? ' sel' : ''}`, onclick: pick, title: 'เลือกช่องนี้' }, h('span', { class: 'tb-plus' }, '+'));
    const lead = def.id === t.leader;
    const makeLeader = (e: Event) => {
      e.stopPropagation();
      keepScroll();
      t.leader = def.id;
      toast(`${def.name} เป็นหัวหน้าทีมแล้ว`);
      save(ctx);
    };
    return heroTile(def, owned(def.id), `${on ? 'sel' : ''}${lead ? ' lead' : ''}`, { onclick: pick, title: lead ? `${def.name} (หัวหน้าทีม)` : def.name },
      lead ? crown() : null,
      // only a hero on the field can lead
      !lead && ref.row !== 'special' ? h('span', { class: 'tb-lead-btn', role: 'button', title: 'ตั้งเป็นหัวหน้าทีม', onclick: makeLeader }, crown('dim')) : null,
      h('span', { class: 'tb-x', role: 'button', title: 'เอาออก', onclick: (e: Event) => (e.stopPropagation(), take(ref)) }, '×'));
  };

  const name = h('input', { class: 'tb-rename', value: t.name, maxlength: 20, 'aria-label': 'ชื่อทีม' }) as HTMLInputElement;
  name.addEventListener('change', () => {
    t.name = name.value.trim() || `ทีม ${ti + 1}`;
    changed();
  });
  name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());

  // the filters and the sort
  const chip = (on: boolean, onclick: () => void, title: string, ...content: (Node | string)[]) =>
    h('button', { class: `tb-chip${on ? ' on' : ''}`, onclick: () => (keepScroll(), onclick(), ctx.refresh()), title },
      ...content.map((c) => (typeof c === 'string' ? h('span', { class: 'tb-ct' }, c) : c)));
  const group = (...chips: HTMLElement[]) => h('div', { class: 'tb-cgroup' }, ...chips);
  const filters = h('div', { class: 'tb-filters' },
    group(chip(!ui.element, () => (ui.element = null), 'ทุกธาตุ', h('span', { class: 'tb-all' }, 'ทั้งหมด')),
      ...ELEMENTS.map((e) => chip(ui.element === e.id, () => (ui.element = ui.element === e.id ? null : e.id), e.name, elementIcon(e.id, 18)))),
    group(chip(!ui.rarity, () => (ui.rarity = null), 'ทุกระดับ', h('span', { class: 'tb-all' }, 'ทั้งหมด')),
      ...RARITIES.map((r) => chip(ui.rarity === r.id, () => (ui.rarity = ui.rarity === r.id ? null : r.id), r.name, h('span', { class: `rar-dot ${r.id}` }), r.name))),
    group(chip(!ui.cls, () => (ui.cls = null), 'ทุกอาชีพ', h('span', { class: 'tb-all' }, 'ทั้งหมด')),
      ...CLASSES.map((c) => chip(ui.cls === c.id, () => (ui.cls = ui.cls === c.id ? null : c.id), c.name, classIcon(c.id, 16), c.name))),
    h('div', { class: 'tb-cgroup tb-sort' },
      chip(ui.sort === 'grade', () => (ui.sort = 'grade'), 'เรียงตามระดับ', h('span', { class: 'tb-all' }, '★ ระดับ')),
      chip(ui.sort === 'level', () => (ui.sort = 'level'), 'เรียงตามเลเวล', h('span', { class: 'tb-all' }, 'เลเวล')),
      chip(ui.sort === 'fav', () => (ui.sort = 'fav'), 'ตัวโปรดก่อน', h('span', { class: 'tb-all' }, '★ โปรด'))));

  // on a phone the same choices as dropdowns (ui.css shows one or the other)
  const select = <T extends string>(label: string, value: T | null, options: readonly { id: T; name: string }[], set: (v: T | null) => void) => {
    const el = h('select', { class: 'tb-select', 'aria-label': label },
      h('option', { value: '' }, `${label}: ทั้งหมด`),
      options.map((o) => h('option', { value: o.id, selected: o.id === value }, `${label}: ${o.name}`))) as HTMLSelectElement;
    el.addEventListener('change', () => {
      keepScroll();
      set((el.value || null) as T | null);
      ctx.refresh();
    });
    if (value != null) el.classList.add('on');
    return el;
  };
  const sortSel = h('select', { class: 'tb-select', 'aria-label': 'เรียง' },
    ([['grade', 'ระดับ'], ['level', 'เลเวล'], ['fav', 'ตัวโปรด']] as const).map(([id, nm]) => h('option', { value: id, selected: ui.sort === id }, `เรียง: ${nm}`))) as HTMLSelectElement;
  sortSel.addEventListener('change', () => {
    keepScroll();
    ui.sort = sortSel.value as typeof ui.sort;
    ctx.refresh();
  });
  const selects = h('div', { class: 'tb-selects' },
    select('ธาตุ', ui.element, ELEMENTS, (v) => (ui.element = v)),
    select('ระดับ', ui.rarity, RARITIES, (v) => (ui.rarity = v)),
    select('อาชีพ', ui.cls, CLASSES, (v) => (ui.cls = v)),
    sortSel);

  // the heroes: filtered, sorted, two rows that scroll sideways
  const rank = (d: HeroDef) => RAR_ORDER.indexOf(d.rarity);
  const heroes = player.heroes
    .flatMap((o) => {
      const def = heroById(o.id);
      return def ? [{ o, def }] : [];
    })
    .filter(({ def }) => (!ui.element || def.element === ui.element) && (!ui.rarity || def.rarity === ui.rarity) && (!ui.cls || def.class === ui.cls))
    .sort((a, b) =>
      (ui.sort === 'fav' ? Number(!!b.o.fav) - Number(!!a.o.fav) : 0) ||
      (ui.sort === 'level' ? b.o.level - a.o.level : 0) ||
      rank(a.def) - rank(b.def) || b.o.stars - a.o.stars || b.o.level - a.o.level || a.def.name.localeCompare(b.def.name, 'th'));
  const pool = h('div', { class: 'tb-pool' },
    heroes.length
      ? heroes.map(({ o, def }) => {
        const inTeam = where(def.id);
        const fav = h('span', { class: `tb-fav${o.fav ? ' on' : ''}`, role: 'button', title: o.fav ? 'เลิกเป็นตัวโปรด' : 'ตั้งเป็นตัวโปรด', onclick: (e: Event) => {
          e.stopPropagation();
          keepScroll();
          o.fav = !o.fav;
          changed();
          ctx.refresh();
        } }, '★');
        return h('div', { class: `tb-card${inTeam ? ' in' : ''}` },
          heroTile(def, o, '', { onclick: () => put(def.id), title: inTeam ? `${def.name} (อยู่ในทีมแล้ว — แตะเพื่อย้ายมาช่องที่เลือก)` : def.name },
            h('span', { class: 'tb-cls' }, classIcon(def.class, 16)), fav, inTeam ? h('span', { class: 'tb-in' }, def.id === t.leader ? crown() : null, def.id === t.leader ? 'หัวหน้า' : 'ในทีม') : null),
          starRow(o.stars),
          h('div', { class: 'tb-nm' }, def.name));
      })
      : h('div', { class: 'note tb-none' }, 'ไม่มีฮีโร่ที่ตรงกับตัวกรอง'));
  // a mouse wheel scrolls the row sideways
  pool.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || pool.scrollWidth <= pool.clientWidth) return;
    pool.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });

  body.append(
    h('div', { class: 'tb-edit' },
      h('div', { class: 'tb-ehead' },
        h('button', { class: 'tb-back', onclick: done, title: 'กลับ', 'aria-label': 'กลับ' }, '←'),
        h('span', { class: 'tb-etitle' }, 'แก้ไขทีม ·'), name,
        h('span', { class: 'note tb-hint' }, 'เลือกช่อง แล้วแตะฮีโร่ด้านล่าง · แตะ × เพื่อเอาออก · แตะมงกุฎเพื่อตั้งหัวหน้าทีม'),
        h('button', { class: 'btn px-cut tb-done', onclick: done }, 'เสร็จ')),
      h('div', { class: 'tb-box tb-ebox' }, slotRows(t, tile)),
      filters,
      selects,
      pool));
  requestAnimationFrame(() => ((pool.scrollLeft = ui.scroll), (pool.scrollTop = ui.scrollY)));
}
