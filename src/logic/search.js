/**
 * 证明关卡存在一条不死亡的路径，并且沿途能捡完全部星星。
 * 落地（地面、天花板或上层平台）时才选择跳或不跳。水平坐标只增不减，
 * 用「位置 + 已捡星星 + 所在表面」去重。
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
  playerCenterOnSurface,
  playerGroundY,
  rectsOverlap,
  speedAtX,
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

/** 当前表面再跳一次，够不够得着这块平台。地面起跳大约 155 像素。 */
function canStepOnto(fromH, deckH) {
  const rise = deckH - fromH;
  return rise > 8 && rise <= 148;
}

/**
 * 从起点搜索到终点。
 * 成功时 ok 为 true。needStars 为真时星星必须捡满。
 * mustTouch 要求路径曾经站上这块平台；avoidDecks 里的平台当成不存在。
 */
export function findClearPath(level, tuning = TUNING, options = {}) {
  // 一帧的步长跟着所在分段的速度走。闯关只有一个速度，算出来和原来相同。
  const stepAt = (x) => speedAtX(x, level, tuning) * STEP;
  const groundY = playerGroundY(tuning);
  const ceilingY = playerCeilingY();
  const finishX = level.finishX;
  const needStars = options.needStars !== false;
  const mustTouch = options.mustTouch || null;
  const avoidDecks = options.avoidDecks ? new Set(options.avoidDecks) : null;
  const kinOptions = avoidDecks ? { avoidDecks } : undefined;
  const full = (1 << level.stars.length) - 1;
  const flips = level.flips || [];
  const decks = (level.decks || []).filter((deck) => !avoidDecks || !avoidDecks.has(deck.id));
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));

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

  const horizonAt = (x) => speedAtX(x, level, tuning) * 0.95;

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
    if (!needStars || !stars.length || mask === full) return mask;
    const prect = playerRect(px, py);
    let next = mask;
    for (let i = 0; i < stars.length; i += 1) {
      if (next & (1 << i)) continue;
      if (rectsOverlap(prect, stars[i].rect)) next |= 1 << i;
    }
    return next;
  }

  function heightOf(surface) {
    if (surface === 'floor' || surface === 'ceiling') return 0;
    return deckById.get(surface)?.h || 0;
  }

  /** 前方一个跳跃距离内还有要处理的东西，才值得逐帧分叉。 */
  function interesting(x, mask, surface) {
    const far = x + horizonAt(x);
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
    const fromH = heightOf(surface);
    for (let i = 0; i < decks.length; i += 1) {
      const deck = decks[i];
      if (surface === deck.id) {
        if (deck.x1 > back && deck.x1 <= far + 30) return true;
        continue;
      }
      if (!canStepOnto(fromH, deck.h)) continue;
      if (deck.x0 > back && deck.x0 <= far + 80) return true;
    }
    if (needStars) {
      for (let i = 0; i < stars.length; i += 1) {
        if (mask & (1 << i)) continue;
        if (stars[i].lift <= 0) continue;
        if (surface !== 'floor') continue;
        if (stars[i].x >= back && stars[i].x <= far) return true;
      }
    }
    return false;
  }

  /** 从当前速度积分到下一次落地。撞上障碍返回 null。 */
  function integrate(x, y, vy, mask, touch) {
    let cx = x;
    let cy = y;
    let cvy = vy;
    let nextMask = mask;
    let nextTouch = touch;
    for (let i = 0; i < 240; i += 1) {
      const stepState = stepKinematics(cx, cy, cvy, level, tuning, kinOptions);
      if (hitsAt(stepState.x, stepState.y)) return null;
      nextMask = pickup(stepState.x, stepState.y, nextMask);
      cx = stepState.x;
      cy = stepState.y;
      cvy = stepState.vy;
      if (stepState.landed) {
        if (stepState.landed === mustTouch) nextTouch = true;
        return { x: cx, y: cy, surface: stepState.landed, mask: nextMask, touch: nextTouch };
      }
    }
    return null;
  }

  function yOf(surface) {
    if (surface === 'ceiling') return ceilingY;
    if (surface === 'floor') return groundY;
    const deck = deckById.get(surface);
    return deck ? playerCenterOnSurface(deck.top) : groundY;
  }

  /** 空旷路段一次跑完，避免每一帧都分叉。遇到反转区或平台边界会停下来。 */
  function runStretch(x, mask, surface, touch) {
    let cx = x;
    let nextMask = mask;
    const y = yOf(surface);
    const deck = deckById.get(surface);
    while (cx < finishX) {
      if (interesting(cx, nextMask, surface)) break;
      const nx = cx + stepAt(cx);
      if (deck && nx > deck.x1 - 8) break;
      if (surface === 'floor' && gravitySignAt(nx, level) < 0) break;
      if (surface === 'ceiling' && gravitySignAt(nx, level) > 0) break;
      if (hitsAt(nx, y)) return null;
      nextMask = pickup(nx, y, nextMask);
      cx = nx;
    }
    return { x: cx, mask: nextMask, surface, y, touch };
  }

  const seen = new Set();
  const stack = [{
    x: level.startX,
    mask: pickup(level.startX, groundY, 0),
    surface: 'floor',
    touch: false,
  }];
  let bestMask = 0;
  let bestX = level.startX;

  const note = (x, mask) => {
    if (!needStars) {
      if (x > bestX) bestX = x;
      return;
    }
    if (popcount(mask) > popcount(bestMask) || (mask === bestMask && x > bestX)) {
      bestMask = mask;
      bestX = x;
    }
  };

  while (stack.length) {
    const state = stack.pop();
    const maskKey = needStars ? state.mask : 0;
    const touchKey = mustTouch ? (state.touch ? 1 : 0) : 0;
    const key = `${Math.round(state.x)}:${maskKey}:${state.surface}:${touchKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    note(state.x, state.mask);

    const starsOk = !needStars || state.mask === full;
    const touchOk = !mustTouch || state.touch;
    if (state.x >= finishX && starsOk && touchOk && state.surface === 'floor') {
      return {
        ok: true,
        stars: needStars ? level.stars.length : popcount(state.mask),
        totalStars: level.stars.length,
        bestX: state.x,
        missed: [],
        seen: seen.size,
      };
    }
    if (state.x >= finishX) continue;
    if (seen.size > 250000) break;

    const y = yOf(state.surface);
    const deck = deckById.get(state.surface);
    // 平台走到头就落下。起点挪到台面外面，避免同一帧又被接住。
    if (deck && state.x >= deck.x1 - 8) {
      const fallen = integrate(deck.x1 + 22, y, 0, state.mask, state.touch);
      if (fallen) stack.push(fallen);
      continue;
    }
    // 跑进反转区会浮到天花板，跑出反转区会落回地面。这两段没有选择。
    if (state.surface === 'floor' && gravitySignAt(state.x + stepAt(state.x), level) < 0) {
      const risen = integrate(state.x, y, 0, state.mask, state.touch);
      if (risen) stack.push(risen);
      continue;
    }
    if (state.surface === 'ceiling' && gravitySignAt(state.x + stepAt(state.x), level) > 0) {
      const fallen = integrate(state.x, y, 0, state.mask, state.touch);
      if (fallen) stack.push(fallen);
      continue;
    }

    if (!interesting(state.x, state.mask, state.surface)) {
      const stretch = runStretch(state.x, state.mask, state.surface, state.touch);
      if (stretch && (stretch.x > state.x + 0.5 || stretch.mask !== state.mask)) {
        stack.push(stretch);
      }
      continue;
    }

    // 天花板上起跳是向下砸，地面和平台上起跳是向上。幅度都用原来的起跳速度。
    const jumpVy = state.surface === 'ceiling' ? -tuning.jumpVelocity : tuning.jumpVelocity;
    const jumped = integrate(state.x, y, jumpVy, state.mask, state.touch);
    if (jumped) stack.push(jumped);

    const nx = state.x + stepAt(state.x);
    if (deck && nx > deck.x1 - 4) continue;
    if (!hitsAt(nx, y)) {
      stack.push({
        x: nx,
        mask: pickup(nx, y, state.mask),
        surface: state.surface,
        touch: state.touch || state.surface === mustTouch,
      });
    }
  }

  const missed = [];
  if (needStars) {
    for (let i = 0; i < stars.length; i += 1) {
      if ((bestMask & (1 << i)) === 0) missed.push(stars[i].id);
    }
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

/**
 * 每一条上层路和只走地面的路都能到达终点。
 * 有第三层时，只走第二层、不踏第三层，也不能是死路。
 */
export function proveRoutes(level, tuning = TUNING) {
  const decks = level.decks || [];
  const routes = level.routes || [];
  const ground = findClearPath(level, tuning, {
    needStars: false,
    avoidDecks: decks.map((deck) => deck.id),
  });
  const ups = [];
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    const result = findClearPath(level, tuning, {
      needStars: false,
      mustTouch: route.deckId,
    });
    ups.push({
      id: route.id,
      layer: route.layer,
      ok: result.ok,
      bestX: result.bestX,
    });
  }
  const mids = [];
  for (let i = 0; i < routes.length; i += 1) {
    const high = routes[i];
    if (high.layer < 3) continue;
    const lower = routes.find((item) => item.fork === high.fork && item.layer === 2);
    if (!lower) continue;
    const result = findClearPath(level, tuning, {
      needStars: false,
      mustTouch: lower.deckId,
      avoidDecks: [high.deckId],
    });
    mids.push({ id: lower.id, ok: result.ok, bestX: result.bestX });
  }
  return {
    ground: ground.ok,
    ups,
    mids,
    ok: ground.ok && ups.every((item) => item.ok) && mids.every((item) => item.ok),
  };
}
