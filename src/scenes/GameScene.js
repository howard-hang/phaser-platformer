/**
 * 自动跑酷关卡。
 * 方块匀速向右，点按或空格起跳，空中转满一圈后落地。
 * 碰到尖刺或方块立刻回到最近的存档点。
 */
import Phaser from 'phaser';
import { LEVELS, getLevel, levelTuning, nextLevel } from '../game/level.js';
import { getSynth } from '../game/audio.js';
import {
  createParallax,
  layoutParallax,
  scrollParallax,
  tintParallax,
} from '../game/backdrop.js';
import { displayPose } from '../game/motion.js';
import { THEME, FONT, LEVEL_PALETTES } from '../game/theme.js';
import { createHud, isUiPointer, showWinPanel } from '../game/hud.js';
import { isLevelUnlocked, loadProgress, recordClear, saveProgress, starsToUnlock } from '../game/progress.js';
import { cssInsetsToGame, readSafeAreaInsets, verticalCameraScroll } from '../game/viewport.js';
import {
  TUNING,
  HITBOX,
  PAD_JUMP_VELOCITY,
  playerGroundY,
  obstaclePose,
  starPose,
  sampleJump,
} from '../logic/world.js';
import {
  createRunState,
  noteDeath,
  noteProgress,
  noteStar,
  pickCheckpoint,
  reachedFinish,
} from '../logic/rules.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    const requested = data?.levelId || LEVELS[0].id;
    this.level = getLevel(requested) || LEVELS[0];
    this.tuning = levelTuning(this.level);
  }

  create() {
    this.events.off('preupdate', this.restorePhysicsPose, this);
    this.events.off('preupdate', this.syncDynamicHazards, this);
    this.events.off('postupdate', this.extrapolatePlayerPose, this);
    // 直接开未解锁的关时送回选关，不把后面的关漏出去。
    if (!isLevelUnlocked(loadProgress(), this.level.id)) {
      this.scene.start('select');
      return;
    }
    this.run = createRunState();
    this.won = false;
    this.suppressJump = false;
    this.rotating = false;
    this.airMs = 0;
    this.elapsedMs = 0;
    this.invulnUntil = 0;
    this.activeCheckpoint = this.level.checkpoints[0];
    this.airTimeMs = sampleJump().airTime * 1000;
    this.boostAirMs = sampleJump({ ...TUNING, jumpVelocity: PAD_JUMP_VELOCITY }).airTime * 1000;
    this._insets = { top: 0, right: 0, bottom: 0, left: 0 };

    const palette = LEVEL_PALETTES[this.level.palette] || LEVEL_PALETTES[0];
    this.cameras.main.setBackgroundColor(palette.gap);
    this.parallax = createParallax(this, this.level.palette);
    this._tintBucket = -1;
    this.createGround();
    this.createPlayer();
    this.createCourse();
    this.createFinish();
    this.bindInput();
    this.hud = createHud(this, {
      onHome: () => this.scene.start('select'),
    });
    this.levelLabel = this.add.text(0, 0, `第 ${this.level.index} 关  ${this.level.name}`, {
      fontFamily: FONT,
      fontSize: '22px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 4,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(230);
    this.hud.setStats(this.run);
    this.scale.on('resize', this.applyViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyViewport, this);
    });
    this.applyViewport();

    this.physics.world.on('worldstep', this.onWorldStep, this);
    // 场景对象会复用。再开一局时清掉上一局的显示坐标，并拆掉旧监听，避免把方块拉回终点。
    this._physicsPose = null;
    this.events.off('preupdate', this.restorePhysicsPose, this);
    this.events.off('preupdate', this.syncDynamicHazards, this);
    this.events.off('postupdate', this.extrapolatePlayerPose, this);
    // 物理步会把精灵坐标写回刚体位置。渲染前再外推，下一帧开始前先还原，避免外推进碰撞。
    // 动态障碍在物理碰撞前对齐，避免慢一帧。
    this.events.on('preupdate', this.restorePhysicsPose, this);
    this.events.on('preupdate', this.syncDynamicHazards, this);
    this.events.on('postupdate', this.extrapolatePlayerPose, this);
  }

  /**
   * 上下移动的刺和周期激光跟着跑过的时间走。
   * 只更新镜头附近的几个，避免整关每帧都刷新刚体。
   */
  syncDynamicHazards() {
    const list = this.dynamicHazards;
    if (!list?.length || !this.player) return;
    const cam = this.cameras.main;
    const left = cam.scrollX - 160;
    const right = cam.scrollX + cam.width + 220;
    const time = (this.player.x - this.level.startX) / this.tuning.speed;
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (item.obstacle.x < left || item.obstacle.x > right) continue;
      const pose = obstaclePose(item.obstacle, this.tuning, time);
      const solid = pose.solid !== false;
      if (item.sprite.x !== pose.cx || item.sprite.y !== pose.cy) {
        item.sprite.setPosition(pose.cx, pose.cy);
        item.sprite.refreshBody();
      }
      if (item.sprite.body.enable !== solid) {
        item.sprite.body.enable = solid;
        item.sprite.setVisible(solid);
        if (solid) item.sprite.refreshBody();
      }
    }
  }

  /** 把上一帧为了显示而外推的坐标还原成刚体位置。 */
  restorePhysicsPose() {
    const pose = this._physicsPose;
    if (!pose || !this.player) return;
    this.player.setPosition(pose.x, pose.y);
    this.player.angle = pose.angle;
  }

  /** 刚体已经同步完，按剩余时间把方块画到两次物理步之间。 */
  extrapolatePlayerPose() {
    const body = this.player?.body;
    if (!body) return;
    const pose = {
      x: this.player.x,
      y: this.player.y,
      angle: this.player.angle,
    };
    this._physicsPose = pose;
    const world = this.physics.world;
    const view = displayPose(pose, body.velocity, world._elapsed, world._frameTimeMS, {
      rotating: this.rotating,
      spinMs: this.airTimeMs * 0.92,
      groundCenter: playerGroundY(),
    });
    this.player.setPosition(view.x, view.y);
    this.player.angle = view.angle;
  }

  /** 看不见的地面碰撞体，上面盖一条白线。 */
  createGround() {
    const ground = this.add.rectangle(
      this.level.worldWidth / 2,
      TUNING.groundY + 40,
      this.level.worldWidth,
      80,
      0x000000,
      0,
    );
    this.physics.add.existing(ground, true);
    this.ground = ground;
    this.add.rectangle(
      this.level.worldWidth / 2,
      TUNING.groundY + 1.5,
      this.level.worldWidth,
      3,
      THEME.ground,
    ).setDepth(2);
  }

  createCourse() {
    this.hazardSprites = [];
    this.starSprites = [];
    this.flags = [];
    this.dynamicHazards = [];
    this.padSprites = [];

    for (const obstacle of this.level.obstacles) {
      const pose = obstaclePose(obstacle, this.tuning, 0);
      if (obstacle.type === 'mover') {
        // 白竖线标出上下移动的范围，本身不挡路。
        const amplitude = obstacle.amplitude ?? 96;
        this.add.rectangle(
          obstacle.x,
          TUNING.groundY - amplitude / 2,
          4,
          amplitude,
          0xffffff,
        ).setDepth(3);
      }
      const sprite = this.physics.add.staticSprite(pose.cx, pose.cy, pose.key);
      applyHitbox(sprite, pose.spec);
      sprite.setDepth(5);
      sprite.setData('id', obstacle.id);
      sprite.setVisible(pose.solid !== false);
      if (sprite.body) sprite.body.enable = pose.solid !== false;
      this.hazardSprites.push(sprite);
      if (obstacle.type === 'mover' || obstacle.type === 'laser') {
        this.dynamicHazards.push({ obstacle, sprite });
      }
    }

    for (const pad of this.level.pads || []) {
      const pose = obstaclePose({ ...pad, type: 'pad' }, this.tuning, 0);
      const sprite = this.physics.add.staticSprite(pose.cx, pose.cy, pose.key);
      applyHitbox(sprite, pose.spec);
      sprite.setDepth(5);
      sprite.setData('id', pad.id);
      this.padSprites.push(sprite);
    }

    for (const star of this.level.stars) {
      const pose = starPose(star);
      const sprite = this.physics.add.staticSprite(pose.cx, pose.cy, pose.key);
      applyHitbox(sprite, pose.spec);
      sprite.setDepth(4);
      sprite.setData('id', star.id);
      this.starSprites.push(sprite);
    }

    // 起点不画旗，避免档杆插在方块身上。后面的存档点用小旗标出来。
    for (const x of this.level.checkpoints.slice(1)) {
      const pole = this.add.rectangle(x, TUNING.groundY - 52, 4, 104, 0xffffff).setDepth(6);
      const cloth = this.add.rectangle(x + 16, TUNING.groundY - 90, 28, 18, THEME.checkpoint).setDepth(6);
      this.flags.push({ x, pole, cloth });
    }

    this.add.text(this.level.startX + 300, TUNING.groundY - 110, '点击 / 空格跳跃', {
      fontFamily: FONT,
      fontSize: '28px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 4,
    }).setDepth(7);

    this.physics.add.overlap(this.player, this.hazardSprites, () => this.onHazard(), null, this);
    this.physics.add.overlap(this.player, this.starSprites, (_player, star) => this.onStar(star), null, this);
    if (this.padSprites.length) {
      this.physics.add.overlap(this.player, this.padSprites, () => this.onPad(), null, this);
    }
  }

  createPlayer() {
    const y = playerGroundY();
    this.player = this.physics.add.sprite(this.level.startX, y, 'player');
    this.player.setDepth(8);
    applyHitbox(this.player, HITBOX.player);
    this.player.body.updateFromGameObject();
    this.player.body.setVelocityX(this.tuning.speed);
    this.physics.add.collider(this.player, this.ground);

    // 偏移让方块停在画面偏左，前方留出反应距离。垂直方向由边界锁死，跳跃不会把镜头抬起来。
    this.cameras.main.startFollow(this.player, true, 1, 1, -240, 0);
  }

  createFinish() {
    const x = this.level.finishX;
    this.add.rectangle(x, TUNING.groundY - 78, 8, 156, THEME.finish).setDepth(6);
    this.add.rectangle(x + 46, TUNING.groundY - 78, 8, 156, THEME.finish).setDepth(6);
    this.add.text(x + 23, TUNING.groundY - 180, '终点', {
      fontFamily: FONT,
      fontSize: '32px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(6);
  }

  bindInput() {
    this.input.on('pointerdown', (pointer) => {
      if (this.suppressJump) return;
      // 右上角是按钮区，点这里只触发按钮，不起跳。区域随画面宽度和安全区变化。
      const guard = this.hud.jumpGuard;
      if (pointer.x > guard.left && pointer.y < guard.bottom) return;
      if (isUiPointer(this, pointer)) return;
      getSynth().unlock();
      this.tryJump();
    });

    if (this.input.keyboard) {
      this.input.keyboard.addCapture(['SPACE', 'UP']);
      const onKey = (event) => {
        if (event.repeat) return;
        getSynth().unlock();
        this.tryJump();
      };
      this.input.keyboard.on('keydown-SPACE', onKey);
      this.input.keyboard.on('keydown-UP', onKey);
    }
  }

  /** 只有脚还在地上才起跳，空中不能二段跳。平时的起跳速度不变。 */
  tryJump() {
    if (this.won || this.time.now < this.invulnUntil) return;
    if (!this.isGrounded()) return;
    this.player.body.setVelocityY(TUNING.jumpVelocity);
    this.airTimeMs = sampleJump().airTime * 1000;
    this.rotating = true;
    this.airMs = 0;
    this.player.angle = 0;
    getSynth().play('jump');
  }

  /** 踩上跳板会弹得更高。已经离地就不要每帧重复触发。 */
  onPad() {
    if (this.won || this.time.now < this.invulnUntil) return;
    if (!this.isGrounded()) return;
    if (this.player.body.velocity.y < -40) return;
    this.player.body.setVelocityY(PAD_JUMP_VELOCITY);
    this.airTimeMs = this.boostAirMs;
    this.rotating = true;
    this.airMs = 0;
    this.player.angle = 0;
    getSynth().play('jump');
  }

  isGrounded() {
    const body = this.player.body;
    if (body.blocked.down || body.touching.down) return true;
    return body.velocity.y >= 0 && body.bottom >= TUNING.groundY - 2 && body.bottom <= TUNING.groundY + 8;
  }

  /** 物理步里累加旋转，一整圈刚好赶在落地前转完。 */
  onWorldStep(delta) {
    if (!this.rotating || this.won) return;
    this.airMs += delta * 1000;
    const progress = Math.min(1, this.airMs / (this.airTimeMs * 0.92));
    this.player.angle = 360 * progress;
  }

  onHazard() {
    if (this.won || this.time.now < this.invulnUntil) return;
    this.invulnUntil = this.time.now + 80;
    this.run = noteDeath(this.run);
    this.activeCheckpoint = pickCheckpoint(this.level.checkpoints, this.player.x);
    this.rotating = false;
    this.airMs = 0;
    this.player.angle = 0;
    const y = playerGroundY();
    this.player.body.reset(this.activeCheckpoint, y);
    // reset 把碰撞盒放在贴图左上角，这里再对齐偏移，并清掉本帧位移，避免落地后被挤穿地面。
    this.player.body.updateFromGameObject();
    this.player.body.prev.copy(this.player.body.position);
    this.player.body.prevFrame.copy(this.player.body.position);
    this.player.body.setVelocity(this.tuning.speed, 0);
    getSynth().play('death');
    // 死亡只播音效。背景音乐继续当前进度，不从头开始。
    this.hud.setStats(this.run);
  }

  onStar(star) {
    if (!star.active) return;
    const result = noteStar(this.run, star.getData('id'));
    this.run = result.state;
    if (!result.picked) return;
    star.disableBody(true, true);
    getSynth().play('star');
    this.hud.setStats(this.run);
  }

  update(_time, delta) {
    this.suppressJump = false;
    if (!this.player || this.won) return;

    this.elapsedMs += delta;
    this.player.body.setVelocityX(this.tuning.speed);

    const distance = this.player.x - this.level.startX;
    const next = noteProgress(this.run, distance, TUNING.pxPerScore);
    if (next.score !== this.run.score) this.hud.setStats(next);
    this.run = next;
    this.syncBackdrop();

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

  /** 已经经过的存档点亮黄旗，其余保持青色。 */
  refreshCheckpointFlags() {
    for (const flag of this.flags) {
      const lit = flag.x <= this.activeCheckpoint;
      flag.cloth.setFillStyle(lit ? THEME.checkpointLit : THEME.checkpoint);
    }
  }

  win() {
    this.won = true;
    this.rotating = false;
    this.player.angle = 0;
    this.player.body.setVelocity(0, 0);
    this.player.body.setAllowGravity(false);
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
  }

  /**
   * 窗口尺寸或旋转之后重排镜头、背景和 HUD。
   * 地面仍在原来的世界坐标，只是更高的屏幕能看到更多天空。
   */
  applyViewport() {
    const cam = this.cameras.main;
    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const scrollY = verticalCameraScroll(TUNING.viewHeight, viewH);
    cam.setBounds(0, scrollY, this.level.worldWidth, viewH);
    cam.scrollY = scrollY;
    const insets = cssInsetsToGame(readSafeAreaInsets(), this.scale.displayScale);
    this._insets = insets;
    layoutParallax(this.parallax, viewW, viewH, scrollY);
    this.hud?.relayout({ viewWidth: viewW, viewHeight: viewH, insets });
    this.levelLabel?.setPosition(viewW / 2, viewH - (insets.bottom || 0) - 18);
    this.winUi?.relayout(viewW, viewH, insets);
    this.syncBackdrop();
  }

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
  }
}

/** 按共享碰撞盒缩紧刚体。静态和动态物体都走这里。 */
function applyHitbox(sprite, spec) {
  sprite.body.setSize(spec.bodyW, spec.bodyH, false);
  sprite.body.setOffset(spec.offsetX, spec.offsetY);
}
