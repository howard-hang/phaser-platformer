/**
 * 选关。第 1 关始终可进，后面的关按累计最高星数解锁。
 * 返回标题用画面上的按钮；安卓返回键走同一条路。
 */
import Phaser from 'phaser';
import { TUNING } from '../logic/world.js';
import { FONT, THEME } from '../game/theme.js';
import { LEVELS } from '../game/level.js';
import {
  bestStars,
  isLevelUnlocked,
  loadProgress,
  starsRequired,
  starsToUnlock,
  totalBestStars,
} from '../game/progress.js';
import {
  createParallax,
  layoutParallax,
  scrollParallax,
  tintParallax,
} from '../game/backdrop.js';
import { createHud, createStartButton } from '../game/hud.js';
import { getSynth } from '../game/audio.js';
import { cssInsetsToGame, layoutLevelSelect, readSafeAreaInsets, verticalCameraScroll } from '../game/viewport.js';

export class SelectScene extends Phaser.Scene {
  constructor() {
    super('select');
  }

  create() {
    this.cameras.main.setBackgroundColor(THEME.gap);
    this.parallax = createParallax(this, 0);
    this.driftX = 0;
    this.progress = loadProgress();

    this.title = this.add.text(0, 0, '选择关卡', {
      fontFamily: FONT,
      fontSize: '48px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12);

    this.totalText = this.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '22px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12);

    this.cards = LEVELS.map((level) => this.createCard(level));
    this.back = createStartButton(this, 480, 500, () => {
      getSynth().unlock();
      this.scene.start('menu');
    }, '返回标题', 240);

    this.hud = createHud(this, { showStats: false });
    this.scale.on('resize', this.applyViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyViewport, this);
    });
    this.applyViewport();
  }

  createCard(level) {
    const unlocked = isLevelUnlocked(this.progress, level.id);
    const best = bestStars(this.progress, level.id);
    // 填充用实色。半透明在部分 WebGL 上会把整块矩形丢掉。
    const bg = this.add.rectangle(0, 0, 400, 56, unlocked ? 0x2a0838 : 0x3b1848, 1)
      .setStrokeStyle(3, unlocked ? 0xffffff : 0x7a4a86, 1)
      .setScrollFactor(0)
      .setDepth(16);
    const name = this.add.text(0, 0, `${level.index}   ${level.name}`, {
      fontFamily: FONT,
      fontSize: '28px',
      color: unlocked ? '#ffffff' : '#e9d5ff',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(18);
    const status = this.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '22px',
      color: '#ffffff',
      align: 'right',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(18);
    const need = this.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '18px',
      color: '#f5d0fe',
      align: 'right',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(18);
    const stars = [0, 1, 2].map(() => this.add.image(0, 0, 'star')
      .setDisplaySize(22, 22)
      .setScrollFactor(0)
      .setDepth(18));

    if (unlocked) {
      status.setText(`最高 ${best}/3`);
      need.setVisible(false);
      stars.forEach((icon, index) => icon.setAlpha(index < best ? 1 : 0.28));
      bg.setInteractive({ useHandCursor: true });
      bg.setData('ui', true);
      bg.on('pointerdown', () => {
        this.suppressJump = true;
        getSynth().unlock();
        this.scene.start('game', { levelId: level.id });
      });
    } else {
      const required = starsRequired(level.id);
      const short = starsToUnlock(this.progress, level.id);
      status.setText('未解锁');
      need.setText(`需要累计 ${required} 颗  ·  还差 ${short} 颗`);
      stars.forEach((icon) => icon.setVisible(false));
      name.setAlpha(0.72);
    }

    return { bg, name, status, need, stars, unlocked };
  }

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
    tintParallax(this.parallax, 0);
    this.hud.relayout({ viewWidth: viewW, viewHeight: viewH, insets });
    const layout = layoutLevelSelect({
      viewWidth: viewW,
      viewHeight: viewH,
      insets,
      count: this.cards.length,
    });
    this.title.setPosition(layout.title.x, layout.title.y);
    this.totalText.setText(`累计星星 ${totalBestStars(this.progress)}`);
    this.totalText.setPosition(layout.total.x, layout.total.y);
    this.cards.forEach((card, index) => this.placeCard(card, layout.rows[index]));
    this.back.setPosition(layout.back.x, layout.back.y);
  }

  placeCard(card, row) {
    card.bg.setPosition(row.x + row.w / 2, row.y + row.h / 2);
    card.bg.setSize(row.w, row.h);
    const midY = row.y + row.h / 2;
    card.name.setPosition(row.x + 22, midY);
    const right = row.x + row.w - 22;
    if (card.unlocked) {
      card.status.setPosition(right - 78, midY);
      card.stars.forEach((icon, index) => {
        icon.setPosition(right - 52 + index * 26, midY);
      });
      return;
    }
    card.status.setPosition(right, midY - 12);
    card.need.setPosition(right, midY + 12);
  }
}
