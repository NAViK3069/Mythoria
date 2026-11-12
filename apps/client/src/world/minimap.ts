import type * as Phaser from 'phaser';
import { makeCanvas } from '../art/pixel';
import { TILE, type MeadowMap } from './meadowMap';

/** World px per minimap px. */
export const MINIMAP_SCALE = 4;

/**
 * A small picture of the whole map for the HUD, drawn once: the baked ground
 * scaled down, then every tree, wall, rock and bush as a miniature of its own
 * sprite (sorted by depth, like the world), then a soft edge.
 */
export function renderMinimap(scene: Phaser.Scene, map: MeadowMap): HTMLCanvasElement {
  const W = (map.cols * TILE) / MINIMAP_SCALE;
  const H = (map.rows * TILE) / MINIMAP_SCALE;
  const [c, g] = makeCanvas(W, H);
  const ground = scene.textures.get('ground').getSourceImage() as CanvasImageSource;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(ground, 0, 0, W, H);

  const shown = map.objects
    .filter((o) => o.frame && (o.kind === 'tree' || o.kind === 'wall' || o.kind === 'pillar' || o.kind === 'rock' || o.kind === 'bush' || o.kind === 'prop' || o.kind === 'house' || o.kind === 'tent' || o.kind === 'post'))
    .sort((a, b) => a.y - b.y);
  for (const o of shown) {
    const f = scene.textures.getFrame('meadow', o.frame);
    const w = f.cutWidth / MINIMAP_SCALE;
    const h = f.cutHeight / MINIMAP_SCALE;
    g.save();
    g.translate(o.x / MINIMAP_SCALE, 0);
    if (o.flip) g.scale(-1, 1);
    g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, -w / 2, o.y / MINIMAP_SCALE - h, w, h);
    g.restore();
  }

  // lift it a little: the world is graded dark and moody, a map should read at a glance
  g.globalCompositeOperation = 'screen';
  g.fillStyle = 'rgba(60, 80, 70, 0.35)';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return c;
}
