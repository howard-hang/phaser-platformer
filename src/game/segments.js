/**
 * 从闯关 JSON 里切出可复用片段。
 * 只在地面空档处下刀，反转区、坠落平台和整段上层路都保持完整。
 * 时间相对片段起点。周期门的相位按原来到达那一帧的开合来对齐。
 */
import { HITBOX } from '../logic/world.js';

const modules = import.meta.glob('../levels/level-*.json', {
  eager: true,
  import: 'default',
});

const SPIKE_W = HITBOX.spike.w;
const BLOCK_W = HITBOX.block.w;
// 片段两端只留一点点，真正的喘息由难度曲线在拼接时加上。
const EDGE = 0.22;
// 短于这个空档的地面障碍视为同一组，不从中间切开。
const CLUSTER_GAP = 0.72;
// 长片段可以在这种空档再切一刀，切完两边仍然站在地上。
const SPLIT_GAP = 0.98;
const MAX_DURATION = 8.5;

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

function obstacleSpan(event, speed) {
  if (event.type === 'crumble' || event.type === 'flip') {
    return { t0: event.t, t1: event.t + event.span, atomic: true };
  }
  const width = event.type === 'spike' ? (event.count || 1) * SPIKE_W : BLOCK_W;
  return { t0: event.t, t1: event.t + width / speed, atomic: false };
}

function routeSpan(route) {
  let t0 = route.t;
  let t1 = route.t + route.span;
  if (route.step) {
    const lead = route.step.lead || 0;
    t0 = Math.min(t0, route.t - lead);
    t1 = Math.max(t1, route.t - lead + route.step.span);
  }
  if (route.high) {
    const lead = route.high.lead || 0;
    t0 = Math.min(t0, route.t + lead);
    t1 = Math.max(t1, route.t + lead + route.high.span);
  }
  return { t0, t1 };
}

function mergeSpans(spans) {
  const sorted = spans
    .map((span) => ({ t0: span.t0, t1: span.t1 }))
    .sort((a, b) => a.t0 - b.t0);
  const merged = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (!last || span.t0 > last.t1) merged.push({ ...span });
    else last.t1 = Math.max(last.t1, span.t1);
  }
  return merged;
}

/** 这些时间段不能从中间切开。 */
function atomicSpans(def, speed) {
  const spans = [];
  for (const event of def.obstacles || []) {
    if (event.type === 'flip' || event.type === 'crumble') {
      spans.push(obstacleSpan(event, speed));
    }
  }
  for (const route of def.routes || []) {
    const span = routeSpan(route);
    spans.push({ t0: span.t0, t1: span.t1, atomic: true });
  }
  return mergeSpans(spans);
}

function covers(spans, t0, t1) {
  return spans.some((span) => t0 < span.t1 - 1e-4 && t1 > span.t0 + 1e-4);
}

function shiftEvent(event, origin) {
  const next = { ...event, t: roundTime(event.t - origin) };
  if (event.type === 'gate') {
    // 片段改到新的时间原点后，到达门时的开合仍和原来那一关一样。
    next.phase = roundTime((event.phase || 0) + origin);
  }
  return next;
}

function shiftRoute(route, origin) {
  const next = {
    ...route,
    t: roundTime(route.t - origin),
    obstacles: (route.obstacles || []).map((event) => shiftEvent(event, origin)),
  };
  if (route.step) next.step = { ...route.step };
  if (route.high) {
    next.high = {
      ...route.high,
      obstacles: (route.high.obstacles || []).map((event) => shiftEvent(event, origin)),
    };
  }
  return next;
}

function comboLength(events) {
  const times = events.map((event) => event.t).sort((a, b) => a - b);
  let best = times.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] - times[i - 1] < 0.55) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

function classify(segment) {
  if (
    segment.sourceIndex <= 3
    && !segment.hasUpper
    && !segment.hasCeiling
    && !segment.hasGate
    && !segment.hasCrumble
  ) {
    return 0;
  }
  let tier = 0;
  if (segment.hasCrumble || segment.sourceIndex >= 5) tier = 1;
  if (segment.hasGate || segment.hasUpper) tier = Math.max(tier, 2);
  if (segment.hasCeiling || segment.hasHigh) tier = Math.max(tier, 3);
  if (segment.combo >= 5 && tier >= 2) tier = Math.min(4, tier + 1);
  if (segment.sourceIndex >= 17 && tier >= 3) tier = 4;
  if (segment.sourceIndex <= 2) tier = Math.min(tier, 1);
  return tier;
}

