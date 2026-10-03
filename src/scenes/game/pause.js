/**
 * 游戏中的暂停。闯关和无尽共用。
 * 暂停时冻结刚体、关卡计时和道具倒计时，音乐另走挂起。
 * 继续之后先按游戏时间倒数 3 秒，再恢复。
 */
import { getSynth } from '../../game/audio.js';
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
  beginCountdown,
  canOpenPause,
  countdownDigit,
  createPauseState,
  requestPause,
  simulationFrozen,
  tickPause,
} from '../../logic/pause.js';

function destroyButton(button) {
  button?.zone?.destroy();
  button?.root?.destroy();
}

export const pauseMethods = {
  /** 开局等待、暂停、倒数、看复活广告时，这一帧不要往前跑。 */
  isRunFrozen() {
    return !!(this.holdingStart || this._adFreeze || simulationFrozen(this.pauseState));
  },

  pauseGates() {
    return {
      won: !!this.won,
      dying: !!this.dying,
      ended: !!this.ended,
      settling: !!this.winUi,
      holdingStart: !!this.holdingStart,
    };
  },

  /** 右上角暂停键。死亡面板和过关面板出现时藏掉。 */
  syncPauseButton() {
    const running = this.pauseState?.phase === 'running'
      && !this.holdingStart
      && !this.won
      && !this.dying
      && !this.ended
      && !this.winUi;
    this.hud?.setPauseVisible?.(running);
  },

  holdSimulation() {
    if (this._simHeld) return;
    this.restorePhysicsPose?.();
    this._physicsPose = null;
    const body = this.player?.body;
    if (body) body.setVelocity(0, 0);
    if (this.physics.world && !this.physics.world.isPaused) this.physics.world.pause();
    this._simHeld = true;
    getSynth().holdMusicForPause(true);
  },

  releaseSimulation() {
    if (!this._simHeld) return;
    this._simHeld = false;
    if (this.physics.world?.isPaused) this.physics.world.resume();
    getSynth().holdMusicForPause(false);
    const body = this.player?.body;
    if (body && !this.dying && !this.won && !this.ended) {
      body.setVelocityX(this.runSpeed());
    }
  },

  /** 每一帧先走这里。返回 true 表示这一帧不要推进关卡。 */
  stepPause(delta) {
    if (!this.pauseState) this.pauseState = createPauseState();
    this.syncPauseButton();
    if (this.holdingStart || this._adFreeze) {
      this.holdSimulation();
      return true;
    }
    if (this.pauseState.phase === 'countdown') {
      // 切后台回来的第一帧 delta 会非常大。单帧最多记 50 毫秒，3、2、1 才不会被一口吞掉。
      const step = tickPause(this.pauseState, Math.min(delta, 50));
      this.pauseState = step.state;
      if (step.resumed) {
        this.paintCountdown(0);
        this.releaseSimulation();
        this.syncPauseButton();
        return false;
      }
      this.paintCountdown(step.digit);
      this.holdSimulation();
      this._pauseFrames = (this._pauseFrames || 0) + 1;
      return true;
    }
    if (this.pauseState.phase === 'paused') {
      this.holdSimulation();
      this._pauseFrames = (this._pauseFrames || 0) + 1;
      return true;
    }
    return false;
  },

  requestUserPause() {
    if (!canOpenPause({ phase: this.pauseState?.phase || 'running', ...this.pauseGates() })) return;
    this.openPause();
  },

  /** 切后台、来电、页面被藏起时调用。已经停住的局面不再叠面板。 */
  autoPause() {
    if (!this.sys?.isActive?.()) return;
    this.requestUserPause();
  },

  openPause() {
    this.pauseState = requestPause(this.pauseState || createPauseState(), this.pauseGates());
    if (this.pauseState.phase !== 'paused') return;
    this.holdSimulation();
    this.syncPauseButton();
    if (this.pauseUi) return;
    const scene = this;
    const dim = this.add.rectangle(0, 0, 4, 4, 0x14061f, 0.45)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(280);
    const panel = this.add.graphics().setScrollFactor(0).setDepth(290);
    const title = addCandyText(this, 0, 0, t('pause.title'), {
      size: 36,
      color: '#ffe14a',
      stroke: '#ffffff',
      strokeThickness: 5,
      shadow: true,
    }).setScrollFactor(0).setDepth(300);
    const resume = createCandyButton(this, {
      label: t('pause.resume'),
      variant: 'mint',
      width: 136,
      fontSize: 26,
      depth: 310,
      onClick: () => scene.time.delayedCall(0, () => scene.beginResume()),
    });
    const restart = createCandyButton(this, {
      label: t('pause.restart'),
      variant: 'pink',
      width: 160,
      fontSize: 26,
      depth: 310,
      onClick: () => scene.time.delayedCall(0, () => scene.restartFromPause()),
    });
    const menu = createCandyButton(this, {
      label: t('pause.menu'),
      variant: 'sky',
      width: 160,
      fontSize: 26,
      depth: 310,
      onClick: () => scene.time.delayedCall(0, () => scene.leaveToMenu()),
    });
    const settings = createCandyButton(this, {
      label: t('pause.settings'),
      variant: 'lemon',
      width: 128,
      fontSize: 26,
      depth: 310,
      onClick: () => scene.time.delayedCall(0, () => scene.openPauseSettings()),
    });
    this.pauseUi = {
      dim,
      panel,
      title,
      buttons: [resume, restart, menu, settings],
      relayout(viewWidth, viewHeight, insets) {
        if (!panel.active) return;
        dim.setPosition(viewWidth / 2, viewHeight / 2);
        dim.setSize(viewWidth, viewHeight);
        const layout = layoutWinPanel({
          viewWidth,
          viewHeight,
          insets,
          buttonWidths: [136, 160, 160, 128],
          starRow: false,
          bodyLines: 0,
        });
        paintCandyPanel(panel, layout.panel.x, layout.panel.y, layout.panel.w, layout.panel.h);
        title.setPosition(layout.title.x, layout.title.y);
        shrinkToWidth(title, layout.title.w, 22);
        this.buttons.forEach((button, index) => {
          const slot = layout.buttons[index];
          button.setPosition(slot.x, slot.y);
        });
      },
    };
    this.pauseUi.relayout(this.scale.width, this.scale.height, this._insets);
  },

  dismissPausePanel() {
    const view = this.pauseUi;
    if (!view) return;
    view.buttons.forEach(destroyButton);
    view.dim?.destroy();
    view.panel?.destroy();
    view.title?.destroy();
    this.pauseUi = null;
  },

  /** 点继续。面板先收起，画面上跳出 3。 */
  beginResume() {
    if (this.pauseState?.phase !== 'paused') return;
    this.dismissPausePanel();
    this.pauseState = beginCountdown(this.pauseState);
    this.paintCountdown(countdownDigit(this.pauseState.leftMs));
    this.syncPauseButton();
  },

  paintCountdown(digit) {
    if (!digit) {
      this.countdownText?.setVisible(false);
      return;
    }
    if (!this.countdownText) {
      this.countdownText = addCandyText(this, 0, 0, '', {
        size: 120,
        color: '#ffe14a',
        stroke: '#2a0840',
        strokeThickness: 10,
        shadow: true,
      }).setScrollFactor(0).setDepth(320);
    }
    this.countdownText.setText(String(digit));
    this.countdownText.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.countdownText.setVisible(true);
  },

  restartFromPause() {
    const data = this.endless
      ? { mode: 'endless', seed: this.endlessSeed }
      : { levelId: this.level.id };
    this.scene.restart(data);
  },

  leaveToMenu() {
    this.scene.start('menu');
  },

  /** 设置盖在暂停的这一局上面。返回后仍停在暂停面板。 */
  openPauseSettings() {
    this.scene.sleep();
    this.scene.launch('settings', { returnTo: 'game' });
  },

  /** 从设置回到这一局时，暂停面板上的字跟着新语言走。 */
  refreshPauseCopy() {
    const view = this.pauseUi;
    if (!view?.title?.active) return;
    view.title.setText(t('pause.title'));
    const keys = ['pause.resume', 'pause.restart', 'pause.menu', 'pause.settings'];
    view.buttons.forEach((button, index) => button.setLabel(t(keys[index])));
  },

  /** 网页用可见性，安卓壳再用 Capacitor 的 pause。回来不自动继续。 */
  bindRunPause() {
    const onVis = () => {
      if (document.visibilityState === 'hidden') this.autoPause();
    };
    document.addEventListener('visibilitychange', onVis);
    const onWake = () => this.refreshPauseCopy();
    this.events.on('wake', onWake);
    const stops = [
      () => document.removeEventListener('visibilitychange', onVis),
      () => this.events.off('wake', onWake),
    ];
    this.events.once('shutdown', () => {
      stops.forEach((stop) => stop());
      getSynth().holdMusicForPause(false);
      this.countdownText?.destroy();
      this.countdownText = null;
      this.dismissPausePanel();
    });
    this.bindNativeRunPause(stops);
  },

  async bindNativeRunPause(stops) {
    if (!isNativeShell()) return;
    let alive = true;
    const drop = () => {
      alive = false;
    };
    stops.push(drop);
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import('@capacitor/app');
      const pause = await App.addListener('pause', () => {
        if (alive) this.autoPause();
      });
      const state = await App.addListener('appStateChange', ({ isActive }) => {
        if (alive && !isActive) this.autoPause();
      });
      const remove = () => {
        pause.remove();
        state.remove();
      };
      if (!alive) {
        remove();
        return;
      }
      stops.push(remove);
    } catch {
      // 壳层没接上时，visibilitychange 仍然会暂停。
    }
  },
};
