import { describe, expect, it } from 'vitest';
import { compileLevel } from '../src/game/compileLevel.js';
import { findClearPath, proveRoutes } from '../src/logic/search.js';
import { TUNING, playerFeetY, playerGroundY, sampleJump } from '../src/logic/world.js';
import { stepKinematics } from '../src/logic/kinematics.js';

const speed = 318;

function toy() {
  return compileLevel({
    id: 'level-1',
    name: '试',
    speed,
    duration: 12,
    palette: 'magenta',
    obstacles: [
      { t: 6.2, type: 'spike', count: 2 },
    ],
    routes: [
      {
        t: 4.2,
        span: 4.4,
        h: 200,
        layer: 2,
        reward: 'star',
        step: { h: 84, span: 2.05, lead: 1.2 },
        obstacles: [{ t: 6.0, type: 'block' }],
      },
    ],
    stars: [
      { t: 1.2, lift: 0 },
      { t: 6.5, lift: 200 },
      { t: 9.2, lift: 0 },
    ],
    checkpoints: [],
  }, 1);
}

describe('上层路线', () => {
  it('地面起跳够不到主路，从台阶可以', () => {
    const jump = sampleJump();
    expect(jump.height).toBeLessThan(170);
    expect(jump.height).toBeGreaterThan(84);
    const level = toy();
    const tuning = { ...TUNING, speed };
    const step = level.decks.find((deck) => deck.kind === 'step');
    const deck = level.decks.find((deck) => deck.kind === 'route');
    let x = step.x0 - speed * 0.45;
    let y = playerGroundY(tuning);
    let vy = tuning.jumpVelocity;
    let landed = null;
    for (let i = 0; i < 80 && !landed; i += 1) {
      const next = stepKinematics(x, y, vy, level, tuning);
      x = next.x;
      y = next.y;
      vy = next.vy;
      landed = next.landed;
    }
    expect(landed).toBe(step.id);
    expect(playerFeetY(y)).toBeCloseTo(step.top, 0);

    // 台阶后段已经和主路重叠，这时起跳才会落在主路上。
    x = deck.x0 + speed * 0.15;
    y = playerGroundY(tuning) - step.h;
    vy = tuning.jumpVelocity;
    landed = null;
    for (let i = 0; i < 90 && !landed; i += 1) {
      const next = stepKinematics(x, y, vy, level, tuning);
      x = next.x;
      y = next.y;
      vy = next.vy;
      landed = next.landed;
    }
    expect(landed).toBe(deck.id);
  });

  it('上层和地面都能到终点，星星要走上层才捡得齐', () => {
    const level = toy();
    const tuning = { ...TUNING, speed };
    const all = findClearPath(level, tuning);
    expect(all.ok, JSON.stringify(all)).toBe(true);
    expect(all.stars).toBe(3);
    const proof = proveRoutes(level, tuning);
    expect(proof.ground, JSON.stringify(proof)).toBe(true);
    expect(proof.ups.every((item) => item.ok), JSON.stringify(proof)).toBe(true);
  });
});
