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

/** 暂停。两条等宽圆头竖线，缩到圆按钮上仍然认得出，不用表情符号。 */
function drawPause(ctx) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 16);
  ctx.lineTo(20, 48);
  ctx.moveTo(44, 16);
  ctx.lineTo(44, 48);
  ctx.stroke();
}

/** 设置。一圈齿轮，线条和主页、声音图标一样粗，不用表情符号。 */
function drawSettings(ctx) {
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(32, 32, 9, 0, Math.PI * 2);
  ctx.stroke();
  const teeth = 8;
  for (let i = 0; i < teeth; i += 1) {
    const angle = (Math.PI * 2 * i) / teeth - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(32 + Math.cos(angle) * 14, 32 + Math.sin(angle) * 14);
    ctx.lineTo(32 + Math.cos(angle) * 24, 32 + Math.sin(angle) * 24);
    ctx.stroke();
  }
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

function traceRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** 糖果徽章底。先画深色厚边，再盖一层亮面。 */
function drawBadge(ctx, face, lip) {
  ctx.fillStyle = lip;
  traceRoundRect(ctx, 1, 5, 34, 30, 10);
  ctx.fill();
  ctx.fillStyle = face;
  traceRoundRect(ctx, 1, 1, 34, 30, 10);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  traceRoundRect(ctx, 1, 1, 34, 30, 10);
  ctx.stroke();
}

/** 二段跳：两道向上的折线，表示还能再跳一次。 */
function drawPowerDouble(ctx) {
  drawBadge(ctx, '#2ee6a6', '#0c8f62');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  [11, 18].forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(11, y + 5);
    ctx.lineTo(18, y);
    ctx.lineTo(25, y + 5);
    ctx.stroke();
  });
}

/** 护甲图标：一圈盾环，不用表情符号。 */
function drawPowerArmor(ctx) {
  drawBadge(ctx, '#7af0ff', '#147a96');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(18, 20, 8, 0.6, Math.PI * 2 - 0.2);
  ctx.stroke();
  ctx.fillStyle = '#ffe14a';
  ctx.beginPath();
  ctx.arc(24, 12, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

/** 套在方块外面的护罩。中间留空，让白方块露出来。 */
function drawArmorShield(ctx) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(36, 36, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#7af0ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(36, 36, 23, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffe14a';
  ctx.beginPath();
  ctx.arc(22, 20, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

/** 飞机：一块几何机翼，飞行时另外有更大的翅膀贴图。 */
function drawPowerPlane(ctx) {
  drawBadge(ctx, '#3ec6ff', '#0277b8');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(8, 21);
  ctx.lineTo(27, 16);
  ctx.lineTo(27, 25);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe14a';
  ctx.fillRect(15, 12, 5, 14);
  ctx.fillStyle = '#3ec6ff';
  ctx.fillRect(22, 18, 4, 4);
}

/** 挂在方块两侧的翅膀。中间留给玩家方块，所以中间留空。 */
function drawRideWings(ctx) {
  ctx.fillStyle = '#ffe14a';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(2, 18);
  ctx.lineTo(28, 6);
  ctx.lineTo(28, 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(82, 18);
  ctx.lineTo(56, 6);
  ctx.lineTo(56, 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3ec6ff';
  ctx.fillRect(30, 12, 24, 12);
  ctx.strokeRect(30, 12, 24, 12);
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
  make('icon-pause', 64, 64, drawPause);
  make('icon-settings', 64, 64, drawSettings);
  make('icon-sound', 64, 64, (ctx) => drawSpeaker(ctx, false));
  make('icon-mute', 64, 64, (ctx) => drawSpeaker(ctx, true));
  make('icon-fullscreen', 64, 64, (ctx) => drawFullscreen(ctx, false));
  make('icon-fullscreen-exit', 64, 64, (ctx) => drawFullscreen(ctx, true));
  make('power-double', 36, 36, drawPowerDouble);
  make('power-armor', 36, 36, drawPowerArmor);
  make('armor-shield', 72, 72, drawArmorShield);
  make('power-plane', 36, 36, drawPowerPlane);
  make('ride-wings', 84, 36, drawRideWings);
}
