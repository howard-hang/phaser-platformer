/**
 * 把剧本展开成障碍、星星和存档点。
 * 坐标按每一关自己的速度换算，跳跃高度和重力仍用 TUNING，不在这里改。
 */
import { LEVEL_DEFS } from './levelData.js';
import { HITBOX, TUNING, phaseForLaser, phaseForMover } from '../logic/world.js';

const START_X = 240;

function buildLevel(def, index) {
  const speed = def.speed;
  const xAt = (t) => Math.round(START_X + t * speed);
  const obstacles = [];
  const stars = [];
  const pads = [];
  const checkpoints = [START_X];

  def.script.forEach((event, order) => {
    if (event.type === 'spike') {
      const spec = HITBOX.spike;
      const left = xAt(event.t);
      const count = event.count || 1;
      for (let i = 0; i < count; i += 1) {
        obstacles.push({
          id: `${def.id}-spike-${order}-${i}`,
          type: 'spike',
          x: left + spec.w / 2 + i * spec.w,
        });
      }
      return;
    }
    if (event.type === 'block') {
      const spec = HITBOX.block;
      obstacles.push({
        id: `${def.id}-block-${order}`,
        type: 'block',
        x: xAt(event.t) + spec.w / 2,
      });
      return;
    }
    if (event.type === 'overhead') {
      const spec = HITBOX.block;
      obstacles.push({
        id: `${def.id}-over-${order}`,
        type: 'overhead',
        x: xAt(event.t) + spec.w / 2,
        // 底边离地的空隙。站着能钻过去，跳起来会撞上。
        gap: event.gap ?? 58,
      });
      return;
    }
    if (event.type === 'ceiling') {
      const spec = HITBOX.ceiling;
      obstacles.push({
        id: `${def.id}-ceil-${order}`,
        type: 'ceiling',
        x: xAt(event.t) + spec.w / 2,
        hang: event.hang ?? 48,
      });
      return;
    }
    if (event.type === 'mover') {
      const spec = event.style === 'block' ? HITBOX.block : HITBOX.spike;
      const period = event.period ?? 1.8;
      const x = xAt(event.t) + spec.w / 2;
      const meet = (x - START_X) / speed;
      obstacles.push({
        id: `${def.id}-move-${order}`,
        type: 'mover',
        x,
        style: event.style === 'block' ? 'block' : 'spike',
        amplitude: event.amplitude ?? 96,
        period,
        phase: phaseForMover(meet, period, event.at === 'up' ? 'up' : 'down'),
      });
      return;
    }
    if (event.type === 'laser') {
      const high = event.band === 'high';
      const spec = high ? HITBOX.laserHigh : HITBOX.laserLow;
      const period = event.period ?? 1.8;
      const duty = event.duty ?? 0.62;
      const x = xAt(event.t) + spec.w / 2;
      const meet = (x - START_X) / speed;
      obstacles.push({
        id: `${def.id}-laser-${order}`,
        type: 'laser',
        x,
        band: high ? 'high' : 'low',
        period,
        duty,
        phase: phaseForLaser(meet, period, event.on !== false, duty),
        lift: event.lift ?? 112,
      });
      return;
    }
    if (event.type === 'pad') {
      const spec = HITBOX.pad;
      pads.push({
        id: `${def.id}-pad-${pads.length + 1}`,
        x: xAt(event.t) + spec.w / 2,
      });
      return;
    }
    if (event.type === 'star') {
      stars.push({
        id: `${def.id}-star-${stars.length + 1}`,
        x: xAt(event.t) + (event.dx || 0),
        lift: event.lift || 0,
      });
      return;
    }
    if (event.type === 'checkpoint') {
      checkpoints.push(xAt(event.t));
    }
  });

  checkpoints.sort((a, b) => a - b);
  const finishX = xAt(def.duration);
  return {
    id: def.id,
    name: def.name,
    index,
    speed,
    palette: def.palette,
    startX: START_X,
    finishX,
    // 终点后再留一屏，摄像机不会把终点门卡在边缘。
    worldWidth: finishX + TUNING.viewWidth,
    checkpoints,
    obstacles,
    pads,
    stars,
  };
}

export const LEVELS = LEVEL_DEFS.map((def, index) => buildLevel(def, index + 1));

/** 第一关。旧调用点还能用它。 */
export const LEVEL = LEVELS[0];

export function getLevel(id) {
  return LEVELS.find((level) => level.id === id) || null;
}

export function nextLevel(id) {
  const index = LEVELS.findIndex((level) => level.id === id);
  if (index < 0 || index + 1 >= LEVELS.length) return null;
  return LEVELS[index + 1];
}

/** 只替换水平速度。重力和起跳速度保持全局手感。 */
export function levelTuning(level) {
  return { ...TUNING, speed: level.speed ?? TUNING.speed };
}
