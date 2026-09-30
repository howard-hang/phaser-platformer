/**
 * 启动场景：生成几何贴图后直接进入关卡。
 * 打开页面就能看到方块在跑，不用先点开始。
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
    this.scene.start('game');
  }
}
