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
    // the town's people, made from the hero's parts (tools/npc_parts.py)
    this.load.atlas('npcs', 'assets/characters/npcs.png', 'assets/characters/npcs.json');
    // the heroes' parts and weapons (tools/hero_parts.py), for battles
    this.load.atlas('heroes', 'assets/characters/heroes.png', 'assets/characters/heroes.json');

    const world = 'assets/world/';
    // the prop atlas is loaded raw and colour-graded before it becomes the 'meadow' atlas
    this.load.image('meadow_raw', `${world}meadow.png`);
    this.load.json('meadow_frames', `${world}meadow.json`);
    // the animals' parts (tools/animal_parts.py), graded the same way
    this.load.image('animals_raw', `${world}animals.png`);
    this.load.json('animals_frames', `${world}animals.json`);
    // the monsters' frames (tools/monster_parts.py), graded the same way
    this.load.image('monsters_raw', `${world}monsters.png`);
    this.load.json('monsters_frames', `${world}monsters.json`);
    this.load.image('tiles_water', `${world}tiles_water.png`);
    this.load.image('tiles_path', `${world}tiles_path.png`);
    this.load.image('tiles_cobble', `${world}tiles_cobble.png`);
    this.load.image('tiles_dark', `${world}tiles_dark.png`);
    this.load.json('tiles', `${world}tiles.json`);
  }

  create(): void {
    registerHandTextures(this);
    const raw = this.textures.get('meadow_raw').getSourceImage() as HTMLImageElement;
    this.textures.addAtlasJSONHash('meadow', gradedCopy(raw) as unknown as HTMLImageElement, this.cache.json.get('meadow_frames'));
    this.textures.remove('meadow_raw');
    const beasts = this.textures.get('animals_raw').getSourceImage() as HTMLImageElement;
    this.textures.addAtlasJSONHash('animals', gradedCopy(beasts) as unknown as HTMLImageElement, this.cache.json.get('animals_frames'));
    this.textures.remove('animals_raw');
    const monsters = this.textures.get('monsters_raw').getSourceImage() as HTMLImageElement;
    this.textures.addAtlasJSONHash('monsters', gradedCopy(monsters) as unknown as HTMLImageElement, this.cache.json.get('monsters_frames'));
    this.textures.remove('monsters_raw');
    this.scene.start('World');
  }
}
