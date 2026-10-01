/**
 * 给难度曲线用的指标。障碍物按展开后的个数计，三连尖刺算 3 个。
 * 平均间隔是相邻障碍中心的时间差，越密越小。
 */
import { obstacleRect } from '../logic/world.js';

/** 最后一个障碍右缘到终点的时间。大约 1 秒，给玩家看清终点门。 */
export const FINISH_APPROACH_MIN = 1;
export const FINISH_APPROACH_MAX = 1.25;

const TYPE_LABEL = {
  spike: '尖刺',
  block: '方块',
  overhead: '倒挂方块',
  cspike: '倒挂刺',
  gate: '周期门',
  crumble: '坠落平台',
  flip: '重力反转',
};

/** 终点门离最后一个障碍右缘还有几秒。反转区按出口算，门按关着的碰撞盒算。 */
export function finishApproachSeconds(level, tuning) {
  let lastX = -Infinity;
  for (const obstacle of level.obstacles) {
    if (obstacle.type === 'flip' || obstacle.type === 'crumble') {
      lastX = Math.max(lastX, obstacle.x1);
      continue;
    }
    const rect = obstacle.type === 'gate'
      ? obstacleRect(obstacle, tuning, 0, { forceClosed: true })
      : obstacleRect(obstacle, tuning, 0);
    if (rect) lastX = Math.max(lastX, rect.x + rect.w);
  }
  if (!Number.isFinite(lastX)) return (level.finishX - level.startX) / tuning.speed;
  return (level.finishX - lastX) / tuning.speed;
}

export function levelMetrics(level) {
  const duration = (level.finishX - level.startX) / level.speed;
  const xs = level.obstacles.map((item) => item.x).sort((a, b) => a - b);
  let gap = 0;
  for (let i = 1; i < xs.length; i += 1) gap += (xs[i] - xs[i - 1]) / level.speed;
  const types = [];
  for (const obstacle of level.obstacles) {
    if (!types.includes(obstacle.type)) types.push(obstacle.type);
  }
  return {
    id: level.id,
    name: level.name,
    index: level.index,
    speed: level.speed,
    duration,
    obstacles: level.obstacles.length,
    avgGap: xs.length > 1 ? gap / (xs.length - 1) : duration,
    types,
    typeLabels: types.map((type) => TYPE_LABEL[type] || type),
  };
}

/**
 * 相邻两个关卡事件的起始时间差不超过这个值，就记成同一个组合。
 * 尖刺的 count 只算一个事件，不算进组合长度。
 */
export const EVENT_COMBO_GAP = 0.62;

/** 相邻事件间隔至少这么多秒，算玩家能喘口气的一段。比一次跳跃更长。 */
export const BREATH_GAP_SEC = 1.5;

/**
 * 统计关卡 JSON 里的连续障碍组合。
 * 返回组合段数、最长长度，以及 2 连、3 连、更长的段数。
 */
export function eventComboStats(def, maxGap = EVENT_COMBO_GAP) {
  const times = (def?.obstacles || []).map((item) => item.t).sort((a, b) => a - b);
  const groups = [];
  let len = 1;
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] - times[i - 1] <= maxGap + 1e-9) len += 1;
    else {
      if (len >= 2) groups.push(len);
      len = 1;
    }
  }
  if (len >= 2) groups.push(len);
  const count = groups.length;
  const sum = groups.reduce((total, n) => total + n, 0);
  return {
    count,
    max: groups.reduce((m, n) => Math.max(m, n), 0),
    mean: count ? sum / count : 0,
    pairs: groups.filter((n) => n === 2).length,
    triples: groups.filter((n) => n === 3).length,
    longer: groups.filter((n) => n >= 4).length,
    lengths: groups,
  };
}

/** 这一关还有几段足够长的空档。 */
export function eventBreathCount(def, minGap = BREATH_GAP_SEC) {
  const times = (def?.obstacles || []).map((item) => item.t).sort((a, b) => a - b);
  let count = 0;
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] - times[i - 1] >= minGap) count += 1;
  }
  return count;
}

/** 第 n 关（从 1 数）建议的解锁星数：前面关卡满星的三分之二。 */
export function suggestedUnlock(levelNumber) {
  if (levelNumber <= 1) return 0;
  return Math.round((levelNumber - 1) * 3 * (2 / 3));
}
