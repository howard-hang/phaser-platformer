/**
 * 二段跳、炸弹、飞机。
 * 效果、时长和替换都在这里测。不吃道具时的通关仍由原来的可达性测试保证。
 */
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/level.js';
import { POWERUP_CONFIG, campaignPowerCount } from '../src/game/powerupConfig.js';
import { stepKinematics } from '../src/logic/kinematics.js';
import {
  blastKeepsCourse,
  blastObstacles,
  canAirJump,
  clearSpan,
  createPowerState,
  flightCenterY,
  grantPower,
  isDestructible,
  isPowerInvulnerable,
  landingClearWindow,
  noteAirJump,
  noteLand,
  obstacleIntervalX,
  powerRatio,
  resolveJump,
  sampleLandingPoints,
  tickPower,
  withinStarCatch,
  rollPowerType,
} from '../src/logic/powerups.js';
import {
  TUNING,
  playerGroundY,
  playerHitsObstacle,
  sampleJump,
  starPose,
} from '../src/logic/world.js';

const DT = 1 / 60;

/** 从某个初速度积分到落地，量这一跳自己升了多高。 */
function riseOf(vy0) {
  let vy = vy0;
  let y = 0;
  let peak = 0;
  for (let i = 0; i < 240; i += 1) {
    vy += TUNING.gravity * DT;
    y += vy * DT;
    if (y < peak) peak = y;
    if (i > 2 && y >= 0 && vy > 0) break;
  }
  return -peak;
}

describe('道具时长和替换', () => {
  it('二段跳 8 秒，飞机 5 秒，到点就结束', () => {
    expect(POWERUP_CONFIG.double.duration).toBe(8);
    expect(POWERUP_CONFIG.plane.duration).toBe(5);
    let state = grantPower(createPowerState(), 'double', 0).state;
    expect(state.endsAt).toBe(8);
    expect(tickPower(state, 7.999).kind).toBe('double');
    expect(tickPower(state, 8).kind).toBeNull();
    expect(canAirJump(tickPower(state, 8), false)).toBe(false);

    state = grantPower(createPowerState(), 'plane', 0).state;
    expect(state.endsAt).toBe(5);
    expect(tickPower(state, 4.999).phase).toBe('fly');
    const landing = tickPower(state, 5);
    expect(landing.kind).toBe('plane');
    expect(landing.phase).toBe('land');
    expect(landing.landEndsAt).toBeCloseTo(5.7);
    expect(isPowerInvulnerable(landing, 5.2)).toBe(true);
    const done = tickPower(landing, 5.7);
    expect(done.kind).toBeNull();
    expect(isPowerInvulnerable(done, 6.1)).toBe(true);
    expect(isPowerInvulnerable(done, 5.7 + POWERUP_CONFIG.plane.landInvuln)).toBe(false);
    expect(powerRatio(state, 2.5)).toBeCloseTo(0.5);
  });

  it('吃到新的就换掉旧的，炸弹会停掉正在计时的道具', () => {
    let state = grantPower(createPowerState(), 'double', 1).state;
    expect(state.kind).toBe('double');
    expect(state.airReady).toBe(true);
    const swapped = grantPower(state, 'plane', 3);
    expect(swapped.replaced).toBe('double');
    state = swapped.state;
    expect(state.kind).toBe('plane');
    expect(state.endsAt).toBeCloseTo(8);
    expect(canAirJump(state, false)).toBe(false);
    const bombed = grantPower(state, 'bomb', 4);
    expect(bombed.bomb).toBe(true);
    expect(bombed.replaced).toBe('plane');
    expect(bombed.state.kind).toBeNull();
    expect(isPowerInvulnerable(bombed.state, 4)).toBe(false);
  });

  it('二段跳每次离地只能再跳一次，落地后补回', () => {
    let state = grantPower(createPowerState(), 'double', 0).state;
    expect(canAirJump(state, true)).toBe(false);
    expect(canAirJump(state, false)).toBe(true);
    state = noteAirJump(state);
    expect(state.airReady).toBe(false);
    expect(canAirJump(state, false)).toBe(false);
    state = noteLand(state);
    expect(canAirJump(state, false)).toBe(true);
  });
});

