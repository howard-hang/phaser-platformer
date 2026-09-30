/**
 * 与场景无关的物理常数和碰撞盒。
 * 游戏场景和 Vitest 共用这一份，避免“测试过了、画面里却是另一套判定”。
 */

/** 手感参数。改这里会同时影响关卡时长和自动测试。 */
export const TUNING = {
  // 水平速度（像素/秒）。配合 75 秒关卡，总路程约 22500 像素。
  speed: 300,
  // 重力（像素/秒²），屏幕向下为正。
  gravity: 1700,
  // 起跳瞬间的垂直速度，向上为负。
  jumpVelocity: -740,
  groundY: 392,
  viewWidth: 960,
  viewHeight: 540,
  // 分数：最远奔跑距离每满这么多像素加 1 分。
  pxPerScore: 40,
};

/**
 * 贴图尺寸和 Arcade 碰撞盒。
 * offset 相对贴图左上角，和 Phaser Body.setOffset 一致。
 * 玩家、尖刺、方块的碰撞盒底边贴着贴图底边，避免角色踩进地里。
 */
export const HITBOX = {
  player: { w: 42, h: 42, bodyW: 28, bodyH: 34, offsetX: 7, offsetY: 8 },
  spike: { w: 36, h: 36, bodyW: 32, bodyH: 22, offsetX: 2, offsetY: 14 },
  block: { w: 42, h: 42, bodyW: 36, bodyH: 38, offsetX: 3, offsetY: 4 },
  star: { w: 36, h: 36, bodyW: 24, bodyH: 24, offsetX: 6, offsetY: 6 },
};

/** 站在地面上时，方块精灵的中心 Y（原点在中心）。 */
export function playerGroundY(tuning = TUNING) {
  return tuning.groundY - HITBOX.player.h / 2;
}

/**
 * 重力反转区的天花板下沿（世界 Y，越小越高）。
 * 比普通跳跃的最高点再高一截，正常起跳碰不到。
 */
export const FLIP_CEILING_Y = 182;

/** 贴在天花板上时，方块精灵的中心 Y。碰撞盒顶边贴着天花板下沿。 */
export function playerCeilingY() {
  return FLIP_CEILING_Y + HITBOX.player.h / 2 - HITBOX.player.offsetY;
}

/** 玩家中心 x 落在反转区里时重力向上，否则向下。 */
export function gravitySignAt(x, level) {
  const zones = level?.flips;
  if (!zones) return 1;
  for (let i = 0; i < zones.length; i += 1) {
    const zone = zones[i];
    if (x >= zone.x0 && x <= zone.x1) return -1;
  }
  return 1;
}

/** 从起点匀速跑到 x 时的关卡时间（秒）。死亡重生后也按这个时间对齐机关。 */
export function courseTime(x, level, tuning = TUNING) {
  return (x - level.startX) / tuning.speed;
}

/** 周期门在这个时间点是否关着。关着时要跳过去，开着时可以跑过去。 */
export function isGateClosed(obstacle, time) {
  const period = obstacle.period;
  const open = obstacle.open;
  let local = (time + (obstacle.phase || 0)) % period;
  if (local < 0) local += period;
  return local >= open;
}

/** 坠落平台塌掉之后的地面杀伤矩形。塌掉之前没有碰撞。 */
export function crumblePitRect(obstacle, tuning = TUNING) {
  return {
    x: obstacle.x0,
    y: tuning.groundY - 46,
    w: Math.max(1, obstacle.x1 - obstacle.x0),
    h: 46,
  };
}

/**
 * 把“精灵中心 + 碰撞盒描述”换成世界坐标里的矩形。
 * 公式与 Phaser 动态刚体 updateFromGameObject 一致：
 * left = centerX - 贴图宽/2 + offsetX
 */
export function bodyRectFromSprite(cx, cy, spec) {
  return {
    x: cx - spec.w / 2 + spec.offsetX,
    y: cy - spec.h / 2 + spec.offsetY,
    w: spec.bodyW,
    h: spec.bodyH,
  };
}

/** 轴对齐矩形是否相交。边缘刚好贴上不算撞上，和 Arcade intersects 一致。 */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

/**
 * 障碍物精灵中心、碰撞盒和贴图 key。
 * time 是从起点算的秒数。门开着、平台还没塌时返回 null，表示这一帧没有碰撞。
 * options.forceClosed 用来做关卡体检，把周期门当成关着的。
 */
