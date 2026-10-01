/**
 * 在 PR #9 之后的 20 关上加密空闲，并加入可选的上层路线。
 * 不改跑速、关卡名、配色和解锁门槛。跳跃高度和重力也不动。
 * 只清出入口和落地，底下的障碍留着当另一条路。
 * 地面空闲大约砍到原来的一半；前几关少砍一点。喘息段变短，但每关都还留着。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { auditLevel } from '../src/logic/audit.js';
import { findClearPath, proveRoutes } from '../src/logic/search.js';
import { TUNING, ROUTE_DECK_H, ROUTE_HIGH_H, ROUTE_STEP_H } from '../src/logic/world.js';
import { compileLevel } from '../src/game/compileLevel.js';
import { validateLevel, validateManifest } from '../src/game/levelSchema.js';
import {
  eventBreathCount,
  eventIdleStats,
  finishApproachSeconds,
  levelMetrics,
  suggestedUnlock,
} from '../src/game/metrics.js';

const STEP_LEAD = 0.85;
const STEP_SPAN = 1.55;

function round(value) {
  return Math.round(value * 100) / 100;
}

function endOf(event, speed) {
  if (event.type === 'flip' || event.type === 'crumble') return event.t + (event.span || 0);
  const width = event.type === 'spike' ? 36 * (event.count || 1) : 42;
  return event.t + width / speed;
}

function forkCount(levelNumber) {
  if (levelNumber <= 4) return 1;
  if (levelNumber <= 9) return 2;
  return 3;
}

function idleTarget(levelNumber) {
  if (levelNumber <= 3) return 0.64;
  if (levelNumber <= 7) return 0.56;
  return 0.5;
}

function overlapsFlip(flips, start, end) {
  return flips.some((zone) => start < zone.t + zone.span + 0.55 && zone.t - 0.55 < end);
}

function fitsFork(t, span, flips, duration) {
  if (t + span > duration - 6.8) return false;
  return !overlapsFlip(flips, t - STEP_LEAD - 0.4, t + span + 0.85);
}

/**
 * 在反转区之间找分叉。后期反转区很密，均分会直接压到反转上，
 * 所以按能放下的位置挑，并尽量把分叉铺开。
 */
function planForks(def, levelNumber) {
  const count = forkCount(levelNumber);
  const flips = def.obstacles.filter((event) => event.type === 'flip');
  const minT = 12.2;
  const maxT = def.duration - 7.6;
  if (maxT <= minT + 3) return [];
  const baseSpan = levelNumber >= 18 ? 4.05 : levelNumber >= 12 ? 4.35 : 4.6;
  const highSpan = levelNumber >= 18 ? 4.95 : 5.15;
  const gap = levelNumber >= 18 ? 2.05 : 2.35;
  const candidates = [];
  for (let t = minT; t <= maxT; t += 0.4) candidates.push(round(t));

  let best = null;
  const placed = [];
  const search = (from) => {
    if (placed.length === count) {
      let minSep = Infinity;
      for (let i = 1; i < placed.length; i += 1) {
        minSep = Math.min(minSep, placed[i].t - placed[i - 1].t - placed[i - 1].span);
      }
      const spread = placed[placed.length - 1].t - placed[0].t;
      const score = minSep * 100 + spread;
      if (!best || score > best.score) {
        best = { placed: placed.map((item) => ({ ...item })), spread, score };
      }
      return;
    }
    const remaining = count - placed.length;
    for (let i = from; i < candidates.length; i += 1) {
      const t = candidates[i];
      const prev = placed[placed.length - 1];
      if (prev && t < round(prev.t + prev.span + gap)) continue;
      const wantHigh = levelNumber >= 15 && remaining === 1;
      const span = wantHigh ? highSpan : baseSpan;
      if (!fitsFork(t, span, flips, def.duration)) continue;
      const tail = (remaining - 1) * (baseSpan + gap);
      if (t + tail > maxT + 0.2) continue;
      placed.push({ t, span, high: wantHigh });
      search(i + 1);
      placed.pop();
    }
  };
  search(0);
  // 三个铺不开时少放一个，至少保住能放下的那些。
  if (!best) {
    // 直接降到少一个分叉再搜，避免递归把关卡号改乱。
    const fewer = [];
    const hunt = (from) => {
      if (fewer.length === Math.max(1, count - 1)) {
        if (!best || fewer[fewer.length - 1].t - fewer[0].t > best.spread) {
          best = { placed: fewer.map((item) => ({ ...item })), spread: fewer[fewer.length - 1].t - fewer[0].t };
        }
        return;
      }
      for (let i = from; i < candidates.length; i += 1) {
        const t = candidates[i];
        const prev = fewer[fewer.length - 1];
        if (prev && t < round(prev.t + prev.span + gap)) continue;
        const wantHigh = levelNumber >= 15 && fewer.length === Math.max(1, count - 1) - 1;
        const span = wantHigh ? highSpan : baseSpan;
        if (!fitsFork(t, span, flips, def.duration)) continue;
        fewer.push({ t, span, high: wantHigh });
        hunt(i + 1);
        fewer.pop();
      }
    };
    hunt(0);
  }
  if (!best) {
    for (const t of candidates) {
      if (!fitsFork(t, baseSpan, flips, def.duration)) continue;
      best = { placed: [{ t, span: baseSpan }], spread: 0 };
      break;
    }
  }
  if (!best) return [];
  return best.placed.map((item, i) => {
    const high = Boolean(item.high);
    const reward = high ? 'safe' : (i === 0 ? 'star' : (i % 2 === 1 ? 'safe' : 'shortcut'));
    const fork = {
      t: item.t,
      span: item.span,
      h: ROUTE_DECK_H,
      layer: 2,
      reward,
      step: { h: ROUTE_STEP_H, span: STEP_SPAN, lead: STEP_LEAD },
    };
    if (high) fork.high = { h: ROUTE_HIGH_H, span: 2.2, lead: 1.65, reward: 'star' };
    return fork;
  });
}

