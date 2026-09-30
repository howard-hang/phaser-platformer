/**
 * 启动场景：生成几何贴图后进入标题。
 * 选关和关卡都复用这里烤好的背景。
 */
import Phaser from 'phaser';
import { generateTextures } from '../game/textures.js';
import { bakeBackdropTextures } from '../game/backdrop.js';
import { CONFIG_ERROR } from '../game/level.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    // 配置坏了先把错误画出来，不再进标题，避免白屏。
    if (CONFIG_ERROR) {
      this.scene.start('config-error');
      return;
    }
    generateTextures(this);
    // 背景贴图只烤一次，后面的场景滚动时不再重画。
    bakeBackdropTextures(this);
    this.scene.start('menu');
  }
}
