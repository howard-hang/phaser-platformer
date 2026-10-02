/**
 * 扁平糖果按钮和标题字。
 * 实心高饱和色、大圆角、底部深色厚边和轻投影。按下时脸部下沉并轻微缩小。
 * 颜色集中在这里，主按钮、次按钮和禁用态不要各写一套。
 */
import Phaser from 'phaser';
import { FONT } from './theme.js';
import { CANDY_BUTTON_H, ICON_HIT } from './viewport.js';

/** 糖果色板。face 是按钮脸，lip 是底部厚边，hover 是悬停提亮。 */
export const CANDY = {
  pink: { face: 0xff4b8d, hover: 0xff86b4, lip: 0xb01258, ink: '#ffffff', darkInk: false },
  mint: { face: 0x2ee6a6, hover: 0x73f2c4, lip: 0x0c8f62, ink: '#064e3b', darkInk: true },
  lemon: { face: 0xffe14a, hover: 0xfff09a, lip: 0xd4920a, ink: '#6a3d00', darkInk: true },
  sky: { face: 0x3ec6ff, hover: 0x85d9ff, lip: 0x0277b8, ink: '#083344', darkInk: true },
  grape: { face: 0xd08bff, hover: 0xe4beff, lip: 0x8b2fc9, ink: '#3b0764', darkInk: true },
  coral: { face: 0xff7a59, hover: 0xffaa96, lip: 0xd1432b, ink: '#ffffff', darkInk: false },
  disabled: { face: 0xcfc6d8, hover: 0xcfc6d8, lip: 0x958da3, ink: '#6d6478', darkInk: true },
  locked: { face: 0x4c3560, hover: 0x4c3560, lip: 0x2e1c40, ink: '#f6ecff', darkInk: false },
};

export const PANEL = {
  face: 0xfff7fb,
  lip: 0x6d28d9,
  shadow: 0x2a0840,
  title: '#e11d74',
  body: '#4a1468',
};

const SHADOW = 0x2a0840;

export function candyPalette(name) {
  return CANDY[name] || CANDY.pink;
}

/** 标题、正文、数字共用的文字样式。描边和投影保证压在紫背景上仍清楚。 */
export function textStyle({
  size = 24,
  color = '#ffffff',
  stroke = '#3b0764',
  strokeThickness,
  align = 'center',
  shadow = true,
  padding,
  lineSpacing,
} = {}) {
  const style = {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke,
    strokeThickness: strokeThickness ?? Math.max(3, Math.round(size * 0.1)),
    align,
    resolution: 2,
    padding: padding ?? { x: 3, y: 2 },
  };
  if (lineSpacing) style.lineSpacing = lineSpacing;
  if (shadow) {
    style.shadow = {
      offsetX: 0,
      offsetY: Math.max(2, Math.round(size * 0.08)),
      color: '#2a0840',
      blur: 0,
      stroke: false,
      fill: true,
    };
  }
  return style;
}

export function addCandyText(scene, x, y, content, options) {
  return scene.add.text(x, y, content, textStyle(options)).setOrigin(options?.originX ?? 0.5, options?.originY ?? 0.5);
}

function buttonMetrics(height, pressed) {
  const shadowDrop = height >= 68 ? 5 : 4;
  const lip = height >= 68 ? 8 : 6;
  const sink = pressed ? lip : 0;
  const faceH = Math.max(8, height - shadowDrop - lip);
  const faceTop = -height / 2 + sink;
  return {
    shadowDrop,
    lip,
    sink,
    faceH,
    faceTop,
    faceCenter: faceTop + faceH / 2,
    radius: Math.min(22, Math.max(12, height * 0.34)),
  };
}

/**
 * 圆角实心块：投影、深色厚边、亮色脸、顶部一条高光。
 * 按下时脸部下移，厚边被盖住，看起来陷进影子里。
 */
