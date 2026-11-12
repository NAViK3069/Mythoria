import { fmt, h, icon, toast } from '../dom';
import { registerPanel } from '../Modal';
import {
  CLASSES, ELEMENTS, GEAR_SLOTS, MAX_STARS, RACES, RARITIES, STATS,
  ULT, copiesForNextStar, heroById,
  type ClassId, type ElementId, type RaceId, type RarityId,
} from '@mythoria/game-data';
import { RESERVE_SIZE, TEAM_SIZE, changed, player } from '../store';
import { art } from './common';

// The heroes (@mythoria/game-data HEROES; the player starts with the seven Rare starters): the hero list,
// narrowed by class, rarity, element and race, and each hero's own page.

registerPanel('team', {
  title: 'ทีม',
  icon: 'team',
  build(body, _tab, ctx) {
    // 7 a side, like LineRanger_TurnBased: the team (5, on the field - the battle puts tanks and warriors in the
    // front row, everyone else in the back) and the special team (2, off the field: a fighter calls one in to cast
    // its skill 1, then it rests a few turns). Tap a hero below: into the team, or the special team once the team
    // is full; tap a slot to take that hero out.
    const team = player.team, reserves = player.reserves;
    const face = (look: string) => h('img', { class: 'hero-pic tm-face', src: `assets/characters/heroes/${look}_face.png`, alt: '', draggable: false });
    const toggle = (id: string) => {
      const i = team.indexOf(id), j = reserves.indexOf(id);
      if (i >= 0) {
        if (team.length <= 1) return toast('ทีมต้องมีฮีโร่อย่างน้อย 1 ตัว');
        team.splice(i, 1);
      } else if (j >= 0) reserves.splice(j, 1);
      else if (team.length < TEAM_SIZE) team.push(id);
      else if (reserves.length < RESERVE_SIZE) reserves.push(id);
      else return toast(`ทีมเต็มแล้ว (${TEAM_SIZE} + ทีมพิเศษ ${RESERVE_SIZE}) — แตะฮีโร่ในทีมเพื่อเอาออกก่อน`);
      changed();
      ctx.refresh();
    };
    const slot = (i: number) => {
      const def = team[i] ? heroById(team[i]) : undefined;
      if (!def)
        return h('div', { class: 'card px-cut tm-slot empty' }, h('div', { class: 'tm-plus' }, '+'), h('div', { class: 'ds' }, `ช่อง ${i + 1}`));
      const front = def.class === 'tank' || def.class === 'warrior';
      return h('button', { class: `card px-cut tm-slot r-${def.rarity}`, onclick: () => toggle(def.id), title: 'แตะเพื่อเอาออกจากทีม' },
        face(def.look), h('div', { class: 'nm' }, def.name),
        h('div', { class: 'ds' }, classIcon(def.class, 16), front ? 'แถวหน้า' : 'แถวหลัง'));
    };
    const special = (i: number) => {
      const def = reserves[i] ? heroById(reserves[i]) : undefined;
      if (!def)
        return h('div', { class: 'card px-cut tm-slot empty special' }, h('div', { class: 'tm-plus' }, '+'), h('div', { class: 'ds' }, `พิเศษ ${i + 1}`));
      return h('button', { class: `card px-cut tm-slot special r-${def.rarity}`, onclick: () => toggle(def.id), title: 'แตะเพื่อเอาออกจากทีมพิเศษ' },
        face(def.look), h('div', { class: 'nm' }, def.name), h('div', { class: 'ds' }, classIcon(def.class, 16), 'เรียกใช้สกิล 1'));
    };
    body.append(
      h('h4', { class: 'tm-h' }, `ทีมหลัก (${team.length}/${TEAM_SIZE}) — ลงสนาม`),
      h('div', { class: 'grid tm-slots' }, Array.from({ length: TEAM_SIZE }, (_, i) => slot(i))),
      h('h4', { class: 'tm-h' }, `ทีมพิเศษ (${reserves.length}/${RESERVE_SIZE}) — ไม่ลงสนาม เพื่อนเรียกลงมาร่ายสกิล 1 แล้วพักหลายเทิร์น`),
      h('div', { class: 'grid tm-slots tm-special' }, Array.from({ length: RESERVE_SIZE }, (_, i) => special(i))),
      h('h4', { class: 'tm-h' }, 'ฮีโร่ของฉัน'),
      h('div', { class: 'tm-pool' },
        player.heroes.map((own) => {
          const def = heroById(own.id);
          if (!def) return null;
          return h('button', { class: `chip px-cut tm-pick ${team.includes(def.id) ? 'on' : reserves.includes(def.id) ? 'on special' : ''}`, onclick: () => toggle(def.id) }, face(def.look), def.name, classIcon(def.class, 16));
        })),
      h('p', { class: 'note', style: 'margin-top:10px' }, 'ทีมหลัก 5 ตัว: แทงค์และนักรบยืนแถวหน้า (ถึกขึ้น) · ที่เหลือยืนแถวหลัง (ตีแรงขึ้น) · ทีมพิเศษ 2 ตัว: ไม่ลงสนาม ไม่โดนตี ไม่ตีปกติ ไม่รับบัฟ — ตัวในสนามเรียกลงมาร่ายสกิล 1 ได้ครั้งละตัว แล้วต้องรอคูลดาวน์ — ระบบต่อสู้จากเกม LineRanger_TurnBased'),
    );
  },
});

