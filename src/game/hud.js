/**
 * 左上角计数和右上角按钮。全部是矢量图形和文字，不贴 PNG。
 * 按钮用比图标更大的点击区，缩进安全区之后仍然好点。
 * 位置按当前画面和刘海安全区重排，不写死在 960×540 上。
 */
import { FONT, THEME } from './theme.js';
import { getSynth } from './audio.js';
import { isNativeShell } from '../platform/androidBack.js';
import { layoutHud, nextFullscreenAction, shouldShowFullscreenButton } from './viewport.js';

function labelStyle(color, size) {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: THEME.stroke,
    strokeThickness: 5,
  };
}

function addCornerButton(scene, x, y, texture, onClick, { onUp = false } = {}) {
  const zone = scene.add.zone(x, y, 88, 88).setScrollFactor(0).setDepth(250);
  zone.setInteractive({ useHandCursor: true });
  zone.setData('ui', true);
  const circle = scene.add.circle(x, y, 28, 0xffffff, 0)
    .setStrokeStyle(3, 0xffffff, 1)
    .setScrollFactor(0)
    .setDepth(251);
  const icon = scene.add.image(x, y, texture)
    .setDisplaySize(40, 40)
    .setScrollFactor(0)
    .setDepth(252);
  // 按下就先挡住跳跃。全屏必须在抬起时调用，浏览器才认这次手势。
  zone.on('pointerdown', () => {
    scene.suppressJump = true;
    if (!onUp) onClick();
  });
  if (onUp) {
    zone.on('pointerup', () => {
      scene.suppressJump = true;
      onClick();
    });
  }
  return { zone, circle, icon };
}

function placeButton(button, x, y) {
  if (!button) return;
  button.zone.setPosition(x, y);
  button.circle.setPosition(x, y);
  button.icon.setPosition(x, y);
}

function isFullscreenNow() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/** 网页全屏。原生壳没有地址栏，不走这条。 */
function toggleDocumentFullscreen() {
  const action = nextFullscreenAction(isFullscreenNow());
  const root = document.documentElement;
  if (action === 'exit') {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
    return;
  }
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (request) request.call(root);
}

