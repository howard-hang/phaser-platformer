/**
 * 显示位置外推。
 * 物理仍按固定步长积分；两次积分之间，用当前速度把方块往前画一小段。
 * extraMs 为 0 时（刚好落在物理步上）显示位置就是刚体位置，60Hz 下和原来一致。
 */

/**
 * @param {{ x: number, y: number, angle: number }} pose 刚体对应的精灵坐标
 * @param {{ x: number, y: number }} velocity 像素/秒
 * @param {number} extraMs 距离下一次物理步还剩的时间
 * @param {number} stepMs 一个物理步的毫秒数
 * @param {{ rotating: boolean, spinMs: number, groundCenter: number }} options
 */
export function displayPose(pose, velocity, extraMs, stepMs, options) {
  const extra = Math.max(0, extraMs);
  const extraSec = extra / 1000;
  let x = pose.x + velocity.x * extraSec;
  let y = pose.y + velocity.y * extraSec;

  // 下落的这一小段还没被物理落地修正，先别把脚画进地平线下面。
  if (velocity.y > 0 && y > options.groundCenter) {
    y = options.groundCenter;
  }

  let angle = pose.angle;
  if (options.rotating && options.spinMs > 0 && stepMs > 0) {
    const stepDeg = 360 * (stepMs / options.spinMs);
    angle = Math.min(360, pose.angle + stepDeg * (extra / stepMs));
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    angle,
  };
}

/**
 * 白方块的挤压和空中转角。只给贴图用，碰撞体保持原尺寸。
 * 起跳拉长，落地压扁，奔跑时轻轻起伏，空中慢慢转。
 */
export function stepRunnerVisual(prev, { grounded, vy, dt, held }) {
  const step = Math.max(0, dt || 0);
  const wasGrounded = !!prev?.grounded;
  const phase = (prev?.phase || 0) + step;
  let land = prev?.land || 0;
  let angle = prev?.angle || 0;
  let puff = false;
  if (held) {
    return {
      phase, land: 0, angle: 0, scaleX: 1, scaleY: 1, puff: false, grounded: !!grounded, trail: false,
    };
  }
  if (!grounded) {
    angle += 110 * step;
    land = 0;
  } else {
    if (!wasGrounded) {
      land = 0.12;
      puff = true;
    }
    angle = 0;
    land = Math.max(0, land - step);
  }
  let scaleX = 1;
  let scaleY = 1;
  if (!grounded) {
    const rising = vy < -30;
    scaleY = rising ? 1.16 : 1.08;
    scaleX = rising ? 0.86 : 0.94;
  } else if (land > 0) {
    const t = land / 0.12;
    scaleY = 1 + (0.78 - 1) * t;
    scaleX = 1 + (1.22 - 1) * t;
  } else {
    const bob = Math.sin(phase * 20);
    scaleY = 1 + bob * 0.08;
    scaleX = 1 - bob * 0.06;
  }
  return {
    phase,
    land,
    angle,
    scaleX,
    scaleY,
    puff,
    grounded: !!grounded,
    trail: grounded && land <= 0,
  };
}
