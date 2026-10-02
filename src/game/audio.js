/**
 * 音效用振荡器合成，背景音乐播放仓库里的无缝循环。
 * 第一次点击或按键之后才创建 AudioContext。
 * 死亡、重开、回主页都不重开音乐。静音会记在本地，同时关掉音乐和音效。
 * 页面或安卓壳进后台时挂起上下文，回来从刚才的位置继续。
 */
import musicUrl from '../assets/music/pulse.ogg';
import shatterUrl from '../assets/sfx/shatter.wav';
import { isNativeShell } from '../platform/androidBack.js';
import { renderShatterPcm } from './shatterSynth.js';
import {
  audioContextAction,
  cueWillPlay,
  loadMutePreference,
  musicOutputGain,
  playbackPositionAfterRetry,
  saveMutePreference,
  shouldCreateAudio,
} from './audioPolicy.js';
import {
  applyVolumeChange,
  loadSettings,
  reconcileAudio,
  saveSettings,
  toggleMuteState,
} from './settings.js';

const SFX_GAIN = 0.22;
const MUSIC_GAIN = 0.42;

function tone(ctx, master, time, { freq, freqTo, dur, type, gain }) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (freqTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), time + dur);
  }
  amp.gain.setValueAtTime(gain, time);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(amp);
  amp.connect(master);
  osc.start(time);
  osc.stop(time + dur + 0.03);
}

