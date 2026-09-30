import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEATH_FX_MS,
  FLASH_MS,
  SHARD_CAP,
  SHAKE_INTENSITY,
  SHAKE_MS,
  planShards,
} from '../src/game/deathFx.js';
import { SHATTER_SECONDS, renderShatterPcm } from '../src/game/shatterSynth.js';

describe('死亡碎裂', () => {
  it('整段不超过半秒，碎片数量有上限', () => {
    expect(DEATH_FX_MS).toBeLessThanOrEqual(500);
    expect(DEATH_FX_MS).toBeGreaterThan(0);
    expect(FLASH_MS).toBeLessThanOrEqual(DEATH_FX_MS);
    expect(SHAKE_MS).toBeLessThanOrEqual(DEATH_FX_MS);
    expect(SHAKE_INTENSITY).toBeLessThanOrEqual(0.01);
    expect(SHAKE_INTENSITY).toBeGreaterThan(0);
    expect(SHARD_CAP).toBeLessThanOrEqual(12);
    expect(SHARD_CAP).toBeGreaterThan(0);
  });

  it('碎片往两侧散开，再多要也不会超过上限', () => {
    const shards = planShards(100);
    expect(shards).toHaveLength(SHARD_CAP);
    expect(planShards(0)).toHaveLength(0);
    expect(planShards(-3)).toHaveLength(0);
    expect(Math.min(...shards.map((shard) => shard.vx))).toBeLessThan(0);
    expect(Math.max(...shards.map((shard) => shard.vx))).toBeGreaterThan(0);
    for (const shard of shards) {
      expect(Number.isFinite(shard.vx)).toBe(true);
      expect(Number.isFinite(shard.vy)).toBe(true);
      expect(shard.w).toBeGreaterThan(0);
      expect(shard.h).toBeGreaterThan(0);
    }
  });

  it('碎裂音效很短，并且仓库里有同一段 wav 和 CC0 说明', () => {
    expect(SHATTER_SECONDS).toBeLessThanOrEqual(0.2);
    expect(SHATTER_SECONDS).toBeLessThanOrEqual(DEATH_FX_MS / 1000);
    const pcm = renderShatterPcm(22050);
    expect(pcm.length).toBe(Math.floor(22050 * SHATTER_SECONDS));
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 1) peak = Math.max(peak, Math.abs(pcm[i]));
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThanOrEqual(0.71);

    const wav = readFileSync(new URL('../src/assets/sfx/shatter.wav', import.meta.url));
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    const sampleRate = wav.readUInt32LE(24);
    const dataBytes = wav.readUInt32LE(40);
    const seconds = dataBytes / (sampleRate * 2);
    expect(sampleRate).toBe(22050);
    expect(seconds).toBeCloseTo(SHATTER_SECONDS, 2);

    const note = readFileSync(new URL('../src/assets/sfx/SHATTER.txt', import.meta.url), 'utf8');
    expect(note).toMatch(/CC0/);
    expect(note).toMatch(/shatterSynth\.js/);
    expect(note).toMatch(/程序合成/);
  });
});
