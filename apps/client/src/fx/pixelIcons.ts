import { mixRGB, type RGB, type Surface } from './surface';

// Small pixel icons drawn by code - one set for both the field (fx/BattleLayer.ts, world pixels) and the battle HUD
// (ui/pixelKit.ts turns them into pictures): status effects, the elements, the energy crystal, the heart. Each is a
// grid of letters: 'a' light, 'b' dark of the icon's colour, 'w' white, '#' its own dark line; a dark outline is
// added round every icon so it reads on any ground.

export interface Icon {
  rows: string[];
  /** The icon's colour (a / b come from it unless pal says otherwise). */
  colour: RGB;
  pal?: Record<string, RGB>;
}

/** Paint an icon with its top-left at (x, y); outline: the dark ring round it (null for none). */
export function paintIcon(s: Surface, x: number, y: number, icon: Icon, outline: RGB | null = 0x080a12, show = 1): void {
  const H = icon.rows.length, W = icon.rows[0].length;
  const pal: Record<string, RGB> = { a: mixRGB(icon.colour, 0xffffff, 0.35), b: mixRGB(icon.colour, 0x000000, 0.25), w: 0xffffff, '#': mixRGB(icon.colour, 0x000000, 0.7), ...icon.pal };
  const on = (cx: number, cy: number) => cy >= 0 && cy < H && cx >= 0 && cx < W && icon.rows[cy][cx] !== '.';
  for (let yy = -1; yy <= H; yy++)
    for (let xx = -1; xx <= W; xx++) {
      if (show < 1 && ((xx + yy) & 1) && show < 0.5) continue;
      if (on(xx, yy)) s.px(x + xx, y + yy, pal[icon.rows[yy][xx]] ?? icon.colour);
      else if (outline !== null && (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1))) s.px(x + xx, y + yy, outline);
    }
}

const UP = ['..w..', '.aaa.', 'aaaaa', '..b..', '..b..'];
const DOWN = ['..a..', '..a..', 'bbbbb', '.bbb.', '..b..'];

/** A status effect's icon (5 x 5): its own picture for the main ones, an arrow up or down for the rest. */
export function statusIcon(type: string, good: boolean): Icon {
  switch (type) {
    case 'poison': return { rows: ['..a..', '.aaa.', 'aawaa', 'abbba', '.bbb.'], colour: 0xb05ae0 };
    case 'bleed': return { rows: ['..a..', '.aaa.', 'aawaa', 'abbba', '.bbb.'], colour: 0xe03a3a };
    case 'burn': return { rows: ['..a..', '.aa..', '.awa.', 'aabba', '.bbb.'], colour: 0xff8a2a };
    case 'stun': return { rows: ['a.a.a', '.aaa.', 'aawaa', '.bbb.', 'b.b.b'], colour: 0xffd23a };
    case 'silence': return { rows: ['a...a', '.a.a.', '..w..', '.b.b.', 'b...b'], colour: 0xb8c0d0 };
    case 'shield': return { rows: ['aaaaa', 'awaaa', 'aaaab', '.abb.', '..b..'], colour: 0x6ab8ff };
    case 'barrier': return { rows: ['.aaa.', 'aw..a', 'a...b', 'a...b', '.bbb.'], colour: 0xffd75a };
    case 'regen': return { rows: ['..a..', '..a..', 'aawab', '..b..', '..b..'], colour: 0x5ee87a };
    case 'healBlock': return { rows: ['a.a..', '.aa..', 'aawab', '..bb.', '..b.b'], colour: 0xe0405a };
    case 'taunt': return { rows: ['..a..', '..a..', '..a..', '.....', '..b..'], colour: 0xff9a3a };
    default: return good ? { rows: UP, colour: 0x5ee87a } : { rows: DOWN, colour: 0xff5a5a };
  }
}

