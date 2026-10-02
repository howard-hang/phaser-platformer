import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENDLESS_STORAGE_KEY, commitEndlessRecord, loadEndlessRecord } from '../src/game/endlessScore.js';
import { PROGRESS_STORAGE_KEY, isLevelUnlocked, loadProgress, saveProgress } from '../src/game/progress.js';
import {
  applyVolumeChange,
  defaultSettings,
  fxProfile,
  loadSettings,
  normalizeSettings,
  reconcileAudio,
  resetAllProgress,
  saveSettings,
  shouldShowFps,
  toggleMuteState,
  updateSettings,
} from '../src/game/settings.js';
import { hapticRequest, pulseHaptic } from '../src/game/haptics.js';
import {
  DUST_CAP,
  DUST_COLORS,
  aliveDustCount,
  createDustPool,
  emitDust,
  makeDustParticle,
  planDustEmits,
  stepDust,
} from '../src/game/dust.js';

function memoryStorage() {
  const memory = new Map();
  return {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
}

describe('设置存档', () => {
  it('默认是满音量、开震动、高特效，帧率开关还没拨过', () => {
    const settings = defaultSettings();
    expect(settings.musicVolume).toBe(1);
    expect(settings.sfxVolume).toBe(1);
    expect(settings.vibrate).toBe(true);
    expect(settings.fx).toBe('high');
    expect(settings.showFps).toBeNull();
    expect(loadSettings(memoryStorage())).toEqual(settings);
  });

  it('音量、震动、特效和帧率会留下来，坏数据不会把游戏弄崩', () => {
    const storage = memoryStorage();
    saveSettings({
      musicVolume: 0.25,
      sfxVolume: 1.4,
      vibrate: false,
      fx: 'low',
      showFps: true,
    }, storage);
    expect(loadSettings(storage)).toEqual({
      musicVolume: 0.25,
      sfxVolume: 1,
      vibrate: false,
      fx: 'low',
      showFps: true,
    });
    storage.setItem('fangkuai-paoku-settings', '{');
    expect(loadSettings(storage)).toEqual(defaultSettings());
    expect(normalizeSettings({ fx: 'nope', vibrate: false, showFps: false }).fx).toBe('high');
  });

  it('只改一项时，其它设置还在', () => {
    const storage = memoryStorage();
    saveSettings({ musicVolume: 0.4, sfxVolume: 0.6, vibrate: true, fx: 'high' }, storage);
    updateSettings({ fx: 'off' }, storage);
    const next = loadSettings(storage);
    expect(next.fx).toBe('off');
    expect(next.musicVolume).toBeCloseTo(0.4);
    expect(next.sfxVolume).toBeCloseTo(0.6);
  });

  it('帧率开关拨过之后，以设置为准', () => {
    expect(shouldShowFps({ showFps: null }, '?fps')).toBe(true);
    expect(shouldShowFps({ showFps: null }, '')).toBe(false);
    expect(shouldShowFps({ showFps: true }, '')).toBe(true);
    expect(shouldShowFps({ showFps: false }, '?fps')).toBe(false);
  });
});

describe('声音开关和音量', () => {
  it('拉高任意一条就取消静音，两条都是 0 就是静音', () => {
    const muted = { muted: true, musicVolume: 0.4, sfxVolume: 0.7 };
    const raised = applyVolumeChange(muted, 'sfxVolume', 0.2);
    expect(raised.muted).toBe(false);
    expect(raised.musicVolume).toBeCloseTo(0.4);
    expect(raised.sfxVolume).toBeCloseTo(0.2);

    const one = applyVolumeChange({ muted: false, musicVolume: 0.5, sfxVolume: 0.5 }, 'musicVolume', 0);
    expect(one.muted).toBe(false);
    expect(one.sfxVolume).toBeCloseTo(0.5);

    const both = applyVolumeChange(one, 'sfxVolume', 0);
    expect(both.muted).toBe(true);
    expect(both.musicVolume).toBe(0);
    expect(both.sfxVolume).toBe(0);
  });

  it('声音按钮静音后音量还在，再点一次按原音量恢复', () => {
    const playing = { muted: false, musicVolume: 0.3, sfxVolume: 0.8 };
    const silent = toggleMuteState(playing);
    expect(silent.muted).toBe(true);
    expect(silent.musicVolume).toBeCloseTo(0.3);
    expect(silent.sfxVolume).toBeCloseTo(0.8);
    const back = toggleMuteState(silent);
    expect(back).toEqual({ muted: false, musicVolume: 0.3, sfxVolume: 0.8 });
  });

  it('两条都是 0 时再点声音按钮，会回到满音量', () => {
    const back = toggleMuteState({ muted: true, musicVolume: 0, sfxVolume: 0 });
    expect(back).toEqual({ muted: false, musicVolume: 1, sfxVolume: 1 });
  });

  it('旧的静音标记和音量对得上', () => {
    expect(reconcileAudio({ musicVolume: 0.5, sfxVolume: 0.5 }, true).muted).toBe(true);
    expect(reconcileAudio({ musicVolume: 0, sfxVolume: 0 }, false).muted).toBe(true);
    const open = reconcileAudio({ musicVolume: 0.2, sfxVolume: 1 }, false);
    expect(open.muted).toBe(false);
    expect(open.musicVolume).toBeCloseTo(0.2);
  });
});

describe('画面特效档位', () => {
  it('高比低灰尘多，关了就没有灰尘、残影和镜头震动', () => {
    const high = fxProfile('high');
    const low = fxProfile('low');
    const off = fxProfile('off');
    expect(high.dustPerSec).toBeGreaterThan(low.dustPerSec);
    expect(high.burst).toBeGreaterThan(low.burst);
    expect(high.trails).toBeGreaterThan(low.trails);
    expect(high.shake).toBeGreaterThan(low.shake);
    expect(low.trails).toBeGreaterThan(0);
    expect(low.shake).toBeGreaterThan(0);
    expect(off).toEqual({ dustPerSec: 0, burst: 0, trails: 0, shake: 0 });
    expect(fxProfile('nope')).toEqual(high);
  });

  it('关卡里按档位决定灰尘、残影和震动', () => {
    // 这些调用跟场景拆到了物理、特效和道具模块，合在一起看仍要接上。
    const scene = [
      'src/scenes/GameScene.js',
      'src/scenes/game/physics.js',
      'src/scenes/game/effects.js',
      'src/scenes/game/items.js',
    ].map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(scene).toContain('planDustEmits');
    expect(scene).toContain('fxProfile');
    expect(scene).toContain('feedback(\'death\')');
    expect(scene).toContain('feedback(\'armor\')');
    expect(scene).toContain('feedback(\'pickup\')');
  });
});

describe('重置进度', () => {
  it('清掉星星、解锁和无尽纪录', () => {
    const storage = memoryStorage();
    saveProgress({ best: { 'level-1': 3, 'level-2': 2 } }, storage);
    commitEndlessRecord(128, storage);
    expect(isLevelUnlocked(loadProgress(storage), 'level-2')).toBe(true);
    expect(loadEndlessRecord(storage).best).toBe(128);

    const cleared = resetAllProgress(storage);
    expect(storage.getItem(PROGRESS_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(ENDLESS_STORAGE_KEY)).toBeNull();
    expect(cleared.progress.best).toEqual({});
    expect(cleared.endless.best).toBe(0);
    expect(isLevelUnlocked(cleared.progress, 'level-1')).toBe(true);
    expect(isLevelUnlocked(cleared.progress, 'level-2')).toBe(false);
    expect(loadProgress(storage).best).toEqual({});
    expect(loadEndlessRecord(storage).best).toBe(0);
  });
});

describe('震动', () => {
  it('只在死亡、护甲碎裂和吃到道具时轻震，关掉就没有', () => {
    expect(hapticRequest({ vibrate: true }, 'death')).toMatchObject({ ms: 36, style: 'MEDIUM' });
    expect(hapticRequest({ vibrate: true }, 'armor').ms).toBeLessThan(36);
    expect(hapticRequest({ vibrate: true }, 'pickup').ms).toBeLessThan(36);
    expect(hapticRequest({ vibrate: false }, 'death')).toBeNull();
    expect(hapticRequest({ vibrate: true }, 'jump')).toBeNull();
  });

  it('没有震动接口时静默跳过，插件失败再试浏览器', async () => {
    const calls = [];
    const ok = await pulseHaptic(
      { ms: 14, style: 'LIGHT' },
      { vibrate: (ms) => calls.push(ms) },
    );
    expect(ok).toBe(true);
    expect(calls).toEqual([14]);
    expect(await pulseHaptic({ ms: 14, style: 'LIGHT' }, {})).toBe(false);
    expect(await pulseHaptic(null, { vibrate: () => {} })).toBe(false);

    const fallen = [];
    const used = await pulseHaptic(
      { ms: 22, style: 'LIGHT' },
      {
        haptics: { impact: () => Promise.reject(new Error('no plugin')) },
        vibrate: (ms) => fallen.push(ms),
      },
    );
    expect(used).toBe(true);
    expect(fallen).toEqual([22]);
  });
});

describe('彩色灰尘', () => {
  it('池子有上限，颜色是四颗糖果色，向后上方飘并缩小变淡', () => {
    expect(DUST_CAP).toBeLessThanOrEqual(32);
    expect(DUST_CAP).toBeGreaterThan(0);
    expect(DUST_COLORS).toEqual([0xff4b8d, 0x2ee6a6, 0xffe14a, 0x3ec6ff]);
    const pool = createDustPool();
    expect(pool).toHaveLength(DUST_CAP);
    const first = emitDust(pool, 200, 400, 100, 0);
    expect(first.spawned).toBe(DUST_CAP);
    expect(aliveDustCount(pool)).toBe(DUST_CAP);
    expect(pool).toHaveLength(DUST_CAP);
    const again = emitDust(pool, 200, 400, 4, first.cursor);
    expect(again.spawned).toBe(0);

    const colors = new Set(pool.map((item) => item.color));
    expect(colors.size).toBe(4);
    for (const item of pool) {
      expect(item.vx).toBeLessThan(0);
      expect(item.vy).toBeLessThan(0);
      expect(item.x).toBeLessThan(200);
      expect(item.y).toBeGreaterThan(400);
    }
    const moved = stepDust(pool[0], 0.1);
    expect(moved.x).toBeLessThan(pool[0].x);
    expect(moved.y).toBeLessThan(pool[0].y);
    expect(moved.scale).toBeLessThan(1);
    expect(moved.alpha).toBeLessThan(1);
    expect(moved.alive).toBe(true);
    const gone = stepDust(moved, 2);
    expect(gone.alive).toBe(false);
    expect(makeDustParticle(10, 10, 1).color).toBe(DUST_COLORS[1]);
  });

  it('地面持续撒，起跳和落地更多，空中和关掉特效时不撒', () => {
    const high = fxProfile('high');
    const low = fxProfile('low');
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 60; i += 1) {
      const plan = planDustEmits({
        grounded: true,
        burst: null,
        rate: high.dustPerSec,
        burstCount: high.burst,
        dt: 1 / 60,
        carry,
      });
      total += plan.count;
      carry = plan.carry;
    }
    expect(total).toBe(high.dustPerSec);

    const jump = planDustEmits({
      grounded: false,
      burst: 'jump',
      rate: high.dustPerSec,
      burstCount: high.burst,
      dt: 1 / 60,
      carry: 0.9,
    });
    expect(jump.count).toBe(high.burst);
    expect(jump.carry).toBe(0);

    const land = planDustEmits({
      grounded: true,
      burst: 'land',
      rate: high.dustPerSec,
      burstCount: high.burst,
      dt: 1 / 60,
      carry: 0,
    });
    expect(land.count).toBeGreaterThanOrEqual(high.burst);
    const coast = planDustEmits({
      grounded: true,
      burst: null,
      rate: high.dustPerSec,
      burstCount: high.burst,
      dt: 1 / 60,
      carry: 0,
    });
    expect(land.count).toBeGreaterThan(coast.count);
    const landExtra = planDustEmits({
      grounded: true,
      burst: 'land',
      rate: high.dustPerSec,
      burstCount: high.burst,
      dt: 1 / 60,
      carry: 0.9,
    });
    expect(landExtra.count).toBe(high.burst + 1);

    const air = planDustEmits({
      grounded: false,
      burst: null,
      rate: high.dustPerSec,
      burstCount: high.burst,
      dt: 1,
      carry: 0.8,
    });
    expect(air.count).toBe(0);

    const off = fxProfile('off');
    const quiet = planDustEmits({
      grounded: true,
      burst: 'land',
      rate: off.dustPerSec,
      burstCount: off.burst,
      dt: 1,
      carry: 0,
    });
    expect(quiet.count).toBe(0);

    const soft = planDustEmits({
      grounded: true,
      burst: 'land',
      rate: low.dustPerSec,
      burstCount: low.burst,
      dt: 0,
      carry: 0,
    });
    expect(soft.count).toBe(low.burst);
    expect(soft.count).toBeLessThan(land.count);
  });

  it('场景用对象池，不会临时去新建灰尘', () => {
    const source = readFileSync('src/game/runnerFx.js', 'utf8');
    expect(source).toContain('DUST_CAP');
    expect(source).toContain('createDustPool');
    expect(source).toContain('emitDust');
  });
});
