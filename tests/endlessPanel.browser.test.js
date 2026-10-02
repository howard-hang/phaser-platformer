/**
 * 无尽模式结算面板的真实点击。
 * 16:9 和 20:9 各测一遍，鼠标和触屏都要点「再来一次」和「回主页」。
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

/**
 * 墙钟只作为等待上限。结算是否出现，按游戏帧和场景 update 累加的 delta 断言。
 * CI 上 Chrome 抢 CPU 时，一秒墙钟可能只推进几帧。
 */
const WAIT_MS = 60000;

describe('无尽结算按钮能点', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    mkdirSync('/tmp/shots/endless', { recursive: true });
    server = await createServer({
      server: { host: '127.0.0.1', port: 4181, strictPort: true },
      logLevel: 'error',
    });
    await server.listen();
    baseUrl = 'http://127.0.0.1:4181/';
  }, 60000);

  afterAll(async () => {
    await server?.close();
  });

  it.each(VIEWPORTS)('$name 下鼠标和触屏都能再来一次、回主页', async ({ name, width, height }) => {
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
        for (const action of ['replay', 'home']) {
          const page = await browser.newPage();
          page.on('pageerror', (err) => errors.push(`${name} ${mode} ${action}: ${err.message}`));
          const result = await exercise(page, baseUrl, { name, mode, action, width, height });
          outcomes.push(result);
          await page.close();
        }
      }
      expect(errors, errors.join('\n')).toEqual([]);
      for (const result of outcomes) {
        expect(result.panelTitle === '新纪录' || result.panelTitle === '本局结束', JSON.stringify(result)).toBe(true);
        expect(result.body, JSON.stringify(result)).toContain('米');
        expect(result.body, JSON.stringify(result)).toContain('星星');
        expect(result.labels, JSON.stringify(result)).toEqual(['再来一次', '回主页']);
        // 撞上尖刺后，结算出现在死亡特效的游戏内时间走完之后，不看墙上过了多久。
        expect(result.hitFrames, JSON.stringify(result)).toBeGreaterThan(0);
        expect(result.hitSim, JSON.stringify(result)).toBeGreaterThanOrEqual(400);
        expect(result.hitSim, JSON.stringify(result)).toBeLessThan(2000);
        if (result.action === 'replay') {
          expect(result.after).toMatchObject({ game: true, endless: true, ended: false, menu: false });
          expect(result.after.x).toBeLessThan(500);
        } else {
          expect(result.after.menu).toBe(true);
          expect(result.after.game).toBe(false);
        }
      }
    } finally {
      await browser.close();
    }
  }, 360000);
});

