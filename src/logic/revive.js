/**
 * 死亡后看激励视频复活。这里不碰 Phaser，也不等墙钟。
 * 一局只能成功复活一次。没看完、加载失败、中途关掉都不给。
 */

/** 从死亡点往回退的距离，躲开刚撞上的障碍。 */
export const REVIVE_BACK_PX = 180;

/** 复活后的无敌时长。场景用游戏时间加上这段，不另起定时器。 */
export const REVIVE_INVULN_MS = 1000;

export function createReviveBudget() {
  return { used: 0 };
}

/** 这一局还有没有复活次数。 */
export function reviveStillAvailable(budget) {
  return (budget?.used || 0) < 1;
}

export function markReviveUsed(budget) {
  return { used: (budget?.used || 0) + 1 };
}

/**
 * 复活落点。往起点方向退一小段，但不能退到起跑线前面。
 */
export function revivePoint(deathX, startX, backPx = REVIVE_BACK_PX) {
  const origin = Number.isFinite(startX) ? startX : 0;
  const fallen = Number.isFinite(deathX) ? deathX : origin;
  return {
    x: Math.max(origin, fallen - backPx),
    invulnMs: REVIVE_INVULN_MS,
  };
}

/**
 * 结算按钮该怎么画。网页不显示。次数用完也不显示。
 * 还在同意或加载时显示「加载中」。次数用尽或加载失败才是「暂无广告」。
 * 只传 adReady 时，false 当成已经失败，兼容旧调用。
 */
export function reviveButtonState({ native, budget, adReady, phase } = {}) {
  if (!native || !reviveStillAvailable(budget)) {
    return { visible: false, enabled: false, labelKey: null };
  }
  const resolved = phase || (adReady ? 'ready' : 'failed');
  if (resolved === 'ready') {
    return { visible: true, enabled: true, labelKey: 'revive.watch' };
  }
  if (resolved === 'failed') {
    return { visible: true, enabled: false, labelKey: 'revive.unavailable' };
  }
  return { visible: true, enabled: false, labelKey: 'revive.loading' };
}

/**
 * 原生回调收成一次判定。失败和中途关掉优先于「好像看过」。
 * 只有确实拿到奖励才算复活。
 */
export function interpretRewardedCallbacks({
  earned = false,
  dismissed = false,
  failed = false,
  prepared = true,
} = {}) {
  if (!prepared) return { rewarded: false, reason: 'unavailable' };
  if (failed) return { rewarded: false, reason: 'error' };
  if (earned) return { rewarded: true, reason: 'rewarded' };
  if (dismissed) return { rewarded: false, reason: 'dismissed' };
  return { rewarded: false, reason: 'unavailable' };
}

/**
 * 播放一段激励视频。show 由调用方注入，测试里用假回调。
 * 没加载好不会去播，也不动音乐。播的过程暂停音乐，无论结果如何都恢复。
 */
export async function playReviveAd({ adReady, show, onMusic }) {
  if (!adReady) return { granted: false, reason: 'unavailable' };
  const music = (phase) => {
    try {
      onMusic?.(phase);
    } catch {
      // 音乐出错不能把复活判定一起弄丢。
    }
  };
  music('showing');
  try {
    const result = await show();
    if (result?.rewarded) return { granted: true, reason: 'rewarded' };
    return { granted: false, reason: result?.reason || 'dismissed' };
  } catch {
    return { granted: false, reason: 'error' };
  } finally {
    music('ended');
  }
}

/**
 * 看完才扣次数。失败保持原预算，星星、距离和分数由 keepRunOnRevive 另管。
 */
export function applyReviveDecision(budget, outcome) {
  const current = budget || createReviveBudget();
  if (!outcome?.granted || !reviveStillAvailable(current)) {
    return { revived: false, budget: current };
  }
  return { revived: true, budget: markReviveUsed(current) };
}

/** 复活时留下已经拿到的星星、跑过的距离和分数。死亡次数保持这次已经加上的值。 */
export function keepRunOnRevive(run) {
  return {
    score: run?.score || 0,
    deaths: run?.deaths || 0,
    stars: run?.stars || 0,
    maxDistance: run?.maxDistance || 0,
    collected: run?.collected || new Set(),
  };
}
