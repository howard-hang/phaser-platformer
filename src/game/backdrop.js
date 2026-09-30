/**
 * 三层视差背景：远景山、中景光柱、近景光带，底下还有天空渐变。
 * 近景不再铺等距网格，改成透视地平线和疏密不一的线段、颗粒。
 * 图形只在进游戏时烤进贴图。滚动时改坐标和贴图序号，不每帧重画。
 */
import { LEVEL_PALETTES } from './theme.js';
import { TUNING } from '../logic/world.js';

/** 越靠前的层跟镜头越紧。数字必须递增，远景才真的更慢。 */
export const PARALLAX = {
  stars: 0.08,
  mountains: 0.24,
  pillars: 0.46,
  near: 0.8,
};

const TEX = {
  sky: { w: 16, h: 256 },
  star: { w: 32, h: 32 },
  mountains: { w: 1024, h: 192 },
  beam: { w: 32, h: 256 },
  glow: { w: 48, h: 48 },
};

export const NEAR_W = 1024;
export const NEAR_H = 176;
const NEAR_VARIANTS = 8;

/**
 * 近景贴图的播放顺序。24 张才循环一次，单关镜头走不完一整圈，避免一眼看出重复。
 * 相邻两张不是同一张，疏的和密的也不按固定节拍交替。
 */
export const NEAR_SEQUENCE = [
  0, 3, 7, 1, 4, 2, 6, 5,
  1, 5, 2, 7, 0, 4, 3, 6,
  2, 6, 1, 5, 3, 0, 7, 4,
];

const BEAM_SPAN = 420;
const GLOW_SPAN = 420;
/** 近景底边离地面的空隙，避开尖刺和方块。 */
const NEAR_CLEARANCE = 50;

/** 第几块近景用哪一张变体。负数坐标也能对上。 */
export function nearVariantAt(tileIndex) {
  const span = NEAR_SEQUENCE.length;
  const index = ((tileIndex % span) + span) % span;
  return NEAR_SEQUENCE[index];
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** 进度 0 偏品红，进度 1 略亮、略冷。只改乘色，不重绘。 */
export function progressTint(progress) {
  const t = Math.max(0, Math.min(1, progress));
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  const r = lerp(0xff, 0xff);
  const g = lerp(0xc8, 0xf0);
  const b = lerp(0xea, 0xff);
  return (r << 16) | (g << 8) | b;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawSky(ctx, w, h, palette) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(0.55, palette.skyMid);
  gradient.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function drawStar(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f5d0fe';
  ctx.beginPath();
  ctx.moveTo(w / 2, 2);
  ctx.lineTo(w - 4, h / 2);
  ctx.lineTo(w / 2, h - 2);
  ctx.lineTo(4, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(224, 247, 255, 0.85)';
  ctx.fillRect(w / 2 - 3, h / 2 - 3, 6, 6);
}

function drawBeam(ctx, w, h, palette) {
  ctx.clearRect(0, 0, w, h);
  const beam = ctx.createLinearGradient(0, 0, 0, h);
  beam.addColorStop(0, 'rgba(224, 247, 255, 0)');
  beam.addColorStop(0.25, palette.beam);
  beam.addColorStop(0.7, palette.beamCore);
  beam.addColorStop(1, 'rgba(192, 38, 211, 0)');
  ctx.fillStyle = beam;
  ctx.fillRect(8, 0, 16, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(14, 0, 4, h);
}

function drawGlow(ctx, w, h, palette) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = palette.glow;
  ctx.fillRect(4, 4, w - 8, h - 8);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, w - 12, h - 12);
}

function drawMountains(ctx, w, h, palette) {
  ctx.clearRect(0, 0, w, h);
  // 步长都能整除宽度，左右边缘接得上，横着平铺没有断口。
  const ridges = [
    { color: palette.ridge[0], step: 256, peak: 0.78, base: 0.28 },
    { color: palette.ridge[1], step: 160, peak: 0.58, base: 0.18 },
    { color: palette.ridge[2], step: 128, peak: 0.36, base: 0.08 },
  ];
  ridges.forEach((ridge) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x += ridge.step) {
      const lift = (x / ridge.step) % 2 === 0 ? 1 : 0.72;
      ctx.lineTo(x, h * (1 - ridge.base));
      ctx.lineTo(x + ridge.step / 2, h * (1 - ridge.peak * lift));
    }
    // 右边缘落在和左边缘相同的高度上，横着平铺才没有断口。
    ctx.lineTo(w, h * (1 - ridge.base));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = ridge.color;
    ctx.fill();
  });
  ctx.fillStyle = palette.horizon;
  ctx.fillRect(0, h - 6, w, 3);
}

