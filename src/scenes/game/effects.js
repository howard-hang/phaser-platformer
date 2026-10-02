/**
 * 死亡、通关和无尽结算，以及背景色调。从 GameScene 原样搬出，逻辑不变。
 */
import { nextLevel } from '../../game/level.js';
import {
  commitEndlessRecord,
  distanceMeters,
} from '../../game/endlessScore.js';
import { getSynth } from '../../game/audio.js';
import {
  scrollParallax,
  tintParallax,
} from '../../game/backdrop.js';
import { feedback } from '../../game/haptics.js';
import {
  currentSettings,
  fxProfile,
} from '../../game/settings.js';
import {
  showEndlessPanel,
  showWinPanel,
} from '../../game/hud.js';
import {
  loadProgress,
  recordClear,
  saveProgress,
  starsToUnlock,
} from '../../game/progress.js';
import { playerGroundY } from '../../logic/world.js';
import {
  isOutOfMap,
  isPowerInvulnerable,
  resolveHazard,
} from '../../logic/powerups.js';
import {
  noteDeath,
  pickCheckpoint,
} from '../../logic/rules.js';

export const effectMethods = {
  onHazard(hazard) {
    if (this.won || this.dying || this.time.now < this.invulnUntil) return;
    const pit = hazard?.getData?.('pit') === true || isOutOfMap(this.player.y);
    // 飞机全程无敌。护甲挡普通障碍，坑和掉出地图仍然死。
    const outcome = resolveHazard({
      kind: this.power?.kind,
      pit,
      outOfMap: isOutOfMap(this.player.y),
      invulnerable: this._touchGuard || (this.power?.kind === 'plane')
        || (!pit && isPowerInvulnerable(this.power, this.powerClock)),
    });
    if (outcome === 'ignore') return;
    if (outcome === 'break') {
      this.shatterArmor();
      return;
    }
    this._powerQueue.length = 0;
    this._touchGuard = false;
    this.dying = true;
    this.run = noteDeath(this.run);
    this.activeCheckpoint = pickCheckpoint(this.level.checkpoints, this.player.x);
    this.rotating = false;
    this.airMs = 0;
    this.player.angle = 0;
    const x = this.player.x;
    const y = this.player.y;
    // 方块先藏起来，碎片从原来的位置炸开。刚体停住，避免特效期间又撞上别的障碍。
    this.player.setVisible(false);
    this.runner?.setVisible(false);
    this.trail?.forEach((ghost) => ghost.setVisible(false));
    this.shield?.setVisible(false);
    this.ride?.setVisible(false);
    this.doubleMark?.setVisible(false);
    this.player.body.enable = false;
    this.player.body.setVelocity(0, 0);
    this.player.body.setAllowGravity(false);
    getSynth().play('death');
    feedback('death');
    // 死亡只播碎裂音效。背景音乐继续当前进度，不从头开始。
    if (this.endless) this.refreshEndlessHud();
    else this.hud.setStats(this.run);
    const token = this._deathToken;
    const started = this.deathFx.play(x, y, () => {
      if (token !== this._deathToken || !this.player?.body) return;
      this.finishDeath();
    }, fxProfile(currentSettings().fx).shake);
    // 特效没播起来就不要把人留在半空，直接重生。
    if (!started) this.finishDeath();
  },

  /** 碎裂结束。闯关回到存档点，无尽模式直接结算，不重生。 */
  finishDeath() {
    if (this.endless) {
      this.finishEndless();
      return;
    }
    const y = playerGroundY();
    this.player.setVisible(false);
    this.runner?.setVisible(true);
    this.player.body.enable = true;
    this.player.body.setAllowGravity(true);
    this.player.body.reset(this.activeCheckpoint, y);
    // reset 把碰撞盒放在贴图左上角，这里再对齐偏移，并清掉本帧位移，避免落地后被挤穿地面。
    this.player.body.updateFromGameObject();
    this.player.body.prev.copy(this.player.body.position);
    this.player.body.prevFrame.copy(this.player.body.position);
    this.player.body.setVelocity(this.tuning.speed, 0);
    this.player.body.setGravityY(0);
    this._inFlip = false;
    this.rotating = false;
    this.airMs = 0;
    this.player.angle = 0;
    this._physicsPose = null;
    this.dying = false;
    this.invulnUntil = this.time.now + 120;
  },

  /** 撞到障碍后的结算。纪录只在更远时写进本机。 */
  finishEndless() {
    if (this.ended) return;
    this.ended = true;
    this.won = true;
    this.dying = false;
    this.rotating = false;
    this._physicsPose = null;
    this.cameras.main.stopFollow();
    const body = this.player?.body;
    if (body) {
      body.setVelocity(0, 0);
      body.setAllowGravity(false);
      body.enable = false;
    }
    const meters = distanceMeters((this.player?.x || this.level.startX) - this.level.startX);
    const outcome = commitEndlessRecord(meters);
    this.endlessBest = outcome.best;
    this.refreshEndlessHud();
    this.levelLabel?.setVisible(false);
    this.powerHud?.hide();
    this.runner?.setVisible(false);
    this.trail?.forEach((ghost) => ghost.setVisible(false));
    this.shield?.setVisible(false);
    this.ride?.setVisible(false);
    this.doubleMark?.setVisible(false);
    this.winUi = showEndlessPanel(this, {
      distance: outcome.distance,
      stars: this.run.stars,
      best: outcome.best,
      improved: outcome.improved,
    }, {
      onReplay: () => this.scene.restart({ mode: 'endless' }),
      onHome: () => this.scene.start('menu'),
    });
    this.winUi.relayout(this.scale.width, this.scale.height, this._insets);
  },

  win() {
    this.won = true;
    this.rotating = false;
    this.player.angle = 0;
    this._physicsPose = null;
    // 过线后立刻停住。镜头不再跟着冲，弹框就在这一帧出现。
    this.cameras.main.stopFollow();
    const body = this.player.body;
    body.setVelocity(0, 0);
    body.setAllowGravity(false);
    body.enable = false;
    getSynth().play('win');
    this.hud.setStats(this.run);
    // 先记下这一关的最高星，再判断下一关够不够解锁。
    const progress = recordClear(loadProgress(), this.level.id, this.run.stars);
    saveProgress(progress);
    const upcoming = nextLevel(this.level.id);
    let nextText = '最后一关';
    let nextEnabled = false;
    if (upcoming) {
      const short = starsToUnlock(progress, upcoming.id);
      if (short === 0) {
        nextText = '下一关';
        nextEnabled = true;
      } else {
        nextText = `还差 ${short} 颗星`;
      }
    }
    this.levelLabel?.setVisible(false);
    this.powerHud?.hide();
    this.runner?.setVisible(false);
    this.trail?.forEach((ghost) => ghost.setVisible(false));
    this.shield?.setVisible(false);
    this.ride?.setVisible(false);
    this.doubleMark?.setVisible(false);
    this.winUi = showWinPanel(this, {
      index: this.level.index,
      score: this.run.score,
      deaths: this.run.deaths,
      stars: this.run.stars,
      totalStars: this.level.stars.length,
      timeMs: this.elapsedMs,
    }, {
      onReplay: () => this.scene.restart({ levelId: this.level.id }),
      onSelect: () => this.scene.start('select'),
      onNext: () => {
        if (upcoming && nextEnabled) this.scene.restart({ levelId: upcoming.id });
      },
      nextText,
      nextEnabled,
    });
    this.winUi.relayout(this.scale.width, this.scale.height, this._insets);
  },

  /** 视差跟着镜头走。色调按最远进度分档，死亡退回存档点也不会闪回。 */
  syncBackdrop() {
    const cam = this.cameras.main;
    scrollParallax(this.parallax, cam.scrollX);
    const span = Math.max(1, this.level.finishX - this.level.startX);
    const progress = Math.max(0, this.run.maxDistance) / span;
    const bucket = Math.floor(progress * 16);
    if (bucket !== this._tintBucket) {
      this._tintBucket = bucket;
      tintParallax(this.parallax, progress);
    }
  },
};
