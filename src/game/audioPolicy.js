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

/** 音量滑条只接受 0 到 1。非法值当成满音量，避免一声都没有。 */
export function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

/**
 * 静音时输出增益是 0。打开后按滑条比例回到原来的音量，播放进度不动。
 * 不传音量时就是满音量，和以前的声音开关一样。
 */
export function musicOutputGain(muted, unmutedGain, volume = 1) {
  if (muted) return 0;
  return unmutedGain * clampVolume(volume);
}

/** 浏览器拦住自动播放，第一次点击或按键之后才允许创建音频。 */
export function shouldCreateAudio(interacted) {
  return !!interacted;
}

/**
 * 音效能不能出声。碎裂、跳跃、吃星、护甲走同一道门。
 * 静音、音效音量为 0、进后台、还没建好音频上下文时都不播。
 */
export function canPlaySfx({ muted, appActive, hasContext, sfxVolume = 1 }) {
  return !!hasContext && !muted && !!appActive && clampVolume(sfxVolume) > 0;
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
