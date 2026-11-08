import * as Phaser from 'phaser';
import './style.css';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

// Render at the screen's real pixel density (capped at 2 for speed) so the
// pixel art stays sharp on phones and iPads, then shrink the canvas back to CSS size.
export const DPR = Math.min(window.devicePixelRatio || 1, 2);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2b1f',
  pixelArt: true,
  // Off: parts move by fractions of a pixel for smooth animation.
  roundPixels: false,
  fps: { target: 60, smoothStep: true },
  scale: {
    mode: Phaser.Scale.NONE,
    width: Math.round(window.innerWidth * DPR),
    height: Math.round(window.innerHeight * DPR),
    zoom: 1 / DPR,
  },
  input: { activePointers: 2 },
  scene: [BootScene, WorldScene],
});

window.addEventListener('resize', () => {
  game.scale.resize(Math.round(window.innerWidth * DPR), Math.round(window.innerHeight * DPR));
});

// Handy for debugging in the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
