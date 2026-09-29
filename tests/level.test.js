import { describe, expect, it } from 'vitest';
import { LEVEL } from '../src/game/level.js';
import { TUNING } from '../src/logic/world.js';
import { auditLevel } from '../src/logic/audit.js';
import { simulateRun } from '../src/logic/simulate.js';

describe('第一关', () => {
  it('时长、存档点和星星摆放都合格', () => {
    const problems = auditLevel(LEVEL, TUNING);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('按固定手感可以在 60 到 90 秒内无伤跑完，并捡到星星', () => {
    const result = simulateRun(LEVEL, TUNING);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.t).toBeGreaterThanOrEqual(60);
    expect(result.t).toBeLessThanOrEqual(90);
    expect(result.stars).toBe(LEVEL.stars.length);
    expect(LEVEL.stars.length).toBeGreaterThanOrEqual(8);
  });
});
