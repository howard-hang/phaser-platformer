/**
 * 关卡 JSON 的校验。规则和 src/levels/level.schema.json 对齐。
 * 不引入 ajv，配置坏了就抛出带文件名和字段路径的中文错误，避免白屏。
 */
import { LEVEL_PALETTES } from './theme.js';

const OBSTACLE_TYPES = ['spike', 'block', 'overhead', 'crumble', 'gate', 'flip'];

function fail(file, path, message) {
  const where = path ? ` ${path}` : '';
  throw new Error(`关卡配置错误 ${file}${where}: ${message}`);
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function expectNumber(file, path, value, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(file, path, `应该是有限数字，实际是 ${JSON.stringify(value)}`);
  }
  if (exclusiveMin ? value <= min : value < min) {
    fail(file, path, `不能小于 ${min}，实际是 ${value}`);
  }
  if (value > max) fail(file, path, `不能大于 ${max}，实际是 ${value}`);
}

function expectKeys(file, path, value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(file, path, `不认识的字段 ${key}`);
  }
}

/** 校验单个关卡对象。通过后原样返回。 */
export function validateLevel(level, file = 'level.json') {
  if (!isObject(level)) fail(file, '', '关卡应该是一个对象');
  expectKeys(file, '', level, ['id', 'name', 'speed', 'duration', 'palette', 'obstacles', 'stars', 'checkpoints']);
  for (const key of ['id', 'name', 'speed', 'duration', 'palette', 'obstacles', 'stars', 'checkpoints']) {
    if (!(key in level)) fail(file, '', `缺少字段 ${key}`);
  }
  if (typeof level.id !== 'string' || !/^level-[1-9][0-9]*$/.test(level.id)) {
    fail(file, 'id', '应该是 level-1 这种形式');
  }
  if (typeof level.name !== 'string' || level.name.trim() === '') {
    fail(file, 'name', '关卡名不能为空');
  }
  expectNumber(file, 'speed', level.speed, { min: 0, max: 520, exclusiveMin: true });
  expectNumber(file, 'duration', level.duration, { min: 60, max: 90 });
  if (typeof level.palette !== 'string' || !LEVEL_PALETTES.some((item) => item.id === level.palette)) {
    const known = LEVEL_PALETTES.map((item) => item.id).join('、');
    fail(file, 'palette', `未知配色 ${JSON.stringify(level.palette)}。可用：${known}`);
  }
  if (!Array.isArray(level.obstacles)) fail(file, 'obstacles', '应该是数组');
  level.obstacles.forEach((item, index) => validateObstacle(item, file, `obstacles[${index}]`));
  if (!Array.isArray(level.stars) || level.stars.length !== 3) {
    fail(file, 'stars', '每关正好 3 颗星星');
  }
  level.stars.forEach((item, index) => validateStar(item, file, `stars[${index}]`));
  if (!Array.isArray(level.checkpoints)) fail(file, 'checkpoints', '应该是数组');
  level.checkpoints.forEach((item, index) => {
    expectNumber(file, `checkpoints[${index}]`, item, { min: 0 });
  });
  const lastObstacle = level.obstacles.reduce((max, item) => Math.max(max, item.t), 0);
  if (lastObstacle >= level.duration) {
    fail(file, 'obstacles', '有障碍的时间不早于终点');
  }
  for (const star of level.stars) {
    if (star.t >= level.duration) fail(file, 'stars', '有星星的时间不早于终点');
  }
  return level;
}

