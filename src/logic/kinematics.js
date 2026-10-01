/**
 * 和 Arcade 半隐式欧拉一致的一步积分。
 * 反转区里重力取反，落点从地面换成天花板。
 * 上层平台是单向的：往下掉时脚底穿过顶面就站上去，往上跳会穿过去。
 * 搜索和试跑共用这一份，避免和碰撞盒各写各的。
 */
import {
  FLIP_CEILING_Y,
  HITBOX,
  TUNING,
  bodyRectFromSprite,
  courseTime,
  gravitySignAt,
  playerCeilingY,
  playerCenterOnSurface,
  playerFeetY,
  playerGroundY,
} from './world.js';

export const STEP = 1 / 60;

/**
 * 下落时接到更高的那一层平台。
 * 脚底还在顶面之下的不算，避免从下面被吸上去。
 */
function catchDeck(prevY, nextX, nextY, nextVy, level, tuning, options) {
  const decks = level?.decks;
  if (!decks || nextVy < 0) return null;
  const prevBottom = playerFeetY(prevY);
  const nextBottom = playerFeetY(nextY);
  const rect = bodyRectFromSprite(nextX, nextY, HITBOX.player);
  const time = courseTime(nextX, level, tuning);
  const skip = options?.avoidDecks;
  let best = null;
  for (let i = 0; i < decks.length; i += 1) {
    const deck = decks[i];
    if (skip && skip.has(deck.id)) continue;
    if (deck.collapse != null && time >= deck.collapse) continue;
    if (rect.x + rect.w < deck.x0 || rect.x > deck.x1) continue;
    // 上一帧脚还在顶面之上（或刚好贴着），这一帧已经落到顶面或穿过去。
    if (prevBottom > deck.top + 2.5) continue;
    if (nextBottom < deck.top - 0.5) continue;
    if (!best || deck.top < best.top) best = deck;
  }
  return best;
}

/**
 * 走一步。
 * landed 为 floor、ceiling、平台 id，或 null。人还在空中时是 null。
 * options.avoidDecks 是搜索用的：这些平台不承接，用来证明不走上层也能到终点。
 */
export function stepKinematics(x, y, vy, level, tuning = TUNING, options) {
  const sign = gravitySignAt(x, level);
  const nextVy = vy + tuning.gravity * sign * STEP;
  const nextX = x + tuning.speed * STEP;
  let nextY = y + nextVy * STEP;
  const nextSign = gravitySignAt(nextX, level);
  const rect = bodyRectFromSprite(nextX, nextY, HITBOX.player);
  let landed = null;
  let vyOut = nextVy;
  // 正重力且往下掉。先看上层平台，再贴回地面。
  if (nextSign > 0) {
    const deck = catchDeck(y, nextX, nextY, nextVy, level, tuning, options);
    if (deck) {
      nextY = playerCenterOnSurface(deck.top);
      vyOut = 0;
      landed = deck.id;
    } else if (rect.y + rect.h >= tuning.groundY && nextVy >= 0) {
      nextY = playerGroundY(tuning);
      vyOut = 0;
      landed = 'floor';
    }
  } else if (nextSign < 0 && rect.y <= FLIP_CEILING_Y && nextVy <= 0) {
    // 反重力且往上飘，头顶贴回天花板。
    nextY = playerCeilingY();
    vyOut = 0;
    landed = 'ceiling';
  }
  return { x: nextX, y: nextY, vy: vyOut, landed };
}
