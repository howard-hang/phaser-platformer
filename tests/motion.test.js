import { describe, expect, it } from 'vitest';
import { displayPose } from '../src/game/motion.js';
import { TUNING, playerGroundY } from '../src/logic/world.js';

const groundCenter = playerGroundY();

describe('显示位置外推', () => {
  it('剩余时间为 0 时，显示位置就是刚体位置', () => {
    const pose = displayPose(
      { x: 240, y: groundCenter, angle: 0 },
      { x: TUNING.speed, y: 0 },
      0,
      1000 / 60,
      { rotating: false, spinMs: 800, groundCenter },
    );
    expect(pose).toEqual({ x: 240, y: groundCenter, angle: 0 });
  });

  it('高刷新率的半步只会往前挪速度乘时间，不会一次跳一个物理步', () => {
    const extraMs = 1000 / 144;
    const pose = displayPose(
      { x: 240, y: groundCenter, angle: 0 },
      { x: TUNING.speed, y: 0 },
      extraMs,
      1000 / 60,
      { rotating: false, spinMs: 800, groundCenter },
    );
    const advanced = TUNING.speed * (extraMs / 1000);
    expect(advanced).toBeGreaterThan(1);
    expect(advanced).toBeLessThan(4);
    expect(pose.x).toBe(Math.round(240 + advanced));
    expect(pose.y).toBe(groundCenter);
  });

  it('下落外推不会穿过地平线', () => {
    const pose = displayPose(
      { x: 240, y: groundCenter - 2, angle: 40 },
      { x: TUNING.speed, y: 800 },
      16,
      1000 / 60,
      { rotating: false, spinMs: 800, groundCenter },
    );
    expect(pose.y).toBe(Math.round(groundCenter));
    expect(pose.angle).toBe(40);
  });

  it('空中旋转按剩余时间补一点，但不超过一圈', () => {
    const spinning = displayPose(
      { x: 100, y: 300, angle: 350 },
      { x: TUNING.speed, y: -200 },
      1000 / 60,
      1000 / 60,
      { rotating: true, spinMs: 800, groundCenter },
    );
    expect(spinning.angle).toBeGreaterThan(350);
    expect(spinning.angle).toBeLessThanOrEqual(360);

    const capped = displayPose(
      { x: 100, y: 300, angle: 359 },
      { x: TUNING.speed, y: -200 },
      1000 / 60,
      1000 / 60,
      { rotating: true, spinMs: 100, groundCenter },
    );
    expect(capped.angle).toBe(360);
  });
});
