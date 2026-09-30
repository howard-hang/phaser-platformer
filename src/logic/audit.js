/**
 * 关卡数据体检：时长、存档点是否安全、星星有没有埋在障碍里。
 * 能不能通关由 simulateRun 另行验证。
 */
import {
  HITBOX,
  TUNING,
  bodyRectFromSprite,
  obstaclePose,
  obstacleRect,
  padRect,
  playerGroundY,
  rectsOverlap,
  starRect,
} from './world.js';

/** 站在某个 x 上会不会和障碍重叠。移动障碍和激光按到达该点的时间计算。 */
function standingHits(level, x, tuning) {
  const y = playerGroundY(tuning);
  const prect = bodyRectFromSprite(x, y, HITBOX.player);
  const time = (x - level.startX) / tuning.speed;
  return level.obstacles.some((obstacle) => {
    const rect = obstacleRect(obstacle, tuning, time);
    return rect ? rectsOverlap(prect, rect) : false;
  });
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
      if (standingHits(level, x, tuning)) {
        problems.push(`存档点 ${point} 附近站立会碰到障碍`);
        break;
      }
    }
    for (const pad of level.pads || []) {
      const rect = padRect(pad, tuning);
      const prect = bodyRectFromSprite(point, playerGroundY(tuning), HITBOX.player);
      if (rectsOverlap(prect, rect)) {
        problems.push(`存档点 ${point} 落在跳板 ${pad.id} 上，复活会直接弹起`);
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
    const pose = obstaclePose(obstacle, tuning, (obstacle.x - level.startX) / tuning.speed);
    const left = pose.cx - pose.spec.w / 2;
    const right = left + pose.spec.w;
    firstX = Math.min(firstX, left);
    lastX = Math.max(lastX, right);
    if (obstacle.type === 'overhead' || obstacle.type === 'ceiling') {
      if (standingHits(level, obstacle.x, tuning)) {
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
    const time = (star.x - level.startX) / tuning.speed;
    for (const obstacle of level.obstacles) {
      const rect = obstacleRect(obstacle, tuning, time);
      if (rect && rectsOverlap(srect, rect)) {
        problems.push(`星星 ${star.id} 和障碍 ${obstacle.id} 重叠`);
      }
    }
  }

  return problems;
}
