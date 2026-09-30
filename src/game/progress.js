/**
 * 关卡解锁和星星存档。
 * 累计星星 = 每一关历史最高星数之和。第 1 关默认开放。
 * 这些函数不碰 Phaser，测试可以换一个假的 localStorage。
 */

export const PROGRESS_STORAGE_KEY = 'fangkuai-paoku-progress';

/** 解锁所需的累计星星。顺序和第 1 到第 5 关一致。 */
export const LEVEL_UNLOCKS = [
  { id: 'level-1', stars: 0 },
  { id: 'level-2', stars: 2 },
  { id: 'level-3', stars: 4 },
  { id: 'level-4', stars: 7 },
  { id: 'level-5', stars: 10 },
];

const STARS_PER_LEVEL = 3;

export function emptyProgress() {
  return { best: {} };
}

/** 星数只保留 0 到 3 的整数。非法值当成 0。 */
export function clampStars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(STARS_PER_LEVEL, Math.floor(n)));
}

export function starsRequired(levelId) {
  const row = LEVEL_UNLOCKS.find((item) => item.id === levelId);
  return row ? row.stars : Infinity;
}

/** 某一关记录过的最高星数。没玩过是 0。 */
export function bestStars(progress, levelId) {
  return clampStars(progress?.best?.[levelId]);
}

/** 各关最高星数相加。不认识的关卡 id 不计入，避免脏数据把后面的关提前打开。 */
export function totalBestStars(progress) {
  let sum = 0;
  for (const row of LEVEL_UNLOCKS) {
    sum += bestStars(progress, row.id);
  }
  return sum;
}

/** 还差几颗累计星才能进这一关。已经解锁时是 0。 */
export function starsToUnlock(progress, levelId) {
  return Math.max(0, starsRequired(levelId) - totalBestStars(progress));
}

export function isLevelUnlocked(progress, levelId) {
  return starsToUnlock(progress, levelId) === 0;
}

/**
 * 通关后刷新最高星数。这一局更少不会把记录降下去。
 * 没变化时返回原对象。
 */
export function recordClear(progress, levelId, stars) {
  if (!LEVEL_UNLOCKS.some((row) => row.id === levelId)) return progress || emptyProgress();
  const base = progress?.best ? progress : emptyProgress();
  const next = Math.max(bestStars(base, levelId), clampStars(stars));
  if (next === bestStars(base, levelId)) return base;
  return { best: { ...base.best, [levelId]: next } };
}

function sanitize(raw) {
  const best = {};
  const source = raw && typeof raw === 'object' ? raw.best : null;
  if (!source || typeof source !== 'object') return emptyProgress();
  for (const row of LEVEL_UNLOCKS) {
    if (!(row.id in source)) continue;
    const stars = clampStars(source[row.id]);
    if (stars > 0) best[row.id] = stars;
  }
  return { best };
}

function browserStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** 读进度。坏掉的 JSON、隐私模式都当成全新存档，不抛错。 */
export function loadProgress(storage) {
  const store = storage === undefined ? browserStorage() : storage;
  try {
    const raw = store?.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return emptyProgress();
    return sanitize(JSON.parse(raw));
  } catch {
    return emptyProgress();
  }
}

/** 把进度写回去。写失败时游戏继续，只是这次不记住。 */
export function saveProgress(progress, storage) {
  const store = storage === undefined ? browserStorage() : storage;
  try {
    store?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(sanitize(progress)));
  } catch {
    // 存不进去就只留在这一局里。
  }
}