describe('二段跳高度', () => {
  it('第二跳的上升高度不超过普通跳', () => {
    const grounded = resolveJump({
      grounded: true,
      airReady: true,
      jumpVelocity: TUNING.jumpVelocity,
      flipped: false,
    });
    const aerial = resolveJump({
      grounded: false,
      airReady: true,
      jumpVelocity: TUNING.jumpVelocity,
      flipped: false,
    });
    expect(aerial.ok).toBe(true);
    expect(aerial.usedAir).toBe(true);
    expect(aerial.vy).toBe(grounded.vy);
    expect(aerial.vy).toBe(TUNING.jumpVelocity);
    expect(Math.abs(aerial.vy)).toBeLessThanOrEqual(Math.abs(TUNING.jumpVelocity));
    const normal = riseOf(TUNING.jumpVelocity);
    const second = riseOf(aerial.vy);
    expect(second).toBeLessThanOrEqual(normal + 0.001);
    expect(second).toBeCloseTo(sampleJump().height, 0);

    // 在顶点把速度设成第二跳，量的是这一跳自己升了多少，不是离地的总高度。
    let x = 0;
    let y = playerGroundY();
    let vy = TUNING.jumpVelocity;
    let yAtSecond = null;
    let peak = y;
    const level = { startX: 0, obstacles: [], flips: [], decks: [] };
    for (let i = 0; i < 240; i += 1) {
      if (yAtSecond == null && i > 4 && vy > -40) {
        const decision = resolveJump({
          grounded: false,
          airReady: true,
          jumpVelocity: TUNING.jumpVelocity,
          flipped: false,
        });
        vy = decision.vy;
        yAtSecond = y;
        peak = y;
      }
      const step = stepKinematics(x, y, vy, level, TUNING);
      x = step.x;
      y = step.y;
      vy = step.vy;
      if (yAtSecond != null && y < peak) peak = y;
      if (yAtSecond != null && step.landed) break;
    }
    expect(yAtSecond).not.toBeNull();
    expect(yAtSecond - peak).toBeLessThanOrEqual(normal + 1);
  });

  it('没有二段跳时，空中起跳会被拒绝', () => {
    const missed = resolveJump({
      grounded: false,
      airReady: false,
      jumpVelocity: TUNING.jumpVelocity,
      flipped: false,
    });
    expect(missed.ok).toBe(false);
  });
});

describe('炸弹不炸断路', () => {
  it('只清前方的尖刺、方块、门和坑，平台和反转区还在', () => {
    const playerX = 1000;
    const range = POWERUP_CONFIG.bomb.range;
    const obstacles = [
      { id: 'behind', type: 'spike', x: playerX - 120 },
      { id: 'spike', type: 'spike', x: playerX + 80 },
      { id: 'block', type: 'block', x: playerX + 140 },
      { id: 'over', type: 'overhead', x: playerX + 200, gap: 58 },
      { id: 'gate', type: 'gate', x: playerX + 250, period: 1.2, open: 0.4, phase: 0.5 },
      { id: 'cspike', type: 'cspike', x: playerX + 300 },
      { id: 'pit', type: 'crumble', x: playerX + 40, x0: playerX + 40, x1: playerX + 320, collapse: 0 },
      { id: 'flip', type: 'flip', x: playerX + 380, x0: playerX + 380, x1: playerX + 450 },
      { id: 'far', type: 'spike', x: playerX + range + 140 },
    ];
    const decks = [{ id: 'route', x0: playerX + 60, x1: playerX + 280, top: TUNING.groundY - 200, h: 200 }];
    const flips = [{ id: 'flip', x0: playerX + 380, x1: playerX + 450 }];
    const blasted = blastObstacles(obstacles, playerX);
    expect(blasted.removed.map((item) => item.id).sort()).toEqual(
      ['block', 'cspike', 'gate', 'over', 'pit', 'spike'],
    );
    expect(blasted.kept.map((item) => item.id).sort()).toEqual(['behind', 'far', 'flip']);
    expect(blastKeepsCourse({ decks, flips }, { decks, flips }, blasted.removed)).toBe(true);
    expect(decks[0].x0).toBe(playerX + 60);
    expect(isDestructible({ type: 'flip' })).toBe(false);
    expect(isDestructible({ type: 'spike' })).toBe(true);

    // 坑还在的话会伤到人。清掉之后贴着地面能走过去。
    expect(playerHitsObstacle(playerX + 120, playerGroundY(), obstacles[6], TUNING, 1)).toBe(true);
    const level = {
      startX: 0,
      obstacles: blasted.kept,
      flips,
      decks,
    };
    let x = playerX;
    let y = playerGroundY();
    let vy = 0;
    const steps = Math.floor(220 / TUNING.speed * 60);
    for (let i = 0; i < steps; i += 1) {
      for (const obstacle of level.obstacles) {
        if (obstacle.type === 'flip') continue;
        expect(playerHitsObstacle(x, y, obstacle, TUNING, x / TUNING.speed)).toBe(false);
      }
      const step = stepKinematics(x, y, vy, level, TUNING);
      expect(step.landed).toBe('floor');
      x = step.x;
      y = step.y;
      vy = step.vy;
    }
  });
});

