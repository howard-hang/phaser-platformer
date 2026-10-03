/**
 * 安卓激励视频。网页不加载 AdMob。
 * 只准备复活这一个广告位。开局就预加载，不等到死亡。
 * 同意失败、或者地区不需要同意，也照样请求广告。
 */
import { isNativeShell } from './androidBack.js';
import { BAKED_AD_MODE, currentRewardedSelection, isDebugAdBuild } from './admob.config.js';
import { interpretRewardedCallbacks } from '../logic/revive.js';
import {
  AD_LOAD_MAX_ATTEMPTS,
  AD_LOAD_RETRY_MS,
  DEBUG_DEVICE_WAIT_MS,
  DEBUG_DEVICE_WAIT_TRIES,
  adErrorCode,
  runAdBoot,
  runLoadAttempts,
  shouldStartAds,
} from '../logic/adLoad.js';

const listeners = new Set();
const state = { phase: 'uninitialized', code: '' };

let bootGen = 0;
let loadPromise = null;
let loadGen = 0;
let exhausted = false;
/** 启动流程开始之后，播完一条可以再加载。启动前的未初始化不能自己去加载。 */
let sessionStarted = false;

function admobLog(message, extra) {
  if (extra === undefined) console.log(`[admob] ${message}`);
  else console.log(`[admob] ${message}`, extra);
}

function mockAds() {
  if (typeof window === 'undefined') return null;
  const mock = window.__FANGKUAI_AD_MOCK__;
  if (!mock || typeof mock !== 'object') return null;
  // 真机壳会自己挂上 Capacitor。那种环境不吃网页里塞的假回调。
  if (window.Capacitor?.isNativePlatform?.()) return null;
  return mock;
}

function readTestDevice() {
  if (typeof window === 'undefined') return undefined;
  const value = window.__FANGKUAI_AD_TEST_DEVICE__;
  return typeof value === 'string' ? value : undefined;
}

function sleepMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 当前广告状态。设置页调试行读这个。 */
export function getAdStatus() {
  return { phase: state.phase, code: state.code };
}

/** 状态一变就通知。返回取消订阅。 */
export function onAdStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setStatus(phase, code = '', gen = bootGen) {
  if (gen !== bootGen) return;
  const nextCode = code || '';
  if (state.phase === phase && state.code === nextCode) return;
  state.phase = phase;
  state.code = nextCode;
  admobLog(nextCode ? `状态 ${phase} code=${nextCode}` : `状态 ${phase}`);
  const snap = getAdStatus();
  listeners.forEach((listener) => {
    try {
      listener(snap);
    } catch (error) {
      admobLog(`状态监听失败 code=${adErrorCode(error)}`);
    }
  });
}

/** 给复活按钮用。假广告没有 phase 时，准备好就是已就绪，否则算失败。 */
export function rewardedPhase() {
  const mock = mockAds();
  if (mock) {
    if (typeof mock.phase === 'string' && mock.phase) return mock.phase;
    return mock.ready ? 'ready' : 'failed';
  }
  return state.phase;
}

/** 广告已经在手里，按钮可以点。 */
export function isRewardedReady() {
  return rewardedPhase() === 'ready';
}

async function loadOnce(attempt) {
  const selection = currentRewardedSelection();
  const { AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob');
  let code = '';
  // 拒绝的 Promise 往往不带数字码，数字码在 FailedToLoad 上。
  const handle = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (error) => {
    code = adErrorCode(error);
    admobLog(`FailedToLoad code=${code}`, error);
  });
  try {
    admobLog(`prepareRewardVideoAd 第 ${attempt}/${AD_LOAD_MAX_ATTEMPTS} 次 adId=${selection.adId} isTesting=${selection.isTesting}`);
    await AdMob.prepareRewardVideoAd({
      adId: selection.adId,
      isTesting: selection.isTesting,
      immersiveMode: true,
    });
    admobLog('prepareRewardVideoAd 成功');
    return { ok: true };
  } catch (error) {
    const resolved = code || adErrorCode(error);
    admobLog(`prepareRewardVideoAd 失败 code=${resolved}`, error);
    return { ok: false, code: resolved };
  } finally {
    try {
      await handle.remove();
    } catch {
      // 监听拆不掉也要继续重试。
    }
  }
}

