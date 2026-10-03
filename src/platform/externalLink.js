/**
 * 设置页打开隐私政策。
 * 安卓壳优先走 MainActivity 注入的 FangkuaiLinks，只允许 GitHub Pages 这个主机。
 * 没有这条桥时，壳里改地址会让 Capacitor 用系统浏览器打开外链；网页则开新标签。
 */
import { isNativeShell } from './androidBack.js';

/** 和 GitHub Pages 上的 privacy.html 是同一个地址。Play 商店后台也填这个。 */
export const PRIVACY_POLICY_URL = 'https://howard-hang.github.io/phaser-platformer/privacy.html';

/** 主机必须和 MainActivity.ExternalLinkBridge 允许的主机一致。 */
export function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'howard-hang.github.io';
  } catch {
    return false;
  }
}

/** 用户点了隐私政策。不合规的地址直接丢掉。 */
export function openExternal(url) {
  if (!isAllowedExternalUrl(url)) return;
  const bridge = typeof window !== 'undefined' ? window.FangkuaiLinks : null;
  if (bridge && typeof bridge.open === 'function') {
    bridge.open(url);
    return;
  }
  if (typeof window === 'undefined') return;
  if (isNativeShell()) {
    window.location.assign(url);
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
}
