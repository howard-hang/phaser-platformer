/**
 * 左上角计数和右上角按钮。按钮是圆形糖果键，图标用矢量贴图，不用 emoji。
 * 数字放在固定格子里，变长时不左右跳。位置按画面和刘海重排。
 */
import Phaser from 'phaser';
import { getSynth } from './audio.js';
import { isNativeShell } from '../platform/androidBack.js';
import { layoutHud, layoutWinPanel, nextFullscreenAction, shouldShowFullscreenButton } from './viewport.js';
import {
  PANEL,
  addCandyText,
  createCandyButton,
  createFixedDigits,
  paintCandyPanel,
  textStyle,
} from './candy.js';

const HUD_SIZE = 26;

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

function createStat(scene, label, color, digits) {
  const caption = scene.add.text(0, 0, label, textStyle({
    size: HUD_SIZE,
    color,
    stroke: '#2a0840',
    strokeThickness: 4,
    align: 'left',
    padding: { x: 1, y: 1 },
  })).setOrigin(0, 0).setScrollFactor(0).setDepth(240);
  const digitsView = createFixedDigits(scene, color, digits, HUD_SIZE);
  return {
    setPosition(x, y) {
      caption.setPosition(x, y);
      digitsView.setPosition(x + caption.width + 6, y);
    },
    setValue(value) {
      digitsView.setValue(value);
    },
  };
}

