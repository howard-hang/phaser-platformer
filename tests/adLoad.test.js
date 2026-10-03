/**
 * 同意和预加载策略。广告插件是注入的，sleep 也不走墙钟。
 */
import { describe, expect, it } from 'vitest';
import { AdmobConsentDebugGeography } from '@capacitor-community/admob';
import {
  AD_LOAD_MAX_ATTEMPTS,
  AD_LOAD_RETRY_MS,
  DEBUG_CONSENT_GEOGRAPHY_EEA,
  adErrorCode,
  adStatusLabelKey,
  consentDecision,
  debugConsentOptions,
  nextLoadPlan,
  runAdBoot,
  runLoadAttempts,
  shouldStartAds,
  waitForTestDevice,
} from '../src/logic/adLoad.js';

describe('原生平台判断', () => {
  it('安卓壳即使被判成网页也要启动广告', () => {
    expect(shouldStartAds({ shell: false, nativePlatform: false })).toBe(false);
    expect(shouldStartAds({ shell: true, nativePlatform: false })).toBe(true);
    expect(shouldStartAds({ shell: false, nativePlatform: true })).toBe(true);
  });
});

describe('广告错误码', () => {
  it('优先用数字码，没有就用 message', () => {
    expect(adErrorCode({ code: 2, message: 'Network error' })).toBe('2');
    expect(adErrorCode({ data: { errorCode: 3 } })).toBe('3');
    expect(adErrorCode({ message: '没网' })).toBe('没网');
    expect(adErrorCode(null)).toBe('unknown');
    expect(adErrorCode('')).toBe('unknown');
  });
});

describe('同意', () => {
  it('失败、不需要同意、不能请求时都仍然请求广告', () => {
    expect(consentDecision(null, { failed: true })).toMatchObject({ requestAds: true, showForm: false });
    expect(consentDecision({ status: 'NOT_REQUIRED', canRequestAds: true, isConsentFormAvailable: false }))
      .toMatchObject({ requestAds: true, showForm: false, status: 'NOT_REQUIRED' });
    expect(consentDecision({ status: 'UNKNOWN', canRequestAds: false, isConsentFormAvailable: false }))
      .toMatchObject({ requestAds: true, showForm: false });
    expect(consentDecision({ status: 'REQUIRED', canRequestAds: false, isConsentFormAvailable: true }))
      .toMatchObject({ requestAds: true, showForm: true });
  });

  it('调试包用欧洲地理和测试设备，正式包不带调试参数', () => {
    expect(DEBUG_CONSENT_GEOGRAPHY_EEA).toBe(AdmobConsentDebugGeography.EEA);
    expect(debugConsentOptions({ debugBuild: false, testDeviceId: 'ABC' })).toBeNull();
    expect(debugConsentOptions({ debugBuild: true, testDeviceId: 'ABC123' })).toEqual({
      debugGeography: DEBUG_CONSENT_GEOGRAPHY_EEA,
      testDeviceIdentifiers: ['ABC123'],
    });
    expect(debugConsentOptions({ debugBuild: true, testDeviceId: '' })).toEqual({
      debugGeography: DEBUG_CONSENT_GEOGRAPHY_EEA,
    });
  });

  it('同意失败或地区不需要同意时仍然初始化并预加载', async () => {
    const calls = [];
    const fail = {
      initialize: async () => { calls.push('init'); },
      requestConsentInfo: async () => { throw new Error('proxy'); },
      showConsentForm: async () => { throw new Error('不该弹'); },
    };
    await runAdBoot({
      debugBuild: false,
      testing: true,
      admob: fail,
      prepare: async () => { calls.push('prepare'); },
      log: () => {},
    });
    expect(calls).toEqual(['init', 'prepare']);

    const quiet = [];
    await runAdBoot({
      debugBuild: true,
      testing: true,
      readTestDevice: () => 'DEVICE',
      deviceWaitTries: 1,
      admob: {
        initialize: async (options) => { quiet.push(options); },
        requestConsentInfo: async (options) => {
          quiet.push(options);
          return { status: 'NOT_REQUIRED', canRequestAds: false, isConsentFormAvailable: false };
        },
        showConsentForm: async () => { throw new Error('不该弹'); },
      },
      prepare: async () => { quiet.push('prepare'); },
      log: () => {},
    });
    expect(quiet[0]).toMatchObject({
      initializeForTesting: true,
      testingDevices: ['DEVICE'],
    });
    expect(quiet[1]).toEqual({
      debugGeography: DEBUG_CONSENT_GEOGRAPHY_EEA,
      testDeviceIdentifiers: ['DEVICE'],
    });
    expect(quiet).toContain('prepare');
  });

  it('需要同意时先弹框，弹框失败也继续加载', async () => {
    const steps = [];
    await runAdBoot({
      debugBuild: false,
      admob: {
        initialize: async () => { steps.push('init'); },
        requestConsentInfo: async () => ({
          status: 'REQUIRED',
          isConsentFormAvailable: true,
          canRequestAds: false,
        }),
        showConsentForm: async () => {
          steps.push('form');
          throw new Error('form-3');
        },
      },
      prepare: async () => { steps.push('prepare'); },
      log: () => {},
    });
    expect(steps).toEqual(['init', 'form', 'prepare']);
  });

  it('调试设备要等原生写完再读，不等墙钟', async () => {
    let value;
    const gaps = [];
    const id = await waitForTestDevice({
      read: () => value,
      sleep: async (ms) => {
        gaps.push(ms);
        value = 'HASH';
      },
      tries: 3,
      gapMs: 100,
    });
    expect(id).toBe('HASH');
    expect(gaps).toEqual([100]);
    const empty = await waitForTestDevice({
      read: () => '',
      sleep: async () => { throw new Error('已经写过空串，不该再等'); },
      tries: 3,
    });
    expect(empty).toBe('');
  });
});

describe('预加载重试', () => {
  it('失败隔开再试，成功就停', async () => {
    const waits = [];
    const phases = [];
    const result = await runLoadAttempts({
      prepare: async (attempt) => (attempt < 3 ? { ok: false, code: '2' } : { ok: true }),
      sleep: async (ms) => { waits.push(ms); },
      onStatus: (snap) => phases.push(`${snap.phase}:${snap.code}`),
    });
    expect(waits).toEqual([AD_LOAD_RETRY_MS, AD_LOAD_RETRY_MS]);
    expect(result).toMatchObject({ phase: 'ready', code: '', attempts: 3 });
    expect(phases[0]).toBe('loading:');
    expect(phases.at(-1)).toBe('ready:');
  });

  it('到次数上限就停在失败，并带上错误码', async () => {
    let tries = 0;
    const result = await runLoadAttempts({
      prepare: async () => {
        tries += 1;
        return { ok: false, code: '3' };
      },
      sleep: async () => {},
      maxAttempts: AD_LOAD_MAX_ATTEMPTS,
    });
    expect(tries).toBe(AD_LOAD_MAX_ATTEMPTS);
    expect(result).toMatchObject({ phase: 'failed', code: '3', attempts: AD_LOAD_MAX_ATTEMPTS });
    expect(nextLoadPlan({ attempt: 4, ok: false, maxAttempts: 4 }).retry).toBe(false);
    expect(adStatusLabelKey('failed')).toBe('settings.adFailed');
    expect(adStatusLabelKey('ready')).toBe('settings.adReady');
    expect(adStatusLabelKey('consent')).toBe('settings.adConsent');
    expect(adStatusLabelKey('loading')).toBe('settings.adLoading');
    expect(adStatusLabelKey('uninitialized')).toBe('settings.adUninitialized');
  });
});
