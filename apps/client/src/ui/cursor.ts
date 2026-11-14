// The mouse cursor: our own pixel art (16 x 16, shown at 2x = 32 px). A gauntlet pointing up-left, after the owner's
// picture (steel finger and knuckles, a blue fist, a gold cuff) everywhere; over a monster you can fight, a sword
// (world: WorldScene sets it). Touch screens have no cursor - nothing changes there.

type Pal = Record<string, string>;
const PAL: Pal = {
  K: '#14121e', w: '#f0f4fc', s: '#c4cee2', S: '#8492b0',
  b: '#4668aa', B: '#283e76', n: '#1a2852', g: '#face50', G: '#b07c1c',
};

/** The gauntlet: its fingertip (top left) is where it points. */
const GLOVE = [
  'KK..............',
  'KwK.............',
  'KswK............',
  '.KsSK...........',
  '..KsSK..........',
  '...KsSKKKKKK....',
  '...KsSKwsKwsKK..',
  '..KKsSKsSKsSKsK.',
  '.KwsKKKKKKKKKSK.',
  '.KsSKbbbbbbbbSK.',
  '..KSKbbbbbbbbBK.',
  '...KKbbbbbbbbBK.',
  '....KggBbbbbBBK.',
  '.....KGggggggK..',
  '......KKGGGGgK..',
  '........KKKKK...',
];

/** The sword: its point (top left) is where it points. */
const SWORD = [
  'KK..............',
  'KwsK............',
  'KswSK...........',
  '.KsSSK..........',
  '..KsSSK.........',
  '...KsSSK........',
  '....KsSSK.......',
  '.....KsSSK......',
  '......KsSSK.KK..',
  '.......KsSSKgK..',
  '........KsSgGK..',
  '.........KgGK...',
  '........KgGKnK..',
  '.......KGKKKnnK.',
  '...........KnbK.',
  '............KK..',
];

const SCALE = 2;

function url(rows: string[]): string {
  const c = document.createElement('canvas');
  c.width = rows[0].length * SCALE;
  c.height = rows.length * SCALE;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = row[x];
      if (k === '.') continue;
      g.fillStyle = PAL[k];
      g.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }
  });
  return c.toDataURL('image/png');
}

/** Put the cursors in place (once, at start). */
export function setupCursors(): void {
  const root = document.documentElement.style;
  // (the hot spot: the fingertip / the sword's point, a pixel in from the corner)
  root.setProperty('--cur-hand', `url(${url(GLOVE)}) 2 2, auto`);
  root.setProperty('--cur-sword', `url(${url(SWORD)}) 2 2, crosshair`);
  document.body.classList.add('cur-game');
}

/** The sword over a monster you can fight (false: the gauntlet again). */
export function swordCursor(on: boolean): void {
  document.body.classList.toggle('cur-sword', on);
}