/** 只空出起跳台阶和落下的落点，路中间的地面障碍留着。 */
function removalWindows(forks) {
  const zones = [];
  for (const fork of forks) {
    zones.push([round(fork.t - STEP_LEAD - 0.28), round(fork.t + 0.92)]);
    // 落地后大约 0.42 秒不能有地面障碍，窗口要比这段更宽，盖住多连尖刺的尾巴。
    zones.push([round(fork.t + fork.span - 0.2), round(fork.t + fork.span + 0.85)]);
  }
  return zones;
}

function eventHits(event, windows, speed) {
  const end = endOf(event, speed);
  return windows.some(([start, stop]) => event.t < stop && end > start);
}

function inZones(time, zones) {
  return zones.some(([start, end]) => time > start && time < end);
}

function groundTypesBetween(events, fork) {
  const types = new Set();
  const t0 = fork.t + 1.15;
  const t1 = fork.t + fork.span - 0.9;
  for (const event of events) {
    if (event.t >= t0 && event.t <= t1) types.add(event.type);
  }
  return types;
}

function deckPattern(fork, groundTypes) {
  if (fork.emptyDeck || fork.high) return [];
  if (fork.reward === 'safe' || fork.reward === 'shortcut') return [];
  const t = round(fork.t + Math.min(1.7, fork.span * 0.38));
  if (!groundTypes.has('block')) return [{ t, type: 'block' }];
  if (!groundTypes.has('overhead')) return [{ t, type: 'overhead', gap: 58 }];
  return [{ t, type: 'spike', count: 1 }];
}

function occupied(events) {
  return events.map((event) => {
    const span = event.span || (event.type === 'spike' ? 0.12 * (event.count || 1) : 0.16);
    return [event.t - 0.28, event.t + span + 0.28];
  });
}

function isClear(time, blocks) {
  return blocks.every(([start, end]) => time < start || time > end);
}

function safeCheckpoints(events, duration, flips, zones) {
  const blocks = occupied(events);
  const points = [];
  for (let time = 10; time < duration - 5 && points.length < 4; time += 11) {
    let cursor = time;
    const blocked = (value) => !isClear(value, blocks)
      || flips.some((zone) => value > zone.t - 0.45 && value < zone.t + zone.span + 0.45)
      || inZones(value, zones);
    for (let step = 0; step < 22 && blocked(cursor); step += 1) cursor += 0.32;
    if (!blocked(cursor) && cursor < duration - 2.4) points.push(round(cursor));
  }
  return points;
}

function findClearTime(events, flips, zones, from, to) {
  const blocks = occupied(events);
  for (let time = from; time <= to; time += 0.18) {
    const t = round(time);
    if (!isClear(t, blocks)) continue;
    if (flips.some((zone) => t > zone.t - 0.3 && t < zone.t + zone.span + 0.3)) continue;
    if (inZones(t, zones)) continue;
    return t;
  }
  return null;
}

