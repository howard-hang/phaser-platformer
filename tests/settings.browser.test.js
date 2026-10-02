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
  }, 30000);

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
  }, 240000);

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
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForFunction(() => window.__PHASER_GAME__?.scene?.getScene?.('menu')?.scene?.isActive?.(), { timeout: 15000 });
      await page.evaluate(() => {
        window.__PHASER_GAME__.scene.getScene('menu').scene.start('game', { levelId: 'level-1' });
      });
      await page.waitForFunction(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        return scene?.scene?.isActive?.() && scene.runnerFx && scene.player?.body;
      }, { timeout: 10000 });
      const running = await page.evaluate(() => new Promise((resolve) => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        let max = 0;
        let frames = 0;
        const tick = () => {
          max = Math.max(max, scene.runnerFx.aliveCount());
          frames += 1;
          if (frames >= 45) {
            scene.events.off('update', tick);
            resolve(max);
          }
        };
        scene.events.on('update', tick);
      }));
      expect(running).toBeGreaterThan(0);
      expect(running).toBeLessThanOrEqual(32);
      await page.screenshot({ path: `${SHOTS}/running-dust.png` });

      await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('game').tryJump());
      await page.waitForFunction(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        if (!scene?.player) return false;
        if (!scene.isGrounded()) scene.__leftGround = true;
        return !!scene.__leftGround && scene.isGrounded() && scene.runnerFx.aliveCount() > 0;
      }, { timeout: 8000 });
      await page.screenshot({ path: `${SHOTS}/landing-dust.png` });

      await page.evaluate(() => {
        window.__PHASER_GAME__.scene.getScene('game').scene.start('menu');
      });
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('menu')?.scene?.isActive?.(), { timeout: 8000 });
      // 从主页再进设置，点「关」，让这一局里的特效档位真正变成关闭。
      const gear = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('menu');
        return { x: scene.hud.settings.zone.x, y: scene.hud.settings.zone.y };
      });
      await clickGame(page, gear.x, gear.y, 'mouse');
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.scene?.isActive?.(), { timeout: 8000 });
      const off = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('settings');
        return { x: scene.ui.fxOff.zone.x, y: scene.ui.fxOff.zone.y };
      });
      await clickGame(page, off.x, off.y, 'mouse');
      await page.waitForFunction(() => {
        const raw = localStorage.getItem('fangkuai-paoku-settings');
        return raw && JSON.parse(raw).fx === 'off';
      }, { timeout: 4000 });
      await page.evaluate(() => {
        window.__PHASER_GAME__.scene.getScene('settings').scene.start('game', { levelId: 'level-1' });
      });
      await page.waitForFunction(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        return scene?.scene?.isActive?.() && scene.runnerFx;
      }, { timeout: 8000 });
      const quiet = await page.evaluate(() => new Promise((resolve) => {
        const scene = window.__PHASER_GAME__.scene.getScene('game');
        let max = 0;
        let frames = 0;
        const tick = () => {
          max = Math.max(max, scene.runnerFx.aliveCount());
          frames += 1;
          if (frames >= 40) {
            scene.events.off('update', tick);
            resolve(max);
          }
        };
        scene.events.on('update', tick);
      }));
      expect(quiet).toBe(0);
      expect(errors, errors.join('\n')).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 180000);
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
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => window.__PHASER_GAME__?.scene?.getScene?.('menu')?.scene?.isActive?.(), { timeout: 15000 });

  const gear = await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('menu');
    return { x: scene.hud.settings.zone.x, y: scene.hud.settings.zone.y };
  });
  await clickGame(page, gear.x, gear.y, mode);
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.scene?.isActive?.(), { timeout: 8000 });

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
  }, { timeout: 4000 });

  await clickGame(page, points.sfx.x + points.sfx.track * 0.25, points.sfx.y, mode);
  await page.waitForFunction(() => {
    const data = JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}');
    return data.sfxVolume > 0.55 && data.sfxVolume < 0.95
      && data.musicVolume > 0.05 && data.musicVolume < 0.45;
  }, { timeout: 4000 });

  await clickGame(page, points.vibrate.x, points.vibrate.y, mode);
  await page.waitForFunction(() => {
    const data = JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}');
    return data.vibrate === false;
  }, { timeout: 4000 });
  await clickGame(page, points.vibrate.x, points.vibrate.y, mode);
  await page.waitForFunction(() => {
    const data = JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}');
    return data.vibrate === true;
  }, { timeout: 4000 });

  await clickGame(page, points.low.x, points.low.y, mode);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}').fx === 'low', { timeout: 4000 });
  await clickGame(page, points.off.x, points.off.y, mode);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}').fx === 'off', { timeout: 4000 });
  await clickGame(page, points.high.x, points.high.y, mode);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('fangkuai-paoku-settings') || '{}').fx === 'high', { timeout: 4000 });

  await clickGame(page, points.fps.x, points.fps.y, mode);
  await page.waitForFunction(() => !!document.getElementById('fps-meter'), { timeout: 4000 });
  await clickGame(page, points.fps.x, points.fps.y, mode);
  await page.waitForFunction(() => !document.getElementById('fps-meter'), { timeout: 4000 });

  await clickGame(page, points.reset.x, points.reset.y, mode);
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('settings');
    return scene?.confirming === true && scene.dialogText?.visible === true;
  }, { timeout: 4000 });
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
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.confirming === false, { timeout: 4000 });
  const afterCancel = await page.evaluate(() => localStorage.getItem('fangkuai-paoku-progress'));
  expect(afterCancel).toContain('level-2');

  await clickGame(page, points.reset.x, points.reset.y, mode);
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.confirming === true, { timeout: 4000 });
  await clickGame(page, points.confirm.x, points.confirm.y, mode);
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('settings');
    return scene?.confirming === false
      && localStorage.getItem('fangkuai-paoku-progress') == null
      && localStorage.getItem('fangkuai-paoku-endless') == null;
  }, { timeout: 4000 });

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
  await page.waitForFunction(() => localStorage.getItem('fangkuai-audio-muted') === '1', { timeout: 4000 });

  await clickGame(page, points.back.x, points.back.y, mode);
  await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('menu')?.scene?.isActive?.(), { timeout: 8000 });
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
  }, { timeout: 4000 });
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
