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
