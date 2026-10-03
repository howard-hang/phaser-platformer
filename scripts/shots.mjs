/**
 * 固定截图。一条命令生成主菜单、关卡选择、游戏中、设置页。
 * 另外按五种语言各截一张 360×640 的主菜单和设置页，再拼成两张对比图。
 * 再截小屏竖屏和横屏的设置页，带上安全区。
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

/** 360×640 下截一种语言的主菜单和设置页。 */
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

/** 换一个视口再截设置页。安全区用 CSS 变量，和游戏里读的是同一套。 */
async function shootSettings(page, width, height, file, insets) {
  await page.setViewport({ width, height, isMobile: true, hasTouch: true });
  await page.evaluate((safe) => {
    const root = document.documentElement;
    root.style.setProperty('--safe-area-inset-top', `${safe.top}px`);
    root.style.setProperty('--safe-area-inset-right', `${safe.right}px`);
    root.style.setProperty('--safe-area-inset-bottom', `${safe.bottom}px`);
    root.style.setProperty('--safe-area-inset-left', `${safe.left}px`);
    window.dispatchEvent(new Event('resize'));
  }, insets);
  // 等画布跟着视口变完，再进设置页。超时只是页面没起来时的上限。
  await page.waitForFunction((w, h) => {
    const bounds = window.__PHASER_GAME__?.scale?.canvasBounds;
    return bounds && Math.abs(bounds.width - w) < 2 && Math.abs(bounds.height - h) < 2;
  }, { timeout: WAIT_MS }, width, height);
  await page.evaluate(() => {
    window.__PHASER_GAME__.scene.start('settings');
  });
  await waitScene(page, 'settings');
  await waitFrames(page, 8);
  await page.screenshot({ path: path.join(outDir, file) });
}

/** 安卓壳的开局面板：加载中、可领取、已领取。网页不画这个按钮。 */
async function shootStarter(browser) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 ; wv)');
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (error) => {
    console.error(error);
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('fangkuai-paoku-locale', 'zh');
    window.__FANGKUAI_AD_MOCK__ = { ready: false, phase: 'loading', outcome: 'rewarded' };
  });
  await page.goto('http://127.0.0.1:4191/', { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  await waitScene(page, 'menu');
  await waitFrames(page, 4);
  await page.evaluate(() => {
    window.__PHASER_GAME__.scene.start('game', { levelId: 'level-1' });
  });
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    const label = scene?.startUi?.watch?.caption?.text || '';
    return scene?.holdingStart === true && label.length > 0;
  }, { timeout: WAIT_MS });
  await waitFrames(page, 4);
  await page.screenshot({ path: path.join(outDir, 'powerup-loading.png') });
  await page.evaluate(() => {
    const mock = window.__FANGKUAI_AD_MOCK__;
    mock.ready = true;
    mock.phase = 'ready';
    window.__PHASER_GAME__.scene.getScene('game').refreshStarterButton();
  });
  await waitFrames(page, 2);
  await page.screenshot({ path: path.join(outDir, 'powerup-ready.png') });
  await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('game').watchStarterAd());
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return scene?.starterOffer?.claimed === true;
  }, { timeout: WAIT_MS });
  await waitFrames(page, 2);
  await page.screenshot({ path: path.join(outDir, 'powerup-claimed.png') });
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

    // 暂停面板和继续倒数。等的是游戏帧，不是墙上的三秒。
    await page.evaluate(() => {
      window.__PHASER_GAME__.scene.getScene('game').openPause();
    });
    await waitFrames(page, 3);
    await page.screenshot({ path: path.join(outDir, 'pause-panel.png') });
    await page.evaluate(() => {
      window.__PHASER_GAME__.scene.getScene('game').beginResume();
    });
    await waitFrames(page, 2);
    await page.screenshot({ path: path.join(outDir, 'pause-countdown.png') });

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
    // 小屏设置页带上刘海和底部安全区，确认返回按钮和语言行没被挡住。
    await shootSettings(page, 360, 640, 'settings-portrait.png', {
      top: 48, right: 0, bottom: 34, left: 0,
    });
    await shootSettings(page, 844, 390, 'settings-landscape.png', {
      top: 0, right: 47, bottom: 21, left: 47,
    });
    copyFileSync(path.join(outDir, 'settings-portrait.png'), path.join(artifactDir, 'settings-portrait.png'));
    copyFileSync(path.join(outDir, 'settings-landscape.png'), path.join(artifactDir, 'settings-landscape.png'));
    await shootStarter(browser);
    for (const name of [
      'pause-panel.png',
      'pause-countdown.png',
      'powerup-loading.png',
      'powerup-ready.png',
      'powerup-claimed.png',
    ]) {
      copyFileSync(path.join(outDir, name), path.join(artifactDir, name));
    }
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
