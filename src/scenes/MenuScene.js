/**
 * 主页。关卡右上角的房子按钮回到这里，再点开始会重开一局。
 */
import Phaser from 'phaser';
import { TUNING } from '../logic/world.js';
import { FONT, THEME } from '../game/theme.js';
import { drawBackdrop } from '../game/backdrop.js';
import { createHud, createStartButton } from '../game/hud.js';
import { getSynth } from '../game/audio.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    this.cameras.main.setBackgroundColor(THEME.gap);
    drawBackdrop(this, TUNING.viewWidth, TUNING.viewHeight);

    this.add.text(480, 150, '方块跑酷', {
      fontFamily: FONT,
      fontSize: '72px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(480, 240, '方块会自动向前跑\n点击、空格或上方向键跳跃\n躲开尖刺和方块，捡起星星', {
      fontFamily: FONT,
      fontSize: '26px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5);

    createStartButton(this, 480, 390, () => {
      getSynth().unlock();
      this.scene.start('game');
    });

    createHud(this, { showStats: false });
  }
}
