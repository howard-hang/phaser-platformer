/**
 * 轻微震动。死亡、护甲碎裂、吃到道具各一下。
 * 安卓壳优先用 Capacitor Haptics，网页用 navigator.vibrate。
 * 设备不支持或玩家关掉震动时什么都不做，也不报错。
 */
import { isNativeShell } from '../platform/androidBack.js';
import { currentSettings } from './settings.js';

/** 毫秒。都很短，只是确认一下，不是长震。 */
export const HAPTIC_MS = {
  death: 36,
  armor: 22,
  pickup: 14,
};

/** 这一下该不该震。关着震动，或者不是这三件事，就返回 null。 */
export function hapticRequest(settings, event) {
  if (!settings?.vibrate) return null;
  const ms = HAPTIC_MS[event];
  if (!ms) return null;
  return {
    event,
    ms,
    style: event === 'death' ? 'MEDIUM' : 'LIGHT',
  };
}

/**
 * 真正去震。先试插件，不行再试浏览器接口。
 * 两边都没有就返回 false，调用方不用处理。
 */
export async function pulseHaptic(request, deps = {}) {
  if (!request) return false;
  try {
    if (typeof deps.haptics?.impact === 'function') {
      await deps.haptics.impact({ style: request.style });
      return true;
    }
  } catch {
    // 插件没接上时继续试网页震动。
  }
  try {
    if (typeof deps.vibrate === 'function') {
      deps.vibrate(request.ms);
      return true;
    }
  } catch {
    // 网页端不支持就静默跳过。
  }
  return false;
}

async function runFeedback(request) {
  let haptics = null;
  try {
    if (isNativeShell()) {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const mod = await import('@capacitor/haptics');
        haptics = mod.Haptics;
      }
    }
  } catch {
    haptics = null;
  }
  const vibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
    ? navigator.vibrate.bind(navigator)
    : null;
  await pulseHaptic(request, { haptics, vibrate });
}

/** 按当前设置决定要不要震。游戏里死亡、碎甲、吃道具都走这里。 */
export function feedback(event) {
  const request = hapticRequest(currentSettings(), event);
  if (!request) return;
  void runFeedback(request);
}
