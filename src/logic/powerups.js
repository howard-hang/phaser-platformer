/**
 * 道具规则。场景和测试共用这一份，避免画面里的时长和判定各写各的。
 * 二段跳的初速度和普通跳相同，所以第二跳本身的上升高度不会更高。
 */
import { POWERUP_CONFIG } from '../game/powerupConfig.js';
import {
  HITBOX,
  TUNING,
  playerGroundY,
} from './world.js';

export { POWERUP_CONFIG };

export const POWER_TYPES = ['double', 'bomb', 'plane'];

/** 可以炸掉的障碍。平台、地面和重力反转区不在里面，炸完路还在。 */
export const DESTRUCTIBLE_TYPES = ['spike', 'cspike', 'block', 'overhead', 'gate', 'crumble'];

/** 跑道上的道具碰撞盒，画法和星星一样贴着贴图。 */
export const POWERUP_HITBOX = {
  w: 36,
  h: 36,
  bodyW: 26,
  bodyH: 26,
  offsetX: 5,
  offsetY: 5,
};

export function isDestructible(obstacle) {
  return DESTRUCTIBLE_TYPES.includes(obstacle?.type);
}

/** 障碍在世界坐标里占的水平区间。坠落坑和反转区用两端，其余用贴图宽度。 */
export function obstacleIntervalX(obstacle) {
  if (Number.isFinite(obstacle?.x0) && Number.isFinite(obstacle?.x1)) {
    return [obstacle.x0, obstacle.x1];
  }
  const spec = obstacle?.type === 'spike' || obstacle?.type === 'cspike'
    ? HITBOX.spike
    : HITBOX.block;
  const half = spec.w / 2;
  const x = obstacle?.x || 0;
  return [x - half, x + half];
}

export function createPowerState() {
  return {
    kind: null,
    endsAt: 0,
    airReady: false,
    phase: null,
    landEndsAt: 0,
    invulnUntil: 0,
  };
}

/**
 * 吃到新道具就换掉旧的。
 * 炸弹没有持续状态，吃下去立刻结算，原来的计时也一起停。
 */
export function grantPower(prev, kind, now, config = POWERUP_CONFIG) {
  const replaced = prev?.kind || null;
  if (kind === 'bomb') {
    return { state: createPowerState(), bomb: true, replaced };
  }
  if (kind === 'double') {
    return {
      state: {
        ...createPowerState(),
        kind: 'double',
        endsAt: now + config.double.duration,
        airReady: true,
      },
      bomb: false,
      replaced,
    };
  }
  if (kind === 'plane') {
    return {
      state: {
        ...createPowerState(),
        kind: 'plane',
        endsAt: now + config.plane.duration,
        phase: 'fly',
      },
      bomb: false,
      replaced,
    };
  }
  throw new Error(`未知类型 ${kind}`);
}

function idleFrom(state) {
  if (state?.invulnUntil) {
    return { ...createPowerState(), invulnUntil: state.invulnUntil };
  }
  return createPowerState();
}

/** 用游戏内的秒推进。到点就结束；飞机先进入落地，落地完再留一小段无敌。 */
export function tickPower(state, now, config = POWERUP_CONFIG) {
  if (!state) return createPowerState();
  if (state.kind === 'double') {
    if (now + 1e-6 >= state.endsAt) return idleFrom(state);
    return state;
  }
  if (state.kind === 'plane') {
    if (state.phase !== 'land' && now + 1e-6 >= state.endsAt) {
      return {
        ...state,
        phase: 'land',
        landEndsAt: now + config.plane.landDuration,
      };
    }
    if (state.phase === 'land' && now + 1e-6 >= state.landEndsAt) {
      return {
        ...createPowerState(),
        invulnUntil: now + config.plane.landInvuln,
      };
    }
    return state;
  }
  if (state.invulnUntil && now + 1e-6 < state.invulnUntil) return state;
  if (state.invulnUntil) return createPowerState();
  return state;
}

/** 落地后补回一次空中跳。buff 不在了就什么都不做。 */
export function noteLand(state) {
  if (state?.kind !== 'double' || state.airReady) return state;
  return { ...state, airReady: true };
}

export function canAirJump(state, grounded) {
  return !grounded && state?.kind === 'double' && !!state.airReady;
}

export function noteAirJump(state) {
  if (!canAirJump(state, false)) return state;
  return { ...state, airReady: false };
}

/**
 * 起跳。空中只有二段跳还有次数时才成功。
 * 垂直速度直接设成普通跳的初速度，不在当前速度上再加一截。
 */
export function resolveJump({ grounded, airReady, jumpVelocity, flipped }) {
  if (!grounded && !airReady) return { ok: false, vy: 0, usedAir: false };
  const vy = flipped ? -jumpVelocity : jumpVelocity;
  return { ok: true, vy, usedAir: !grounded };
}

/** 飞机全程，以及落地后的短暂窗口，障碍打不中。 */
export function isPowerInvulnerable(state, now) {
  if (!state) return false;
  if (state.kind === 'plane') return true;
  return !!(state.invulnUntil && now < state.invulnUntil);
}

