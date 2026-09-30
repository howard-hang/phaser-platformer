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
    'padding-top:env(safe-area-inset-top)',
    'padding-right:env(safe-area-inset-right)',
    'padding-bottom:env(safe-area-inset-bottom)',
    'padding-left:env(safe-area-inset-left)',
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
} = {}) {
  const top = (insets.top || 0) + HUD_MARGIN_Y;
  const left = (insets.left || 0) + HUD_MARGIN_X;
  let cursor = viewWidth - (insets.right || 0) - BUTTON_INSET;
  const sound = { x: cursor, y: top + 32 };
  cursor -= BUTTON_GAP;
  const fullscreen = showFullscreen ? { x: cursor, y: top + 32 } : null;
  if (showFullscreen) cursor -= BUTTON_GAP;
  const home = showHome ? { x: cursor, y: top + 32 } : null;

  const leftmost = home?.x ?? fullscreen?.x ?? sound.x;
  return {
    score: { x: left, y: top },
    deaths: { x: left, y: top + HUD_LINE },
    stars: { x: left, y: top + HUD_LINE * 2 },
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