function buildStars(def, forks, levelNumber, events, zones) {
  const flips = events.filter((event) => event.type === 'flip');
  const stars = [];
  stars.push({ t: findClearTime(events, flips, zones, 1.25, 4.6) ?? 1.4, lift: 0 });
  const first = forks[0];
  stars.push({ t: round(first.t + first.span * 0.62), lift: ROUTE_DECK_H });
  if (forks.length >= 2 && levelNumber >= 6) {
    const late = forks[forks.length - 1];
    if (late.high) {
      stars.push({
        t: round(late.t + late.high.lead + late.high.span * 0.42),
        lift: ROUTE_HIGH_H,
      });
    } else {
      stars.push({ t: round(late.t + late.span * 0.55), lift: ROUTE_DECK_H });
    }
  } else {
    const ground = findClearTime(events, flips, zones, def.duration * 0.62, def.duration - 2.3);
    stars.push({ t: ground ?? round(def.duration * 0.72), lift: 0 });
  }
  return stars.map((star) => ({
    t: round(Math.min(Math.max(1.15, star.t), def.duration - 1.35)),
    lift: star.lift,
  }));
}

function tuningOf(level) {
  return { ...TUNING, speed: level.speed };
}

function fixApproach(def) {
  const level = compileLevel(def, Number(def.id.slice(6)));
  const approach = finishApproachSeconds(level, tuningOf(level));
  if (approach > 1.24) def.duration = round(Math.max(40, def.duration - (approach - 1.1)));
  if (approach < 1) def.duration = round(Math.min(90, def.duration + (1.08 - approach)));
}

function solve(def) {
  try {
    validateLevel(def, `${def.id}.json`);
  } catch (error) {
    return { ok: false, problems: [error.message], level: null };
  }
  const level = compileLevel(def, Number(def.id.slice(6)));
  const tuning = tuningOf(level);
  const problems = auditLevel(level, tuning);
  if (problems.length) return { ok: false, problems, level, stage: 'audit' };
  const stars = findClearPath(level, tuning);
  if (!stars.ok) return { ...stars, problems, level, stage: 'stars' };
  const routes = proveRoutes(level, tuning);
  if (!routes.ok) return { ok: false, problems, level, stage: 'routes', routes };
  const approach = finishApproachSeconds(level, tuning);
  if (approach < 1 || approach > 1.25) {
    return { ok: false, problems: [`终点距离 ${approach.toFixed(2)}`], level, stage: 'approach' };
  }
  return { ok: true, level, seen: stars.seen };
}

function decorate(base, forks, events, zones, levelNumber) {
  const def = {
    ...base,
    obstacles: events,
    routes: forks.map((fork) => {
      const route = {
        t: fork.t,
        span: fork.span,
        h: fork.h,
        layer: 2,
        reward: fork.reward,
        step: fork.step,
        obstacles: fork.deckObstacles || [],
      };
      if (fork.high) route.high = fork.high;
      return route;
    }),
  };
  def.stars = buildStars(def, forks, levelNumber, events, zones);
  const flips = events.filter((event) => event.type === 'flip');
  def.checkpoints = safeCheckpoints(events, def.duration, flips, zones);
  fixApproach(def);
  def.stars = def.stars.map((star) => ({
    ...star,
    t: round(Math.min(star.t, def.duration - 1.3)),
  }));
  def.checkpoints = safeCheckpoints(def.obstacles, def.duration, flips, zones);
  return def;
}

function baseEvents(original, forks) {
  const windows = removalWindows(forks);
  const kept = original.obstacles.filter((event) => event.t < 9.2 || !eventHits(event, windows, original.speed));
  for (const fork of forks) {
    const types = groundTypesBetween(kept, fork);
    fork.deckObstacles = deckPattern(fork, types);
    const t0 = fork.t + 1.2;
    const t1 = fork.t + fork.span - 0.95;
    const hasGround = kept.some((event) => event.t >= t0 && event.t <= t1);
    if (!hasGround) {
      kept.push({ t: round(t0 + 0.2), type: 'spike', count: 2 });
    }
  }
  kept.sort((a, b) => a.t - b.t);
  return kept;
}

function slotOk(at, zones, flips, stars, speed) {
  if (at < 2.5) return false;
  // 两连尖刺的尾巴也不能伸进出入口或落地空档。
  const end = at + 36 / (speed || 360);
  if (zones.some(([start, stop]) => at < stop && end > start)) return false;
  if (flips.some((zone) => at > zone.t - 0.25 && at < zone.t + zone.span + 0.65)) return false;
  if ((stars || []).some((star) => (star.lift || 0) < 120 && Math.abs(star.t - at) < 0.4)) return false;
  return true;
}

