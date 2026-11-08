import * as Phaser from 'phaser';
import { registerHandTextures } from '../world/MasterCharacter';

/** Loads the art, then starts the world. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const dir = 'assets/characters/master/';
    this.load.image('master_head', `${dir}head.png`);
    this.load.image('master_body', `${dir}body.png`);
    this.load.image('master_leg_l', `${dir}leg_l.png`);
    this.load.image('master_leg_r', `${dir}leg_r.png`);

    const world = 'assets/world/';
    this.load.atlas('meadow', `${world}meadow.png`, `${world}meadow.json`);
    this.load.image('tiles_water', `${world}tiles_water.png`);
    this.load.image('tiles_path', `${world}tiles_path.png`);
    this.load.image('tiles_dark', `${world}tiles_dark.png`);
    this.load.json('tiles', `${world}tiles.json`);
  }

  create(): void {
    registerHandTextures(this);
    this.scene.start('World');
  }
}
