/**
 * 把一份关卡 JSON 展开成障碍、星星、存档点和上层平台。
 * 坐标按这一关自己的速度换算。跳跃高度和重力仍用 TUNING，不在这里改。
 */
import { LEVEL_PALETTES } from './theme.js';
import { HITBOX, TUNING } from '../logic/world.js';

export const START_X = 240;

function pushSpike(obstacles, def, order, event, rise, tag) {
  const type = event.anchor === 'ceiling' ? 'cspike' : 'spike';
  const spec = HITBOX.spike;
  const left = Math.round(START_X + event.t * def.speed);
  const count = event.count || 1;
  for (let i = 0; i < count; i += 1) {
    obstacles.push({
      id: `${def.id}-${tag}${type}-${order}-${i}`,
      type,
      x: left + spec.w / 2 + i * spec.w,
      rise,
    });
  }
}

function pushBlockLike(obstacles, def, order, event, rise, tag) {
  const spec = HITBOX.block;
  const x = Math.round(START_X + event.t * def.speed) + spec.w / 2;
  if (event.type === 'block') {
    obstacles.push({
      id: `${def.id}-${tag}block-${order}`,
      type: 'block',
      x,
      rise,
    });
    return;
  }
  if (event.type === 'overhead') {
    obstacles.push({
      id: `${def.id}-${tag}over-${order}`,
      type: 'overhead',
      x,
      // 底边离所在表面的空隙。站着能钻过去，跳起来会撞上。
      gap: event.gap ?? 58,
      rise,
    });
    return;
  }
  if (event.type === 'gate') {
    obstacles.push({
      id: `${def.id}-${tag}gate-${order}`,
      type: 'gate',
      x,
      period: event.period,
      open: event.open,
      phase: event.phase || 0,
      rise,
    });
  }
}

/** 把一条障碍事件展开进列表。rise 是这条事件所在平台的离地高度。 */
function appendEvents(obstacles, flips, def, events, rise, tag) {
  events.forEach((event, order) => {
    if (event.type === 'spike') {
      pushSpike(obstacles, def, order, event, rise, tag);
      return;
    }
    if (event.type === 'block' || event.type === 'overhead' || event.type === 'gate') {
      pushBlockLike(obstacles, def, order, event, rise, tag);
      return;
    }
    if (event.type === 'crumble') {
      const x0 = Math.round(START_X + event.t * def.speed);
      const x1 = Math.round(START_X + (event.t + event.span) * def.speed);
      obstacles.push({
        id: `${def.id}-${tag}crumble-${order}`,
        type: 'crumble',
        x: x0,
        x0,
        x1,
        // 从起点算的绝对时间。跑到这里之前平台还在，之后变成地面上的坑。
        collapse: event.t + event.delay,
        delay: event.delay,
        span: event.span,
        rise: 0,
      });
      return;
    }
    if (event.type === 'flip') {
      const x0 = Math.round(START_X + event.t * def.speed);
      const x1 = Math.round(START_X + (event.t + event.span) * def.speed);
      const id = `${def.id}-${tag}flip-${order}`;
      flips.push({ id, x0, x1 });
      obstacles.push({ id, type: 'flip', x: x0, x0, x1 });
    }
  });
}

/** def 必须先通过 validateLevel。index 从 1 开始。 */
export function compileLevel(def, index) {
  const speed = def.speed;
  const xAt = (t) => Math.round(START_X + t * speed);
  const obstacles = [];
  const flips = [];
  const decks = [];
  const routes = [];

  appendEvents(obstacles, flips, def, def.obstacles, 0, '');

  (def.routes || []).forEach((route, routeIndex) => {
    const deckId = `${def.id}-route-${routeIndex}`;
    const x0 = xAt(route.t);
    const x1 = xAt(route.t + route.span);
    const layer = route.layer || 2;
    decks.push({
      id: deckId,
      x0,
      x1,
      top: TUNING.groundY - route.h,
      h: route.h,
      layer,
      kind: 'route',
      fork: routeIndex,
    });
    routes.push({
      id: deckId,
      deckId,
      fork: routeIndex,
      layer,
      h: route.h,
      reward: route.reward || 'safe',
      x0,
      x1,
    });
    if (route.step) {
      const lead = route.step.lead || 0;
      const stepId = `${def.id}-step-${routeIndex}`;
      decks.push({
        id: stepId,
        x0: xAt(route.t - lead),
        x1: xAt(route.t - lead + route.step.span),
        top: TUNING.groundY - route.step.h,
        h: route.step.h,
        layer: 1,
        kind: 'step',
        fork: routeIndex,
      });
    }
    if (route.high) {
      const lead = route.high.lead || 0;
      const highId = `${def.id}-high-${routeIndex}`;
      const hx0 = xAt(route.t + lead);
      const hx1 = xAt(route.t + lead + route.high.span);
      decks.push({
        id: highId,
        x0: hx0,
        x1: hx1,
        top: TUNING.groundY - route.high.h,
        h: route.high.h,
        layer: 3,
        kind: 'route',
        fork: routeIndex,
      });
      routes.push({
        id: highId,
        deckId: highId,
        fork: routeIndex,
        layer: 3,
        h: route.high.h,
        reward: route.high.reward || route.reward || 'star',
        x0: hx0,
        x1: hx1,
      });
      appendEvents(obstacles, flips, def, route.high.obstacles || [], route.high.h, `h${routeIndex}-`);
    }
    appendEvents(obstacles, flips, def, route.obstacles || [], route.h, `r${routeIndex}-`);
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
  const maxLayer = routes.reduce((max, route) => Math.max(max, route.layer), 1);
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
    decks,
    routes,
    forkCount: (def.routes || []).length,
    maxLayer,
  };
}
