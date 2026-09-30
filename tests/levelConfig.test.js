import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { validateLevel, validateManifest } from '../src/game/levelSchema.js';
import { CONFIG_ERROR, LEVELS } from '../src/game/level.js';

const levelDir = new URL('../src/levels/', import.meta.url);

describe('关卡配置', () => {
  it('清单和 20 个配置文件都能通过校验', () => {
    expect(CONFIG_ERROR).toBeNull();
    expect(LEVELS).toHaveLength(20);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', levelDir), 'utf8'));
    const files = {};
    for (const name of readdirSync(levelDir)) {
      if (!/^level-\d{2}\.json$/.test(name)) continue;
      files[name] = JSON.parse(readFileSync(new URL(name, levelDir), 'utf8'));
      expect(() => validateLevel(files[name], name)).not.toThrow();
    }
    expect(Object.keys(files)).toHaveLength(20);
    expect(() => validateManifest(manifest, files)).not.toThrow();
  });

  it('类型写错时会指出文件和字段', () => {
    expect(() => validateLevel({
      id: 'level-3',
      name: '坏关',
      speed: 300,
      duration: 70,
      palette: 'magenta',
      obstacles: [{ t: 3, type: 'spikes' }],
      stars: [{ t: 1 }, { t: 2 }, { t: 3 }],
      checkpoints: [],
    }, 'level-03.json')).toThrow(/关卡配置错误 level-03.json obstacles\[0\]\.type/);
  });

  it('缺星星、未知配色、门槛倒退都会被拦住', () => {
    expect(() => validateLevel({
      id: 'level-1',
      name: '少星',
      speed: 300,
      duration: 70,
      palette: 'magenta',
      obstacles: [],
      stars: [{ t: 1 }],
      checkpoints: [],
    }, 'level-01.json')).toThrow(/正好 3 颗/);

    expect(() => validateLevel({
      id: 'level-1',
      name: '配色',
      speed: 300,
      duration: 70,
      palette: 'nope',
      obstacles: [],
      stars: [{ t: 1 }, { t: 2 }, { t: 3 }],
      checkpoints: [],
    }, 'level-01.json')).toThrow(/未知配色/);

    expect(() => validateManifest({
      levels: [
        { file: 'level-01.json', unlockStars: 0 },
        { file: 'level-02.json', unlockStars: 0 },
      ],
    }, {
      'level-01.json': {},
      'level-02.json': {},
    })).toThrow(/一关比一关高/);
  });
});