export function obstaclePose(obstacle, tuning = TUNING, time = 0, options = {}) {
  if (obstacle.type === 'spike') {
    const spec = HITBOX.spike;
    return {
      cx: obstacle.x,
      cy: tuning.groundY - spec.h / 2,
      spec,
      key: 'spike',
    };
  }
  if (obstacle.type === 'cspike') {
    const spec = HITBOX.spike;
    // 贴图朝下，碰撞盒改到贴图上沿，尖端从天花板垂下来。
    return {
      cx: obstacle.x,
      cy: FLIP_CEILING_Y + spec.h / 2,
      spec: { ...spec, offsetY: 0 },
      key: 'spike-down',
    };
  }
  if (obstacle.type === 'block' || obstacle.type === 'gate') {
    if (obstacle.type === 'gate') {
      const closed = options.forceClosed || isGateClosed(obstacle, time);
      if (!closed) return null;
    }
    const spec = HITBOX.block;
    return {
      cx: obstacle.x,
      cy: tuning.groundY - spec.h / 2,
      spec,
      key: obstacle.type === 'gate' ? 'gate' : 'block',
    };
  }
  if (obstacle.type === 'overhead') {
    const spec = HITBOX.block;
    const gap = obstacle.gap ?? 58;
    return {
      cx: obstacle.x,
      cy: tuning.groundY - gap - spec.h / 2,
      spec,
      key: 'block',
    };
  }
  // 反转区本身不挡人，只改变重力。坠落平台用坑的矩形，不走精灵中心。
  if (obstacle.type === 'flip' || obstacle.type === 'crumble') return null;
  throw new Error(`未知障碍类型: ${obstacle.type}`);
}

/** 障碍物的碰撞矩形。没有碰撞时返回 null。 */
export function obstacleRect(obstacle, tuning = TUNING, time = 0, options = {}) {
  if (obstacle.type === 'crumble') {
    if (!options.forceClosed && time + 1e-6 < obstacle.collapse) return null;
    return crumblePitRect(obstacle, tuning);
  }
  const pose = obstaclePose(obstacle, tuning, time, options);
  if (!pose) return null;
  return bodyRectFromSprite(pose.cx, pose.cy, pose.spec);
}

/** 星星精灵中心。lift 是离开地面的额外高度。 */
export function starPose(star, tuning = TUNING) {
  const spec = HITBOX.star;
  return {
    cx: star.x,
    cy: tuning.groundY - spec.h / 2 - (star.lift || 0),
    spec,
    key: 'star',
  };
}

/** 星星的碰撞矩形。 */
export function starRect(star, tuning = TUNING) {
  const pose = starPose(star, tuning);
  return bodyRectFromSprite(pose.cx, pose.cy, pose.spec);
}

/** 玩家中心与某个障碍是否重叠。time 用来判断周期门和坠落平台。 */
export function playerHitsObstacle(px, py, obstacle, tuning = TUNING, time = 0) {
  const rect = obstacleRect(obstacle, tuning, time);
  if (!rect) return false;
  const prect = bodyRectFromSprite(px, py, HITBOX.player);
  return rectsOverlap(prect, rect);
}

/** 玩家中心与某颗星星是否重叠。 */
export function playerHitsStar(px, py, star, tuning = TUNING) {
  const prect = bodyRectFromSprite(px, py, HITBOX.player);
  return rectsOverlap(prect, starRect(star, tuning));
}

/**
 * 用和 Arcade 相同的半隐式欧拉积分，量一次起跳。
 * 先把起跳速度赋给 vy，再每步先加重力、再移动。
 * 返回滞空时间（秒）、水平距离和中心上升高度。
 */
export function sampleJump(tuning = TUNING) {
  const dt = 1 / 60;
  let vy = tuning.jumpVelocity;
  let offset = 0;
  let peak = 0;
  let t = 0;
  for (let i = 0; i < 300; i += 1) {
    vy += tuning.gravity * dt;
    offset += vy * dt;
    t += dt;
    if (offset < peak) peak = offset;
    if (offset >= 0 && vy > 0) {
      return { airTime: t, distance: tuning.speed * t, height: -peak };
    }
  }
  return { airTime: t, distance: tuning.speed * t, height: -peak };
}
