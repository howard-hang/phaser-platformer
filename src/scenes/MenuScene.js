/**
 * 主页。关卡右上角的房子按钮回到这里，再点开始会重开一局。
 * 背景和关卡用同一套视差贴图，标题和按钮随画面尺寸居中。
 */
import Phaser from 'phaser';
import { TUNING } from '../logic/world.js';
import { FONT, THEME } from '../game/theme.js';
import {
  createParallax,
  layoutParallax,
  scrollParallax,
  tintParallax,
} from '../game/backdrop.js';
import { createHud, createStartButton } from '../game/hud.js';
import { getSynth } from '../game/audio.js';
import { cssInsetsToGame, readSafeAreaInsets, verticalCameraScroll } from '../game/viewport.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    this.cameras.main.setBackgroundColor(THEME.gap);
    this.parallax = createParallax(this);
    this.driftX = 0;

    this.title = this.add.text(0, 0, '方块跑酷', {
      fontFamily: FONT,
      fontSize: '72px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

    this.subtitle = this.add.text(0, 0, '方块会自动向前跑\n点击、空格或上方向键跳跃\n躲开尖刺和方块，捡起星星', {
      fontFamily: FONT,
      fontSize: '26px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

    this.start = createStartButton(this, 480, 390, () => {
      getSynth().unlock();
      this.scene.start('game');
    });

    this.hud = createHud(this, { showStats: false });
    this.scale.on('resize', this.applyViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyViewport, this);
    });
    this.applyViewport();
  }

  /** 主页没有镜头跟随，背景自己慢慢漂移。 */
  update(_time, delta) {
    this.driftX += delta * 0.06;
    scrollParallax(this.parallax, this.driftX);
  }

  applyViewport() {
    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const scrollY = verticalCameraScroll(TUNING.viewHeight, viewH);
    this.cameras.main.setSize(viewW, viewH);
    this.cameras.main.setScroll(0, scrollY);
    const insets = cssInsetsToGame(readSafeAreaInsets(), this.scale.displayScale);
    layoutParallax(this.parallax, viewW, viewH, scrollY);
    const layout = this.hud.relayout({ viewWidth: viewW, viewHeight: viewH, insets });
    this.title.setPosition(layout.centerX, layout.centerY - 120);
    this.subtitle.setPosition(layout.centerX, layout.centerY - 30);
    this.start.setPosition(layout.centerX, layout.centerY + 120);
    tintParallax(this.parallax, 0);
  }
}
