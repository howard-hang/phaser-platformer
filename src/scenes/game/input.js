/**
 * 点击、触屏和键盘起跳。从 GameScene 原样搬出，逻辑不变。
 */
import { getSynth } from '../../game/audio.js';
import { isUiPointer } from '../../game/hud.js';
import { TUNING } from '../../logic/world.js';
import {
  canAirJump,
  noteAirJump,
  resolveJump,
} from '../../logic/powerups.js';

export const inputMethods = {
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
  },

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
    this.rotating = false;
    this.airMs = 0;
    this.player.angle = 0;
    getSynth().play('jump');
  },
};
