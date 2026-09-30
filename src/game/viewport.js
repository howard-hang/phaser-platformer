/**
 * 画面铺满与 HUD 安全区。
 * 设计分辨率是 960×540。更宽或更高的屏幕按同一比例放大可视区域，
 * 多出来的一边能看到更多场景，像素不会被拉变形，也不会留黑边。
 */

export const HUD_MARGIN_X = 22;
export const HUD_MARGIN_Y = 16;
export const HUD_LINE = 40;
/** 右上角按钮中心间距。点选区是 88，间距留得比它大，避免两颗按钮叠在一起。 */
export const BUTTON_GAP = 100;
export const BUTTON_INSET = 52;

/**
 * 计算 EXPAND 之后的游戏宽高。
 * 缩放取宽、高里更小的那一个，短边贴齐屏幕，长边加大游戏区域。
 * @returns {{ scale: number, gameWidth: number, gameHeight: number }}
 */
export function computeExpandSize(baseWidth, baseHeight, screenWidth, screenHeight) {
  const sw = Math.max(1, screenWidth);
  const sh = Math.max(1, screenHeight);
  const bw = Math.max(1, baseWidth);
  const bh = Math.max(1, baseHeight);
  const scaleX = sw / bw;
  const scaleY = sh / bh;
  // 和 Phaser.Scale.EXPAND 同一套算法：短边对齐，另一边扩展。
  if (scaleX < scaleY) {
    return {
      scale: scaleX,
      gameWidth: bw,
      gameHeight: sh / scaleX,
    };
  }
  return {
    scale: scaleY,
    gameWidth: sw / scaleY,
    gameHeight: bh,
  };
}

/**
 * 画面变高时，多出来的高度留给上方天空。
 * 地面离屏幕底边的距离和 16:9 时一样，跳跃也不会把镜头抬起来。
 */
export function verticalCameraScroll(designHeight, cameraHeight) {
  return Math.min(0, designHeight - cameraHeight);
}

/**
 * 把 CSS 像素的安全区换算成游戏像素。
 * displayScale 是「每个 CSS 像素对应多少游戏像素」，和 Phaser displayScale 一致。
 */
export function cssInsetsToGame(insets, displayScale) {
  const src = insets || {};
  const rawX = typeof displayScale === 'number' ? displayScale : displayScale?.x;
  const rawY = typeof displayScale === 'number' ? displayScale : displayScale?.y;
  // 画布还没布局好时 displayScale 可能是 0 或 Infinity，这时按 1:1 算，避免 HUD 坐标变成 NaN。
  const axis = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);
  const scaleX = axis(rawX, 1);
  const scaleY = axis(rawY, scaleX);
  return {
    top: (src.top || 0) * scaleY,
    right: (src.right || 0) * scaleX,
    bottom: (src.bottom || 0) * scaleY,
    left: (src.left || 0) * scaleX,
  };
}

/** 读 env(safe-area-inset-*)。没有刘海时四个值都是 0。 */
export function readSafeAreaInsets(doc = document) {
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
    'padding-right:var(--safe-area-inset-right, env(safe-area-inset-right, 0px))',
    'padding-bottom:var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))',
    'padding-left:var(--safe-area-inset-left, env(safe-area-inset-left, 0px))',
  ].join(';');
  (doc.body || doc.documentElement).appendChild(probe);
  const view = doc.defaultView || window;
  const cs = view.getComputedStyle(probe);
  const read = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };
  const insets = {
    top: read(cs.paddingTop),
    right: read(cs.paddingRight),
    bottom: read(cs.paddingBottom),
    left: read(cs.paddingLeft),
  };
  probe.remove();
  return insets;
}

/**
 * 画布要盖住视觉视口，而不是缩在安全区里面。
 * 左右留白如果来自安卓窗口没伸进挖孔，页面本身涂不到那一块，得在原生层关掉内缩。
 */
export function viewportFillBox(metrics = {}) {
  const pick = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);
  const width = pick(metrics.visualWidth, pick(metrics.innerWidth, 1));
  const height = pick(metrics.visualHeight, pick(metrics.innerHeight, 1));
  const left = Number.isFinite(metrics.offsetLeft) ? metrics.offsetLeft : 0;
  const top = Number.isFinite(metrics.offsetTop) ? metrics.offsetTop : 0;
  return { left, top, width, height };
}

/** 把游戏容器钉在视觉视口上，旋转和浏览器工具栏收起时跟着变。 */
export function applyViewportFill(element, view = window) {
  if (!element || !view) return null;
  const visual = view.visualViewport;
  const box = viewportFillBox({
    innerWidth: view.innerWidth,
    innerHeight: view.innerHeight,
    visualWidth: visual?.width,
    visualHeight: visual?.height,
    offsetLeft: visual?.offsetLeft,
    offsetTop: visual?.offsetTop,
  });
  element.style.position = 'fixed';
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
  element.style.margin = '0';
  element.style.padding = '0';
  return box;
}

/** 安卓壳已经是沉浸式全屏，网页才显示全屏按钮。 */
export function shouldShowFullscreenButton(isNativeApp) {
  return !isNativeApp;
}

/** 当前没全屏就进入，已经全屏就退出。 */
export function nextFullscreenAction(isFullscreen) {
  return isFullscreen ? 'exit' : 'enter';
}

/**
 * HUD 贴着安全区。坐标是游戏像素，原点在画面左上角。
 * 声音按钮始终在最右边，全屏在它左边，主页再往左。
 */
