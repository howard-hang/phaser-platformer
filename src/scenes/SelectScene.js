/**
 * 选关。第 1 关始终可进，后面的关按清单里的累计星星解锁。
 * 二十关分页摆放，卡片让开安全区。返回标题用画面上的按钮；安卓返回键走同一条路。
 */
import Phaser from 'phaser';
import { TUNING } from '../logic/world.js';
import { FONT, THEME } from '../game/theme.js';
import { LEVELS } from '../game/level.js';
import {
  bestStars,
  isLevelUnlocked,
  loadProgress,
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
import { cssInsetsToGame, layoutLevelBoard, readSafeAreaInsets, verticalCameraScroll } from '../game/viewport.js';

export class SelectScene extends Phaser.Scene {
  constructor() {
    super('select');
  }

  create() {
    this.cameras.main.setBackgroundColor(THEME.gap);
    this.parallax = createParallax(this, 0);
    this.driftX = 0;
    this.progress = loadProgress();
    this.page = this.registry.get('selectPage') || 0;

    this.title = this.add.text(0, 0, '选择关卡', {
      fontFamily: FONT,
      fontSize: '40px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12);

    this.totalText = this.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '20px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12);

    this.pageText = this.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '18px',
      color: '#f5d0fe',
      stroke: THEME.stroke,
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12);

    this.cards = LEVELS.map((level) => this.createCard(level));
    this.prev = this.createPager('上一页', () => this.turnPage(-1));
    this.next = this.createPager('下一页', () => this.turnPage(1));
    this.back = createStartButton(this, 480, 500, () => {
      getSynth().unlock();
      this.scene.start('menu');
    }, '返回标题', 200);

    this.hud = createHud(this, { showStats: false });
    this.scale.on('resize', this.applyViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyViewport, this);
    });
    this.applyViewport();
  }

  createPager(label, onClick) {
    const bg = this.add.rectangle(0, 0, 148, 52, 0xffffff)
      .setScrollFactor(0)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });
    bg.setData('ui', true);
    const caption = this.add.text(0, 0, label, {
      fontFamily: FONT,
      fontSize: '24px',
      color: '#2a0838',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    bg.on('pointerdown', () => {
      this.suppressJump = true;
      getSynth().unlock();
      onClick();
    });
    return { bg, caption };
  }

  turnPage(delta) {
    const layout = layoutLevelBoard({
      viewWidth: this.scale.width,
      viewHeight: this.scale.height,
      count: this.cards.length,
      page: this.page + delta,
    });
    if (layout.page === this.page) return;
    this.page = layout.page;
    this.registry.set('selectPage', this.page);
    this.applyViewport();
  }

  createCard(level) {
    const unlocked = isLevelUnlocked(this.progress, level.id);
    const best = bestStars(this.progress, level.id);
    const bg = this.add.rectangle(0, 0, 280, 72, unlocked ? 0x2a0838 : 0x3b1848, 1)
      .setStrokeStyle(3, unlocked ? 0xffffff : 0x7a4a86, 1)
      .setScrollFactor(0)
      .setDepth(16);
    const name = this.add.text(0, 0, `${level.index}  ${level.name}`, {
      fontFamily: FONT,
      fontSize: '24px',
      color: unlocked ? '#ffffff' : '#e9d5ff',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(18);
    const status = this.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '16px',
      color: '#f5d0fe',
      align: 'right',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(18);
    const stars = [0, 1, 2].map(() => this.add.image(0, 0, 'star')
      .setDisplaySize(18, 18)
      .setScrollFactor(0)
      .setDepth(18));

    if (unlocked) {
      status.setVisible(false);
      stars.forEach((icon, index) => icon.setAlpha(index < best ? 1 : 0.28));
      bg.setInteractive({ useHandCursor: true });
      bg.setData('ui', true);
      bg.on('pointerdown', () => {
        this.suppressJump = true;
        getSynth().unlock();
        this.scene.start('game', { levelId: level.id });
      });
    } else {
      const short = starsToUnlock(this.progress, level.id);
      status.setText(`还差 ${short} 颗`);
      stars.forEach((icon) => icon.setVisible(false));
      name.setAlpha(0.72);
    }

    return { bg, name, status, stars, unlocked };
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
    const layout = layoutLevelBoard({
      viewWidth: viewW,
      viewHeight: viewH,
      insets,
      count: this.cards.length,
      page: this.page,
    });
    this.page = layout.page;
    this.title.setPosition(layout.title.x, layout.title.y);
    this.totalText.setText(`累计星星 ${totalBestStars(this.progress)} / ${LEVELS.length * 3}`);
    this.totalText.setPosition(layout.total.x, layout.total.y);
    this.pageText.setText(layout.pages > 1 ? `第 ${layout.page + 1} / ${layout.pages} 页` : '');
    this.pageText.setPosition(layout.pageLabel.x, layout.pageLabel.y);
    this.cards.forEach((card, index) => {
      const cell = layout.cells.find((item) => item.index === index);
      this.placeCard(card, cell);
    });
    this.placePager(this.prev, layout.prev, layout.page > 0);
    this.placePager(this.next, layout.next, layout.page < layout.pages - 1);
    this.back.setPosition(layout.back.x, layout.back.y);
    this.back.caption.setFontSize(layout.pages > 1 ? '28px' : '36px');
  }

  placePager(pager, point, enabled) {
    pager.bg.setPosition(point.x, point.y);
    pager.caption.setPosition(point.x, point.y);
    pager.bg.setAlpha(enabled ? 1 : 0.35);
    pager.caption.setAlpha(enabled ? 1 : 0.45);
  }

  placeCard(card, cell) {
    const visible = !!cell;
    card.bg.setVisible(visible);
    card.name.setVisible(visible);
    card.status.setVisible(visible && !card.unlocked);
    card.stars.forEach((icon) => icon.setVisible(visible && card.unlocked));
    if (!cell) return;
    card.bg.setPosition(cell.x + cell.w / 2, cell.y + cell.h / 2);
    card.bg.setSize(cell.w, cell.h);
    const midY = cell.y + cell.h / 2;
    card.name.setFontSize(cell.h < 70 ? '20px' : '24px');
    card.name.setPosition(cell.x + 16, midY);
    const right = cell.x + cell.w - 16;
    if (card.unlocked) {
      card.stars.forEach((icon, index) => {
        icon.setPosition(right - 40 + index * 22, midY);
      });
      return;
    }
    card.status.setPosition(right, midY);
  }
}
