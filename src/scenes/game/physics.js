/**
 * 物理和跑动显示。刚体外推、贴地判定、反重力、飞机高度。从 GameScene 原样搬出，逻辑不变。
 */
import {
  displayPose,
  stepRunnerVisual,
} from '../../game/motion.js';
import { planDustEmits } from '../../game/dust.js';
import {
  currentSettings,
  fxProfile,
} from '../../game/settings.js';
import { POWERUP_CONFIG } from '../../game/powerupConfig.js';
import {
  TUNING,
  HITBOX,
  FLIP_CEILING_Y,
  playerCeilingY,
  playerGroundY,
  courseTime,
  speedAtX,
} from '../../logic/world.js';
import {
  flightCenterY,
  landingY,
} from '../../logic/powerups.js';


/** 按共享碰撞盒缩紧刚体。静态和动态物体都走这里。 */
export function applyHitbox(sprite, spec) {
  sprite.body.setSize(spec.bodyW, spec.bodyH, false);
  sprite.body.setOffset(spec.offsetX, spec.offsetY);
}

export const physicsMethods = {
  /** 把上一帧为了显示而外推的坐标还原成刚体位置。 */
  restorePhysicsPose() {
    const pose = this._physicsPose;
    if (!pose || !this.player) return;
    this.player.setPosition(pose.x, pose.y);
    this.player.angle = pose.angle;
  },

  /** 刚体已经同步完，按剩余时间把方块画到两次物理步之间。 */
  extrapolatePlayerPose() {
    if (this.dying || this.won || this._simHeld) return;
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
    this.player.angle = 0;
    this.syncRunnerVisual();
  },

  /** 贴图跟着外推后的方块走。缩放和转角不写回刚体。 */
  syncRunnerVisual() {
    const visual = this.runner;
    if (!visual) return;
    const held = this.power?.kind === 'plane';
    const dt = (this.game.loop.delta || 16) / 1000;
    const next = stepRunnerVisual(this._runnerVisual, {
      grounded: this.isGrounded(),
      vy: this.player.body?.velocity.y || 0,
      dt,
      held,
    });
    this._runnerVisual = next;
    const profile = fxProfile(currentSettings().fx);
    if (!held) {
      // 地面持续撒，起跳和落地多撒一撮。倒挂在天花板上不撒，空中也不撒。
      const plan = planDustEmits({
        grounded: !!next.grounded && !this._inFlip,
        burst: this._inFlip ? null : next.burst,
        rate: profile.dustPerSec,
        burstCount: profile.burst,
        dt,
        carry: this._dustCarry || 0,
      });
      this._dustCarry = plan.carry;
      if (plan.count > 0) this.runnerFx?.emit(this.player.x, this.player.y, plan.count);
    } else {
      this._dustCarry = 0;
    }
    visual.setPosition(this.player.x, this.player.y);
    // 方块保持正方形，不跟着跑动压扁，也不在空中旋转。
    visual.setScale(1, 1);
    visual.setAngle(0);
    const flicker = !this.power?.kind
      && this.power?.invulnUntil > this.powerClock
      && Math.floor(this.powerClock * 16) % 2 === 0;
    visual.setAlpha(flicker ? 0.35 : 1);
    if (this.shield) {
      const armed = this.power?.kind === 'armor' && visual.visible;
      this.shield.setVisible(armed);
      if (armed) this.shield.setPosition(this.player.x, this.player.y);
    }
    this.syncPowerIcons();
  },

  /** 当前水平速度。无尽模式按分段取，闯关就是这一关的速度。 */
  runSpeed() {
    if (!this.player) return this.tuning.speed;
    return speedAtX(this.player.x, this.level, this.tuning);
  },

  /** 跑到当前位置的关卡时间。机关的开合和平台塌陷都用它。 */
  courseNow() {
    if (!this.player) return 0;
    return courseTime(this.player.x, this.level, this.tuning);
  },

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
  },

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
  },

  createPlayer() {
    const y = playerGroundY();
    this.player = this.physics.add.sprite(this.level.startX, y, 'player');
    this.player.setDepth(8);
    applyHitbox(this.player, HITBOX.player);
    this.player.body.updateFromGameObject();
    this.player.body.setVelocityX(this.runSpeed());
    this.physics.add.collider(this.player, this.ground);
    // 碰撞体不缩放、不旋转。看得见的方块是另一张同尺寸贴图，只负责彩色灰尘。
    this.player.setVisible(false);
    this.runner = this.add.image(this.level.startX, y, 'player').setDepth(8);
    this.shield = this.add.image(this.level.startX, y, 'armor-shield').setDepth(9).setVisible(false);
    // 翅膀和二段跳标记跟着方块，没有道具时不画。
    this.ride = this.add.image(0, 0, 'ride-wings').setDepth(7).setVisible(false);
    this.doubleMark = this.add.image(0, 0, 'power-double').setDepth(10).setVisible(false).setDisplaySize(28, 28);

    // 偏移让方块停在画面偏左，前方留出反应距离。垂直方向由边界锁死，跳跃不会把镜头抬起来。
    this.cameras.main.startFollow(this.player, true, 1, 1, -240, 0);
  },

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
  },

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
  },

  /** 物理步钩子。方块不再空中转圈，这里不再改角度。 */
  onWorldStep() {
    // 以前在这里把刚体转到 360 度。现在贴图保持正的，碰撞盒也不转。
  },

  /**
   * 飞机先升到巡航高度，时间到了再按同一条曲线落到地面。
   * 场景 update 在物理步之后、postUpdate 之前。这时精灵 x 还是步前的坐标。
   * 如果用 updateFromGameObject 把精灵写回刚体，这一步的水平位移会被抹掉，方块和镜头就停住。
   * 所以只改刚体的 y，水平速度保持跑速，等 postUpdate 把 dx 加回精灵。
   */
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
        this.shiftBodyY(body, ground);
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
    this.shiftBodyY(body, y);
    body.setVelocity(this.runSpeed(), 0);
    body.setAllowGravity(false);
    this.rotating = false;
    this.player.angle = 0;
  },

  /** 只改刚体高度。水平位置留给已经积分完的这一步。 */
  shiftBodyY(body, spriteY) {
    body.y = body.prevFrame.y + (spriteY - this.player.y);
    body.updateCenter();
  },
};
