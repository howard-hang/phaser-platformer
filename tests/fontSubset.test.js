import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { collectChars, literalsInSource } from '../scripts/subset-font.mjs';

describe('字体子集', () => {
  it('从字符串里收字，不把注释收进去', () => {
    const chars = literalsInSource('const a = "方块"; // 注释里的龙\nconst b = `跑酷`;');
    expect(chars).toContain('方块');
    expect(chars).toContain('跑酷');
    expect(chars).not.toContain('龙');
  });

  it('关卡名和界面文案都会进字符表', () => {
    const chars = collectChars();
    for (const ch of '方块跑酷选择关卡累计星星上一页下一页返回标题选关还差颗通关再玩一次') {
      expect(chars.includes(ch), ch).toBe(true);
    }
    const level = JSON.parse(fs.readFileSync('src/levels/level-20.json', 'utf8'));
    for (const ch of level.name) expect(chars.includes(ch), ch).toBe(true);
    for (const ch of 'SCOREDEATHS0123456789') expect(chars.includes(ch), ch).toBe(true);
  });

  it('已经生成的子集小于 500KB，并且和当前文案一致', () => {
    const meta = JSON.parse(fs.readFileSync('scripts/fonts/subset-meta.json', 'utf8'));
    const bytes = fs.statSync('src/assets/game-font.woff2').size;
    expect(meta.chars).toBe(collectChars());
    expect(bytes).toBe(meta.bytes);
    expect(bytes).toBeLessThan(500 * 1024);
    expect(bytes).toBeGreaterThan(8 * 1024);
  });
});