describe('飞机落地', () => {
  it('清场之后落地轨迹不会撞上障碍，不清就会撞上', () => {
    const speed = 360;
    const playerX = 2000;
    const span = landingClearWindow(playerX, speed);
    const mid = Math.round((span.x0 + span.x1) / 2);
    const obstacles = [
      { id: 'spike', type: 'spike', x: mid },
      { id: 'block', type: 'block', x: mid + 42 },
      { id: 'over', type: 'overhead', x: mid + 84, gap: 58 },
      { id: 'gate', type: 'gate', x: mid + 126, period: 1.4, open: 0.4, phase: 0.9 },
      { id: 'pit', type: 'crumble', x: mid, x0: mid - 20, x1: mid + 160, collapse: 0 },
      { id: 'flip', type: 'flip', x: span.x0, x0: span.x0, x1: span.x0 + 40 },
      { id: 'outside', type: 'spike', x: span.x1 + 220 },
    ];
    const decks = [{ id: 'deck', x0: span.x0, x1: span.x1, top: 192, h: 200 }];
    const flips = [{ id: 'flip', x0: span.x0, x1: span.x0 + 40 }];
    const cleared = clearSpan(obstacles, span.x0, span.x1);
    expect(cleared.kept.map((item) => item.id).sort()).toEqual(['flip', 'outside']);
    expect(blastKeepsCourse({ decks, flips }, { decks, flips }, cleared.removed)).toBe(true);
    expect(decks[0].top).toBe(192);

    const points = sampleLandingPoints(playerX, speed);
    expect(points[0].y).toBeCloseTo(flightCenterY());
    expect(points[points.length - 1].onGround).toBe(true);
    expect(points[points.length - 1].y).toBeCloseTo(playerGroundY());
    for (const point of points) {
      for (const obstacle of cleared.kept) {
        if (obstacle.type === 'flip') continue;
        const hit = playerHitsObstacle(point.x, point.y, obstacle, TUNING, point.x / speed);
        expect(hit, `${obstacle.id} @ ${Math.round(point.x)},${Math.round(point.y)}`).toBe(false);
      }
    }
    let rawHit = false;
    for (const point of points) {
      if (playerHitsObstacle(point.x, point.y, obstacles[0], TUNING, 0)) rawHit = true;
    }
    expect(rawHit).toBe(true);
  });

  it('飞行高度够得到地面星星', () => {
    const star = { x: 1000, lift: 0 };
    const pose = starPose(star);
    const flightY = flightCenterY();
    expect(withinStarCatch(0, pose.cy - flightY)).toBe(true);
    expect(withinStarCatch(0, starPose({ x: 1000, lift: 200 }).cy - flightY)).toBe(true);
    expect(withinStarCatch(POWERUP_CONFIG.plane.starCatchX + 8, 0)).toBe(false);
  });
});

describe('闯关道具', () => {
  it('前期少放，三种都有，而且不压在障碍、台阶和贴地星星上', () => {
    const seen = new Set();
    expect(campaignPowerCount(1)).toBeLessThan(campaignPowerCount(20));
    LEVELS.forEach((level, index) => {
      expect(level.powerups.length).toBe(POWERUP_CONFIG.campaign.counts[index]);
      for (const item of level.powerups) {
        seen.add(item.type);
        expect(['double', 'bomb', 'plane']).toContain(item.type);
        for (const obstacle of level.obstacles) {
          const [left, right] = obstacleIntervalX(obstacle);
          const hit = item.x > left - 4 && item.x < right + 4;
          expect(hit, `${level.id} ${item.type} 压到 ${obstacle.id}`).toBe(false);
        }
        for (const deck of level.decks || []) {
          if (deck.kind !== 'step') continue;
          expect(item.x > deck.x0 && item.x < deck.x1, `${level.id} 落在台阶上`).toBe(false);
        }
        for (const zone of level.flips || []) {
          expect(item.x > zone.x0 && item.x < zone.x1, `${level.id} 落在反转区`).toBe(false);
        }
        for (const star of level.stars) {
          if ((star.lift || 0) >= 60) continue;
          expect(Math.abs(star.x - item.x), `${level.id} 贴着星星`).toBeGreaterThan(28);
        }
      }
    });
    expect(seen).toEqual(new Set(['double', 'bomb', 'plane']));
  });
});

describe('无尽投放概率', () => {
  it('开局概率更低，三种都会被掷到', () => {
    expect(POWERUP_CONFIG.endless.earlyChance).toBeLessThan(POWERUP_CONFIG.endless.chance);
    expect(rollPowerType(() => 0.5, 1000)).toBeNull();
    expect(rollPowerType(() => 0.5, 20000)).toBe('bomb');
    const types = new Set();
    const values = [0.1, 0, 0.1, 0.4, 0.1, 0.9];
    let cursor = 0;
    const rng = () => values[cursor++];
    types.add(rollPowerType(rng, 100));
    types.add(rollPowerType(rng, 100));
    types.add(rollPowerType(rng, 100));
    expect(types).toEqual(new Set(['double', 'bomb', 'plane']));
  });
});
