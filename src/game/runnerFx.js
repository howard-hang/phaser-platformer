/**
 * 落地灰尘和护罩碎裂。对象事先建好，播放时只改位置和寿命。
 */
import { POWERUP_CONFIG } from './powerupConfig.js';

const SHARD_COLORS = [0x7af0ff, 0xffffff, 0xffe14a, 0x3ec6ff];

/** 本局的灰尘和护罩碎片。update 要在场景 update 里调用。 */
export function createRunnerFx(scene) {
  const dust = [];
  for (let i = 0; i < 6; i += 1) {
    dust.push({
      g: scene.add.circle(0, 0, 4, 0xffe14a, 1).setDepth(6).setVisible(false),
      life: 0,
      max: 0.28,
      vx: 0,
      vy: 0,
    });
  }
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
    /** 落地时扬起一小团灰。 */
    puff(x, y) {
      const speeds = [-70, -24, 18, 64, -48, 40];
      for (let i = 0; i < dust.length; i += 1) {
        const item = dust[i];
        item.life = item.max;
        item.vx = speeds[i];
        item.vy = -90 - (i % 3) * 28;
        item.g.setPosition(x + (i - 2.5) * 6, y);
        item.g.setVisible(true);
        item.g.setAlpha(0.9);
        item.g.setScale(1);
      }
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
      for (let i = 0; i < dust.length; i += 1) {
        const item = dust[i];
        if (item.life <= 0) continue;
        item.life -= dt;
        item.vy += 420 * dt;
        item.g.x += item.vx * dt;
        item.g.y += item.vy * dt;
        const t = 1 - Math.max(0, item.life) / item.max;
        item.g.setAlpha(Math.max(0, 1 - t));
        item.g.setScale(1 + t * 0.6);
        if (item.life <= 0) item.g.setVisible(false);
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
