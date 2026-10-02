/**
 * 标题页。背景仍是关卡那套视差，标题和按钮随画面居中。
 * 「方块跑酷」用分色厚描边。选关和无尽模式都是糖果按钮，无尽模式一开始就能进。
 */
import Phaser from 'phaser';
import { TUNING } from '../logic/world.js';
import { THEME } from '../game/theme.js';
import {
  createParallax,
  layoutParallax,
  scrollParallax,
  tintParallax,
} from '../game/backdrop.js';
import { createHud } from '../game/hud.js';
import { addCandyText, createCandyButton, createCandyLogo } from '../game/candy.js';
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

    this.logo = createCandyLogo(this, '方块跑酷');
    this.subtitle = addCandyText(this, 0, 0, '方块会自动向前跑\n点击、空格或上方向键跳跃\n收集星星，解锁后面的关卡', {
      size: 22,
      color: '#ffffff',
      stroke: '#3b0764',
      strokeThickness: 5,
      align: 'center',
      lineSpacing: 8,
    }).setDepth(10);

    this.start = createCandyButton(this, {
      label: '选关',
      variant: 'pink',
      width: 188,
      fontSize: 34,
      depth: 20,
      onClick: () => {
        getSynth().unlock();
        this.scene.start('select');
      },
    });
    // 无尽模式不看星星，和选关并排，样式仍是同一套糖果按钮。
    this.endlessButton = createCandyButton(this, {
      label: '无尽模式',
      variant: 'grape',
      width: 210,
      fontSize: 32,
      depth: 20,
      onClick: () => {
        getSynth().unlock();
        this.scene.start('game', { mode: 'endless' });
      },
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
    const topGuard = Math.max(layout.sound.y + 58, (insets.top || 0) + 72);
    const bottomGuard = viewH - Math.max(insets.bottom || 0, 0) - 28;
    const mid = (topGuard + bottomGuard) / 2;
    this.logo.setPosition(layout.centerX, mid - 128);
    this.subtitle.setPosition(layout.centerX, mid - 4);
    const buttonY = mid + 116;
    const pairGap = 18;
    const pair = 188 + 210 + pairGap;
    this.start.setPosition(layout.centerX - pair / 2 + 188 / 2, buttonY);
    this.endlessButton.setPosition(layout.centerX + pair / 2 - 210 / 2, buttonY);
    tintParallax(this.parallax, 0);
  }
}