/** An element's sign (7 x 7) in its colour. */
export function elementIcon(id: string | undefined, colour: RGB): Icon {
  const rows: Record<string, string[]> = {
    fire: ['...a...', '..aa...', '..awa..', '.aabba.', '.abwba.', '.abbba.', '..bbb..'],
    water: ['...a...', '...a...', '..aab..', '.awabb.', '.aabbb.', '.abbbb.', '..bbb..'],
    wood: ['....aa.', '..aaab.', '.awabb.', '.aabbb.', '.abbb..', '.bb....', 'b......'],
    light: ['a..a..a', '.aaaaa.', '.awaab.', 'aaabbaa', '.abbbb.', '.abbbb.', 'b..b..b'],
    dark: ['..aaa..', '.aa....', 'aw.....', 'ab.....', 'ab....b', '.bb..b.', '..bbb..'],
  };
  return { rows: rows[id ?? ''] ?? ['..a..', '.aaa.', 'aawaa', '.bbb.', '..b..'], colour };
}

export const CRYSTAL: Icon = { rows: ['...#...', '..#w#..', '.#wab#.', '#waabb#', '#aabbb#', '#abbbb#', '.#bbb#.', '..#b#..', '...#...'], colour: 0x3ac0f0, pal: { '#': 0x0a1a30, a: 0x9af0ff, b: 0x2a8ad8 } };
export const CRYSTAL_OFF: Icon = { rows: CRYSTAL.rows, colour: 0x2a3446, pal: { '#': 0x0a0e18, w: 0x56647a, a: 0x3a4658, b: 0x232b3c } };
/** A small crystal (the energy gauge on the dock), 5 x 7. */
export const CRYSTAL_SM: Icon = { rows: ['..#..', '.#w#.', '#wab#', '#abb#', '#abb#', '.#b#.', '..#..'], colour: 0x3ac0f0, pal: { '#': 0x0a1a30, a: 0x9af0ff, b: 0x2a8ad8 } };
export const CRYSTAL_SM_OFF: Icon = { rows: CRYSTAL_SM.rows, colour: 0x2a3446, pal: { '#': 0x0a0e18, w: 0x56647a, a: 0x3a4658, b: 0x232b3c } };
export const HEART: Icon = { rows: ['.aa.aa.', 'awaaaab', 'aaaaabb', '.aaabb.', '..abb..', '...b...'], colour: 0xff4a5a, pal: { a: 0xff6a6a, b: 0xc02a3a } };
/** The big heart at the left end of the HP bar (as tall as the bar). */
export const HEART_BIG: Icon = {
  rows: [
    '..aaa...aaa..',
    '.awwaa.aaaab.',
    'aawaaaaaaaabb',
    'aaaaaaaaaaabb',
    'aaaaaaaaaabbb',
    '.aaaaaaaaabb.',
    '..aaaaaaabb..',
    '...aaaaabb...',
    '....aaabb....',
    '.....abb.....',
    '......b......',
  ],
  colour: 0xff4a5a,
  pal: { a: 0xff5a64, b: 0xb8243a, w: 0xffd8d8 },
};
export const GEAR: Icon = { rows: ['...a.a...', '..aaaaa..', '.aaw.wab.', 'aaw...bbb', '.a.....b.', 'aab...bbb', '.abb.bbb.', '..bbbbb..', '...b.b...'], colour: 0xc8d4ea };
export const FAST: Icon = { rows: ['a..a...', 'aa.aa..', 'awawaa.', 'abbabbb', 'bb.bb..', 'b..b...'], colour: 0xffd75a };
/** A small star (a hero's star level), lit or not. */
export const STAR: Icon = { rows: ['...a...', '...a...', 'aaawaaa', '.aabaa.', '..bbb..', '.bb.bb.', '.b...b.'], colour: 0xffd75a, pal: { a: 0xffe27a, b: 0xd8962a } };
export const STAR_OFF: Icon = { rows: STAR.rows, colour: 0x3a4258, pal: { a: 0x4a546c, b: 0x2e3446, w: 0x5a6680 } };
export const SWORD: Icon = { rows: ['......w', '.....wa', '....wa.', 'b..wa..', '.bwa...', '.bb....', 'b.b....'], colour: 0xd8e0f0 };
