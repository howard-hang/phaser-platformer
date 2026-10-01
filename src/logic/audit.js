/**
 * 关卡数据体检：时长、存档点是否安全、星星有没有埋在障碍里。
 * 能不能通关由 findClearPath 另行验证。
 */
import {
  HITBOX,
  TUNING,
  bodyRectFromSprite,
  courseTime,
  obstacleRect,
  playerCeilingY,
  playerGroundY,
  rectsOverlap,
  starRect,
} from './world.js';

/** 站在某个 x 上会不会和障碍重叠。time 用来判断这时门关没关、平台塌没塌。 */
function standingHits(x, obstacles, tuning, time) {
  const y = playerGroundY(tuning);
  const prect = bodyRectFromSprite(x, y, HITBOX.player);
  return obstacles.some((obstacle) => {
    const rect = obstacleRect(obstacle, tuning, time);
    return rect ? rectsOverlap(prect, rect) : false;
  });
}

/** 体检时把机关当成「会伤人的那一态」，避免星星埋在坑里或关着的门里。 */
function solidRect(obstacle, tuning) {
  if (obstacle.type === 'flip') return null;
  if (obstacle.type === 'gate' || obstacle.type === 'crumble') {
    return obstacleRect(obstacle, tuning, 0, { forceClosed: true });
  }
  return obstacleRect(obstacle, tuning, 0);
}

/** 返回问题描述数组，空数组表示关卡结构合格。 */
export function auditLevel(level, tuning = TUNING) {
  const problems = [];
  const duration = (level.finishX - level.startX) / tuning.speed;
  if (duration < 40 || duration > 90) {
    problems.push(`关卡时长 ${duration.toFixed(2)} 秒，不在 40 到 90 秒之间`);
  }
  if (!level.stars || level.stars.length !== 3) {
    problems.push(`星星应该正好 3 颗，现在是 ${level.stars?.length ?? 0}`);
  }

  const ids = new Set();
  for (const obstacle of level.obstacles) {
    if (ids.has(obstacle.id)) problems.push(`障碍 id 重复: ${obstacle.id}`);
    ids.add(obstacle.id);
    if (obstacle.type === 'cspike') {
      const inside = (level.flips || []).some((zone) => obstacle.x >= zone.x0 && obstacle.x <= zone.x1);
      if (!inside) problems.push(`天花板尖刺 ${obstacle.id} 不在重力反转区里`);
    }
  }
  for (const star of level.stars || []) {
    if (ids.has(star.id)) problems.push(`星星 id 重复: ${star.id}`);
    ids.add(star.id);
  }

  const flips = level.flips || [];
  for (let i = 0; i < flips.length; i += 1) {
    for (let j = i + 1; j < flips.length; j += 1) {
      const a = flips[i];
      const b = flips[j];
      if (a.x0 < b.x1 && b.x0 < a.x1) problems.push('重力反转区互相重叠');
    }
  }

  let prev = -Infinity;
  for (const point of level.checkpoints) {
    if (point < prev) problems.push('存档点没有从小到大排列');
    prev = point;
    if (point < level.startX || point >= level.finishX) {
      problems.push(`存档点 ${point} 不在跑道内`);
    }
    const time = courseTime(point, level, tuning);
    // 重生点左右留出半个身位，避免刚复活就卡在尖刺里。
    for (const x of [point - 8, point, point + 24]) {
      if (standingHits(x, level.obstacles, tuning, time)) {
        problems.push(`存档点 ${point} 附近站立会碰到障碍`);
        break;
      }
    }
    for (const zone of flips) {
      if (point > zone.x0 - 30 && point < zone.x1 + 30) {
        problems.push(`存档点 ${point} 离重力反转区太近`);
        break;
      }
    }
    for (const obstacle of level.obstacles) {
      if (obstacle.type !== 'crumble') continue;
      if (point > obstacle.x0 - 36 && point < obstacle.x1 + 36) {
        problems.push(`存档点 ${point} 落在坠落平台上`);
        break;
      }
    }
  }
  if (level.checkpoints[0] !== level.startX) {
    problems.push('第一个存档点应该就是起点');
  }

  let firstX = Infinity;
  let lastX = -Infinity;
  for (const obstacle of level.obstacles) {
    if (obstacle.type === 'flip') {
      firstX = Math.min(firstX, obstacle.x0);
      lastX = Math.max(lastX, obstacle.x1);
      continue;
    }
    if (obstacle.type === 'crumble') {
      firstX = Math.min(firstX, obstacle.x0);
      lastX = Math.max(lastX, obstacle.x1);
      continue;
    }
    const rect = solidRect(obstacle, tuning);
    if (!rect) continue;
    firstX = Math.min(firstX, rect.x);
    lastX = Math.max(lastX, rect.x + rect.w);
    if (obstacle.type === 'overhead') {
      const playerTop = bodyRectFromSprite(0, playerGroundY(tuning), HITBOX.player).y;
      if (rect.y + rect.h > playerTop) {
        problems.push(`头顶障碍 ${obstacle.id} 太低，站立就会撞上`);
      }
    }
    if (obstacle.type === 'cspike') {
      const head = bodyRectFromSprite(0, playerCeilingY(), HITBOX.player).y;
      if (rect.y > head + 8) {
        problems.push(`天花板尖刺 ${obstacle.id} 没有贴着天花板`);
      }
    }
  }
  if (Number.isFinite(firstX)) {
    const reactSeconds = (firstX - level.startX) / tuning.speed;
    if (reactSeconds < 1.5) {
      problems.push(`第一个障碍出现太早（${reactSeconds.toFixed(2)} 秒）`);
    }
    const finishGap = (level.finishX - lastX) / tuning.speed;
    if (finishGap < 1) {
      problems.push('终点离最后一个障碍太近');
    }
  }

  for (const star of level.stars || []) {
    const srect = starRect(star, tuning);
    for (const obstacle of level.obstacles) {
      const rect = solidRect(obstacle, tuning);
      if (rect && rectsOverlap(srect, rect)) {
        problems.push(`星星 ${star.id} 和障碍 ${obstacle.id} 重叠`);
      }
    }
    for (const zone of flips) {
      if (star.x > zone.x0 && star.x < zone.x1) {
        problems.push(`星星 ${star.id} 放在了重力反转区里`);
      }
    }
  }

  auditRoutes(level, tuning, problems);
  return problems;
}

