/**
 * 把一份关卡 JSON 展开成障碍、星星和存档点。
 * 坐标按这一关自己的速度换算。跳跃高度和重力仍用 TUNING，不在这里改。
 */
import { LEVEL_PALETTES } from './theme.js';
import { HITBOX, TUNING } from '../logic/world.js';

export const START_X = 240;

/** def 必须先通过 validateLevel。index 从 1 开始。 */
export function compileLevel(def, index) {
  const speed = def.speed;
  const xAt = (t) => Math.round(START_X + t * speed);
  const obstacles = [];
  const flips = [];

  def.obstacles.forEach((event, order) => {
    if (event.type === 'spike') {
      const type = event.anchor === 'ceiling' ? 'cspike' : 'spike';
      const spec = HITBOX.spike;
      const left = xAt(event.t);
      const count = event.count || 1;
      for (let i = 0; i < count; i += 1) {
        obstacles.push({
          id: `${def.id}-${type}-${order}-${i}`,
          type,
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
    if (event.type === 'gate') {
      const spec = HITBOX.block;
      obstacles.push({
        id: `${def.id}-gate-${order}`,
        type: 'gate',
        x: xAt(event.t) + spec.w / 2,
        period: event.period,
        open: event.open,
        phase: event.phase || 0,
      });
      return;
    }
    if (event.type === 'crumble') {
      const x0 = xAt(event.t);
      const x1 = xAt(event.t + event.span);
      obstacles.push({
        id: `${def.id}-crumble-${order}`,
        type: 'crumble',
        x: x0,
        x0,
        x1,
        // 从起点算的绝对时间。跑到这里之前平台还在，之后变成地面上的坑。
        collapse: event.t + event.delay,
        delay: event.delay,
        span: event.span,
      });
      return;
    }
    if (event.type === 'flip') {
      const x0 = xAt(event.t);
      const x1 = xAt(event.t + event.span);
      const id = `${def.id}-flip-${order}`;
      flips.push({ id, x0, x1 });
      obstacles.push({ id, type: 'flip', x: x0, x0, x1 });
    }
  });

  const stars = def.stars.map((event, starIndex) => ({
    id: `${def.id}-star-${starIndex + 1}`,
    x: xAt(event.t) + (event.dx || 0),
    lift: event.lift || 0,
  }));

  const checkpoints = [START_X];
  for (const t of def.checkpoints) checkpoints.push(xAt(t));
  checkpoints.sort((a, b) => a - b);

  const finishX = xAt(def.duration);
  const palette = LEVEL_PALETTES.findIndex((item) => item.id === def.palette);
  return {
    id: def.id,
    name: def.name,
    index,
    speed,
    palette,
    paletteId: def.palette,
    startX: START_X,
    finishX,
    // 终点后再留一屏，摄像机不会把终点门卡在边缘。
    worldWidth: finishX + TUNING.viewWidth,
    checkpoints,
    obstacles,
    stars,
    flips,
  };
}
