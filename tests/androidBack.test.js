import { describe, expect, it } from 'vitest';
import { androidBackAction } from '../src/platform/androidBack.js';

describe('安卓返回键', () => {
  it('关卡进行中回到主页', () => {
    expect(androidBackAction({ gameActive: true })).toBe('menu');
  });

  it('主页或启动画面退出应用', () => {
    expect(androidBackAction({ gameActive: false })).toBe('exit');
  });
});