function insertCandidates(events, speed, flips, zones, minIdle, stars) {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const found = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    const idle = next.t - endOf(prev, speed);
    if (idle < minIdle) continue;
    const start = endOf(prev, speed) + 0.08;
    const stop = next.t - 0.1;
    const seen = new Set();
    const spots = [round(start)];
    // 禁区会挡住空档中间，所以沿整段空档找还能放的位置。
    for (let at = start; at <= stop + 1e-6; at += 0.12) spots.push(round(at));
    for (const at of spots) {
      if (seen.has(at) || at > stop + 1e-6) continue;
      seen.add(at);
      if (!slotOk(at, zones, flips, stars, speed)) continue;
      found.push({ at, idle });
    }
  }
  // 先切最长的空档，并且优先贴着前一个障碍，做成连续组合。
  found.sort((a, b) => b.idle - a.idle || a.at - b.at);
  return found;
}

const levelDir = new URL('../src/levels/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', levelDir), 'utf8'));
const before = JSON.parse(readFileSync(new URL('./baseline-pr9-density.json', import.meta.url), 'utf8'));
const levels = [];

for (let n = 1; n <= 20; n += 1) {
  const file = `level-${String(n).padStart(2, '0')}.json`;
  const original = JSON.parse(readFileSync(new URL(file, levelDir), 'utf8'));
  const started = Date.now();
  let forks = planForks(original, n);
  const zones = () => removalWindows(forks);
  const flipsOf = (events) => events.filter((event) => event.type === 'flip');

  const build = () => decorate(original, forks, baseEvents(original, forks), zones(), n);

  let def = build();
  let result = solve(def);
  if (!result.ok) {
    for (const fork of forks) fork.emptyDeck = true;
    def = build();
    result = solve(def);
  }
  if (!result.ok && forks.some((fork) => fork.high)) {
    forks = forks.map((fork) => {
      const copy = { ...fork };
      delete copy.high;
      return copy;
    });
    def = build();
    result = solve(def);
  }
  while (!result.ok && forks.length > 1) {
    forks = forks.slice(0, -1);
    if (n >= 15 && forks.length && !forks.some((fork) => fork.high)) {
      const last = forks[forks.length - 1];
      last.high = { h: ROUTE_HIGH_H, span: 2.35, lead: 1.75, reward: 'star' };
      last.span = Math.max(last.span, 5.3);
      last.reward = 'safe';
      last.emptyDeck = true;
    }
    def = build();
    result = solve(def);
  }
  if (!result.ok) {
    console.error('give up routes', n, result.stage, result.problems?.slice(0, 3), result.routes);
    process.exit(1);
  }

  const target = idleTarget(n);
  const was = before[n - 1].avgIdle;
  const used = new Set();
  let added = 0;
  // 先切明显偏长的空档；切不动再把门槛降到接近目标平均。
  let minIdle = n <= 3 ? 1.05 : n <= 8 ? 0.72 : 0.42;
  const floorIdle = n <= 3 ? 0.72 : n <= 8 ? 0.38 : 0.16;
  for (let guard = 0; guard < 140; guard += 1) {
    const idle = eventIdleStats(def).avgIdle;
    if (idle / was <= target) break;
    const candidates = insertCandidates(
      def.obstacles,
      original.speed,
      flipsOf(def.obstacles),
      zones(),
      minIdle,
      def.stars,
    );
    const next = candidates.find((item) => !used.has(item.at));
    if (!next) {
      if (minIdle > floorIdle) {
        minIdle = floorIdle;
        continue;
      }
      break;
    }
    used.add(next.at);
    const trial = structuredClone(def);
    const count = n >= 14 && next.idle > 1.05 ? 2 : 1;
    trial.obstacles.push({ t: next.at, type: 'spike', count });
    trial.obstacles.sort((a, b) => a.t - b.t);
    // 前几关要留喘息。切完以后至少还剩两段够长的空档。
    if (eventBreathCount(trial) < 2) continue;
    trial.checkpoints = safeCheckpoints(trial.obstacles, trial.duration, flipsOf(trial.obstacles), zones());
    const trialResult = solve(trial);
    if (!trialResult.ok) continue;
    def = trial;
    result = trialResult;
    added += 1;
  }

  console.log(`level ${n} ok ${Date.now() - started}ms forks=${forks.length} high=${forks.some((fork) => fork.high)} inserts=${added} n=${result.level.obstacles.length} idle=${eventIdleStats(def).avgIdle.toFixed(3)}`);
  levels.push({ def, level: result.level, forks, zones: zones() });
}

