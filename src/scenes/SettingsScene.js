/**
 * 设置页。音量、震动、特效、帧率、语言和重置进度。
 * 控件按画面居中，点击区跟主页的糖果按钮一样高，鼠标和触屏都能点。
 */
import Phaser from 'phaser';
import { TUNING } from '../logic/world.js';
import { THEME } from '../game/theme.js';
import {
  createParallax,
  layoutParallax,
  scrollParallax,
  tintParallax,
} from '../game/backdrop.js';
import { addCandyText, createCandyButton, paintCandyPanel, shrinkToWidth, textStyle } from '../game/candy.js';
import { getSynth } from '../game/audio.js';
import { syncFpsMeter } from '../game/fpsMeter.js';
import {
  currentSettings,
  fxProfile,
  resetAllProgress,
  saveSettings,
  shouldShowFps,
  updateSettings,
} from '../game/settings.js';
import { clampVolume } from '../game/audioPolicy.js';
import { cssInsetsToGame, layoutSettings, readSafeAreaInsets, verticalCameraScroll } from '../game/viewport.js';
import { LOCALES, getLocale, setLocale, t } from '../i18n/index.js';

const FX_KEYS = { high: 'settings.fxHigh', low: 'settings.fxLow', off: 'settings.fxOff' };

/**
 * 把热区登记进输入名单。
 * 和糖果按钮同一套补丁：只改 enabled 时，对象可能看着能点、名单里却没有。
 */
function syncInput(zone, hitConfig) {
  const plugin = zone.scene?.sys?.input;
  if (!plugin) return;
  const drop = plugin._pendingRemoval.indexOf(zone);
  if (drop !== -1) plugin._pendingRemoval.splice(drop, 1);
  const listed = plugin._list.includes(zone);
  const queued = plugin._pendingInsertion.includes(zone);
  if (!zone.input || (!listed && !queued)) {
    plugin.setHitArea(zone, hitConfig);
  }
  const pending = plugin._pendingInsertion.indexOf(zone);
  if (pending !== -1 && !plugin._list.includes(zone)) {
    plugin._pendingInsertion.splice(pending, 1);
    plugin._list.push(zone);
  }
}

