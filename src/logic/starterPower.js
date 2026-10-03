/**
 * 开局看广告领道具。不引用 Phaser。
 * 和复活分开计次：这里只记这一局有没有领到，不碰复活预算。
 * 种类和时长仍走现有的 grantPower，不另写一套数值。
 */
import { POWER_TYPES } from './powerups.js';

export function createStarterOffer() {
  return { claimed: false };
}

/** 二段跳、护甲、飞机里均匀抽一个。rng 返回 0 到 1。 */
export function pickStarterPower(rng = Math.random) {
  const roll = Number(rng());
  const unit = Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0;
  const index = Math.min(POWER_TYPES.length - 1, Math.floor(unit * POWER_TYPES.length));
  return POWER_TYPES[index];
}

/**
 * 开局按钮。网页不显示。领过就停在「已领取」。
 * 还在同意或加载时不可点。失败停在「暂无广告」，但次数仍在。
 */
export function starterButtonState({ native = false, claimed = false, phase = 'loading' } = {}) {
  if (!native) return { visible: false, enabled: false, labelKey: null };
  if (claimed) return { visible: true, enabled: false, labelKey: 'powerup.claimed' };
  if (phase === 'ready') return { visible: true, enabled: true, labelKey: 'powerup.watch' };
  if (phase === 'failed') return { visible: true, enabled: false, labelKey: 'powerup.unavailable' };
  return { visible: true, enabled: false, labelKey: 'powerup.loading' };
}

/**
 * 只有拿到奖励才扣这一局的领取次数。
 * 关掉、失败、没加载好都保持未领取，调用方再去提示。
 */
export function applyStarterReward(offer, outcome, rng = Math.random) {
  const current = offer?.claimed ? { claimed: true } : createStarterOffer();
  if (current.claimed) {
    return { granted: false, offer: current, kind: null, reason: 'used' };
  }
  if (!outcome?.granted) {
    return {
      granted: false,
      offer: current,
      kind: null,
      reason: outcome?.reason || 'denied',
    };
  }
  return {
    granted: true,
    offer: { claimed: true },
    kind: pickStarterPower(rng),
    reason: 'rewarded',
  };
}

/** 没拿到奖励时面板上的提示。次数没有扣。 */
export function starterMissKey(reason) {
  if (reason === 'dismissed') return 'powerup.missed';
  return 'powerup.failed';
}