function startLoad(gen) {
  if (loadPromise && loadGen === gen) return loadPromise;
  loadGen = gen;
  exhausted = false;
  loadPromise = runLoadAttempts({
    prepare: (attempt) => loadOnce(attempt),
    sleep: sleepMs,
    onStatus: (snap) => setStatus(snap.phase, snap.code, gen),
  }).then((result) => {
    if (gen !== bootGen) return result;
    exhausted = result.phase === 'failed';
    admobLog(`预加载结束 phase=${result.phase} code=${result.code || '-'} attempts=${result.attempts}`);
    return result;
  }).finally(() => {
    if (loadGen === gen) loadPromise = null;
  });
  return loadPromise;
}

function shellCanCallPlugin() {
  const nativePlatform = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
  return shouldStartAds({ shell: isNativeShell(), nativePlatform });
}

/**
 * 预先加载一条激励视频。
 * 同意还没走完时不另开一条加载。次数用尽后停在失败，等重置或下次启动。
 */
export function prepareRewarded() {
  const mock = mockAds();
  if (mock) return Promise.resolve(!!mock.ready);
  if (!shellCanCallPlugin()) return Promise.resolve(false);
  if (state.phase === 'ready') return Promise.resolve(true);
  if (exhausted) return Promise.resolve(false);
  if (loadPromise) return loadPromise;
  // 同意还没结束，或启动流程还没开始，不要另开一条加载。
  if (state.phase === 'consent' || !sessionStarted) return Promise.resolve(false);
  return startLoad(bootGen);
}

function rewardCounts(item) {
  if (!item || typeof item !== 'object') return false;
  if (Number(item.amount) > 0) return true;
  return typeof item.type === 'string' && item.type.length > 0;
}

/** 这条已经播过。清掉「已就绪」，下次死亡可以再加载。 */
function markAdConsumed() {
  exhausted = false;
  if (state.phase === 'ready') setStatus('uninitialized');
}

async function showNative() {
  const prepared = await prepareRewarded();
  if (!prepared || !isRewardedReady()) return interpretRewardedCallbacks({ prepared: false });
  let AdMob;
  let RewardAdPluginEvents;
  try {
    ({ AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob'));
  } catch (error) {
    admobLog(`加载插件失败 code=${adErrorCode(error)}`);
    return interpretRewardedCallbacks({ failed: true });
  }
  const selection = currentRewardedSelection();
  const handles = [];
  const drop = () => {
    handles.forEach((handle) => {
      try {
        handle.remove();
      } catch {
        // 监听拆不掉也不要卡住结算。
      }
    });
  };
  let earned = false;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      drop();
      markAdConsumed();
      resolve(result);
    };
    const arm = async () => {
      handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, (item) => {
        if (rewardCounts(item)) earned = true;
        admobLog(`Rewarded amount=${item?.amount} type=${item?.type || ''}`);
      }));
      handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        admobLog(`Dismissed earned=${earned}`);
        finish(interpretRewardedCallbacks({ earned, dismissed: true }));
      }));
      handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error) => {
        admobLog(`FailedToShow code=${adErrorCode(error)}`, error);
        finish(interpretRewardedCallbacks({ failed: true }));
      }));
      try {
        admobLog(`showRewardVideoAd adId=${selection.adId}`);
        const reward = await AdMob.showRewardVideoAd({ adId: selection.adId });
        if (rewardCounts(reward)) earned = true;
        admobLog(`showRewardVideoAd 返回 amount=${reward?.amount} type=${reward?.type || ''}`);
      } catch (error) {
        // 没加载好，或者玩家把视频关掉了。关掉时插件不会 resolve，等 Dismissed。
        admobLog(`showRewardVideoAd 失败 code=${adErrorCode(error)}`, error);
        finish(interpretRewardedCallbacks({
          earned,
          dismissed: !earned,
          prepared: true,
        }));
      }
    };
    arm().catch((error) => {
      admobLog(`挂监听失败 code=${adErrorCode(error)}`);
      finish(interpretRewardedCallbacks({ failed: true }));
    });
  });
}

function showMock() {
  const mock = mockAds();
  if (!mock?.ready) return interpretRewardedCallbacks({ prepared: false });
  if (mock.outcome === 'error') {
    mock.ready = false;
    return interpretRewardedCallbacks({ failed: true });
  }
  if (mock.outcome === 'dismissed') {
    mock.ready = false;
    return interpretRewardedCallbacks({ dismissed: true });
  }
  mock.ready = false;
  return interpretRewardedCallbacks({
    earned: true,
    dismissed: true,
  });
}

