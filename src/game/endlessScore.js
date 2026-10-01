/**
 * 无尽模式的本机纪录。只记最远距离，不联网，也不和闯关星数混在一个 key 里。
 */

export const ENDLESS_STORAGE_KEY = 'fangkuai-paoku-endless';

/** 40 像素算 1 米，和闯关分数的换算相同，数字不会一下冲到几万。 */
export const PX_PER_METER = 40;

export function distanceMeters(distancePx) {
  if (!Number.isFinite(distancePx)) return 0;
  return Math.max(0, Math.floor(distancePx / PX_PER_METER));
}

export function emptyEndlessRecord() {
  return { best: 0 };
}

function browserStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function sanitize(raw) {
  const best = Number(raw?.best);
  if (!Number.isFinite(best) || best <= 0) return emptyEndlessRecord();
  return { best: Math.floor(best) };
}

/** 读最高纪录。坏数据或隐私模式都当成还没有纪录。 */
export function loadEndlessRecord(storage) {
  const store = storage === undefined ? browserStorage() : storage;
  try {
    const raw = store?.getItem(ENDLESS_STORAGE_KEY);
    if (!raw) return emptyEndlessRecord();
    return sanitize(JSON.parse(raw));
  } catch {
    return emptyEndlessRecord();
  }
}

/**
 * 本局结束时比较距离。只有更远才覆盖纪录。
 * 返回刷新后的纪录，以及这次有没有打破。
 */
export function commitEndlessRecord(meters, storage) {
  const distance = Math.max(0, Math.floor(Number(meters) || 0));
  const current = loadEndlessRecord(storage);
  const improved = distance > current.best;
  const next = improved ? { best: distance } : current;
  if (improved) {
    const store = storage === undefined ? browserStorage() : storage;
    try {
      store?.setItem(ENDLESS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 写不进去就只在这一局里显示。
    }
  }
  return { best: next.best, improved, distance };
}
