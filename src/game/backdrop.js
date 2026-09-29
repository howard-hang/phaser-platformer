/**
 * 紫色格子背景，按世界坐标画一次，摄像机滚动时跟着走。
 * 颜色和分块参考附图：大块矩形、留缝、紫红色。
 */
const PANELS = [0xd946ef, 0xe879f9, 0xc084fc, 0xb026c9, 0xf0abfc, 0xbc3adf];

function hash(col, row) {
  const n = Math.abs((col * 73856093) ^ (row * 19349663));
  return n >>> 0;
}

export function drawBackdrop(scene, worldWidth, worldHeight) {
  const graphics = scene.add.graphics().setDepth(0);
  const cellW = 320;
  const cellH = 180;
  const inset = 14;
  const cols = Math.ceil(worldWidth / cellW) + 1;
  const rows = Math.ceil(worldHeight / cellH) + 1;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellW + inset;
      const y = row * cellH + inset;
      const w = cellW - inset * 2;
      const h = cellH - inset * 2;
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
  return graphics;
}
