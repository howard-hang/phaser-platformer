/**
 * 音效用振荡器合成，背景音乐播放仓库里的无缝循环。
 * 第一次点击或按键之后才创建 AudioContext。
 * 死亡、重开、回主页都不重开音乐。静音会记在本地，同时关掉音乐和音效。
 * 页面或安卓壳进后台时挂起上下文，回来从刚才的位置继续。
 */
import musicUrl from '../assets/music/pulse.ogg';
import { isNativeShell } from '../platform/androidBack.js';
import {
  audioContextAction,
  loadMutePreference,
  musicOutputGain,
  playbackPositionAfterRetry,
  saveMutePreference,
  shouldCreateAudio,
} from './audioPolicy.js';

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
    this.muted = loadMutePreference(storageOrNull());
    this.unlocked = false;
    this.appActive = true;
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
      this.master.gain.setValueAtTime(musicOutputGain(this.muted, SFX_GAIN), now);
    }
    if (this.musicGain) {
      this.musicGain.gain.setValueAtTime(musicOutputGain(this.muted, MUSIC_GAIN), now);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    saveMutePreference(storageOrNull(), muted);
    this.applyGains();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
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
    if (!this.ctx || this.muted || !this.appActive) return;
    const time = this.ctx.currentTime;
    if (name === 'jump') {
      tone(this.ctx, this.master, time, {
        freq: 520, freqTo: 780, dur: 0.08, type: 'square', gain: 0.12,
      });
    } else if (name === 'death') {
      tone(this.ctx, this.master, time, {
        freq: 220, freqTo: 55, dur: 0.22, type: 'sawtooth', gain: 0.12,
      });
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
    }
  }
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