function buildSlice(def, speed, index, t0, t1, serial) {
  const obstacles = [];
  for (const event of def.obstacles || []) {
    const span = obstacleSpan(event, speed);
    if (span.t1 <= t0 + 0.02 || span.t0 >= t1 - 0.02) continue;
    obstacles.push(shiftEvent(event, t0));
  }
  const routes = [];
  for (const route of def.routes || []) {
    const span = routeSpan(route);
    if (span.t1 <= t0 + 0.02 || span.t0 >= t1 - 0.02) continue;
    routes.push(shiftRoute(route, t0));
  }
  if (!obstacles.length && !routes.length) return null;
  const stars = [];
  for (const star of def.stars || []) {
    if (star.t < t0 - 0.02 || star.t > t1 + 0.02) continue;
    stars.push({
      t: roundTime(star.t - t0),
      lift: star.lift || 0,
      dx: star.dx || 0,
    });
  }
  const routeEvents = [];
  for (const route of routes) {
    routeEvents.push(...route.obstacles);
    if (route.high) routeEvents.push(...route.high.obstacles);
  }
  const duration = roundTime(t1 - t0);
  const segment = {
    id: `${def.id}#${serial}`,
    sourceId: def.id,
    sourceIndex: index,
    sourceSpeed: speed,
    duration,
    obstacles,
    routes,
    stars,
    hasUpper: routes.length > 0,
    hasHigh: routes.some((route) => route.high),
    hasCeiling: obstacles.some((event) => event.type === 'flip' || event.anchor === 'ceiling'),
    hasGate: obstacles.some((event) => event.type === 'gate')
      || routeEvents.some((event) => event.type === 'gate'),
    hasCrumble: obstacles.some((event) => event.type === 'crumble'),
    combo: comboLength([...obstacles, ...routeEvents]),
    density: (obstacles.length + routeEvents.length) / Math.max(0.4, duration),
  };
  segment.tier = classify(segment);
  return segment;
}

/**
 * 按空档把一关切成多段。
 * 原子区间（反转、坠落、上层路）会把中间的小空档粘住，避免切坏。
 */
function sliceLevel(def, index) {
  const speed = def.speed;
  const solids = [];
  for (const event of def.obstacles || []) {
    solids.push(obstacleSpan(event, speed));
  }
  for (const route of def.routes || []) {
    const span = routeSpan(route);
    solids.push({ t0: span.t0, t1: span.t1, atomic: true });
    for (const event of route.obstacles || []) solids.push(obstacleSpan(event, speed));
    for (const event of route.high?.obstacles || []) solids.push(obstacleSpan(event, speed));
  }
  if (!solids.length) return [];
  const atomic = atomicSpans(def, speed);
  const clustered = [];
  const ordered = [...solids].sort((a, b) => a.t0 - b.t0);
  for (const span of ordered) {
    const last = clustered[clustered.length - 1];
    if (!last || span.t0 - last.t1 >= CLUSTER_GAP) clustered.push({ t0: span.t0, t1: span.t1 });
    else last.t1 = Math.max(last.t1, span.t1);
  }

  // 把靠得近的簇收成一段；太长时再找不穿过原子区间的空档切开。
  const ranges = [];
  let cursor = null;
  const flush = () => {
    if (cursor) ranges.push(cursor);
    cursor = null;
  };
  for (const cluster of clustered) {
    if (!cursor) {
      cursor = { t0: cluster.t0, t1: cluster.t1 };
      continue;
    }
    const gap = cluster.t0 - cursor.t1;
    const tooLong = cluster.t1 - cursor.t0 > MAX_DURATION;
    const blocked = covers(atomic, cursor.t1, cluster.t0);
    if ((gap >= SPLIT_GAP && !blocked) || (tooLong && gap >= CLUSTER_GAP && !blocked)) {
      flush();
      cursor = { t0: cluster.t0, t1: cluster.t1 };
    } else {
      cursor.t1 = cluster.t1;
    }
  }
  flush();

  const slices = [];
  ranges.forEach((range, serial) => {
    const t0 = Math.max(0, range.t0 - EDGE);
    const t1 = range.t1 + EDGE;
    const slice = buildSlice(def, speed, index, t0, t1, serial);
    if (slice && slice.duration >= 0.6) slices.push(slice);
  });
  return slices;
}

function loadDefs() {
  const defs = [];
  for (const [path, data] of Object.entries(modules)) {
    const name = path.split('/').pop();
    const match = name.match(/level-(\d+)\.json/);
    if (!match) continue;
    defs.push({ def: data, index: Number(match[1]) });
  }
  defs.sort((a, b) => a.index - b.index);
  return defs;
}

function buildLibrary() {
  const segments = [];
  for (const { def, index } of loadDefs()) {
    segments.push(...sliceLevel(def, index));
  }
  return segments;
}

/** 全部可拼接片段。游戏和测试共用这一份。 */
export const SEGMENTS = buildLibrary();

export function segmentsInTier(tier) {
  return SEGMENTS.filter((segment) => segment.tier === tier);
}
