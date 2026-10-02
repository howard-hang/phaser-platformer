/**
 * 设置页的真实点击。
 * 16:9 和 20:9 各测一遍，鼠标和触屏都要点到滑条、开关、特效、重置和返回。
 */
import { existsSync, mkdirSync } from 'node:fs';
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

const VIEWPORTS = [
  { name: '16:9', width: 1280, height: 720 },
  { name: '20:9', width: 1000, height: 450 },
];

const SHOTS = '/opt/cursor/artifacts/screenshots';

/**
 * 墙钟只作为等待上限。CI 上 Chrome 和打包抢 CPU 时，一秒墙钟可能只推进几帧。
 * 灰尘、滞空这些判断看游戏帧和物理步，不看墙上过了多久。
 */
const WAIT_MS = 60000;

describe('设置页能点', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    server = await createServer({
      server: { host: '127.0.0.1', port: 4183, strictPort: true },
      logLevel: 'error',
    });
    await server.listen();
    baseUrl = 'http://127.0.0.1:4183/';
  }, 60000);

  afterAll(async () => {
    await server?.close();
  });

  it.each(VIEWPORTS)('$name 下鼠标和触屏都能改设置', async ({ name, width, height }) => {
    expect(chromePath, '找不到 Chrome，设置页点击测试没法跑').toBeTruthy();
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        `--window-size=${width},${height}`,
      ],
      defaultViewport: { width, height, hasTouch: true, isMobile: true },
    });
    try {
      const errors = [];
      for (const mode of ['mouse', 'touch']) {
        const page = await browser.newPage();
        page.on('pageerror', (err) => errors.push(`${name} ${mode}: ${err.message}`));
        await exercise(page, baseUrl, { name, mode, width, height });
        await page.close();
      }
      expect(errors, errors.join('\n')).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 360000);

  it('跑动和落地都会撒彩色灰尘，关掉特效后不再撒', async () => {
    expect(chromePath, '找不到 Chrome，灰尘截图没法跑').toBeTruthy();
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
      await page.waitForFunction(() => window.__PHASER_GAME__?.scene?.getScene?.('menu')?.scene?.isActive?.(), { timeout: WAIT_MS });
      await page.evaluate(() => {
        window.__PHASER_GAME__.scene.getScene('menu').scene.start('game', { levelId: 'level-1' });
      });
      await page.waitForFunction(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        return scene?.scene?.isActive?.() && scene.runnerFx && scene.player?.body;
      }, { timeout: WAIT_MS });
      // 在游戏循环里记帧数和物理步。Puppeteer 轮询会漏掉慢机器上被一帧吞掉的滞空。
      await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        const world = scene.physics.world;
        const dust = {
          runningFrames: 0,
          runningMax: 0,
          runningDone: false,
          phase: 'run',
          leftGround: false,
          airSteps: 0,
          landed: false,
          landDust: 0,
          landSimMs: 0,
        };
        scene.__dust = dust;
        // 物理步发生在场景 update 之前。滞空必须在这里数，不能等页面轮询。
        const onStep = () => {
          if (dust.phase !== 'jump' || dust.landed) return;
          if (!scene.isGrounded()) {
            dust.leftGround = true;
            dust.airSteps += 1;
          }
        };
        world.on('worldstep', onStep);
        const noteRunning = () => {
          if (dust.runningDone) return;
          dust.runningMax = Math.max(dust.runningMax, scene.runnerFx.aliveCount());
        };
        const finishLand = () => {
          if (dust.phase !== 'jump' || dust.landed || !dust.leftGround || !scene.isGrounded()) return;
          // 落地灰尘在 postupdate 里才放出来，这里读到的才是落地那一撮。
          dust.landDust = Math.max(dust.landDust, scene.runnerFx.aliveCount());
          if (dust.landDust <= 0) return;
          dust.landed = true;
          dust.landSimMs = dust.airSteps * world._frameTimeMS;
          world.off('worldstep', onStep);
          scene.events.off('update', onUpdate);
          scene.events.off('postupdate', onPost);
        };
        const onUpdate = () => {
          noteRunning();
          if (!dust.runningDone) dust.runningFrames += 1;
        };
        const onPost = () => {
          noteRunning();
          if (!dust.runningDone && dust.runningFrames >= 45) dust.runningDone = true;
          finishLand();
        };
        scene.events.on('update', onUpdate);
        scene.events.on('postupdate', onPost);
      });
      await page.waitForFunction(
        () => window.__PHASER_GAME__.scene.getScene('game')?.__dust?.runningDone === true,
        { timeout: WAIT_MS },
      );
      const running = await page.evaluate(() => {
        const dust = window.__PHASER_GAME__.scene.getScene('game').__dust;
        return { frames: dust.runningFrames, max: dust.runningMax };
      });
      expect(running.frames).toBeGreaterThanOrEqual(45);
      expect(running.max).toBeGreaterThan(0);
      expect(running.max).toBeLessThanOrEqual(32);
      await page.screenshot({ path: `${SHOTS}/running-dust.png` });

      await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        scene.__dust.phase = 'jump';
        scene.tryJump();
      });
      await page.waitForFunction(
        () => window.__PHASER_GAME__.scene.getScene('game')?.__dust?.landed === true,
        { timeout: WAIT_MS },
      );
      const landing = await page.evaluate(() => {
        const dust = window.__PHASER_GAME__.scene.getScene('game').__dust;
        return {
          leftGround: dust.leftGround,
          landDust: dust.landDust,
          landSimMs: dust.landSimMs,
          airSteps: dust.airSteps,
        };
      });
      // 普通跳大约 867 毫秒模拟时间。太短是一帧闪一下，太长是没落地。
      expect(landing.leftGround).toBe(true);
      expect(landing.airSteps).toBeGreaterThan(0);
      expect(landing.landSimMs).toBeGreaterThan(200);
      expect(landing.landSimMs).toBeLessThan(2000);
      expect(landing.landDust).toBeGreaterThan(0);
      await page.screenshot({ path: `${SHOTS}/landing-dust.png` });

      await page.evaluate(() => {
        window.__PHASER_GAME__.scene.getScene('game').scene.start('menu');
      });
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('menu')?.scene?.isActive?.(), { timeout: WAIT_MS });
      // 从主页再进设置，点「关」，让这一局里的特效档位真正变成关闭。
      const gear = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('menu');
        return { x: scene.hud.settings.zone.x, y: scene.hud.settings.zone.y };
      });
      await clickGame(page, gear.x, gear.y, 'mouse');
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.scene?.isActive?.(), { timeout: WAIT_MS });
      const off = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('settings');
        return { x: scene.ui.fxOff.zone.x, y: scene.ui.fxOff.zone.y };
      });
      await clickGame(page, off.x, off.y, 'mouse');
      await page.waitForFunction(() => {
        const raw = localStorage.getItem('fangkuai-paoku-settings');
        return raw && JSON.parse(raw).fx === 'off';
      }, { timeout: WAIT_MS });
      await page.evaluate(() => {
        window.__PHASER_GAME__.scene.getScene('settings').scene.start('game', { levelId: 'level-1' });
      });
      await page.waitForFunction(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        return scene?.scene?.isActive?.() && scene.runnerFx;
      }, { timeout: WAIT_MS });
      await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        const quiet = { frames: 0, max: 0, done: false };
        scene.__quiet = quiet;
        const note = () => {
          quiet.max = Math.max(quiet.max, scene.runnerFx.aliveCount());
        };
        const onUpdate = () => {
          note();
          quiet.frames += 1;
        };
        const onPost = () => {
          note();
          if (quiet.frames >= 40) {
            quiet.done = true;
            scene.events.off('update', onUpdate);
            scene.events.off('postupdate', onPost);
          }
        };
        scene.events.on('update', onUpdate);
        scene.events.on('postupdate', onPost);
      });
      await page.waitForFunction(
        () => window.__PHASER_GAME__.scene.getScene('game')?.__quiet?.done === true,
        { timeout: WAIT_MS },
      );
      const quiet = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('game').__quiet);
      expect(quiet.frames).toBeGreaterThanOrEqual(40);
      expect(quiet.max).toBe(0);
      expect(errors, errors.join('\n')).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 300000);
});

