/**
 * 激励视频复活。广告回调是注入的，不连真广告，也不等墙钟。
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { adMusicPhase } from '../src/game/audioPolicy.js';
import {
  ADMOB_APP_ID,
  REWARDED_AD_NAME,
  REWARDED_AD_UNIT_ID,
  REWARDED_AMOUNT,
  TEST_REWARDED_AD_UNIT_ID,
  rewardedAdSelection,
  shouldUseTestAds,
} from '../src/platform/admob.config.js';
import {
  REVIVE_BACK_PX,
  REVIVE_INVULN_MS,
  applyReviveDecision,
  createReviveBudget,
  interpretRewardedCallbacks,
  keepRunOnRevive,
  playReviveAd,
  reviveButtonState,
  revivePoint,
  reviveStillAvailable,
} from '../src/logic/revive.js';

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'assets' || entry.name === 'node_modules') continue;
      walk(full, acc);
      continue;
    }
    if (!/\.(js|json)$/.test(entry.name)) continue;
    acc.push(full.split(path.sep).join('/'));
  }
  return acc;
}

function filesContaining(root, text) {
  return walk(root).filter((file) => fs.readFileSync(file, 'utf8').includes(text));
}

describe('复活落点和次数', () => {
  it('从死亡点往回退一小段，并给 1 秒无敌', () => {
    const spot = revivePoint(2400, 240);
    expect(spot.x).toBe(2400 - REVIVE_BACK_PX);
    expect(spot.invulnMs).toBe(1000);
    expect(REVIVE_INVULN_MS).toBe(1000);
  });

  it('退不到起跑线前面', () => {
    expect(revivePoint(300, 240).x).toBe(240);
    expect(revivePoint(240, 240).x).toBe(240);
  });

  it('一局只能成功复活一次', () => {
    let budget = createReviveBudget();
    expect(reviveStillAvailable(budget)).toBe(true);
    const first = applyReviveDecision(budget, { granted: true });
    expect(first.revived).toBe(true);
    budget = first.budget;
    expect(reviveStillAvailable(budget)).toBe(false);
    const second = applyReviveDecision(budget, { granted: true });
    expect(second.revived).toBe(false);
    expect(second.budget).toEqual(budget);
  });

  it('没看完不扣次数，星星、距离和分数都留着', () => {
    const budget = createReviveBudget();
    const denied = applyReviveDecision(budget, { granted: false, reason: 'dismissed' });
    expect(denied.revived).toBe(false);
    expect(reviveStillAvailable(denied.budget)).toBe(true);
    const collected = new Set(['a', 'b']);
    const kept = keepRunOnRevive({
      score: 80,
      deaths: 2,
      stars: 2,
      maxDistance: 3200,
      collected,
    });
    expect(kept).toMatchObject({
      score: 80,
      deaths: 2,
      stars: 2,
      maxDistance: 3200,
    });
    expect(kept.collected).toBe(collected);
  });
});

describe('广告回调', () => {
  it('只有拿到奖励才复活，关掉、失败、没加载好都不给', () => {
    expect(interpretRewardedCallbacks({ earned: true, dismissed: true })).toEqual({
      rewarded: true,
      reason: 'rewarded',
    });
    expect(interpretRewardedCallbacks({ dismissed: true }).rewarded).toBe(false);
    expect(interpretRewardedCallbacks({ failed: true, earned: true }).rewarded).toBe(false);
    expect(interpretRewardedCallbacks({ prepared: false }).reason).toBe('unavailable');
  });

  it('假回调立刻返回，音乐先停再恢复，不依赖墙钟', async () => {
    const music = [];
    const granted = await playReviveAd({
      adReady: true,
      show: async () => ({ rewarded: true, reason: 'rewarded' }),
      onMusic: (phase) => music.push(adMusicPhase(phase)),
    });
    expect(granted).toEqual({ granted: true, reason: 'rewarded' });
    expect(music).toEqual(['pause', 'resume']);

    const closed = [];
    const denied = await playReviveAd({
      adReady: true,
      show: async () => interpretRewardedCallbacks({ dismissed: true }),
      onMusic: (phase) => closed.push(phase),
    });
    expect(denied.granted).toBe(false);
    expect(denied.reason).toBe('dismissed');
    expect(closed).toEqual(['showing', 'ended']);

    const offline = await playReviveAd({
      adReady: false,
      show: async () => {
        throw new Error('不该播');
      },
      onMusic: () => {
        throw new Error('没广告不该动音乐');
      },
    });
    expect(offline).toEqual({ granted: false, reason: 'unavailable' });

    const broken = await playReviveAd({
      adReady: true,
      show: async () => {
        throw new Error('没网');
      },
      onMusic: (phase) => phase,
    });
    expect(broken).toEqual({ granted: false, reason: 'error' });
  });

  it('网页不显示按钮，没广告时按钮不可用', () => {
    const budget = createReviveBudget();
    expect(reviveButtonState({ native: false, budget, adReady: true }).visible).toBe(false);
    const empty = reviveButtonState({ native: true, budget, adReady: false });
    expect(empty).toEqual({ visible: true, enabled: false, labelKey: 'revive.unavailable' });
    const ready = reviveButtonState({ native: true, budget, adReady: true });
    expect(ready).toEqual({ visible: true, enabled: true, labelKey: 'revive.watch' });
    const used = applyReviveDecision(budget, { granted: true }).budget;
    expect(reviveButtonState({ native: true, budget: used, adReady: true }).visible).toBe(false);
  });
});

describe('广告位配置', () => {
  it('默认和调试包用测试激励位并打开 isTesting', () => {
    expect(shouldUseTestAds({})).toBe(true);
    expect(shouldUseTestAds({ flag: undefined, debugApk: true })).toBe(true);
    expect(shouldUseTestAds({ flag: 'false', debugApk: true })).toBe(true);
    const testAd = rewardedAdSelection({ flag: undefined, debugApk: true });
    expect(testAd).toMatchObject({
      adId: TEST_REWARDED_AD_UNIT_ID,
      isTesting: true,
      name: REWARDED_AD_NAME,
      rewardAmount: REWARDED_AMOUNT,
    });
    expect(TEST_REWARDED_AD_UNIT_ID).toBe('ca-app-pub-3940256099942544/5224354917');
    expect(REWARDED_AMOUNT).toBe(1);
  });

  it('只有正式开关关掉且不是调试包才用真实广告位', () => {
    const live = rewardedAdSelection({ flag: 'false', debugApk: false });
    expect(live.adId).toBe(REWARDED_AD_UNIT_ID);
    expect(live.isTesting).toBe(false);
    expect(live.adId).toBe('ca-app-pub-3218611878548189/5871324026');
    expect(ADMOB_APP_ID).toBe('ca-app-pub-3218611878548189~9810569030');
    expect(rewardedAdSelection({ flag: 'true' }).isTesting).toBe(true);
    expect(rewardedAdSelection({}).isTesting).toBe(true);
  });

  it('两个正式 ID 只写在配置里，应用 ID 进了 AndroidManifest', () => {
    expect(filesContaining('src', ADMOB_APP_ID)).toEqual(['src/platform/admob.config.js']);
    expect(filesContaining('src', REWARDED_AD_UNIT_ID)).toEqual(['src/platform/admob.config.js']);
    expect(filesContaining('src', TEST_REWARDED_AD_UNIT_ID)).toEqual(['src/platform/admob.config.js']);
    const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
    expect(manifest).toContain('android:name="com.google.android.gms.ads.APPLICATION_ID"');
    expect(manifest).toContain(`android:value="${ADMOB_APP_ID}"`);
  });
});
