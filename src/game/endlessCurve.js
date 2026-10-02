/**
 * 无尽模式的难度和跑速。只改这一份就能调手感。
 * 跳跃高度和重力不在这里，闯关的速度也不读这里。
 *
 * 距离用像素。速度在每一段开头取一次，段内保持不变，避免起跳落到一半时速度突变。
 * 段和段之间留出比一次滞空更长的地面，保证上一段的跳跃落完再进下一段。
 */

/** 一次完整起跳的滞空大约 0.87 秒。衔接空档必须比它长。 */
export const SAFE_GAP = 1.05;

export const ENDLESS_CURVE = {
  // 开局先空跑一会儿，再接最疏的地面片段。
  introSeconds: 3.6,
  // 热身结束前只用最简单的片段，跑速也停在起步值。
  warmupDistance: 5400,
  // 和第 1 关相同的起步速度。封顶高于第 20 关，但不再往上加。
  baseSpeed: 318,
  maxSpeed: 468,
  // 热身之后，再跑这么远，速度才到封顶。
  rampDistance: 42000,
  // 片段之间的地面空档，随进度变短，但不短于 SAFE_GAP。
  gapStart: 1.72,
  gapEnd: SAFE_GAP,
  // 一组连续片段的个数。越往后，一组里的片段越多，中间只留最短空档。
  chainStart: 1,
  chainEnd: 4,
  // 一组结束之后多留的喘息，同样随进度变短。
  breatherStart: 2.05,
  breatherEnd: 1.2,
};

/** 热身之后的进度，0 到 1。到 1 时跑速和难度都到顶。 */
export function endlessProgress(distancePx) {
  const curve = ENDLESS_CURVE;
  if (distancePx <= curve.warmupDistance) return 0;
  const t = (distancePx - curve.warmupDistance) / curve.rampDistance;
  return Math.max(0, Math.min(1, t));
}

/** 这段开头要用的水平速度。热身期间不加速。 */
export function endlessSpeed(distancePx) {
  const curve = ENDLESS_CURVE;
  const progress = endlessProgress(distancePx);
  // smoothstep，起步和封顶附近变化更慢。
  const shaped = progress * progress * (3 - 2 * progress);
  const speed = curve.baseSpeed + (curve.maxSpeed - curve.baseSpeed) * shaped;
  return Math.round(speed * 10) / 10;
}

/** 当前距离允许抽取的难度档。数字越大，障碍越密、上层路越多。 */
export function tierRange(distancePx) {
  if (distancePx < ENDLESS_CURVE.warmupDistance) return { min: 0, max: 0 };
  const progress = endlessProgress(distancePx);
  if (progress > 0.84) return { min: 3, max: 4 };
  if (progress > 0.58) return { min: 2, max: 4 };
  if (progress > 0.3) return { min: 1, max: 3 };
  return { min: 0, max: 1 };
}

/** 这一组要连着放几个片段。 */
export function chainLength(distancePx) {
  const curve = ENDLESS_CURVE;
  const progress = endlessProgress(distancePx);
  const span = curve.chainEnd - curve.chainStart;
  return curve.chainStart + Math.floor(progress * span + 1e-6);
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

/** 两个片段之间的空档。速度刚变过时不短于安全值。 */
export function stitchGap(distancePx) {
  const curve = ENDLESS_CURVE;
  return Math.max(SAFE_GAP, lerp(curve.gapStart, curve.gapEnd, endlessProgress(distancePx)));
}

/** 一组片段跑完之后的喘息。 */
export function breatherGap(distancePx) {
  const curve = ENDLESS_CURVE;
  const gap = lerp(curve.breatherStart, curve.breatherEnd, endlessProgress(distancePx));
  return Math.max(stitchGap(distancePx), gap);
}
