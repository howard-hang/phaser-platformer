/**
 * 固定截图。一条命令生成主菜单、关卡选择、游戏中、设置页。
 * 另外按五种语言各截一张 360×640 的主菜单和设置页，再拼成两张对比图。
 * 输出目录是仓库根下的 shots/。等待只设宽松上限，画面是否就绪看游戏帧。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(root, 'shots');
const artifactDir = '/opt/cursor/artifacts/screenshots';
const LOCALES = ['zh', 'en', 'es', 'ja', 'ko'];

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

/** 五种小屏截图横排成一张对比图。 */
function stitch(names, outFile) {
  const args = ['-y'];
  for (const name of names) args.push('-i', path.join(outDir, name));
  const layout = names.map((_, index) => {
    if (index === 0) return '0_0';
    const left = names.slice(0, index).map((_, i) => `w${i}`).join('+');
    return `${left}_0`;
  }).join('|');
  args.push(
    '-filter_complex',
    `xstack=inputs=${names.length}:layout=${layout}`,
    '-update',
    '1',
    path.join(outDir, outFile),
  );
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`拼图失败 ${outFile}`);
}

async function shootLocale(browser, locale) {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640 });
  page.on('pageerror', (error) => {
    console.error(error);
  });
  await page.evaluateOnNewDocument((code) => {
    localStorage.setItem('fangkuai-paoku-locale', code);
  }, locale);
  await page.goto('http://127.0.0.1:4191/', { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  await waitScene(page, 'menu');
  await waitFrames(page, 8);
  await page.screenshot({ path: path.join(outDir, `menu-${locale}.png`) });
  await page.evaluate(() => {
    window.__PHASER_GAME__.scene.start('settings');
  });
  await waitScene(page, 'settings');
  await waitFrames(page, 8);
  await page.screenshot({ path: path.join(outDir, `settings-${locale}.png`) });
  await page.close();
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(artifactDir, { recursive: true });
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
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('fangkuai-paoku-locale', 'zh');
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

    for (const locale of LOCALES) {
      await shootLocale(browser, locale);
    }
    stitch(LOCALES.map((locale) => `menu-${locale}.png`), 'i18n-menus.png');
    stitch(LOCALES.map((locale) => `settings-${locale}.png`), 'i18n-settings.png');
    copyFileSync(path.join(outDir, 'i18n-menus.png'), path.join(artifactDir, 'i18n-menus.png'));
    copyFileSync(path.join(outDir, 'i18n-settings.png'), path.join(artifactDir, 'i18n-settings.png'));
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
