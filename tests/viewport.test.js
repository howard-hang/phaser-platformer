import { describe, expect, it } from 'vitest';
import {
  CANDY_BUTTON_H,
  ICON_HIT,
  computeExpandSize,
  cssInsetsToGame,
  layoutHud,
  layoutSettings,
  layoutLevelBoard,
  layoutLevelSelect,
  layoutWinPanel,
  nextFullscreenAction,
  shouldShowFullscreenButton,
  verticalCameraScroll,
  viewportFillBox,
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

describe('视觉视口铺满', () => {
  it('用视觉视口的宽高，不把画布缩进偏移量里', () => {
    const box = viewportFillBox({
      innerWidth: 800,
      innerHeight: 360,
      visualWidth: 2280,
      visualHeight: 1080,
      offsetLeft: 0,
      offsetTop: 0,
    });
    expect(box).toEqual({ left: 0, top: 0, width: 2280, height: 1080 });
  });

  it('没有视觉视口时退回窗口内部尺寸', () => {
    const box = viewportFillBox({ innerWidth: 390, innerHeight: 844 });
    expect(box.width).toBe(390);
    expect(box.height).toBe(844);
    expect(box.left).toBe(0);
    expect(box.top).toBe(0);
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

  it('道具倒计时排在星星下面，不挡右上角按钮', () => {
    const hud = layoutHud({
      viewWidth: 960,
      viewHeight: 540,
      showHome: true,
      showFullscreen: true,
    });
    expect(hud.power.y).toBeGreaterThan(hud.stars.y + 20);
    expect(hud.power.x).toBe(hud.score.x);
    expect(hud.power.x + hud.power.w).toBeLessThan(hud.home.x - 40);
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

  it('二十关分页后卡片仍让开安全区，并且够手指点', () => {
    const layout = layoutLevelBoard({
      viewWidth: 960,
      viewHeight: 540,
      insets: { top: 28, right: 24, bottom: 18, left: 32 },
      count: 20,
      page: 0,
    });
    expect(layout.pages).toBeGreaterThan(1);
    expect(layout.cells.length).toBeGreaterThan(0);
    expect(layout.cells.length).toBeLessThan(20);
    for (const cell of layout.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(32);
      expect(cell.x + cell.w).toBeLessThanOrEqual(960 - 24);
      expect(cell.y).toBeGreaterThanOrEqual(28);
      expect(cell.h).toBeGreaterThanOrEqual(CANDY_BUTTON_H);
    }
    const next = layoutLevelBoard({
      viewWidth: 960,
      viewHeight: 540,
      insets: { top: 28, right: 24, bottom: 18, left: 32 },
      count: 20,
      page: 1,
    });
    const seen = new Set(layout.cells.map((cell) => cell.index));
    for (const cell of next.cells) expect(seen.has(cell.index)).toBe(false);
    expect(layout.back.y).toBeLessThanOrEqual(540 - 18);
    expect(layout.prev.x).toBeGreaterThanOrEqual(32);
    expect(layout.next.x).toBeLessThanOrEqual(960 - 24);
  });

  it('页码在上一页和下一页之间，并且不压到标题、星星、卡片和按钮', () => {
    const screens = [
      [1280, 720],
      [2400, 1080],
      [1024, 768],
      [800, 700],
      [800, 800],
    ];
    for (const [screenW, screenH] of screens) {
      const size = computeExpandSize(960, 540, screenW, screenH);
      const layout = layoutLevelBoard({
        viewWidth: size.gameWidth,
        viewHeight: size.gameHeight,
        count: 20,
        page: 0,
      });
      const hud = layoutHud({
        viewWidth: size.gameWidth,
        viewHeight: size.gameHeight,
        showHome: true,
        showFullscreen: true,
        showFps: true,
      });
      const title = centerBox(layout.title);
      const total = centerBox(layout.total);
      const page = centerBox(layout.pageLabel);
      const prev = centerBox(layout.prev);
      const next = centerBox(layout.next);
      const back = centerBox(layout.back);
      const fps = cornerBox(hud.fps);
      expect(overlaps(title, total), `${screenW}x${screenH} 标题和星星`).toBe(false);
      expect(overlaps(page, title), `${screenW}x${screenH} 页码和标题`).toBe(false);
      expect(overlaps(page, total), `${screenW}x${screenH} 页码和星星`).toBe(false);
      expect(overlaps(page, prev), `${screenW}x${screenH} 页码和上一页`).toBe(false);
      expect(overlaps(page, next), `${screenW}x${screenH} 页码和下一页`).toBe(false);
      expect(overlaps(page, back), `${screenW}x${screenH} 页码和返回`).toBe(false);
      expect(page.l).toBeGreaterThan(prev.r);
      expect(page.r).toBeLessThan(next.l);
      expect(page.b).toBeLessThan(back.t);
      for (const cell of layout.cells) {
        const card = cornerBox(cell);
        expect(overlaps(card, page), `${screenW}x${screenH} 卡片和页码`).toBe(false);
        expect(overlaps(card, prev), `${screenW}x${screenH} 卡片和上一页`).toBe(false);
        expect(overlaps(card, next), `${screenW}x${screenH} 卡片和下一页`).toBe(false);
        expect(overlaps(card, back), `${screenW}x${screenH} 卡片和返回`).toBe(false);
        expect(overlaps(card, title), `${screenW}x${screenH} 卡片和标题`).toBe(false);
        expect(overlaps(card, total), `${screenW}x${screenH} 卡片和星星`).toBe(false);
      }
      expect(overlaps(fps, prev), `${screenW}x${screenH} fps 和上一页`).toBe(false);
      expect(overlaps(fps, next), `${screenW}x${screenH} fps 和下一页`).toBe(false);
      expect(overlaps(fps, back), `${screenW}x${screenH} fps 和返回`).toBe(false);
      expect(overlaps(fps, page), `${screenW}x${screenH} fps 和页码`).toBe(false);
      expect(overlaps(fps, title), `${screenW}x${screenH} fps 和标题`).toBe(false);
      const score = cornerBox({ ...hud.score, w: 180, h: 28 });
      expect(overlaps(fps, score), `${screenW}x${screenH} fps 和分数`).toBe(false);
      for (const button of [hud.sound, hud.fullscreen, hud.home]) {
        const box = centerBox({ ...button, w: 88, h: 88 });
        expect(overlaps(fps, box), `${screenW}x${screenH} fps 和右上角按钮`).toBe(false);
      }
    }
  });

  it('常见手机横屏上，选关按钮和卡片的点击高度不少于 44 CSS 像素', () => {
    const phones = [[844, 390], [932, 430], [667, 375], [640, 360], [568, 320]];
    for (const [screenW, screenH] of phones) {
      const size = computeExpandSize(960, 540, screenW, screenH);
      const layout = layoutLevelBoard({
        viewWidth: size.gameWidth,
        viewHeight: size.gameHeight,
        count: 20,
      });
      const css = (gamePx) => gamePx * size.scale;
      for (const button of [layout.prev, layout.next, layout.back]) {
        expect(css(button.h), `${screenW}x${screenH} 按钮高`).toBeGreaterThanOrEqual(44);
        expect(css(button.w), `${screenW}x${screenH} 按钮宽`).toBeGreaterThanOrEqual(44);
      }
      for (const cell of layout.cells) {
        expect(css(cell.h), `${screenW}x${screenH} 卡片高`).toBeGreaterThanOrEqual(44);
        expect(css(cell.w), `${screenW}x${screenH} 卡片宽`).toBeGreaterThanOrEqual(44);
      }
      expect(css(ICON_HIT), `${screenW}x${screenH} 图标热区`).toBeGreaterThanOrEqual(44);
    }
  });

  it('通关面板在四种比例下文字和按钮不重叠', () => {
    const screens = [
      [1280, 720],
      [2400, 1080],
      [1024, 768],
      [800, 800],
    ];
    for (const [screenW, screenH] of screens) {
      const size = computeExpandSize(960, 540, screenW, screenH);
      const layout = layoutWinPanel({
        viewWidth: size.gameWidth,
        viewHeight: size.gameHeight,
        insets: { top: 20, right: 28, bottom: 16, left: 28 },
      });
      const panel = cornerBox(layout.panel);
      const title = centerBox(layout.title);
      const stars = centerBox(layout.stars);
      const body = centerBox(layout.body);
      const buttons = layout.buttons.map(centerBox);
      expect(panel.t).toBeGreaterThanOrEqual(20);
      expect(panel.b).toBeLessThanOrEqual(size.gameHeight - 16);
      expect(overlaps(title, stars), `${screenW}x${screenH} 标题和星星`).toBe(false);
      expect(overlaps(stars, body), `${screenW}x${screenH} 星星和正文`).toBe(false);
      expect(overlaps(body, buttons[0]), `${screenW}x${screenH} 正文和按钮`).toBe(false);
      for (const button of buttons) {
        expect(button.l).toBeGreaterThanOrEqual(panel.l);
        expect(button.r).toBeLessThanOrEqual(panel.r);
        expect(button.b).toBeLessThanOrEqual(panel.b);
        expect(button.t).toBeGreaterThan(body.b);
      }
      for (let i = 1; i < buttons.length; i += 1) {
        expect(overlaps(buttons[i - 1], buttons[i]), `${screenW}x${screenH} 按钮彼此`).toBe(false);
      }
    }
  });

  it('无尽结算面板两颗按钮不重叠，正文也不压住按钮', () => {
    const screens = [
      [1280, 720],
      [1000, 450],
      [2400, 1080],
      [800, 800],
    ];
    for (const [screenW, screenH] of screens) {
      const size = computeExpandSize(960, 540, screenW, screenH);
      const layout = layoutWinPanel({
        viewWidth: size.gameWidth,
        viewHeight: size.gameHeight,
        insets: { top: 20, right: 28, bottom: 16, left: 28 },
        buttonWidths: [220, 200],
        starRow: false,
        bodyLines: 3,
      });
      const body = centerBox(layout.body);
      const buttons = layout.buttons.map(centerBox);
      expect(buttons).toHaveLength(2);
      expect(overlaps(body, buttons[0]), `${screenW}x${screenH} 正文和再来一次`).toBe(false);
      expect(overlaps(buttons[0], buttons[1]), `${screenW}x${screenH} 两颗按钮`).toBe(false);
      expect(layout.stars.h).toBe(0);
    }
  });
});

describe('设置页布局', () => {
  it('16:9 和 20:9 上控件都在画面内，并且点得到', () => {
    const screens = [
      [1280, 720],
      [1000, 450],
    ];
    for (const [screenW, screenH] of screens) {
      const size = computeExpandSize(960, 540, screenW, screenH);
      const layout = layoutSettings({
        viewWidth: size.gameWidth,
        viewHeight: size.gameHeight,
      });
      const boxes = [
        centerBox(layout.music),
        centerBox(layout.sfx),
        centerBox(layout.vibrate),
        centerBox(layout.fps),
        centerBox(layout.reset),
        centerBox(layout.back),
        centerBox(layout.cancel),
        centerBox(layout.confirm),
        centerBox(layout.langLabel),
        ...layout.fxButtons.map(centerBox),
        ...layout.langButtons.map(centerBox),
      ];
      for (const box of boxes) {
        expect(box.l).toBeGreaterThanOrEqual(0);
        expect(box.r).toBeLessThanOrEqual(size.gameWidth + 0.5);
        expect(box.t).toBeGreaterThanOrEqual(0);
        expect(box.b).toBeLessThanOrEqual(size.gameHeight + 0.5);
        const cssH = (box.b - box.t) * size.scale;
        const cssW = (box.r - box.l) * size.scale;
        expect(cssH).toBeGreaterThanOrEqual(44);
        expect(cssW).toBeGreaterThanOrEqual(44);
      }
      const rows = [layout.music, layout.sfx, layout.vibrate, layout.fps, layout.language, layout.reset].map(centerBox);
      for (let i = 1; i < rows.length; i += 1) {
        expect(overlaps(rows[i - 1], rows[i])).toBe(false);
      }
      const fx = layout.fxButtons.map(centerBox);
      expect(overlaps(fx[0], fx[1])).toBe(false);
      expect(overlaps(fx[1], fx[2])).toBe(false);
      const langs = layout.langButtons.map(centerBox);
      expect(overlaps(centerBox(layout.langLabel), langs[0])).toBe(false);
      for (let i = 1; i < langs.length; i += 1) {
        expect(overlaps(langs[i - 1], langs[i])).toBe(false);
      }
      expect(overlaps(centerBox(layout.cancel), centerBox(layout.confirm))).toBe(false);
      expect(overlaps(centerBox(layout.reset), centerBox(layout.back))).toBe(false);
    }
  });

  it('360×640 和横过来的小屏上，语言行也完整留在画面里', () => {
    const screens = [[360, 640], [640, 360]];
    for (const [screenW, screenH] of screens) {
      const size = computeExpandSize(960, 540, screenW, screenH);
      const layout = layoutSettings({
        viewWidth: size.gameWidth,
        viewHeight: size.gameHeight,
      });
      const boxes = [
        centerBox(layout.title),
        centerBox(layout.music),
        centerBox(layout.sfx),
        centerBox(layout.vibrate),
        centerBox(layout.fx),
        centerBox(layout.fps),
        centerBox(layout.language),
        centerBox(layout.langLabel),
        centerBox(layout.reset),
        centerBox(layout.back),
        ...layout.fxButtons.map(centerBox),
        ...layout.langButtons.map(centerBox),
      ];
      for (const box of boxes) {
        expect(box.t, `${screenW}x${screenH}`).toBeGreaterThanOrEqual(0);
        expect(box.b, `${screenW}x${screenH}`).toBeLessThanOrEqual(size.gameHeight + 0.5);
        expect(box.l, `${screenW}x${screenH}`).toBeGreaterThanOrEqual(0);
        expect(box.r, `${screenW}x${screenH}`).toBeLessThanOrEqual(size.gameWidth + 0.5);
      }
      const rows = [layout.music, layout.sfx, layout.vibrate, layout.fx, layout.fps, layout.language, layout.reset].map(centerBox);
      for (let i = 1; i < rows.length; i += 1) {
        expect(overlaps(rows[i - 1], rows[i]), `${screenW}x${screenH}`).toBe(false);
      }
      if (screenW > screenH) {
        const cssH = layout.langButtons[0].h * size.scale;
        const cssW = layout.langButtons[0].w * size.scale;
        expect(cssH, `${screenW}x${screenH} 语言按钮高`).toBeGreaterThanOrEqual(44);
        expect(cssW, `${screenW}x${screenH} 语言按钮宽`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('主页的设置按钮挨在全屏左边，不和声音叠在一起', () => {
    const hud = layoutHud({
      viewWidth: 960,
      viewHeight: 540,
      showSettings: true,
      showFullscreen: true,
    });
    expect(hud.settings.x).toBeLessThan(hud.fullscreen.x);
    expect(hud.fullscreen.x).toBeLessThan(hud.sound.x);
    expect(hud.fullscreen.x - hud.settings.x).toBeGreaterThanOrEqual(ICON_HIT);
  });
});

function centerBox(item) {
  return {
    l: item.x - item.w / 2,
    r: item.x + item.w / 2,
    t: item.y - item.h / 2,
    b: item.y + item.h / 2,
  };
}

function cornerBox(item) {
  return {
    l: item.x,
    r: item.x + item.w,
    t: item.y,
    b: item.y + item.h,
  };
}

function overlaps(a, b) {
  return a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
}