/** 每张近景共用的横线高度，拼在一起是连续的透视地平线。越靠上越密、越淡。 */
function horizonLines(height) {
  const lines = [];
  const count = 8;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    lines.push({
      y: Math.round(10 + (t ** 1.55) * (height - 28)),
      alpha: 0.08 + (1 - t) * 0.16,
      width: i === count - 1 ? 2 : 1,
    });
  }
  return lines;
}

const HORIZON = horizonLines(NEAR_H);

/**
 * 变体决定这一段有多疏、多密。线段和颗粒都烤死在贴图里。
 * 0 几乎只有地平线，后面几张逐渐出现成团的亮线。
 */
function drawNear(ctx, w, h, variant) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  for (const line of HORIZON) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${line.alpha})`;
    ctx.lineWidth = line.width;
    ctx.beginPath();
    ctx.moveTo(0, line.y);
    ctx.lineTo(w, line.y);
    ctx.stroke();
  }

  const rng = mulberry32(variant * 9973 + 41);
  const segmentBudget = [1, 3, 5, 4, 8, 2, 11, 6][variant] || 4;
  const dotBudget = [0, 2, 1, 7, 3, 10, 4, 14][variant] || 3;
  for (let i = 0; i < segmentBudget; i += 1) {
    const x = 12 + rng() * (w - 24);
    const y = 16 + rng() * (h - 36);
    const len = 16 + rng() * (variant % 3 === 0 ? 36 : 78);
    const vertical = rng() < (variant === 6 ? 0.75 : 0.28);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 + rng() * 0.28})`;
    ctx.lineWidth = rng() < 0.18 ? 2.5 : 1.25;
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (vertical) ctx.lineTo(x + (rng() - 0.5) * 14, y + len * 0.55);
    else ctx.lineTo(Math.min(w - 8, x + len), y + (rng() - 0.5) * 12);
    ctx.stroke();
  }
  for (let i = 0; i < dotBudget; i += 1) {
    const x = 8 + rng() * (w - 16);
    const y = 12 + rng() * (h - 24);
    const s = rng() < 0.5 ? 3 : 4;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.28 + rng() * 0.35})`;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    ctx.fill();
  }

  // 上下边缘淡出，近景不会切出一条硬边，也不会压到地面障碍。
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(0.16, 'rgba(0, 0, 0, 0.9)');
  fade.addColorStop(0.78, 'rgba(0, 0, 0, 0.9)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

function bake(scene, key, width, height, draw) {
  if (scene.textures.exists(key)) return;
  const canvas = canvasOf(width, height);
  draw(canvas.getContext('2d'), width, height);
  scene.textures.addCanvas(key, canvas);
}

/** 进关卡前把背景烤成贴图。每种关卡色调各一套，近景变体全关共用。 */
export function bakeBackdropTextures(scene) {
  bake(scene, 'bg-star', TEX.star.w, TEX.star.h, drawStar);
  LEVEL_PALETTES.forEach((palette, index) => {
    bake(scene, `bg-sky-${index}`, TEX.sky.w, TEX.sky.h, (ctx, w, h) => drawSky(ctx, w, h, palette));
    bake(scene, `bg-mountains-${index}`, TEX.mountains.w, TEX.mountains.h, (ctx, w, h) => drawMountains(ctx, w, h, palette));
    bake(scene, `bg-beam-${index}`, TEX.beam.w, TEX.beam.h, (ctx, w, h) => drawBeam(ctx, w, h, palette));
    bake(scene, `bg-glow-${index}`, TEX.glow.w, TEX.glow.h, (ctx, w, h) => drawGlow(ctx, w, h, palette));
  });
  for (let variant = 0; variant < NEAR_VARIANTS; variant += 1) {
    bake(scene, `bg-near-${variant}`, NEAR_W, NEAR_H, (ctx, w, h) => drawNear(ctx, w, h, variant));
  }
}

function pool(scene, key, depth) {
  return { scene, key, depth, images: [], used: 0 };
}

function take(group, index, textureKey) {
  const key = textureKey || group.key;
  while (group.images.length <= index) {
    group.images.push(
      group.scene.add.image(0, 0, key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(group.depth),
    );
  }
  const image = group.images[index];
  if (textureKey && image.texture.key !== textureKey) image.setTexture(textureKey);
  return image;
}

function hideRest(group, used) {
  if (group.used === used) return;
  for (let i = used; i < group.images.length; i += 1) group.images[i].setVisible(false);
  for (let i = 0; i < used; i += 1) group.images[i].setVisible(true);
  group.used = used;
}

/** 间隔摆开的小图。数量只跟屏幕宽度有关，滚动时只改坐标。 */
function placeRow(group, offset, span, viewWidth, y, nudge) {
  const count = Math.ceil(viewWidth / span) + 2;
  const origin = Math.floor(offset / span);
  for (let i = 0; i < count; i += 1) {
    take(group, i).setPosition((origin + i) * span - offset + nudge, y);
  }
  hideRest(group, count);
}

/** 近景按变体序列换贴图。同一屏上相邻的几块图案不一样。 */
function placeNear(group, offset, viewWidth, y) {
  const span = NEAR_W;
  const count = Math.ceil(viewWidth / span) + 2;
  const origin = Math.floor(offset / span);
  for (let i = 0; i < count; i += 1) {
    const tile = origin + i;
    const image = take(group, i, `bg-near-${nearVariantAt(tile)}`);
    image.setPosition(Math.round(tile * span - offset), Math.round(y));
  }
  hideRest(group, count);
}

/** 创建跟镜头走的背景层。palette 是 LEVEL_PALETTES 的下标。 */
export function createParallax(scene, palette = 0) {
  const index = ((palette % LEVEL_PALETTES.length) + LEVEL_PALETTES.length) % LEVEL_PALETTES.length;
  const sky = scene.add.image(0, 0, `bg-sky-${index}`)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(-40);
  return {
    sky,
    stars: pool(scene, 'bg-star', -30),
    mountains: pool(scene, `bg-mountains-${index}`, -20),
    beams: pool(scene, `bg-beam-${index}`, -12),
    glows: pool(scene, `bg-glow-${index}`, -11),
    near: pool(scene, 'bg-near-0', -4),
    scrollX: 0,
    viewWidth: 0,
    viewHeight: 0,
    scrollY: 0,
  };
}

/** 按当前可视区域铺满。山脊对齐地面，额外的高度留给上方星空。 */
export function layoutParallax(layers, viewWidth, viewHeight, scrollY) {
  const width = Math.max(2, Math.ceil(viewWidth));
  const height = Math.max(2, Math.ceil(viewHeight));
  layers.viewWidth = width;
  layers.viewHeight = height;
  layers.scrollY = scrollY;
  layers.sky.setPosition(0, 0).setDisplaySize(width, height);
  scrollParallax(layers, layers.scrollX || 0);
}

/** 只挪已经烤好的贴图，不重画。 */
export function scrollParallax(layers, scrollX) {
  layers.scrollX = scrollX;
  const groundScreen = TUNING.groundY - layers.scrollY;
  const viewWidth = layers.viewWidth || TUNING.viewWidth;
  placeRow(
    layers.mountains,
    scrollX * PARALLAX.mountains,
    TEX.mountains.w,
    viewWidth,
    groundScreen - TEX.mountains.h + 8,
    0,
  );
  placeNear(
    layers.near,
    scrollX * PARALLAX.near,
    viewWidth,
    groundScreen - NEAR_CLEARANCE - NEAR_H,
  );
  placeRow(layers.beams, scrollX * PARALLAX.pillars, BEAM_SPAN, viewWidth, groundScreen - TEX.beam.h - 8, 0);
  placeRow(layers.glows, scrollX * PARALLAX.pillars, GLOW_SPAN, viewWidth, groundScreen - 200, 150);
  placeRow(layers.stars, scrollX * PARALLAX.stars, 360, viewWidth, 28, 20);
}

export function tintParallax(layers, progress) {
  const tint = progressTint(progress);
  layers.sky.setTint(tint);
  const groups = [layers.stars, layers.mountains, layers.beams, layers.glows, layers.near];
  for (let g = 0; g < groups.length; g += 1) {
    const images = groups[g].images;
    for (let i = 0; i < images.length; i += 1) images[i].setTint(tint);
  }
}
