#!/usr/bin/env python3
"""
合成「方块脉冲」：140 BPM、16 小节的电子循环，专供方块跑酷当背景音乐。

曲子是原创的，不使用第三方采样。节拍长度按采样率取整，
包络在音符结束时回到 0，循环点与第 8 小节进第 9 小节的接缝相同，可以无缝循环。

输出 16-bit 立体声 WAV，再由 ffmpeg 压成 OGG。
"""

import math
import struct
import wave
from pathlib import Path

SR = 44100
BPM = 140
# 一个十六分音符的采样数。44100 * 60 / 140 / 4 = 4725，正好是整数。
STEP = (SR * 60) // BPM // 4
BARS = 16
STEPS = BARS * 16
N = STEPS * STEP

# 和弦进行。后 8 小节的结尾和第 8 小节一样落到 G，接回开头的 Am。
# 0:Am 1:F 2:C 3:G 4:Am(高八度琶音)
CHORDS = [
    0, 0, 1, 2,
    0, 0, 1, 3,
    0, 0, 1, 2,
    4, 4, 1, 3,
]

CHORD_NOTES = {
    0: (69, 72, 76, 81),  # A4 C5 E5 A5
    1: (65, 69, 72, 77),  # F4 A4 C5 F5
    2: (67, 71, 74, 79),  # G4 B4 D5 G5  -- 占位，C 在下面覆盖
    3: (67, 71, 74, 79),  # G
    4: (81, 84, 88, 93),  # 高八度 Am
}
CHORD_NOTES[2] = (72, 76, 79, 84)  # C5 E5 G5 C6

BASS_ROOT = {
    0: 57,  # A2
    1: 53,  # F2
    2: 60,  # C3
    3: 55,  # G2
    4: 57,
}


