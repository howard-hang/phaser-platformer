/**
 * 左上角计数和右上角按钮。全部是矢量图形和文字，不贴 PNG。
 * 按钮用比图标更大的点击区，竖屏缩进去以后仍然好点。
 */
import { FONT, THEME } from './theme.js';
import { getSynth } from './audio.js';

function labelStyle(color, size) {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: THEME.stroke,
    strokeThickness: 5,
  };
}

function addCornerButton(scene, x, y, texture, onClick) {
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
  zone.on('pointerdown', () => {
    scene.suppressJump = true;
    onClick();
  });
  return { zone, circle, icon };
}

/** 创建常驻 HUD。onHome 只在关卡里需要。 */
export function createHud(scene, { onHome = null, showStats = true } = {}) {
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

  let home = null;
  if (onHome) {
    home = addCornerButton(scene, 808, 48, 'icon-home', () => {
      scene.time.delayedCall(0, onHome);
    });
  }

  const synth = getSynth();
  sound.icon.setTexture(synth.muted ? 'icon-mute' : 'icon-sound');

  return {
    setStats(state) {
      if (!showStats) return;
      score.setText(`SCORE: ${state.score}`);
      deaths.setText(`DEATHS: ${state.deaths}`);
      stars.setText(`STARS: ${state.stars}`);
    },
    home,
    sound,
  };
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** 通关面板。再玩一次会重启当前场景。 */
export function showWinPanel(scene, stats, onReplay) {
  const panel = scene.add.graphics().setScrollFactor(0).setDepth(200);
  panel.fillStyle(0x2a0838, 0.88);
  panel.fillRoundedRect(220, 130, 520, 300, 18);
  panel.lineStyle(4, 0xffffff, 0.9);
  panel.strokeRoundedRect(220, 130, 520, 300, 18);

  const title = scene.add.text(480, 175, '通关', labelStyle('#ffffff', 52))
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(210);
  const body = scene.add.text(
    480,
    255,
    `分数 ${stats.score}\n死亡 ${stats.deaths}\n星星 ${stats.stars} / ${stats.totalStars}\n用时 ${formatTime(stats.timeMs)}`,
    { ...labelStyle('#ffffff', 26), align: 'center' },
  ).setOrigin(0.5).setScrollFactor(0).setDepth(210);

  const button = scene.add.rectangle(480, 370, 240, 64, 0xffffff)
    .setScrollFactor(0)
    .setDepth(260)
    .setInteractive({ useHandCursor: true });
  button.setData('ui', true);
  const caption = scene.add.text(480, 370, '再玩一次', {
    fontFamily: FONT,
    fontSize: '32px',
    color: '#2a0838',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(261);

  button.on('pointerdown', () => {
    scene.suppressJump = true;
    scene.time.delayedCall(0, onReplay);
  });

  return { panel, title, body, button, caption };
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
  return { button, caption };
}

export function isUiPointer(scene, pointer) {
  const hits = scene.input.hitTestPointer(pointer);
  return hits.some((obj) => obj.getData && obj.getData('ui'));
}
