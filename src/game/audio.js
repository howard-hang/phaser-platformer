/**
 * 用 WebAudio 振荡器合成音效和一条很轻的节奏。
 * 不加载音频文件。第一次点击或按键之后才创建 AudioContext，避免自动播放警告。
 */

const MUSIC = [98, 98, 146.83, 98, 130.81, 98, 174.61, 146.83];
const STEP = 0.24;

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

class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.timer = null;
    this.stepIndex = 0;
    this.nextTime = 0;
  }

  /** 必须在用户操作里调用。静音时也会建上下文，但主音量是 0。 */
  unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(this.ctx.destination);
      this.nextTime = this.ctx.currentTime + 0.05;
      this.timer = window.setInterval(() => this.pump(), 80);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(muted ? 0 : 0.22, this.ctx.currentTime);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  pump() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.02;
    while (this.nextTime < now + 0.3) {
      if (!this.muted) {
        tone(this.ctx, this.master, this.nextTime, {
          freq: MUSIC[this.stepIndex % MUSIC.length],
          dur: 0.1,
          type: 'square',
          gain: 0.045,
        });
      }
      this.stepIndex += 1;
      this.nextTime += STEP;
    }
  }

  play(name) {
    if (!this.ctx || this.muted) return;
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
