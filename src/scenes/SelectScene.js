/**
 * 选关。第 1 关始终可进，后面的关按清单里的累计星星解锁。
 * 卡片分已满星、已解锁、锁定三种颜色，翻页和返回都是糖果按钮。
 */
import Phaser from 'phaser';
import { TUNING } from '../logic/world.js';
import { THEME } from '../game/theme.js';
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
import { createHud } from '../game/hud.js';
import { addCandyText, candyPalette, createCandyButton, paintCandyRect, shrinkToWidth, textStyle } from '../game/candy.js';
import { levelName, t } from '../i18n/index.js';
import { getSynth } from '../game/audio.js';
import { cssInsetsToGame, layoutLevelBoard, readSafeAreaInsets, verticalCameraScroll } from '../game/viewport.js';

const OPEN_COLORS = ['sky', 'mint', 'grape', 'coral'];

function cardVariant(level, unlocked, best) {
  if (!unlocked) return 'locked';
  if (best >= 3) return 'lemon';
  return OPEN_COLORS[(level.index - 1) % OPEN_COLORS.length];
}

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

    this.title = addCandyText(this, 0, 0, t('select.title'), {
      size: 36,
      color: '#fff7fb',
      stroke: '#3b0764',
      strokeThickness: 6,
    }).setScrollFactor(0).setDepth(12);

    this.totalStar = this.add.image(0, 0, 'star')
      .setDisplaySize(22, 22)
      .setScrollFactor(0)
      .setDepth(12);
    this.totalText = addCandyText(this, 0, 0, '', {
      size: 20,
      color: '#fff7fb',
      stroke: '#3b0764',
      strokeThickness: 4,
    }).setScrollFactor(0).setDepth(12);

    this.pageText = addCandyText(this, 0, 0, '', {
      size: 20,
      color: '#ffe14a',
      stroke: '#3b0764',
      strokeThickness: 4,
    }).setScrollFactor(0).setDepth(22);

    this.cards = LEVELS.map((level) => this.createCard(level));
    this.prev = createCandyButton(this, {
      label: t('select.prev'),
      variant: 'lemon',
      width: 156,
      fontSize: 26,
      depth: 20,
      onClick: () => {
        getSynth().unlock();
        this.turnPage(-1);
      },
    });
    this.next = createCandyButton(this, {
      label: t('select.next'),
      variant: 'sky',
      width: 156,
      fontSize: 26,
      depth: 20,
      onClick: () => {
        getSynth().unlock();
        this.turnPage(1);
      },
    });
    this.back = createCandyButton(this, {
      label: t('select.back'),
      variant: 'pink',
      width: 210,
      fontSize: 28,
      depth: 20,
      onClick: () => {
        getSynth().unlock();
        this.scene.start('menu');
      },
    });

    this.hud = createHud(this, { showStats: false });
    this.scale.on('resize', this.applyViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyViewport, this);
    });
    this.applyViewport();
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
    const variant = cardVariant(level, unlocked, best);
    const palette = candyPalette(variant);
    const root = this.add.container(0, 0).setScrollFactor(0).setDepth(16);
    const bg = this.add.graphics();
    const indexText = this.add.text(0, 0, String(level.index), textStyle({
      size: 20,
      color: palette.ink,
      stroke: palette.darkInk ? '#ffffff' : '#4a1468',
      strokeThickness: 3,
      shadow: false,
    })).setOrigin(0.5);
    const name = this.add.text(0, 0, levelName(level), textStyle({
      size: 22,
      color: palette.ink,
      stroke: palette.darkInk ? '#ffffff' : '#4a1468',
      strokeThickness: 3,
      align: 'left',
      shadow: false,
    })).setOrigin(0, 0.5);
    const status = this.add.text(0, 0, '', textStyle({
      size: 16,
      color: palette.ink,
      stroke: palette.darkInk ? '#ffffff' : '#4a1468',
      strokeThickness: 3,
      align: 'right',
      shadow: false,
    })).setOrigin(1, 0.5);
    const stars = [0, 1, 2].map((index) => this.add.image(0, 0, index < best ? 'star' : 'ui-star-empty')
      .setDisplaySize(20, 20));
    const lock = this.add.image(0, 0, 'ui-lock').setDisplaySize(26, 26);
    root.add([bg, indexText, name, status, ...stars, lock]);

    const zone = this.add.zone(0, 0, 10, 10).setScrollFactor(0).setDepth(17);
    zone.setData('ui', true);
    const card = {
      root, bg, indexText, name, status, stars, lock, zone,
      unlocked, best, variant, palette, pressed: false, hovered: false, cell: null,
    };
    if (unlocked) {
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerover', (pointer) => {
        if (pointer?.wasTouch) return;
        card.hovered = true;
        if (card.cell) this.placeCard(card, card.cell);
      });
      zone.on('pointerout', () => {
        card.hovered = false;
        card.pressed = false;
        if (card.cell) this.placeCard(card, card.cell);
      });
      zone.on('pointerdown', () => {
        this.suppressJump = true;
        card.pressed = true;
        if (card.cell) this.placeCard(card, card.cell);
      });
      zone.on('pointerup', () => {
        this.suppressJump = true;
        const fire = card.pressed;
        card.pressed = false;
        if (fire) {
          getSynth().unlock();
          this.scene.start('game', { levelId: level.id });
        }
      });
      zone.on('pointerupoutside', () => {
        card.pressed = false;
        if (card.cell) this.placeCard(card, card.cell);
      });
    } else {
      const short = starsToUnlock(this.progress, level.id);
      status.setText(t('select.locked', { count: short }));
    }
    return card;
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
    shrinkToWidth(this.title, Math.min(layout.title.w, viewW - 48), 22);
    this.totalText.setFontSize(20);
    this.totalText.setText(t('select.stars', {
      current: totalBestStars(this.progress),
      total: LEVELS.length * 3,
    }));
    shrinkToWidth(this.totalText, layout.total.w - 36, 14);
    this.placeTotal(layout.total.x, layout.total.y);
    this.pageText.setFontSize(20);
    this.pageText.setText(layout.pages > 1 ? t('select.page', { page: layout.page + 1, pages: layout.pages }) : '');
    shrinkToWidth(this.pageText, layout.pageLabel.w, 14);
    this.pageText.setPosition(layout.pageLabel.x, layout.pageLabel.y);
    this.cards.forEach((card, index) => {
      const cell = layout.cells.find((item) => item.index === index);
      this.placeCard(card, cell);
    });
    this.placePager(this.prev, layout.prev, layout.page > 0);
    this.placePager(this.next, layout.next, layout.page < layout.pages - 1);
    this.back.setPosition(layout.back.x, layout.back.y);
  }

  placeTotal(x, y) {
    const gap = 8;
    const width = this.totalStar.displayWidth + gap + this.totalText.width;
    const left = x - width / 2;
    this.totalStar.setPosition(left + this.totalStar.displayWidth / 2, y);
    this.totalText.setPosition(left + this.totalStar.displayWidth + gap + this.totalText.width / 2, y);
  }

  placePager(pager, point, enabled) {
    pager.setPosition(point.x, point.y);
    pager.setEnabled(enabled);
  }

  placeCard(card, cell) {
    card.cell = cell || null;
    const visible = !!cell;
    card.root.setVisible(visible);
    card.zone.setVisible(visible);
    if (!visible) {
      card.zone.disableInteractive();
      return;
    }
    // 翻页回来要重新打开点击。disableInteractive 之后 input 对象还在，不能靠它判断。
    if (card.unlocked) card.zone.setInteractive({ useHandCursor: true });
    const palette = card.palette;
    const face = card.hovered && !card.pressed ? palette.hover : palette.face;
    const metrics = paintCandyRect(card.bg, cell.w, cell.h, face, palette.lip, card.pressed);
    const badge = Math.min(42, cell.h * 0.52);
    const bx = -cell.w / 2 + 12;
    const by = metrics.faceCenter - badge / 2;
    card.bg.fillStyle(palette.darkInk ? 0xffffff : 0x3b0764, 0.2);
    card.bg.fillRoundedRect(bx, by, badge, badge, 12);
    card.indexText.setPosition(bx + badge / 2, metrics.faceCenter);
    const nameX = bx + badge + 10;
    card.name.setFontSize(cell.h < 84 ? 18 : 22);
    if (!card.unlocked) {
      card.status.setFontSize(16);
      shrinkToWidth(card.status, Math.max(56, cell.w * 0.32), 12);
    }
    const starBlock = card.unlocked ? 74 : card.status.width + 42;
    const maxName = cell.w / 2 - 12 - starBlock - nameX;
    let size = cell.h < 84 ? 18 : 22;
    while (size > 14 && card.name.width > maxName) {
      size -= 1;
      card.name.setFontSize(`${size}px`);
    }
    card.name.setPosition(nameX, metrics.faceCenter);
    const right = cell.w / 2 - 14;
    card.stars.forEach((icon, index) => {
      icon.setVisible(card.unlocked);
      icon.setPosition(right - 46 + index * 22, metrics.faceCenter);
    });
    card.lock.setVisible(!card.unlocked);
    card.status.setVisible(!card.unlocked);
    if (!card.unlocked) {
      card.lock.setPosition(right - card.status.width - 8, metrics.faceCenter);
      card.status.setPosition(right, metrics.faceCenter);
    }
    const cx = cell.x + cell.w / 2;
    const cy = cell.y + cell.h / 2 + (card.pressed ? 4 : 0);
    card.root.setPosition(cx, cy);
    card.root.setScale(card.pressed ? 0.97 : 1);
    card.zone.setPosition(cell.x + cell.w / 2, cell.y + cell.h / 2);
    card.zone.setSize(cell.w, cell.h);
  }
}
