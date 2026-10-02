/**
 * 设置：音量、震动、画面特效、帧率。存在 localStorage，下次打开还在。
 * 音量和原来的声音开关共用一套状态，避免一个关了另一个还在响。
 * 这些函数不碰 AudioContext，测试可以换一个假的 localStorage。
 */
import { ENDLESS_STORAGE_KEY, loadEndlessRecord } from './endlessScore.js';
import { PROGRESS_STORAGE_KEY, loadProgress } from './progress.js';
import { clampVolume } from './audioPolicy.js';

export const SETTINGS_STORAGE_KEY = 'fangkuai-paoku-settings';

export const FX_LEVELS = ['high', 'low', 'off'];

let memory = null;

export function defaultSettings() {
  return {
    musicVolume: 1,
    sfxVolume: 1,
    vibrate: true,
    fx: 'high',
    // null 表示还没拨过开关，网址上的 ?fps 仍然有效。
    showFps: null,
  };
}

export function normalizeFx(value) {
  return FX_LEVELS.includes(value) ? value : 'high';
}

/** 把读到的记录收成合法设置。缺字段用默认值，坏值丢掉。 */
export function normalizeSettings(raw) {
  const base = defaultSettings();
  const source = raw && typeof raw === 'object' ? raw : {};
  let showFps = null;
  if (source.showFps === true) showFps = true;
  else if (source.showFps === false) showFps = false;
  return {
    musicVolume: clampVolume(source.musicVolume ?? base.musicVolume),
    sfxVolume: clampVolume(source.sfxVolume ?? base.sfxVolume),
    vibrate: source.vibrate !== false,
    fx: normalizeFx(source.fx),
    showFps,
  };
}

/**
 * 特效档位。灰尘数量、残影条数和镜头震动都看这里。
 * 高是完整效果，低少一半左右，关就什么都不画。
 */
export function fxProfile(level) {
  if (level === 'off') return { dustPerSec: 0, burst: 0, trails: 0, shake: 0 };
  if (level === 'low') return { dustPerSec: 7, burst: 4, trails: 1, shake: 0.35 };
  return { dustPerSec: 14, burst: 8, trails: 3, shake: 1 };
}

function browserStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readStored(storage) {
  try {
    const raw = storage?.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings();
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

/** 读设置。坏掉的 JSON 和隐私模式都当成默认，不抛错。 */
export function loadSettings(storage) {
  const store = storage === undefined ? browserStorage() : storage;
  const next = readStored(store);
  memory = next;
  return next;
}

/** 这一局里最近一次读到或写下的设置。场景每帧用它，不再反复读盘。 */
export function currentSettings() {
  if (!memory) memory = loadSettings();
  return memory;
}

/** 写设置。写失败时游戏继续，只是这次不记住。 */
export function saveSettings(settings, storage) {
  const next = normalizeSettings(settings);
  memory = next;
  const store = storage === undefined ? browserStorage() : storage;
  try {
    store?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 存不进去就只留在这一局里。
  }
  return next;
}

/** 只改其中几项，音量以外的开关走这里。 */
export function updateSettings(partial, storage) {
  const store = storage === undefined ? browserStorage() : storage;
  const current = readStored(store);
  return saveSettings({ ...current, ...partial }, store);
}

/**
 * 帧率要不要显示。
 * 玩家在设置里明确开或关之后，以设置为准。还没拨过时，?fps 仍能打开。
 */
export function shouldShowFps(settings, search = '') {
  if (settings?.showFps === true) return true;
  if (settings?.showFps === false) return false;
  const query = typeof search === 'string' ? search : '';
  const normalized = query.startsWith('?') ? query.slice(1) : query;
  try {
    return new URLSearchParams(normalized).has('fps');
  } catch {
    return false;
  }
}

/**
 * 声音开关和两条音量合成一个状态。
 * 两条都是 0 时视为静音。静音标记优先，音量数字先留着，取消静音再回来。
 */
export function reconcileAudio(settings, mutedFlag) {
  const musicVolume = clampVolume(settings?.musicVolume ?? 1);
  const sfxVolume = clampVolume(settings?.sfxVolume ?? 1);
  let muted = !!mutedFlag;
  if (musicVolume <= 0 && sfxVolume <= 0) muted = true;
  return { muted, musicVolume, sfxVolume };
}

/**
 * 拖动一条音量。拉高任意一条就取消静音；两条都归零则变成静音。
 */
export function applyVolumeChange(state, channel, value) {
  const next = {
    muted: !!state?.muted,
    musicVolume: clampVolume(state?.musicVolume ?? 1),
    sfxVolume: clampVolume(state?.sfxVolume ?? 1),
  };
  if (channel === 'musicVolume' || channel === 'sfxVolume') next[channel] = clampVolume(value);
  if (next[channel] > 0) next.muted = false;
  else if (next.musicVolume <= 0 && next.sfxVolume <= 0) next.muted = true;
  return next;
}

/**
 * 点声音按钮。
 * 正在响就静音，音量数字保留。已经静音就恢复；两条都是 0 时恢复到满音量，否则开关看起来没反应。
 */
export function toggleMuteState(state) {
  const musicVolume = clampVolume(state?.musicVolume ?? 1);
  const sfxVolume = clampVolume(state?.sfxVolume ?? 1);
  const silent = !!state?.muted || (musicVolume <= 0 && sfxVolume <= 0);
  if (!silent) return { muted: true, musicVolume, sfxVolume };
  if (musicVolume <= 0 && sfxVolume <= 0) return { muted: false, musicVolume: 1, sfxVolume: 1 };
  return { muted: false, musicVolume, sfxVolume };
}

function dropKey(store, key) {
  if (!store) return;
  if (typeof store.removeItem === 'function') {
    store.removeItem(key);
    return;
  }
  store.setItem?.(key, '');
}

/**
 * 清掉闯关星星、解锁（由星星推导）和无尽最高纪录。
 * 不碰音量和特效设置。
 */
export function resetAllProgress(storage) {
  const store = storage === undefined ? browserStorage() : storage;
  try {
    dropKey(store, PROGRESS_STORAGE_KEY);
    dropKey(store, ENDLESS_STORAGE_KEY);
  } catch {
    // 清不掉就让调用方再读一遍，界面不要崩。
  }
  return {
    progress: loadProgress(store),
    endless: loadEndlessRecord(store),
  };
}
