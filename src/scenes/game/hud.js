/**
 * 本局 HUD 数字和安全区重排。按钮画法在 src/game/hud.js。从 GameScene 原样搬出，逻辑不变。
 */
import { distanceMeters } from '../../game/endlessScore.js';
import { layoutParallax } from '../../game/backdrop.js';
import {
  cssInsetsToGame,
  readSafeAreaInsets,
  verticalCameraScroll,
} from '../../game/viewport.js';
import { TUNING } from '../../logic/world.js';

export const hudMethods = {
  /** 无尽 HUD：距离、本局星星、最高纪录。超过旧纪录时纪录数字跟着涨。 */
  refreshEndlessHud() {
    const px = Math.max(0, (this.player?.x || this.level.startX) - this.level.startX);
    const meters = distanceMeters(Math.max(px, this.run?.maxDistance || 0));
    this.hud.setStats({
      distance: meters,
      stars: this.run?.stars || 0,
      best: Math.max(this.endlessBest || 0, meters),
    });
  },

  /**
   * 窗口尺寸或旋转之后重排镜头、背景和 HUD。
   * 地面仍在原来的世界坐标，只是更高的屏幕能看到更多天空。
   */
  applyViewport() {
    const cam = this.cameras.main;
    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const scrollY = verticalCameraScroll(TUNING.viewHeight, viewH);
    cam.setBounds(0, scrollY, this.level.worldWidth, viewH);
    cam.scrollY = scrollY;
    const insets = cssInsetsToGame(readSafeAreaInsets(), this.scale.displayScale);
    this._insets = insets;
    layoutParallax(this.parallax, viewW, viewH, scrollY);
    const layout = this.hud?.relayout({ viewWidth: viewW, viewHeight: viewH, insets });
    this.powerHud?.relayout(layout);
    this.deathFx?.layoutFlash();
    this.levelLabel?.setPosition(viewW / 2, viewH - (insets.bottom || 0) - 18);
    this.winUi?.relayout(viewW, viewH, insets);
    this.syncBackdrop();
  },
};
