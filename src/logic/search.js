/**
 * 证明关卡存在一条不死亡的路径，并且沿途能捡完全部星星。
 * 落地时才选择跳或不跳。水平坐标只增不减，用「位置 + 已捡星星」去重。
 * 积分和碰撞盒与游戏、simulate.js 相同。
 */
import {
  HITBOX,
  TUNING,
  bodyRectFromSprite,
  obstacleRect,
  playerGroundY,
  rectsOverlap,
  starRect,
} from './world.js';

const STEP = 1 / 60;

function popcount(mask) {
  let count = 0;
  let bits = mask;
  while (bits) {
    count += bits & 1;
    bits >>= 1;
  }
  return count;
}

function playerRect(px, py) {
  return bodyRectFromSprite(px, py, HITBOX.player);
}

/**
 * 从起点搜索到终点。
 * 成功时 ok 为 true，且 stars 等于关卡里的星星数。
 */
export function findClearPath(level, tuning = TUNING) {
  const speed = tuning.speed;
  const step = speed * STEP;
  const groundY = playerGroundY(tuning);
  const finishX = level.finishX;
  const full = (1 << level.stars.length) - 1;

  const obstacles = level.obstacles.map((obstacle) => ({
    x: obstacle.x,
    rect: obstacleRect(obstacle, tuning),
    id: obstacle.id,
  }));
  obstacles.sort((a, b) => a.x - b.x);
  const stars = level.stars.map((star) => ({
    id: star.id,
    x: star.x,
    lift: star.lift || 0,
    rect: starRect(star, tuning),
  }));

  const horizon = speed * 0.95;

  function firstObstacleIndex(minX) {
    let lo = 0;
    let hi = obstacles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (obstacles[mid].x < minX) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function hitsAt(px, py) {
    const prect = playerRect(px, py);
    const minX = px - 80;
    const maxX = px + 80;
    for (let i = firstObstacleIndex(minX); i < obstacles.length; i += 1) {
      const item = obstacles[i];
      if (item.x > maxX) break;
      if (rectsOverlap(prect, item.rect)) return item.id;
    }
    return null;
  }

  function pickup(px, py, mask) {
    if (!stars.length || mask === full) return mask;
    const prect = playerRect(px, py);
    let next = mask;
    for (let i = 0; i < stars.length; i += 1) {
      if (next & (1 << i)) continue;
      if (rectsOverlap(prect, stars[i].rect)) next |= 1 << i;
    }
    return next;
  }

  /** 前方一个跳跃距离内还有障碍，或还有没捡的空中星星，才值得考虑起跳。 */
  function interesting(x, mask) {
    const far = x + horizon;
    const back = x - 36;
    for (let i = firstObstacleIndex(back); i < obstacles.length; i += 1) {
      const item = obstacles[i];
      if (item.x > far + 80) break;
      return true;
    }
    for (let i = 0; i < stars.length; i += 1) {
      if (mask & (1 << i)) continue;
      if (stars[i].lift <= 0) continue;
      if (stars[i].x >= back && stars[i].x <= far) return true;
    }
    return false;
  }

  function jumpFrom(x, mask) {
    let cx = x;
    let cy = groundY;
    let vy = tuning.jumpVelocity;
    let nextMask = mask;
    for (let i = 0; i < 180; i += 1) {
      const nextVy = vy + tuning.gravity * STEP;
      let nextX = cx + step;
      let nextY = cy + nextVy * STEP;
      const rect = playerRect(nextX, nextY);
      let landed = false;
      if (rect.y + rect.h >= tuning.groundY && nextVy >= 0) {
        nextY = groundY;
        landed = true;
      }
      if (hitsAt(nextX, nextY)) return null;
      nextMask = pickup(nextX, nextY, nextMask);
      cx = nextX;
      cy = nextY;
      vy = landed ? 0 : nextVy;
      if (landed) return { x: cx, mask: nextMask };
    }
    return null;
  }

  /** 空旷路段一次跑完，避免每一帧都分叉。 */
  function runStretch(x, mask) {
    let cx = x;
    let nextMask = mask;
    while (cx < finishX) {
      if (interesting(cx, nextMask)) break;
      const nx = cx + step;
      if (hitsAt(nx, groundY)) return null;
      nextMask = pickup(nx, groundY, nextMask);
      cx = nx;
    }
    return { x: cx, mask: nextMask };
  }

  const seen = new Set();
  const stack = [{ x: level.startX, mask: pickup(level.startX, groundY, 0) }];
  let bestMask = 0;
  let bestX = level.startX;

  const note = (x, mask) => {
    if (popcount(mask) > popcount(bestMask) || (mask === bestMask && x > bestX)) {
      bestMask = mask;
      bestX = x;
    }
  };

  while (stack.length) {
    const state = stack.pop();
    const key = `${Math.round(state.x)}:${state.mask}`;
    if (seen.has(key)) continue;
    seen.add(key);
    note(state.x, state.mask);

    if (state.x >= finishX && state.mask === full) {
      return {
        ok: true,
        stars: level.stars.length,
        totalStars: level.stars.length,
        bestX: state.x,
        missed: [],
        seen: seen.size,
      };
    }
    if (state.x >= finishX) continue;
    if (seen.size > 250000) break;

    if (!interesting(state.x, state.mask)) {
      const stretch = runStretch(state.x, state.mask);
      if (stretch && (stretch.x > state.x + 0.5 || stretch.mask !== state.mask)) {
        stack.push(stretch);
      }
      continue;
    }

    // 先压入跳跃，后压入跑步。栈顶先跑，实在过不去再回头试更早的起跳。
    const jumped = jumpFrom(state.x, state.mask);
    if (jumped) stack.push(jumped);

    const nx = state.x + step;
    if (!hitsAt(nx, groundY)) {
      stack.push({ x: nx, mask: pickup(nx, groundY, state.mask) });
    }
  }

  const missed = [];
  for (let i = 0; i < stars.length; i += 1) {
    if ((bestMask & (1 << i)) === 0) missed.push(stars[i].id);
  }
  return {
    ok: false,
    reason: 'no-path',
    stars: popcount(bestMask),
    totalStars: level.stars.length,
    bestX,
    missed,
    seen: seen.size,
  };
}
