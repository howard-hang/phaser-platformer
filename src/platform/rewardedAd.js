/**
 * 安卓激励视频。网页和测试页面不加载 AdMob。
 * 只准备复活这一个广告位，不开屏、不挂横幅、不插屏。
 * 首次启动走插件自带的 UMP 同意框，同意之后才去加载广告。
 */
import { isNativeShell } from './androidBack.js';
import { currentRewardedSelection } from './admob.config.js';
import { interpretRewardedCallbacks } from '../logic/revive.js';

let consentAllowsAds = false;
let ready = false;
let readyKey = '';
let preparing = null;

function mockAds() {
  if (typeof window === 'undefined') return null;
  const mock = window.__FANGKUAI_AD_MOCK__;
  if (!mock || typeof mock !== 'object') return null;
  // 真机壳会自己挂上 Capacitor。那种环境不吃网页里塞的假回调。
  if (window.Capacitor?.isNativePlatform?.()) return null;
  return mock;
}

function selectionKey(selection) {
  return `${selection.adId}:${selection.isTesting}`;
}

/** 广告已经在手里，按钮可以点。 */
export function isRewardedReady() {
  const mock = mockAds();
  if (mock) return !!mock.ready;
  const selection = currentRewardedSelection();
  return ready && readyKey === selectionKey(selection);
}

/**
 * 预先加载一条激励视频。失败、没网、还没同意都返回 false，游戏继续。
 */
export async function prepareRewarded() {
  const mock = mockAds();
  if (mock) return !!mock.ready;
  if (!isNativeShell() || !consentAllowsAds) return false;
  const selection = currentRewardedSelection();
  const key = selectionKey(selection);
  if (ready && readyKey === key) return true;
  if (preparing) return preparing;
  preparing = (async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return false;
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.prepareRewardVideoAd({
        adId: selection.adId,
        isTesting: selection.isTesting,
        immersiveMode: true,
      });
      ready = true;
      readyKey = key;
      return true;
    } catch {
      ready = false;
      readyKey = '';
      return false;
    } finally {
      preparing = null;
    }
  })();
  return preparing;
}

function rewardCounts(item) {
  if (!item || typeof item !== 'object') return false;
  if (Number(item.amount) > 0) return true;
  return typeof item.type === 'string' && item.type.length > 0;
}

async function showNative() {
  const prepared = await prepareRewarded();
  if (!prepared) return interpretRewardedCallbacks({ prepared: false });
  let AdMob;
  let RewardAdPluginEvents;
  try {
    ({ AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob'));
  } catch {
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
      ready = false;
      readyKey = '';
      resolve(result);
    };
    const arm = async () => {
      handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, (item) => {
        if (rewardCounts(item)) earned = true;
      }));
      handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        finish(interpretRewardedCallbacks({ earned, dismissed: true }));
      }));
      handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => {
        finish(interpretRewardedCallbacks({ failed: true }));
      }));
      try {
        const reward = await AdMob.showRewardVideoAd({ adId: selection.adId });
        if (rewardCounts(reward)) earned = true;
      } catch {
        // 没加载好，或者玩家把视频关掉了。关掉时插件不会 resolve，等 Dismissed。
        // 这里是还没播出来就失败，直接结束。
        finish(interpretRewardedCallbacks({
          earned,
          dismissed: !earned,
          prepared: true,
        }));
      }
    };
    arm().catch(() => finish(interpretRewardedCallbacks({ failed: true })));
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
  if (!isNativeShell()) return interpretRewardedCallbacks({ prepared: false });
  try {
    return await showNative();
  } catch {
    ready = false;
    readyKey = '';
    return interpretRewardedCallbacks({ failed: true });
  }
}

/**
 * 启动时初始化 AdMob，并按 Google 的要求弹出 UMP 同意框。
 * 网页直接返回。任何失败都吞掉，结算按钮会显示暂无广告。
 */
export async function bootRewardedAds() {
  if (mockAds()) return;
  if (!isNativeShell()) return;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { AdMob, AdmobConsentStatus } = await import('@capacitor-community/admob');
    const selection = currentRewardedSelection();
    await AdMob.initialize({
      initializeForTesting: selection.isTesting,
    });
    let info = await AdMob.requestConsentInfo();
    const required = AdmobConsentStatus?.REQUIRED || 'REQUIRED';
    if (info?.isConsentFormAvailable && info.status === required) {
      info = await AdMob.showConsentForm();
    }
    consentAllowsAds = !!info?.canRequestAds;
    if (consentAllowsAds) await prepareRewarded();
  } catch {
    consentAllowsAds = false;
    ready = false;
    readyKey = '';
  }
}
