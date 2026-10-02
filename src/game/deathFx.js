/**
 * 白方块死亡时的碎裂特效。
 * 碎片走对象池，数量有上限；白闪是全屏矩形的透明度；镜头只轻轻抖一下。
 * 整段不超过 0.5 秒，结束回调里立刻重生。
 */

/** 同时存在的碎片上限。死亡时只唤醒池里的这些，不再新建。 */
export const SHARD_CAP = 10;

/** 碎裂到重生的时长（毫秒）。 */
export const DEATH_FX_MS = 420;

/** 白闪淡出时长（毫秒）。 */
export const FLASH_MS = 160;

/** 镜头震动时长和强度。强度是画面宽高的比例，0.004 大约只有几像素。 */
export const SHAKE_MS = 160;
export const SHAKE_INTENSITY = 0.0035;

/**
 * 规划每一块碎片的形状和初速度。
 * 角度从左上散到右上再落到两侧，数量不会超过 SHARD_CAP。
 */
export function planShards(count = SHARD_CAP) {
  const total = Math.max(0, Math.min(SHARD_CAP, count | 0));
  const shards = [];
  for (let i = 0; i < total; i += 1) {
    const span = total <= 1 ? 0 : i / (total - 1);
    // 从左下偏上扫到右下偏上，整体再往上抛一点。
    const angle = Math.PI * 0.15 + span * Math.PI * 0.7;
    const speed = 210 + (i % 4) * 36;
    shards.push({
      vx: Math.cos(angle) * speed * (i % 2 === 0 ? 1 : 0.82),
      vy: -Math.sin(angle) * speed,
      spin: (i % 2 === 0 ? 1 : -1) * (280 + i * 24),
      w: i % 2 === 0 ? 14 : 11,
      h: i % 3 === 0 ? 8 : 12,
      shape: i % 2 === 0 ? 'tri' : 'rect',
    });
  }
  return shards;
}

/** 把一块碎片画在图形原点，方便对象池旋转。 */
function drawShard(graphics, shard) {
  graphics.clear();
  graphics.fillStyle(0xf4f4f5, 1);
  graphics.lineStyle(2, 0x111111, 1);
  if (shard.shape === 'tri') {
    graphics.fillTriangle(-shard.w / 2, shard.h / 2, shard.w / 2, shard.h / 2, 0, -shard.h / 2);
    graphics.strokeTriangle(-shard.w / 2, shard.h / 2, shard.w / 2, shard.h / 2, 0, -shard.h / 2);
    return;
  }
  graphics.fillRect(-shard.w / 2, -shard.h / 2, shard.w, shard.h);
  graphics.strokeRect(-shard.w / 2, -shard.h / 2, shard.w, shard.h);
}

/**
 * 创建本局的碎裂特效。碎片和白闪都只建一次。
 * play 之后要在场景 update 里调用 update(delta)，到时执行 onDone。
 */
export function createDeathFx(scene) {
  const flash = scene.add.rectangle(0, 0, 4, 4, 0xffffff, 1)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(500)
    .setVisible(false)
    .setAlpha(0);

  const pool = [];
  for (let i = 0; i < SHARD_CAP; i += 1) {
    const graphics = scene.add.graphics().setDepth(520).setVisible(false);
    pool.push(graphics);
  }

  let playing = false;
  let elapsed = 0;
  let originX = 0;
  let originY = 0;
  let plans = [];
  let onDone = null;

  function layoutFlash() {
    flash.setPosition(0, 0);
    flash.setSize(scene.scale.width, scene.scale.height);
  }

  function stopShards() {
    for (let i = 0; i < pool.length; i += 1) pool[i].setVisible(false);
    flash.setVisible(false);
    flash.setAlpha(0);
  }

  function play(x, y, done, shakeScale = 1) {
    // 上一段还没播完就不要再开一池，避免碎片叠爆。
    if (playing) return false;
    playing = true;
    elapsed = 0;
    originX = x;
    originY = y;
    plans = planShards(SHARD_CAP);
    onDone = done;
    layoutFlash();
    flash.setVisible(true);
    flash.setAlpha(0.88);
    // 特效关掉时不抖镜头。低档按比例减轻。
    const scale = Number.isFinite(shakeScale) ? Math.max(0, shakeScale) : 1;
    if (scale > 0) scene.cameras.main.shake(SHAKE_MS, SHAKE_INTENSITY * scale);
    for (let i = 0; i < plans.length; i += 1) {
      const shard = pool[i];
      shard.setVisible(true);
      shard.setAlpha(1);
      shard.setAngle(0);
      shard.setPosition(x, y);
      drawShard(shard, plans[i]);
    }
    return true;
  }

  function update(delta) {
    if (!playing) return;
    elapsed += delta;
    const t = Math.min(1, elapsed / DEATH_FX_MS);
    flash.setAlpha(Math.max(0, 0.88 * (1 - elapsed / FLASH_MS)));
    if (elapsed >= FLASH_MS) flash.setVisible(false);
    const sec = elapsed / 1000;
    for (let i = 0; i < plans.length; i += 1) {
      const plan = plans[i];
      const shard = pool[i];
      // 初速度往外甩，再加一点重力，让碎片落地感短促。
      const x = originX + plan.vx * sec;
      const y = originY + plan.vy * sec + 0.5 * 980 * sec * sec;
      shard.setPosition(x, y);
      shard.setAngle(plan.spin * sec);
      shard.setAlpha(1 - t);
    }
    if (elapsed < DEATH_FX_MS) return;
    playing = false;
    stopShards();
    const done = onDone;
    onDone = null;
    if (done) done();
  }

  function cancel() {
    playing = false;
    onDone = null;
    stopShards();
  }

  layoutFlash();
  return {
    play,
    update,
    layoutFlash,
    cancel,
    isPlaying: () => playing,
  };
}
