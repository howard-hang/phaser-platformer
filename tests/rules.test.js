import { describe, expect, it } from 'vitest';
import {
  createRunState,
  noteDeath,
  noteProgress,
  noteStar,
  pickCheckpoint,
  reachedFinish,
} from '../src/logic/rules.js';

describe('计分与进程', () => {
  it('分数只按最远距离增加，死回去也不会倒扣', () => {
    let state = createRunState();
    state = noteProgress(state, 800, 40);
    expect(state.score).toBe(20);
    state = noteDeath(state);
    state = noteProgress(state, 100, 40);
    expect(state.score).toBe(20);
    expect(state.deaths).toBe(1);
    expect(state.maxDistance).toBe(800);
  });

  it('距离为 0 或负数时分数是 0', () => {
    const state = noteProgress(createRunState(), -20, 40);
    expect(state.score).toBe(0);
    expect(state.maxDistance).toBe(0);
  });

  it('死亡只加死亡数，不清除已经捡到的星星', () => {
    let state = createRunState();
    state = noteStar(state, 'a').state;
    state = noteDeath(state);
    state = noteProgress(state, 400, 40);
    expect(state.deaths).toBe(1);
    expect(state.stars).toBe(1);
    expect(state.score).toBe(10);
  });

  it('同一颗星星只能捡一次，不同星星可以累加', () => {
    let state = createRunState();
    const first = noteStar(state, 'a');
    state = first.state;
    expect(first.picked).toBe(true);
    expect(state.stars).toBe(1);
    const again = noteStar(state, 'a');
    expect(again.picked).toBe(false);
    expect(again.state.stars).toBe(1);
    const second = noteStar(again.state, 'b');
    expect(second.picked).toBe(true);
    expect(second.state.stars).toBe(2);
  });

  it('存档点取不超过当前位置的最近一个', () => {
    const points = [240, 1000, 2500, 4000];
    expect(pickCheckpoint(points, 240)).toBe(240);
    expect(pickCheckpoint(points, 999)).toBe(240);
    expect(pickCheckpoint(points, 1000)).toBe(1000);
    expect(pickCheckpoint(points, 1800)).toBe(1000);
    expect(pickCheckpoint(points, 5000)).toBe(4000);
  });

  it('到达或越过终点才算通关', () => {
    expect(reachedFinish(999, 1000)).toBe(false);
    expect(reachedFinish(1000, 1000)).toBe(true);
    expect(reachedFinish(1200, 1000)).toBe(true);
  });
});
