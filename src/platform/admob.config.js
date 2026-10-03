/**
 * AdMob 只接复活这一个激励视频位。正式 ID 只写在这个文件里。
 * 应用 ID 还要出现在 AndroidManifest 的 APPLICATION_ID，测试会核对两边一致。
 *
 * 开发版和调试 APK 用 Google 官方测试激励位，并打开 isTesting。
 * 正式 release 包才用真实广告位：构建时设 VITE_ADMOB_USE_TEST_ADS=false。
 * 不设这个变量时一律走测试广告，所以 CI 的调试包不会请求正式位。
 * 调试包还会由原生壳写入 window.__FANGKUAI_DEBUG_APK__，即使误关了开关也仍是测试广告。
 */

/** 方块跑酷的 AdMob 应用 ID。 */
export const ADMOB_APP_ID = 'ca-app-pub-3218611878548189~9810569030';

/** 激励位 revive_rewarded，奖励 1 次复活。 */
export const REWARDED_AD_UNIT_ID = 'ca-app-pub-3218611878548189/5871324026';

export const REWARDED_AD_NAME = 'revive_rewarded';

export const REWARDED_AMOUNT = 1;

/** Google 官方 Android 激励视频测试位。 */
export const TEST_REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';

/**
 * 要不要用测试广告。
 * debugApk 为 true 时强制测试，盖过正式开关。
 * flag 只有明确是 false 才放行真实广告位。
 */
export function shouldUseTestAds({ flag, debugApk } = {}) {
  if (debugApk === true) return true;
  return flag !== 'false' && flag !== false;
}

/** 当前这次请求该用的广告位和 isTesting。 */
export function rewardedAdSelection(options) {
  const testing = shouldUseTestAds(options);
  return {
    adId: testing ? TEST_REWARDED_AD_UNIT_ID : REWARDED_AD_UNIT_ID,
    isTesting: testing,
    name: REWARDED_AD_NAME,
    rewardAmount: REWARDED_AMOUNT,
  };
}

/**
 * 这次网页构建是正式广告还是测试广告。
 * 打进包里的字面量是 live-rewarded 或 test-rewarded，CI 用它区分两种包。
 */
export function adBuildMode(flag) {
  return flag === 'false' ? 'live-rewarded' : 'test-rewarded';
}

/**
 * 读 Vite 注入的开关。
 * 必须写成 import.meta.env.NAME。可选链不会被替换，正式包会一直落到测试广告。
 */
function readViteTestFlag() {
  try {
    return import.meta.env.VITE_ADMOB_USE_TEST_ADS;
  } catch {
    return undefined;
  }
}

function viteTestFlag() {
  return readViteTestFlag();
}

/** 构建时写死。正式包是 live-rewarded，调试包和本地开发是 test-rewarded。 */
export const BAKED_AD_MODE = adBuildMode(readViteTestFlag());

/**
 * 设置页的广告状态和「重置广告同意」只给调试包。
 * 正式网页构建即使被打进可调试壳，也不再画这两项。
 */
export function showDebugAdChrome({ debugBuild = false, bakedMode = 'test-rewarded' } = {}) {
  return debugBuild === true && bakedMode !== 'live-rewarded';
}

export function shouldShowDebugAdChrome() {
  return showDebugAdChrome({
    debugBuild: isDebugAdBuild(),
    bakedMode: BAKED_AD_MODE,
  });
}

/**
 * 调试包。Capacitor.DEBUG 在页面脚本之前就写好了，比 MainActivity 再注入的标记更早。
 * 正式包两个都是 false。
 */
export function isDebugAdBuild() {
  if (typeof window === 'undefined') return false;
  if (window.__FANGKUAI_DEBUG_APK__ === true) return true;
  if (window.Capacitor?.DEBUG === true) return true;
  return false;
}

function debugApkFlag() {
  if (isDebugAdBuild()) return true;
  if (typeof window === 'undefined') return undefined;
  if (window.__FANGKUAI_DEBUG_APK__ === false) return false;
  return undefined;
}

/** 读构建变量和调试包标记，得到这一次该请求的广告位。 */
export function currentRewardedSelection() {
  return rewardedAdSelection({
    flag: viteTestFlag(),
    debugApk: debugApkFlag(),
  });
}
