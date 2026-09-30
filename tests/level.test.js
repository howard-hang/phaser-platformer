import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_UNLOCKS, levelTuning } from '../src/game/level.js';
import { levelMetrics } from '../src/game/metrics.js';
import { TUNING } from '../src/logic/world.js';
import { auditLevel } from '../src/logic/audit.js';
import { findClearPath } from '../src/logic/search.js';

describe('二十关都能通关', () => {
  it('一共 20 关，速度递增，跳跃手感不变', () => {
    expect(LEVELS).toHaveLength(20);
    expect(LEVELS.map((level) => level.id)).toEqual(LEVEL_UNLOCKS.map((row) => row.id));
    expect(TUNING.gravity).toBe(1700);
    expect(TUNING.jumpVelocity).toBe(-740);
    for (let i = 0; i < LEVELS.length; i += 1) {
      const level = LEVELS[i];
      const tuning = levelTuning(level);
      expect(tuning.gravity).toBe(TUNING.gravity);
      expect(tuning.jumpVelocity).toBe(TUNING.jumpVelocity);
      expect(level.stars).toHaveLength(3);
      expect(level.speed).toBeGreaterThan(300);
      if (i > 0) expect(level.speed).toBeGreaterThan(LEVELS[i - 1].speed);
    }
    expect(new Set(LEVELS.map((level) => level.palette)).size).toBe(20);
    // 第 1 关比原来的第 1 关（速度 300、大约 22 个障碍）更密、更快。
    expect(LEVELS[0].obstacles.length).toBeGreaterThan(22);
  });

  it('障碍变多、间隔变小、种类随关卡展开', () => {
    const metrics = LEVELS.map((level) => levelMetrics(level));
    for (let i = 1; i < metrics.length; i += 1) {
      expect(metrics[i].obstacles).toBeGreaterThan(metrics[i - 1].obstacles);
      expect(metrics[i].avgGap).toBeLessThan(metrics[i - 1].avgGap);
      expect(metrics[i].speed).toBeGreaterThan(metrics[i - 1].speed);
    }
    const typesOf = (index) => new Set(LEVELS[index].obstacles.map((item) => item.type));
    expect(typesOf(0).has('crumble')).toBe(false);
    expect(typesOf(4).has('crumble')).toBe(true);
    expect(typesOf(7).has('gate')).toBe(true);
    expect(typesOf(11).has('flip')).toBe(true);
    expect(typesOf(12).has('cspike')).toBe(true);
    expect(typesOf(19).size).toBeGreaterThan(typesOf(0).size);
  });

  it.each(LEVELS.map((level) => [level.id, level]))('%s 结构合格，并且存在能捡完全部星星的路径', (_id, level) => {
    const tuning = levelTuning(level);
    const problems = auditLevel(level, tuning);
    expect(problems, problems.join('\n')).toEqual([]);
    const result = findClearPath(level, tuning);
    const at = ((result.bestX - level.startX) / level.speed).toFixed(2);
    expect(result.ok, `${JSON.stringify({ ...result, at })}`).toBe(true);
    expect(result.stars).toBe(3);
    const duration = (level.finishX - level.startX) / level.speed;
    expect(duration).toBeGreaterThanOrEqual(60);
    expect(duration).toBeLessThanOrEqual(90);
  });
});

describe('路径搜索本身', () => {
  it('空旷跑道上的地面星和空中星都能捡到', () => {
    const speed = 300;
    const startX = 240;
    const xAt = (t) => startX + t * speed;
    const level = {
      id: 'toy',
      startX,
      finishX: xAt(8),
      speed,
      obstacles: [{ id: 's', type: 'spike', x: xAt(4) }],
      stars: [
        { id: 'ground', x: xAt(1.2), lift: 0 },
        { id: 'air', x: xAt(4.15), lift: 80 },
      ],
      checkpoints: [startX],
      flips: [],
    };
    const result = findClearPath(level, { ...TUNING, speed });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.stars).toBe(2);
  });

  it('尖刺地毯没有活路', () => {
    const startX = 240;
    const obstacles = [];
    for (let i = 0; i < 40; i += 1) {
      obstacles.push({ id: `s-${i}`, type: 'spike', x: 900 + i * 36 });
    }
    const level = {
      id: 'wall',
      startX,
      finishX: 900 + 40 * 36 + 400,
      speed: 300,
      obstacles,
      stars: [{ id: 'g', x: 400, lift: 0 }],
      checkpoints: [startX],
      flips: [],
    };
    const result = findClearPath(level, TUNING);
    expect(result.ok).toBe(false);
  });
});
