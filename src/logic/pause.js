/**
 * 暂停和继续倒数。不引用 Phaser，也不看墙钟。
 * 调用方把每一帧的游戏 delta 传进来，测试可以一次推进固定毫秒。
 */

/** 点继续之后先倒数这么久，再恢复跑动。 */
export const PAUSE_COUNTDOWN_MS = 3000;

export function createPauseState() {
  return { phase: 'running', leftMs: 0 };
}

/** 死亡、过关、开局面板和已经暂停时，不再叠一层暂停。 */
export function canOpenPause({
  phase = 'running',
  won = false,
  dying = false,
  ended = false,
  settling = false,
  holdingStart = false,
} = {}) {
  if (holdingStart || won || dying || ended || settling) return false;
  return phase === 'running';
}

export function requestPause(state, gates = {}) {
  const current = state || createPauseState();
  if (!canOpenPause({ phase: current.phase, ...gates })) return current;
  return { phase: 'paused', leftMs: 0 };
}

/** 只有暂停面板上的继续会进入倒数。数字从 3 开始。 */
export function beginCountdown(state, totalMs = PAUSE_COUNTDOWN_MS) {
  if (state?.phase !== 'paused') return state || createPauseState();
  return { phase: 'countdown', leftMs: totalMs };
}

/** 倒数还剩几秒。3、2、1，走完是 0。 */
export function countdownDigit(leftMs) {
  if (!Number.isFinite(leftMs) || leftMs <= 0) return 0;
  return Math.ceil(leftMs / 1000);
}

/**
 * 推进一帧。delta 是场景 update 给的游戏时间，不是墙上的表。
 * 暂停阶段原样返回，计时、障碍和道具都不应被调用方再往前推。
 */
export function tickPause(state, deltaMs) {
  const current = state || createPauseState();
  if (current.phase !== 'countdown') {
    return { state: current, resumed: false, digit: 0 };
  }
  const step = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  const left = current.leftMs - step;
  if (left <= 0) {
    return { state: createPauseState(), resumed: true, digit: 0 };
  }
  return {
    state: { phase: 'countdown', leftMs: left },
    resumed: false,
    digit: countdownDigit(left),
  };
}

/** 暂停和倒数期间，画面、计时、音乐、障碍和道具倒计时都停。 */
export function simulationFrozen(state) {
  return state?.phase === 'paused' || state?.phase === 'countdown';
}
