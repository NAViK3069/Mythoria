import * as Phaser from 'phaser';
import './style.css';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2b1f',
  pixelArt: true,
  // Off: parts move by fractions of a pixel for smooth animation (each zoomed pixel is several screen pixels).
  roundPixels: false,
  fps: { target: 60, smoothStep: true },
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 2 },
  scene: [BootScene, WorldScene],
});

// Handy for debugging in the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
