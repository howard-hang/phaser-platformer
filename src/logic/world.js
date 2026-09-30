/**
 * 与场景无关的物理常数和碰撞盒。
 * 游戏场景和 Vitest 共用这一份，避免“测试过了、画面里却是另一套判定”。
 */

/** 手感参数。改这里会同时影响关卡时长和自动测试。 */
export const TUNING = {
  // 水平速度（像素/秒）。各关会换成自己的速度，重力和起跳不变。
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
 * 跳板把人弹起来时用的垂直速度。
 * 只在踩到跳板的那一下替换起跳速度，平时的跳跃高度不变。
 */
export const PAD_JUMP_VELOCITY = -980;

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
  // 倒挂刺：尖朝下，碰撞盒盖住整条长刺，站立钻得过，起跳会撞上。
  ceiling: { w: 40, h: 170, bodyW: 26, bodyH: 152, offsetX: 7, offsetY: 16 },
  // 跳板贴地，不致命，踩上去才换更高的起跳速度。
  pad: { w: 54, h: 18, bodyW: 50, bodyH: 14, offsetX: 2, offsetY: 4 },
  // 激光开着时才有碰撞。低的要从上面跳过，高的要贴地钻过去。
  laserLow: { w: 18, h: 72, bodyW: 14, bodyH: 68, offsetX: 2, offsetY: 2 },
  laserHigh: { w: 18, h: 86, bodyW: 14, bodyH: 82, offsetX: 2, offsetY: 2 },
};

/** 站在地面上时，方块精灵的中心 Y（原点在中心）。 */
export function playerGroundY(tuning = TUNING) {
  return tuning.groundY - HITBOX.player.h / 2;
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

/** 周期相位，结果落在 0 到 1。phase 也是 0 到 1 的偏移。 */
export function cyclePosition(time, period, phase = 0) {
  const span = Math.max(0.05, period || 0);
  let unit = (time / span + phase) % 1;
  if (unit < 0) unit += 1;
  return unit;
}

/**
 * 上下移动的进度。0 是贴地，1 是升到最高。
 * 两头各停一段，中间才移动，避免玩家刚跑到就赶上下落。
 */
export function moverUnit(time, period, phase = 0) {
  const unit = cyclePosition(time, period, phase);
  if (unit < 0.35) return 0;
  if (unit < 0.5) return (unit - 0.35) / 0.15;
  if (unit < 0.85) return 1;
  return 1 - (unit - 0.85) / 0.15;
}

/** 激光在这个时刻是否张开。duty 是一个周期里张开的比例。 */
export function laserActive(time, period, phase = 0, duty = 0.55) {
  const unit = cyclePosition(time, period, phase);
  const open = Math.min(0.9, Math.max(0.1, duty));
  return unit < open;
}

/**
 * 让移动刺在 meet 这一秒停在高处或贴地。
 * at 为 up 时人可以从下面跑过去，为 down 时要跳。
 */
export function phaseForMover(time, period, at) {
  const target = at === 'up' ? 0.67 : 0.15;
  const span = Math.max(0.05, period || 0);
  let phase = target - (time / span) % 1;
  phase = ((phase % 1) + 1) % 1;
  return Math.round(phase * 1000) / 1000;
}

/** 让激光在 meet 这一秒处于张开或关掉。 */
export function phaseForLaser(time, period, active, duty = 0.55) {
  const open = Math.min(0.9, Math.max(0.1, duty));
  const target = active ? open * 0.5 : open + (1 - open) * 0.5;
  const span = Math.max(0.05, period || 0);
  let phase = target - (time / span) % 1;
  phase = ((phase % 1) + 1) % 1;
  return Math.round(phase * 1000) / 1000;
}

/** 碰撞盒底边离地 bottomAboveGround 像素时，精灵中心的 y。 */
function centerAboveGround(spec, bottomAboveGround) {
  return bottomAboveGround + spec.offsetY + spec.bodyH - spec.h / 2;
}

/** 障碍物精灵中心、使用的碰撞盒和贴图 key。time 是从起跑算起的秒。 */
export function obstaclePose(obstacle, tuning = TUNING, time = 0) {
  if (obstacle.type === 'spike') {
    const spec = HITBOX.spike;
    return {
      cx: obstacle.x,
      cy: tuning.groundY - centerAboveGround(spec, 0),
      spec,
      key: 'spike',
      solid: true,
    };
  }
  if (obstacle.type === 'block') {
    const spec = HITBOX.block;
    return {
      cx: obstacle.x,
      cy: tuning.groundY - centerAboveGround(spec, 0),
      spec,
      key: 'block',
      solid: true,
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
      solid: true,
    };
  }
  if (obstacle.type === 'ceiling') {
    const spec = HITBOX.ceiling;
    const hang = obstacle.hang ?? 48;
    return {
      cx: obstacle.x,
      cy: tuning.groundY - centerAboveGround(spec, hang),
      spec,
      key: 'ceiling',
      solid: true,
    };
  }
  if (obstacle.type === 'mover') {
    const spec = obstacle.style === 'block' ? HITBOX.block : HITBOX.spike;
    const lift = (obstacle.amplitude ?? 96) * moverUnit(time, obstacle.period ?? 1.8, obstacle.phase ?? 0);
    return {
      cx: obstacle.x,
      cy: tuning.groundY - centerAboveGround(spec, lift),
      spec,
      key: obstacle.style === 'block' ? 'block' : 'spike',
      solid: true,
      lift,
    };
  }
  if (obstacle.type === 'laser') {
    const high = obstacle.band === 'high';
    const spec = high ? HITBOX.laserHigh : HITBOX.laserLow;
    const active = laserActive(time, obstacle.period ?? 1.8, obstacle.phase ?? 0, obstacle.duty ?? 0.55);
    const bottom = high ? (obstacle.lift ?? 112) : 0;
    return {
      cx: obstacle.x,
      cy: tuning.groundY - centerAboveGround(spec, bottom),
      spec,
      key: high ? 'laser-high' : 'laser-low',
      solid: active,
    };
  }
  if (obstacle.type === 'pad') {
    const spec = HITBOX.pad;
    return {
      cx: obstacle.x,
      cy: tuning.groundY - centerAboveGround(spec, 0),
      spec,
      key: 'pad',
      solid: false,
    };
  }
  throw new Error(`未知障碍类型: ${obstacle.type}`);
}

/** 障碍物的碰撞矩形。激光关掉时没有矩形。 */
export function obstacleRect(obstacle, tuning = TUNING, time = 0) {
  const pose = obstaclePose(obstacle, tuning, time);
  if (!pose.solid) return null;
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

/** 玩家中心与某个障碍是否重叠。time 用来算上下移动和激光开合。 */
export function playerHitsObstacle(px, py, obstacle, tuning = TUNING, time = 0) {
  const rect = obstacleRect(obstacle, tuning, time);
  if (!rect) return false;
  const prect = bodyRectFromSprite(px, py, HITBOX.player);
  return rectsOverlap(prect, rect);
}

/** 跳板的碰撞矩形。跳板不致命。 */
export function padRect(pad, tuning = TUNING) {
  const pose = obstaclePose({ ...pad, type: 'pad' }, tuning, 0);
  return bodyRectFromSprite(pose.cx, pose.cy, pose.spec);
}

/** 站在地上的玩家是否踩到这块跳板。 */
export function playerOnPad(px, py, pad, tuning = TUNING) {
  const prect = bodyRectFromSprite(px, py, HITBOX.player);
  return rectsOverlap(prect, padRect(pad, tuning));
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
