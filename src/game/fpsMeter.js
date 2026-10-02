/**
 * 左上角帧率。设置里打开，或网址带 ?fps 且还没在设置里关过，才会显示。
 * 徽章钉在游戏像素的预留槽里，不挡选关底栏和右上角按钮。
 */
import { cssInsetsToGame, layoutHud, readSafeAreaInsets } from './viewport.js';
import { currentSettings, shouldShowFps } from './settings.js';

let meter = null;
let timer = null;
let gameRef = null;
let place = null;
let onVisualResize = null;

function placeFpsMeter(game, node) {
  const canvas = game.canvas;
  if (!canvas || !node) return;
  const rect = canvas.getBoundingClientRect();
  const viewW = game.scale?.width;
  const viewH = game.scale?.height;
  if (!rect.width || !rect.height || !viewW || !viewH) return;
  const insets = cssInsetsToGame(readSafeAreaInsets(), game.scale.displayScale);
  const slot = layoutHud({
    viewWidth: viewW,
    viewHeight: viewH,
    insets,
    showFps: true,
  }).fps;
  const scaleX = rect.width / viewW;
  const scaleY = rect.height / viewH;
  node.style.left = `${rect.left + slot.x * scaleX}px`;
  node.style.top = `${rect.top + slot.y * scaleY}px`;
  node.style.bottom = 'auto';
  node.style.maxWidth = `${slot.w * scaleX}px`;
  node.style.fontSize = `${Math.max(11, Math.round(slot.h * scaleY * 0.5))}px`;
}

function detach() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (place && gameRef?.scale) gameRef.scale.off('resize', place);
  if (place) window.removeEventListener('resize', place);
  if (onVisualResize) window.visualViewport?.removeEventListener('resize', onVisualResize);
  meter?.remove();
  meter = null;
  place = null;
  onVisualResize = null;
}

/** 按当前设置显示或收起帧率。重复调用不会叠两个徽章。 */
export function syncFpsMeter(game) {
  if (game) gameRef = game;
  const enabled = shouldShowFps(
    currentSettings(),
    typeof window !== 'undefined' ? window.location.search : '',
  );
  if (!enabled) {
    detach();
    return;
  }
  if (!gameRef || meter) {
    if (meter && gameRef) placeFpsMeter(gameRef, meter);
    return;
  }
  meter = document.createElement('div');
  meter.id = 'fps-meter';
  meter.textContent = 'FPS --';
  document.body.appendChild(meter);
  place = () => placeFpsMeter(gameRef, meter);
  place();
  gameRef.scale?.on('resize', place);
  window.addEventListener('resize', place);
  onVisualResize = place;
  window.visualViewport?.addEventListener('resize', place);
  timer = window.setInterval(() => {
    if (!gameRef?.loop || !meter) return;
    meter.textContent = `FPS ${Math.round(gameRef.loop.actualFps)}`;
    place();
  }, 250);
}
