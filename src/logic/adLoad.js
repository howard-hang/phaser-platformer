/**
 * 激励视频的同意和加载策略。不引用 Phaser，也不碰广告插件。
 * 同意失败、或者所在地区不需要同意，都要继续请求广告。
 * 加载失败按固定间隔重试，到次数上限就停。测试注入 sleep，不走墙钟。
 */

/** 开局预加载最多试这么多次。 */
export const AD_LOAD_MAX_ATTEMPTS = 4;

/** 两次加载之间的间隔。失败马上再打会把代理上的错误连在一起。 */
export const AD_LOAD_RETRY_MS = 3000;

/**
 * UMP 调试地理里的欧洲。数值和插件的 AdmobConsentDebugGeography.EEA 一致。
 * 只有列进测试设备的机器才会按这个地理弹同意框。
 */
export const DEBUG_CONSENT_GEOGRAPHY_EEA = 1;

/** 调试包等原生写入测试设备的最长时间。启动不等这条，游戏先跑。 */
export const DEBUG_DEVICE_WAIT_TRIES = 30;

export const DEBUG_DEVICE_WAIT_MS = 100;

/**
 * 从 AdMob 的错误对象里取出错误码。
 * 插件有时只在 FailedToLoad 事件里给数字码，Promise 拒绝时只剩 message。
 */
export function adErrorCode(error) {
  if (error == null) return 'unknown';
  if (typeof error === 'number' && Number.isFinite(error)) return String(error);
  if (typeof error === 'string') return error.trim() || 'unknown';
  const numeric = [
    error.code,
    error.errorCode,
    error.data?.code,
    error.data?.errorCode,
  ];
  for (const item of numeric) {
    if (typeof item === 'number' && Number.isFinite(item)) return String(item);
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  const message = error.message || error.data?.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return 'unknown';
}

/**
 * 安卓壳就算被 Capacitor 判成网页，也要去调广告插件。
 * 普通浏览器两边都不是，直接跳过。
 */
export function shouldStartAds({ shell = false, nativePlatform = false } = {}) {
  return !!(shell || nativePlatform);
}

/**
 * 同意结果。任何失败、未知、不需要同意，都 requestAds。
 * 只有表单可用并且状态是 REQUIRED 才弹框。
 */
export function consentDecision(info, { failed = false } = {}) {
  if (failed || !info) {
    return { requestAds: true, showForm: false, status: failed ? 'ERROR' : 'UNKNOWN' };
  }
  const status = info.status || 'UNKNOWN';
  return {
    requestAds: true,
    showForm: !!info.isConsentFormAvailable && status === 'REQUIRED',
    status,
  };
}

/**
 * 调试包强制欧洲地理，并带上测试设备。正式包返回 null，不传调试参数。
 */
export function debugConsentOptions({ debugBuild = false, testDeviceId = '' } = {}) {
  if (!debugBuild) return null;
  const id = String(testDeviceId || '').trim();
  const options = { debugGeography: DEBUG_CONSENT_GEOGRAPHY_EEA };
  if (id) options.testDeviceIdentifiers = [id];
  return options;
}

/** 这一次加载之后是接着等，还是停在已就绪或失败。 */
export function nextLoadPlan({
  attempt,
  ok,
  maxAttempts = AD_LOAD_MAX_ATTEMPTS,
  gapMs = AD_LOAD_RETRY_MS,
} = {}) {
  if (ok) return { status: 'ready', retry: false, waitMs: 0 };
  const more = attempt < maxAttempts;
  return {
    status: more ? 'loading' : 'failed',
    retry: more,
    waitMs: more ? gapMs : 0,
  };
}

/** 设置页调试行用的文案键。失败时外面再填错误码。 */
export function adStatusLabelKey(phase) {
  if (phase === 'consent') return 'settings.adConsent';
  if (phase === 'loading') return 'settings.adLoading';
  if (phase === 'ready') return 'settings.adReady';
  if (phase === 'failed') return 'settings.adFailed';
  return 'settings.adUninitialized';
}

/**
 * 等原生把测试设备哈希写进 window。
 * 写成字符串（可以是空串）就表示查找结束。一直是 undefined 就等到次数用完。
 */
export async function waitForTestDevice({
  read = () => undefined,
  sleep = async () => {},
  tries = DEBUG_DEVICE_WAIT_TRIES,
  gapMs = DEBUG_DEVICE_WAIT_MS,
} = {}) {
  const times = Math.max(0, tries);
  for (let i = 0; i < times; i += 1) {
    const value = read();
    if (typeof value === 'string') return value.trim();
    if (i < times - 1) await sleep(gapMs);
  }
  return '';
}

/**
 * 按次数加载。prepare 返回 true，或 { ok, code }。
 * sleep 由调用方注入，单测里立刻结束，不占用真实时间。
 */
export async function runLoadAttempts({
  prepare,
  sleep = async () => {},
  maxAttempts = AD_LOAD_MAX_ATTEMPTS,
  gapMs = AD_LOAD_RETRY_MS,
  onStatus = () => {},
} = {}) {
  let code = '';
  const limit = Math.max(1, maxAttempts);
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    onStatus({ phase: 'loading', code, attempt });
    let ok = false;
    try {
      const result = await prepare(attempt);
      if (result === true) {
        ok = true;
      } else if (result && typeof result === 'object') {
        ok = !!result.ok;
        if (!ok && result.code) code = String(result.code);
      }
    } catch (error) {
      ok = false;
      code = adErrorCode(error);
    }
    const plan = nextLoadPlan({ attempt, ok, maxAttempts: limit, gapMs });
    if (!plan.retry) {
      const finalCode = ok ? '' : (code || 'unknown');
      onStatus({ phase: plan.status, code: finalCode, attempt });
      return { phase: plan.status, code: finalCode, attempts: attempt };
    }
    await sleep(plan.waitMs);
  }
  const finalCode = code || 'unknown';
  onStatus({ phase: 'failed', code: finalCode, attempt: limit });
  return { phase: 'failed', code: finalCode, attempts: limit };
}

