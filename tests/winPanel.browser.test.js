/**
 * 通关面板的真实点击。
 * 16:9 和 20:9 各测一遍，鼠标和触屏都要点「再玩一次」「下一关」「选关」。
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

describe('通关按钮能点', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    mkdirSync('/tmp/shots/win', { recursive: true });
    server = await createServer({
      server: { host: '127.0.0.1', port: 4179, strictPort: true },
      logLevel: 'error',
    });
    await server.listen();
    baseUrl = 'http://127.0.0.1:4179/';
  }, 30000);

  afterAll(async () => {
    await server?.close();
  });

  it.each(VIEWPORTS)('$name 下鼠标和触屏都能重玩、下一关、选关', async ({ name, width, height }) => {
    expect(chromePath, '找不到 Chrome，浏览器点击测试没法跑').toBeTruthy();
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
      const outcomes = [];
      for (const mode of ['mouse', 'touch']) {
        for (const action of ['replay', 'next', 'select']) {
          const page = await browser.newPage();
          page.on('pageerror', (err) => errors.push(`${name} ${mode} ${action}: ${err.message}`));
          const result = await exercise(page, baseUrl, { name, mode, action, width, height });
          outcomes.push(result);
          await page.close();
        }
      }
      expect(errors, errors.join('\n')).toEqual([]);
      for (const result of outcomes) {
        expect(result.panelMs, JSON.stringify(result)).toBeLessThan(500);
        expect(result.overshootPx, JSON.stringify(result)).toBeLessThan(result.speed * 0.5);
        if (result.action === 'replay') {
          expect(result.after).toMatchObject({ game: true, id: 'level-1', won: false });
          expect(result.after.x).toBeLessThan(500);
        } else if (result.action === 'next') {
          expect(result.after).toMatchObject({ game: true, id: 'level-2', won: false });
          expect(result.after.x).toBeLessThan(500);
        } else {
          expect(result.after.select).toBe(true);
          expect(result.after.game).toBe(false);
        }
      }
    } finally {
      await browser.close();
    }
  }, 120000);
});

async function exercise(page, baseUrl, { name, mode, action, width, height }) {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('fangkuai-paoku-progress', JSON.stringify({ best: { 'level-1': 3 } }));
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => window.__PHASER_GAME__?.scene?.getScene?.('menu')?.scene?.isActive?.(), { timeout: 15000 });
  await page.evaluate(() => window.__PHASER_GAME__.scene.start('game', { levelId: 'level-1' }));
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return scene?.scene?.isActive?.() && scene.player?.body;
  }, { timeout: 10000 });
  await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    const speed = scene.tuning.speed;
    scene._physicsPose = null;
    scene.player.body.reset(scene.level.finishX - speed * 0.04, scene.player.y);
    scene.player.body.setVelocity(speed, 0);
    const start = performance.now();
    const orig = scene.win.bind(scene);
    scene.win = function winAndStamp() {
      orig();
      this.__panelMs = performance.now() - start;
    };
  });
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return scene?.won === true && typeof scene.__panelMs === 'number';
  }, { timeout: 2000 });
  const state = await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    const labels = ['replay', 'next', 'select'];
    return {
      panelMs: scene.__panelMs,
      overshootPx: scene.player.x - scene.level.finishX,
      speed: scene.tuning.speed,
      buttons: scene.winUi.buttons.map((button, index) => ({
        key: labels[index],
        x: button.zone.x,
        y: button.zone.y,
        enabled: !!button.zone.input?.enabled,
        label: button.caption?.text ?? '',
      })),
    };
  });
  const button = state.buttons[{ replay: 0, next: 1, select: 2 }[action]];
  expect(button.enabled, `${name} ${mode} ${action} ${button.label}`).toBe(true);
  const shot = name.replace(':', 'x');
  if (mode === 'mouse' && action === 'replay') {
    await page.screenshot({ path: `/tmp/shots/win/panel-${shot}.png` });
  }
  const point = await page.evaluate((gx, gy) => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const game = window.__PHASER_GAME__;
    return {
      x: rect.left + (gx / game.scale.width) * rect.width,
      y: rect.top + (gy / game.scale.height) * rect.height,
    };
  }, button.x, button.y);
  const hit = await page.evaluate((gx, gy) => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    const button = scene.winUi.buttons[0].zone;
    const perCamera = scene.cameras.cameras.map((cam) => {
      const world = { x: 0, y: 0 };
      cam.getWorldPoint(gx, gy, world);
      const list = scene.input.manager.hitTest({ x: gx, y: gy, camera: cam }, scene.input._list, cam, []);
      return {
        name: cam.name,
        id: cam.id,
        scrollX: cam.scrollX,
        w: cam.width,
        h: cam.height,
        world,
        hits: list.map((obj) => obj.type),
        will: button.willRender(cam),
      };
    });
    const mgr = scene.input.manager;
    return {
      perCamera,
      scrollFactor: button.scrollFactorX,
      filter: button.cameraFilter,
      inList: scene.input._list.includes(button),
      within: {
        zero: mgr.pointWithinHitArea(button, 0, 0),
        center: mgr.pointWithinHitArea(button, 90, 38),
        neg: mgr.pointWithinHitArea(button, -90, -38),
      },
      origin: [button.displayOriginX, button.displayOriginY],
    };
  }, button.x, button.y);
  if (mode === 'touch') await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  try {
    await page.waitForFunction((kind) => {
      const game = window.__PHASER_GAME__;
      const scene = game.scene.getScene('game');
      const select = game.scene.getScene('select');
      if (kind === 'select') return !!select?.scene?.isActive?.();
      return !!scene?.scene?.isActive?.() && scene.won === false && scene.player?.x < 500;
    }, { timeout: 8000 }, action);
  } catch (error) {
    const debug = await page.evaluate((gx, gy) => {
      const scene = window.__PHASER_GAME__.scene.getScene('game');
      const pointer = scene.input.activePointer;
      const button = scene.winUi?.buttons?.[0];
      const cam = scene.cameras.main;
      return {
        won: scene?.won,
        active: scene?.scene?.isActive?.(),
        playerX: scene?.player?.x,
        id: scene?.level?.id,
        pointer: pointer ? { x: pointer.x, y: pointer.y, worldX: pointer.worldX, worldY: pointer.worldY } : null,
        view: { w: scene.scale.width, h: scene.scale.height },
        scroll: { x: cam.scrollX, y: cam.scrollY },
        hitArea: button ? {
          x: button.zone.x,
          y: button.zone.y,
          w: button.zone.width,
          h: button.zone.height,
          origin: [button.zone.originX, button.zone.originY],
          enabled: button.zone.input?.enabled,
          rect: button.zone.input?.hitArea,
        } : null,
        target: { gx, gy },
      };
    }, button.x, button.y);
    throw new Error(`${name} ${mode} ${action} point=${JSON.stringify(point)} button=${JSON.stringify(button)} hit=${JSON.stringify(hit)} debug=${JSON.stringify(debug)} ${error.message}`);
  }
  if (mode === 'mouse') {
    await page.screenshot({ path: `/tmp/shots/win/${action}-${shot}.png` });
  }
  const after = await page.evaluate(() => {
    const game = window.__PHASER_GAME__;
    const scene = game.scene.getScene('game');
    const select = game.scene.getScene('select');
    return {
      game: !!scene?.scene?.isActive?.(),
      select: !!select?.scene?.isActive?.(),
      id: scene?.level?.id ?? null,
      won: scene?.won ?? null,
      x: Math.round(scene?.player?.x ?? -1),
    };
  });
  return {
    name,
    mode,
    action,
    width,
    height,
    panelMs: state.panelMs,
    overshootPx: state.overshootPx,
    speed: state.speed,
    after,
  };
}
