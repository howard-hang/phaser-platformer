/**
 * 启动场景：生成几何贴图后进入标题。
 * 选关和关卡都复用这里烤好的背景。
 */
import Phaser from 'phaser';
import { generateTextures } from '../game/textures.js';
import { bakeBackdropTextures } from '../game/backdrop.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    generateTextures(this);
    // 背景贴图只烤一次，后面的场景滚动时不再重画。
    bakeBackdropTextures(this);
    this.scene.start('menu');
  }
}
