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
import { addCandyText, createCandyButton, createCandyLogo, shrinkToWidth } from '../game/candy.js';
import { getSynth } from '../game/audio.js';
import { cssInsetsToGame, readSafeAreaInsets, verticalCameraScroll } from '../game/viewport.js';
import { t } from '../i18n/index.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    this.cameras.main.setBackgroundColor(THEME.gap);
    this.parallax = createParallax(this);
    this.driftX = 0;

    this.logo = createCandyLogo(this, t('app.name'));
    this.subtitle = addCandyText(this, 0, 0, t('menu.subtitle'), {
      size: 22,
      color: '#ffffff',
      stroke: '#3b0764',
      strokeThickness: 5,
      align: 'center',
      lineSpacing: 8,
    }).setScrollFactor(0).setDepth(10);

    this.start = createCandyButton(this, {
      label: t('menu.levels'),
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
      label: t('menu.endless'),
      variant: 'grape',
      width: 210,
      fontSize: 32,
      depth: 20,
      onClick: () => {
        getSynth().unlock();
        this.scene.start('game', { mode: 'endless' });
      },
    });

    this.hud = createHud(this, {
      showStats: false,
      showSettings: true,
      onSettings: () => this.scene.start('settings'),
    });
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
    const contentW = Math.min(680, viewW - Math.max(insets.left || 0, insets.right || 0) * 2 - 48);
    this.logo.setPosition(layout.centerX, mid - 128);
    this.logo.fitWidth(contentW);
    this.subtitle.setWordWrapWidth(contentW);
    let subtitleSize = 22;
    this.subtitle.setFontSize(subtitleSize);
    while (subtitleSize > 16 && this.subtitle.height > 108) {
      subtitleSize -= 1;
      this.subtitle.setFontSize(subtitleSize);
    }
    shrinkToWidth(this.subtitle, contentW, 16);
    this.subtitle.setPosition(layout.centerX, mid - 4);
    const buttonY = mid + 116;
    const pairGap = 18;
    const pair = 188 + 210 + pairGap;
    this.start.setPosition(layout.centerX - pair / 2 + 188 / 2, buttonY);
    this.endlessButton.setPosition(layout.centerX + pair / 2 - 210 / 2, buttonY);
    tintParallax(this.parallax, 0);
  }
}
