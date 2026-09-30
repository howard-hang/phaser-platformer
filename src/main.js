/**
 * 游戏入口。用 EXPAND 按宽高比铺满屏幕：短边对齐，长边扩大可视区域，不拉伸、不留黑边。
 */
import './style.css';
import Phaser from 'phaser';
import { TUNING } from './logic/world.js';
import { THEME } from './game/theme.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { SelectScene } from './scenes/SelectScene.js';
import { GameScene } from './scenes/GameScene.js';
import { ErrorScene } from './scenes/ErrorScene.js';
import { bindAndroidBack } from './platform/androidBack.js';
import { bindAudioLifecycle, getSynth } from './game/audio.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: TUNING.viewWidth,
  height: TUNING.viewHeight,
  backgroundColor: THEME.bg,
  banner: false,
  scale: {
    // EXPAND：父元素多大，画面就铺满多大。游戏宽高按比例加长，角色不会被拉扁。
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: TUNING.viewWidth,
    height: TUNING.viewHeight,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: TUNING.gravity },
      fps: 60,
      fixedStep: true,
      debug: false,
    },
  },
  input: {
    keyboard: true,
    mouse: true,
    touch: true,
    activePointers: 2,
  },
  fps: {
    // 不限制渲染帧率，跟浏览器刷新率走。物理仍用上面的 60Hz 固定步长，手感不变。
    limit: 0,
  },
  scene: [BootScene, MenuScene, SelectScene, GameScene, ErrorScene],
};

/** 网址带 ?fps 时在左下角显示 Phaser 统计的帧率，方便对照刷新率。 */
function attachFpsMeter(game) {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('fps')) return;

  document.getElementById('fps-meter')?.remove();
  const meter = document.createElement('div');
  meter.id = 'fps-meter';
  meter.textContent = 'FPS --';
  document.body.appendChild(meter);

  window.setInterval(() => {
    if (!game.loop) return;
    meter.textContent = `FPS ${Math.round(game.loop.actualFps)}`;
  }, 250);
}

async function main() {
  if (document.fonts?.load) {
    try {
      await document.fonts.load('32px GameFont');
      await document.fonts.ready;
    } catch {
      // 字体失败时仍启动游戏，系统字体可以顶上。
    }
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') event.preventDefault();
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  // 任意一次点击或按键都算用户手势，用来解开自动播放限制。
  const unlockAudio = () => getSynth().unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  if (window.__PHASER_GAME__) {
    window.__PHASER_GAME__.destroy(true);
  }
  window.__PHASER_GAME__ = new Phaser.Game(config);
  attachFpsMeter(window.__PHASER_GAME__);
  // 网页版会立刻返回；安卓壳里改成：关卡回主页，主页退出。
  bindAndroidBack(window.__PHASER_GAME__);
  bindAudioLifecycle();
}

main();