function storageOrNull() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicSource = null;
    this.musicLoading = null;
    this.shatterBuffer = null;
    this.shatterLoading = null;
    this._synthShatter = null;
    const store = storageOrNull();
    const audio = reconcileAudio(loadSettings(store), loadMutePreference(store));
    this.muted = audio.muted;
    this.musicVolume = audio.musicVolume;
    this.sfxVolume = audio.sfxVolume;
    this.unlocked = false;
    this.appActive = true;
  }

  /** 当前静音和两条音量。滑条和声音按钮都从这里改。 */
  audioState() {
    return {
      muted: this.muted,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
    };
  }

  /** 把静音和音量一起记下来，并立刻改输出增益。 */
  commitAudio(next) {
    this.muted = !!next.muted;
    this.musicVolume = next.musicVolume;
    this.sfxVolume = next.sfxVolume;
    const store = storageOrNull();
    saveMutePreference(store, this.muted);
    const settings = loadSettings(store);
    saveSettings({
      ...settings,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
    }, store);
    this.applyGains();
  }

  /** 音乐滑条。拉高会取消静音。 */
  setMusicVolume(value) {
    this.commitAudio(applyVolumeChange(this.audioState(), 'musicVolume', value));
  }

  /** 音效滑条。和音乐分开记。 */
  setSfxVolume(value) {
    this.commitAudio(applyVolumeChange(this.audioState(), 'sfxVolume', value));
  }

  /** 必须在用户操作里调用。静音时也会把音乐接上，只是增益为 0。 */
  unlock() {
    if (!shouldCreateAudio(true)) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
      this.applyGains();
      this.startMusic();
      this.prepareShatter();
    }
    this.unlocked = true;
    if (this.appActive && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  applyGains() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.master) {
      this.master.gain.setValueAtTime(musicOutputGain(this.muted, SFX_GAIN, this.sfxVolume), now);
    }
    if (this.musicGain) {
      this.musicGain.gain.setValueAtTime(musicOutputGain(this.muted, MUSIC_GAIN, this.musicVolume), now);
    }
  }

  setMuted(muted) {
    this.commitAudio({ ...this.audioState(), muted: !!muted });
  }

  toggleMuted() {
    this.commitAudio(toggleMuteState(this.audioState()));
    return this.muted;
  }

  /**
   * 开始循环。已经在播就什么都不做，避免死亡重来时从头播放。
   * playbackPositionAfterRetry 标明进度必须原样保留。
   */
  startMusic() {
    if (!this.ctx || this.musicSource || this.musicLoading) return;
    const keepPosition = playbackPositionAfterRetry(0);
    this.musicLoading = fetch(musicUrl)
      .then((response) => response.arrayBuffer())
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        if (!this.ctx || this.musicSource) return;
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(this.musicGain);
        // keepPosition 目前恒为调用时的进度。首次从 0 开始，之后不再创建新的 source。
        source.start(0, keepPosition);
        this.musicSource = source;
      })
      .catch(() => {
        // 音乐文件读失败时音效仍然可用。
        this.musicLoading = null;
      });
  }

  /**
   * 预解码仓库里的碎裂 wav。
   * 解码完成前如果玩家已经死亡，play 会用同一算法当场合成。
   */
  prepareShatter() {
    if (!this.ctx || this.shatterBuffer || this.shatterLoading) return;
    this.shatterLoading = fetch(shatterUrl)
      .then((response) => response.arrayBuffer())
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        this.shatterBuffer = buffer;
      })
      .catch(() => {
        this.shatterLoading = null;
      });
  }

  /** 文件还没好时，按 shatterSynth 合成一截相同的碎裂声。 */
  synthShatterBuffer() {
    if (this._synthShatter) return this._synthShatter;
    const pcm = renderShatterPcm(this.ctx.sampleRate);
    const buffer = this.ctx.createBuffer(1, pcm.length, this.ctx.sampleRate);
    buffer.getChannelData(0).set(pcm);
    this._synthShatter = buffer;
    return buffer;
  }

  /** 播放碎裂声。很短，接在主增益上，静音时主增益已经是 0，这里也会提前返回。 */
  playShatter() {
    const buffer = this.shatterBuffer || this.synthShatterBuffer();
    const source = this.ctx.createBufferSource();
    const amp = this.ctx.createGain();
    source.buffer = buffer;
    amp.gain.setValueAtTime(0.9, this.ctx.currentTime);
    source.connect(amp);
    amp.connect(this.master);
    source.start();
    source.onended = () => {
      source.disconnect();
      amp.disconnect();
    };
  }

  /** 安卓切到后台、或浏览器标签被藏起来时调用。 */
  setAppActive(isActive) {
    this.appActive = !!isActive;
    if (!this.ctx) return;
    const action = audioContextAction(this.appActive);
    if (action === 'suspend') {
      if (this.ctx.state === 'running') this.ctx.suspend();
      return;
    }
    if (this.unlocked && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(name) {
    // 碎裂、跳跃、吃道具和护甲共用这道门，声音开关关掉时一起静音。
    if (!cueWillPlay(name, {
      muted: this.muted,
      appActive: this.appActive,
      hasContext: !!this.ctx,
      sfxVolume: this.sfxVolume,
    })) return;
    const time = this.ctx.currentTime;
    if (name === 'jump') {
      tone(this.ctx, this.master, time, {
        freq: 520, freqTo: 780, dur: 0.08, type: 'square', gain: 0.12,
      });
    } else if (name === 'death') {
      this.playShatter();
    } else if (name === 'star') {
      tone(this.ctx, this.master, time, {
        freq: 880, dur: 0.07, type: 'triangle', gain: 0.1,
      });
      tone(this.ctx, this.master, time + 0.07, {
        freq: 1320, dur: 0.1, type: 'triangle', gain: 0.1,
      });
    } else if (name === 'checkpoint') {
      tone(this.ctx, this.master, time, {
        freq: 660, dur: 0.06, type: 'sine', gain: 0.08,
      });
    } else if (name === 'win') {
      [523.25, 659.25, 783.99].forEach((freq, index) => {
        tone(this.ctx, this.master, time + index * 0.12, {
          freq, dur: 0.18, type: 'square', gain: 0.1,
        });
      });
    } else if (name === 'pickup') {
      tone(this.ctx, this.master, time, {
        freq: 660, freqTo: 990, dur: 0.09, type: 'triangle', gain: 0.1,
      });
    } else if (name === 'armor') {
      // 程序合成的护罩碎裂：短促的高频撞击加一小段噪声，不引用外部采样。
      playArmorBreak(this.ctx, this.master, time);
    }
  }
}

/** 护罩碎裂。噪声用固定数列生成，每次听起来一样，静音时整段不会进到这里。 */
function playArmorBreak(ctx, master, time) {
  tone(ctx, master, time, {
    freq: 1480, freqTo: 420, dur: 0.08, type: 'triangle', gain: 0.12,
  });
  tone(ctx, master, time + 0.03, {
    freq: 880, freqTo: 220, dur: 0.1, type: 'square', gain: 0.05,
  });
  const dur = 0.12;
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x6d2b79f5;
  for (let i = 0; i < length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const env = 1 - i / length;
    data[i] = ((seed & 65535) / 32768 - 1) * env * env;
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, time);
  amp.gain.setValueAtTime(0.14, time);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(amp);
  amp.connect(master);
  source.start(time);
  source.stop(time + dur + 0.02);
}

let synth;

export function getSynth() {
  if (!synth) synth = new Synth();
  return synth;
}

/** 可见性变化和安卓壳的前后台事件都进到同一个挂起/恢复。 */
export function bindAudioLifecycle() {
  const audio = getSynth();
  document.addEventListener('visibilitychange', () => {
    audio.setAppActive(document.visibilityState !== 'hidden');
  });
  bindNativeAppState(audio);
}

async function bindNativeAppState(audio) {
  if (!isNativeShell()) return;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { App } = await import('@capacitor/app');
    App.addListener('appStateChange', ({ isActive }) => {
      audio.setAppActive(isActive);
    });
  } catch {
    // 壳层没接上时，上面的 visibilitychange 仍然有效。
  }
}
