import { describe, expect, it } from 'vitest';
import {
  computeExpandSize,
  cssInsetsToGame,
  layoutHud,
  layoutLevelSelect,
  nextFullscreenAction,
  shouldShowFullscreenButton,
  verticalCameraScroll,
} from '../src/game/viewport.js';

describe('按宽高比铺满', () => {
  it('16:9 保持设计分辨率', () => {
    const size = computeExpandSize(960, 540, 1920, 1080);
    expect(size.gameWidth).toBeCloseTo(960);
    expect(size.gameHeight).toBeCloseTo(540);
    expect(size.scale).toBeCloseTo(2);
  });

  it('19.5:9 只加宽，高度和角色比例不变', () => {
    const size = computeExpandSize(960, 540, 2340, 1080);
    expect(size.gameHeight).toBeCloseTo(540);
    expect(size.gameWidth).toBeCloseTo(1170);
    expect(size.gameWidth / size.gameHeight).toBeCloseTo(2340 / 1080);
  });

  it('4:3 只加高，宽度不变', () => {
    const size = computeExpandSize(960, 540, 1024, 768);
    expect(size.gameWidth).toBeCloseTo(960);
    expect(size.gameHeight).toBeCloseTo(720);
    expect(size.gameWidth / size.gameHeight).toBeCloseTo(1024 / 768);
  });

  it('各种屏幕都不拉伸，也不会比设计分辨率更小', () => {
    const screens = [[1920, 1080], [2340, 1080], [1024, 768], [390, 844], [800, 800], [1280, 720]];
    for (const [width, height] of screens) {
      const size = computeExpandSize(960, 540, width, height);
      expect(size.gameWidth / size.gameHeight).toBeCloseTo(width / height, 5);
      expect(size.gameWidth).toBeGreaterThanOrEqual(960 - 1e-6);
      expect(size.gameHeight).toBeGreaterThanOrEqual(540 - 1e-6);
    }
  });

  it('更高的画面把多出来的高度留在上方，16:9 时镜头不动', () => {
    expect(verticalCameraScroll(540, 540)).toBe(0);
    expect(verticalCameraScroll(540, 720)).toBe(-180);
  });
});

describe('全屏按钮和安全区', () => {
  it('网页显示全屏按钮，安卓壳不显示', () => {
    expect(shouldShowFullscreenButton(false)).toBe(true);
    expect(shouldShowFullscreenButton(true)).toBe(false);
  });

  it('全屏按钮在两种状态之间切换', () => {
    expect(nextFullscreenAction(false)).toBe('enter');
    expect(nextFullscreenAction(true)).toBe('exit');
  });

  it('没有刘海时，主页和声音仍在原来的右上角', () => {
    const hud = layoutHud({
      viewWidth: 960,
      viewHeight: 540,
      showHome: true,
      showFullscreen: false,
    });
    expect(hud.score).toEqual({ x: 22, y: 16 });
    expect(hud.deaths).toEqual({ x: 22, y: 56 });
    expect(hud.stars).toEqual({ x: 22, y: 96 });
    expect(hud.sound).toEqual({ x: 908, y: 48 });
    expect(hud.home).toEqual({ x: 808, y: 48 });
  });

  it('全屏按钮排在声音左边，主页再往左', () => {
    const hud = layoutHud({
      viewWidth: 1170,
      viewHeight: 540,
      showHome: true,
      showFullscreen: true,
    });
    expect(hud.home.x).toBeLessThan(hud.fullscreen.x);
    expect(hud.fullscreen.x).toBeLessThan(hud.sound.x);
    expect(hud.sound.x).toBeLessThanOrEqual(1170);
  });

  it('HUD 让开刘海和圆角安全区', () => {
    const hud = layoutHud({
      viewWidth: 1170,
      viewHeight: 540,
      insets: { top: 24, right: 36, bottom: 12, left: 40 },
      showHome: true,
      showFullscreen: true,
    });
    expect(hud.score.x).toBeGreaterThanOrEqual(40);
    expect(hud.score.y).toBeGreaterThanOrEqual(24);
    expect(hud.sound.x).toBeLessThanOrEqual(1170 - 36);
    expect(hud.sound.y).toBeGreaterThanOrEqual(24);
  });

  it('安全区从 CSS 像素换算到游戏像素', () => {
    const insets = cssInsetsToGame(
      { top: 40, right: 20, bottom: 10, left: 0 },
      { x: 0.5, y: 0.5 },
    );
    expect(insets.top).toBe(20);
    expect(insets.right).toBe(10);
    expect(insets.bottom).toBe(5);
    expect(insets.left).toBe(0);
  });

  it('缩放还没就绪时不用 NaN 去排 HUD', () => {
    const insets = cssInsetsToGame({ top: 0, right: 0, bottom: 0, left: 0 }, { x: Infinity, y: 0 });
    expect(insets.top).toBe(0);
    expect(Number.isFinite(insets.left)).toBe(true);
  });

  it('选关卡片让开安全区，并且不叠在一起', () => {
    const layout = layoutLevelSelect({
      viewWidth: 960,
      viewHeight: 540,
      insets: { top: 30, right: 20, bottom: 16, left: 24 },
      count: 5,
    });
    expect(layout.rows).toHaveLength(5);
    expect(layout.title.y).toBeGreaterThanOrEqual(30);
    for (const row of layout.rows) {
      expect(row.x).toBeGreaterThanOrEqual(24);
      expect(row.x + row.w).toBeLessThanOrEqual(960 - 20);
      expect(row.y).toBeGreaterThanOrEqual(30);
      expect(row.h).toBeGreaterThanOrEqual(46);
    }
    for (let i = 1; i < layout.rows.length; i += 1) {
      expect(layout.rows[i].y).toBeGreaterThanOrEqual(layout.rows[i - 1].y + layout.rows[i - 1].h);
    }
  });
});