function validateObstacle(item, file, path) {
  if (!isObject(item)) fail(file, path, '障碍应该是对象');
  expectKeys(file, path, item, ['t', 'type', 'count', 'anchor', 'gap', 'span', 'delay', 'period', 'open', 'phase']);
  if (!('t' in item) || !('type' in item)) fail(file, path, '缺少 t 或 type');
  expectNumber(file, `${path}.t`, item.t, { min: 0 });
  if (!OBSTACLE_TYPES.includes(item.type)) {
    fail(file, `${path}.type`, `未知类型 ${JSON.stringify(item.type)}。可用：${OBSTACLE_TYPES.join('、')}`);
  }
  if ('count' in item) {
    if (item.type !== 'spike') fail(file, `${path}.count`, '只有尖刺可以写 count');
    if (!Number.isInteger(item.count)) fail(file, `${path}.count`, '应该是整数');
    expectNumber(file, `${path}.count`, item.count, { min: 1, max: 6 });
  }
  if ('anchor' in item) {
    if (item.type !== 'spike') fail(file, `${path}.anchor`, '只有尖刺可以写 anchor');
    if (item.anchor !== 'floor' && item.anchor !== 'ceiling') {
      fail(file, `${path}.anchor`, '只能是 floor 或 ceiling');
    }
  }
  if ('gap' in item) {
    if (item.type !== 'overhead') fail(file, `${path}.gap`, '只有倒挂方块可以写 gap');
    expectNumber(file, `${path}.gap`, item.gap, { min: 48, max: 120 });
  }
  if ('span' in item) {
    if (item.type !== 'crumble' && item.type !== 'flip') {
      fail(file, `${path}.span`, '只有坠落平台和重力反转可以写 span');
    }
    expectNumber(file, `${path}.span`, item.span, { min: 0, max: 8, exclusiveMin: true });
  }
  if ('delay' in item) {
    if (item.type !== 'crumble') fail(file, `${path}.delay`, '只有坠落平台可以写 delay');
    expectNumber(file, `${path}.delay`, item.delay, { min: 0, max: 3, exclusiveMin: true });
  }
  if ('period' in item) {
    if (item.type !== 'gate') fail(file, `${path}.period`, '只有周期门可以写 period');
    expectNumber(file, `${path}.period`, item.period, { min: 0.2, max: 6, exclusiveMin: true });
  }
  if ('open' in item) {
    if (item.type !== 'gate') fail(file, `${path}.open`, '只有周期门可以写 open');
    expectNumber(file, `${path}.open`, item.open, { min: 0, max: 6, exclusiveMin: true });
  }
  if ('phase' in item) {
    if (item.type !== 'gate') fail(file, `${path}.phase`, '只有周期门可以写 phase');
    expectNumber(file, `${path}.phase`, item.phase);
  }
  if (item.type === 'crumble' && (!('span' in item) || !('delay' in item))) {
    fail(file, path, '坠落平台需要 span 和 delay');
  }
  if (item.type === 'gate') {
    if (!('period' in item) || !('open' in item)) fail(file, path, '周期门需要 period 和 open');
    if (item.open >= item.period) fail(file, `${path}.open`, '开门时间必须短于整段周期');
  }
  if (item.type === 'flip' && !('span' in item)) fail(file, path, '重力反转需要 span');
  if (item.anchor === 'ceiling' && item.type === 'spike' && (item.count || 1) > 4) {
    fail(file, `${path}.count`, '天花板尖刺一次最多 4 个');
  }
}

function validateStar(item, file, path) {
  if (!isObject(item)) fail(file, path, '星星应该是对象');
  expectKeys(file, path, item, ['t', 'lift', 'dx']);
  if (!('t' in item)) fail(file, path, '缺少 t');
  expectNumber(file, `${path}.t`, item.t, { min: 0 });
  if ('lift' in item) expectNumber(file, `${path}.lift`, item.lift, { min: 0, max: 200 });
  if ('dx' in item) expectNumber(file, `${path}.dx`, item.dx, { min: -400, max: 400 });
}

/** 校验清单：顺序、文件名、解锁门槛。files 是已加载关卡文件名到内容的映射。 */
export function validateManifest(manifest, files) {
  const file = 'manifest.json';
  if (!isObject(manifest) || !Array.isArray(manifest.levels) || manifest.levels.length === 0) {
    fail(file, '', '需要 levels 数组，里面按顺序写下每一关');
  }
  expectKeys(file, '', manifest, ['levels']);
  const seen = new Set();
  manifest.levels.forEach((row, index) => {
    const path = `levels[${index}]`;
    if (!isObject(row)) fail(file, path, '应该是对象');
    expectKeys(file, path, row, ['file', 'unlockStars']);
    if (typeof row.file !== 'string' || !/^level-\d{2}\.json$/.test(row.file)) {
      fail(file, `${path}.file`, '文件名应该是 level-01.json 这种形式');
    }
    if (seen.has(row.file)) fail(file, `${path}.file`, `重复登记 ${row.file}`);
    seen.add(row.file);
    if (!files[row.file]) fail(file, `${path}.file`, `找不到 ${row.file}。新增关卡时要同时放入这个 JSON`);
    if (!Number.isInteger(row.unlockStars) || row.unlockStars < 0) {
      fail(file, `${path}.unlockStars`, '解锁门槛应该是大于等于 0 的整数');
    }
    if (index === 0 && row.unlockStars !== 0) fail(file, `${path}.unlockStars`, '第 1 关必须是 0 颗星就开放');
    if (index > 0 && row.unlockStars <= manifest.levels[index - 1].unlockStars) {
      fail(file, `${path}.unlockStars`, '解锁门槛要一关比一关高');
    }
  });
  return manifest;
}
