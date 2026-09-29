/**
 * 自动跑酷关卡。
 * 方块匀速向右，点按或空格起跳，空中转满一圈后落地。
 * 碰到尖刺或方块立刻回到最近的存档点。
 */
import Phaser from 'phaser';
import { LEVEL } from '../game/level.js';
import { getSynth } from '../game/audio.js';
import { drawBackdrop } from '../game/backdrop.js';
import { displayPose } from '../game/motion.js';
import { THEME, FONT } from '../game/theme.js';
import { createHud, isUiPointer, showWinPanel } from '../game/hud.js';
import {
  TUNING,
  HITBOX,
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

  create() {
    this.level = LEVEL;
    this.run = createRunState();
    this.won = false;
    this.suppressJump = false;
    this.rotating = false;
    this.airMs = 0;
    this.elapsedMs = 0;
    this.invulnUntil = 0;
    this.activeCheckpoint = LEVEL.checkpoints[0];
    this.airTimeMs = sampleJump().airTime * 1000;

    this.cameras.main.setBackgroundColor(THEME.gap);
    drawBackdrop(this, LEVEL.worldWidth, TUNING.viewHeight);
    this.createGround();
    this.createPlayer();
    this.createCourse();
    this.createFinish();
    this.bindInput();
    this.hud = createHud(this, {
      onHome: () => this.scene.start('menu'),
    });
    this.hud.setStats(this.run);

    this.physics.world.on('worldstep', this.onWorldStep, this);
    // 场景对象会复用。再开一局时清掉上一局的显示坐标，并拆掉旧监听，避免把方块拉回终点。
    this._physicsPose = null;
    this.events.off('preupdate', this.restorePhysicsPose, this);
    this.events.off('postupdate', this.extrapolatePlayerPose, this);
    // 物理步会把精灵坐标写回刚体位置。渲染前再外推，下一帧开始前先还原，避免外推进碰撞。
    this.events.on('preupdate', this.restorePhysicsPose, this);
    this.events.on('postupdate', this.extrapolatePlayerPose, this);
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
      LEVEL.worldWidth / 2,
      TUNING.groundY + 40,
      LEVEL.worldWidth,
      80,
      0x000000,
      0,
    );
    this.physics.add.existing(ground, true);
    this.ground = ground;
    this.add.rectangle(
      LEVEL.worldWidth / 2,
      TUNING.groundY + 1.5,
      LEVEL.worldWidth,
      3,
      THEME.ground,
    ).setDepth(2);
  }

  createCourse() {
    this.hazardSprites = [];
    this.starSprites = [];
    this.flags = [];

    for (const obstacle of LEVEL.obstacles) {
      const pose = obstaclePose(obstacle);
      const sprite = this.physics.add.staticSprite(pose.cx, pose.cy, pose.key);
      applyHitbox(sprite, pose.spec);
      sprite.setDepth(5);
      sprite.setData('id', obstacle.id);
      this.hazardSprites.push(sprite);
    }

    for (const star of LEVEL.stars) {
      const pose = starPose(star);
      const sprite = this.physics.add.staticSprite(pose.cx, pose.cy, pose.key);
      applyHitbox(sprite, pose.spec);
      sprite.setDepth(4);
      sprite.setData('id', star.id);
      this.starSprites.push(sprite);
    }

    // 起点不画旗，避免档杆插在方块身上。后面的存档点用小旗标出来。
    for (const x of LEVEL.checkpoints.slice(1)) {
      const pole = this.add.rectangle(x, TUNING.groundY - 52, 4, 104, 0xffffff).setDepth(6);
      const cloth = this.add.rectangle(x + 16, TUNING.groundY - 90, 28, 18, THEME.checkpoint).setDepth(6);
      this.flags.push({ x, pole, cloth });
    }

    this.add.text(LEVEL.startX + 300, TUNING.groundY - 110, '点击 / 空格跳跃', {
      fontFamily: FONT,
      fontSize: '28px',
      color: '#ffffff',
      stroke: THEME.stroke,
      strokeThickness: 4,
    }).setDepth(7);

    this.physics.add.overlap(this.player, this.hazardSprites, () => this.onHazard(), null, this);
    this.physics.add.overlap(this.player, this.starSprites, (_player, star) => this.onStar(star), null, this);
  }

  createPlayer() {
    const y = playerGroundY();
    this.player = this.physics.add.sprite(LEVEL.startX, y, 'player');
    this.player.setDepth(8);
    applyHitbox(this.player, HITBOX.player);
    this.player.body.updateFromGameObject();
    this.player.body.setVelocityX(TUNING.speed);
    this.physics.add.collider(this.player, this.ground);

    this.cameras.main.setBounds(0, 0, LEVEL.worldWidth, TUNING.viewHeight);
    // 偏移让方块停在画面偏左，前方留出反应距离。垂直方向被边界锁死，跳跃不会把镜头抬起来。
    // roundPixels 把滚动对齐到整像素，避免横向移动时贴图发虚、抖动。
    this.cameras.main.startFollow(this.player, true, 1, 1, -240, 0);
  }

  createFinish() {
    const x = LEVEL.finishX;
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
      // 右上角是按钮区，点这里只触发按钮，不起跳。
      if (pointer.x > 740 && pointer.y < 120) return;
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

  /** 只有脚还在地上才起跳，空中不能二段跳。 */
  tryJump() {
    if (this.won || this.time.now < this.invulnUntil) return;
    if (!this.isGrounded()) return;
    this.player.body.setVelocityY(TUNING.jumpVelocity);
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
    this.activeCheckpoint = pickCheckpoint(LEVEL.checkpoints, this.player.x);
    this.rotating = false;
    this.airMs = 0;
    this.player.angle = 0;
    const y = playerGroundY();
    this.player.body.reset(this.activeCheckpoint, y);
    // reset 把碰撞盒放在贴图左上角，这里再对齐偏移，并清掉本帧位移，避免落地后被挤穿地面。
    this.player.body.updateFromGameObject();
    this.player.body.prev.copy(this.player.body.position);
    this.player.body.prevFrame.copy(this.player.body.position);
    this.player.body.setVelocity(TUNING.speed, 0);
    getSynth().play('death');
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
    if (this.won) return;

    this.elapsedMs += delta;
    this.player.body.setVelocityX(TUNING.speed);

    const distance = this.player.x - LEVEL.startX;
    const next = noteProgress(this.run, distance, TUNING.pxPerScore);
    if (next.score !== this.run.score) this.hud.setStats(next);
    this.run = next;

    const checkpoint = pickCheckpoint(LEVEL.checkpoints, this.player.x);
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

    if (reachedFinish(this.player.x, LEVEL.finishX)) {
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
    showWinPanel(this, {
      score: this.run.score,
      deaths: this.run.deaths,
      stars: this.run.stars,
      totalStars: LEVEL.stars.length,
      timeMs: this.elapsedMs,
    }, () => this.scene.restart());
  }
}

/** 按共享碰撞盒缩紧刚体。静态和动态物体都走这里。 */
function applyHitbox(sprite, spec) {
  sprite.body.setSize(spec.bodyW, spec.bodyH, false);
  sprite.body.setOffset(spec.offsetX, spec.offsetY);
}
