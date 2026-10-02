/**
 * 跑道上的道具精灵。贴图和碰撞盒同一套尺寸，避免缩放之后判定和画面错开。
 */
import { POWERUP_HITBOX, powerupCenterY } from '../logic/powerups.js';
import { textStyle } from './candy.js';
import { t } from '../i18n/index.js';

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
  // 道具头顶的短提示。吃掉或路段拆掉时一起丢掉。
  const label = scene.add.text(item.x, y - 30, t(`power.${item.type}`), textStyle({
    size: 18,
    color: '#ffffff',
    stroke: '#3b0764',
    strokeThickness: 4,
  })).setOrigin(0.5, 1).setDepth(7);
  sprite.setData('label', label);
  return sprite;
}

/** 道具和它的提示一起拆掉。已经拆过的对象再进来也安全。 */
export function destroyPowerupLabel(sprite) {
  const label = sprite?.getData?.('label');
  if (label?.scene) label.destroy();
  sprite?.setData?.('label', null);
}
