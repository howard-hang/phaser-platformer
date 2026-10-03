/**
 * 自动跑酷关卡。
 * 这里只负责开一局，并把每一帧交给障碍、道具、特效、HUD、输入和物理。
 * 方块匀速向右，点按或空格起跳。奔跑有挤压和残影，空中慢慢转。
 * 碰到尖刺或方块会碎开，镜头轻震、画面白闪，半秒内回到最近的存档点。
 */
import Phaser from 'phaser';
import {
  LEVELS,
  getLevel,
  levelTuning,
} from '../game/level.js';
import { START_X } from '../game/compileLevel.js';
import { ENDLESS_CURVE } from '../game/endlessCurve.js';
import { createEndlessStream } from '../game/endlessCourse.js';
import { recenterEndlessGround } from '../game/endlessActors.js';
import {
  distanceMeters,
  loadEndlessRecord,
} from '../game/endlessScore.js';
import { getSynth } from '../game/audio.js';
import { createParallax } from '../game/backdrop.js';
import { createDeathFx } from '../game/deathFx.js';
import { createRunnerFx } from '../game/runnerFx.js';
import { LEVEL_PALETTES } from '../game/theme.js';
import { textStyle } from '../game/candy.js';
import { levelName, t } from '../i18n/index.js';
import { createBlastFx } from '../game/blastFx.js';
import {
  createHud,
  createPowerHud,
} from '../game/hud.js';
import {
  isLevelUnlocked,
  loadProgress,
} from '../game/progress.js';
import {
  TUNING,
  sampleJump,
} from '../logic/world.js';
import {
  createPowerState,
  isOutOfMap,
} from '../logic/powerups.js';
import { createReviveBudget } from '../logic/revive.js';
import { createPauseState } from '../logic/pause.js';
import { createStarterOffer } from '../logic/starterPower.js';
import {
  createRunState,
  noteProgress,
  pickCheckpoint,
  reachedFinish,
} from '../logic/rules.js';

