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
  }

  create(): void {
    registerHandTextures(this);
    this.scene.start('World');
  }
}
