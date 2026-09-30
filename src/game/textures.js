/**
 * 全部贴图都用画布画出来：方块、尖刺、星星和按钮图标。
 * 不使用外部 PNG，也不使用 emoji。
 */
import { HITBOX } from '../logic/world.js';

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** 五角星路径，尖角朝上。 */
function starPath(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * (Math.PI / 5);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawPlayer(ctx) {
  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(0, 0, 42, 42);
  // 右下角压一点灰，让方块有轻微体积，仍然是纯几何。
  ctx.fillStyle = '#d4d4d8';
  ctx.beginPath();
  ctx.moveTo(42, 0);
  ctx.lineTo(42, 42);
  ctx.lineTo(0, 42);
  ctx.lineTo(8, 34);
  ctx.lineTo(34, 34);
  ctx.lineTo(34, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 38, 38);
  ctx.fillStyle = '#161616';
  ctx.fillRect(13, 13, 16, 16);
}

function drawSpike(ctx) {
  ctx.beginPath();
  ctx.moveTo(18, 2);
  ctx.lineTo(34, 33);
  ctx.lineTo(2, 33);
  ctx.closePath();
  ctx.fillStyle = '#1a0a22';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** 倒挂的长刺，尖朝下。 */
function drawCeiling(ctx) {
  ctx.beginPath();
  ctx.moveTo(20, 166);
  ctx.lineTo(36, 8);
  ctx.lineTo(4, 8);
  ctx.closePath();
  ctx.fillStyle = '#1a0a22';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20, 120);
  ctx.lineTo(28, 18);
  ctx.lineTo(12, 18);
  ctx.closePath();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 跳板：白条和向上的折线，踩上去会弹得更高。 */
function drawPad(ctx) {
  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(0, 8, 54, 10);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 9, 52, 8);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(14, 8);
  ctx.lineTo(27, 1);
  ctx.lineTo(40, 8);
  ctx.stroke();
}

/** 激光束。关掉时整根隐藏，不在这里画开关。 */
function drawLaser(ctx, width, height) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff4c2';
  ctx.fillRect(width / 2 - 2, 0, 4, height);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
}

function drawBlock(ctx) {
  ctx.fillStyle = '#24082f';
  ctx.fillRect(0, 0, 42, 42);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 38, 38);
  ctx.strokeRect(13, 13, 16, 16);
}

function drawStar(ctx) {
  starPath(ctx, 18, 18, 16, 7);
  ctx.fillStyle = '#ffc107';
  ctx.fill();
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  starPath(ctx, 18, 18, 7, 3);
  ctx.fillStyle = '#fff4c2';
  ctx.fill();
}

function drawHome(ctx) {
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(32, 12);
  ctx.lineTo(12, 30);
  ctx.lineTo(20, 30);
  ctx.lineTo(20, 50);
  ctx.lineTo(44, 50);
  ctx.lineTo(44, 30);
  ctx.lineTo(52, 30);
  ctx.closePath();
  ctx.stroke();
}

/** 全屏图标。进入用四角向外，退出用四角向内。不用 emoji。 */
function drawFullscreen(ctx, active) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const corners = [
    [14, 14],
    [50, 14],
    [14, 50],
    [50, 50],
  ];
  corners.forEach(([x, y]) => {
    const dx = x < 32 ? 1 : -1;
    const dy = y < 32 ? 1 : -1;
    const outward = !active;
    const tipX = outward ? x : x + dx * 10;
    const tipY = outward ? y : y + dy * 10;
    const arm = 14;
    ctx.beginPath();
    ctx.moveTo(tipX + dx * arm, tipY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX, tipY + dy * arm);
    ctx.stroke();
  });
}

function drawSpeaker(ctx, muted) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillRect(14, 26, 8, 12);
  ctx.beginPath();
  ctx.moveTo(22, 26);
  ctx.lineTo(34, 16);
  ctx.lineTo(34, 48);
  ctx.lineTo(22, 38);
  ctx.closePath();
  ctx.fill();
  if (muted) {
    ctx.beginPath();
    ctx.moveTo(42, 22);
    ctx.lineTo(56, 42);
    ctx.moveTo(56, 22);
    ctx.lineTo(42, 42);
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.arc(36, 32, 10, -Math.PI / 3, Math.PI / 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(36, 32, 16, -Math.PI / 3, Math.PI / 3);
  ctx.stroke();
}

/** 进游戏前生成全部贴图，场景重启时不用再画。 */
export function generateTextures(scene) {
  const make = (key, width, height, draw) => {
    if (scene.textures.exists(key)) return;
    const canvas = canvasOf(width, height);
    draw(canvas.getContext('2d'));
    scene.textures.addCanvas(key, canvas);
  };

  make('player', HITBOX.player.w, HITBOX.player.h, drawPlayer);
  make('spike', HITBOX.spike.w, HITBOX.spike.h, drawSpike);
  make('block', HITBOX.block.w, HITBOX.block.h, drawBlock);
  make('ceiling', HITBOX.ceiling.w, HITBOX.ceiling.h, drawCeiling);
  make('pad', HITBOX.pad.w, HITBOX.pad.h, drawPad);
  make('laser-low', HITBOX.laserLow.w, HITBOX.laserLow.h, (ctx) => {
    drawLaser(ctx, HITBOX.laserLow.w, HITBOX.laserLow.h);
  });
  make('laser-high', HITBOX.laserHigh.w, HITBOX.laserHigh.h, (ctx) => {
    drawLaser(ctx, HITBOX.laserHigh.w, HITBOX.laserHigh.h);
  });
  make('star', HITBOX.star.w, HITBOX.star.h, drawStar);
  make('icon-home', 64, 64, drawHome);
  make('icon-sound', 64, 64, (ctx) => drawSpeaker(ctx, false));
  make('icon-mute', 64, 64, (ctx) => drawSpeaker(ctx, true));
  make('icon-fullscreen', 64, 64, (ctx) => drawFullscreen(ctx, false));
  make('icon-fullscreen-exit', 64, 64, (ctx) => drawFullscreen(ctx, true));
}
