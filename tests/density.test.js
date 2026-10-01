import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_UNLOCKS, levelTuning } from '../src/game/level.js';
import { FINISH_APPROACH_MAX, FINISH_APPROACH_MIN, eventBreathCount, eventComboStats, eventIdleStats, finishApproachSeconds, levelMetrics } from '../src/game/metrics.js';
import { TUNING } from '../src/logic/world.js';
import { auditLevel } from '../src/logic/audit.js';
import { findClearPath } from '../src/logic/search.js';

const baseline = JSON.parse(readFileSync(new URL('../scripts/baseline-difficulty.json', import.meta.url), 'utf8'));
const pr9 = JSON.parse(readFileSync(new URL('../scripts/baseline-pr9-density.json', import.meta.url), 'utf8'));
const levelDir = new URL('../src/levels/', import.meta.url);

function loadDef(index) {
  const name = `level-${String(index).padStart(2, '0')}.json`;
  return JSON.parse(readFileSync(new URL(name, levelDir), 'utf8'));
}

describe('障碍加密', () => {
  it('跑速、重力和起跳都没变，解锁门槛也没变', () => {
    expect(TUNING.gravity).toBe(1700);
    expect(TUNING.jumpVelocity).toBe(-740);
    expect(baseline).toHaveLength(20);
    expect(LEVEL_UNLOCKS.map((row) => row.stars)).toEqual(baseline.map((row) => row.unlockStars));
    for (let i = 0; i < LEVELS.length; i += 1) {
      const level = LEVELS[i];
      const before = baseline[i];
      const tuning = levelTuning(level);
      expect(level.speed).toBe(before.speed);
      expect(tuning.speed).toBe(before.speed);
      expect(tuning.gravity).toBe(TUNING.gravity);
      expect(tuning.jumpVelocity).toBe(TUNING.jumpVelocity);
      expect(loadDef(i + 1).name).toBe(before.name);
      const approach = finishApproachSeconds(level, tuning);
      expect(approach).toBeGreaterThanOrEqual(FINISH_APPROACH_MIN);
      expect(approach).toBeLessThanOrEqual(FINISH_APPROACH_MAX);
    }
  });

  it('地面空闲大约是 PR #9 之后的一半，前几关留得更多', () => {
    const ratios = LEVELS.map((level, index) => {
      const idle = eventIdleStats(loadDef(index + 1)).avgIdle;
      const before = pr9[index].avgIdle;
      const metrics = levelMetrics(level);
      expect(metrics.obstacles).toBeGreaterThan(pr9[index].obstacles);
      expect(metrics.avgGap).toBeLessThan(pr9[index].avgGap);
      return idle / before;
    });
    const mean = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
    expect(mean).toBeGreaterThanOrEqual(0.45);
    expect(mean).toBeLessThanOrEqual(0.62);
    const early = ratios.slice(0, 4).reduce((sum, value) => sum + value, 0) / 4;
    const late = ratios.slice(14).reduce((sum, value) => sum + value, 0) / 6;
    expect(early).toBeGreaterThanOrEqual(0.52);
    expect(early).toBeLessThanOrEqual(0.7);
    expect(late).toBeLessThanOrEqual(0.58);
    for (const ratio of ratios) {
      expect(ratio).toBeLessThanOrEqual(0.7);
      expect(ratio).toBeGreaterThan(0.4);
    }
  });

  it('每关都有喘息，后期的连续组合更多也更长', () => {
    const stats = LEVELS.map((_, index) => eventComboStats(loadDef(index + 1)));
    const breaths = LEVELS.map((_, index) => eventBreathCount(loadDef(index + 1)));
    for (const count of breaths) expect(count).toBeGreaterThanOrEqual(2);
    for (const combo of stats) expect(combo.count).toBeGreaterThanOrEqual(2);
    const earlyCount = stats.slice(0, 6).reduce((sum, combo) => sum + combo.count, 0);
    const lateCount = stats.slice(14).reduce((sum, combo) => sum + combo.count, 0);
    const earlyMax = Math.max(...stats.slice(0, 6).map((combo) => combo.max));
    const lateMax = Math.max(...stats.slice(14).map((combo) => combo.max));
    expect(lateCount).toBeGreaterThan(earlyCount);
    expect(lateMax).toBeGreaterThan(earlyMax);
    expect(stats[0].max).toBeLessThanOrEqual(5);
    expect(stats[19].max).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < LEVELS.length; i += 1) {
      expect(eventIdleStats(loadDef(i + 1)).combos).toBeGreaterThan(pr9[i].combos);
    }
  });

  it.each(LEVELS.map((level) => [level.id, level]))('%s 加密后仍能无伤通关并捡满星星', (_id, level) => {
    const tuning = levelTuning(level);
    const problems = auditLevel(level, tuning);
    expect(problems, problems.join('\n')).toEqual([]);
    const result = findClearPath(level, tuning);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.stars).toBe(3);
  });
});
