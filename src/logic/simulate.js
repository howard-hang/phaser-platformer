/**
 * 无头试跑：用和游戏相同的碰撞盒、速度和跳跃积分，
 * 找一条能活着跑到终点的起跳时机。测试用它证明关卡不是死局。
 */
import {
  HITBOX,
  TUNING,
  bodyRectFromSprite,
  playerGroundY,
  playerHitsObstacle,
  playerHitsStar,
  obstacleRect,
  rectsOverlap,
} from './world.js';

const STEP = 1 / 60;

/** 玩家身前，下一个还没过去、而且贴地会撞上的障碍。 */
function nextGroundHazard(x, y, obstacles, tuning, time) {
  const prect = bodyRectFromSprite(x, y, HITBOX.player);
  const front = prect.x + prect.w;
  const standing = bodyRectFromSprite(x, y, HITBOX.player);
  let best = null;
  let bestLeft = Infinity;
  for (const obstacle of obstacles) {
    if (obstacle.type === 'overhead' || obstacle.type === 'ceiling') continue;
    const rect = obstacleRect(obstacle, tuning, time);
    if (!rect) continue;
    if (rect.x + rect.w <= front) continue;
    // 高处的激光和升起来的移动障碍，贴地跑得过去。
    if (!rectsOverlap(standing, { ...rect, x: standing.x })) continue;
    if (rect.x < bestLeft) {
      best = obstacle;
      bestLeft = rect.x;
    }
  }
  return best;
}

/** 空中走一步。落地时把脚底贴回地面。 */
function stepAir(x, y, vy, tuning) {
  let nextVy = vy + tuning.gravity * STEP;
  let nextX = x + tuning.speed * STEP;
  let nextY = y + nextVy * STEP;
  const rect = bodyRectFromSprite(nextX, nextY, HITBOX.player);
  let landed = false;
  if (rect.y + rect.h >= tuning.groundY && nextVy >= 0) {
    nextY = playerGroundY(tuning);
    nextVy = 0;
    landed = true;
  }
  return { x: nextX, y: nextY, vy: nextVy, landed };
}

/** 这一跳的整段弧线会不会擦到任何障碍，包括落地那一帧。 */
function jumpClears(x, y, level, tuning) {
  let cx = x;
  let cy = y;
  let vy = tuning.jumpVelocity;
  for (let i = 0; i < 180; i += 1) {
    const step = stepAir(cx, cy, vy, tuning);
    cx = step.x;
    cy = step.y;
    vy = step.vy;
    const time = (cx - level.startX) / tuning.speed;
    for (const obstacle of level.obstacles) {
      if (playerHitsObstacle(cx, cy, obstacle, tuning, time)) return false;
    }
    if (step.landed) return true;
  }
  return false;
}

/**
 * 靠近地面障碍时，在大约 0.3 秒的窗口里找能跳过去的帧。
 * 头顶方块不主动起跳，站着跑过去。
 */
function decideJump(x, y, level, tuning) {
  const time = (x - level.startX) / tuning.speed;
  const hazard = nextGroundHazard(x, y, level.obstacles, tuning, time);
  if (!hazard) return 'run';
  const prect = bodyRectFromSprite(x, y, HITBOX.player);
  const hrect = obstacleRect(hazard, tuning, time);
  const dist = hrect.x - (prect.x + prect.w);
  if (dist > 200) return 'run';
  if (dist > 95) return 'run';
  if (jumpClears(x, y, level, tuning)) return 'jump';
  if (dist > 6) return 'run';
  return 'stuck';
}

/**
 * 从关卡起点跑到终点。
 * 成功时 ok 为 true，并带上用时和沿途捡到的星星数。
 */
export function simulateRun(level, tuning = TUNING, options = {}) {
  const duration = (level.finishX - level.startX) / tuning.speed;
  let x = level.startX;
  let y = playerGroundY(tuning);
  let vy = 0;
  let grounded = true;
  let stars = 0;
  const got = new Set();
  const maxT = duration + 5;
  const path = options.trace ? [] : null;

  for (let t = 0; t <= maxT; t += STEP) {
    if (path) path.push({ x, y, grounded });
    for (const obstacle of level.obstacles) {
      if (playerHitsObstacle(x, y, obstacle, tuning, t)) {
        return { ok: false, reason: 'hit', id: obstacle.id, t, x, y, stars };
      }
    }
    for (const star of level.stars) {
      if (!got.has(star.id) && playerHitsStar(x, y, star, tuning)) {
        got.add(star.id);
        stars += 1;
      }
    }
    if (x >= level.finishX) {
      return { ok: true, t, x, y, stars, totalStars: level.stars.length, path };
    }

    if (grounded) {
      const decision = decideJump(x, y, level, tuning);
      if (decision === 'jump') {
        vy = tuning.jumpVelocity;
        grounded = false;
      } else if (decision === 'stuck') {
        return { ok: false, reason: 'stuck', t, x, y, stars };
      }
    }

    if (!grounded) {
      const step = stepAir(x, y, vy, tuning);
      x = step.x;
      y = step.y;
      vy = step.vy;
      grounded = step.landed;
    } else {
      x += tuning.speed * STEP;
      y = playerGroundY(tuning);
      vy = 0;
    }
  }

  return { ok: false, reason: 'timeout', t: maxT, x, y, stars };
}
