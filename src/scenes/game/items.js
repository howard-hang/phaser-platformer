/**
 * 道具和星星。拾取、护甲、飞机清场、星星结算。从 GameScene 原样搬出，逻辑不变。
 */
import { getSynth } from '../../game/audio.js';
import { feedback } from '../../game/haptics.js';
import { removeObstacles } from '../../game/hazardClear.js';
import { POWERUP_CONFIG } from '../../game/powerupConfig.js';
import { destroyPowerupLabel, spawnPowerupSprite } from '../../game/powerupActor.js';
import {
  breakArmor,
  clearSpan,
  grantPower,
  landingClearWindow,
  noteLand,
  tickPower,
} from '../../logic/powerups.js';
import { noteStar } from '../../logic/rules.js';

export const itemMethods = {
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
      const label = sprite.getData('label');
      if (!near) {
        if (label?.active) label.setVisible(false);
        continue;
      }
      sprite.y = sprite.getData('baseY') + bob;
      sprite.refreshBody();
      if (label?.active) {
        label.setVisible(true);
        label.setPosition(sprite.x, sprite.y - 30);
      }
    }
  },

  onStar(star) {
    if (!star.active) return;
    const result = noteStar(this.run, star.getData('id'));
    this.run = result.state;
    if (!result.picked) return;
    star.disableBody(true, true);
    getSynth().play('star');
    if (this.endless) this.refreshEndlessHud();
    else this.hud.setStats(this.run);
  },

  /** 闯关里的道具。重叠先于障碍注册，同一帧吃到飞机或护甲不会先被刺死。 */
  mountCampaignPowerups() {
    const items = this.level.powerups || [];
    this.powerGroup = this.physics.add.staticGroup();
    this.physics.add.overlap(this.player, this.powerGroup, (_player, sprite) => this.onPowerup(sprite), null, this);
    for (let i = 0; i < items.length; i += 1) {
      const sprite = spawnPowerupSprite(this, items[i]);
      this.powerGroup.add(sprite);
      this.powerSprites.push(sprite);
    }
  },

  onPowerup(sprite) {
    if (!sprite?.active || sprite.getData('used') || this.won || this.dying) return;
    const type = sprite.getData('type');
    sprite.setData('used', true);
    destroyPowerupLabel(sprite);
    sprite.disableBody(true, true);
    const index = this.powerSprites.indexOf(sprite);
    if (index >= 0) this.powerSprites.splice(index, 1);
    if (type === 'plane' || type === 'armor') this._touchGuard = true;
    this._powerQueue.push(type);
  },

  /** 物理回调里只记账。效果放到这一帧的 update，避免刚体还在遍历时被拆掉。 */
  flushPowerQueue() {
    const queue = this._powerQueue;
    if (!queue.length) {
      this._touchGuard = false;
      return;
    }
    this._powerQueue = [];
    for (let i = 0; i < queue.length; i += 1) {
      const granted = grantPower(this.power, queue[i], this.powerClock);
      this.power = granted.state;
    }
    this._touchGuard = false;
    getSynth().play('pickup');
    feedback('pickup');
  },

  /** 护罩碎掉。这一次不死，接着跑，并留下短暂无敌。 */
  shatterArmor() {
    const x = this.player.x;
    const y = this.player.y;
    this.power = breakArmor(this.power, this.powerClock);
    this.shield?.setVisible(false);
    this.runnerFx?.shatter(x, y);
    getSynth().play('armor');
    feedback('armor');
  },

  advancePower() {
    const prev = this.power.phase;
    this.power = tickPower(this.power, this.powerClock);
    if (prev !== 'land' && this.power.phase === 'land') this.beginPlaneLanding();
    if (this.power.kind === 'double' && this.isGrounded()) this.power = noteLand(this.power);
    this.powerHud?.sync(this.power, this.powerClock);
  },

  /** 落地前清掉脚要落下去的那一段可拆障碍。平台留着。 */
  beginPlaneLanding() {
    const speed = Math.max(1, this.runSpeed());
    const span = landingClearWindow(this.player.x, speed);
    const { removed } = clearSpan(this.level.obstacles, span.x0, span.x1);
    const points = removeObstacles(this, removed);
    this._landFromY = this.player.y;
    if (points.length) this.blastFx?.play({ x: this.player.x, y: this.player.y }, points);
  },

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
  },

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
  },
};
