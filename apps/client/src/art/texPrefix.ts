// Textures a map's view bakes (its ground, shadows, light, clouds, ponds...) are named with this in front,
// read when the view is made: the battle's arena (BattleScene) bakes its own set under 'bt:' while the world's
// map sleeps with its set intact.
export let TEX = '';
export function setTexPrefix(p: string): void {
  TEX = p;
}
