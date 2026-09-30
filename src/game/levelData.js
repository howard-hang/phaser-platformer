/**
 * 五关剧本。时间单位是秒，0 是起跑瞬间。
 * 第 1 关的密集段接近原来的第 3 关，后面速度和间距再拉开。
 * 倒挂刺、跳板、上下移动的刺、周期激光都先单独出现，再和其他障碍挨在一起。
 * 密集段和喘息段交替。跳跃高度和重力不在这里改。
 */
function roundT(value) {
  return Math.round(value * 100) / 100;
}

/** 把一串简写按固定间隔铺开。s1/s2/s3 是尖刺，b 方块，o 头顶窄缝。 */
function seq(start, step, kinds) {
  return kinds.map((kind, index) => {
    const t = roundT(start + index * step);
    if (kind === 's1') return { t, type: 'spike', count: 1 };
    if (kind === 's2') return { t, type: 'spike', count: 2 };
    if (kind === 's3') return { t, type: 'spike', count: 3 };
    if (kind === 'b') return { t, type: 'block' };
    if (kind === 'o') return { t, type: 'overhead' };
    throw new Error(`未知简写: ${kind}`);
  });
}

export const LEVEL_DEFS = [
  {
    id: 'level-1',
    name: '紫色冲刺',
    speed: 340,
    duration: 74,
    palette: 0,
    script: [
      { t: 1.3, type: 'star', lift: 0 },
      // 密集：尖刺、方块和窄缝，间隔接近原来的第 3 关。
      ...seq(3.2, 1.38, ['s2', 's2', 'o', 's2', 'b', 's3']),
      { t: 10.45, type: 'star', lift: 96 },
      { t: 12.2, type: 'checkpoint' },
      // 喘息。倒挂刺单独出现：贴地跑，跳起来会撞上。
      { t: 15.0, type: 'ceiling' },
      // 喘息。跳板单独出现，踩上去弹得更高，才能碰到这颗星。
      { t: 18.6, type: 'pad' },
      { t: 18.86, type: 'star', lift: 200 },
      { t: 21.6, type: 'checkpoint' },
      // 密集。
      ...seq(23.8, 1.32, ['s2', 's1', 's2', 'o', 's3', 'b', 's2']),
      { t: 33.4, type: 'checkpoint' },
      // 喘息后再密一段。
      ...seq(36.0, 1.36, ['s2', 's2', 'o', 's2', 'b', 's3', 's1']),
      { t: 46.0, type: 'checkpoint' },
      ...seq(48.2, 1.3, ['s3', 'o', 's2', 'b', 's2', 's3']),
      { t: 56.4, type: 'checkpoint' },
      // 收尾再给一根倒挂刺，前后仍然是空的，不和跳板叠在一起。
      { t: 58.8, type: 'ceiling' },
      ...seq(61.4, 1.3, ['s2', 'b', 's2', 'o', 's3', 's2']),
      { t: 69.6, type: 'checkpoint' },
      { t: 71.4, type: 'spike', count: 1 },
    ],
  },
  {
    id: 'level-2',
    name: '紫晶连跳',
    speed: 360,
    duration: 72,
    palette: 1,
    script: [
      { t: 1.25, type: 'star', lift: 0 },
      ...seq(3.0, 1.26, ['s2', 's2', 'b', 's3', 'o', 's2']),
      { t: 11.0, type: 'checkpoint' },
      // 喘息。移动方块单独升到高处，贴地就能过去。
      { t: 13.6, type: 'mover', style: 'block', at: 'up', amplitude: 118 },
      // 喘息。移动刺单独落回地面，要跳过去。
      { t: 16.8, type: 'mover', at: 'down', amplitude: 96 },
      { t: 19.2, type: 'checkpoint' },
      // 密集，并把已经认识的移动刺接在尖刺后面。
      ...seq(21.2, 1.22, ['s2', 's2', 's1', 'b']),
      { t: 26.2, type: 'mover', at: 'down' },
      { t: 27.5, type: 'spike', count: 2 },
      { t: 28.8, type: 'overhead' },
      { t: 29.6, type: 'spike', count: 3 },
      { t: 29.85, type: 'star', lift: 100 },
      { t: 31.4, type: 'checkpoint' },
      ...seq(33.4, 1.22, ['s3', 'b', 's2', 'o', 's2', 's2']),
      { t: 41.0, type: 'checkpoint' },
      // 倒挂刺和跳板都已学过，中间留一口气，不叠在同一次起跳里。
      { t: 43.2, type: 'ceiling' },
      { t: 46.4, type: 'pad' },
      { t: 46.68, type: 'star', lift: 200 },
      { t: 49.2, type: 'checkpoint' },
      ...seq(51.2, 1.2, ['s2', 's3', 'o', 's2', 'b', 's2', 's3', 's1']),
      { t: 61.2, type: 'checkpoint' },
      { t: 63.0, type: 'mover', style: 'block', at: 'up', amplitude: 120 },
      ...seq(64.6, 1.22, ['s3', 's2', 's3', 's2', 's3']),
    ],
  },
  {
    id: 'level-3',
    name: '靛色窄缝',
    speed: 382,
    duration: 70,
    palette: 2,
    script: [
      { t: 1.2, type: 'star', lift: 0 },
      ...seq(2.9, 1.18, ['s2', 's2', 'o', 's3', 'b', 's2']),
      { t: 10.4, type: 'checkpoint' },
      // 喘息。低激光单独张开，跳过去。
      { t: 13.0, type: 'laser', band: 'low', on: true },
      // 喘息。高激光单独张开，贴地钻过去，跳起来会撞上。
      { t: 16.2, type: 'laser', band: 'high', on: true },
      { t: 18.6, type: 'checkpoint' },
      // 密集，激光开始和尖刺连着出现。
      ...seq(20.6, 1.16, ['s2', 's3', 's2']),
      { t: 24.2, type: 'laser', band: 'low', on: true },
      { t: 25.5, type: 'spike', count: 2 },
      { t: 26.8, type: 'overhead' },
      { t: 27.6, type: 'spike', count: 3 },
      { t: 27.85, type: 'star', lift: 92 },
      { t: 29.6, type: 'checkpoint' },
      ...seq(31.5, 1.14, ['s3', 'b', 's3', 'o', 's2', 's3', 'b']),
      { t: 39.8, type: 'checkpoint' },
      // 已经认识的移动刺，接在高激光前面：先跳完再贴地。
      { t: 41.6, type: 'mover', at: 'down' },
      { t: 43.2, type: 'laser', band: 'high', on: true },
      { t: 45.2, type: 'ceiling' },
      { t: 47.6, type: 'checkpoint' },
      ...seq(49.4, 1.12, ['s2', 's3', 'o', 's2', 'b', 's3', 's2', 's3']),
      { t: 58.6, type: 'checkpoint' },
      { t: 60.4, type: 'pad' },
      { t: 60.68, type: 'star', lift: 200 },
      { t: 63.0, type: 'spike', count: 3 },
      { t: 64.3, type: 'laser', band: 'low', on: true },
      { t: 65.6, type: 'spike', count: 3 },
      { t: 66.9, type: 'spike', count: 3 },
      { t: 68.2, type: 'block' },
    ],
  },
  {
    id: 'level-4',
    name: '玫红平台',
    speed: 404,
    duration: 68,
    palette: 3,
    script: [
      { t: 1.15, type: 'star', lift: 0 },
      ...seq(2.7, 1.12, ['s3', 's2', 'b', 'o', 's2', 's3']),
      { t: 9.8, type: 'checkpoint' },
      // 组合：低激光和移动刺挨得很近。
      { t: 11.6, type: 'laser', band: 'low', on: true },
      { t: 13.0, type: 'mover', at: 'down' },
      { t: 14.4, type: 'spike', count: 2 },
      { t: 15.7, type: 'overhead' },
      { t: 16.5, type: 'spike', count: 3 },
      { t: 16.75, type: 'star', lift: 88 },
      { t: 18.4, type: 'checkpoint' },
      ...seq(20.2, 1.1, ['s2', 's3', 'b', 's2', 'o', 's3', 's2']),
      { t: 28.2, type: 'checkpoint' },
      // 组合：升起来的方块后面马上是倒挂刺，两下都不要跳。
      { t: 30.0, type: 'mover', style: 'block', at: 'up', amplitude: 124 },
      { t: 31.6, type: 'ceiling' },
      { t: 33.6, type: 'laser', band: 'high', on: true },
      { t: 35.4, type: 'checkpoint' },
      ...seq(37.2, 1.08, ['s3', 's2', 'o', 's2', 'b', 's3', 's2', 's1']),
      { t: 46.2, type: 'checkpoint' },
      { t: 48.0, type: 'pad' },
      { t: 48.28, type: 'star', lift: 200 },
      { t: 51.0, type: 'mover', at: 'down' },
      { t: 52.3, type: 'spike', count: 3 },
      { t: 53.6, type: 'laser', band: 'low', on: true },
      { t: 55.0, type: 'checkpoint' },
      ...seq(56.8, 1.08, ['s2', 's3', 'o', 's2', 'b', 's3', 's2']),
      { t: 64.8, type: 'spike', count: 2 },
      { t: 66.1, type: 'block' },
    ],
  },
  {
    id: 'level-5',
    name: '夜紫终章',
    speed: 424,
    duration: 66,
    palette: 4,
    script: [
      { t: 1.1, type: 'star', lift: 0 },
      ...seq(2.6, 1.06, ['s3', 's2', 'o', 's2', 'b', 's3', 's2']),
      { t: 10.4, type: 'checkpoint' },
      // 四种新障碍串在一起，中间只留落地的空隙。
      { t: 12.0, type: 'laser', band: 'low', on: true },
      { t: 13.3, type: 'mover', at: 'down' },
      { t: 14.7, type: 'ceiling' },
      { t: 16.6, type: 'laser', band: 'high', on: true },
      { t: 18.4, type: 'checkpoint' },
      ...seq(20.1, 1.04, ['s3', 's2', 'b', 's3', 'o', 's2', 's3']),
      { t: 20.4, type: 'star', lift: 84 },
      { t: 27.8, type: 'checkpoint' },
      { t: 29.4, type: 'mover', style: 'block', at: 'up', amplitude: 128 },
      { t: 30.8, type: 'laser', band: 'high', on: true },
      { t: 32.4, type: 'spike', count: 3 },
      { t: 33.6, type: 'overhead' },
      { t: 34.4, type: 'spike', count: 2 },
      { t: 35.8, type: 'checkpoint' },
      ...seq(37.5, 1.02, ['s2', 's3', 'o', 's3', 'b', 's2', 's3', 's2']),
      { t: 46.0, type: 'checkpoint' },
      { t: 47.6, type: 'pad' },
      { t: 47.88, type: 'star', lift: 200 },
      { t: 50.4, type: 'laser', band: 'low', on: true },
      { t: 51.6, type: 'mover', at: 'down' },
      { t: 52.9, type: 'spike', count: 2 },
      { t: 54.2, type: 'ceiling' },
      { t: 56.2, type: 'checkpoint' },
      ...seq(57.8, 1.02, ['s3', 's2', 'o', 's3', 'b', 's2']),
      { t: 64.0, type: 'spike', count: 3 },
    ],
  },
];