export function layoutHud({
  viewWidth,
  viewHeight,
  insets = { top: 0, right: 0, bottom: 0, left: 0 },
  showHome = false,
  showFullscreen = false,
  showFps = false,
} = {}) {
  const top = (insets.top || 0) + HUD_MARGIN_Y;
  const left = (insets.left || 0) + HUD_MARGIN_X;
  let cursor = viewWidth - (insets.right || 0) - BUTTON_INSET;
  const sound = { x: cursor, y: top + 32 };
  cursor -= BUTTON_GAP;
  const fullscreen = showFullscreen ? { x: cursor, y: top + 32 } : null;
  if (showFullscreen) cursor -= BUTTON_GAP;
  const home = showHome ? { x: cursor, y: top + 32 } : null;

  // ?fps 计数器占左上角一条，计数文字往下让，避免盖住 SCORE。
  const fps = showFps ? { x: left, y: top, w: 96, h: 26 } : null;
  const statsTop = top + (fps ? fps.h + 10 : 0);
  const leftmost = home?.x ?? fullscreen?.x ?? sound.x;
  return {
    score: { x: left, y: statsTop },
    deaths: { x: left, y: statsTop + HUD_LINE },
    stars: { x: left, y: statsTop + HUD_LINE * 2 },
    fps,
    sound,
    fullscreen,
    home,
    centerX: viewWidth / 2,
    centerY: viewHeight / 2,
    // 右上角整块按钮区。点这里只按按钮，不起跳。
    jumpGuard: {
      left: leftmost - 56,
      bottom: top + 88,
    },
  };
}

/**
 * 选关列表。卡片和返回按钮都让开安全区，五关在 16:9 里也能排下。
 */
export function layoutLevelSelect({
  viewWidth,
  viewHeight,
  insets = { top: 0, right: 0, bottom: 0, left: 0 },
  count = 5,
} = {}) {
  const top = (insets.top || 0) + 18;
  const bottom = (insets.bottom || 0) + 16;
  const leftInset = (insets.left || 0) + 28;
  const rightInset = (insets.right || 0) + 28;
  const width = Math.max(280, Math.min(680, viewWidth - leftInset - rightInset));
  const x = Math.max(leftInset, (viewWidth - width) / 2);
  const header = 92;
  const footer = 72;
  const gap = 8;
  const available = viewHeight - top - bottom - header - footer;
  const rowH = Math.max(46, Math.min(68, (available - gap * (count - 1)) / count));
  const rows = [];
  let y = top + header;
  for (let i = 0; i < count; i += 1) {
    rows.push({ x, y, w: width, h: rowH });
    y += rowH + gap;
  }
  return {
    title: { x: viewWidth / 2, y: top + 26 },
    total: { x: viewWidth / 2, y: top + 64 },
    rows,
    back: { x: viewWidth / 2, y: Math.max(y + 8, viewHeight - bottom - 32) },
  };
}

/**
 * 二十关选关板。按屏幕能放下的行列分页，卡片让开安全区。
 * 卡片高度至少 64，方便手指点。page 从 0 开始。
 */
export function layoutLevelBoard({
  viewWidth,
  viewHeight,
  insets = { top: 0, right: 0, bottom: 0, left: 0 },
  count = 20,
  page = 0,
} = {}) {
  const top = (insets.top || 0) + 12;
  const bottom = (insets.bottom || 0) + 12;
  const left = (insets.left || 0) + 18;
  const right = (insets.right || 0) + 18;
  // 标题区只放关卡名和累计星星。页码改到翻页按钮上方，两行不再叠在一起。
  const header = 92;
  // 底栏要同时放下页码和 72 像素高的「返回标题」。
  const footer = 116;
  const gapX = 12;
  const gapY = 10;
  const innerW = Math.max(120, viewWidth - left - right);
  const columns = Math.max(1, Math.min(4, Math.floor((innerW + gapX) / (240 + gapX))));
  const availH = Math.max(80, viewHeight - top - bottom - header - footer);
  let rows = Math.max(2, Math.min(5, Math.floor((availH + gapY) / (68 + gapY))));
  let cardH = (availH - gapY * (rows - 1)) / rows;
  while (rows > 2 && cardH < 64) {
    rows -= 1;
    cardH = (availH - gapY * (rows - 1)) / rows;
  }
  const pageSize = columns * rows;
  const pages = Math.max(1, Math.ceil(Math.max(1, count) / pageSize));
  const safePage = Math.max(0, Math.min(pages - 1, page));
  const cardW = (innerW - gapX * (columns - 1)) / columns;
  const cells = [];
  const start = safePage * pageSize;
  const shown = Math.min(pageSize, Math.max(0, count - start));
  for (let i = 0; i < shown; i += 1) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    cells.push({
      index: start + i,
      x: left + col * (cardW + gapX),
      y: top + header + row * (cardH + gapY),
      w: cardW,
      h: cardH,
    });
  }
  // 返回标题高 72，翻页按钮高 52。中心抬高，底边刚好停在安全区上沿。
  const buttonY = viewHeight - bottom - 36;
  // 页码夹在上一页和下一页之间，单独一行，不压到「返回标题」。
  const pageY = buttonY - 58;
  return {
    title: { x: viewWidth / 2, y: top + 22, w: 220, h: 46 },
    total: { x: viewWidth / 2, y: top + 66, w: 280, h: 26 },
    cells,
    page: safePage,
    pages,
    pageSize,
    columns,
    rows,
    prev: { x: left + 78, y: buttonY, w: 148, h: 52 },
    next: { x: viewWidth - right - 78, y: buttonY, w: 148, h: 52 },
    back: { x: viewWidth / 2, y: buttonY, w: 200, h: 72 },
    pageLabel: { x: viewWidth / 2, y: pageY, w: 180, h: 28 },
  };
}
