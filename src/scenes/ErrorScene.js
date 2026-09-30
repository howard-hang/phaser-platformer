/**
 * 关卡 JSON 不合法时显示原因。避免模块加载失败后整页空白。
 */
import Phaser from 'phaser';
import { FONT } from '../game/theme.js';
import { CONFIG_ERROR } from '../game/level.js';

export class ErrorScene extends Phaser.Scene {
  constructor() {
    super('config-error');
  }

  create() {
    this.cameras.main.setBackgroundColor('#2a0838');
    this.title = this.add.text(0, 0, '关卡配置有误', {
      fontFamily: FONT,
      fontSize: '36px',
      color: '#ffffff',
    }).setOrigin(0.5, 0);
    this.body = this.add.text(0, 0, CONFIG_ERROR || '未知配置错误', {
      fontFamily: FONT,
      fontSize: '22px',
      color: '#ffe4e6',
      align: 'left',
    }).setOrigin(0, 0);
    this.scale.on('resize', this.applyViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyViewport, this);
    });
    this.applyViewport();
  }

  applyViewport() {
    const width = this.scale.width;
    const height = this.scale.height;
    const side = 28;
    this.title.setPosition(width / 2, 28);
    this.body.setWordWrapWidth(Math.max(200, width - side * 2));
    this.body.setPosition(side, 84);
    this.body.setFixedSize(Math.max(200, width - side * 2), Math.max(80, height - 110));
  }
}