import { courseMethods } from './game/course.js';
import { effectMethods } from './game/effects.js';
import { hudMethods } from './game/hud.js';
import { inputMethods } from './game/input.js';
import { itemMethods } from './game/items.js';
import { reviveMethods } from './game/revive.js';
import { physicsMethods } from './game/physics.js';
import { pauseMethods } from './game/pause.js';
import { starterMethods } from './game/starter.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.endless = data?.mode === 'endless';
    if (this.endless) {
      const raw = Number(data?.seed);
      this.endlessSeed = Number.isFinite(raw) && raw > 0
        ? (raw >>> 0) || 1
        : (Math.floor(Math.random() * 0x7fffffff) + 1);
      this.stream = createEndlessStream(this.endlessSeed);
      this.endlessHandles = new Map();
      this.level = {
        id: 'endless',
        name: t('menu.endless'),
        index: 0,
        speed: ENDLESS_CURVE.baseSpeed,
        palette: 0,
        startX: START_X,
        finishX: Number.POSITIVE_INFINITY,
        worldWidth: START_X + 4800,
        checkpoints: [START_X],
        obstacles: [],
        stars: [],
        flips: [],
        decks: [],
        routes: [],
        speedBands: [],
        powerups: [],
        endless: true,
      };
      this.tuning = { ...TUNING, speed: ENDLESS_CURVE.baseSpeed };
      return;
    }
    const requested = data?.levelId || LEVELS[0].id;
    this.level = getLevel(requested) || LEVELS[0];
    this.tuning = levelTuning(this.level);
  }

  create() {
    // 上一局的通关面板还挂在这个场景对象上。不丢掉的话，重排会打到已销毁的图形。
    this.winUi = null;
    this.events.off('preupdate', this.restorePhysicsPose, this);
    this.events.off('preupdate', this.syncCourse, this);
    this.events.off('postupdate', this.extrapolatePlayerPose, this);
    // 直接开未解锁的关时送回选关，不把后面的关漏出去。无尽模式不看星数。
    if (!this.endless && !isLevelUnlocked(loadProgress(), this.level.id)) {
      this.scene.start('select');
      return;
    }
    this.run = createRunState();
    this.power = createPowerState();
    this.powerClock = 0;
    this._powerQueue = [];
    this._touchGuard = false;
    this._planeHeld = false;
    this._landFromY = null;
    this.powerSprites = [];
    this.won = false;
    this.ended = false;
    this.endlessBest = this.endless ? loadEndlessRecord().best : 0;
    this.suppressJump = false;
    this.rotating = false;
    this.airMs = 0;
    this.elapsedMs = 0;
    this.invulnUntil = 0;
    this.dying = false;
    this._deathToken = 0;
    this._reviveBusy = false;
    // 每一局只有一次看视频复活。重开一局才重新计数。
    this.reviveBudget = createReviveBudget();
    this.activeCheckpoint = this.level.checkpoints[0];
    this.airTimeMs = sampleJump().airTime * 1000;
    this._insets = { top: 0, right: 0, bottom: 0, left: 0 };

    const palette = LEVEL_PALETTES[this.level.palette] || LEVEL_PALETTES[0];
    this.cameras.main.setBackgroundColor(palette.gap);
    this.parallax = createParallax(this, this.level.palette);
    this._tintBucket = -1;
    if (this.endless) this.createEndlessGround();
    else this.createGround();
    this.createPlayer();
    if (this.endless) this.createEndlessCourse();
    else {
      this.createCourse();
      this.createFinish();
    }
    this.bindInput();
    this.pauseState = createPauseState();
    this._pauseFrames = 0;
    this._simHeld = false;
    this._adFreeze = false;
    this.holdingStart = false;
    this.starterOffer = createStarterOffer();
    this.pauseUi = null;
    this.startUi = null;
    this.hud = createHud(this, {
      variant: this.endless ? 'endless' : 'campaign',
      // 跑动中房子先暂停，回菜单从暂停面板进，避免误触直接离开。
      // 已经暂停或倒数时房子不再离开。死亡和过关仍走原来的去向。
      onHome: () => {
        const phase = this.pauseState?.phase || 'running';
        if (phase === 'paused' || phase === 'countdown') return;
        const before = phase;
        this.requestUserPause();
        if (this.pauseState?.phase === 'paused' && before !== 'paused') return;
        this.scene.start(this.endless ? 'menu' : 'select');
      },
      onPause: () => this.requestUserPause(),
    });
    this.powerHud = createPowerHud(this);
    this.blastFx = createBlastFx(this);
    this.runnerFx = createRunnerFx(this);
    this._runnerVisual = { phase: 0, land: 0, angle: 0, grounded: true };
    this._dustCarry = 0;
    this.deathFx = createDeathFx(this);
    const levelTitle = this.endless
      ? t('menu.endless')
      : t('hud.levelTitle', { index: this.level.index, name: levelName(this.level) });
    this.levelLabel = this.add.text(0, 0, levelTitle, textStyle({
      size: 20,
      color: '#ffffff',
      stroke: '#2a0840',
      strokeThickness: 4,
    })).setOrigin(0.5, 1).setScrollFactor(0).setDepth(230);
    if (this.endless) this.refreshEndlessHud();
    else this.hud.setStats(this.run);
    this.scale.on('resize', this.applyViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyViewport, this);
      this.physics.world?.off('worldstep', this.onWorldStep, this);
      this.winUi = null;
      // 场景拆掉时不要再重生，避免回调打到已经销毁的刚体上。
      this._deathToken += 1;
      this.deathFx?.cancel();
    });
    this.applyViewport();
    this.bindRunPause();
    // 安卓壳停在起跑线，可以先看广告领道具。网页直接开跑。
    this.openStartGate();

    this.physics.world.off('worldstep', this.onWorldStep, this);
    this.physics.world.on('worldstep', this.onWorldStep, this);
    // 场景对象会复用。再开一局时清掉上一局的显示坐标，并拆掉旧监听，避免把方块拉回终点。
    this._physicsPose = null;
    this.events.off('preupdate', this.restorePhysicsPose, this);
    this.events.off('preupdate', this.syncCourse, this);
    this.events.off('postupdate', this.extrapolatePlayerPose, this);
    // 物理步会把精灵坐标写回刚体位置。渲染前再外推，下一帧开始前先还原，避免外推进碰撞。
    this.events.on('preupdate', this.restorePhysicsPose, this);
    this.events.on('preupdate', this.syncCourse, this);
    this.events.on('postupdate', this.extrapolatePlayerPose, this);
  }

  update(_time, delta) {
    this.suppressJump = false;
    // 暂停、倒数、开局等待和复活广告期间不推进计时、障碍和道具。
    if (this.stepPause(delta)) return;
    this.deathFx?.update(delta);
    this.blastFx?.update(delta);
    this.runnerFx?.update(delta);
    // 碎裂的这半秒里方块停在原地，特效结束再继续跑。
    if (!this.player || this.won || this.dying) return;

    this.elapsedMs += delta;
    this.powerClock += delta / 1000;
    if (isOutOfMap(this.player.y)) {
      this.onHazard({ getData: (key) => key === 'pit' });
      if (this.dying) return;
    }
    this.stickToCeiling();
    this.player.body.setVelocityX(this.runSpeed());
    this.flushPowerQueue();
    this.advancePower();
    this.applyPlaneMotion(delta);
    this.collectPlaneStars();
    this.syncPowerIcons();

    const distance = this.player.x - this.level.startX;
    const next = noteProgress(this.run, distance, TUNING.pxPerScore);
    const scoreChanged = next.score !== this.run.score;
    this.run = next;
    if (this.endless) {
      this.syncEndlessWorld(this.player.x + 2600);
      recenterEndlessGround(this);
      if (scoreChanged || distanceMeters(distance) !== this._shownMeters) {
        this._shownMeters = distanceMeters(distance);
        this.refreshEndlessHud();
      }
    } else if (scoreChanged) {
      this.hud.setStats(this.run);
    }
    this.syncBackdrop();

    if (this.endless) {
      if (this.isGrounded()) {
        this.player.angle = 0;
        this.rotating = false;
        this.airMs = 0;
      }
      return;
    }

    const checkpoint = pickCheckpoint(this.level.checkpoints, this.player.x);
    if (checkpoint !== this.activeCheckpoint) {
      const advanced = checkpoint > this.activeCheckpoint;
      this.activeCheckpoint = checkpoint;
      // 旗子颜色只在存档点变化时改一次，不要每帧重涂。
      this.refreshCheckpointFlags();
      if (advanced) getSynth().play('checkpoint');
    }

    if (this.isGrounded()) {
      this.player.angle = 0;
      this.rotating = false;
      this.airMs = 0;
    }

    if (reachedFinish(this.player.x, this.level.finishX)) {
      this.win();
    }
  }

}

Object.assign(
  GameScene.prototype,
  physicsMethods,
  courseMethods,
  itemMethods,
  effectMethods,
  inputMethods,
  hudMethods,
  reviveMethods,
  pauseMethods,
  starterMethods,
);