export function paintCandyRect(graphics, width, height, face, lip, pressed) {
  const m = buttonMetrics(height, pressed);
  const radius = Math.min(m.radius, width / 2, height / 2);
  const x = -width / 2;
  const top = -height / 2;
  graphics.clear();
  graphics.fillStyle(SHADOW, pressed ? 0.14 : 0.32);
  graphics.fillRoundedRect(x + 2, top + m.shadowDrop + 2, width, height - m.shadowDrop, radius);
  graphics.fillStyle(lip, 1);
  graphics.fillRoundedRect(x, top + m.sink, width, height - m.shadowDrop - m.sink, radius);
  graphics.fillStyle(face, 1);
  graphics.fillRoundedRect(x, m.faceTop, width, m.faceH, Math.min(radius, m.faceH / 2));
  if (!pressed && m.faceH > 20) {
    const barH = Math.max(5, Math.round(m.faceH * 0.15));
    graphics.fillStyle(0xffffff, 0.24);
    graphics.fillRoundedRect(x + 12, m.faceTop + 6, Math.max(8, width - 24), barH, barH / 2);
  }
  return m;
}

function paintCandyCircle(graphics, diameter, face, lip, pressed) {
  const lipDrop = 6;
  const radius = diameter / 2 - 2;
  graphics.clear();
  graphics.fillStyle(SHADOW, pressed ? 0.14 : 0.32);
  graphics.fillCircle(2, lipDrop + 1, radius);
  graphics.fillStyle(lip, 1);
  graphics.fillCircle(0, pressed ? 0 : 2, radius);
  graphics.fillStyle(face, 1);
  graphics.fillCircle(0, pressed ? 0 : -lipDrop * 0.55, radius);
  if (!pressed) {
    graphics.fillStyle(0xffffff, 0.28);
    graphics.fillCircle(-radius * 0.28, -radius * 0.42, radius * 0.2);
  }
  return { faceCenter: pressed ? 0 : -lipDrop * 0.55 };
}

function labelStyle(palette, fontSize) {
  if (palette.darkInk) {
    return textStyle({
      size: fontSize,
      color: palette.ink,
      stroke: '#ffffff',
      strokeThickness: 3,
      shadow: false,
      padding: { x: 2, y: 2 },
    });
  }
  return textStyle({
    size: fontSize,
    color: palette.ink,
    stroke: '#4a1468',
    strokeThickness: 4,
    shadow: false,
    padding: { x: 2, y: 2 },
  });
}

/**
 * 统一按钮。shape 为 circle 时是右上角那种圆形图标按钮。
 * 点击区至少一颗按钮那么高，圆形按钮另加 88 的热区，方便手指。
 */
