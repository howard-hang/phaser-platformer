/**
 * 证明关卡存在一条不死亡的路径，并且沿途能捡完全部星星。
 * 落地（地面或天花板）时才选择跳或不跳。水平坐标只增不减，用「位置 + 已捡星星 + 所在表面」去重。
 * 积分和碰撞盒与游戏相同。周期门和坠落平台按到达该 x 的时间取值，不额外增加状态。
 */
import { stepKinematics, STEP } from './kinematics.js';
import {
  HITBOX,
  TUNING,
  bodyRectFromSprite,
  courseTime,
  gravitySignAt,
  obstacleRect,
  playerCeilingY,
  playerGroundY,
  rectsOverlap,
  starRect,
} from './world.js';

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
  const ceilingY = playerCeilingY();
  const finishX = level.finishX;
  const full = (1 << level.stars.length) - 1;
  const flips = level.flips || [];

  const indexed = [];
  const wide = [];
  for (const obstacle of level.obstacles) {
    if (obstacle.type === 'flip') continue;
    if (obstacle.type === 'crumble') {
      wide.push(obstacle);
      continue;
    }
    const rect = obstacle.type === 'gate'
      ? null
      : obstacleRect(obstacle, tuning, 0);
    indexed.push({
      x: obstacle.x,
      rect,
      id: obstacle.id,
      dynamic: obstacle.type === 'gate',
      obstacle,
    });
  }
  indexed.sort((a, b) => a.x - b.x);

  const stars = level.stars.map((star) => ({
    id: star.id,
    x: star.x,
    lift: star.lift || 0,
    rect: starRect(star, tuning),
  }));

  const horizon = speed * 0.95;

  function timeAt(x) {
    return courseTime(x, level, tuning);
  }

  function firstObstacleIndex(minX) {
    let lo = 0;
    let hi = indexed.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (indexed[mid].x < minX) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function hitsAt(px, py) {
    const prect = playerRect(px, py);
    const time = timeAt(px);
    const minX = px - 100;
    const maxX = px + 100;
    for (let i = firstObstacleIndex(minX); i < indexed.length; i += 1) {
      const item = indexed[i];
      if (item.x > maxX) break;
      const rect = item.dynamic ? obstacleRect(item.obstacle, tuning, time) : item.rect;
      if (rect && rectsOverlap(prect, rect)) return item.id;
    }
    for (let i = 0; i < wide.length; i += 1) {
      const rect = obstacleRect(wide[i], tuning, time);
      if (rect && rectsOverlap(prect, rect)) return wide[i].id;
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

  /** 前方一个跳跃距离内还有要处理的东西，才值得逐帧分叉。 */
  function interesting(x, mask, surface) {
    const far = x + horizon;
    const back = x - 48;
    for (let i = firstObstacleIndex(back); i < indexed.length; i += 1) {
      const item = indexed[i];
      if (item.x > far + 80) break;
      return true;
    }
    for (let i = 0; i < wide.length; i += 1) {
      const zone = wide[i];
      if (zone.x1 >= back && zone.x0 <= far) return true;
    }
    for (let i = 0; i < flips.length; i += 1) {
      const zone = flips[i];
      if (surface === 'floor' && zone.x0 > back && zone.x0 <= far) return true;
      if (surface === 'ceiling' && zone.x1 > back && zone.x1 <= far) return true;
    }
    for (let i = 0; i < stars.length; i += 1) {
      if (mask & (1 << i)) continue;
      if (stars[i].lift <= 0) continue;
      if (surface !== 'floor') continue;
      if (stars[i].x >= back && stars[i].x <= far) return true;
    }
    return false;
  }

  /** 从当前速度积分到下一次落地。撞上障碍返回 null。 */
  function integrate(x, y, vy, mask) {
    let cx = x;
    let cy = y;
    let cvy = vy;
    let nextMask = mask;
    for (let i = 0; i < 240; i += 1) {
      const stepState = stepKinematics(cx, cy, cvy, level, tuning);
      if (hitsAt(stepState.x, stepState.y)) return null;
      nextMask = pickup(stepState.x, stepState.y, nextMask);
      cx = stepState.x;
      cy = stepState.y;
      cvy = stepState.vy;
      if (stepState.landed) {
        return { x: cx, y: cy, surface: stepState.landed, mask: nextMask };
      }
    }
    return null;
  }

  function yOf(surface) {
    return surface === 'ceiling' ? ceilingY : groundY;
  }

  /** 空旷路段一次跑完，避免每一帧都分叉。遇到反转区边界会停下来。 */
  function runStretch(x, mask, surface) {
    let cx = x;
    let nextMask = mask;
    const y = yOf(surface);
    while (cx < finishX) {
      if (interesting(cx, nextMask, surface)) break;
      const nx = cx + step;
      if (surface === 'floor' && gravitySignAt(nx, level) < 0) break;
      if (surface === 'ceiling' && gravitySignAt(nx, level) > 0) break;
      if (hitsAt(nx, y)) return null;
      nextMask = pickup(nx, y, nextMask);
      cx = nx;
    }
    return { x: cx, mask: nextMask, surface, y };
  }

  const seen = new Set();
  const stack = [{
    x: level.startX,
    mask: pickup(level.startX, groundY, 0),
    surface: 'floor',
  }];
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
    const key = `${Math.round(state.x)}:${state.mask}:${state.surface}`;
    if (seen.has(key)) continue;
    seen.add(key);
    note(state.x, state.mask);

    if (state.x >= finishX && state.mask === full && state.surface === 'floor') {
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

    const y = yOf(state.surface);
    // 跑进反转区会浮到天花板，跑出反转区会落回地面。这两段没有选择。
    if (state.surface === 'floor' && gravitySignAt(state.x + step, level) < 0) {
      const risen = integrate(state.x, y, 0, state.mask);
      if (risen) stack.push(risen);
      continue;
    }
    if (state.surface === 'ceiling' && gravitySignAt(state.x + step, level) > 0) {
      const fallen = integrate(state.x, y, 0, state.mask);
      if (fallen) stack.push(fallen);
      continue;
    }

    if (!interesting(state.x, state.mask, state.surface)) {
      const stretch = runStretch(state.x, state.mask, state.surface);
      if (stretch && (stretch.x > state.x + 0.5 || stretch.mask !== state.mask)) {
        stack.push(stretch);
      }
      continue;
    }

    // 天花板上起跳是向下砸，地面上起跳是向上。幅度都用原来的起跳速度。
    const jumpVy = state.surface === 'ceiling' ? -tuning.jumpVelocity : tuning.jumpVelocity;
    const jumped = integrate(state.x, y, jumpVy, state.mask);
    if (jumped) stack.push(jumped);

    const nx = state.x + step;
    if (!hitsAt(nx, y)) {
      stack.push({
        x: nx,
        mask: pickup(nx, y, state.mask),
        surface: state.surface,
      });
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
