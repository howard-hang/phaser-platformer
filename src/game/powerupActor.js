/**
 * 跑道上的道具精灵。贴图和碰撞盒同一套尺寸，避免缩放之后判定和画面错开。
 */
import { POWERUP_HITBOX, powerupCenterY } from '../logic/powerups.js';

function applyHitbox(sprite, spec) {
  sprite.body.setSize(spec.bodyW, spec.bodyH, false);
  sprite.body.setOffset(spec.offsetX, spec.offsetY);
}

/** 放一个会上下轻轻浮动的道具。baseY 留给浮动时还原。 */
export function spawnPowerupSprite(scene, item) {
  const spec = POWERUP_HITBOX;
  const y = powerupCenterY(item);
  const sprite = scene.physics.add.staticSprite(item.x, y, `power-${item.type}`);
  applyHitbox(sprite, spec);
  sprite.setDepth(6);
  sprite.setData('id', item.id);
  sprite.setData('type', item.type);
  sprite.setData('baseY', y);
  return sprite;
}
