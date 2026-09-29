/**
 * 紫色格子背景。
 * 以前把整关大约 300 个圆角矩形都塞进一个 Graphics，WebGL 每帧都会把整张命令重算一遍。
 * 现在按格子对齐烘成几张静态贴图，滚动时只画镜头里的那一两张。
 */
import { THEME } from './theme.js';

const PANELS = [0xd946ef, 0xe879f9, 0xc084fc, 0xb026c9, 0xf0abfc, 0xbc3adf];

const CELL_W = 320;
const CELL_H = 180;
const INSET = 14;
// 8 格宽，贴图边缘刚好落在格子缝上，不会把一块矩形切成两半。
const CHUNK_COLS = 8;

function hash(col, row) {
  const n = Math.abs((col * 73856093) ^ (row * 19349663));
  return n >>> 0;
}

/** 把一列格子画进 Graphics。坐标相对这一块贴图的左上角。 */
function paintChunk(graphics, colStart, colEnd, rows) {
  for (let row = 0; row < rows; row += 1) {
    for (let col = colStart; col < colEnd; col += 1) {
      const x = (col - colStart) * CELL_W + INSET;
      const y = row * CELL_H + INSET;
      const w = CELL_W - INSET * 2;
      const h = CELL_H - INSET * 2;
      const color = PANELS[hash(col, row) % PANELS.length];
      graphics.fillStyle(color, 1);
      graphics.fillRoundedRect(x, y, w, h, 8);
      graphics.lineStyle(4, 0x8614a8, 0.35);
      graphics.strokeRoundedRect(x, y, w, h, 8);
      if (hash(col, row) % 3 === 0) {
        graphics.fillStyle(0xffffff, 0.07);
        graphics.fillRoundedRect(x + 16, y + 16, w * 0.5, h * 0.42, 6);
      }
    }
  }
}

export function drawBackdrop(scene, worldWidth, worldHeight) {
  const cols = Math.ceil(worldWidth / CELL_W) + 1;
  const rows = Math.ceil(worldHeight / CELL_H) + 1;
  const texH = rows * CELL_H;
  const images = [];

  for (let colStart = 0, chunk = 0; colStart < cols; colStart += CHUNK_COLS, chunk += 1) {
    const colEnd = Math.min(cols, colStart + CHUNK_COLS);
    const texW = (colEnd - colStart) * CELL_W;
    const key = `backdrop-${scene.scene.key}-${worldWidth}x${worldHeight}-${chunk}`;

    if (!scene.textures.exists(key)) {
      const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
      // 格子之间的缝和摄像机清屏色相同，烘进贴图后就不必每帧再靠透明混合。
      graphics.fillStyle(THEME.gap, 1);
      graphics.fillRect(0, 0, texW, texH);
      paintChunk(graphics, colStart, colEnd, rows);
      graphics.generateTexture(key, texW, texH);
      graphics.destroy();
    }

    const image = scene.add.image(colStart * CELL_W, 0, key).setOrigin(0, 0).setDepth(0);
    images.push(image);
  }

  return images;
}