/** 音量滑条。整行都能拖，数值按轨道换算。 */
function createSlider(scene, { label, value, onChange }) {
  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(30);
  const caption = addCandyText(scene, 0, 0, label, {
    size: 26,
    color: '#ffffff',
    stroke: '#3b0764',
    strokeThickness: 5,
  }).setOrigin(0, 0.5);
  const readout = addCandyText(scene, 0, 0, '', {
    size: 26,
    color: '#ffe14a',
    stroke: '#3b0764',
    strokeThickness: 5,
  }).setOrigin(1, 0.5);
  const track = scene.add.graphics().setScrollFactor(0);
  root.add(caption);
  root.add(readout);
  root.add(track);
  const zone = scene.add.zone(0, 0, 10, 10).setScrollFactor(0).setDepth(31).setData('ui', true);
  const state = {
    value: clampVolume(value),
    width: 10,
    height: 10,
    trackW: 10,
    enabled: true,
    dragging: false,
  };
  const hitConfig = {
    hitArea: new Phaser.Geom.Rectangle(0, 0, 10, 10),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  };

  function paint() {
    const muted = getSynth().muted;
    readout.setText(muted ? t('settings.muted') : String(Math.round(state.value * 100)));
    track.clear();
    const w = state.trackW;
    const h = 18;
    const y = 8;
    track.fillStyle(0x2a0840, 0.35);
    track.fillRoundedRect(-w / 2, y + 4, w, h, 9);
    track.fillStyle(0x6d28d9, 1);
    track.fillRoundedRect(-w / 2, y + 3, w, h, 9);
    const fillW = Math.max(16, w * state.value);
    track.fillStyle(muted ? 0x958da3 : 0xff4b8d, 1);
    track.fillRoundedRect(-w / 2, y, fillW, h - 3, 9);
    const knobX = -w / 2 + w * state.value;
    track.fillStyle(0xffffff, 1);
    track.fillCircle(knobX, y + 6, 14);
    track.fillStyle(muted ? 0xcfc6d8 : 0xff4b8d, 1);
    track.fillCircle(knobX, y + 4, 10);
  }

  function valueAt(pointerX) {
    const left = zone.x - state.trackW / 2;
    return clampVolume((pointerX - left) / state.trackW);
  }

  function applyPointer(pointer) {
    if (!state.enabled) return;
    const next = valueAt(pointer.x);
    state.value = next;
    paint();
    onChange(next);
  }

  const onMove = (pointer) => {
    if (!state.dragging || !state.enabled) return;
    applyPointer(pointer);
  };
  const endDrag = () => {
    state.dragging = false;
  };
  zone.on('pointerdown', (pointer) => {
    if (!state.enabled) return;
    scene.suppressJump = true;
    state.dragging = true;
    getSynth().unlock();
    applyPointer(pointer);
  });
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', endDrag);
  scene.input.on('pointerupoutside', endDrag);
  scene.events.once('shutdown', () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', endDrag);
    scene.input.off('pointerupoutside', endDrag);
  });

  syncInput(zone, hitConfig);
  paint();

  return {
    zone,
    root,
    get value() { return state.value; },
    setValue(value) {
      state.value = clampVolume(value);
      paint();
    },
    setEnabled(enabled) {
      state.enabled = !!enabled;
      state.dragging = false;
      if (zone.input) zone.input.enabled = state.enabled;
      syncInput(zone, hitConfig);
      if (zone.input) zone.input.enabled = state.enabled;
      root.setAlpha(state.enabled ? 1 : 0.45);
    },
    get trackWidth() { return state.trackW; },
    setLayout(row, trackBox) {
      state.width = row.w;
      state.height = row.h;
      state.trackW = trackBox.w;
      root.setPosition(row.x, row.y);
      zone.setPosition(row.x, row.y);
      zone.setSize(row.w, row.h);
      hitConfig.hitArea.setSize(row.w, row.h);
      syncInput(zone, hitConfig);
      if (zone.input) zone.input.enabled = state.enabled;
      caption.setPosition(-row.w / 2 + 8, -8);
      readout.setPosition(row.w / 2 - 8, -8);
      caption.setFontSize(26);
      shrinkToWidth(caption, Math.max(80, row.w * 0.48), 14);
      paint();
    },
    setCaption(text) {
      caption.setText(text);
    },
    refresh() {
      paint();
    },
  };
}

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('settings');
  }

  create() {
    this.cameras.main.setBackgroundColor(THEME.gap);
    this.parallax = createParallax(this);
    this.driftX = 0;
    this.confirming = false;
    const settings = currentSettings();
    const synth = getSynth();

    this.title = addCandyText(this, 0, 0, t('settings.title'), {
      size: 40,
      color: '#ffe14a',
      stroke: '#3b0764',
      strokeThickness: 6,
    }).setScrollFactor(0).setDepth(20);

    this.music = createSlider(this, {
      label: t('settings.music'),
      value: synth.musicVolume,
      onChange: (value) => {
        getSynth().setMusicVolume(value);
        this.refreshAudioLabels();
      },
    });
    this.sfx = createSlider(this, {
      label: t('settings.sfx'),
      value: synth.sfxVolume,
      onChange: (value) => {
        getSynth().setSfxVolume(value);
        this.refreshAudioLabels();
      },
    });

    this.vibrateBtn = createCandyButton(this, {
      label: settings.vibrate ? t('settings.vibrateOn') : t('settings.vibrateOff'),
      variant: settings.vibrate ? 'mint' : 'coral',
      width: 420,
      height: 76,
      fontSize: 30,
      depth: 30,
      onClick: () => this.toggleVibrate(),
    });
    this.fpsBtn = createCandyButton(this, {
      label: t('settings.fpsOff'),
      variant: 'grape',
      width: 420,
      height: 76,
      fontSize: 30,
      depth: 30,
      onClick: () => this.toggleFps(),
    });
    this.fxLabel = addCandyText(this, 0, 0, t('settings.fx'), {
      size: 26,
      color: '#ffffff',
      stroke: '#3b0764',
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30);
    this.fxButtons = ['high', 'low', 'off'].map((id) => createCandyButton(this, {
      label: t(FX_KEYS[id]),
      variant: settings.fx === id ? 'lemon' : 'sky',
      width: 160,
      height: 76,
      fontSize: 32,
      depth: 30,
      onClick: () => this.setFx(id),
    }));
    this.resetBtn = createCandyButton(this, {
      label: t('settings.reset'),
      variant: 'coral',
      width: 240,
      height: 76,
      fontSize: 30,
      depth: 30,
      onClick: () => this.openConfirm(),
    });
    this.backBtn = createCandyButton(this, {
      label: t('settings.back'),
      variant: 'sky',
      width: 180,
      height: 76,
      fontSize: 30,
      depth: 30,
      onClick: () => this.scene.start('menu'),
    });

    this.overlay = this.add.rectangle(0, 0, 4, 4, 0x2a0840, 0.55)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false);
    this.dialog = this.add.graphics().setScrollFactor(0).setDepth(210).setVisible(false);
    this.langLabel = addCandyText(this, 0, 0, t('settings.language'), {
      size: 26,
      color: '#ffffff',
      stroke: '#3b0764',
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30);
    this.langButtons = LOCALES.map((id) => createCandyButton(this, {
      label: t(`settings.lang.${id}`),
      variant: getLocale() === id ? 'lemon' : 'sky',
      width: 120,
      height: 76,
      fontSize: 22,
      depth: 30,
      onClick: () => this.chooseLocale(id),
    }));
    this.dialogText = this.add.text(0, 0, t('settings.confirmBody'), textStyle({
      size: 26,
      color: '#4a1468',
      stroke: '#ffffff',
      strokeThickness: 4,
      align: 'center',
      wordWrap: { width: 420 },
    })).setOrigin(0.5).setScrollFactor(0).setDepth(220).setVisible(false);
    this.cancelBtn = createCandyButton(this, {
      label: t('settings.cancel'),
      variant: 'sky',
      width: 168,
      height: 76,
      fontSize: 30,
      depth: 230,
      onClick: () => this.closeConfirm(),
    });
    this.confirmBtn = createCandyButton(this, {
      label: t('settings.ok'),
      variant: 'coral',
      width: 188,
      height: 76,
      fontSize: 30,
      depth: 230,
      onClick: () => this.confirmReset(),
    });
    this.cancelBtn.root.setVisible(false);
    this.confirmBtn.root.setVisible(false);
    this.cancelBtn.setEnabled(false);
    this.confirmBtn.setEnabled(false);

    this.ui = {
      music: this.music,
      sfx: this.sfx,
      vibrate: this.vibrateBtn,
      fps: this.fpsBtn,
      fxHigh: this.fxButtons[0],
      fxLow: this.fxButtons[1],
      fxOff: this.fxButtons[2],
      lang: this.langButtons,
      reset: this.resetBtn,
      back: this.backBtn,
      cancel: this.cancelBtn,
      confirm: this.confirmBtn,
    };

    this.scale.on('resize', this.applyViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyViewport, this);
    });
    this.refreshFpsLabel();
    this.applyViewport();
  }

  update(_time, delta) {
    this.driftX += delta * 0.06;
    scrollParallax(this.parallax, this.driftX);
  }

  /** 主控件在确认框打开时停用，避免点到后面的滑条。 */
  mainControls() {
    return [this.music, this.sfx, this.vibrateBtn, this.fpsBtn, ...this.fxButtons, ...this.langButtons, this.resetBtn, this.backBtn];
  }

  refreshAudioLabels() {
    this.music.setValue(getSynth().musicVolume);
    this.sfx.setValue(getSynth().sfxVolume);
  }

  refreshFpsLabel() {
    const on = shouldShowFps(currentSettings(), window.location.search);
    this.fpsBtn.setLabel(on ? t('settings.fpsOn') : t('settings.fpsOff'));
    this.fpsBtn.setVariant(on ? 'sky' : 'grape');
  }

  toggleVibrate() {
    if (this.confirming) return;
    const next = !currentSettings().vibrate;
    updateSettings({ vibrate: next });
    this.vibrateBtn.setLabel(next ? t('settings.vibrateOn') : t('settings.vibrateOff'));
    this.vibrateBtn.setVariant(next ? 'mint' : 'coral');
  }

  toggleFps() {
    if (this.confirming) return;
    const on = shouldShowFps(currentSettings(), window.location.search);
    updateSettings({ showFps: !on });
    syncFpsMeter(this.game);
    this.refreshFpsLabel();
  }

  setFx(id) {
    if (this.confirming) return;
    updateSettings({ fx: id });
    this.fxButtons.forEach((button, index) => {
      const key = ['high', 'low', 'off'][index];
      button.setVariant(key === id ? 'lemon' : 'sky');
    });
    // 读一下档位，保证写进去的值能被特效系统用上。
    fxProfile(currentSettings().fx);
  }

  openConfirm() {
    if (this.confirming) return;
    this.confirming = true;
    this.overlay.setVisible(true);
    this.dialog.setVisible(true);
    this.dialogText.setVisible(true);
    this.cancelBtn.root.setVisible(true);
    this.confirmBtn.root.setVisible(true);
    this.cancelBtn.setEnabled(true);
    this.confirmBtn.setEnabled(true);
    for (const control of this.mainControls()) control.setEnabled(false);
  }

  closeConfirm() {
    this.confirming = false;
    this.overlay.setVisible(false);
    this.dialog.setVisible(false);
    this.dialogText.setVisible(false);
    this.cancelBtn.root.setVisible(false);
    this.confirmBtn.root.setVisible(false);
    this.cancelBtn.setEnabled(false);
    this.confirmBtn.setEnabled(false);
    for (const control of this.mainControls()) control.setEnabled(true);
  }

  confirmReset() {
    resetAllProgress();
    saveSettings(currentSettings());
    this._resetFlash = true;
    this.resetBtn.setLabel(t('settings.resetDone'));
    this.closeConfirm();
    this.time.delayedCall(700, () => {
      this._resetFlash = false;
      if (this.resetBtn?.setLabel) this.resetBtn.setLabel(t('settings.reset'));
    });
  }

  /** 设置里改语言。这一页立刻换字，其它场景下次进来时用新语言。 */
  chooseLocale(id) {
    if (this.confirming || id === getLocale()) return;
    setLocale(id);
    this.applyLanguage();
  }

  /** 把设置页上所有能看见的字换成当前语言。 */
  applyLanguage() {
    this.title.setText(t('settings.title'));
    this.music.setCaption(t('settings.music'));
    this.sfx.setCaption(t('settings.sfx'));
    this.music.refresh();
    this.sfx.refresh();
    const settings = currentSettings();
    this.vibrateBtn.setLabel(settings.vibrate ? t('settings.vibrateOn') : t('settings.vibrateOff'));
    this.refreshFpsLabel();
    this.fxLabel.setText(t('settings.fx'));
    this.fxButtons.forEach((button, index) => {
      const id = ['high', 'low', 'off'][index];
      button.setLabel(t(FX_KEYS[id]));
    });
    this.langLabel.setText(t('settings.language'));
    this.langButtons.forEach((button, index) => {
      const id = LOCALES[index];
      button.setLabel(t(`settings.lang.${id}`));
      button.setVariant(id === getLocale() ? 'lemon' : 'sky');
    });
    this.resetBtn.setLabel(this._resetFlash ? t('settings.resetDone') : t('settings.reset'));
    this.backBtn.setLabel(t('settings.back'));
    this.dialogText.setText(t('settings.confirmBody'));
    this.cancelBtn.setLabel(t('settings.cancel'));
    this.confirmBtn.setLabel(t('settings.ok'));
    if (this.layout) this.applyViewport();
  }

  applyViewport() {
    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const scrollY = verticalCameraScroll(TUNING.viewHeight, viewH);
    this.cameras.main.setSize(viewW, viewH);
    this.cameras.main.setScroll(0, scrollY);
    const insets = cssInsetsToGame(readSafeAreaInsets(), this.scale.displayScale);
    layoutParallax(this.parallax, viewW, viewH, scrollY);
    tintParallax(this.parallax, 0);
    const layout = layoutSettings({ viewWidth: viewW, viewHeight: viewH, insets });
    this.layout = layout;
    this.title.setPosition(layout.title.x, layout.title.y);
    this.music.setLayout(layout.music, layout.musicTrack);
    this.sfx.setLayout(layout.sfx, layout.sfxTrack);
    this.vibrateBtn.setSize(layout.vibrate.w, layout.vibrate.h);
    this.vibrateBtn.setPosition(layout.vibrate.x, layout.vibrate.y);
    this.fpsBtn.setSize(layout.fps.w, layout.fps.h);
    this.fpsBtn.setPosition(layout.fps.x, layout.fps.y);
    this.fxLabel.setFontSize(26);
    this.fxLabel.setPosition(layout.fxLabel.x, layout.fxLabel.y);
    shrinkToWidth(this.fxLabel, layout.fxLabel.w - 8, 14);
    this.fxButtons.forEach((button, index) => {
      const spot = layout.fxButtons[index];
      button.setSize(spot.w, spot.h);
      button.setPosition(spot.x, spot.y);
    });
    this.langLabel.setFontSize(26);
    this.langLabel.setPosition(layout.langLabel.x, layout.langLabel.y);
    shrinkToWidth(this.langLabel, layout.langLabel.w - 8, 14);
    this.langButtons.forEach((button, index) => {
      const spot = layout.langButtons[index];
      button.setSize(spot.w, spot.h);
      button.setPosition(spot.x, spot.y);
    });
    this.resetBtn.setSize(layout.reset.w, layout.reset.h);
    this.resetBtn.setPosition(layout.reset.x, layout.reset.y);
    this.backBtn.setSize(layout.back.w, layout.back.h);
    this.backBtn.setPosition(layout.back.x, layout.back.y);
    this.overlay.setPosition(viewW / 2, viewH / 2);
    this.overlay.setSize(viewW, viewH);
    paintCandyPanel(this.dialog, layout.dialog.x, layout.dialog.y, layout.dialog.w, layout.dialog.h);
    this.dialogText.setPosition(layout.dialog.x + layout.dialog.w / 2, layout.dialog.y + 78);
    this.dialogText.setWordWrapWidth(layout.dialog.w - 48);
    this.cancelBtn.setSize(layout.cancel.w, layout.cancel.h);
    this.confirmBtn.setSize(layout.confirm.w, layout.confirm.h);
    this.cancelBtn.setPosition(layout.cancel.x, layout.cancel.y);
    this.confirmBtn.setPosition(layout.confirm.x, layout.confirm.y);
    shrinkToWidth(this.dialogText, layout.dialog.w - 48, 16);
  }
}