/** 创建常驻 HUD。onHome 只在关卡里需要。 */
export function createHud(scene, { onHome = null, showStats = true } = {}) {
  const showFullscreen = shouldShowFullscreenButton(isNativeShell());
  let score;
  let deaths;
  let stars;
  if (showStats) {
    score = scene.add.text(22, 16, 'SCORE: 0', labelStyle(THEME.score, 34))
      .setScrollFactor(0)
      .setDepth(240);
    deaths = scene.add.text(22, 56, 'DEATHS: 0', labelStyle(THEME.death, 34))
      .setScrollFactor(0)
      .setDepth(240);
    stars = scene.add.text(22, 96, 'STARS: 0', labelStyle(THEME.stars, 34))
      .setScrollFactor(0)
      .setDepth(240);
  }

  const sound = addCornerButton(scene, 908, 48, 'icon-sound', () => {
    const synth = getSynth();
    const muted = synth.toggleMuted();
    synth.unlock();
    sound.icon.setTexture(muted ? 'icon-mute' : 'icon-sound');
  });

  let fullscreen = null;
  if (showFullscreen) {
    fullscreen = addCornerButton(scene, 808, 48, 'icon-fullscreen', () => {
      getSynth().unlock();
      toggleDocumentFullscreen();
    }, { onUp: true });
    const syncIcon = () => {
      fullscreen.icon.setTexture(isFullscreenNow() ? 'icon-fullscreen-exit' : 'icon-fullscreen');
    };
    document.addEventListener('fullscreenchange', syncIcon);
    document.addEventListener('webkitfullscreenchange', syncIcon);
    scene.events.once('shutdown', () => {
      document.removeEventListener('fullscreenchange', syncIcon);
      document.removeEventListener('webkitfullscreenchange', syncIcon);
    });
  }

  let home = null;
  if (onHome) {
    home = addCornerButton(scene, 708, 48, 'icon-home', () => {
      getSynth().unlock();
      scene.time.delayedCall(0, onHome);
    });
  }

  const synth = getSynth();
  sound.icon.setTexture(synth.muted ? 'icon-mute' : 'icon-sound');

  const hud = {
    showFullscreen,
    jumpGuard: { left: 740, bottom: 120 },
    setStats(state) {
      if (!showStats) return;
      score.setText(`SCORE: ${state.score}`);
      deaths.setText(`DEATHS: ${state.deaths}`);
      stars.setText(`STARS: ${state.stars}`);
    },
    relayout({ viewWidth, viewHeight, insets }) {
      const layout = layoutHud({
        viewWidth,
        viewHeight,
        insets,
        showHome: !!onHome,
        showFullscreen,
      });
      if (showStats) {
        score.setPosition(layout.score.x, layout.score.y);
        deaths.setPosition(layout.deaths.x, layout.deaths.y);
        stars.setPosition(layout.stars.x, layout.stars.y);
      }
      placeButton(sound, layout.sound.x, layout.sound.y);
      placeButton(fullscreen, layout.fullscreen?.x, layout.fullscreen?.y);
      placeButton(home, layout.home?.x, layout.home?.y);
      hud.jumpGuard = layout.jumpGuard;
      return layout;
    },
    home,
    sound,
    fullscreen,
  };
  return hud;
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** 通关面板。再玩一次会重启当前场景，背景音乐不从头播放。 */
export function showWinPanel(scene, stats, onReplay) {
  const panel = scene.add.graphics().setScrollFactor(0).setDepth(200);
  const title = scene.add.text(0, 0, '通关', labelStyle('#ffffff', 52))
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(210);
  const body = scene.add.text(0, 0, '', { ...labelStyle('#ffffff', 26), align: 'center' })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(210);
  const button = scene.add.rectangle(0, 0, 240, 64, 0xffffff)
    .setScrollFactor(0)
    .setDepth(260)
    .setInteractive({ useHandCursor: true });
  button.setData('ui', true);
  const caption = scene.add.text(0, 0, '再玩一次', {
    fontFamily: FONT,
    fontSize: '32px',
    color: '#2a0838',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(261);

  button.on('pointerdown', () => {
    scene.suppressJump = true;
    scene.time.delayedCall(0, onReplay);
  });

  const view = {
    panel,
    title,
    body,
    button,
    caption,
    relayout(viewWidth, viewHeight) {
      const w = 520;
      const h = 300;
      const x = (viewWidth - w) / 2;
      const y = Math.max(24, (viewHeight - h) / 2);
      panel.clear();
      panel.fillStyle(0x2a0838, 0.88);
      panel.fillRoundedRect(x, y, w, h, 18);
      panel.lineStyle(4, 0xffffff, 0.9);
      panel.strokeRoundedRect(x, y, w, h, 18);
      title.setPosition(viewWidth / 2, y + 45);
      body.setText(
        `分数 ${stats.score}\n死亡 ${stats.deaths}\n星星 ${stats.stars} / ${stats.totalStars}\n用时 ${formatTime(stats.timeMs)}`,
      );
      body.setPosition(viewWidth / 2, y + 125);
      button.setPosition(viewWidth / 2, y + 240);
      caption.setPosition(viewWidth / 2, y + 240);
    },
  };
  view.relayout(scene.scale.width, scene.scale.height);
  return view;
}

/** 主页上的开始按钮。 */
export function createStartButton(scene, x, y, onClick) {
  const button = scene.add.rectangle(x, y, 280, 72, 0xffffff)
    .setScrollFactor(0)
    .setDepth(20)
    .setInteractive({ useHandCursor: true });
  button.setData('ui', true);
  const caption = scene.add.text(x, y, '开始游戏', {
    fontFamily: FONT,
    fontSize: '36px',
    color: '#2a0838',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
  button.on('pointerdown', () => {
    scene.suppressJump = true;
    onClick();
  });
  return {
    button,
    caption,
    setPosition(nx, ny) {
      button.setPosition(nx, ny);
      caption.setPosition(nx, ny);
    },
  };
}

export function isUiPointer(scene, pointer) {
  const hits = scene.input.hitTestPointer(pointer);
  return hits.some((obj) => obj.getData && obj.getData('ui'));
}