function tryBumpCount(row) {
  const events = row.def.obstacles;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.type !== 'spike' || event.anchor === 'ceiling') continue;
    if ((event.count || 1) >= 4) continue;
    if (row.bumped?.has(i)) continue;
    const def = structuredClone(row.def);
    def.obstacles[i].count = (def.obstacles[i].count || 1) + 1;
    const result = solve(def);
    if (!result.ok) {
      row.bumped = row.bumped || new Set();
      row.bumped.add(i);
      continue;
    }
    row.def = def;
    row.level = result.level;
    return true;
  }
  return false;
}

function tryAddSpike(row) {
  const candidates = insertCandidates(
    row.def.obstacles,
    row.def.speed,
    row.def.obstacles.filter((event) => event.type === 'flip'),
    row.zones,
    0.55,
    row.def.stars,
  );
  for (const candidate of candidates) {
    if (row.blocked?.has(candidate.at)) continue;
    const def = structuredClone(row.def);
    def.obstacles.push({ t: candidate.at, type: 'spike', count: 1 });
    def.obstacles.sort((a, b) => a.t - b.t);
    if (eventBreathCount(def) < 2) {
      row.blocked = row.blocked || new Set();
      row.blocked.add(candidate.at);
      continue;
    }
    def.checkpoints = safeCheckpoints(
      def.obstacles,
      def.duration,
      def.obstacles.filter((event) => event.type === 'flip'),
      row.zones,
    );
    const result = solve(def);
    if (!result.ok) {
      row.blocked = row.blocked || new Set();
      row.blocked.add(candidate.at);
      continue;
    }
    const metrics = levelMetrics(result.level);
    row.def = def;
    row.level = result.level;
    return metrics;
  }
  return null;
}

for (let i = 1; i < levels.length; i += 1) {
  let guard = 0;
  while (guard < 40) {
    const prev = levelMetrics(levels[i - 1].level);
    const curr = levelMetrics(levels[i].level);
    if (curr.obstacles > prev.obstacles && curr.avgGap < prev.avgGap - 0.0005) break;
    guard += 1;
    const metrics = tryAddSpike(levels[i]);
    if (metrics) continue;
    if (tryBumpCount(levels[i])) continue;
    console.log(`level ${i + 1} monotonic stuck n=${curr.obstacles}/${prev.obstacles} gap=${curr.avgGap.toFixed(3)}/${prev.avgGap.toFixed(3)}`);
    break;
  }
}

console.log('\n指标');
let bad = false;
for (const item of levels) {
  const metrics = levelMetrics(item.level);
  const idle = eventIdleStats(item.def);
  const was = before[metrics.index - 1];
  const ratio = idle.avgIdle / was.avgIdle;
  if (ratio > idleTarget(metrics.index) + 0.08) bad = true;
  console.log([
    String(metrics.index).padStart(2, ' '),
    `n=${metrics.obstacles}(${was.obstacles})`,
    `idle=${idle.avgIdle.toFixed(3)}(${was.avgIdle.toFixed(3)})`,
    `x${ratio.toFixed(2)}`,
    `max=${idle.maxIdle.toFixed(2)}`,
    `combo=${idle.combos}(${was.combos})`,
    `forks=${idle.forks}`,
    `L${idle.layers}`,
    `gap=${metrics.avgGap.toFixed(3)}`,
    `dur=${item.def.duration}`,
  ].join('  '));
}

for (let i = 1; i < levels.length; i += 1) {
  const prev = levelMetrics(levels[i - 1].level);
  const curr = levelMetrics(levels[i].level);
  if (!(curr.obstacles > prev.obstacles && curr.avgGap < prev.avgGap - 0.0005)) {
    console.error('难度曲线不单调', i + 1);
    bad = true;
  }
}

if (bad) {
  console.error('密度还没到目标，不写文件');
  process.exit(1);
}

const files = {};
levels.forEach((item, index) => {
  const name = manifest.levels[index].file;
  files[name] = item.def;
  if (manifest.levels[index].unlockStars !== suggestedUnlock(index + 1)) {
    console.error('解锁门槛变了', name);
    process.exit(1);
  }
  writeFileSync(new URL(name, levelDir), `${JSON.stringify(item.def, null, 2)}\n`);
});
validateManifest(manifest, files);
console.log('已写回 20 关');
