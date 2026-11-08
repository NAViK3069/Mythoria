import * as Phaser from 'phaser';
import { gradedCopy } from '../art/grade';
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
    // the prop atlas is loaded raw and colour-graded before it becomes the 'meadow' atlas
    this.load.image('meadow_raw', `${world}meadow.png`);
    this.load.json('meadow_frames', `${world}meadow.json`);
    this.load.image('tiles_water', `${world}tiles_water.png`);
    this.load.image('tiles_path', `${world}tiles_path.png`);
    this.load.image('tiles_dark', `${world}tiles_dark.png`);
    this.load.json('tiles', `${world}tiles.json`);
  }

  create(): void {
    registerHandTextures(this);
    const raw = this.textures.get('meadow_raw').getSourceImage() as HTMLImageElement;
    this.textures.addAtlasJSONHash('meadow', gradedCopy(raw) as unknown as HTMLImageElement, this.cache.json.get('meadow_frames'));
    this.textures.remove('meadow_raw');
    this.scene.start('World');
  }
}
