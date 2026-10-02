/**
 * 固定截图。一条命令生成主菜单、关卡选择、游戏中、设置页。
 * 输出目录是仓库根下的 shots/。等待只设宽松上限，画面是否就绪看游戏帧。
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(root, 'shots');

/** 页面没起来时的墙钟上限。截图时机按游戏帧，不按这段时间。 */
const WAIT_MS = 60000;

const chromePath = [
  process.env.CHROME_PATH,
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].find((item) => item && existsSync(item));

if (!chromePath) {
  console.error('找不到 Chrome，无法生成截图。可设置 CHROME_PATH。');
  process.exit(1);
}

/** 等某个场景成为当前场景。 */
async function waitScene(page, key) {
  await page.waitForFunction((name) => {
    const game = window.__PHASER_GAME__;
    return !!game?.scene?.getScene?.(name)?.scene?.isActive?.();
  }, { timeout: WAIT_MS }, key);
}

/** 再等若干游戏帧，让这一屏画完。 */
async function waitFrames(page, count) {
  const start = await page.evaluate(() => window.__PHASER_GAME__.loop.frame);
  await page.waitForFunction((base, need) => {
    const frame = window.__PHASER_GAME__?.loop?.frame;
    return typeof frame === 'number' && frame >= base + need;
  }, { timeout: WAIT_MS }, start, count);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const server = await createServer({
    server: { host: '127.0.0.1', port: 4191, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
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
    page.on('pageerror', (error) => {
      console.error(error);
    });
    await page.goto('http://127.0.0.1:4191/', { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
    await waitScene(page, 'menu');
    await waitFrames(page, 8);
    await page.screenshot({ path: path.join(outDir, 'menu.png') });

    await page.evaluate(() => {
      window.__PHASER_GAME__.scene.start('select');
    });
    await waitScene(page, 'select');
    await waitFrames(page, 8);
    await page.screenshot({ path: path.join(outDir, 'select.png') });

    await page.evaluate(() => {
      window.__PHASER_GAME__.scene.start('game', { levelId: 'level-1' });
    });
    await page.waitForFunction(() => {
      const scene = window.__PHASER_GAME__.scene.getScene('game');
      return scene?.scene?.isActive?.() && scene.player?.body;
    }, { timeout: WAIT_MS });
    // 等方块自己跑出一段，截到的是游戏中而不是起跑那一帧。
    const startX = await page.evaluate(() => {
      const scene = window.__PHASER_GAME__.scene.getScene('game');
      return scene.level.startX;
    });
    await page.waitForFunction((origin) => {
      const scene = window.__PHASER_GAME__.scene.getScene('game');
      return scene.player.x >= origin + 180;
    }, { timeout: WAIT_MS }, startX);
    await page.screenshot({ path: path.join(outDir, 'playing.png') });

    await page.evaluate(() => {
      window.__PHASER_GAME__.scene.start('settings');
    });
    await waitScene(page, 'settings');
    await waitFrames(page, 8);
    await page.screenshot({ path: path.join(outDir, 'settings.png') });
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(`截图已写入 ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
