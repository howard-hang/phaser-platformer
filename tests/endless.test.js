/**
 * 无尽模式的跑道。
 * 多颗种子、多档跑速都要能跑通；跑过的片段要回收；纪录只在更远时覆盖。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { getLevel, levelTuning } from '../src/game/level.js';
import {
  ENDLESS_CURVE,
  SAFE_GAP,
  chainLength,
  endlessSpeed,
} from '../src/game/endlessCurve.js';
import {
  START_X,
  buildEndlessLevel,
  createEndlessStream,
  ensureAhead,
  offerEndlessPower,
  playableSegments,
  recycleBehind,
} from '../src/game/endlessCourse.js';
import { POWERUP_CONFIG } from '../src/game/powerupConfig.js';
import { obstacleIntervalX } from '../src/logic/powerups.js';
import {
  PX_PER_METER,
  commitEndlessRecord,
  distanceMeters,
  loadEndlessRecord,
} from '../src/game/endlessScore.js';
import { findClearPath } from '../src/logic/search.js';
import { TUNING } from '../src/logic/world.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

describe('无尽跑道', () => {
  // 可玩片段要按每个起步相位做可达性搜索。这段只在第一次发生，CI 上大约 5 秒，
  // 不能算进默认 5 秒的用例时限里。筛完之后，同文件里的长跑道模拟都复用结果。
  beforeAll(() => {
    playableSegments();
  }, 120000);

  it('闯关的重力、跳跃和关卡速度都不改', () => {
    expect(TUNING.gravity).toBe(1700);
    expect(TUNING.jumpVelocity).toBe(-740);
    const level = getLevel('level-1');
    expect(levelTuning(level).speed).toBe(level.speed);
    expect(level.speedBands).toBeUndefined();
    expect(getLevel('level-20').speed).toBeGreaterThan(level.speed);
  });

  it('开头是热身空地，跑速随距离上升并封顶', () => {
    expect(endlessSpeed(0)).toBe(ENDLESS_CURVE.baseSpeed);
    expect(endlessSpeed(ENDLESS_CURVE.warmupDistance)).toBe(ENDLESS_CURVE.baseSpeed);
    const topped = ENDLESS_CURVE.warmupDistance + ENDLESS_CURVE.rampDistance;
    expect(endlessSpeed(topped)).toBe(ENDLESS_CURVE.maxSpeed);
    expect(endlessSpeed(topped + 8000)).toBe(ENDLESS_CURVE.maxSpeed);
    expect(endlessSpeed(topped / 2)).toBeGreaterThan(ENDLESS_CURVE.baseSpeed);
    expect(endlessSpeed(topped / 2)).toBeLessThan(ENDLESS_CURVE.maxSpeed);
    expect(chainLength(0)).toBe(ENDLESS_CURVE.chainStart);
    expect(chainLength(topped)).toBe(ENDLESS_CURVE.chainEnd);

    const level = buildEndlessLevel({ seed: 3, distance: 8000 });
    const introEnd = START_X + ENDLESS_CURVE.introSeconds * ENDLESS_CURVE.baseSpeed;
    const early = level.obstacles.filter((obstacle) => obstacle.x < introEnd - 4);
    expect(early).toEqual([]);
    for (const piece of level.pieces) {
      if (piece.intro) continue;
      if (piece.x0 - START_X < ENDLESS_CURVE.warmupDistance) {
        expect(piece.tier, piece.segmentId).toBe(0);
      }
    }
  }, 60000);

  it('多颗种子在难度曲线和各跑速档位上都能跑通', () => {
    const cases = [
      { seed: 1, distance: 52000 },
      { seed: 2, distance: 52000 },
      { seed: 4, distance: 52000 },
      { seed: 7, distance: 52000 },
      { seed: 8, distance: 36000, speedLock: 318 },
      { seed: 11, distance: 36000, speedLock: 366 },
      { seed: 13, distance: 36000, speedLock: 414 },
      { seed: 15, distance: 36000, speedLock: 468 },
    ];
    const library = new Map(playableSegments().map((segment) => [segment.id, segment]));
    for (const item of cases) {
      const level = buildEndlessLevel(item);
      const cap = item.speedLock ?? ENDLESS_CURVE.maxSpeed;
      let previous = 0;
      for (const band of level.speedBands) {
        expect(band.speed, `seed ${item.seed}`).toBeGreaterThanOrEqual(previous - 0.05);
        expect(band.speed).toBeLessThanOrEqual(cap + 0.05);
        expect(band.speed).toBeGreaterThanOrEqual(ENDLESS_CURVE.baseSpeed - 0.05);
        previous = band.speed;
      }
      if (item.speedLock) {
        expect(level.speedBands.every((band) => Math.abs(band.speed - item.speedLock) < 0.05)).toBe(true);
      } else {
        expect(level.speedBands[level.speedBands.length - 1].speed).toBe(ENDLESS_CURVE.maxSpeed);
      }
      for (const piece of level.pieces) {
        if (piece.intro) continue;
        const source = library.get(piece.segmentId);
        expect(source, piece.segmentId).toBeTruthy();
        expect(source.sourceSpeed, piece.segmentId).toBeLessThanOrEqual(piece.speed + 0.05);
        const gapSpeed = item.speedLock ?? endlessSpeed(piece.contentX1 - START_X);
        const gapTime = (piece.x1 - piece.contentX1) / gapSpeed;
        expect(gapTime, piece.segmentId).toBeGreaterThanOrEqual(SAFE_GAP - 0.02);
      }
      const tuning = { ...TUNING, speed: item.speedLock || ENDLESS_CURVE.baseSpeed };
      const result = findClearPath(level, tuning, { needStars: false });
      expect(result.ok, `seed ${item.seed} 在 x=${Math.round(result.bestX)} 走不通`).toBe(true);
    }
  }, 120000);

  it('跑过的片段会回收，同时存在的段有上限', () => {
    const stream = createEndlessStream(5);
    let maxLive = 0;
    let dropped = 0;
    for (let x = START_X; x < START_X + 80000; x += 400) {
      ensureAhead(stream, x + 2600);
      const gone = recycleBehind(stream, x - 1800);
      dropped += gone.length;
      maxLive = Math.max(maxLive, stream.live.length);
      for (const piece of gone) {
        expect(stream.live.includes(piece)).toBe(false);
      }
    }
    expect(maxLive).toBeLessThanOrEqual(16);
    expect(dropped).toBeGreaterThan(10);
    expect(stream.kept).toBeNull();
    expect(stream.live.length).toBeGreaterThan(0);
  }, 60000);

  it('同一颗种子的道具位置相同，并且落在空档里', () => {
    const rolls = [0.1, 0, 0.99];
    let cursor = 0;
    const stream = { lastPowerX: null, powerRng: () => rolls[cursor++] };
    expect(offerEndlessPower(stream, 1000, 800)).toBe('double');
    expect(offerEndlessPower(stream, 1400, 1200)).toBeNull();
    expect(cursor).toBe(2);
    const missed = { lastPowerX: null, powerRng: () => 0.99 };
    expect(offerEndlessPower(missed, 500, 400)).toBeNull();
    expect(missed.lastPowerX).toBe(500 - POWERUP_CONFIG.endless.spacing + POWERUP_CONFIG.endless.retry);

    const first = buildEndlessLevel({ seed: 21, distance: 18000 });
    const again = buildEndlessLevel({ seed: 21, distance: 18000 });
    expect(first.powerups).toEqual(again.powerups);
    expect(first.powerups.length).toBeGreaterThan(0);
    for (const item of first.powerups) {
      expect(['double', 'bomb', 'plane']).toContain(item.type);
      for (const obstacle of first.obstacles) {
        const [left, right] = obstacleIntervalX(obstacle);
        expect(item.x > left - 4 && item.x < right + 4, `${item.id} 压到 ${obstacle.id}`).toBe(false);
      }
      for (const star of first.stars) {
        expect(Math.abs(star.x - item.x)).toBeGreaterThan(36);
      }
    }
    const other = buildEndlessLevel({ seed: 99, distance: 18000 });
    const stamp = (level) => level.powerups.map((item) => `${item.type}@${item.x}`).join('|');
    expect(stamp(other)).not.toBe(stamp(first));
  }, 60000);

  it('最高纪录只在更远时写入本机', () => {
    const store = memoryStorage();
    expect(loadEndlessRecord(store).best).toBe(0);
    expect(commitEndlessRecord(120.8, store)).toMatchObject({
      best: 120,
      improved: true,
      distance: 120,
    });
    expect(commitEndlessRecord(80, store)).toMatchObject({
      best: 120,
      improved: false,
      distance: 80,
    });
    expect(commitEndlessRecord(120, store).improved).toBe(false);
    expect(loadEndlessRecord(store).best).toBe(120);
    expect(distanceMeters(80)).toBe(2);
    expect(PX_PER_METER).toBe(TUNING.pxPerScore);
    expect(loadEndlessRecord({ getItem() { throw new Error('隐私模式'); } }).best).toBe(0);
  });
});
