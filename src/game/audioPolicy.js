/**
 * 声音开关、音乐进度和前后台策略。
 * 这些判断不碰 AudioContext，测试可以直接跑。
 */

export const MUTE_STORAGE_KEY = 'fangkuai-audio-muted';

/** 本地记录里的静音标记。只有明确写过静音才算关掉。 */
export function readMutedFlag(raw) {
  return raw === '1';
}

export function writeMutedFlag(muted) {
  return muted ? '1' : '0';
}

export function loadMutePreference(storage) {
  try {
    return readMutedFlag(storage?.getItem(MUTE_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function saveMutePreference(storage, muted) {
  try {
    storage?.setItem(MUTE_STORAGE_KEY, writeMutedFlag(muted));
  } catch {
    // 隐私模式写不进去时，这一局仍然按内存里的开关走。
  }
}

/** 死亡、重开、回主页都不把音乐拨回开头。 */
export function playbackPositionAfterRetry(positionSec) {
  return positionSec;
}

/** 静音时输出增益是 0。打开后回到原来的音量，播放进度不动。 */
export function musicOutputGain(muted, unmutedGain) {
  return muted ? 0 : unmutedGain;
}

/** 浏览器拦住自动播放，第一次点击或按键之后才允许创建音频。 */
export function shouldCreateAudio(interacted) {
  return !!interacted;
}

/**
 * 音效能不能出声。碎裂、跳跃、吃星、爆炸走同一道门。
 * 静音、进后台、还没建好音频上下文时都不播。
 */
export function canPlaySfx({ muted, appActive, hasContext }) {
  return !!hasContext && !muted && !!appActive;
}

/** 会出声的音效名。爆炸也在里面，静音时和碎裂一起关掉。 */
export const SFX_CUES = ['jump', 'death', 'star', 'checkpoint', 'win', 'pickup', 'armor'];

export function cueWillPlay(name, flags) {
  if (!SFX_CUES.includes(name)) return false;
  return canPlaySfx(flags);
}

/**
 * 应用进后台就挂起音频，回到前台再恢复。
 * 挂起不会清掉播放进度。
 */
export function audioContextAction(isActive) {
  return isActive ? 'resume' : 'suspend';
}
