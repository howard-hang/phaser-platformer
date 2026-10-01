/**
 * 碎裂音效的程序合成。
 * 短促噪声爆裂，叠两声高频碎响和一下很低的闷响，整段大约 0.12 秒。
 * 不用外部采样。噪声用固定种子，同一采样率下结果可以复现。
 * 仓库里的 wav 由 scripts/render-shatter.mjs 按这个函数渲染，许可是 CC0。
 */

/** 碎裂声时长（秒）。必须短于死亡特效的 0.5 秒。 */
export const SHATTER_SECONDS = 0.12;

function noiseSample(seed) {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return {
    next: ((value >>> 0) / 4294967296) * 2 - 1,
    seed: value,
  };
}

/**
 * 渲染单声道浮点采样，峰值压到 0.7。
 * sampleRate 用音频上下文的采样率，或写文件时用 22050。
 */
export function renderShatterPcm(sampleRate = 22050) {
  const rate = Math.max(8000, sampleRate | 0);
  const total = Math.max(1, Math.floor(rate * SHATTER_SECONDS));
  const out = new Float32Array(total);
  let seed = 0x5a17c3;

  for (let i = 0; i < total; i += 1) {
    const t = i / rate;
    const drawn = noiseSample(seed);
    seed = drawn.seed;
    // 爆裂噪声很快衰减，听起来像方块裂开而不是长噪声。
    const crack = drawn.next * Math.exp(-t * 42);
    const tick = (freq, at, decay) => {
      const dt = t - at;
      if (dt < 0 || dt > 0.028) return 0;
      return Math.sin(2 * Math.PI * freq * dt) * Math.exp(-dt * decay);
    };
    const tone = tick(1860, 0, 110) * 0.34 + tick(980, 0.016, 80) * 0.2;
    const thud = Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t * 32) * 0.16;
    out[i] = crack * 0.62 + tone + thud;
  }

  let peak = 0;
  for (let i = 0; i < total; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = 0.7 / peak;
    for (let i = 0; i < total; i += 1) out[i] *= gain;
  }
  return out;
}
