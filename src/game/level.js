/**
 * 按清单加载每一关的 JSON，展开成运行时关卡。
 * 新增一关只需要放入 src/levels/level-XX.json，并在 manifest.json 里登记。
 * 这里用 Vite 的 glob 把 JSON 打进包里，网页和 APK 离线都能读到。
 */
import manifest from '../levels/manifest.json';
import { compileLevel } from './compileLevel.js';
import { validateLevel, validateManifest } from './levelSchema.js';
import { TUNING } from '../logic/world.js';

const modules = import.meta.glob('../levels/level-*.json', {
  eager: true,
  import: 'default',
});

function loadCampaign() {
  try {
    const files = {};
    for (const [path, data] of Object.entries(modules)) {
      const name = path.split('/').pop();
      files[name] = data;
    }
    validateManifest(manifest, files);
    const levels = [];
    const unlocks = [];
    manifest.levels.forEach((row, index) => {
      const def = validateLevel(files[row.file], row.file);
      const expectedId = `level-${index + 1}`;
      if (def.id !== expectedId) {
        throw new Error(`关卡配置错误 ${row.file}: id 应该是 ${expectedId}，实际是 ${def.id}`);
      }
      levels.push(compileLevel(def, index + 1));
      unlocks.push({ id: def.id, stars: row.unlockStars });
    });
    return { error: null, levels, unlocks };
  } catch (error) {
    return {
      error: error?.message || String(error),
      levels: [],
      unlocks: [],
    };
  }
}

export const CAMPAIGN = loadCampaign();

/** 配置不合法时是一段中文说明。游戏会把它画出来，而不是白屏。 */
export const CONFIG_ERROR = CAMPAIGN.error;

export const LEVELS = CAMPAIGN.levels;

/** 和清单顺序一致的解锁门槛。进度模块按这个表累计星星。 */
export const LEVEL_UNLOCKS = CAMPAIGN.unlocks;

/** 第一关。旧调用点还能用它。 */
export const LEVEL = LEVELS[0] || null;

export function getLevel(id) {
  return LEVELS.find((level) => level.id === id) || null;
}

export function nextLevel(id) {
  const index = LEVELS.findIndex((level) => level.id === id);
  if (index < 0 || index + 1 >= LEVELS.length) return null;
  return LEVELS[index + 1];
}

/** 只替换水平速度。重力和起跳速度保持全局手感。 */
export function levelTuning(level) {
  return { ...TUNING, speed: level?.speed ?? TUNING.speed };
}
