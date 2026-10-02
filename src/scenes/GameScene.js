/**
 * 自动跑酷关卡。
 * 方块匀速向右，点按或空格起跳，空中转满一圈后落地。
 * 碰到尖刺或方块会碎开，镜头轻震、画面白闪，半秒内回到最近的存档点。
 */
import Phaser from 'phaser';
import { LEVELS, getLevel, levelTuning, nextLevel } from '../game/level.js';
import { START_X } from '../game/compileLevel.js';
import { ENDLESS_CURVE } from '../game/endlessCurve.js';
import {
  createEndlessStream,
  ensureAhead,
  recycleBehind,
  viewEndless,
} from '../game/endlessCourse.js';
import {
  createEndlessGround,
  createEndlessGroups,
  mountEndlessPiece,
  recenterEndlessGround,
  unmountEndlessPiece,
} from '../game/endlessActors.js';
import { commitEndlessRecord, distanceMeters, loadEndlessRecord } from '../game/endlessScore.js';
import { getSynth } from '../game/audio.js';
import {
  createParallax,
  layoutParallax,
  scrollParallax,
  tintParallax,
} from '../game/backdrop.js';
import { createDeathFx } from '../game/deathFx.js';
import { displayPose } from '../game/motion.js';
import { THEME, LEVEL_PALETTES } from '../game/theme.js';
import { textStyle } from '../game/candy.js';
import { createBlastFx } from '../game/blastFx.js';
import { removeObstacles } from '../game/hazardClear.js';
import { createHud, createPowerHud, isUiPointer, showEndlessPanel, showWinPanel } from '../game/hud.js';
import { POWERUP_CONFIG } from '../game/powerupConfig.js';
import { spawnPowerupSprite } from '../game/powerupActor.js';
import { isLevelUnlocked, loadProgress, recordClear, saveProgress, starsToUnlock } from '../game/progress.js';
import { cssInsetsToGame, readSafeAreaInsets, verticalCameraScroll } from '../game/viewport.js';
import {
  TUNING,
  HITBOX,
  FLIP_CEILING_Y,
  playerCeilingY,
  playerGroundY,
  courseTime,
  obstaclePose,
  isGateClosed,
  speedAtX,
  starPose,
  sampleJump,
} from '../logic/world.js';
import {
  canAirJump,
  clearSpan,
  createPowerState,
  flightCenterY,
  grantPower,
  isPowerInvulnerable,
  landingClearWindow,
  landingY,
  noteAirJump,
  noteLand,
  resolveJump,
  tickPower,
} from '../logic/powerups.js';
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
        name: '无尽模式',
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
    this.hud = createHud(this, {
      variant: this.endless ? 'endless' : 'campaign',
      onHome: () => this.scene.start(this.endless ? 'menu' : 'select'),
    });
    this.powerHud = createPowerHud(this);
    this.blastFx = createBlastFx(this);
    this.deathFx = createDeathFx(this);
    const levelTitle = this.endless
      ? '无尽模式'
      : `第 ${this.level.index} 关  ${this.level.name}`;
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

  /** 把上一帧为了显示而外推的坐标还原成刚体位置。 */
  restorePhysicsPose() {
    const pose = this._physicsPose;
    if (!pose || !this.player) return;
    this.player.setPosition(pose.x, pose.y);
    this.player.angle = pose.angle;
  }

  /** 刚体已经同步完，按剩余时间把方块画到两次物理步之间。 */
  extrapolatePlayerPose() {
    if (this.dying || this.won) return;
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

  /** 当前水平速度。无尽模式按分段取，闯关就是这一关的速度。 */
  runSpeed() {
    if (!this.player) return this.tuning.speed;
    return speedAtX(this.player.x, this.level, this.tuning);
  }

  /** 跑到当前位置的关卡时间。机关的开合和平台塌陷都用它。 */
  courseNow() {
    if (!this.player) return 0;
    return courseTime(this.player.x, this.level, this.tuning);
  }

  /** 无尽 HUD：距离、本局星星、最高纪录。超过旧纪录时纪录数字跟着涨。 */
  refreshEndlessHud() {
    const px = Math.max(0, (this.player?.x || this.level.startX) - this.level.startX);
    const meters = distanceMeters(Math.max(px, this.run?.maxDistance || 0));
    this.hud.setStats({
      distance: meters,
      stars: this.run?.stars || 0,
      best: Math.max(this.endlessBest || 0, meters),
    });
  }

  /** 先铺一段热身和前方的障碍，并建好碰撞组。 */
  createEndlessCourse() {
    this.hazardSprites = [];
    this.starSprites = [];
    this.flags = [];
    this.courseNodes = [];
    this.crumbles = [];
    this.flipVisuals = [];
    this.deckNodes = [];
    this.powerSprites = [];
    this._inFlip = false;
    this.endlessGroups = createEndlessGroups(this);
    this.syncEndlessWorld(this.level.startX + 2800);
    this.add.text(this.level.startX + 300, TUNING.groundY - 110, '点击 / 空格跳跃', textStyle({
      size: 26,
      color: '#ffffff',
      stroke: '#2a0840',
      strokeThickness: 4,
    })).setDepth(7);
  }

  createEndlessGround() {
    createEndlessGround(this);
  }

  /**
   * 前方不够就再拼一段，身后太远的段拆掉。
   * 速度分段留在 level 上，计时还要用。
   */
  syncEndlessWorld(targetX) {
    const spawned = ensureAhead(this.stream, targetX);
    for (let i = 0; i < spawned.length; i += 1) {
      const piece = spawned[i];
      this.endlessHandles.set(piece.id, mountEndlessPiece(this, this.endlessGroups, piece));
    }
    const behind = (this.player?.x || this.level.startX) - 1800;
    const dropped = recycleBehind(this.stream, behind);
    for (let i = 0; i < dropped.length; i += 1) {
      const piece = dropped[i];
      unmountEndlessPiece(this, this.endlessHandles.get(piece.id));
      this.endlessHandles.delete(piece.id);
    }
    const view = viewEndless(this.stream, this.scale.width);
    this.level.obstacles = view.obstacles;
    this.level.stars = view.stars;
    this.level.flips = view.flips;
    this.level.decks = view.decks;
    this.level.routes = view.routes;
    this.level.speedBands = view.speedBands;
    this.level.worldWidth = view.worldWidth;
    this.level.speed = view.speed;
    const cam = this.cameras.main;
    if (cam) cam.setBounds(0, cam.scrollY, view.worldWidth, cam.height);
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
    // 静态障碍、周期门、坠落平台分开记。视口外的刚体每帧关掉，不参与碰撞。
    this.courseNodes = [];
    this.crumbles = [];
    this.flipVisuals = [];
    this.powerSprites = [];
    this._inFlip = false;

    for (const obstacle of this.level.obstacles) {
      if (obstacle.type === 'flip') {
        this.createFlipZone(obstacle);
        continue;
      }
      if (obstacle.type === 'crumble') {
        this.createCrumble(obstacle);
        continue;
      }
      const pose = obstaclePose(
        obstacle,
        this.tuning,
        0,
        obstacle.type === 'gate' ? { forceClosed: true } : {},
      );
      if (!pose) continue;
      const sprite = this.physics.add.staticSprite(pose.cx, pose.cy, pose.key);
      applyHitbox(sprite, pose.spec);
      sprite.setDepth(5);
      sprite.setData('id', obstacle.id);
      this.hazardSprites.push(sprite);
      this.courseNodes.push({
        obstacle,
        sprite,
        x: obstacle.x,
        baseY: pose.cy,
      });
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

    this.add.text(this.level.startX + 300, TUNING.groundY - 110, '点击 / 空格跳跃', textStyle({
      size: 26,
      color: '#ffffff',
      stroke: '#2a0840',
      strokeThickness: 4,
    })).setDepth(7);

    this.mountCampaignPowerups();
    this.physics.add.overlap(this.player, this.hazardSprites, () => this.onHazard(), null, this);
    this.physics.add.overlap(this.player, this.starSprites, (_player, star) => this.onStar(star), null, this);
    this.createDecks();
  }

  /**
   * 上层路线：一条薄平台。往上跳能穿过去，下落时才站上去。
   * 台阶、主路、更高一层用不同颜色，入口左侧有一块白标，方便看出分叉。
   */
  createDecks() {
    this.deckNodes = [];
    const decks = this.level.decks || [];
    for (let i = 0; i < decks.length; i += 1) {
      const deck = decks[i];
      const width = Math.max(8, deck.x1 - deck.x0);
      const cx = (deck.x0 + deck.x1) / 2;
      const color = deck.kind === 'step' ? 0xfde68a : (deck.layer >= 3 ? 0xfde047 : 0x67e8f9);
      const slab = this.add.rectangle(cx, deck.top + 4, width, 8, color).setDepth(3);
      const lip = this.add.rectangle(cx, deck.top + 1, width, 3, 0xffffff).setDepth(4);
      // 入口白标，提示这里可以跳上来。
      const mark = this.add.rectangle(deck.x0 + 10, deck.top - 12, 6, 20, 0xffffff).setDepth(4);
      const body = this.add.rectangle(cx, deck.top + 3, width, 6, 0x000000, 0);
      this.physics.add.existing(body, true);
      body.setData('deck', deck);
      this.physics.add.collider(this.player, body, null, (_player, plat) => this.canLandOnDeck(plat), this);
      this.deckNodes.push({
        deck,
        body,
        x0: deck.x0,
        x1: deck.x1,
        visuals: [slab, lip, mark],
      });
    }
  }

  /** 只有从上面落下来才站上平台，避免从底下被顶住。飞行时穿过去，免得被平台截住。 */
  canLandOnDeck(plat) {
    if (this.power?.kind === 'plane') return false;
    const body = this.player?.body;
    const deck = plat.getData('deck');
    if (!body || !deck || body.velocity.y < 0) return false;
    const time = this.courseNow();
    if (deck.collapse != null && time >= deck.collapse) return false;
    return body.bottom <= deck.top + 10;
  }

  /** 反转区的色带和天花板。天花板是实体，人会被反重力顶在上面。 */
  createFlipZone(zone) {
    const width = Math.max(8, zone.x1 - zone.x0);
    const cx = (zone.x0 + zone.x1) / 2;
    const visual = this.add.rectangle(
      cx,
      (FLIP_CEILING_Y + TUNING.groundY) / 2,
      width,
      TUNING.groundY - FLIP_CEILING_Y,
      0x67e8f9,
      0.22,
    ).setDepth(1);
    const ceiling = this.add.rectangle(cx, FLIP_CEILING_Y - 10, width, 20, 0xffffff).setDepth(3);
    this.physics.add.existing(ceiling, true);
    this.physics.add.collider(this.player, ceiling);
    this.flipVisuals.push({ ...zone, visual, ceiling });
  }

  /** 坠落平台：砖是贴图，塌掉之后才打开地面上的杀伤盒。 */
  createCrumble(obstacle) {
    const tiles = [];
    const tileW = HITBOX.block.w;
    const baseY = TUNING.groundY - tileW / 2;
    for (let x = obstacle.x0 + tileW / 2; x < obstacle.x1 - 8; x += tileW) {
      tiles.push(this.add.image(x, baseY, 'crumble').setDepth(3));
    }
    const width = Math.max(8, obstacle.x1 - obstacle.x0);
    const kill = this.add.rectangle(
      (obstacle.x0 + obstacle.x1) / 2,
      TUNING.groundY - 23,
      width,
      46,
      0x000000,
      0,
    );
    this.physics.add.existing(kill, true);
    kill.body.enable = false;
    this.hazardSprites.push(kill);
    this.crumbles.push({
      obstacle,
      tiles,
      kill,
      baseY,
      x0: obstacle.x0,
      x1: obstacle.x1,
    });
  }

  /**
   * 物理步之前刷新机关，并关掉镜头外面的刚体。
   * 时间按玩家的 x 算，死亡回到存档点后机关会对齐，不会越死越乱。
   */
  syncCourse() {
    if (!this.player?.body || this.won) return;
    const cam = this.cameras.main;
    const viewLeft = cam.scrollX - 280;
    const viewRight = cam.scrollX + cam.width + 520;
    const time = this.courseNow();
    this.syncFlipGravity();

    for (let i = 0; i < this.courseNodes.length; i += 1) {
      const node = this.courseNodes[i];
      const near = node.x >= viewLeft && node.x <= viewRight;
      if (!near) {
        node.sprite.body.enable = false;
        continue;
      }
      if (node.obstacle.type === 'gate') {
        const closed = isGateClosed(node.obstacle, time);
        node.sprite.setVisible(closed);
        node.sprite.body.enable = closed;
        if (closed) {
          node.sprite.setPosition(node.x, node.baseY);
          node.sprite.refreshBody();
        }
        continue;
      }
      node.sprite.body.enable = true;
    }

    for (let i = 0; i < this.crumbles.length; i += 1) {
      const item = this.crumbles[i];
      const near = item.x1 >= viewLeft && item.x0 <= viewRight;
      const fall = time - item.obstacle.collapse;
      const fallen = fall >= 0;
      item.kill.body.enable = near && fallen;
      if (!near) continue;
      const drop = fallen ? Math.min(220, fall * 420) : 0;
      const alpha = fallen ? Math.max(0, 1 - fall * 1.4) : 1;
      for (let t = 0; t < item.tiles.length; t += 1) {
        item.tiles[t].setY(item.baseY + drop);
        item.tiles[t].setAlpha(alpha);
      }
    }

    const nodes = this.deckNodes || [];
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const near = node.x1 >= viewLeft && node.x0 <= viewRight;
      // 镜头外的平台刚体关掉，和地面障碍同一套省帧办法。
      node.body.body.enable = near;
    }
    this.syncPowerBob(time);
  }

  /** 镜头里的道具轻轻浮动。吃掉的已经从列表拿掉，不再刷新刚体。 */
  syncPowerBob(time) {
    const sprites = this.powerSprites;
    if (!sprites?.length) return;
    const cam = this.cameras.main;
    const viewLeft = cam.scrollX - 280;
    const viewRight = cam.scrollX + cam.width + 520;
    const bob = Math.sin(time * 6) * 4;
    for (let i = 0; i < sprites.length; i += 1) {
      const sprite = sprites[i];
      if (!sprite.active || !sprite.body) continue;
      const near = sprite.x >= viewLeft && sprite.x <= viewRight;
      sprite.body.enable = near;
      if (!near) continue;
      sprite.y = sprite.getData('baseY') + bob;
      sprite.refreshBody();
    }
  }

  /** 人在反转区里时，净重力变成原来的向上版本，大小不变。飞机自己定高度，不吃这股力。 */
  syncFlipGravity() {
    if (this.power?.kind === 'plane') {
      this._inFlip = false;
      this.player.body.setAllowGravity(false);
      this.player.body.setGravityY(0);
      return;
    }
    const x = this.player.x;
    const zones = this.level.flips || [];
    let inside = false;
    for (let i = 0; i < zones.length; i += 1) {
      if (x >= zones[i].x0 && x <= zones[i].x1) {
        inside = true;
        break;
      }
    }
    this._inFlip = inside;
    this.player.body.setGravityY(inside ? -TUNING.gravity * 2 : 0);
  }

  /** 贴住天花板，避免反重力和碰撞来回挤。向下起跳时不打断。 */
  stickToCeiling() {
    if (this.power?.kind === 'plane') return;
    if (!this._inFlip || !this.player?.body) return;
    const body = this.player.body;
    if (body.velocity.y > 30) return;
    // 还差一截才贴上时也吸住，不然刚体分离会让方块在天花板下来回抖。
    if (body.y > FLIP_CEILING_Y + 28) return;
    const center = playerCeilingY();
    this.player.setPosition(this.player.x, center);
    body.reset(this.player.x, center);
    body.updateFromGameObject();
    body.prev.copy(body.position);
    body.setVelocity(this.runSpeed(), 0);
  }

  createPlayer() {
    const y = playerGroundY();
    this.player = this.physics.add.sprite(this.level.startX, y, 'player');
    this.player.setDepth(8);
    applyHitbox(this.player, HITBOX.player);
    this.player.body.updateFromGameObject();
    this.player.body.setVelocityX(this.runSpeed());
    this.physics.add.collider(this.player, this.ground);
    // 翅膀和二段跳标记跟着方块，没有道具时不画。
    this.ride = this.add.image(0, 0, 'ride-wings').setDepth(7).setVisible(false);
    this.doubleMark = this.add.image(0, 0, 'power-double').setDepth(9).setVisible(false).setDisplaySize(28, 28);

    // 偏移让方块停在画面偏左，前方留出反应距离。垂直方向由边界锁死，跳跃不会把镜头抬起来。
    this.cameras.main.startFollow(this.player, true, 1, 1, -240, 0);
  }

  createFinish() {
    const x = this.level.finishX;
    this.add.rectangle(x, TUNING.groundY - 78, 8, 156, THEME.finish).setDepth(6);
    this.add.rectangle(x + 46, TUNING.groundY - 78, 8, 156, THEME.finish).setDepth(6);
    this.add.text(x + 23, TUNING.groundY - 180, '终点', textStyle({
      size: 28,
      color: '#ffe14a',
      stroke: '#3b0764',
      strokeThickness: 5,
    })).setOrigin(0.5).setDepth(6);
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

  /**
   * 贴地或贴天花板时按普通跳起跳，速度和原来一样。
   * 二段跳生效时，空中还能再起跳一次，初速度仍是普通跳的那一档。
   */
  tryJump() {
    if (this.won || this.dying || this.time.now < this.invulnUntil) return;
    if (this.power?.kind === 'plane') return;
    const grounded = this.isGrounded();
    const decision = resolveJump({
      grounded,
      airReady: canAirJump(this.power, grounded),
      jumpVelocity: TUNING.jumpVelocity,
      flipped: !!this._inFlip,
    });
    if (!decision.ok) return;
    if (decision.usedAir) this.power = noteAirJump(this.power);
    this.player.body.setVelocityY(decision.vy);
    this.rotating = true;
    this.airMs = 0;
    this.player.angle = 0;
    getSynth().play('jump');
  }

  isGrounded() {
    const body = this.player.body;
    if (this._inFlip) {
      return body.blocked.up || body.touching.up || body.y <= FLIP_CEILING_Y + 2;
    }
    if (body.blocked.down || body.touching.down) return true;
    if (body.velocity.y >= 0 && body.bottom >= TUNING.groundY - 2 && body.bottom <= TUNING.groundY + 8) {
      return true;
    }
    return this.standsOnDeck();
  }

  /** 脚底贴着某块上层平台时也算落地，可以起跳。 */
  standsOnDeck() {
    const body = this.player?.body;
    if (!body || body.velocity.y < 0) return false;
    const nodes = this.deckNodes || [];
    for (let i = 0; i < nodes.length; i += 1) {
      const deck = nodes[i].deck;
      if (this.player.x < deck.x0 - 6 || this.player.x > deck.x1 + 6) continue;
      if (Math.abs(body.bottom - deck.top) <= 8) return true;
    }
    return false;
  }

  /** 物理步里累加旋转，一整圈刚好赶在落地前转完。飞机保持平飞，不转圈。 */
  onWorldStep(delta) {
    if (!this.rotating || this.won || this.power?.kind === 'plane') return;
    this.airMs += delta * 1000;
    const progress = Math.min(1, this.airMs / (this.airTimeMs * 0.92));
    this.player.angle = 360 * progress;
  }

  onHazard() {
    if (this.won || this.dying || this.time.now < this.invulnUntil) return;
    // 飞机，以及落地后的一小段，障碍打不中。同一帧先吃到炸弹时也先别死。
    if (this._touchGuard || isPowerInvulnerable(this.power, this.powerClock)) return;
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
    this.ride?.setVisible(false);
    this.doubleMark?.setVisible(false);
    this.player.body.enable = false;
    this.player.body.setVelocity(0, 0);
    this.player.body.setAllowGravity(false);
    getSynth().play('death');
    // 死亡只播碎裂音效。背景音乐继续当前进度，不从头开始。
    if (this.endless) this.refreshEndlessHud();
    else this.hud.setStats(this.run);
    const token = this._deathToken;
    const started = this.deathFx.play(x, y, () => {
      if (token !== this._deathToken || !this.player?.body) return;
      this.finishDeath();
    });
    // 特效没播起来就不要把人留在半空，直接重生。
    if (!started) this.finishDeath();
  }

  /** 碎裂结束。闯关回到存档点，无尽模式直接结算，不重生。 */
  finishDeath() {
    if (this.endless) {
      this.finishEndless();
      return;
    }
    const y = playerGroundY();
    this.player.setVisible(true);
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
  }

  onStar(star) {
    if (!star.active) return;
    const result = noteStar(this.run, star.getData('id'));
    this.run = result.state;
    if (!result.picked) return;
    star.disableBody(true, true);
    getSynth().play('star');
    if (this.endless) this.refreshEndlessHud();
    else this.hud.setStats(this.run);
  }

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
  }

  /** 闯关里的道具。重叠先于障碍注册，同一帧吃到炸弹不会先被刺死。 */
  mountCampaignPowerups() {
    const items = this.level.powerups || [];
    this.powerGroup = this.physics.add.staticGroup();
    this.physics.add.overlap(this.player, this.powerGroup, (_player, sprite) => this.onPowerup(sprite), null, this);
    for (let i = 0; i < items.length; i += 1) {
      const sprite = spawnPowerupSprite(this, items[i]);
      this.powerGroup.add(sprite);
      this.powerSprites.push(sprite);
    }
  }

  onPowerup(sprite) {
    if (!sprite?.active || sprite.getData('used') || this.won || this.dying) return;
    const type = sprite.getData('type');
    sprite.setData('used', true);
    sprite.disableBody(true, true);
    const index = this.powerSprites.indexOf(sprite);
    if (index >= 0) this.powerSprites.splice(index, 1);
    if (type === 'bomb' || type === 'plane') this._touchGuard = true;
    this._powerQueue.push(type);
  }

  /** 物理回调里只记账，清障碍放到这一帧的 update，避免刚体还在遍历时被拆掉。 */
  flushPowerQueue() {
    const queue = this._powerQueue;
    if (!queue.length) {
      this._touchGuard = false;
      return;
    }
    this._powerQueue = [];
    let bomb = false;
    let other = false;
    for (let i = 0; i < queue.length; i += 1) {
      const granted = grantPower(this.power, queue[i], this.powerClock);
      this.power = granted.state;
      if (granted.bomb) {
        this.detonateBomb();
        bomb = true;
      } else {
        other = true;
      }
    }
    this._touchGuard = false;
    if (bomb) getSynth().play('bomb');
    if (other) getSynth().play('pickup');
  }

  advancePower() {
    const prev = this.power.phase;
    this.power = tickPower(this.power, this.powerClock);
    if (prev !== 'land' && this.power.phase === 'land') this.beginPlaneLanding();
    if (this.power.kind === 'double' && this.isGrounded()) this.power = noteLand(this.power);
    this.powerHud?.sync(this.power, this.powerClock);
  }

  detonateBomb() {
    const cfg = POWERUP_CONFIG.bomb;
    const { removed } = clearSpan(this.level.obstacles, this.player.x - cfg.behind, this.player.x + cfg.range);
    const points = removeObstacles(this, removed);
    this.blastFx?.play({ x: this.player.x + 72, y: this.player.y - 8 }, points);
  }

  /** 落地前清掉脚要落下去的那一段可炸障碍。平台留着。 */
  beginPlaneLanding() {
    const speed = Math.max(1, this.runSpeed());
    const span = landingClearWindow(this.player.x, speed);
    const { removed } = clearSpan(this.level.obstacles, span.x0, span.x1);
    const points = removeObstacles(this, removed);
    this._landFromY = this.player.y;
    if (points.length) this.blastFx?.play({ x: this.player.x, y: this.player.y }, points);
  }

  /** 飞机先升到巡航高度，时间到了再按同一条曲线落到地面。 */
  applyPlaneMotion(delta) {
    const body = this.player?.body;
    if (!body) return;
    if (this.power.kind !== 'plane') {
      if (!this._planeHeld) return;
      this._planeHeld = false;
      this._landFromY = null;
      body.setAllowGravity(true);
      const ground = playerGroundY();
      if (!this._inFlip && this.player.y > ground - 28 && this.player.y <= ground + 6) {
        this.player.setPosition(this.player.x, ground);
        body.updateFromGameObject();
        body.setVelocity(this.runSpeed(), 0);
      }
      return;
    }
    this._planeHeld = true;
    body.setAllowGravity(false);
    body.setGravityY(0);
    const ground = playerGroundY();
    const cruise = flightCenterY();
    let y = this.player.y;
    if (this.power.phase === 'land') {
      if (this._landFromY == null) this._landFromY = y;
      const dur = POWERUP_CONFIG.plane.landDuration;
      const t = (this.powerClock - (this.power.landEndsAt - dur)) / dur;
      y = landingY(this._landFromY, ground, t);
    } else {
      this._landFromY = null;
      const k = 1 - Math.exp(-(delta || 16) / 140);
      y += (cruise - y) * k;
    }
    this.player.setPosition(this.player.x, y);
    body.updateFromGameObject();
    body.setVelocity(this.runSpeed(), 0);
    body.setAllowGravity(false);
    this.rotating = false;
    this.player.angle = 0;
  }

  /** 飞行高度够不着地面星星的碰撞盒，这里按距离再收一次。 */
  collectPlaneStars() {
    if (this.power.kind !== 'plane') return;
    const catchX = POWERUP_CONFIG.plane.starCatchX;
    const reach = POWERUP_CONFIG.plane.starReach;
    const px = this.player.x;
    const py = this.player.y;
    const stars = this.starSprites || [];
    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      if (!star.active) continue;
      if (Math.abs(star.x - px) <= catchX && Math.abs(star.y - py) <= reach) this.onStar(star);
    }
  }

  syncPowerIcons() {
    const plane = this.power.kind === 'plane';
    const doubled = this.power.kind === 'double';
    if (this.ride) {
      this.ride.setVisible(plane);
      if (plane) this.ride.setPosition(this.player.x, this.player.y + 2);
    }
    if (this.doubleMark) {
      this.doubleMark.setVisible(doubled);
      if (doubled) this.doubleMark.setPosition(this.player.x, this.player.y - 34);
    }
  }

  update(_time, delta) {
    this.suppressJump = false;
    this.deathFx?.update(delta);
    this.blastFx?.update(delta);
    // 碎裂的这半秒里方块停在原地，特效结束再继续跑。
    if (!this.player || this.won || this.dying) return;

    this.elapsedMs += delta;
    this.powerClock += delta / 1000;
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
    const layout = this.hud?.relayout({ viewWidth: viewW, viewHeight: viewH, insets });
    this.powerHud?.relayout(layout);
    this.deathFx?.layoutFlash();
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
