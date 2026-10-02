/**
 * 炸弹和清场用的爆炸圈。
 * 对象事先建好，爆炸时只改位置和寿命，不在帧循环里新造对象。
 */
import { POWERUP_CONFIG } from './powerupConfig.js';

const COLORS = [0xff7a59, 0xff4b8d, 0xffe14a, 0xffffff];

/** 本局的爆炸圈。play 之后要在场景 update 里调用 update。 */
export function createBlastFx(scene) {
  const pool = [];
  for (let i = 0; i < 14; i += 1) {
    pool.push({
      g: scene.add.graphics().setDepth(14).setVisible(false),
      life: 0,
      max: 1,
      big: false,
      color: COLORS[i % COLORS.length],
    });
  }

  return {
    /** origin 是玩家身边的主爆点，points 是被炸开的障碍位置。 */
    play(origin, points) {
      const spots = [{ x: origin.x, y: origin.y, big: true }];
      const list = points || [];
      for (let i = 0; i < list.length && spots.length < pool.length; i += 1) {
        spots.push(list[i]);
      }
      const life = POWERUP_CONFIG.bomb.fxSeconds;
      for (let i = 0; i < pool.length; i += 1) {
        const item = pool[i];
        const spot = spots[i];
        if (!spot) {
          item.life = 0;
          item.g.setVisible(false);
          item.g.clear();
          continue;
        }
        item.life = life;
        item.max = life;
        item.big = !!spot.big;
        item.color = COLORS[i % COLORS.length];
        item.g.setPosition(spot.x, spot.y);
        item.g.setVisible(true);
      }
    },
    update(delta) {
      const dt = (delta || 0) / 1000;
      for (let i = 0; i < pool.length; i += 1) {
        const item = pool[i];
        if (item.life <= 0) continue;
        item.life -= dt;
        const t = 1 - Math.max(0, item.life) / item.max;
        const radius = (item.big ? 16 : 8) + t * (item.big ? 64 : 34);
        const alpha = Math.max(0, item.life <= 0 ? 0 : 1 - t);
        const g = item.g;
        g.clear();
        if (item.life <= 0) {
          g.setVisible(false);
          continue;
        }
        g.lineStyle(5, item.color, alpha);
        g.strokeCircle(0, 0, radius);
        g.fillStyle(0xffe14a, alpha * 0.9);
        g.fillCircle(0, 0, Math.max(3, radius * 0.28));
      }
    },
  };
}