// What the hero list is narrowed to (kept while the game runs).
const filter = {
  elements: new Set<ElementId>(),
  races: new Set<RaceId>(),
  classes: new Set<ClassId>(),
  rarities: new Set<RarityId>(),
  /** The filter's options shown (folded away by default: just the bar). */
  open: false,
};

/** An element's icon, its name as the tooltip. */
export const elementIcon = (id: ElementId, size = 20) => {
  const i = icon(`el_${id}`, size, 'el-ico');
  i.title = ELEMENTS.find((e) => e.id === id)?.name ?? '';
  return i;
};
/** A race's crest, its name as the tooltip. */
export const raceIcon = (id: RaceId, size = 20) => {
  const i = icon(`race_${id}`, size, 'race-ico');
  i.title = RACES.find((r) => r.id === id)?.name ?? '';
  return i;
};
/** A class's icon, its name as the tooltip. */
export const classIcon = (id: ClassId, size = 20) => {
  const i = icon(`cls_${id}`, size, 'cls-ico');
  i.title = CLASSES.find((c) => c.id === id)?.name ?? '';
  return i;
};
const rarityOf = (id: RarityId) => RARITIES.find((r) => r.id === id)!;
const classOf = (id: ClassId) => CLASSES.find((c) => c.id === id)!;
/** A hero's picture: its face for the list, standing with its weapon for its own page (big: at 2x, so a weapon drawn
 * fine shows its detail). */
const heroPicture = (look: string, kind: 'face' | 'full' | 'big', cls: string) =>
  h('img', { class: `hero-pic ${cls}`, src: `assets/characters/heroes/${look}_${kind}.png`, alt: '', draggable: false });
/** Stars: filled up to `n`, of five. */
const starRow = (n: number) =>
  h('div', { class: 'star-row' }, Array.from({ length: MAX_STARS }, (_, i) => h('i', { class: i < n ? 'on' : '' })));

