/**
 * 障碍和跑道。地面、尖刺、门、坠落平台、反转区、上层路，以及无尽路段的装卸。从 GameScene 原样搬出，逻辑不变。
 */
import {
  ensureAhead,
  recycleBehind,
  viewEndless,
} from '../../game/endlessCourse.js';
import {
  createEndlessGround,
  createEndlessGroups,
  mountEndlessPiece,
  unmountEndlessPiece,
} from '../../game/endlessActors.js';
import { THEME } from '../../game/theme.js';
import { textStyle } from '../../game/candy.js';
import { t } from '../../i18n/index.js';
import {
  TUNING,
  HITBOX,
  FLIP_CEILING_Y,
  obstaclePose,
  isGateClosed,
  starPose,
} from '../../logic/world.js';
import { applyHitbox } from './physics.js';

export const courseMethods = {
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
    this.add.text(this.level.startX + 300, TUNING.groundY - 110, t('hint.jump'), textStyle({
      size: 26,
      color: '#ffffff',
      stroke: '#2a0840',
      strokeThickness: 4,
    })).setDepth(7);
  },

  createEndlessGround() {
    createEndlessGround(this);
  },

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
  },

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
  },

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

    this.add.text(this.level.startX + 300, TUNING.groundY - 110, t('hint.jump'), textStyle({
      size: 26,
      color: '#ffffff',
      stroke: '#2a0840',
      strokeThickness: 4,
    })).setDepth(7);

    this.mountCampaignPowerups();
    this.physics.add.overlap(this.player, this.hazardSprites, (_player, sprite) => this.onHazard(sprite), null, this);
    this.physics.add.overlap(this.player, this.starSprites, (_player, star) => this.onStar(star), null, this);
    this.createDecks();
  },

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
  },

  /** 只有从上面落下来才站上平台，避免从底下被顶住。飞行时穿过去，免得被平台截住。 */
  canLandOnDeck(plat) {
    if (this.power?.kind === 'plane') return false;
    const body = this.player?.body;
    const deck = plat.getData('deck');
    if (!body || !deck || body.velocity.y < 0) return false;
    const time = this.courseNow();
    if (deck.collapse != null && time >= deck.collapse) return false;
    return body.bottom <= deck.top + 10;
  },

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
  },

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
    kill.setData('pit', true);
    this.hazardSprites.push(kill);
    this.crumbles.push({
      obstacle,
      tiles,
      kill,
      baseY,
      x0: obstacle.x0,
      x1: obstacle.x1,
    });
  },

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
  },

  createFinish() {
    const x = this.level.finishX;
    this.add.rectangle(x, TUNING.groundY - 78, 8, 156, THEME.finish).setDepth(6);
    this.add.rectangle(x + 46, TUNING.groundY - 78, 8, 156, THEME.finish).setDepth(6);
    this.add.text(x + 23, TUNING.groundY - 180, t('hint.finish'), textStyle({
      size: 28,
      color: '#ffe14a',
      stroke: '#3b0764',
      strokeThickness: 5,
    })).setOrigin(0.5).setDepth(6);
  },

  /** 已经经过的存档点亮黄旗，其余保持青色。 */
  refreshCheckpointFlags() {
    for (const flag of this.flags) {
      const lit = flag.x <= this.activeCheckpoint;
      flag.cloth.setFillStyle(lit ? THEME.checkpointLit : THEME.checkpoint);
    }
  },
};