/**
 * 启动顺序：初始化、请求同意、需要时弹框，然后一定去加载广告。
 * 同意接口抛错也不会把加载跳过。
 */
export async function runAdBoot({
  debugBuild = false,
  testing = true,
  readTestDevice = () => undefined,
  sleep = async () => {},
  deviceWaitTries = 0,
  deviceWaitMs = DEBUG_DEVICE_WAIT_MS,
  admob,
  prepare,
  log = () => {},
  onStatus = () => {},
} = {}) {
  onStatus({ phase: 'consent', code: '' });
  log('开始初始化');
  let testDeviceId = '';
  if (debugBuild) {
    testDeviceId = await waitForTestDevice({
      read: readTestDevice,
      sleep,
      tries: deviceWaitTries,
      gapMs: deviceWaitMs,
    });
    log(testDeviceId ? `调试设备 ${testDeviceId}` : '没有测试设备，同意框可能不出现');
  }
  const consentOptions = debugConsentOptions({ debugBuild, testDeviceId });
  const initOptions = { initializeForTesting: !!testing };
  if (testDeviceId) initOptions.testingDevices = [testDeviceId];
  let info = null;
  let consentError = '';
  try {
    log('AdMob.initialize');
    await admob.initialize(initOptions);
    log('initialize 完成');
    log(`requestConsentInfo ${JSON.stringify(consentOptions || {})}`);
    info = await admob.requestConsentInfo(consentOptions || undefined);
    log(`同意信息 status=${info?.status} canRequestAds=${!!info?.canRequestAds} form=${!!info?.isConsentFormAvailable}`);
  } catch (error) {
    consentError = adErrorCode(error);
    log(`同意流程失败 code=${consentError}，仍继续请求广告`);
  }
  const decision = consentDecision(info, { failed: !!consentError });
  if (!consentError && decision.showForm) {
    try {
      log('弹出同意框');
      const shown = await admob.showConsentForm();
      log(`同意框结束 status=${shown?.status} canRequestAds=${!!shown?.canRequestAds}`);
    } catch (error) {
      log(`同意框失败 code=${adErrorCode(error)}，仍继续请求广告`);
    }
  } else if (!consentError) {
    log(`不弹同意框 status=${decision.status}，继续请求广告`);
  }
  log('开始预加载激励视频');
  await prepare();
}