registerPanel('heroes', {
  title: 'ฮีโร่',
  icon: 'heroes',
  build(body, _tab, ctx) {
    const all = player.heroes.flatMap((o) => {
      const def = heroById(o.id);
      return def ? [{ o, def }] : [];
    });
    const shown = all.filter(
      ({ def }) =>
        (!filter.elements.size || filter.elements.has(def.element)) &&
        (!filter.races.size || filter.races.has(def.race)) &&
        (!filter.classes.size || filter.classes.has(def.class)) &&
        (!filter.rarities.size || filter.rarities.has(def.rarity)),
    );
    const any = filter.elements.size + filter.races.size + filter.classes.size + filter.rarities.size > 0;
    const toggle = <T,>(set: Set<T>, v: T) => () => {
      if (set.has(v)) set.delete(v);
      else set.add(v);
      ctx.refresh();
    };
    const chip = (on: boolean, onclick: () => void, ...content: (Node | string)[]) =>
      h('button', { class: `chip px-cut hf-opt${on ? ' on' : ''}`, onclick }, ...content);
    const row = (label: string, ...chips: (Node | Node[])[]) =>
      h('div', { class: 'hf-row' }, h('span', { class: 'hf-label' }, label), h('div', { class: 'hf-grid' }, ...chips));
    const count = filter.elements.size + filter.races.size + filter.classes.size + filter.rarities.size;
    const clear = () => (filter.elements.clear(), filter.races.clear(), filter.classes.clear(), filter.rarities.clear(), ctx.refresh());
    // what's on, as small tags on the bar (a tap takes it off)
    const tag = (onclick: () => void, title: string, ...content: (Node | string)[]) =>
      h('button', { class: 'hf-tag px-cut', title: `${title} · แตะเพื่อเอาออก`, onclick }, ...content, h('b', null, '×'));
    const tags = [
      ...CLASSES.filter((c) => filter.classes.has(c.id)).map((c) => tag(toggle(filter.classes, c.id), c.name, classIcon(c.id, 16))),
      ...RARITIES.filter((r) => filter.rarities.has(r.id)).map((r) => tag(toggle(filter.rarities, r.id), r.name, h('span', { class: `rar-dot ${r.id}` }), r.name)),
      ...ELEMENTS.filter((e) => filter.elements.has(e.id)).map((e) => tag(toggle(filter.elements, e.id), e.name, elementIcon(e.id, 16))),
      ...RACES.filter((r) => filter.races.has(r.id)).map((r) => tag(toggle(filter.races, r.id), r.name, raceIcon(r.id, 16))),
    ];

    body.append(
      h('div', { class: `hero-filter${filter.open ? ' open' : ''}` },
        // the bar: the filter button (how many are on), what's on, how many shown, clear
        h('div', { class: 'hf-bar' },
          h('button', { class: `chip px-cut hf-toggle${filter.open ? ' on' : ''}`, onclick: () => ((filter.open = !filter.open), ctx.refresh()) },
            h('span', { class: 'hf-funnel' }), 'ตัวกรอง', count ? h('span', { class: 'hf-count' }, String(count)) : null, h('span', { class: 'hf-caret' }, filter.open ? '▴' : '▾')),
          h('span', { class: 'note hf-shown' }, `แสดง ${shown.length} / ${all.length}`),
          // what's on (a line of its own), and clearing it all at its end
          h('div', { class: 'hf-tags' }, ...tags, any ? h('button', { class: 'hf-tag hf-clear px-cut', onclick: clear }, 'ล้างทั้งหมด') : null)),
        // the options: one row per kind, every button the same width in a grid
        filter.open
          ? h('div', { class: 'hf-panel' },
            row('อาชีพ', CLASSES.map((c) => chip(filter.classes.has(c.id), toggle(filter.classes, c.id), classIcon(c.id), c.name))),
            row('ระดับ', RARITIES.map((r) => chip(filter.rarities.has(r.id), toggle(filter.rarities, r.id), h('span', { class: `rar-dot ${r.id}` }), r.name))),
            row('ธาตุ',
              ELEMENTS.map((e) => chip(filter.elements.has(e.id), toggle(filter.elements, e.id), elementIcon(e.id), e.name))),
            row('เผ่า', RACES.map((r) => chip(filter.races.has(r.id), toggle(filter.races, r.id), raceIcon(r.id), r.name.replace(/^เผ่า/, '')))),
            // the element chart, as the owner set it: fire > wood > water > fire, light and dark beat each other
            h('div', { class: 'hf-foot' },
              h('span', { class: 'hf-chart', title: 'ธาตุที่ชนะทางตีแรงขึ้น ×1.5 แพ้ทางตีเบาลง ×0.5' },
                elementIcon('fire', 16), '›', elementIcon('wood', 16), '›', elementIcon('water', 16), '›', elementIcon('fire', 16),
                h('i', null), elementIcon('light', 16), '⇄', elementIcon('dark', 16)),
              h('span', { class: 'note' }, 'ชนะทาง ×1.5 · แพ้ทาง ×0.5')))
          : null),
    );

    if (!all.length) {
      body.append(
        h('div', { class: 'empty' },
          icon('heroes', 64),
          h('div', null, 'ยังไม่มีฮีโร่'),
          h('div', { class: 'note' }, 'อัญเชิญฮีโร่ได้ที่ ซัมม่อน'),
          h('button', { class: 'btn purple px-cut', onclick: () => ctx.open('summon') }, icon('summon', 20), 'ไปที่ซัมม่อน')),
      );
      return;
    }
    if (!shown.length) {
      body.append(h('div', { class: 'empty' }, icon('heroes', 64), h('div', null, 'ไม่มีฮีโร่ที่ตรงกับตัวกรอง')));
      return;
    }
    body.append(
      h('div', { class: 'grid hero-grid' },
        shown.map(({ o, def }) =>
          h('button', { class: `card hero-card px-cut r-${def.rarity}`, onclick: () => ctx.open('hero', def.id) },
            h('div', { class: 'hc-top' },
              classIcon(def.class, 20),
              h('span', { class: `rar-tag ${def.rarity}` }, rarityOf(def.rarity).name)),
            // its element
            h('div', { class: 'hc-els' }, elementIcon(def.element, 22)),
            h('div', { class: 'art' }, heroPicture(def.look, 'face', 'hc-face')),
            h('div', { class: 'nm' }, def.name),
            h('div', { class: 'ds hc-race' }, raceIcon(def.race, 16), RACES.find((r) => r.id === def.race)?.name ?? ''),
            starRow(o.stars),
            h('div', { class: 'note' }, `Lv. ${o.level}`)))),
    );
  },
});

