/**
 * 死亡结算上的激励视频复活。一局一次，看完才从死亡点往回退一小段继续跑。
 */
import { getSynth } from '../../game/audio.js';
import { adMusicPhase } from '../../game/audioPolicy.js';
import { showCampaignDeathPanel } from '../../game/hud.js';
import { t } from '../../i18n/index.js';
import { isNativeShell } from '../../platform/androidBack.js';
import { isRewardedReady, onAdStatus, prepareRewarded, rewardedPhase, showRewarded } from '../../platform/rewardedAd.js';
import { simulationFrozen } from '../../logic/pause.js';
import {
  applyReviveDecision,
  keepRunOnRevive,
  playReviveAd,
  reviveButtonState,
  revivePoint,
} from '../../logic/revive.js';

export const reviveMethods = {
  /** 这一局还能不能在结算面板上放复活按钮。 */
  reviveOffer() {
    return reviveButtonState({
      native: isNativeShell(),
      budget: this.reviveBudget,
      phase: rewardedPhase(),
    });
  },

  /** 广告晚到时改按钮文案。没广告就停在「暂无广告」。 */
  refreshReviveButton() {
    const button = this.winUi?.reviveButton;
    if (!button) return;
    const offer = this.reviveOffer();
    if (!offer.visible) {
      button.setEnabled(false);
      button.setLabel(t('revive.unavailable'));
      return;
    }
    button.setLabel(t(offer.labelKey));
    button.setEnabled(!!offer.enabled && !this._reviveBusy);
  },

  /** 广告播放时先锁住结算按钮，避免边看边点回存档点。 */
  setSettlementLocked(locked) {
    const buttons = this.winUi?.buttons || [];
    buttons.forEach((button) => {
      if (button === this.winUi?.reviveButton) return;
      button.setEnabled(!locked);
    });
  },

  dismissSettlement() {
    this.watchAdStatus?.();
    this.watchAdStatus = null;
    this.winUi?.dismiss?.();
    this.winUi = null;
  },

  /** 闯关死亡先弹出结算，不立刻送回存档点。 */
  openCampaignRevive() {
    const offer = this.reviveOffer();
    this.levelLabel?.setVisible(false);
    this.powerHud?.hide();
    this.winUi = showCampaignDeathPanel(this, {
      score: this.run?.score || 0,
      stars: this.run?.stars || 0,
    }, {
      onCheckpoint: () => this.confirmCheckpoint(),
      revive: {
        label: t(offer.labelKey),
        enabled: offer.enabled,
        onClick: () => this.watchReviveAd(),
      },
    });
    this.winUi.relayout(this.scale.width, this.scale.height, this._insets);
    this.syncPauseButton?.();
    this.primeReviveAd();
  },

  confirmCheckpoint() {
    if (this._reviveBusy) return;
    this.dismissSettlement();
    this.respawnAtCheckpoint();
  },

  /** 开局已经在预加载。这里盯着状态，加载成功后马上把按钮放开。 */
  primeReviveAd() {
    this.watchAdStatus?.();
    this.watchAdStatus = onAdStatus(() => {
      if (!this.sys?.isActive?.() || !this.winUi) return;
      this.refreshReviveButton();
    });
    prepareRewarded().then(() => {
      if (!this.sys?.isActive?.() || !this.winUi) return;
      this.refreshReviveButton();
    }).catch(() => {
      if (!this.sys?.isActive?.() || !this.winUi) return;
      this.refreshReviveButton();
    });
  },

  async watchReviveAd() {
    if (this._reviveBusy || !this.winUi) return;
    const offer = this.reviveOffer();
    if (!offer.visible || !offer.enabled) {
      this.refreshReviveButton();
      return;
    }
    this._reviveBusy = true;
    this._adFreeze = true;
    this.holdSimulation?.();
    this.setSettlementLocked(true);
    this.refreshReviveButton();
    const token = this._deathToken;
    const outcome = await playReviveAd({
      adReady: isRewardedReady(),
      show: () => showRewarded(),
      onMusic: (phase) => {
        getSynth().holdMusicForAd(adMusicPhase(phase) === 'pause');
      },
    });
    this._reviveBusy = false;
    this._adFreeze = false;
    if (!simulationFrozen(this.pauseState) && !this.holdingStart) this.releaseSimulation?.();
    if (token !== this._deathToken || !this.sys?.isActive?.() || !this.player?.body) return;
    const decision = applyReviveDecision(this.reviveBudget, outcome);
    this.reviveBudget = decision.budget;
    if (!this.winUi) return;
    if (decision.revived) {
      this.applyRewardedRevive();
      return;
    }
    this.setSettlementLocked(false);
    this.refreshReviveButton();
    this.primeReviveAd();
  },

  /** 从死亡位置往回退一小段，保留星星、距离和分数，再给大约一秒无敌。 */
  applyRewardedRevive() {
    const spot = revivePoint(this._deathX, this.level.startX);
    this.run = keepRunOnRevive(this.run);
    this.dismissSettlement();
    this.ended = false;
    this.won = false;
    this.placeRunnerAt(spot.x);
    this.invulnUntil = this.time.now + spot.invulnMs;
    this.cameras.main.startFollow(this.player, true, 1, 1, -240, 0);
    this.levelLabel?.setVisible(true);
    if (this.endless) this.refreshEndlessHud();
    else this.hud?.setStats(this.run);
  },
};
