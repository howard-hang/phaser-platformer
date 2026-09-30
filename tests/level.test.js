import { describe, expect, it } from 'vitest';
import { LEVELS, levelTuning } from '../src/game/level.js';
import { LEVEL_UNLOCKS } from '../src/game/progress.js';
import { TUNING } from '../src/logic/world.js';
import { auditLevel } from '../src/logic/audit.js';
import { findClearPath } from '../src/logic/search.js';

describe('五关都能通关', () => {
  it('一共 5 关，速度小幅递增，跳跃手感不变', () => {
    expect(LEVELS).toHaveLength(5);
    expect(LEVELS.map((level) => level.id)).toEqual(LEVEL_UNLOCKS.map((row) => row.id));
    expect(TUNING.gravity).toBe(1700);
    expect(TUNING.jumpVelocity).toBe(-740);
    for (let i = 0; i < LEVELS.length; i += 1) {
      const level = LEVELS[i];
      const tuning = levelTuning(level);
      expect(tuning.gravity).toBe(TUNING.gravity);
      expect(tuning.jumpVelocity).toBe(TUNING.jumpVelocity);
      expect(level.stars).toHaveLength(3);
      expect(level.speed).toBeGreaterThan(290);
      if (i > 0) expect(level.speed).toBeGreaterThan(LEVELS[i - 1].speed);
    }
    expect(LEVELS[4].speed).toBeLessThan(LEVELS[0].speed * 1.25);
    expect(new Set(LEVELS.map((level) => level.palette)).size).toBe(5);
  });

  it('越往后障碍越多，尖刺也更密', () => {
    const density = (level) => {
      const spikes = level.obstacles.filter((item) => item.type === 'spike').length;
      return spikes / ((level.finishX - level.startX) / level.speed);
    };
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i].obstacles.length).toBeGreaterThan(LEVELS[i - 1].obstacles.length);
      expect(density(LEVELS[i])).toBeGreaterThan(density(LEVELS[i - 1]));
    }
  });

  it.each(LEVELS.map((level) => [level.id, level]))('%s 结构合格，并且存在能捡完全部星星的路径', (_id, level) => {
    const tuning = levelTuning(level);
    const problems = auditLevel(level, tuning);
    expect(problems, problems.join('\n')).toEqual([]);
    const result = findClearPath(level, tuning);
    const at = ((result.bestX - level.startX) / level.speed).toFixed(2);
    expect(result.ok, `${JSON.stringify({ ...result, at })}`).toBe(true);
    expect(result.stars).toBe(3);
    expect(result.t ?? result.bestX).toBeTruthy();
    const duration = (level.finishX - level.startX) / level.speed;
    expect(duration).toBeGreaterThanOrEqual(60);
    expect(duration).toBeLessThanOrEqual(90);
  });
});

describe('新障碍先单独教，再和其他障碍组合', () => {
  function nearestGap(level, x) {
    let best = Infinity;
    for (const obstacle of level.obstacles) {
      const gap = Math.abs(obstacle.x - x) / level.speed;
      if (gap > 0.05 && gap < best) best = gap;
    }
    for (const pad of level.pads) {
      const gap = Math.abs(pad.x - x) / level.speed;
      if (gap > 0.05 && gap < best) best = gap;
    }
    return best;
  }

  it('第 1 关只教倒挂刺和跳板，第 2 关才出现移动障碍，第 3 关才出现激光', () => {
    const types = (level) => new Set(level.obstacles.map((item) => item.type));
    expect(types(LEVELS[0]).has('ceiling')).toBe(true);
    expect(LEVELS[0].pads.length).toBeGreaterThan(0);
    expect(types(LEVELS[0]).has('mover')).toBe(false);
    expect(types(LEVELS[0]).has('laser')).toBe(false);
    expect(types(LEVELS[1]).has('mover')).toBe(true);
    expect(types(LEVELS[1]).has('laser')).toBe(false);
    expect(types(LEVELS[2]).has('laser')).toBe(true);
    expect(types(LEVELS[3]).has('laser')).toBe(true);
    expect(types(LEVELS[3]).has('mover')).toBe(true);
    expect(types(LEVELS[4]).has('ceiling')).toBe(true);
    expect(LEVELS[4].pads.length).toBeGreaterThan(0);
  });

  it('每种新障碍第一次出现时，前后都留出认识它的空档', () => {
    const firstCeiling = LEVELS[0].obstacles.find((item) => item.type === 'ceiling');
    const firstMover = LEVELS[1].obstacles.find((item) => item.type === 'mover');
    const firstLaser = LEVELS[2].obstacles.find((item) => item.type === 'laser');
    expect(nearestGap(LEVELS[0], firstCeiling.x)).toBeGreaterThan(1.6);
    expect(nearestGap(LEVELS[0], LEVELS[0].pads[0].x)).toBeGreaterThan(1.6);
    expect(nearestGap(LEVELS[1], firstMover.x)).toBeGreaterThan(1.6);
    expect(nearestGap(LEVELS[2], firstLaser.x)).toBeGreaterThan(1.6);
  });

  it('后面的关卡会把不同的新障碍排在同一次冲刺里', () => {
    const mixed = LEVELS[4].obstacles.filter((item) => item.type === 'laser' || item.type === 'mover' || item.type === 'ceiling');
    let close = false;
    for (let i = 0; i < mixed.length; i += 1) {
      for (let j = i + 1; j < mixed.length; j += 1) {
        if (mixed[i].type === mixed[j].type) continue;
        const gap = Math.abs(mixed[i].x - mixed[j].x) / LEVELS[4].speed;
        if (gap < 2.2) close = true;
      }
    }
    expect(close).toBe(true);
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
    };
    const result = findClearPath(level, TUNING);
    expect(result.ok).toBe(false);
  });
});
