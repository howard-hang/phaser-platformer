/**
 * 固定截图。一条命令生成主菜单、关卡选择、游戏中、设置页。
 * 另外按五种语言各截一张 360×640 的主菜单和设置页，再拼成两张对比图。
 * 再截小屏竖屏和横屏的设置页，带上安全区。
 * 输出目录是仓库根下的 shots/。等待只设宽松上限，画面是否就绪看游戏帧。
 * 同一条命令把 Play 商店图写到 store/：512 图标、1024×500 宣传图、1920×1080 截图。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
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
  await page.screenshot({ path: path.join(outDir, 'start-ready.png') });
  await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('game').watchStarterAd());
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return scene?.starterOffer?.claimed === true;
  }, { timeout: WAIT_MS });
  await waitFrames(page, 2);
  await page.screenshot({ path: path.join(outDir, 'powerup-claimed.png') });
  await page.close();
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

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** 解出 PNG 像素。用来确认截图不是整张纯色。 */
function readPngPixels(file) {
  const buf = readFileSync(file);
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${file} 不是 PNG`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  const idats = [];
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels || !width || !height) throw new Error(`${file} 无法读取像素`);
  const raw = inflateSync(Buffer.concat(idats));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? Buffer.alloc(stride) : pixels.subarray((y - 1) * stride, y * stride);
    for (let i = 0; i < stride; i += 1) {
      const value = raw[src];
      src += 1;
      const left = i >= channels ? row[i - channels] : 0;
      const up = prior[i];
      const upLeft = i >= channels ? prior[i - channels] : 0;
      let out = value;
      if (filter === 1) out = (value + left) & 255;
      else if (filter === 2) out = (value + up) & 255;
      else if (filter === 3) out = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) out = (value + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`${file} 滤镜 ${filter} 无法解析`);
      row[i] = out;
    }
  }
  return { width, height, channels, pixels };
}

/**
 * 商店图不能整张一个颜色。
 * 图标和宣传图还要在中间安全区同时出现浅色（角色或标题）和深色（描边或障碍）。
 */
function assertStoreImage(file, { subject = false } = {}) {
  const { width, height, channels, pixels } = readPngPixels(file);
  let first = null;
  let varied = false;
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const i = (y * width + x) * channels;
      const rgb = [pixels[i], pixels[i + 1] || 0, pixels[i + 2] || 0];
      if (!first) first = rgb;
      else if (rgb[0] !== first[0] || rgb[1] !== first[1] || rgb[2] !== first[2]) varied = true;
    }
  }
  if (!varied) throw new Error(`${file} 整张颜色相同，画面没有画出来`);
  if (!subject) return;
  const x0 = Math.floor(width * 0.18);
  const x1 = Math.floor(width * 0.82);
  const y0 = Math.floor(height * 0.12);
  const y1 = Math.floor(height * 0.88);
  let light = false;
  let dark = false;
  for (let y = y0; y < y1; y += 4) {
    for (let x = x0; x < x1; x += 4) {
      const i = (y * width + x) * channels;
      const lum = pixels[i] * 0.3 + (pixels[i + 1] || 0) * 0.59 + (pixels[i + 2] || 0) * 0.11;
      if (lum > 210) light = true;
      if (lum < 45) dark = true;
    }
  }
  if (!light || !dark) {
    throw new Error(`${file} 中间安全区缺少角色、标题或障碍`);
  }
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
    assertStoreImage(dest);
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
  await drawStoreArt(browser, 512, 512, 'icon');
  await drawStoreArt(browser, 1024, 500, 'feature');
}

async function drawStoreArt(browser, width, height, kind) {
  const page = await browser.newPage();
  try {
    const token = `${kind}-${width}x${height}`;
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(storeArtHtml(kind, token), { waitUntil: 'load', timeout: WAIT_MS });
    await page.waitForFunction((expected) => {
      return window.__artToken === expected && window.__artReady === true;
    }, { timeout: WAIT_MS }, token);
    const payload = await page.evaluate(() => ({
      error: window.__artError || '',
      png: window.__artPng || '',
      w: window.__artW || 0,
      h: window.__artH || 0,
    }));
    if (payload.error || !payload.png.startsWith('data:image/png')) {
      throw new Error(payload.error || `${kind} 画布没有导出`);
    }
    if (payload.w !== width || payload.h !== height) {
      throw new Error(`${kind} 尺寸是 ${payload.w}x${payload.h}，期望 ${width}x${height}`);
    }
    const file = kind === 'icon' ? 'icon-512.png' : 'feature-1024x500.png';
    const dest = path.join(storeDir, file);
    writeFileSync(dest, Buffer.from(payload.png.slice('data:image/png;base64,'.length), 'base64'));
    if (kind === 'feature') flattenPng(dest);
    assertStoreImage(dest, { subject: true });
    copyFileSync(dest, path.join(artifactDir, file));
  } finally {
    await page.close();
  }
}

function storeArtHtml(kind, token) {
  const fontBytes = readFileSync(path.join(root, 'src/assets/game-font.woff2'));
  const fontSrc = `data:font/woff2;base64,${fontBytes.toString('base64')}`;
  const width = kind === 'icon' ? 512 : 1024;
  const height = kind === 'icon' ? 512 : 500;
  const feature = kind === 'feature';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #102010; }
  canvas { display: block; width: 100%; height: 100%; }
</style></head>
<body><canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
canvas.width = ${width};
canvas.height = ${height};
const ctx = canvas.getContext('2d');
window.__artToken = ${JSON.stringify(token)};
window.__artReady = false;
window.__artW = canvas.width;
window.__artH = canvas.height;
(async () => {
  window.__artError = '';
  try {
    const face = new FontFace('GameFont', ${JSON.stringify(`url(${fontSrc})`)});
    await face.load();
    document.fonts.add(face);
    if (!document.fonts.check('64px GameFont')) throw new Error('游戏字体没有加载');

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
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? outer * 0.42 : inner * 0.42;
        const angle = -Math.PI / 2 + i * (Math.PI / 5);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#fff4c2';
      ctx.fill();
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

    function block(x, y, size) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 42, size / 42);
      ctx.fillStyle = '#24082f';
      ctx.fillRect(0, 0, 42, 42);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, 38, 38);
      ctx.strokeRect(13, 13, 16, 16);
      ctx.restore();
    }

    if (${feature ? 'false' : 'true'}) {
      ctx.fillStyle = '#c026d3';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      player(116, 96, 280);
      star(390, 118, 36, 16);
    } else {
      const groundY = 372;
      const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
      sky.addColorStop(0, '#2a0840');
      sky.addColorStop(0.55, '#6d128c');
      sky.addColorStop(1, '#c026d3');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      function beam(x) {
        const paint = ctx.createLinearGradient(0, 24, 0, groundY);
        paint.addColorStop(0, 'rgba(224, 247, 255, 0)');
        paint.addColorStop(0.25, 'rgba(232, 121, 249, 0.45)');
        paint.addColorStop(0.7, 'rgba(224, 247, 255, 0.32)');
        paint.addColorStop(1, 'rgba(192, 38, 211, 0)');
        ctx.fillStyle = paint;
        ctx.fillRect(x, 24, 18, groundY - 24);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fillRect(x + 7, 24, 4, groundY - 24);
      }
      beam(96);
      beam(908);

      const sparkle = (x, y, s) => {
        ctx.fillStyle = '#f5d0fe';
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s * 0.55, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s * 0.55, y);
        ctx.closePath();
        ctx.fill();
      };
      [[150, 48, 7], [250, 96, 5], [780, 58, 6], [860, 118, 5], [700, 36, 4]].forEach(([x, y, s]) => {
        sparkle(x, y, s);
      });

      const ridges = [
        { color: '#3b0764', step: 228, peak: 132, base: 28 },
        { color: '#6b21a8', step: 152, peak: 88, base: 16 },
        { color: '#a21caf', step: 114, peak: 52, base: 8 },
      ];
      ridges.forEach((ridge) => {
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        for (let x = 0; x <= canvas.width + ridge.step; x += ridge.step) {
          const lift = (Math.floor(x / ridge.step) % 2 === 0) ? 1 : 0.72;
          ctx.lineTo(x, groundY - ridge.base);
          ctx.lineTo(x + ridge.step / 2, groundY - ridge.peak * lift);
        }
        ctx.lineTo(canvas.width, groundY);
        ctx.closePath();
        ctx.fillStyle = ridge.color;
        ctx.fill();
      });

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      [groundY - 46, groundY - 28, groundY - 14].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      });

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
      ctx.fillStyle = '#b517c9';
      ctx.fillRect(0, groundY + 28, canvas.width, 3);
      ctx.fillRect(0, groundY + 64, canvas.width, 3);

      const playerSize = 132;
      player(210, groundY - playerSize, playerSize);
      block(470, groundY - 56, 56);
      block(548, groundY - 132, 52);
      spike(630, groundY - 62, 62);
      spike(708, groundY - 62, 62);
      spike(786, groundY - 58, 58);
      star(400, groundY - 118, 16, 7);

      function title(text, y, size, fill, maxWidth) {
        let next = size;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = next + 'px GameFont, sans-serif';
        while (ctx.measureText(text).width > maxWidth && next > 32) {
          next -= 2;
          ctx.font = next + 'px GameFont, sans-serif';
        }
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(7, Math.round(next / 9));
        ctx.strokeStyle = '#2a0833';
        ctx.strokeText(text, canvas.width / 2, y);
        ctx.fillStyle = fill;
        ctx.fillText(text, canvas.width / 2, y);
      }
      title('Block Runner', 58, 72, '#ffffff', 620);
      title('方块跑酷', 146, 52, '#ffe14a', 420);
    }

    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const probe = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const r0 = probe[0];
    const g0 = probe[1];
    const b0 = probe[2];
    let varied = false;
    for (let i = 0; i < probe.length; i += 16 * 4) {
      if (probe[i] !== r0 || probe[i + 1] !== g0 || probe[i + 2] !== b0) {
        varied = true;
        break;
      }
    }
    if (!varied) throw new Error('画布整张颜色相同');
    window.__artPng = canvas.toDataURL('image/png');
  } catch (err) {
    window.__artError = err && err.message ? err.message : String(err);
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
    copyFileSync(path.join(outDir, 'playing.png'), path.join(artifactDir, 'hud-playing.png'));

    // 暂停面板和继续倒数。等的是游戏帧，不是墙上的三秒。
    await page.evaluate(() => {
      window.__PHASER_GAME__.scene.getScene('game').openPause();
    });
    await waitFrames(page, 3);
    await page.screenshot({ path: path.join(outDir, 'pause-panel.png') });
    copyFileSync(path.join(outDir, 'pause-panel.png'), path.join(artifactDir, 'pause-panel-compact.png'));
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
    await shootStarter(browser);
    for (const name of [
      'pause-countdown.png',
      'powerup-loading.png',
      'powerup-ready.png',
      'powerup-claimed.png',
      'start-ready.png',
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
