/**
 * 切换语言后，菜单和设置页上的字跟着变。
 * 360×640 上五种语言都不能溢出画面。等待只看游戏帧，墙钟是上限。
 */
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import puppeteer from 'puppeteer-core';
import en from '../src/i18n/en.json';
import es from '../src/i18n/es.json';
import ja from '../src/i18n/ja.json';
import ko from '../src/i18n/ko.json';
import zh from '../src/i18n/zh.json';

const catalogs = { zh, en, es, ja, ko };

const chromePath = [
  process.env.CHROME_PATH,
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].find((item) => item && existsSync(item));

const WAIT_MS = 60000;

describe('界面语言', () => {
  let server;
  let baseUrl;
  let browser;

  beforeAll(async () => {
    expect(chromePath, '找不到 Chrome，语言切换测试没法跑').toBeTruthy();
    server = await createServer({
      server: { host: '127.0.0.1', port: 4187, strictPort: true },
      logLevel: 'error',
    });
    await server.listen();
    baseUrl = 'http://127.0.0.1:4187/';
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--window-size=360,640',
      ],
      defaultViewport: { width: 360, height: 640 },
    });
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it.each(['zh', 'en', 'es', 'ja', 'ko'])('%s 在 360×640 上菜单和设置的字对得上，而且不溢出', async (locale) => {
    const page = await browser.newPage();
    try {
      const copy = catalogs[locale];
      await openLocale(page, baseUrl, locale);
      await installReader(page);
      const menu = await page.evaluate(() => readScene('menu'));
      expect(menu.endless).toBe(copy['menu.endless']);
      expect(menu.levels).toBe(copy['menu.levels']);
      expect(menu.subtitle).toBe(copy['menu.subtitle']);
      expect(menu.title).toBe(locale === 'zh' ? '方块跑酷' : 'Block Runner');
      expect(menu.overflow, JSON.stringify(menu.overflow)).toEqual([]);

      await page.evaluate(() => window.__PHASER_GAME__.scene.start('settings'));
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.scene?.isActive?.(), { timeout: WAIT_MS });
      await waitFrames(page, 2);
      const settings = await page.evaluate(() => readScene('settings'));
      expect(settings.title).toBe(copy['settings.title']);
      expect(settings.language).toBe(copy['settings.language']);
      expect(settings.overflow, JSON.stringify(settings.overflow)).toEqual([]);
    } finally {
      await page.close();
    }
  }, 120000);

  it('在设置里点另一种语言，当前画面和回到主页后的字都会换', async () => {
    const page = await browser.newPage();
    try {
      await openLocale(page, baseUrl, 'en');
      await installReader(page);
      const before = await page.evaluate(() => readScene('menu'));
      expect(before.endless).toBe('Endless');

      await page.evaluate(() => window.__PHASER_GAME__.scene.start('settings'));
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('settings')?.scene?.isActive?.(), { timeout: WAIT_MS });
      await waitFrames(page, 2);
      const spot = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('settings');
        const button = scene.langButtons.find((item) => item.caption?.text === '日本語');
        return { x: button.zone.x, y: button.zone.y };
      });
      await clickGame(page, spot.x, spot.y);
      await page.waitForFunction(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('settings');
        return scene?.title?.text === '設定' && scene?.scene?.isActive?.();
      }, { timeout: WAIT_MS });
      const switched = await page.evaluate(() => {
        const scene = window.__PHASER_GAME__.scene.getScene('settings');
        return {
          title: scene.title.text,
          fx: scene.fxLabel.text,
          saved: localStorage.getItem('fangkuai-paoku-locale'),
          doc: document.title,
        };
      });
      expect(switched).toEqual({
        title: '設定',
        fx: 'エフェクト',
        saved: 'ja',
        doc: 'Block Runner',
      });

      await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('settings').scene.start('menu'));
      await page.waitForFunction(() => window.__PHASER_GAME__.scene.getScene('menu')?.scene?.isActive?.(), { timeout: WAIT_MS });
      await waitFrames(page, 2);
      const menu = await page.evaluate(() => readScene('menu'));
      expect(menu.endless).toBe('エンドレス');
      expect(menu.levels).toBe('ステージ');
      expect(menu.overflow, JSON.stringify(menu.overflow)).toEqual([]);
    } finally {
      await page.close();
    }
  }, 120000);
});

async function installReader(page) {
  await page.evaluate(() => {
    window.readScene = (name) => {
      const scene = window.__PHASER_GAME__.scene.getScene(name);
      const viewW = scene.scale.width;
      const viewH = scene.scale.height;
      const overflow = [];
      const visit = (obj, parent) => {
        if (!obj || obj.visible === false) return;
        if (obj.type === 'Text') {
          const host = parent || obj;
          if (!parent && obj.scrollFactorX !== 0) return;
          const scaleX = parent ? (parent.scaleX || 1) : 1;
          const scaleY = parent ? (parent.scaleY || 1) : 1;
          const width = obj.width * scaleX;
          const height = obj.height * scaleY;
          const originX = obj.originX ?? 0;
          const originY = obj.originY ?? 0;
          const x = (parent ? parent.x : obj.x) + (parent ? obj.x * scaleX : 0);
          const y = (parent ? parent.y : obj.y) + (parent ? obj.y * scaleY : 0);
          const box = {
            l: x - width * originX,
            r: x + width * (1 - originX),
            t: y - height * originY,
            b: y + height * (1 - originY),
          };
          const pad = 8;
          if (box.l < -pad || box.r > viewW + pad || box.t < -pad || box.b > viewH + pad) {
            overflow.push({ text: obj.text, box, viewW, viewH });
          }
        }
        const kids = obj.list || obj.children?.list;
        if (kids && obj.type === 'Container') {
          for (const child of kids) visit(child, obj);
        }
      };
      for (const child of scene.children.list) visit(child, null);
      return {
        endless: scene.endlessButton?.caption?.text || '',
        levels: scene.start?.caption?.text || '',
        subtitle: scene.subtitle?.text || '',
        title: scene.title?.text || document.title,
        language: scene.langLabel?.text || '',
        overflow,
      };
    };
  });
}

async function openLocale(page, baseUrl, locale) {
  await page.setViewport({ width: 360, height: 640 });
  await page.evaluateOnNewDocument((code) => {
    localStorage.setItem('fangkuai-paoku-locale', code);
  }, locale);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  await page.waitForFunction(() => window.__PHASER_GAME__?.scene?.getScene?.('menu')?.scene?.isActive?.(), { timeout: WAIT_MS });
  await waitFrames(page, 2);
}

async function waitFrames(page, count) {
  const start = await page.evaluate(() => window.__PHASER_GAME__.loop.frame);
  await page.waitForFunction((base, need) => {
    const frame = window.__PHASER_GAME__?.loop?.frame;
    return typeof frame === 'number' && frame >= base + need;
  }, { timeout: WAIT_MS }, start, count);
}

async function clickGame(page, gx, gy) {
  const point = await page.evaluate((x, y) => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const game = window.__PHASER_GAME__;
    return {
      x: rect.left + (x / game.scale.width) * rect.width,
      y: rect.top + (y / game.scale.height) * rect.height,
    };
  }, gx, gy);
  await page.mouse.click(point.x, point.y);
}