// One hero's own page: who it is, its stats, gear, skills and talents (C1..C5 by stars).
registerPanel('hero', {
  title: 'ฮีโร่',
  icon: 'heroes',
  build(body, heroId, ctx) {
    const def = heroById(heroId);
    const own = player.heroes.find((o) => o.id === heroId);
    if (!def || !own) {
      body.append(h('div', { class: 'empty' }, 'ไม่พบฮีโร่'));
      return;
    }
    const rar = rarityOf(def.rarity), cls = classOf(def.class);
    const need = copiesForNextStar(def.rarity, own.stars);
    const fmtStat = (v: number, pct?: boolean) => (pct ? `${v}%` : v.toLocaleString('en-US'));
    const skill = (tag: string, s: { name: string; cost: number; text: string }) =>
      h('div', { class: 'hd-skill px-cut' },
        h('div', { class: 'hs-head' },
          h('span', { class: 'hs-tag' }, tag), h('b', null, s.name),
          s.cost ? h('span', { class: 'hs-cost' }, `พลังงาน ${s.cost}`) : null),
        h('div', { class: 'hs-text' }, s.text));

    body.append(
      h('div', { class: `hero-detail r-${def.rarity}` },
        // left: the hero itself
        h('div', { class: 'hd-left' },
          h('button', { class: 'chip px-cut hd-back', onclick: () => ctx.open('heroes') }, '‹ รายชื่อฮีโร่'),
          h('div', { class: 'hd-stage' }, heroPicture(def.look, 'big', 'hd-full')),
          h('div', { class: 'hd-name' }, def.name),
          h('div', { class: 'hd-title' }, def.title),
          h('div', { class: 'hd-tags' },
            h('span', { class: `rar-tag ${def.rarity}` }, rar.name),
            h('span', { class: 'hd-tag' }, classIcon(def.class, 18), cls.name),
            h('span', { class: 'hd-tag' }, raceIcon(def.race, 18), RACES.find((r) => r.id === def.race)?.name ?? '')),
          h('div', { class: 'hd-tags' },
            h('span', { class: 'hd-tag' }, elementIcon(def.element, 18), ELEMENTS.find((x) => x.id === def.element)?.name ?? '')),
          starRow(own.stars),
          h('div', { class: 'note' }, `Lv. ${own.level} · C${own.stars}`)),
        // right: what it can do
        h('div', { class: 'hd-right' },
          h('h4', null, 'ค่าสถานะ'),
          h('div', { class: 'hd-stats' },
            STATS.map((s) => h('div', { class: 'hd-stat' }, h('span', null, s.name), h('b', { class: 'num' }, fmtStat(def.base[s.id], s.pct))))),
          h('h4', null, 'อุปกรณ์'),
          h('div', { class: 'hd-gear' },
            GEAR_SLOTS.map((g) => h('div', { class: 'hd-slot px-cut' }, h('span', { class: 'hg-plus' }, '+'), h('small', null, g.name)))),
          h('h4', null, `ความสามารถอาชีพ — ${cls.trait.name}`),
          h('p', { class: 'hd-trait' }, cls.trait.text),
          h('h4', null, 'สกิล'),
          skill('ตีปกติ', def.normal),
          skill('สกิล 1', def.skill1),
          skill('สกิล 2', def.skill2),
          skill('อัลติเมต', { ...def.ult, text: `${def.ult.text} (ชาร์จเต็ม ${ULT.max}% จึงใช้ได้ ในเทิร์นของตัวเอง ไม่ใช้พลังงานทีม ไม่จบเทิร์น)` }),
          skill('ติดตัว', { name: def.passive.name, cost: 0, text: def.passive.text }),
          h('h4', null, 'พรสวรรค์ (ดาว)'),
          h('div', { class: 'note' },
            own.stars < MAX_STARS
              ? `ใช้ตัวซ้ำ ${need} ตัวต่อ 1 ดาว (${rar.name}) · มีอยู่ ${own.copies} ตัว`
              : 'ดาวเต็มแล้ว (C5)'),
          def.talents.map((t, i) =>
            h('div', { class: `hd-talent px-cut${own.stars > i ? ' on' : ''}` },
              h('span', { class: 'ht-c' }, `C${i + 1}`),
              h('div', null, h('b', null, t.name), h('div', { class: 'hs-text' }, t.text)))))),
    );
  },
});

