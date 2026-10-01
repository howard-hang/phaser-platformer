import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_UNLOCKS, levelTuning } from '../src/game/level.js';
import { FINISH_APPROACH_MAX, FINISH_APPROACH_MIN, eventBreathCount, eventComboStats, finishApproachSeconds, levelMetrics } from '../src/game/metrics.js';
import { TUNING } from '../src/logic/world.js';
import { auditLevel } from '../src/logic/audit.js';
import { findClearPath } from '../src/logic/search.js';

const baseline = JSON.parse(readFileSync(new URL('../scripts/baseline-difficulty.json', import.meta.url), 'utf8'));
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

  it('平均间距缩短大约 25% 到 35%，越往后缩得越多', () => {
    const cuts = LEVELS.map((level, index) => 1 - levelMetrics(level).avgGap / baseline[index].avgGap);
    const mean = cuts.reduce((sum, value) => sum + value, 0) / cuts.length;
    expect(mean).toBeGreaterThanOrEqual(0.25);
    expect(mean).toBeLessThanOrEqual(0.35);
    for (const cut of cuts) expect(cut).toBeGreaterThan(0.15);
    const early = cuts.slice(0, 6).reduce((sum, value) => sum + value, 0) / 6;
    const late = cuts.slice(14).reduce((sum, value) => sum + value, 0) / 6;
    expect(late).toBeGreaterThan(early);
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
    expect(stats[0].max).toBeLessThanOrEqual(3);
    expect(stats[19].max).toBeGreaterThanOrEqual(3);
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
