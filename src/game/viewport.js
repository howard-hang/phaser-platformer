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
/** 圆形图标按钮的点击区。比画出来的圆更大，手机上仍好按。 */
export const ICON_HIT = 88;
/**
 * 文字按钮的高度。按 320 CSS 像素高的横屏来算，游戏像素大约是屏幕的 540/320，
 * 76 落到屏幕上仍有大约 45 CSS 像素，不低于 44。
 */
export const CANDY_BUTTON_H = 76;

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
  showSettings = false,
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
  if (showHome) cursor -= BUTTON_GAP;
  // 设置在主页按钮左边。主页没有主页按钮时，它就挨着全屏或声音。
  const settings = showSettings ? { x: cursor, y: top + 32 } : null;

  // ?fps 计数器占左上角一条，计数文字往下让，避免盖住 SCORE。
  const fps = showFps ? { x: left, y: top, w: 96, h: 26 } : null;
  const statsTop = top + (fps ? fps.h + 10 : 0);
  const leftmost = settings?.x ?? home?.x ?? fullscreen?.x ?? sound.x;
  return {
    score: { x: left, y: statsTop },
    deaths: { x: left, y: statsTop + HUD_LINE },
    stars: { x: left, y: statsTop + HUD_LINE * 2 },
    // 当前道具的图标和倒计时，贴在三行计数下面。
    power: {
      x: left,
      y: statsTop + HUD_LINE * 3 + 8,
      w: 176,
      h: 36,
    },
    fps,
    sound,
    fullscreen,
    home,
    settings,
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
 * 卡片高度至少 76，方便手指点。page 从 0 开始。
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
  const header = 108;
  // 底栏要同时放下页码和 76 像素高的返回、翻页按钮，并和卡片留出空隙。
  const footer = 128;
  const gapX = 12;
  const gapY = 10;
  const minCard = CANDY_BUTTON_H;
  const innerW = Math.max(120, viewWidth - left - right);
  const columns = Math.max(1, Math.min(4, Math.floor((innerW + gapX) / (240 + gapX))));
  const availH = Math.max(80, viewHeight - top - bottom - header - footer);
  let rows = Math.max(2, Math.min(5, Math.floor((availH + gapY) / (minCard + gapY))));
  let cardH = (availH - gapY * (rows - 1)) / rows;
  while (rows > 2 && cardH < minCard) {
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
  // 三颗按钮都是 76 高。中心抬高，底边刚好停在安全区上沿。
  const buttonY = viewHeight - bottom - CANDY_BUTTON_H / 2;
  // 页码夹在上一页和下一页之间，单独一行，不压到按钮。
  const pageY = buttonY - 60;
  return {
    title: { x: viewWidth / 2, y: top + 26, w: 300, h: 44 },
    total: { x: viewWidth / 2, y: top + 74, w: 340, h: 28 },
    cells,
    page: safePage,
    pages,
    pageSize,
    columns,
    rows,
    prev: { x: left + 86, y: buttonY, w: 156, h: CANDY_BUTTON_H },
    next: { x: viewWidth - right - 86, y: buttonY, w: 156, h: CANDY_BUTTON_H },
    back: { x: viewWidth / 2, y: buttonY, w: 210, h: CANDY_BUTTON_H },
    pageLabel: { x: viewWidth / 2, y: pageY, w: 180, h: 28 },
  };
}

/** 通关面板。标题、星星、正文、按钮从上往下排，短屏幕上也不会叠在一起。 */
export function layoutWinPanel({
  viewWidth,
  viewHeight,
  insets = { top: 0, right: 0, bottom: 0, left: 0 },
  buttonWidths = [180, 248, 156],
  buttonHeight = CANDY_BUTTON_H,
  buttonGap = 14,
  starRow = true,
  bodyLines = 2,
} = {}) {
  const topLimit = (insets.top || 0) + 96;
  const bottomLimit = viewHeight - ((insets.bottom || 0) + 12);
  const side = Math.max(insets.left || 0, insets.right || 0) + 24;
  const maxW = Math.max(280, viewWidth - side * 2);
  let widths = buttonWidths.slice();
  let gaps = buttonGap * Math.max(0, widths.length - 1);
  let buttonsTotal = widths.reduce((sum, item) => sum + item, 0) + gaps;
  if (buttonsTotal + 40 > maxW) {
    const room = Math.max(120, maxW - 40 - gaps);
    const raw = widths.reduce((sum, item) => sum + item, 0);
    widths = widths.map((item) => Math.max(72, Math.floor(item * room / raw)));
    buttonsTotal = widths.reduce((sum, item) => sum + item, 0) + gaps;
  }
  const w = Math.min(680, Math.max(buttonsTotal + 40, Math.min(640, maxW)));
  const availH = Math.max(220, bottomLimit - topLimit);
  const pad = 18;
  const titleH = 52;
  const starH = starRow ? 46 : 0;
  const bodyH = bodyLines > 2 ? 96 : 62;
  const h = Math.min(372 + (bodyLines > 2 ? 34 : 0), availH);
  const x = (viewWidth - w) / 2;
  const y = topLimit + Math.max(0, (availH - h) / 2);
  let cursorY = y + pad;
  const title = { x: viewWidth / 2, y: cursorY + titleH / 2, w: w - 48, h: titleH };
  cursorY += titleH + 8;
  const stars = { x: viewWidth / 2, y: cursorY + starH / 2, w: 196, h: starH };
  cursorY += starH + 8;
  const body = { x: viewWidth / 2, y: cursorY + bodyH / 2, w: w - 56, h: bodyH };
  const by = y + h - pad - buttonHeight / 2;
  const buttonTop = by - buttonHeight / 2;
  const bodyBottom = body.y + body.h / 2;
  if (bodyBottom + 8 > buttonTop) {
    body.y -= bodyBottom + 8 - buttonTop;
  }
  let cursorX = viewWidth / 2 - buttonsTotal / 2;
  const buttons = widths.map((bw) => {
    const item = { x: cursorX + bw / 2, y: by, w: bw, h: buttonHeight };
    cursorX += bw + buttonGap;
    return item;
  });
  return {
    panel: { x, y, w, h },
    title,
    stars,
    body,
    buttons,
  };
}

/**
 * 设置页。标题、两条音量、震动、特效、帧率、底部两个按钮。
 * 全部排在刘海和底部安全区之间。竖屏游戏像素更高，行高跟着加到手指点得到。
 * 矮屏放不下时先压标题和间距，再整页缩小，一次就能看全。
 * pxPerCss 是每个 CSS 像素对应多少游戏像素，和 Phaser displayScale 一致。
 */
export function layoutSettings({
  viewWidth,
  viewHeight,
  insets = { top: 0, right: 0, bottom: 0, left: 0 },
  pxPerCss = 1,
} = {}) {
  const pad = 8;
  const topInset = Math.max(0, insets.top || 0);
  const bottomInset = Math.max(0, insets.bottom || 0);
  const leftInset = Math.max(0, insets.left || 0);
  const rightInset = Math.max(0, insets.right || 0);
  const top = topInset + pad;
  const bottomLimit = viewHeight - bottomInset - pad;
  const avail = Math.max(1, bottomLimit - top);
  const side = Math.max(leftInset, rightInset) + 28;
  // 面板不能比安全区更宽，否则左右会被刘海盖住。
  const panelW = Math.min(720, Math.max(180, viewWidth - side * 2));
  const px = Number.isFinite(pxPerCss) && pxPerCss > 0 ? pxPerCss : 1;
  // 44 CSS 像素大约是手指能点中的下限。竖屏上一个游戏像素更小，行要加高。
  // 多 0.05 游戏像素，避免除回去时浮点误差掉到 44 以下。
  const minTouch = 44 * px + 0.05;
  let rowH = Math.max(CANDY_BUTTON_H, minTouch);
  let titleH = 52;
  let gap = 4;
  const blockOf = () => titleH + gap + 6 * rowH + 5 * gap;
  if (blockOf() > avail) {
    const rows = 6 * rowH;
    const chromeBudget = avail - rows;
    if (chromeBudget >= 36) {
      // 先只压缩标题和间距，按钮高度保持能点。
      const chrome = titleH + 6 * gap;
      const scale = chromeBudget / Math.max(1, chrome);
      titleH = Math.max(22, titleH * scale);
      gap = Math.max(1, gap * scale);
      if (blockOf() > avail) gap = Math.max(0, (avail - titleH - rows) / 6);
    } else {
      // 安全区太矮，整页按比例缩小，仍然一次排完。
      const scale = avail / blockOf();
      rowH *= scale;
      titleH *= scale;
      gap *= scale;
    }
    if (blockOf() > avail) rowH -= (blockOf() - avail) / 6;
  }
  const block = blockOf();
  const y0 = top + Math.max(0, (avail - block) / 2);
  let cursor = y0;
  const cx = viewWidth / 2;
  const title = { x: cx, y: cursor + titleH / 2, w: panelW, h: titleH };
  cursor += titleH + gap;
  const row = () => {
    const item = { x: cx, y: cursor + rowH / 2, w: panelW, h: rowH };
    cursor += rowH + gap;
    return item;
  };
  const music = row();
  const sfx = row();
  const vibrate = row();
  const fx = row();
  const fps = row();
  const actions = row();

  const actionGap = 16;
  const resetW = Math.min(280, Math.floor((panelW - actionGap) * 0.56));
  const backW = Math.min(220, panelW - actionGap - resetW);
  const pair = resetW + actionGap + backW;
  const reset = { x: cx - pair / 2 + resetW / 2, y: actions.y, w: resetW, h: rowH };
  const back = { x: cx + pair / 2 - backW / 2, y: actions.y, w: backW, h: rowH };

  const fxGap = 12;
  const fxLabelW = 168;
  const fxInner = panelW - fxLabelW;
  const fxW = (fxInner - fxGap * 2) / 3;
  const fxButtons = ['high', 'low', 'off'].map((id, index) => ({
    id,
    x: fx.x - panelW / 2 + fxLabelW + fxW / 2 + index * (fxW + fxGap),
    y: fx.y,
    w: fxW,
    h: rowH,
  }));
  const fxLabel = {
    x: fx.x - panelW / 2 + fxLabelW / 2,
    y: fx.y,
    w: fxLabelW,
    h: rowH,
  };

  // 滑条左右留一点，避免圆钮贴到屏幕边。数值按这条轨道换算。
  const trackPad = 22;
  const trackOf = (rowBox) => ({
    x: rowBox.x,
    y: rowBox.y + 10,
    w: rowBox.w - trackPad * 2,
    h: 28,
  });

  const safeW = Math.max(180, viewWidth - leftInset - rightInset - 16);
  const dialogW = Math.min(560, Math.max(280, Math.min(panelW, safeW)));
  const dialogRow = Math.min(rowH, CANDY_BUTTON_H);
  const safeH = Math.max(dialogRow + 80, viewHeight - topInset - bottomInset);
  let dialogH = Math.min(280, safeH - 8);
  const dialog = {
    x: Math.max(leftInset + 8, (viewWidth - dialogW) / 2),
    y: topInset + Math.max(8, (safeH - dialogH) / 2),
    w: dialogW,
    h: dialogH,
  };
  const dialogBtnY = dialog.y + dialogH - 16 - dialogRow / 2;
  const cancel = { x: cx - 104, y: dialogBtnY, w: 168, h: dialogRow };
  const confirm = { x: cx + 112, y: dialogBtnY, w: 188, h: dialogRow };

  return {
    title,
    music,
    sfx,
    musicTrack: trackOf(music),
    sfxTrack: trackOf(sfx),
    vibrate,
    fx,
    fxLabel,
    fxButtons,
    fps,
    reset,
    back,
    dialog,
    cancel,
    confirm,
    panelW,
    // 场景按这个字号画，避免字比格子高，贴到下一行上。
    titleFont: titleH >= 50 ? 40 : Math.max(18, Math.round(titleH * 0.72)),
    rowFont: Math.max(16, Math.min(36, Math.round(rowH * 0.4))),
  };
}
