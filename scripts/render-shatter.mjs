/**
 * 把碎裂音效渲染成 16-bit 单声道 WAV。
 * 采样和 src/game/shatterSynth.js 是同一份算法，不使用第三方素材。
 * 许可：CC0 1.0，见 src/assets/sfx/SHATTER.txt。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderShatterPcm, SHATTER_SECONDS } from '../src/game/shatterSynth.js';

const SAMPLE_RATE = 22050;
const pcm = renderShatterPcm(SAMPLE_RATE);
const header = Buffer.alloc(44);
const dataBytes = pcm.length * 2;
header.write('RIFF', 0);
header.writeUInt32LE(36 + dataBytes, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(dataBytes, 40);

const body = Buffer.alloc(dataBytes);
for (let i = 0; i < pcm.length; i += 1) {
  const clamped = Math.max(-1, Math.min(1, pcm[i]));
  body.writeInt16LE(Math.round(clamped * 32767), i * 2);
}

mkdirSync(new URL('../src/assets/sfx/', import.meta.url), { recursive: true });
const target = new URL('../src/assets/sfx/shatter.wav', import.meta.url);
writeFileSync(target, Buffer.concat([header, body]));
console.log(`shatter.wav ${SHATTER_SECONDS}s ${SAMPLE_RATE}Hz ${pcm.length} samples`);
