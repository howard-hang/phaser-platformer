/**
 * 和 Arcade 半隐式欧拉一致的一步积分。
 * 反转区里重力取反，落点从地面换成天花板。
 * 搜索和试跑共用这一份，避免和碰撞盒各写各的。
 */
import {
  FLIP_CEILING_Y,
  HITBOX,
  TUNING,
  bodyRectFromSprite,
  gravitySignAt,
  playerCeilingY,
  playerGroundY,
} from './world.js';

export const STEP = 1 / 60;

/**
 * 走一步。
 * landed 为 floor、ceiling 或 null。人还在空中时是 null。
 */
export function stepKinematics(x, y, vy, level, tuning = TUNING) {
  const sign = gravitySignAt(x, level);
  const nextVy = vy + tuning.gravity * sign * STEP;
  const nextX = x + tuning.speed * STEP;
  let nextY = y + nextVy * STEP;
  const nextSign = gravitySignAt(nextX, level);
  const rect = bodyRectFromSprite(nextX, nextY, HITBOX.player);
  let landed = null;
  let vyOut = nextVy;
  // 正重力且往下掉，脚底贴回地面。
  if (nextSign > 0 && rect.y + rect.h >= tuning.groundY && nextVy >= 0) {
    nextY = playerGroundY(tuning);
    vyOut = 0;
    landed = 'floor';
  } else if (nextSign < 0 && rect.y <= FLIP_CEILING_Y && nextVy <= 0) {
    // 反重力且往上飘，头顶贴回天花板。
    nextY = playerCeilingY();
    vyOut = 0;
    landed = 'ceiling';
  }
  return { x: nextX, y: nextY, vy: vyOut, landed };
}