export function createCandyButton(scene, {
  x = 0,
  y = 0,
  width = 200,
  height = CANDY_BUTTON_H,
  label = '',
  variant = 'pink',
  fontSize = 28,
  depth = 20,
  onClick = () => {},
  enabled = true,
  shape = 'rect',
  iconKey = null,
} = {}) {
  const root = scene.add.container(x, y).setScrollFactor(0).setDepth(depth);
  const body = scene.add.graphics().setScrollFactor(0);
  root.add(body);

  let caption = null;
  let icon = null;
  if (label) {
    caption = scene.add.text(0, 0, label, labelStyle(candyPalette(variant), fontSize))
      .setOrigin(0.5)
      .setScrollFactor(0);
    root.add(caption);
  }
  if (iconKey) {
    const iconSize = shape === 'circle' ? 30 : 28;
    icon = scene.add.image(0, 0, iconKey).setDisplaySize(iconSize, iconSize).setScrollFactor(0);
    root.add(icon);
  }

  const hitW = shape === 'circle' ? ICON_HIT : Math.max(width, CANDY_BUTTON_H);
  const hitH = shape === 'circle' ? ICON_HIT : Math.max(height, CANDY_BUTTON_H);
  // 容器记下尺寸，热区用同尺寸的 Zone。Zone 不在容器里，避免容器缩放时把点击区挤偏。
  root.setSize(hitW, hitH);
  const zone = scene.add.zone(x, y, hitW, hitH)
    .setScrollFactor(0)
    .setDepth(depth + 1)
    .setData('ui', true);
  const hitConfig = {
    hitArea: new Phaser.Geom.Rectangle(0, 0, hitW, hitH),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  };

  const state = {
    enabled,
    pressed: false,
    hovered: false,
    variant,
    width,
    height,
    fontSize,
    label,
  };

  function palette() {
    return state.enabled ? candyPalette(state.variant) : CANDY.disabled;
  }

  function fitLabel() {
    if (!caption) return;
    const maxW = state.width - 28;
    let size = state.fontSize;
    caption.setStyle(labelStyle(palette(), size));
    caption.setText(state.label);
    while (size > 16 && caption.width > maxW) {
      size -= 1;
      caption.setFontSize(`${size}px`);
    }
  }

  function redraw() {
    const pal = palette();
    const face = state.hovered && state.enabled && !state.pressed ? pal.hover : pal.face;
    let faceCenter = 0;
    if (shape === 'circle') {
      faceCenter = paintCandyCircle(body, state.width, face, pal.lip, state.pressed).faceCenter;
    } else {
      faceCenter = paintCandyRect(body, state.width, state.height, face, pal.lip, state.pressed).faceCenter;
    }
    if (caption) caption.setY(faceCenter);
    if (icon) {
      icon.setY(faceCenter);
      icon.setTint(pal.darkInk ? 0x3b0764 : 0xffffff);
      icon.setAlpha(state.enabled ? 1 : 0.7);
    }
    if (caption) caption.setAlpha(state.enabled ? 1 : 0.86);
    root.setScale(state.pressed ? 0.96 : 1);
  }

  // setInteractive() 在 input 已存在时只把 enabled 设回 true，不会重新排队。
  // 对象会停在「看着能点、名单里却没有」的状态，鼠标和触屏都打不中。
  function syncInput() {
    const plugin = zone.scene?.sys?.input;
    if (!plugin) return;
    const drop = plugin._pendingRemoval.indexOf(zone);
    if (drop !== -1) plugin._pendingRemoval.splice(drop, 1);
    const listed = plugin._list.includes(zone);
    const queued = plugin._pendingInsertion.includes(zone);
    if (!zone.input || (!listed && !queued)) {
      plugin.setHitArea(zone, hitConfig);
    }
    const pending = plugin._pendingInsertion.indexOf(zone);
    if (pending !== -1 && !plugin._list.includes(zone)) {
      plugin._pendingInsertion.splice(pending, 1);
      plugin._list.push(zone);
    }
    if (zone.input) zone.input.enabled = !!state.enabled;
  }

  function bind() {
    zone.removeAllListeners();
    if (!zone.scene?.sys) return;
    syncInput();
    if (!state.enabled) return;
    zone.on('pointerover', (pointer) => {
      if (pointer?.wasTouch) return;
      state.hovered = true;
      redraw();
    });
    zone.on('pointerout', () => {
      state.hovered = false;
      redraw();
    });
    zone.on('pointerdown', () => {
      scene.suppressJump = true;
      state.pressed = true;
      redraw();
    });
    zone.on('pointerup', () => {
      scene.suppressJump = true;
      const fire = state.pressed && state.enabled;
      state.pressed = false;
      redraw();
      if (fire) onClick();
    });
    zone.on('pointerupoutside', () => {
      state.pressed = false;
      redraw();
    });
  }

  fitLabel();
  redraw();
  bind();

  return {
    zone,
    root,
    caption,
    icon,
    get width() { return state.width; },
    get height() { return state.height; },
    setPosition(nx, ny) {
      root.setPosition(nx, ny);
      zone.setPosition(nx, ny);
      syncInput();
    },
    setEnabled(value) {
      state.enabled = !!value;
      state.pressed = false;
      state.hovered = false;
      fitLabel();
      redraw();
      bind();
    },
    setLabel(text) {
      state.label = text;
      fitLabel();
      redraw();
    },
    setFontSize(size) {
      state.fontSize = typeof size === 'string' ? parseInt(size, 10) : size;
      fitLabel();
    },
    setIcon(key) {
      icon?.setTexture(key);
      redraw();
    },
    setVariant(name) {
      state.variant = name;
      fitLabel();
      redraw();
    },
    /** 设置页按画面宽度改按钮。圆形图标按钮不走这里。 */
    setSize(width, height = state.height) {
      if (shape === 'circle') return;
      state.width = width;
      state.height = height;
      const hitW = Math.max(state.width, CANDY_BUTTON_H);
      const hitH = Math.max(state.height, CANDY_BUTTON_H);
      root.setSize(hitW, hitH);
      zone.setSize(hitW, hitH);
      hitConfig.hitArea.setSize(hitW, hitH);
      fitLabel();
      redraw();
      syncInput();
    },
  };
}