/** 倒计时条还剩的比例，1 是刚吃到，0 是用完。 */
export function powerRatio(state, now, config = POWERUP_CONFIG) {
  if (!state?.kind) return 0;
  let total = config.double.duration;
  let left = state.endsAt - now;
  if (state.kind === 'plane' && state.phase === 'land') {
    total = config.plane.landDuration;
    left = state.landEndsAt - now;
  } else if (state.kind === 'plane') {
    total = config.plane.duration;
    left = state.endsAt - now;
  }
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, left / total));
}

export function powerIconKey(kind) {
  if (kind === 'plane') return 'power-plane';
  if (kind === 'bomb') return 'power-bomb';
  return 'power-double';
}

/** 道具精灵中心。lift 是额外离地高度，0 就是贴地。 */
export function powerupCenterY(item, tuning = TUNING) {
  return tuning.groundY - POWERUP_HITBOX.h / 2 - (item?.lift || 0);
}

/** 巡航高度上的方块中心。 */
export function flightCenterY(tuning = TUNING, config = POWERUP_CONFIG) {
  return playerGroundY(tuning) - config.plane.flightLift;
}

/** 落地清场的世界坐标区间，盖住下滑和落地后的一小段滑行。 */
export function landingClearWindow(playerX, speed, config = POWERUP_CONFIG.plane) {
  const forward = speed * (config.landDuration + config.landInvuln) + config.landingPad;
  return {
    x0: playerX - config.clearBehind,
    x1: playerX + forward,
  };
}

/** 缓缓落地。smoothstep，开头和结尾都比匀速更慢。 */
export function landingY(fromY, groundY, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const shaped = clamped * clamped * (3 - 2 * clamped);
  return fromY + (groundY - fromY) * shaped;
}

/**
 * 落地轨迹上的采样点，和场景用的是同一条曲线。
 * 测试用它确认脚落到地面时没有障碍。
 */
export function sampleLandingPoints(playerX, speed, tuning = TUNING, config = POWERUP_CONFIG) {
  const plane = config.plane;
  const totalT = plane.landDuration + plane.landInvuln;
  const steps = Math.max(1, Math.round(totalT * 60));
  const ground = playerGroundY(tuning);
  const fromY = flightCenterY(tuning, config);
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const elapsed = (totalT * i) / steps;
    const y = elapsed <= plane.landDuration
      ? landingY(fromY, ground, elapsed / plane.landDuration)
      : ground;
    points.push({
      x: playerX + speed * elapsed,
      y,
      elapsed,
      onGround: elapsed >= plane.landDuration,
    });
  }
  return points;
}

/** 清掉区间里可以炸的障碍。平台不会出现在这个列表里。 */
export function clearSpan(obstacles, x0, x1) {
  const removed = [];
  const kept = [];
  const list = obstacles || [];
  for (let i = 0; i < list.length; i += 1) {
    const obstacle = list[i];
    const [left, right] = obstacleIntervalX(obstacle);
    if (isDestructible(obstacle) && right > x0 && left < x1) removed.push(obstacle);
    else kept.push(obstacle);
  }
  return { removed, kept };
}

/** 炸弹：玩家前方一段距离。 */
export function blastObstacles(obstacles, playerX, config = POWERUP_CONFIG) {
  const bomb = config.bomb;
  return clearSpan(obstacles, playerX - bomb.behind, playerX + bomb.range);
}

/**
 * 炸完之后平台和反转区的几何还在，被清掉的都是可炸障碍。
 * 地面没有单独的物体，清障碍不会把地面从图里拿掉。
 */
export function blastKeepsCourse(before, after, removed) {
  if (!sameSpans(before?.decks || [], after?.decks || [])) return false;
  if (!sameSpans(before?.flips || [], after?.flips || [])) return false;
  for (let i = 0; i < removed.length; i += 1) {
    if (!isDestructible(removed[i])) return false;
  }
  return true;
}

function sameSpans(before, after) {
  if (before.length !== after.length) return false;
  for (let i = 0; i < before.length; i += 1) {
    const a = before[i];
    const b = after[i];
    if (a.id !== b.id || a.x0 !== b.x0 || a.x1 !== b.x1) return false;
    if (a.top !== b.top) return false;
  }
  return true;
}

/** 飞行时水平擦过、垂直还在吸附距离里，就算顺路吃到。 */
export function withinStarCatch(dx, dy, config = POWERUP_CONFIG.plane) {
  return Math.abs(dx) <= config.starCatchX && Math.abs(dy) <= config.starReach;
}

/**
 * 无尽模式按距离掷一次。
 * 调用方自己保证间隔，这里只看概率和种类。
 */
export function rollPowerType(rng, distancePx, config = POWERUP_CONFIG) {
  const endless = config.endless;
  const chance = distancePx < endless.earlyDistance ? endless.earlyChance : endless.chance;
  if (rng() >= chance) return null;
  const index = Math.min(endless.types.length - 1, Math.floor(rng() * endless.types.length));
  return endless.types[index];
}
