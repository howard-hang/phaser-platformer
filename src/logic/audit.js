/**
 * 关卡数据体检：时长、存档点是否安全、星星有没有埋在障碍里。
 * 能不能通关由 simulateRun 另行验证。
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

/** 站在某个 x 上会不会和障碍重叠。 */
function standingHits(x, obstacles, tuning) {
  const y = playerGroundY(tuning);
  const prect = bodyRectFromSprite(x, y, HITBOX.player);
  return obstacles.some((obstacle) => rectsOverlap(prect, obstacleRect(obstacle, tuning)));
}

/** 返回问题描述数组，空数组表示关卡结构合格。 */
export function auditLevel(level, tuning = TUNING) {
  const problems = [];
  const duration = (level.finishX - level.startX) / tuning.speed;
  if (duration < 60 || duration > 90) {
    problems.push(`关卡时长 ${duration.toFixed(2)} 秒，不在 60 到 90 秒之间`);
  }

  const ids = new Set();
  for (const obstacle of level.obstacles) {
    if (ids.has(obstacle.id)) problems.push(`障碍 id 重复: ${obstacle.id}`);
    ids.add(obstacle.id);
  }
  for (const star of level.stars) {
    if (ids.has(star.id)) problems.push(`星星 id 重复: ${star.id}`);
    ids.add(star.id);
  }

  let prev = -Infinity;
  for (const point of level.checkpoints) {
    if (point < prev) problems.push('存档点没有从小到大排列');
    prev = point;
    if (point < level.startX || point >= level.finishX) {
      problems.push(`存档点 ${point} 不在跑道内`);
    }
    // 重生点左右留出半个身位，避免刚复活就卡在尖刺里。
    for (const x of [point - 8, point, point + 24]) {
      if (standingHits(x, level.obstacles, tuning)) {
        problems.push(`存档点 ${point} 附近站立会碰到障碍`);
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
    const rect = obstacleRect(obstacle, tuning);
    firstX = Math.min(firstX, rect.x);
    lastX = Math.max(lastX, rect.x + rect.w);
    if (obstacle.type === 'overhead') {
      const playerTop = bodyRectFromSprite(0, playerGroundY(tuning), HITBOX.player).y;
      if (rect.y + rect.h > playerTop) {
        problems.push(`头顶障碍 ${obstacle.id} 太低，站立就会撞上`);
      }
    }
  }
  const reactSeconds = (firstX - level.startX) / tuning.speed;
  if (reactSeconds < 1.5) {
    problems.push(`第一个障碍出现太早（${reactSeconds.toFixed(2)} 秒）`);
  }
  const finishGap = (level.finishX - lastX) / tuning.speed;
  if (finishGap < 1) {
    problems.push('终点离最后一个障碍太近');
  }

  for (const star of level.stars) {
    const srect = starRect(star, tuning);
    for (const obstacle of level.obstacles) {
      if (rectsOverlap(srect, obstacleRect(obstacle, tuning))) {
        problems.push(`星星 ${star.id} 和障碍 ${obstacle.id} 重叠`);
      }
    }
  }

  return problems;
}