def midi_freq(note):
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def clamp_env(i, dur, attack, release):
    """音符包络。起点和终点都是 0，避免接缝爆音。"""
    if i < 0 or i >= dur:
        return 0.0
    a = min(attack, dur // 3)
    r = min(release, dur // 3)
    if i < a:
        return i / max(1, a)
    if i > dur - r:
        return max(0.0, (dur - i) / max(1, r))
    return 1.0


def add_sine(buf, start, freq, dur, gain, attack, release):
    if dur <= 0 or gain == 0:
        return
    phase = 0.0
    inc = 2.0 * math.pi * freq / SR
    end = min(N, start + dur)
    for i in range(start, end):
        env = clamp_env(i - start, dur, attack, release)
        buf[i] += math.sin(phase) * env * gain
        phase += inc


def add_saw(buf, start, freq, dur, gain, attack, release):
    """三层轻微失谐的锯齿，听感接近合成器主音，但仍然是公式算出来的。"""
    if dur <= 0 or gain == 0:
        return
    ratios = (0.992, 1.0, 1.008)
    phases = [0.0, 0.15, 0.4]
    incs = [2.0 * math.pi * freq * r / SR for r in ratios]
    end = min(N, start + dur)
    for i in range(start, end):
        env = clamp_env(i - start, dur, attack, release)
        sample = 0.0
        for k in range(3):
            # 锯齿：相位折成 -1..1，再混一点正弦，去掉最刺耳的高频。
            p = phases[k] % (2.0 * math.pi)
            saw = (p / math.pi) - 1.0
            sample += saw * 0.55 + math.sin(p) * 0.45
            phases[k] += incs[k]
        buf[i] += (sample / 3.0) * env * gain


def add_kick(buf, start):
    dur = int(0.23 * SR)
    phase = 0.0
    end = min(N, start + dur)
    for i in range(start, end):
        t = (i - start) / SR
        env = math.exp(-t * 16.0) * clamp_env(i - start, dur, 8, 40)
        freq = 46.0 + 130.0 * math.exp(-t * 32.0)
        phase += 2.0 * math.pi * freq / SR
        click = 0.0
        if t < 0.004:
            click = (hash((i * 13) & 0xFFFF) / 32767.0 - 1.0) * (1.0 - t / 0.004) * 0.35
        buf[i] += (math.sin(phase) * 0.95 + click) * env


def hash(n):
    n = (n * 1103515245 + 12345) & 0x7FFFFFFF
    return (n % 65536) - 32768


def add_snare(buf, start, gain=0.55, dur=None):
    if dur is None:
        dur = int(0.16 * SR)
    end = min(N, start + dur)
    for i in range(start, end):
        t = (i - start) / SR
        env = math.exp(-t * 18.0) * clamp_env(i - start, dur, 6, 30)
        noise = hash(i * 17 + start) / 32768.0
        tone = math.sin(2.0 * math.pi * 196.0 * t)
        buf[i] += (noise * 0.75 + tone * 0.25) * env * gain


def add_hat(buf, start, open_hat=False, gain=0.22):
    dur = int((0.09 if open_hat else 0.035) * SR)
    end = min(N, start + dur)
    decay = 28.0 if open_hat else 55.0
    for i in range(start, end):
        t = (i - start) / SR
        env = math.exp(-t * decay) * clamp_env(i - start, dur, 2, 12)
        noise = hash(i * 29 + 7) / 32768.0
        # 粗略的高通：当前噪声减上一个噪声。
        prev = hash((i - 1) * 29 + 7) / 32768.0
        buf[i] += (noise - prev) * env * gain


def bar_chord(bar):
    return CHORDS[bar]


def render():
    kick = [0.0] * N
    snare = [0.0] * N
    hat = [0.0] * N
    bass = [0.0] * N
    arp = [0.0] * N
    pad = [0.0] * N

    for bar in range(BARS):
        chord = bar_chord(bar)
        base = bar * 16 * STEP
        # 四四拍底鼓。
        for beat in range(4):
            add_kick(kick, base + beat * 4 * STEP)
        # 军鼓在第 2、4 拍。第 8 和最后一小节的第 4 拍改成鼓点加密，两边对称，循环才接得上。
        add_snare(snare, base + 4 * STEP)
        if bar in (7, 15):
            # 最后一下必须在小节结束前收完，循环点才不会被截断。
            for k, g in ((12, 0.4), (13, 0.48), (14, 0.58), (15, 0.7)):
                hit = int(0.16 * SR) if k < 15 else STEP - 32
                add_snare(snare, base + k * STEP, g, hit)
        else:
            add_snare(snare, base + 12 * STEP)
        # 踩镲：八分音符，反拍略开。
        for step in range(0, 16, 2):
            open_hat = step % 4 == 2
            add_hat(hat, base + step * STEP, open_hat=open_hat, gain=0.2 if open_hat else 0.16)

        root = BASS_ROOT[chord]
        # 八分音符贝斯，偶尔换成五度，推动节奏。
        pattern = (0, 7, 0, 0, 12, 0, 7, 0)
        for i, interval in enumerate(pattern):
            start = base + i * 2 * STEP
            dur = int(1.6 * STEP)
            freq = midi_freq(root + interval)
            add_saw(bass, start, freq, dur, 0.34, int(0.004 * SR), int(0.03 * SR))
            add_sine(bass, start, freq / 2.0, dur, 0.22, int(0.004 * SR), int(0.04 * SR))

        notes = CHORD_NOTES[chord]
        for step in range(16):
            note = notes[step % 4]
            if step % 8 >= 4:
                note = notes[(step + 1) % 4]
            dur = int(0.92 * STEP)
            add_saw(arp, base + step * STEP, midi_freq(note), dur, 0.16, int(0.003 * SR), int(0.012 * SR))

        # 铺底只覆盖当前小节，头尾包络回到 0，换和弦和循环都不会爆音。
        bar_dur = 16 * STEP
        for note, gain in zip(notes[:3], (0.07, 0.055, 0.045)):
            add_sine(pad, base, midi_freq(note - 12), bar_dur, gain, int(0.02 * SR), int(0.02 * SR))

    # 侧链：每次底鼓把和声轻轻压下去，几毫秒内完成，不会在采样点上跳变。
    duck = [1.0] * N
    beat = 4 * STEP
    attack = int(0.006 * SR)
    for bar in range(BARS):
        for b in range(4):
            start = bar * 16 * STEP + b * beat
            for i in range(int(0.28 * SR)):
                idx = start + i
                if idx >= N:
                    break
                if i < attack:
                    dip = 0.7 * (i / attack)
                else:
                    dip = 0.7 * math.exp(-((i - attack) / SR) * 9.0)
                duck[idx] = min(duck[idx], 1.0 - dip)

    left = [0.0] * N
    right = [0.0] * N
    # 军鼓的短延迟走环形缓冲，循环头尾仍然连续。
    slap = int(0.11 * SR)
    for i in range(N):
        pump = duck[i]
        mono = (
            kick[i] * 0.92
            + snare[i] * 0.48
            + hat[i] * 0.34
            + bass[i] * 0.62 * pump
            + arp[i] * 0.42 * pump
            + pad[i] * pump
        )
        echo = snare[(i - slap) % N] * 0.18
        # 踩镲左右轻微错开，延迟同样按环形取，避免循环点出现空洞。
        hat_shift = hat[(i - 180) % N]
        left[i] = math.tanh((mono + echo * 0.4 + hat[i] * 0.08) * 1.15)
        right[i] = math.tanh((mono + echo + hat_shift * 0.08 + arp[i] * 0.05) * 1.15)

    peak = max(max(abs(x) for x in left), max(abs(x) for x in right), 1e-6)
    scale = 0.89 / peak
    out = Path(__file__).resolve().parents[1] / 'src' / 'assets' / 'music' / 'pulse.wav'
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for i in range(N):
            l = max(-32767, min(32767, int(left[i] * scale * 32767)))
            r = max(-32767, min(32767, int(right[i] * scale * 32767)))
            frames += struct.pack('<hh', l, r)
        w.writeframes(frames)
    print(f'wrote {out} samples={N} seconds={N / SR:.3f} peak_in={peak:.3f}')


if __name__ == '__main__':
    render()
