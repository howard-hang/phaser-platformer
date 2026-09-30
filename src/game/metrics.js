/**
 * 给难度曲线用的指标。障碍物按展开后的个数计，三连尖刺算 3 个。
 * 平均间隔是相邻障碍中心的时间差，越密越小。
 */

const TYPE_LABEL = {
  spike: '尖刺',
  block: '方块',
  overhead: '倒挂方块',
  cspike: '倒挂刺',
  gate: '周期门',
  crumble: '坠落平台',
  flip: '重力反转',
};

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

/** 第 n 关（从 1 数）建议的解锁星数：前面关卡满星的三分之二。 */
export function suggestedUnlock(levelNumber) {
  if (levelNumber <= 1) return 0;
  return Math.round((levelNumber - 1) * 3 * (2 / 3));
}
