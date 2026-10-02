/**
 * 用固定种子把片段库拼成无尽跑道。
 * 同一颗种子得到同一条路。拼出来的关卡带速度分段，搜索和游戏都按分段计时。
 */
import { START_X } from './compileLevel.js';
import {
  ENDLESS_CURVE,
  breatherGap,
  chainLength,
  endlessSpeed,
  stitchGap,
  tierRange,
} from './endlessCurve.js';
import { SEGMENTS } from './segments.js';
import { POWERUP_CONFIG } from './powerupConfig.js';
import { rollPowerType } from '../logic/powerups.js';
import { findClearPath } from '../logic/search.js';
import { HITBOX, TUNING } from '../logic/world.js';
import { t } from '../i18n/index.js';

export { START_X };

/** 可复现的随机数。种子相同，数列就相同。 */
export function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng, pool, weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) total += weights[i];
  let cursor = rng() * total;
  for (let i = 0; i < pool.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * 单独放上助跑后能不能跑完。
 * 切坏的片段不会进无尽池。
 */
function segmentIsClear(segment) {
  const speed = segment.sourceSpeed;
  // 搜索按固定步长取样。窗口如果只剩一两像素，换一个起步位置就会跳不过去。
  // 每个相位都要能过，拼到任意位置才安全。
  const step = Math.ceil(speed / 60);
  for (let shift = 0; shift < step; shift += 1) {
    const runway = speed * 2.2 + shift;
    const placed = placeSegment(segment, speed, START_X + runway, runway / speed, 1);
    const level = {
      id: segment.id,
      startX: START_X,
      finishX: placed.x1 + speed * 1.5,
      speed,
      obstacles: placed.obstacles,
      stars: [],
      flips: placed.flips,
      decks: placed.decks,
      routes: placed.routes,
      checkpoints: [START_X],
    };
    if (!findClearPath(level, { ...TUNING, speed }, { needStars: false }).ok) return false;
  }
  return true;
}

let clearSegments = null;

/** 已经验证能单独跑通的片段。第一次抽取时筛一遍。 */
export function playableSegments() {
  if (!clearSegments) clearSegments = SEGMENTS.filter(segmentIsClear);
  return clearSegments;
}

/**
 * 按当前距离和跑速挑一段。
 * 跑速低于片段来源关卡时不用它：像素宽的尖刺会占更长时间，可能跳不过去。
 */
export function pickSegment(rng, distancePx, speed, lastId) {
  const range = tierRange(distancePx);
  const progress = distancePx <= ENDLESS_CURVE.warmupDistance
    ? 0
    : Math.min(1, (distancePx - ENDLESS_CURVE.warmupDistance) / ENDLESS_CURVE.rampDistance);
  // 只用不比当前跑速更苛刻的片段。来源关更慢时，尖刺之间的像素空隙会变窄。
  const eligible = (segment) => segment.sourceSpeed <= speed + 0.05;
  let pool = playableSegments().filter((segment) => (
    segment.tier >= range.min
    && segment.tier <= range.max
    && eligible(segment)
  ));
  if (!pool.length) {
    pool = playableSegments().filter((segment) => segment.tier <= range.max && eligible(segment));
  }
  // 实在没有合适档位时，只用设计跑速最慢的片段，避免把更快关卡的尖刺塞进更慢的速度里。
  if (!pool.length) {
    let slowest = Infinity;
    const all = playableSegments();
    for (let i = 0; i < all.length; i += 1) slowest = Math.min(slowest, all[i].sourceSpeed);
    pool = all.filter((segment) => segment.sourceSpeed <= slowest + 0.05);
  }
  const alternatives = pool.filter((segment) => segment.id !== lastId);
  if (alternatives.length) pool = alternatives;
  const weights = pool.map((segment) => {
    const dense = 0.35 + segment.density;
    const combo = 1 + segment.combo * (0.25 + progress * 0.85);
    const upper = segment.hasUpper || segment.hasCeiling ? (0.75 + progress * 1.4) : 1;
    const tierBoost = 1 + Math.max(0, segment.tier - range.min) * progress;
    return dense * combo * upper * tierBoost;
  });
  return pickWeighted(rng, pool, weights);
}

function pushSpike(obstacles, event, order, speed, xAt, rise, prefix) {
  const type = event.anchor === 'ceiling' ? 'cspike' : 'spike';
  const spec = HITBOX.spike;
  const left = xAt(event.t);
  const count = event.count || 1;
  for (let i = 0; i < count; i += 1) {
    obstacles.push({
      id: `${prefix}-${type}-${order}-${i}`,
      type,
      x: left + spec.w / 2 + i * spec.w,
      rise,
    });
  }
}

function pushBlockLike(obstacles, event, order, speed, xAt, rise, prefix, timeBase) {
  const spec = HITBOX.block;
  const x = xAt(event.t) + spec.w / 2;
  if (event.type === 'block') {
    obstacles.push({ id: `${prefix}-block-${order}`, type: 'block', x, rise });
    return;
  }
  if (event.type === 'overhead') {
    obstacles.push({
      id: `${prefix}-over-${order}`,
      type: 'overhead',
      x,
      gap: event.gap ?? 58,
      rise,
    });
    return;
  }
  if (event.type === 'gate') {
    obstacles.push({
      id: `${prefix}-gate-${order}`,
      type: 'gate',
      x,
      period: event.period,
      open: event.open,
      // 相位按片段本地时间存的。放到整条跑道上时减掉这段的起始时间。
      phase: (event.phase || 0) - timeBase,
      rise,
    });
  }
}

function appendEvents(obstacles, flips, events, speed, xAt, rise, prefix, timeBase) {
  events.forEach((event, order) => {
    if (event.type === 'spike') {
      pushSpike(obstacles, event, order, speed, xAt, rise, prefix);
      return;
    }
    if (event.type === 'block' || event.type === 'overhead' || event.type === 'gate') {
      pushBlockLike(obstacles, event, order, speed, xAt, rise, prefix, timeBase);
      return;
    }
    if (event.type === 'crumble') {
      const x0 = xAt(event.t);
      const x1 = xAt(event.t + event.span);
      obstacles.push({
        id: `${prefix}-crumble-${order}`,
        type: 'crumble',
        x: x0,
        x0,
        x1,
        collapse: timeBase + event.t + event.delay,
        delay: event.delay,
        span: event.span,
        rise: 0,
      });
      return;
    }
    if (event.type === 'flip') {
      const x0 = xAt(event.t);
      const x1 = xAt(event.t + event.span);
      const id = `${prefix}-flip-${order}`;
      flips.push({ id, x0, x1 });
      obstacles.push({ id, type: 'flip', x: x0, x0, x1 });
    }
  });
}

/** 把一个片段放到世界坐标里。速度在这一整段里不变。 */
export function placeSegment(segment, speed, x0, timeBase, serial) {
  const prefix = `en-${serial}`;
  const xAt = (t) => Math.round(x0 + t * speed);
  const obstacles = [];
  const flips = [];
  const decks = [];
  const routes = [];
  appendEvents(obstacles, flips, segment.obstacles, speed, xAt, 0, prefix, timeBase);

  segment.routes.forEach((route, routeIndex) => {
    const deckId = `${prefix}-route-${routeIndex}`;
    const deckX0 = xAt(route.t);
    const deckX1 = xAt(route.t + route.span);
    decks.push({
      id: deckId,
      x0: deckX0,
      x1: deckX1,
      top: TUNING.groundY - route.h,
      h: route.h,
      layer: route.layer || 2,
      kind: 'route',
      fork: routeIndex,
    });
    routes.push({
      id: deckId,
      deckId,
      fork: routeIndex,
      layer: route.layer || 2,
      h: route.h,
      reward: route.reward || 'safe',
      x0: deckX0,
      x1: deckX1,
    });
    if (route.step) {
      const lead = route.step.lead || 0;
      decks.push({
        id: `${prefix}-step-${routeIndex}`,
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
      const highId = `${prefix}-high-${routeIndex}`;
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
      appendEvents(
        obstacles,
        flips,
        route.high.obstacles || [],
        speed,
        xAt,
        route.high.h,
        `${prefix}-h${routeIndex}`,
        timeBase,
      );
    }
    appendEvents(
      obstacles,
      flips,
      route.obstacles || [],
      speed,
      xAt,
      route.h,
      `${prefix}-r${routeIndex}`,
      timeBase,
    );
  });

  const stars = segment.stars.map((star, starIndex) => ({
    id: `${prefix}-star-${starIndex + 1}`,
    x: xAt(star.t) + (star.dx || 0),
    lift: star.lift || 0,
  }));

  const contentEnd = xAt(segment.duration);
  return {
    id: prefix,
    segmentId: segment.id,
    tier: segment.tier,
    hasUpper: segment.hasUpper,
    hasCeiling: segment.hasCeiling,
    speed,
    t0: timeBase,
    x0,
    contentX1: contentEnd,
    x1: contentEnd,
    t1: timeBase + segment.duration,
    obstacles,
    flips,
    decks,
    routes,
    stars,
  };
}

function appendBand(stream, speed, duration) {
  const x0 = stream.x;
  const t0 = stream.t;
  const x1 = x0 + duration * speed;
  const t1 = t0 + duration;
  const last = stream.bands[stream.bands.length - 1];
  if (last && Math.abs(last.speed - speed) < 0.05 && Math.abs(last.x1 - x0) < 1) {
    last.x1 = x1;
    last.t1 = t1;
  } else {
    stream.bands.push({ x0, x1, t0, t1, speed });
  }
  stream.x = x1;
  stream.t = t1;
}

/**
 * 无尽跑道的生成状态。向前要路时再拼下一段，跑过的段可以从 live 里拿掉。
 * pieces 只在需要整条路（测试）时保留；游戏里回收后就丢掉障碍数据。
 */
export function createEndlessStream(seed, options = {}) {
  return {
    seed: (seed >>> 0) || 1,
    rng: createRng(seed),
    speedLock: Number.isFinite(options.speedLock) ? options.speedLock : null,
    x: START_X,
    t: 0,
    serial: 0,
    chainLeft: 0,
    lastSegmentId: null,
    pendingSpeed: null,
    introDone: false,
    bands: [],
    live: [],
    kept: options.keepAll === true ? [] : null,
    // 和片段用的不是同一条随机数列，投放道具不会把后面的路打乱。
    powerRng: createRng((((seed >>> 0) || 1) ^ 0x51f15e0d) >>> 0 || 1),
    lastPowerX: null,
  };
}

/**
 * 这个位置要不要放道具。
 * 隔得太近就跳过；没投中也会把下一次尝试往后推，开局才不会扎堆。
 */
export function offerEndlessPower(stream, x, distance) {
  const cfg = POWERUP_CONFIG.endless;
  if (stream.lastPowerX != null && x - stream.lastPowerX < cfg.spacing) return null;
  const type = rollPowerType(stream.powerRng, distance);
  if (!type) {
    stream.lastPowerX = x - cfg.spacing + cfg.retry;
    return null;
  }
  stream.lastPowerX = x;
  return type;
}

function placePower(piece, id, type, x) {
  if (!piece.powerups) piece.powerups = [];
  piece.powerups.push({ id, type, x, lift: 0 });
}

/** 热身空地上可以先放一个，方便开局就看见道具。 */
function maybeIntroPower(stream, piece) {
  piece.powerups = [];
  const x = Math.round(piece.x0 + piece.speed * 1.8);
  const type = offerEndlessPower(stream, x, x - START_X);
  if (!type) return;
  placePower(piece, 'en-intro-power', type, x);
}

/** 道具放在片段后面的空档上，不压到障碍，也不贴着喘息星星。 */
function maybeGapPower(stream, piece) {
  piece.powerups = piece.powerups || [];
  const gapW = piece.x1 - piece.contentX1;
  if (gapW < 80) return;
  const rest = (piece.stars || []).find((star) => String(star.id).endsWith('rest-star'));
  const frac = rest ? 0.8 : 0.5;
  let x = Math.round(piece.contentX1 + gapW * frac);
  if (rest && Math.abs(x - rest.x) < 52) x = Math.min(piece.x1 - 24, Math.round(rest.x + 72));
  const type = offerEndlessPower(stream, x, x - START_X);
  if (!type) return;
  placePower(piece, `${piece.id}-power`, type, x);
}

function remember(stream, piece) {
  stream.live.push(piece);
  if (stream.kept) stream.kept.push(piece);
}

/** 再往前铺，直到跑道超过 targetX。返回新铺上的段。 */
export function ensureAhead(stream, targetX) {
  const spawned = [];
  let guard = 0;
  // 一段至少前进一截。上限只是防止距离算坏时死循环，正常长跑用不到。
  while (stream.x < targetX && guard < 2000) {
    guard += 1;
    spawned.push(pullPiece(stream));
  }
  return spawned;
}

function pullPiece(stream) {
  if (!stream.introDone) {
    const speed = stream.speedLock ?? ENDLESS_CURVE.baseSpeed;
    const duration = ENDLESS_CURVE.introSeconds;
    const x0 = stream.x;
    const t0 = stream.t;
    appendBand(stream, speed, duration);
    stream.introDone = true;
    stream.pendingSpeed = speed;
    const piece = {
      id: 'en-intro',
      segmentId: 'intro',
      tier: 0,
      hasUpper: false,
      hasCeiling: false,
      speed,
      t0,
      x0,
      contentX1: stream.x,
      x1: stream.x,
      t1: stream.t,
      obstacles: [],
      flips: [],
      decks: [],
      routes: [],
      stars: [],
      powerups: [],
      intro: true,
    };
    maybeIntroPower(stream, piece);
    remember(stream, piece);
    return piece;
  }

  const distance = stream.x - START_X;
  // 速度在上一段留下的空档里已经换成这一段的值，障碍本身不再变速。
  const speed = stream.speedLock ?? stream.pendingSpeed ?? endlessSpeed(distance);
  if (stream.chainLeft <= 0) stream.chainLeft = chainLength(distance);
  const segment = pickSegment(stream.rng, distance, speed, stream.lastSegmentId);
  stream.lastSegmentId = segment.id;
  const placed = placeSegment(segment, speed, stream.x, stream.t, stream.serial);
  stream.serial += 1;
  appendBand(stream, speed, segment.duration);
  placed.x1 = stream.x;
  placed.t1 = stream.t;
  stream.chainLeft -= 1;
  const gapDistance = stream.x - START_X;
  const gap = stream.chainLeft > 0 ? stitchGap(gapDistance) : breatherGap(gapDistance);
  // 空档用下一段的速度。下一段障碍离变速点还有一整段空档，起跳不会跨过变速点。
  const nextSpeed = stream.speedLock ?? endlessSpeed(gapDistance);
  appendBand(stream, nextSpeed, gap);
  stream.pendingSpeed = nextSpeed;
  placed.x1 = stream.x;
  placed.t1 = stream.t;
  // 喘息的地面上放一颗星，不挡路，跑过去就能捡到。
  if (stream.chainLeft === 0) {
    const starX = Math.round(placed.contentX1 + (placed.x1 - placed.contentX1) * 0.45);
    placed.stars.push({
      id: `${placed.id}-rest-star`,
      x: starX,
      lift: 0,
    });
  }
  maybeGapPower(stream, placed);
  remember(stream, pieceBounds(placed));
  return stream.live[stream.live.length - 1];
}

function pieceBounds(piece) {
  return piece;
}

/** 丢掉已经跑过的段。速度分段留着，计时还要用。返回被丢掉的段。 */
export function recycleBehind(stream, minX) {
  const dropped = [];
  const stay = [];
  for (let i = 0; i < stream.live.length; i += 1) {
    const piece = stream.live[i];
    if (piece.x1 < minX) dropped.push(piece);
    else stay.push(piece);
  }
  stream.live = stay;
  return dropped;
}

function gather(pieces) {
  const obstacles = [];
  const stars = [];
  const flips = [];
  const decks = [];
  const routes = [];
  const powerups = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    obstacles.push(...piece.obstacles);
    stars.push(...piece.stars);
    flips.push(...piece.flips);
    decks.push(...piece.decks);
    routes.push(...piece.routes);
    if (piece.powerups) powerups.push(...piece.powerups);
  }
  return { obstacles, stars, flips, decks, routes, powerups };
}

/** 给正在跑的局面用：只含还活着的障碍，加上完整的速度分段。 */
export function viewEndless(stream, viewWidth = 960) {
  const content = gather(stream.live);
  const speed = stream.bands.length
    ? stream.bands[stream.bands.length - 1].speed
    : ENDLESS_CURVE.baseSpeed;
  return {
    id: 'endless',
    name: t('menu.endless'),
    index: 0,
    speed,
    palette: 0,
    paletteId: 'magenta',
    startX: START_X,
    finishX: Number.POSITIVE_INFINITY,
    worldWidth: stream.x + viewWidth,
    checkpoints: [START_X],
    speedBands: stream.bands,
    endless: true,
    ...content,
  };
}

/**
 * 一次生成很长的一段，给可达性测试用。
 * distance 是从起点算的像素。speedLock 固定整段跑速，用来分档验证。
 */
export function buildEndlessLevel({ seed, distance, speedLock = null }) {
  const stream = createEndlessStream(seed, { speedLock, keepAll: true });
  ensureAhead(stream, START_X + distance);
  const content = gather(stream.kept);
  const speed = speedLock ?? (stream.bands[0]?.speed || ENDLESS_CURVE.baseSpeed);
  return {
    id: 'endless',
    name: t('menu.endless'),
    index: 0,
    speed,
    startX: START_X,
    finishX: stream.x,
    worldWidth: stream.x + 960,
    checkpoints: [START_X],
    speedBands: stream.bands,
    pieces: stream.kept,
    endless: true,
    ...content,
  };
}
