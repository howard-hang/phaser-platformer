import { describe, expect, it } from 'vitest';
import {
  HITBOX,
  TUNING,
  bodyRectFromSprite,
  obstacleRect,
  playerGroundY,
  playerHitsObstacle,
  playerHitsStar,
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

  it('星星矩形落在抬高后的空中', () => {
    const low = starRect({ id: 'a', x: 0, lift: 0 });
    const high = starRect({ id: 'b', x: 0, lift: 100 });
    expect(high.y).toBeLessThan(low.y - 90);
  });
});
