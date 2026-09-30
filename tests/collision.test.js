import { describe, expect, it } from 'vitest';
import {
  HITBOX,
  PAD_JUMP_VELOCITY,
  TUNING,
  bodyRectFromSprite,
  laserActive,
  moverUnit,
  obstacleRect,
  phaseForLaser,
  phaseForMover,
  playerGroundY,
  playerHitsObstacle,
  playerHitsStar,
  playerOnPad,
  rectsOverlap,
  sampleJump,
  starRect,
} from '../src/logic/world.js';

describe('碰撞盒', () => {
  it('站在地面上时，玩家脚底贴着地平线', () => {
    const rect = bodyRectFromSprite(0, playerGroundY(), HITBOX.player);
    expect(rect.y + rect.h).toBe(TUNING.groundY);
  });

  it('尖刺和地面方块的碰撞盒底边也贴着地平线', () => {
    const spike = obstacleRect({ id: 's', type: 'spike', x: 100 });
    const block = obstacleRect({ id: 'b', type: 'block', x: 200 });
    expect(spike.y + spike.h).toBe(TUNING.groundY);
    expect(block.y + block.h).toBe(TUNING.groundY);
  });

  it('跑进尖刺算死亡，跳到尖刺上方不算', () => {
    const spike = { id: 's', type: 'spike', x: 400 };
    const groundY = playerGroundY();
    expect(playerHitsObstacle(400, groundY, spike)).toBe(true);
    expect(playerHitsObstacle(400, groundY - 180, spike)).toBe(false);
    expect(playerHitsObstacle(200, groundY, spike)).toBe(false);
  });

  it('头顶方块不挡住站立的玩家，跳起来会撞上', () => {
    const overhead = { id: 'o', type: 'overhead', x: 500, gap: 58 };
    const groundY = playerGroundY();
    expect(playerHitsObstacle(500, groundY, overhead)).toBe(false);
    // 起跳中段会穿过方块所在的高度；跳到最高点时人已经在方块上方。
    expect(playerHitsObstacle(500, groundY - 50, overhead)).toBe(true);
  });

  it('星星和玩家重叠才会被捡到', () => {
    const star = { id: 'star', x: 320, lift: 0 };
    expect(playerHitsStar(320, playerGroundY(), star)).toBe(true);
    expect(playerHitsStar(120, playerGroundY(), star)).toBe(false);
  });

  it('矩形边缘相贴不算重叠', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 10, y: 0, w: 10, h: 10 };
    const c = { x: 9, y: 0, w: 10, h: 10 };
    expect(rectsOverlap(a, b)).toBe(false);
    expect(rectsOverlap(a, c)).toBe(true);
  });

  it('一次跳跃能越过三连尖刺，高度也高过地面方块', () => {
    const jump = sampleJump();
    const cluster = HITBOX.spike.bodyW + HITBOX.spike.w * 2;
    expect(jump.distance).toBeGreaterThan(cluster + HITBOX.player.bodyW + 30);
    expect(jump.height).toBeGreaterThan(HITBOX.block.bodyH + 40);
    expect(jump.airTime).toBeGreaterThan(0.6);
    expect(jump.airTime).toBeLessThan(1.2);
  });

  it('倒挂刺不挡站立，起跳会撞上', () => {
    const ceiling = { id: 'c', type: 'ceiling', x: 500, hang: 48 };
    const groundY = playerGroundY();
    expect(playerHitsObstacle(500, groundY, ceiling)).toBe(false);
    expect(playerHitsObstacle(500, groundY - 80, ceiling)).toBe(true);
  });

  it('跳板不致命，但站在上面算踩中', () => {
    const pad = { id: 'p', x: 640 };
    expect(playerHitsObstacle(640, playerGroundY(), { ...pad, type: 'pad' })).toBe(false);
    expect(playerOnPad(640, playerGroundY(), pad)).toBe(true);
    expect(playerOnPad(500, playerGroundY(), pad)).toBe(false);
    expect(PAD_JUMP_VELOCITY).toBeLessThan(TUNING.jumpVelocity);
    expect(TUNING.jumpVelocity).toBe(-740);
    expect(TUNING.gravity).toBe(1700);
  });

  it('移动刺贴地时要跳，升起来时可以贴地跑过去', () => {
    const period = 1.8;
    const downPhase = phaseForMover(2, period, 'down');
    const upPhase = phaseForMover(2, period, 'up');
    const down = { id: 'd', type: 'mover', x: 800, amplitude: 96, period, phase: downPhase };
    const up = { id: 'u', type: 'mover', x: 800, style: 'block', amplitude: 118, period, phase: upPhase };
    const groundY = playerGroundY();
    expect(moverUnit(2, period, downPhase)).toBe(0);
    expect(moverUnit(2, period, upPhase)).toBe(1);
    expect(playerHitsObstacle(800, groundY, down, TUNING, 2)).toBe(true);
    expect(playerHitsObstacle(800, groundY, up, TUNING, 2)).toBe(false);
    expect(playerHitsObstacle(800, groundY - 130, up, TUNING, 2)).toBe(true);
  });

  it('低激光张开时挡住地面，高激光张开时只挡跳跃，关掉就没有碰撞', () => {
    const period = 1.8;
    const duty = 0.62;
    const onPhase = phaseForLaser(3, period, true, duty);
    const offPhase = phaseForLaser(3, period, false, duty);
    const low = { id: 'l', type: 'laser', x: 900, band: 'low', period, duty, phase: onPhase };
    const high = { id: 'h', type: 'laser', x: 900, band: 'high', period, duty, phase: onPhase, lift: 112 };
    const off = { ...low, id: 'off', phase: offPhase };
    const groundY = playerGroundY();
    expect(laserActive(3, period, onPhase, duty)).toBe(true);
    expect(laserActive(3, period, offPhase, duty)).toBe(false);
    expect(playerHitsObstacle(900, groundY, low, TUNING, 3)).toBe(true);
    expect(playerHitsObstacle(900, groundY - 120, low, TUNING, 3)).toBe(false);
    expect(playerHitsObstacle(900, groundY, high, TUNING, 3)).toBe(false);
    expect(playerHitsObstacle(900, groundY - 90, high, TUNING, 3)).toBe(true);
    expect(obstacleRect(off, TUNING, 3)).toBeNull();
    expect(playerHitsObstacle(900, groundY, off, TUNING, 3)).toBe(false);
  });

  it('星星矩形落在抬高后的空中', () => {
    const low = starRect({ id: 'a', x: 0, lift: 0 });
    const high = starRect({ id: 'b', x: 0, lift: 100 });
    expect(high.y).toBeLessThan(low.y - 90);
  });
});