/** 创建常驻 HUD。onHome 只在关卡里需要。 */
export function createHud(scene, { onHome = null, showStats = true } = {}) {
  const showFullscreen = shouldShowFullscreenButton(isNativeShell());
  let score;
  let deaths;
  let stars;
  if (showStats) {
    score = createStat(scene, 'SCORE', '#3de4ff', 4);
    deaths = createStat(scene, 'DEATHS', '#ff3b30', 3);
    stars = createStat(scene, 'STARS', '#ffffff', 1);
  }

  const sound = createCandyButton(scene, {
    x: 908,
    y: 48,
    width: 62,
    height: 62,
    shape: 'circle',
    variant: 'mint',
    iconKey: 'icon-sound',
    depth: 250,
    onClick: () => {
      const synth = getSynth();
      const muted = synth.toggleMuted();
      synth.unlock();
      sound.setIcon(muted ? 'icon-mute' : 'icon-sound');
    },
  });

  let fullscreen = null;
  if (showFullscreen) {
    fullscreen = createCandyButton(scene, {
      x: 808,
      y: 48,
      width: 62,
      height: 62,
      shape: 'circle',
      variant: 'sky',
      iconKey: 'icon-fullscreen',
      depth: 250,
      onClick: () => {
        getSynth().unlock();
        toggleDocumentFullscreen();
      },
    });
    const syncIcon = () => {
      fullscreen.setIcon(isFullscreenNow() ? 'icon-fullscreen-exit' : 'icon-fullscreen');
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
    home = createCandyButton(scene, {
      x: 708,
      y: 48,
      width: 62,
      height: 62,
      shape: 'circle',
      variant: 'lemon',
      iconKey: 'icon-home',
      depth: 250,
      onClick: () => {
        getSynth().unlock();
        scene.time.delayedCall(0, onHome);
      },
    });
  }

  sound.setIcon(getSynth().muted ? 'icon-mute' : 'icon-sound');

  const hud = {
    showFullscreen,
    jumpGuard: { left: 740, bottom: 120 },
    setStats(state) {
      if (!showStats) return;
      score.setValue(state.score);
      deaths.setValue(state.deaths);
      stars.setValue(state.stars);
    },
    relayout({ viewWidth, viewHeight, insets }) {
      const layout = layoutHud({
        viewWidth,
        viewHeight,
        insets,
        showHome: !!onHome,
        showFullscreen,
        // 计数器出现时，左上角分数往下让一截。
        showFps: typeof window !== 'undefined'
          && new URLSearchParams(window.location.search).has('fps'),
      });
      if (showStats) {
        score.setPosition(layout.score.x, layout.score.y);
        deaths.setPosition(layout.deaths.x, layout.deaths.y);
        stars.setPosition(layout.stars.x, layout.stars.y);
      }
      sound.setPosition(layout.sound.x, layout.sound.y);
      fullscreen?.setPosition(layout.fullscreen.x, layout.fullscreen.y);
      home?.setPosition(layout.home.x, layout.home.y);
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

/**
 * 通关面板。再玩一次、下一关、选关。
 * 星星按拿到的颗数逐个弹出。下一关还锁着时中间按钮不可点。
 */
export function showWinPanel(scene, stats, actions) {
  const panel = scene.add.graphics().setScrollFactor(0).setDepth(200);
  const title = addCandyText(scene, 0, 0, `第 ${stats.index} 关通关`, {
    size: 36,
    color: PANEL.title,
    stroke: '#ffffff',
    strokeThickness: 5,
    shadow: true,
  }).setDepth(210);
  const body = scene.add.text(0, 0, '', textStyle({
    size: 24,
    color: PANEL.body,
    stroke: '#ffffff',
    strokeThickness: 3,
    align: 'center',
    lineSpacing: 6,
    shadow: false,
  })).setOrigin(0.5).setScrollFactor(0).setDepth(210);
  const starIcons = [0, 1, 2].map((index) => {
    const earned = index < stats.stars;
    const icon = scene.add.image(0, 0, earned ? 'star' : 'ui-star-empty')
      .setDisplaySize(36, 36)
      .setScrollFactor(0)
      .setDepth(212);
    const targetScale = icon.scaleX;
    icon.setScale(0);
    scene.tweens.add({
      targets: icon,
      scale: targetScale,
      duration: 280,
      delay: 160 + index * 150,
      ease: 'Back.easeOut',
    });
    return icon;
  });
  const replay = createCandyButton(scene, {
    label: '再玩一次',
    variant: 'pink',
    width: 180,
    fontSize: 26,
    depth: 260,
    onClick: () => scene.time.delayedCall(0, actions.onReplay),
  });
  const next = createCandyButton(scene, {
    label: actions.nextText,
    variant: 'mint',
    width: 248,
    fontSize: 26,
    depth: 260,
    enabled: actions.nextEnabled,
    onClick: () => scene.time.delayedCall(0, actions.onNext),
  });
  const select = createCandyButton(scene, {
    label: '选关',
    variant: 'sky',
    width: 156,
    fontSize: 26,
    depth: 260,
    onClick: () => scene.time.delayedCall(0, actions.onSelect),
  });
  const buttons = [replay, next, select];

  const view = {
    panel,
    title,
    body,
    buttons,
    relayout(viewWidth, viewHeight, insets = { top: 0, right: 0, bottom: 0, left: 0 }) {
      const layout = layoutWinPanel({ viewWidth, viewHeight, insets });
      paintCandyPanel(panel, layout.panel.x, layout.panel.y, layout.panel.w, layout.panel.h);
      if (!panel.input) {
        panel.setInteractive(
          new Phaser.Geom.Rectangle(layout.panel.x, layout.panel.y, layout.panel.w, layout.panel.h),
          Phaser.Geom.Rectangle.Contains,
        );
        panel.setData('ui', true);
      } else {
        panel.input.hitArea.setTo(layout.panel.x, layout.panel.y, layout.panel.w, layout.panel.h);
      }
      title.setPosition(layout.title.x, layout.title.y);
      starIcons.forEach((icon, index) => {
        icon.setPosition(layout.stars.x + (index - 1) * 52, layout.stars.y);
      });
      body.setText(`分数 ${stats.score}    死亡 ${stats.deaths}\n用时 ${formatTime(stats.timeMs)}`);
      body.setPosition(layout.body.x, layout.body.y);
      buttons.forEach((button, index) => {
        const slot = layout.buttons[index];
        button.setPosition(slot.x, slot.y);
      });
    },
  };
  view.relayout(scene.scale.width, scene.scale.height);
  return view;
}

export function isUiPointer(scene, pointer) {
  const hits = scene.input.hitTestPointer(pointer);
  return hits.some((obj) => obj.getData && obj.getData('ui'));
}

export { createStartButton } from './candy.js';
