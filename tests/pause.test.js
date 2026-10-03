/**
 * 暂停、继续倒数，以及开局领道具的次数。
 * 时间用传入的游戏 delta，不看墙钟。
 */
import { describe, expect, it } from 'vitest';
import { POWERUP_CONFIG } from '../src/game/powerupConfig.js';
import {
  POWERUP_REWARDED_AD_UNIT_ID,
  POWERUP_REWARDED_NAME,
  REWARDED_AD_UNIT_ID,
  TEST_REWARDED_AD_UNIT_ID,
  powerupAdSelection,
} from '../src/platform/admob.config.js';
import {
  PAUSE_COUNTDOWN_MS,
  beginCountdown,
  canOpenPause,
  countdownDigit,
  createPauseState,
  requestPause,
  simulationFrozen,
  tickPause,
} from '../src/logic/pause.js';
import { createPowerState, grantPower } from '../src/logic/powerups.js';
import { createReviveBudget, reviveStillAvailable } from '../src/logic/revive.js';
import {
  applyStarterReward,
  createStarterOffer,
  pickStarterPower,
  starterButtonState,
  starterMissKey,
} from '../src/logic/starterPower.js';

describe('暂停冻结和继续倒数', () => {
  it('暂停时推进帧不会结束，计时停在原地', () => {
    const paused = requestPause(createPauseState(), {});
    expect(paused.phase).toBe('paused');
    expect(simulationFrozen(paused)).toBe(true);
    const step = tickPause(paused, 5000);
    expect(step.resumed).toBe(false);
    expect(step.state).toEqual(paused);
    expect(step.digit).toBe(0);
  });

  it('继续后按游戏时间倒数 3 秒，走完才恢复', () => {
    let state = beginCountdown(requestPause(createPauseState(), {}));
    expect(state.leftMs).toBe(PAUSE_COUNTDOWN_MS);
    expect(countdownDigit(state.leftMs)).toBe(3);
    const first = tickPause(state, 1000);
    expect(first.resumed).toBe(false);
    expect(first.digit).toBe(2);
    expect(simulationFrozen(first.state)).toBe(true);
    const second = tickPause(first.state, 1000);
    expect(second.digit).toBe(1);
    const third = tickPause(second.state, 1000);
    expect(third.resumed).toBe(true);
    expect(third.digit).toBe(0);
    expect(third.state.phase).toBe('running');
    expect(simulationFrozen(third.state)).toBe(false);
  });

  it('死亡、过关和开局等待时不能再暂停', () => {
    const running = createPauseState();
    expect(canOpenPause({ phase: 'running' })).toBe(true);
    expect(requestPause(running, { dying: true }).phase).toBe('running');
    expect(requestPause(running, { won: true }).phase).toBe('running');
    expect(requestPause(running, { settling: true }).phase).toBe('running');
    expect(requestPause(running, { holdingStart: true }).phase).toBe('running');
    expect(requestPause({ phase: 'paused', leftMs: 0 }).phase).toBe('paused');
    expect(beginCountdown(running).phase).toBe('running');
  });
});

describe('开局领道具', () => {
  it('每局限领一次，失败或中途关掉不扣次数，也不占用复活', () => {
    const revive = createReviveBudget();
    const offer = createStarterOffer();
    const missed = applyStarterReward(offer, { granted: false, reason: 'dismissed' }, () => 0);
    expect(missed.granted).toBe(false);
    expect(missed.offer.claimed).toBe(false);
    expect(starterMissKey(missed.reason)).toBe('powerup.missed');
    const failed = applyStarterReward(missed.offer, { granted: false, reason: 'error' }, () => 0);
    expect(failed.offer.claimed).toBe(false);
    expect(starterMissKey(failed.reason)).toBe('powerup.failed');
    expect(reviveStillAvailable(revive)).toBe(true);

    const claimed = applyStarterReward(failed.offer, { granted: true }, () => 0);
    expect(claimed.granted).toBe(true);
    expect(claimed.kind).toBe('double');
    expect(claimed.offer.claimed).toBe(true);
    const again = applyStarterReward(claimed.offer, { granted: true }, () => 0.9);
    expect(again.granted).toBe(false);
    expect(again.reason).toBe('used');
    expect(again.offer.claimed).toBe(true);
    expect(reviveStillAvailable(revive)).toBe(true);
    expect(revive.used).toBe(0);
  });

  it('从二段跳、护甲、飞机里抽，效果和捡到的是同一套', () => {
    expect(pickStarterPower(() => 0)).toBe('double');
    expect(pickStarterPower(() => 0.34)).toBe('armor');
    expect(pickStarterPower(() => 0.67)).toBe('plane');
    const kind = pickStarterPower(() => 0.5);
    const granted = grantPower(createPowerState(), kind, 0);
    expect(granted.state.kind).toBe(kind);
    if (kind === 'armor') {
      expect(granted.state.endsAt).toBe(0);
    } else if (kind === 'double') {
      expect(granted.state.endsAt).toBe(POWERUP_CONFIG.double.duration);
      expect(granted.state.airReady).toBe(true);
    } else {
      expect(granted.state.endsAt).toBe(POWERUP_CONFIG.plane.duration);
      expect(granted.state.phase).toBe('fly');
    }
  });

  it('网页不显示按钮，领过置灰，加载中不可点', () => {
    expect(starterButtonState({ native: false, phase: 'ready' }).visible).toBe(false);
    expect(starterButtonState({ native: true, phase: 'ready' })).toEqual({
      visible: true,
      enabled: true,
      labelKey: 'powerup.watch',
    });
    expect(starterButtonState({ native: true, phase: 'loading' })).toEqual({
      visible: true,
      enabled: false,
      labelKey: 'powerup.loading',
    });
    expect(starterButtonState({ native: true, phase: 'failed' }).labelKey).toBe('powerup.unavailable');
    expect(starterButtonState({ native: true, claimed: true, phase: 'ready' })).toEqual({
      visible: true,
      enabled: false,
      labelKey: 'powerup.claimed',
    });
  });

  it('领道具广告位单独配置，现在复用复活位，调试仍走测试广告', () => {
    const live = powerupAdSelection({ flag: 'false', debugApk: false });
    expect(live.adId).toBe(POWERUP_REWARDED_AD_UNIT_ID);
    expect(live.adId).toBe(REWARDED_AD_UNIT_ID);
    expect(live.isTesting).toBe(false);
    expect(live.name).toBe(POWERUP_REWARDED_NAME);
    expect(powerupAdSelection({ flag: 'false', debugApk: true }).adId).toBe(TEST_REWARDED_AD_UNIT_ID);
    expect(powerupAdSelection({}).isTesting).toBe(true);
  });
});