/** 播放激励视频。返回值和复活逻辑用的是同一种结果。 */
export async function showRewarded() {
  if (mockAds()) return showMock();
  if (!shellCanCallPlugin()) return interpretRewardedCallbacks({ prepared: false });
  try {
    return await showNative();
  } catch (error) {
    admobLog(`播放失败 code=${adErrorCode(error)}`);
    markAdConsumed();
    setStatus('failed', adErrorCode(error));
    return interpretRewardedCallbacks({ failed: true });
  }
}

async function pluginClient() {
  const { AdMob } = await import('@capacitor-community/admob');
  return {
    initialize: async (options) => {
      admobLog(`AdMob.initialize ${JSON.stringify(options)}`);
      await AdMob.initialize(options);
    },
    requestConsentInfo: async (options) => {
      admobLog(`requestConsentInfo ${JSON.stringify(options || {})}`);
      const info = await AdMob.requestConsentInfo(options);
      admobLog(`同意信息 ${JSON.stringify(info)}`);
      return info;
    },
    showConsentForm: async () => {
      admobLog('showConsentForm');
      const info = await AdMob.showConsentForm();
      admobLog(`同意框结束 ${JSON.stringify(info)}`);
      return info;
    },
  };
}

/**
 * 启动时初始化 AdMob，走 UMP，然后预加载。
 * 调试包会等测试设备哈希，并用欧洲地理强制同意框。
 */
export async function bootRewardedAds() {
  if (mockAds()) {
    admobLog('使用假广告，跳过原生初始化');
    return;
  }
  let nativePlatform = false;
  let pluginAvailable = false;
  try {
    const { Capacitor } = await import('@capacitor/core');
    nativePlatform = !!Capacitor.isNativePlatform?.();
    pluginAvailable = !!Capacitor.isPluginAvailable?.('AdMob');
  } catch (error) {
    admobLog(`加载 Capacitor 失败 code=${adErrorCode(error)}`);
  }
  const shell = isNativeShell();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  admobLog(`平台 shell=${shell} native=${nativePlatform} plugin=${pluginAvailable} debug=${isDebugAdBuild()} mode=${BAKED_AD_MODE} bridge=${typeof window !== 'undefined' && !!window.androidBridge} ua=${ua}`);
  if (!shouldStartAds({ shell, nativePlatform })) {
    admobLog('网页环境，不初始化广告');
    return;
  }
  if (shell && !nativePlatform) {
    admobLog('安卓壳被 Capacitor 判成网页，仍继续初始化');
  }
  if (!pluginAvailable) {
    admobLog('PluginHeaders 里没有 AdMob，仍尝试调用');
  }
  const gen = ++bootGen;
  exhausted = false;
  sessionStarted = true;
  setStatus('consent', '', gen);
  const selection = currentRewardedSelection();
  try {
    const admob = await pluginClient();
    if (gen !== bootGen) return;
    await runAdBoot({
      debugBuild: isDebugAdBuild(),
      testing: selection.isTesting,
      readTestDevice,
      sleep: sleepMs,
      deviceWaitTries: isDebugAdBuild() ? DEBUG_DEVICE_WAIT_TRIES : 0,
      deviceWaitMs: DEBUG_DEVICE_WAIT_MS,
      admob,
      prepare: () => {
        if (gen !== bootGen) return null;
        return startLoad(gen);
      },
      log: admobLog,
      onStatus: (snap) => setStatus(snap.phase, snap.code, gen),
    });
  } catch (error) {
    const code = adErrorCode(error);
    admobLog(`启动失败 code=${code}`, error);
    setStatus('failed', code, gen);
  }
}

/** 清掉 UMP 记录并重新走同意和预加载。设置页调试入口用。 */
export async function resetAdConsent() {
  admobLog('重置广告同意');
  exhausted = false;
  try {
    const { AdMob } = await import('@capacitor-community/admob');
    await AdMob.resetConsentInfo();
    admobLog('resetConsentInfo 完成');
  } catch (error) {
    admobLog(`resetConsentInfo 失败 code=${adErrorCode(error)}，仍重新请求`, error);
  }
  await bootRewardedAds();
}
