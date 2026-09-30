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

function drawBlock(ctx) {
  ctx.fillStyle = '#24082f';
  ctx.fillRect(0, 0, 42, 42);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 38, 38);
  ctx.strokeRect(13, 13, 16, 16);
}

/** 从天花板垂下来的尖刺，尖端朝下。 */
function drawSpikeDown(ctx) {
  ctx.beginPath();
  ctx.moveTo(18, 34);
  ctx.lineTo(34, 3);
  ctx.lineTo(2, 3);
  ctx.closePath();
  ctx.fillStyle = '#1a0a22';
  ctx.fill();
  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** 周期门。关着的时候挡在地面上，样式和方块区分开。 */
function drawGate(ctx) {
  ctx.fillStyle = '#14081c';
  ctx.fillRect(4, 0, 34, 42);
  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 2, 30, 38);
  ctx.fillStyle = '#67e8f9';
  ctx.fillRect(8, 18, 26, 4);
}

/** 会塌掉的平台砖，中间一条裂纹。 */
function drawCrumble(ctx) {
  ctx.fillStyle = '#3f2a12';
  ctx.fillRect(0, 0, 42, 42);
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 38, 38);
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(22, 20);
  ctx.lineTo(12, 34);
  ctx.moveTo(22, 12);
  ctx.lineTo(34, 30);
  ctx.stroke();
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
  ctx.lineWidth = 6;
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
  ctx.lineWidth = 6;
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

/** 选关卡片上的空心星，和关卡里的实心星分开，避免改到玩法贴图。 */
function drawStarOutline(ctx) {
  starPath(ctx, 32, 32, 22, 9);
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** 锁。白描边，卡片上不再用文字代替图标。 */
function drawLock(ctx) {
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(32, 26, 11, Math.PI, 0);
  ctx.stroke();
  ctx.fillRect(16, 28, 32, 24);
  ctx.fillStyle = '#4a1468';
  ctx.beginPath();
  ctx.arc(32, 38, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(30.5, 39, 3, 7);
}

function drawSpeaker(ctx, muted) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
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
  make('spike-down', HITBOX.spike.w, HITBOX.spike.h, drawSpikeDown);
  make('block', HITBOX.block.w, HITBOX.block.h, drawBlock);
  make('gate', HITBOX.block.w, HITBOX.block.h, drawGate);
  make('crumble', HITBOX.block.w, HITBOX.block.h, drawCrumble);
  make('star', HITBOX.star.w, HITBOX.star.h, drawStar);
  make('ui-star-empty', 64, 64, drawStarOutline);
  make('ui-lock', 64, 64, drawLock);
  make('icon-home', 64, 64, drawHome);
  make('icon-sound', 64, 64, (ctx) => drawSpeaker(ctx, false));
  make('icon-mute', 64, 64, (ctx) => drawSpeaker(ctx, true));
  make('icon-fullscreen', 64, 64, (ctx) => drawFullscreen(ctx, false));
  make('icon-fullscreen-exit', 64, 64, (ctx) => drawFullscreen(ctx, true));
}
