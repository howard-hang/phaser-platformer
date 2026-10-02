/**
 * 奔跑灰尘和护罩碎裂。
 * 灰尘是彩色小方块，对象池上限 DUST_CAP，播完回收，不再新建。
 * 护罩碎片也是事先建好的，数量固定。
 */
import { POWERUP_CONFIG } from './powerupConfig.js';
import {
  DUST_CAP,
  aliveDustCount,
  createDustPool,
  emitDust,
  stepDust,
} from './dust.js';

const SHARD_COLORS = [0x7af0ff, 0xffffff, 0xffe14a, 0x3ec6ff];

/** 本局的灰尘和护罩碎片。update 要在场景 update 里调用。 */
export function createRunnerFx(scene) {
  const pool = createDustPool();
  const views = [];
  for (let i = 0; i < DUST_CAP; i += 1) {
    // 小方块用图形画，不给每一颗单独建贴图。
    views.push(scene.add.graphics().setDepth(6).setVisible(false));
  }
  let cursor = 0;

  const shards = [];
  for (let i = 0; i < 8; i += 1) {
    shards.push({
      g: scene.add.graphics().setDepth(12).setVisible(false),
      life: 0,
      max: POWERUP_CONFIG.armor.fxSeconds,
      vx: 0,
      vy: 0,
      spin: 0,
      color: SHARD_COLORS[i % SHARD_COLORS.length],
    });
  }

  return {
    /** 从尾部下方撒出彩色小方块。池满了就不再增加。 */
    emit(x, y, count) {
      const result = emitDust(pool, x, y, count, cursor);
      cursor = result.cursor;
      return result.spawned;
    },
    /** 落地扬尘。和奔跑灰尘同一套方块，只是一次多撒几颗。 */
    puff(x, y, count = 8) {
      return this.emit(x, y, count);
    },
    aliveCount() {
      return aliveDustCount(pool);
    },
    /** 护罩裂开。碎片从方块中心散开。 */
    shatter(x, y) {
      const life = POWERUP_CONFIG.armor.fxSeconds;
      for (let i = 0; i < shards.length; i += 1) {
        const item = shards[i];
        const angle = (Math.PI * 2 * i) / shards.length;
        item.life = life;
        item.max = life;
        item.vx = Math.cos(angle) * 220;
        item.vy = Math.sin(angle) * 180 - 40;
        item.spin = (i % 2 === 0 ? 1 : -1) * 8;
        item.g.setPosition(x, y);
        item.g.setVisible(true);
        item.g.setRotation(angle);
      }
    },
    update(delta) {
      const dt = (delta || 0) / 1000;
      for (let i = 0; i < DUST_CAP; i += 1) {
        const item = pool[i];
        const g = views[i];
        if (!item.alive) {
          if (g.visible) g.setVisible(false);
          continue;
        }
        const next = stepDust(item, dt);
        Object.assign(item, next);
        if (!item.alive) {
          g.setVisible(false);
          continue;
        }
        // 往后上方飘的同时缩小、变淡。
        g.setVisible(true);
        g.setPosition(item.x, item.y);
        g.clear();
        g.fillStyle(item.color, item.alpha);
        const side = Math.max(0.5, item.size * item.scale);
        g.fillRect(-side / 2, -side / 2, side, side);
      }
      for (let i = 0; i < shards.length; i += 1) {
        const item = shards[i];
        if (item.life <= 0) continue;
        item.life -= dt;
        item.vy += 260 * dt;
        item.g.x += item.vx * dt;
        item.g.y += item.vy * dt;
        item.g.rotation += item.spin * dt;
        const t = 1 - Math.max(0, item.life) / item.max;
        const g = item.g;
        g.clear();
        if (item.life <= 0) {
          g.setVisible(false);
          continue;
        }
        g.fillStyle(item.color, Math.max(0, 1 - t));
        g.fillRoundedRect(-7, -3, 14, 6, 2);
      }
    },
  };
}

export { DUST_CAP };
