import { describe, expect, it } from 'vitest';
import { androidBackAction } from '../src/platform/androidBack.js';

describe('安卓返回键', () => {
  it('关卡进行中回到选关', () => {
    expect(androidBackAction({ gameActive: true, selectActive: false })).toBe('select');
    expect(androidBackAction({ gameActive: true, selectActive: true })).toBe('select');
  });

  it('选关界面回到标题', () => {
    expect(androidBackAction({ gameActive: false, selectActive: true })).toBe('menu');
  });

  it('标题或启动画面退出应用', () => {
    expect(androidBackAction({ gameActive: false, selectActive: false })).toBe('exit');
  });
});