async function exercise(page, baseUrl, { name, mode, width, height }) {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('fangkuai-paoku-progress', JSON.stringify({
      best: { 'level-1': 3, 'level-2': 1 },
    }));
    localStorage.setItem('fangkuai-paoku-endless', JSON.stringify({ best: 42 }));
    localStorage.removeItem('fangkuai-paoku-settings');
    localStorage.removeItem('fangkuai-audio-muted');
  });
  await page.setViewport({ width, height, hasTouch: true, isMobile: true });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  await page.waitForFunction(() => window.__PHASER_GAME__?.scene?.getScene?.('menu')?.scene?.isActive?.(), { timeout: WAIT_MS });

  const gear = await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('menu');
    return { x: scene.hud.settings.zone.x, y: scene.hud.settings.zone.y };
  });
  await clickGame(page, gear.x, gear.y, mode);
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.scene?.isActive?.(), { timeout: WAIT_MS });

  if (mode === 'mouse' && name === '16:9') {
    await page.screenshot({ path: `${SHOTS}/settings.png` });
  }

  const points = await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('settings');
    const at = (button) => ({ x: button.zone.x, y: button.zone.y });
    return {
      music: { ...at(scene.ui.music), track: scene.ui.music.trackWidth },
      sfx: { ...at(scene.ui.sfx), track: scene.ui.sfx.trackWidth },
      vibrate: at(scene.ui.vibrate),
      fps: at(scene.ui.fps),
      low: at(scene.ui.fxLow),
      off: at(scene.ui.fxOff),
      high: at(scene.ui.fxHigh),
      reset: at(scene.ui.reset),
      back: at(scene.ui.back),
      cancel: at(scene.ui.cancel),
      confirm: at(scene.ui.confirm),
    };
  });

  await clickGame(page, points.music.x - points.music.track * 0.25, points.music.y, mode);
  await page.waitForFunction(() => {
    const data = JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}');
    return data.musicVolume > 0.05 && data.musicVolume < 0.45;
  }, { timeout: WAIT_MS });

  await clickGame(page, points.sfx.x + points.sfx.track * 0.25, points.sfx.y, mode);
  await page.waitForFunction(() => {
    const data = JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}');
    return data.sfxVolume > 0.55 && data.sfxVolume < 0.95
      && data.musicVolume > 0.05 && data.musicVolume < 0.45;
  }, { timeout: WAIT_MS });

  await clickGame(page, points.vibrate.x, points.vibrate.y, mode);
  await page.waitForFunction(() => {
    const data = JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}');
    return data.vibrate === false;
  }, { timeout: WAIT_MS });
  await clickGame(page, points.vibrate.x, points.vibrate.y, mode);
  await page.waitForFunction(() => {
    const data = JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}');
    return data.vibrate === true;
  }, { timeout: WAIT_MS });

  await clickGame(page, points.low.x, points.low.y, mode);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}').fx === 'low', { timeout: WAIT_MS });
  await clickGame(page, points.off.x, points.off.y, mode);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}').fx === 'off', { timeout: WAIT_MS });
  await clickGame(page, points.high.x, points.high.y, mode);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}').fx === 'high', { timeout: WAIT_MS });

  await clickGame(page, points.fps.x, points.fps.y, mode);
  await page.waitForFunction(() => !!document.getElementById('fps-meter'), { timeout: WAIT_MS });
  await clickGame(page, points.fps.x, points.fps.y, mode);
  await page.waitForFunction(() => !document.getElementById('fps-meter'), { timeout: WAIT_MS });

  await clickGame(page, points.reset.x, points.reset.y, mode);
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('settings');
    return scene?.confirming === true && scene.dialogText?.visible === true;
  }, { timeout: WAIT_MS });
  if (mode === 'mouse' && name === '16:9') {
    await page.screenshot({ path: `${SHOTS}/reset-confirm.png` });
  }
  const stillThere = await page.evaluate(() => ({
    progress: localStorage.getItem('fangkuai-paoku-progress'),
    endless: localStorage.getItem('fangkuai-paoku-endless'),
  }));
  expect(stillThere.progress).toContain('level-1');
  expect(stillThere.endless).toContain('42');

  await clickGame(page, points.cancel.x, points.cancel.y, mode);
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.confirming === false, { timeout: WAIT_MS });
  const afterCancel = await page.evaluate(() => localStorage.getItem('fangkuai-paoku-progress'));
  expect(afterCancel).toContain('level-2');

  await clickGame(page, points.reset.x, points.reset.y, mode);
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.confirming === true, { timeout: WAIT_MS });
  await clickGame(page, points.confirm.x, points.confirm.y, mode);
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('settings');
    return scene?.confirming === false
      && localStorage.getItem('fangkuai-paoku-progress') == null
      && localStorage.getItem('fangkuai-paoku-endless') == null;
  }, { timeout: WAIT_MS });

  // 两条音量都归零后，主页声音按钮要显示静音；再点一次回到满音量。
  const ends = await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('settings');
    return {
      music: { x: scene.ui.music.zone.x, y: scene.ui.music.zone.y, track: scene.ui.music.trackWidth },
      sfx: { x: scene.ui.sfx.zone.x, y: scene.ui.sfx.zone.y, track: scene.ui.sfx.trackWidth },
    };
  });
  await clickGame(page, ends.music.x - ends.music.track / 2 - 12, ends.music.y, mode);
  await clickGame(page, ends.sfx.x - ends.sfx.track / 2 - 12, ends.sfx.y, mode);
  await page.waitForFunction(() => localStorage.getItem('fangkuai-audio-muted') === '1', { timeout: WAIT_MS });

  await clickGame(page, points.back.x, points.back.y, mode);
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('menu')?.scene?.isActive?.(), { timeout: WAIT_MS });
  const icon = await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('menu');
    return {
      key: scene.hud.sound.icon.texture.key,
      x: scene.hud.sound.zone.x,
      y: scene.hud.sound.zone.y,
    };
  });
  expect(icon.key).toBe('icon-mute');
  await clickGame(page, icon.x, icon.y, mode);
  await page.waitForFunction(() => {
    const data = JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}');
    return localStorage.getItem('fangkuai-audio-muted') === '0'
      && data.musicVolume === 1
      && data.sfxVolume === 1;
  }, { timeout: WAIT_MS });
  const restored = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('menu').hud.sound.icon.texture.key);
  expect(restored).toBe('icon-sound');
}

async function clickGame(page, gx, gy, mode) {
  const point = await page.evaluate((x, y) => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const game = window.__PHASER_GAME__;
    return {
      x: rect.left + (x / game.scale.width) * rect.width,
      y: rect.top + (y / game.scale.height) * rect.height,
    };
  }, gx, gy);
  if (mode === 'touch') await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}