function spanOf(obstacle) {
  if (obstacle.type === 'flip' || obstacle.type === 'crumble') {
    return [obstacle.x0, obstacle.x1];
  }
  const half = obstacle.type === 'spike' || obstacle.type === 'cspike' ? 18 : 21;
  return [obstacle.x - half, obstacle.x + half];
}

/** 上层平台要能跳上去、跳下来，并且不和反转区叠在一起。 */
function auditRoutes(level, tuning, problems) {
  const decks = level.decks || [];
  const routes = level.routes || [];
  if (!decks.length) return;
  const flips = level.flips || [];
  for (const deck of decks) {
    for (const zone of flips) {
      if (deck.x0 < zone.x1 + 30 && zone.x0 < deck.x1 + 30) {
        problems.push(`平台 ${deck.id} 和重力反转区重叠`);
      }
    }
    if (deck.kind === 'route' && deck.layer === 2 && deck.h < 170) {
      problems.push(`上层 ${deck.id} 太低，地面起跳会撞上去`);
    }
    if (deck.kind === 'step' && deck.h > 140) {
      problems.push(`台阶 ${deck.id} 太高，不好跳`);
    }
  }
  for (const step of decks) {
    if (step.kind !== 'step') continue;
    const deck = decks.find((item) => item.kind === 'route' && item.layer === 2 && item.fork === step.fork);
    if (!deck) {
      problems.push(`台阶 ${step.id} 没有接到上层路`);
      continue;
    }
    if (step.x1 < deck.x0 + 36) problems.push(`台阶 ${step.id} 和上层路衔接太短`);
    if (step.x0 > deck.x0 - 20) problems.push(`台阶 ${step.id} 没有露在上层路前面`);
  }
  for (const high of routes) {
    if (high.layer < 3) continue;
    const lower = routes.find((item) => item.fork === high.fork && item.layer === 2);
    if (!lower) {
      problems.push(`高层 ${high.id} 没有对应的二层`);
      continue;
    }
    if (high.x0 < lower.x0 + 30 || high.x1 > lower.x1 - 16) {
      problems.push(`高层 ${high.id} 没有完全落在二层路面上`);
    }
  }
  const ground = (level.obstacles || []).filter((item) => !item.rise && item.type !== 'flip');
  for (const deck of decks) {
    if (deck.kind !== 'route' || deck.layer !== 2) continue;
    const land = deck.x1 + tuning.speed * 0.42;
    for (const obstacle of ground) {
      const [start, end] = spanOf(obstacle);
      if (end > deck.x1 + 8 && start < land) {
        problems.push(`上层 ${deck.id} 落地处有地面障碍 ${obstacle.id}`);
        break;
      }
    }
  }
  if (routes.length && level.stars?.length) {
    const grounded = level.stars.some((star) => (star.lift || 0) < 40);
    const lifted = level.stars.some((star) => (star.lift || 0) >= 160);
    if (!grounded) problems.push('有上层路时，至少留一颗地面星星');
    if (!lifted) problems.push('有上层路时，至少一颗星星要放在上层');
  }
}
