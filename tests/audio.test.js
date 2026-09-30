import { describe, expect, it } from 'vitest';
import { PARALLAX, progressTint } from '../src/game/backdrop.js';
import {
  audioContextAction,
  loadMutePreference,
  musicOutputGain,
  playbackPositionAfterRetry,
  readMutedFlag,
  saveMutePreference,
  shouldCreateAudio,
  writeMutedFlag,
} from '../src/game/audioPolicy.js';

describe('背景视差', () => {
  it('越近的层滚动越快', () => {
    expect(PARALLAX.stars).toBeLessThan(PARALLAX.mountains);
    expect(PARALLAX.mountains).toBeLessThan(PARALLAX.pillars);
    expect(PARALLAX.pillars).toBeLessThan(PARALLAX.grid);
    expect(PARALLAX.grid).toBeLessThanOrEqual(1);
  });

  it('关卡推进时背景色调会变', () => {
    expect(progressTint(0)).not.toBe(progressTint(1));
    expect(progressTint(-1)).toBe(progressTint(0));
    expect(progressTint(2)).toBe(progressTint(1));
  });
});

describe('音乐和声音开关', () => {
  it('静音状态可以存下来再读出来', () => {
    const memory = new Map();
    const storage = {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, value),
    };
    expect(loadMutePreference(storage)).toBe(false);
    saveMutePreference(storage, true);
    expect(writeMutedFlag(true)).toBe('1');
    expect(readMutedFlag('1')).toBe(true);
    expect(loadMutePreference(storage)).toBe(true);
    saveMutePreference(storage, false);
    expect(loadMutePreference(storage)).toBe(false);
  });

  it('静音时音乐和音效增益都是 0，打开后音量回来', () => {
    expect(musicOutputGain(true, 0.42)).toBe(0);
    expect(musicOutputGain(false, 0.42)).toBe(0.42);
    expect(musicOutputGain(false, 0.22)).toBe(0.22);
  });

  it('死亡重来不把音乐拨回开头', () => {
    expect(playbackPositionAfterRetry(12.5)).toBe(12.5);
    expect(playbackPositionAfterRetry(0)).toBe(0);
  });

  it('第一次交互之前不创建音频', () => {
    expect(shouldCreateAudio(false)).toBe(false);
    expect(shouldCreateAudio(true)).toBe(true);
  });

  it('安卓进后台暂停，回到前台恢复', () => {
    expect(audioContextAction(false)).toBe('suspend');
    expect(audioContextAction(true)).toBe('resume');
  });

  it('存不进去时不要把游戏弄崩', () => {
    const broken = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    };
    expect(loadMutePreference(broken)).toBe(false);
    expect(() => saveMutePreference(broken, true)).not.toThrow();
  });
});
