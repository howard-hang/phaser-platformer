/**
 * 暂停时画面和道具倒计时冻住。继续后的倒数走游戏帧，不看墙钟。
 */
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import puppeteer from 'puppeteer-core';

const chromePath = [
  process.env.CHROME_PATH,
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

/** 页面没起来时的上限。断言看游戏帧和场景里累加的状态。 */
const WAIT_MS = 60000;

describe('暂停按游戏帧冻结', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = await createServer({
      server: { host: '127.0.0.1', port: 4189, strictPort: true },
      logLevel: 'error',
    });
    await server.listen();
    baseUrl = 'http://127.0.0.1:4189/';
  }, 60000);

  afterAll(async () => {
    await server?.close();
  });

  it('暂停后若干游戏帧内人和道具时钟不动，倒数从 3 开始，结束后再跑', async () => {
    expect(chromePath, '找不到 Chrome，暂停测试没法跑').toBeTruthy();
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--window-size=1280,720',
      ],
      defaultViewport: { width: 1280, height: 720 },
    });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
      await page.waitForFunction(
        () => window.__PHASER_GAME__?.scene?.getScene?.('menu')?.scene?.isActive?.(),
        { timeout: WAIT_MS },
      );
      await page.evaluate(() => {
        window.__PHASER_GAME__.scene.start('game', { levelId: 'level-1' });
      });
      await page.waitForFunction(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        return scene?.player?.x > scene?.level?.startX + 40 && scene.pauseState?.phase === 'running';
      }, { timeout: WAIT_MS });
      const before = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        scene.input.keyboard.emit('keydown-P', { repeat: false });
        scene.powerClock = 1.25;
        scene.elapsedMs = 800;
        const grantedEnds = scene.powerClock + 8;
        scene.power = {
          kind: 'double',
          endsAt: grantedEnds,
          airReady: true,
          phase: null,
          landEndsAt: 0,
          invulnUntil: 0,
        };
        return {
          x: scene.player.x,
          clock: scene.powerClock,
          elapsed: scene.elapsedMs,
          endsAt: scene.power.endsAt,
          frames: scene._pauseFrames || 0,
          phase: scene.pauseState.phase,
        };
      });
      expect(before.phase).toBe('paused');
      await page.waitForFunction((start) => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        return (scene._pauseFrames || 0) >= start + 20;
      }, { timeout: WAIT_MS }, before.frames);
      const frozen = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        return {
          x: scene.player.x,
          clock: scene.powerClock,
          elapsed: scene.elapsedMs,
          endsAt: scene.power.endsAt,
          worldPaused: !!scene.physics.world.isPaused,
          digit: scene.countdownText?.visible ? scene.countdownText.text : '',
        };
      });
      expect(frozen.x).toBe(before.x);
      expect(frozen.clock).toBe(before.clock);
      expect(frozen.elapsed).toBe(before.elapsed);
      expect(frozen.endsAt).toBe(before.endsAt);
      expect(frozen.worldPaused).toBe(true);
      expect(frozen.digit).toBe('');

      const countdown = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        scene.__resumeX = scene.player.x;
        scene.beginResume();
        return {
          phase: scene.pauseState.phase,
          digit: scene.countdownText?.text || '',
          x: scene.player.x,
        };
      });
      expect(countdown.phase).toBe('countdown');
      expect(countdown.digit).toBe('3');
      expect(countdown.x).toBe(before.x);
      await page.waitForFunction(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        return scene.pauseState?.phase === 'running' && scene.player.x > scene.__resumeX;
      }, { timeout: WAIT_MS });
      const moved = await page.evaluate((origin) => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        return {
          phase: scene.pauseState.phase,
          advanced: scene.player.x > origin,
          clockMoved: scene.powerClock > 1.25,
          frames: scene.game.loop.frame,
        };
      }, before.x);
      expect(errors, errors.join('\n')).toEqual([]);
      expect(moved.phase).toBe('running');
      expect(moved.advanced).toBe(true);
      expect(moved.clockMoved).toBe(true);
      expect(moved.frames).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  }, 120000);
});
