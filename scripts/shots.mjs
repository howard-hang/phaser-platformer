/**
 * 固定截图。一条命令生成主菜单、关卡选择、游戏中、设置页。
 * 另外按五种语言各截一张 360×640 的主菜单和设置页，再拼成两张对比图。
 * 再截小屏竖屏和横屏的设置页，带上安全区。
 * 输出目录是仓库根下的 shots/。等待只设宽松上限，画面是否就绪看游戏帧。
 * 同一条命令把 Play 商店图写到 store/：512 图标、1024×500 宣传图、1920×1080 截图。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(root, 'shots');
const storeDir = path.join(root, 'store');
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

/** 宣传图和截图去掉透明通道，符合 Play 的 24 位 PNG。 */
function flattenPng(file) {
  const tmp = `${file}.flat.png`;
  const result = spawnSync('ffmpeg', ['-y', '-i', file, '-pix_fmt', 'rgb24', tmp], { stdio: 'pipe' });
  if (result.status !== 0) {
    const detail = result.stderr ? result.stderr.toString() : '';
    throw new Error(`去掉透明通道失败 ${file}\n${detail}`);
  }
  renameSync(tmp, file);
}

/** 等画布跟上视口。超时只是页面没起来时的上限。 */
async function waitCanvas(page, width, height) {
  await page.waitForFunction((w, h) => {
    const bounds = window.__PHASER_GAME__?.scale?.canvasBounds;
    return bounds && Math.abs(bounds.width - w) < 2 && Math.abs(bounds.height - h) < 2;
  }, { timeout: WAIT_MS }, width, height);
}

/** Play 手机截图，1920×1080，横屏，和游戏方向一致。 */
async function shootPlayPhones(page) {
  mkdirSync(storeDir, { recursive: true });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await waitCanvas(page, 1920, 1080);

  const save = async (file) => {
    const dest = path.join(storeDir, file);
    await page.screenshot({ path: dest, type: 'png' });
    flattenPng(dest);
    copyFileSync(dest, path.join(artifactDir, file));
  };

  await page.evaluate(() => window.__PHASER_GAME__.scene.start('menu'));
  await waitScene(page, 'menu');
  await waitFrames(page, 8);
  await save('phone-01-menu.png');

  await page.evaluate(() => window.__PHASER_GAME__.scene.start('select'));
  await waitScene(page, 'select');
  await waitFrames(page, 8);
  await save('phone-02-select.png');

  await page.evaluate(() => {
    window.__PHASER_GAME__.scene.start('game', { levelId: 'level-1' });
  });
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return scene?.scene?.isActive?.() && scene.player?.body;
  }, { timeout: WAIT_MS });
  const startX = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('game').level.startX);
  await page.waitForFunction((origin) => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return scene.player.x >= origin + 180;
  }, { timeout: WAIT_MS }, startX);
  await save('phone-03-playing.png');

  await page.evaluate(() => window.__PHASER_GAME__.scene.start('settings'));
  await waitScene(page, 'settings');
  await waitFrames(page, 8);
  await save('phone-04-settings.png');
}

/** 用和游戏相同的几何方块画图标和宣传图，不另做一套卡通脸。 */
async function shootStoreArt(browser) {
  const page = await browser.newPage();
  try {
    await drawStoreArt(page, 512, 512, 'icon');
    await drawStoreArt(page, 1024, 500, 'feature');
  } finally {
    await page.close();
  }
}

async function drawStoreArt(page, width, height, kind) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(storeArtHtml(kind), { waitUntil: 'load', timeout: WAIT_MS });
  await page.waitForFunction(() => window.__artReady === true, { timeout: WAIT_MS });
  const file = kind === 'icon' ? 'icon-512.png' : 'feature-1024x500.png';
  const dest = path.join(storeDir, file);
  await page.screenshot({ path: dest, type: 'png', omitBackground: false });
  if (kind === 'feature') flattenPng(dest);
  copyFileSync(dest, path.join(artifactDir, file));
}

function storeArtHtml(kind) {
  const fontUrl = 'http://127.0.0.1:4191/src/assets/game-font.woff2';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #c026d3; }
  canvas { display: block; }
  @font-face { font-family: GameFont; src: url('${fontUrl}') format('woff2'); }
</style></head>
<body><canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
canvas.width = ${kind === 'icon' ? 512 : 1024};
canvas.height = ${kind === 'icon' ? 512 : 500};
const ctx = canvas.getContext('2d');
(async () => {
  try { await document.fonts.load('92px GameFont'); } catch (err) {}

function star(cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * (Math.PI / 5);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffc107';
  ctx.fill();
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = Math.max(2, outer / 8);
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function player(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 42, size / 42);
  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(0, 0, 42, 42);
  ctx.fillStyle = '#d4d4d8';
  ctx.beginPath();
  ctx.moveTo(42, 0);
  ctx.lineTo(42, 42);
  ctx.lineTo(0, 42);
  ctx.lineTo(8, 34);
  ctx.lineTo(34, 34);
  ctx.lineTo(34, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 38, 38);
  ctx.fillStyle = '#161616';
  ctx.fillRect(13, 13, 16, 16);
  ctx.restore();
}

function spike(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 36, size / 36);
  ctx.beginPath();
  ctx.moveTo(18, 2);
  ctx.lineTo(34, 33);
  ctx.lineTo(2, 33);
  ctx.closePath();
  ctx.fillStyle = '#1a0a22';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

if (${kind === 'icon' ? 'true' : 'false'}) {
  ctx.fillStyle = '#c026d3';
  ctx.fillRect(0, 0, 512, 512);
  player(116, 96, 280);
  star(390, 118, 36, 16);
} else {
  const sky = ctx.createLinearGradient(0, 0, 0, 500);
  sky.addColorStop(0, '#2a0840');
  sky.addColorStop(0.55, '#6d128c');
  sky.addColorStop(1, '#c026d3');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 500);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 430, 1024, 70);
  player(72, 150, 230);
  spike(360, 360, 70);
  spike(450, 360, 70);
  star(430, 120, 28, 12);
  star(500, 160, 22, 9);
  star(560, 110, 18, 8);
  ctx.fillStyle = '#ffe14a';
  ctx.strokeStyle = '#3b0764';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.font = '92px GameFont, sans-serif';
  ctx.textBaseline = 'top';
  ctx.strokeText('方块跑酷', 430, 200);
  ctx.fillText('方块跑酷', 430, 200);
  ctx.lineWidth = 6;
  ctx.font = '42px GameFont, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText('Block Runner', 434, 310);
  ctx.fillText('Block Runner', 434, 310);
}
window.__artReady = true;
})();
</script></body></html>`;
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

    await shootPlayPhones(page);
    await shootStoreArt(browser);

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