/** 主页上的大按钮，沿用原来的调用方式。 */
export function createStartButton(scene, x, y, onClick, label = '开始游戏', width = 280) {
  const button = createCandyButton(scene, {
    x,
    y,
    width,
    height: CANDY_BUTTON_H,
    label,
    variant: 'pink',
    fontSize: width >= 240 ? 34 : 28,
    depth: 20,
    onClick,
  });
  return button;
}

const LOGO_GLYPHS = [
  { fill: '#ff4b8d', extrude: '#9d174d' },
  { fill: '#ffe14a', extrude: '#c2410c' },
  { fill: '#3dffb0', extrude: '#047857' },
  { fill: '#38c6ff', extrude: '#0369a1' },
];

/** 「方块跑酷」四个字分色，厚描边再加一层向下的立体阴影。 */
export function createCandyLogo(scene, text = '方块跑酷') {
  const size = 70;
  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(12);
  const chars = [...text].map((ch, index) => {
    const spec = LOGO_GLYPHS[index % LOGO_GLYPHS.length];
    const back = scene.add.text(0, 0, ch, textStyle({
      size,
      color: spec.extrude,
      stroke: '#2a0840',
      strokeThickness: 12,
      shadow: false,
      padding: { x: 6, y: 6 },
    })).setOrigin(0.5);
    const front = scene.add.text(0, 0, ch, textStyle({
      size,
      color: spec.fill,
      stroke: '#3b0764',
      strokeThickness: 8,
      shadow: false,
      padding: { x: 6, y: 6 },
    })).setOrigin(0.5);
    root.add(back);
    root.add(front);
    return { back, front, w: front.width };
  });
  const gap = -6;
  const total = chars.reduce((sum, item) => sum + item.w, 0) + gap * (chars.length - 1);
  let cursor = -total / 2;
  for (const item of chars) {
    const cx = cursor + item.w / 2;
    item.back.setPosition(cx + 4, 9);
    item.front.setPosition(cx, 0);
    cursor += item.w + gap;
  }
  return {
    root,
    setPosition(nx, ny) {
      root.setPosition(nx, ny);
    },
  };
}

/** 通关面板和错误画面的圆角色块。实心底，底部一条紫色厚边。 */
export function paintCandyPanel(graphics, x, y, w, h) {
  const radius = 26;
  const lip = 8;
  graphics.clear();
  graphics.fillStyle(PANEL.shadow, 0.34);
  graphics.fillRoundedRect(x + 3, y + 10, w, h, radius);
  graphics.fillStyle(PANEL.lip, 1);
  graphics.fillRoundedRect(x, y + lip, w, h - lip, radius);
  graphics.fillStyle(PANEL.face, 1);
  graphics.fillRoundedRect(x, y, w, Math.max(12, h - lip), radius);
}

/** 右对齐固定格子的数字。格子按最宽数字留空，分数变长时不再左右跳。 */
export function createFixedDigits(scene, color, digits, size = 26) {
  const style = textStyle({
    size,
    color,
    stroke: '#2a0840',
    strokeThickness: 4,
    align: 'center',
    shadow: true,
    padding: { x: 1, y: 1 },
  });
  const probe = scene.add.text(0, 0, '8', style).setVisible(false);
  let cell = probe.width;
  for (const ch of '0123456789') {
    probe.setText(ch);
    cell = Math.max(cell, probe.width);
  }
  probe.destroy();
  const cells = [];
  for (let i = 0; i < digits; i += 1) {
    cells.push(scene.add.text(0, 0, '', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(240));
  }
  return {
    cell,
    setPosition(x, y) {
      cells.forEach((item, index) => {
        item.setPosition(x + (index + 0.5) * cell, y);
      });
    },
    setValue(value) {
      const raw = String(Math.max(0, Math.floor(Number(value) || 0)));
      const shown = raw.length > digits ? raw.slice(-digits) : raw.padStart(digits, ' ');
      cells.forEach((item, index) => {
        const ch = shown[index] === ' ' ? '' : shown[index];
        if (item.text !== ch) item.setText(ch);
      });
    },
    width: cell * digits,
  };
}
