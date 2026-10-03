/**
 * 开局前看广告领一件道具。只有安卓壳显示按钮。
 * 看完从二段跳、护甲、飞机里随机给一个，开局就生效，和跑道上捡到的是同一套。
 * 每局一次。没看完或加载失败只提示，不扣次数，也不动复活次数。
 */
import { getSynth } from '../../game/audio.js';
import { adMusicPhase } from '../../game/audioPolicy.js';
import {
  addCandyText,
  createCandyButton,
  paintCandyPanel,
  shrinkToWidth,
  textStyle,
} from '../../game/candy.js';
import { layoutWinPanel } from '../../game/viewport.js';
import { t } from '../../i18n/index.js';
import { isNativeShell } from '../../platform/androidBack.js';
import {
  isRewardedReady,
  onAdStatus,
  prepareRewarded,
  rewardedPhase,
  showRewarded,
} from '../../platform/rewardedAd.js';
import { grantPower } from '../../logic/powerups.js';
import { playReviveAd } from '../../logic/revive.js';
import {
  applyStarterReward,
  createStarterOffer,
  starterButtonState,
  starterMissKey,
} from '../../logic/starterPower.js';

function destroyButton(button) {
  button?.zone?.destroy();
  button?.root?.destroy();
}

export const starterMethods = {
  /** 安卓壳才在起跑前停住。网页直接开跑，也不画领道具按钮。 */
  shouldHoldStart() {
    return isNativeShell();
  },

  starterOfferView() {
    return starterButtonState({
      native: isNativeShell(),
      claimed: !!this.starterOffer?.claimed,
      phase: rewardedPhase(),
    });
  },

  openStartGate() {
    if (!this.shouldHoldStart()) return;
    this.holdingStart = true;
    this.starterOffer = createStarterOffer();
    this.holdSimulation();
    const scene = this;
    const dim = this.add.rectangle(0, 0, 4, 4, 0x14061f, 0.45)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(280);
    const panel = this.add.graphics().setScrollFactor(0).setDepth(290);
    const title = addCandyText(this, 0, 0, t('start.title'), {
      size: 36,
      color: '#ffe14a',
      stroke: '#ffffff',
      strokeThickness: 5,
      shadow: true,
    }).setScrollFactor(0).setDepth(300);
    const body = this.add.text(0, 0, t('start.body'), textStyle({
      size: 22,
      color: '#ffffff',
      stroke: '#2a0840',
      strokeThickness: 4,
      align: 'center',
    })).setOrigin(0.5).setScrollFactor(0).setDepth(300);
    const hint = this.add.text(0, 0, '', textStyle({
      size: 20,
      color: '#ffe14a',
      stroke: '#2a0840',
      strokeThickness: 4,
      align: 'center',
    })).setOrigin(0.5).setScrollFactor(0).setDepth(300);
    const go = createCandyButton(this, {
      label: t('start.go'),
      variant: 'mint',
      width: 180,
      fontSize: 28,
      depth: 310,
      onClick: () => scene.time.delayedCall(0, () => scene.beginRun()),
    });
    const offer = this.starterOfferView();
    const watch = createCandyButton(this, {
      label: t(offer.labelKey || 'powerup.watch'),
      variant: 'grape',
      width: 240,
      fontSize: 24,
      depth: 310,
      enabled: offer.enabled,
      onClick: () => scene.time.delayedCall(0, () => scene.watchStarterAd()),
    });
    if (!offer.visible) {
      watch.root.setVisible(false);
      watch.zone.setVisible(false);
      watch.setEnabled(false);
    }
    this.startUi = {
      dim,
      panel,
      title,
      body,
      hint,
      go,
      watch,
      buttons: offer.visible ? [watch, go] : [go],
      relayout(viewWidth, viewHeight, insets) {
        if (!panel.active) return;
        dim.setPosition(viewWidth / 2, viewHeight / 2);
        dim.setSize(viewWidth, viewHeight);
        const widths = this.buttons.map((button) => button.width);
        const layout = layoutWinPanel({
          viewWidth,
          viewHeight,
          insets,
          buttonWidths: widths,
          starRow: false,
          bodyLines: 2,
        });
        paintCandyPanel(panel, layout.panel.x, layout.panel.y, layout.panel.w, layout.panel.h);
        title.setPosition(layout.title.x, layout.title.y);
        shrinkToWidth(title, layout.title.w, 22);
        body.setPosition(layout.body.x, layout.body.y);
        shrinkToWidth(body, layout.body.w, 16);
        const anchor = this.buttons[0];
        hint.setPosition(layout.body.x, (anchor ? layout.buttons[0].y : layout.body.y) - 58);
        shrinkToWidth(hint, layout.body.w, 14);
        this.buttons.forEach((button, index) => {
          const slot = layout.buttons[index];
          if (slot) button.setPosition(slot.x, slot.y);
        });
      },
    };
    this.startUi.relayout(this.scale.width, this.scale.height, this._insets);
    this.syncPauseButton?.();
    this.primeStarterAd();
    this.refreshStarterButton();
  },

  refreshStarterButton() {
    const watch = this.startUi?.watch;
    if (!watch) return;
    const offer = this.starterOfferView();
    if (!offer.visible) {
      watch.root.setVisible(false);
      watch.zone.setVisible(false);
      watch.setEnabled(false);
      return;
    }
    watch.root.setVisible(true);
    watch.zone.setVisible(true);
    watch.setLabel(t(offer.labelKey));
    watch.setEnabled(!!offer.enabled && !this._starterBusy);
  },

  setStarterHint(text) {
    const hint = this.startUi?.hint;
    if (!hint || !this.startUi.panel?.active) return;
    hint.setText(text || '');
    this.startUi.relayout(this.scale.width, this.scale.height, this._insets);
  },

  primeStarterAd() {
    this.watchStarterStatus?.();
    this.watchStarterStatus = onAdStatus((snap) => {
      if (!this.sys?.isActive?.() || !this.startUi) return;
      if (snap?.phase === 'failed' && !this.starterOffer?.claimed) {
        this.setStarterHint(t('powerup.failed'));
      }
      this.refreshStarterButton();
    });
    prepareRewarded('powerup').then(() => {
      if (!this.sys?.isActive?.() || !this.startUi) return;
      this.refreshStarterButton();
    }).catch(() => {
      if (!this.sys?.isActive?.() || !this.startUi) return;
      this.refreshStarterButton();
    });
  },

  async watchStarterAd() {
    if (this._starterBusy || !this.holdingStart) return;
    const offer = this.starterOfferView();
    if (!offer.visible || !offer.enabled) {
      this.refreshStarterButton();
      return;
    }
    this._starterBusy = true;
    this.refreshStarterButton();
    // 和复活共用播放、音乐挂起和回调解释。领道具走自己的广告位配置。
    const outcome = await playReviveAd({
      adReady: isRewardedReady(),
      show: () => showRewarded('powerup'),
      onMusic: (phase) => {
        getSynth().holdMusicForAd(adMusicPhase(phase) === 'pause');
      },
    });
    this._starterBusy = false;
    if (!this.sys?.isActive?.() || !this.holdingStart) return;
    const decision = applyStarterReward(this.starterOffer, outcome, Math.random);
    this.starterOffer = decision.offer;
    if (!decision.granted) {
      this.setStarterHint(t(starterMissKey(decision.reason)));
      this.refreshStarterButton();
      this.primeStarterAd();
      return;
    }
    this.grantStarter(decision.kind);
    this.setStarterHint(t('powerup.got', { name: t(`power.${decision.kind}`) }));
    this.refreshStarterButton();
  },

  /** 立刻写进 this.power。倒计时要等开跑后 powerClock 才会走。 */
  grantStarter(kind) {
    const granted = grantPower(this.power, kind, this.powerClock || 0);
    this.power = granted.state;
    this.syncPowerIcons?.();
    this.powerHud?.sync(this.power, this.powerClock || 0);
    getSynth().play('pickup');
  },

  dismissStartGate() {
    this.watchStarterStatus?.();
    this.watchStarterStatus = null;
    const view = this.startUi;
    if (!view) return;
    destroyButton(view.watch);
    destroyButton(view.go);
    view.dim?.destroy();
    view.panel?.destroy();
    view.title?.destroy();
    view.body?.destroy();
    view.hint?.destroy();
    this.startUi = null;
  },

  beginRun() {
    if (!this.holdingStart) return;
    this.holdingStart = false;
    this.dismissStartGate();
    this.releaseSimulation();
    this.syncPauseButton?.();
  },
};
