/**
 * 关卡 JSON 不合法时显示原因。圆角面板，避免模块加载失败后整页空白。
 */
import Phaser from 'phaser';
import { CONFIG_ERROR } from '../game/level.js';
import { PANEL, addCandyText, paintCandyPanel, textStyle } from '../game/candy.js';
import { cssInsetsToGame, readSafeAreaInsets } from '../game/viewport.js';
import { t } from '../i18n/index.js';

export class ErrorScene extends Phaser.Scene {
  constructor() {
    super('config-error');
  }

  create() {
    this.cameras.main.setBackgroundColor('#2a0838');
    this.panel = this.add.graphics().setDepth(1);
    this.title = addCandyText(this, 0, 0, t('error.title'), {
      size: 34,
      color: PANEL.title,
      stroke: '#ffffff',
      strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(2);
    this.body = this.add.text(0, 0, CONFIG_ERROR || t('error.unknown'), textStyle({
      size: 20,
      color: PANEL.body,
      stroke: '#ffffff',
      strokeThickness: 3,
      align: 'left',
      shadow: false,
    })).setOrigin(0, 0).setDepth(2);
    this.scale.on('resize', this.applyViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyViewport, this);
    });
    this.applyViewport();
  }

  applyViewport() {
    const width = this.scale.width;
    const height = this.scale.height;
    const insets = cssInsetsToGame(readSafeAreaInsets(), this.scale.displayScale);
    const side = Math.max(28, insets.left || 0, insets.right || 0) + 8;
    const top = Math.max(24, insets.top || 0);
    const bottom = Math.max(20, insets.bottom || 0);
    const panelX = side - 8;
    const panelY = top;
    const panelW = Math.max(200, width - panelX * 2);
    const panelH = Math.max(120, height - top - bottom);
    paintCandyPanel(this.panel, panelX, panelY, panelW, panelH);
    this.title.setPosition(width / 2, panelY + 22);
    const textX = panelX + 22;
    this.body.setWordWrapWidth(Math.max(160, panelW - 44));
    this.body.setPosition(textX, panelY + 78);
    this.body.setFixedSize(Math.max(160, panelW - 44), Math.max(60, panelH - 100));
  }
}