registerPanel('summon', {
  title: 'ซัมม่อน',
  icon: 'summon',
  build(body) {
    const stars = h('div', { class: 'stars' },
      Array.from({ length: 22 }, () => {
        const s = h('i');
        s.style.left = `${Math.random() * 100}%`;
        s.style.top = `${Math.random() * 100}%`;
        s.style.animationDelay = `${Math.random() * 2.6}s`;
        return s;
      }));
    const pull = (n: number) => {
      const cost = n === 1 ? 160 : 1600;
      if (player.gems < cost) return toast('เพชรไม่พอ');
      toast('ยังไม่มีรายชื่อฮีโร่ในระบบ — ซัมม่อนจะเปิดพร้อมฮีโร่ชุดแรก');
    };
    body.append(
      h('div', { class: 'banner px-cut', style: art('summon') },
        stars,
        h('div', { class: 'orb' }, icon('summon', 140)),
        h('div', { class: 'copy' },
          h('span', { class: 'note', style: 'color:#c9b5ff' }, 'แบนเนอร์ถาวร'),
          h('h3', null, 'การอัญเชิญแห่งตำนาน'),
          h('p', null, 'อัญเชิญเหล่าฮีโร่จากทั่วดินแดน Mythoria มาร่วมทีมของคุณ'),
          h('div', { class: 'note', style: 'color:#b9a6e6' }, 'การันตีฮีโร่ระดับสูงสุดภายใน — ครั้ง (ประกาศเมื่อเปิดระบบ)'))),
      h('div', { class: 'pull-row' },
        h('button', { class: 'btn purple px-cut', onclick: () => pull(1) },
          h('span', null, 'อัญเชิญ 1 ครั้ง'), h('span', { style: 'display:flex;gap:4px;align-items:center' }, icon('gem', 20), h('span', { class: 'num' }, fmt(160)))),
        h('button', { class: 'btn gold px-cut', onclick: () => pull(10) },
          h('span', null, 'อัญเชิญ 10 ครั้ง'), h('span', { style: 'display:flex;gap:4px;align-items:center' }, icon('gem', 20), h('span', { class: 'num' }, fmt(1600))))),
      h('p', { class: 'note', style: 'text-align:center;margin-top:12px' },
        'อัตราการออกของฮีโร่แต่ละระดับจะเปิดเผยครบถ้วนก่อนเปิดระบบ'),
    );
  },
});
