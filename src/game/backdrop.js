/**
 * 三层视差背景，外加一张铺满画面的天空渐变。
 * 图形只在进游戏时画进贴图。滚动时改 TileSprite 的 tilePosition，不每帧重画。
 * 关卡走得越远，色调略微变亮，用着色器乘色完成，也不重画贴图。
 */
import { THEME } from './theme.js';
import { TUNING } from '../logic/world.js';

/** 越靠前的层跟镜头越紧。数字必须递增，远景才真的更慢。 */
export const PARALLAX = {
  stars: 0.08,
  mountains: 0.24,
  pillars: 0.46,
  grid: 0.84,
};

const TEX = {
  sky: { w: 16, h: 256 },
  star: { w: 32, h: 32 },
  mountains: { w: 1024, h: 192 },
  beam: { w: 32, h: 256 },
  glow: { w: 48, h: 48 },
  grid: { w: 512, h: 128 },
};

const BEAM_SPAN = 420;
const GLOW_SPAN = 420;

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

function drawSky(ctx, w, h) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#2a0840');
  gradient.addColorStop(0.55, '#6d128c');
  gradient.addColorStop(1, THEME.bg);
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

function drawBeam(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const beam = ctx.createLinearGradient(0, 0, 0, h);
  beam.addColorStop(0, 'rgba(224, 247, 255, 0)');
  beam.addColorStop(0.25, 'rgba(232, 121, 249, 0.45)');
  beam.addColorStop(0.7, 'rgba(103, 232, 249, 0.28)');
  beam.addColorStop(1, 'rgba(192, 38, 211, 0)');
  ctx.fillStyle = beam;
  ctx.fillRect(8, 0, 16, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(14, 0, 4, h);
}

function drawGlow(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(240, 171, 252, 0.72)';
  ctx.fillRect(4, 4, w - 8, h - 8);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, w - 12, h - 12);
}

function drawMountains(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  // 步长都能整除宽度，左右边缘接得上，横着平铺没有断口。
  const ridges = [
    { color: '#3b0764', step: 256, peak: 0.78, base: 0.28 },
    { color: '#6b21a8', step: 160, peak: 0.58, base: 0.18 },
    { color: '#a21caf', step: 128, peak: 0.36, base: 0.08 },
  ];
  ridges.forEach((ridge, layer) => {
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
  // 地平线一条窄光，把山和跑道分开。
  ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
  ctx.fillRect(0, h - 6, w, 3);
}

function drawGrid(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 128) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (let x = 0; x < w; x += 128) ctx.fillRect(x, 0, 4, 4);
}

function bake(scene, key, width, height, draw) {
  if (scene.textures.exists(key)) return;
  const canvas = canvasOf(width, height);
  draw(canvas.getContext('2d'), width, height);
  scene.textures.addCanvas(key, canvas);
}

/** 进关卡前把背景烤成贴图。场景重启时直接复用。 */
export function bakeBackdropTextures(scene) {
  bake(scene, 'bg-sky', TEX.sky.w, TEX.sky.h, drawSky);
  bake(scene, 'bg-star', TEX.star.w, TEX.star.h, drawStar);
  bake(scene, 'bg-mountains', TEX.mountains.w, TEX.mountains.h, drawMountains);
  bake(scene, 'bg-beam', TEX.beam.w, TEX.beam.h, drawBeam);
  bake(scene, 'bg-glow', TEX.glow.w, TEX.glow.h, drawGlow);
  bake(scene, 'bg-grid', TEX.grid.w, TEX.grid.h, drawGrid);
}

function pool(scene, key, depth) {
  return { scene, key, depth, images: [], used: 0 };
}

function take(group, index) {
  while (group.images.length <= index) {
    group.images.push(
      group.scene.add.image(0, 0, group.key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(group.depth),
    );
  }
  return group.images[index];
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

/** 创建跟镜头走的背景层。远景山、中景光柱、近景网格各一层，都是烤好的贴图。 */
export function createParallax(scene) {
  const sky = scene.add.image(0, 0, 'bg-sky')
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(-40);
  return {
    sky,
    stars: pool(scene, 'bg-star', -30),
    mountains: pool(scene, 'bg-mountains', -20),
    beams: pool(scene, 'bg-beam', -12),
    glows: pool(scene, 'bg-glow', -11),
    grid: pool(scene, 'bg-grid', -5),
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
  placeRow(
    layers.grid,
    scrollX * PARALLAX.grid,
    TEX.grid.w,
    viewWidth,
    groundScreen - TEX.grid.h + 24,
    0,
  );
  placeRow(layers.beams, scrollX * PARALLAX.pillars, BEAM_SPAN, viewWidth, groundScreen - TEX.beam.h - 8, 0);
  placeRow(layers.glows, scrollX * PARALLAX.pillars, GLOW_SPAN, viewWidth, groundScreen - 200, 150);
  placeRow(layers.stars, scrollX * PARALLAX.stars, 360, viewWidth, 28, 20);
}

export function tintParallax(layers, progress) {
  const tint = progressTint(progress);
  layers.sky.setTint(tint);
  const groups = [layers.stars, layers.mountains, layers.beams, layers.glows, layers.grid];
  for (let g = 0; g < groups.length; g += 1) {
    const images = groups[g].images;
    for (let i = 0; i < images.length; i += 1) images[i].setTint(tint);
  }
}


