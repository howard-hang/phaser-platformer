import { describe, expect, it } from 'vitest';
import {
  LEVEL_UNLOCKS,
  bestStars,
  emptyProgress,
  isLevelUnlocked,
  loadProgress,
  recordClear,
  saveProgress,
  starsRequired,
  starsToUnlock,
  totalBestStars,
} from '../src/game/progress.js';

function memoryStorage() {
  const memory = new Map();
  return {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
  };
}

describe('星星解锁', () => {
  it('解锁门槛是 0、2、4、7、10', () => {
    expect(LEVEL_UNLOCKS.map((row) => row.stars)).toEqual([0, 2, 4, 7, 10]);
    expect(starsRequired('level-1')).toBe(0);
    expect(starsRequired('level-2')).toBe(2);
    expect(starsRequired('level-3')).toBe(4);
    expect(starsRequired('level-4')).toBe(7);
    expect(starsRequired('level-5')).toBe(10);
  });

  it('新存档只能进第 1 关', () => {
    const progress = emptyProgress();
    expect(isLevelUnlocked(progress, 'level-1')).toBe(true);
    expect(isLevelUnlocked(progress, 'level-2')).toBe(false);
    expect(starsToUnlock(progress, 'level-2')).toBe(2);
    expect(starsToUnlock(progress, 'level-5')).toBe(10);
    expect(totalBestStars(progress)).toBe(0);
  });

  it('累计最高星达到门槛才解锁，重玩更低的星数不会倒扣', () => {
    let progress = emptyProgress();
    progress = recordClear(progress, 'level-1', 1);
    expect(totalBestStars(progress)).toBe(1);
    expect(isLevelUnlocked(progress, 'level-2')).toBe(false);
    expect(starsToUnlock(progress, 'level-2')).toBe(1);

    progress = recordClear(progress, 'level-1', 2);
    expect(isLevelUnlocked(progress, 'level-2')).toBe(true);
    expect(isLevelUnlocked(progress, 'level-3')).toBe(false);

    progress = recordClear(progress, 'level-1', 0);
    expect(bestStars(progress, 'level-1')).toBe(2);

    progress = recordClear(progress, 'level-2', 2);
    expect(totalBestStars(progress)).toBe(4);
    expect(isLevelUnlocked(progress, 'level-3')).toBe(true);
    expect(isLevelUnlocked(progress, 'level-4')).toBe(false);

    progress = recordClear(progress, 'level-3', 3);
    expect(totalBestStars(progress)).toBe(7);
    expect(isLevelUnlocked(progress, 'level-4')).toBe(true);
    expect(isLevelUnlocked(progress, 'level-5')).toBe(false);
    expect(starsToUnlock(progress, 'level-5')).toBe(3);

    progress = recordClear(progress, 'level-4', 3);
    expect(totalBestStars(progress)).toBe(10);
    expect(isLevelUnlocked(progress, 'level-5')).toBe(true);
  });

  it('只加各关最高分，同一关拿满也不会重复累计', () => {
    let progress = recordClear(emptyProgress(), 'level-1', 3);
    progress = recordClear(progress, 'level-1', 3);
    expect(totalBestStars(progress)).toBe(3);
    expect(isLevelUnlocked(progress, 'level-5')).toBe(false);
  });

  it('单关最多记 3 颗，非法星数忽略', () => {
    const progress = recordClear(emptyProgress(), 'level-1', 9);
    expect(bestStars(progress, 'level-1')).toBe(3);
    expect(bestStars(recordClear(emptyProgress(), 'level-1', -4), 'level-1')).toBe(0);
  });
});

describe('星星存档', () => {
  it('写进 localStorage 后重新读出来还在', () => {
    const storage = memoryStorage();
    expect(loadProgress(storage)).toEqual({ best: {} });
    const progress = recordClear(recordClear(emptyProgress(), 'level-1', 3), 'level-2', 1);
    saveProgress(progress, storage);
    const loaded = loadProgress(storage);
    expect(bestStars(loaded, 'level-1')).toBe(3);
    expect(bestStars(loaded, 'level-2')).toBe(1);
    expect(totalBestStars(loaded)).toBe(4);
    expect(isLevelUnlocked(loaded, 'level-3')).toBe(true);
  });

  it('坏数据和写失败都不把游戏弄崩', () => {
    const brokenRead = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    };
    expect(loadProgress(brokenRead)).toEqual({ best: {} });
    expect(() => saveProgress(emptyProgress(), brokenRead)).not.toThrow();

    const junk = {
      getItem: () => '{',
      setItem() {},
    };
    expect(loadProgress(junk)).toEqual({ best: {} });

    const dirty = {
      getItem: () => JSON.stringify({ best: { 'level-1': 2.8, 'level-9': 3, nope: 5 } }),
      setItem() {},
    };
    const loaded = loadProgress(dirty);
    expect(bestStars(loaded, 'level-1')).toBe(2);
    expect(totalBestStars(loaded)).toBe(2);
  });
});