async function exercise(page, baseUrl, { name, mode, action, width, height }) {
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('fangkuai-paoku-endless');
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  await page.waitForFunction(
    () => window.__PHASER_GAME__?.scene?.getScene?.('menu')?.scene?.isActive?.(),
    { timeout: WAIT_MS },
  );
  const entry = await page.evaluate(() => {
    const menu = window.__PHASER_GAME__.scene.getScene('menu');
    const button = menu.endlessButton;
    return {
      label: button.caption?.text ?? '',
      x: button.zone.x,
      y: button.zone.y,
      enabled: !!button.zone.input?.enabled,
    };
  });
  expect(entry.label, `${name} 主页入口`).toBe('无尽模式');
  expect(entry.enabled, `${name} 主页入口`).toBe(true);
  const shot = name.replace(':', 'x');
  if (mode === 'mouse' && action === 'replay') {
    await page.screenshot({ path: `/tmp/shots/endless/menu-${shot}.png` });
  }
  await clickGamePoint(page, mode, entry.x, entry.y);
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return scene?.scene?.isActive?.() && scene.endless === true && scene.player?.body && scene.level?.obstacles?.length;
  }, { timeout: WAIT_MS });
  // 跑出地面碰撞体原来的范围，确认挪地面不会把场景打崩。
  // 等的是游戏帧，墙钟只给一个宽松上限。
  const farFrame = await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    const y = scene.player.y;
    const far = scene.ground.x + 2900;
    scene.physics.world.pause();
    scene._physicsPose = { x: far, y, angle: 0 };
    scene.player.setPosition(far, y);
    scene.player.body.reset(far, y);
    return scene.game.loop.frame;
  });
  await page.waitForFunction((start) => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return scene.game.loop.frame >= start + 2;
  }, { timeout: WAIT_MS }, farFrame);
  await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    const y = scene.player.y;
    const back = scene.level.startX;
    scene._physicsPose = { x: back, y, angle: 0 };
    scene.player.setPosition(back, y);
    scene.player.body.reset(back, y);
    scene.cameras.main.scrollX = 0;
    scene.physics.world.resume();
  });
  if (mode === 'mouse' && action === 'replay') {
    await page.screenshot({ path: `/tmp/shots/endless/hud-${shot}.png` });
  }
  await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    const spike = scene.level.obstacles.find((item) => item.type === 'spike' && !item.rise);
    scene._physicsPose = null;
    scene.__hitSim = 0;
    scene.__hitFrames = 0;
    const onUpdate = (_time, delta) => {
      if (scene.ended) {
        scene.events.off('update', onUpdate);
        return;
      }
      scene.__hitSim += delta;
      scene.__hitFrames += 1;
    };
    scene.events.on('update', onUpdate);
    scene.player.body.reset(spike.x, scene.player.y);
    scene.player.body.setVelocity(80, 0);
  });
  await page.waitForFunction(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return scene?.ended === true && scene.winUi?.buttons?.length === 2;
  }, { timeout: WAIT_MS });
  const state = await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('game');
    return {
      title: scene.winUi.title?.text ?? '',
      body: scene.winUi.body?.text ?? '',
      hitSim: scene.__hitSim,
      hitFrames: scene.__hitFrames,
      buttons: scene.winUi.buttons.map((button) => ({
        x: button.zone.x,
        y: button.zone.y,
        enabled: !!button.zone.input?.enabled,
        label: button.caption?.text ?? '',
      })),
    };
  });
  const index = action === 'replay' ? 0 : 1;
  const button = state.buttons[index];
  expect(button.enabled, `${name} ${mode} ${action} ${button.label}`).toBe(true);
  if (mode === 'mouse' && action === 'replay') {
    await page.screenshot({ path: `/tmp/shots/endless/panel-${shot}.png` });
  }
  await clickGamePoint(page, mode, button.x, button.y);
  try {
    await page.waitForFunction((kind) => {
      const game = window.__PHASER_GAME__;
      const scene = game.scene.getScene('game');
      const menu = game.scene.getScene('menu');
      if (kind === 'home') return !!menu?.scene?.isActive?.() && !scene?.scene?.isActive?.();
      return !!scene?.scene?.isActive?.()
        && scene.endless === true
        && scene.ended === false
        && scene.player?.x < 500;
    }, { timeout: WAIT_MS }, action);
  } catch (error) {
    const debug = await page.evaluate(() => {
      const game = window.__PHASER_GAME__;
      const scene = game.scene.getScene('game');
      const menu = game.scene.getScene('menu');
      return {
        game: !!scene?.scene?.isActive?.(),
        menu: !!menu?.scene?.isActive?.(),
        ended: scene?.ended,
        endless: scene?.endless,
        x: scene?.player?.x,
        title: scene?.winUi?.title?.text,
      };
    });
    throw new Error(`${name} ${mode} ${action} debug=${JSON.stringify(debug)} ${error.message}`);
  }
  const after = await page.evaluate(() => {
    const game = window.__PHASER_GAME__;
    const scene = game.scene.getScene('game');
    const menu = game.scene.getScene('menu');
    return {
      game: !!scene?.scene?.isActive?.(),
      menu: !!menu?.scene?.isActive?.(),
      endless: scene?.endless === true,
      ended: scene?.ended === true,
      x: Math.round(scene?.player?.x ?? -1),
    };
  });
  return {
    name,
    mode,
    action,
    width,
    height,
    panelTitle: state.title,
    body: state.body,
    hitSim: state.hitSim,
    hitFrames: state.hitFrames,
    labels: state.buttons.map((item) => item.label),
    after,
  };
}

async function clickGamePoint(page, mode, gx, gy) {
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
