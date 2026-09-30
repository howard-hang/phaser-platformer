/**
 * 在现有 20 关 JSON 上加密：缩短障碍间距，并插入 2 连、3 连组合。
 * 跑速、时长、关卡名、配色、解锁门槛不动。跳跃高度和重力也不在这里改。
 * 每关仍保留至少几段 1.7 秒以上的喘息。
 * 通过和游戏相同的搜索之后才写回文件。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { auditLevel } from '../src/logic/audit.js';
import { findClearPath } from '../src/logic/search.js';
import { TUNING } from '../src/logic/world.js';
import { compileLevel } from '../src/game/compileLevel.js';
import { validateLevel, validateManifest } from '../src/game/levelSchema.js';
import {
  eventBreathCount,
  eventComboStats,
  levelMetrics,
  suggestedUnlock,
} from '../src/game/metrics.js';

function round(value) {
  return Math.round(value * 100) / 100;
}

/** 周期门的相位按到达时间重算，压缩之后仍然是关着的，需要跳过去。 */
function rephaseGates(events) {
  for (const event of events) {
    if (event.type !== 'gate') continue;
    const period = event.period;
    const open = event.open;
    const target = open + (period - open) * 0.55;
    event.phase = round(target - (event.t % period));
  }
}

function shrinkOf(levelNumber) {
  // 非喘息间隔：第 1 关留大约 82%，第 20 关留大约 64%。
  return 0.82 - (levelNumber - 1) * (0.18 / 19);
}

function breathShrinkOf(levelNumber) {
  // 喘息也变短，但后期缩得更多，并且不会短于 1.85 秒。
  return 0.98 - (levelNumber - 1) * (0.24 / 19);
}

function comboGapOf(levelNumber) {
  return round(Math.max(0.4, 0.5 - (levelNumber - 1) * 0.004));
}

/** 重力反转区内部的相对时间不能压，否则天花板尖刺会跑出区域。 */
function rigidGap(events, previousTime, time) {
  return events.some((zone) => {
    if (zone.type !== 'flip') return false;
    const end = zone.t + zone.span;
    return previousTime >= zone.t - 0.02 && time <= end + 0.05;
  });
}

/** 把旧的事件时间压紧。喘息单独缩放，避免被密段的系数一起压没。 */
function warpEvents(events, levelNumber) {
  const sorted = events.map((event) => ({ ...event })).sort((a, b) => a.t - b.t);
  const oldTimes = sorted.map((event) => event.t);
  const shrink = shrinkOf(levelNumber);
  const breathShrink = breathShrinkOf(levelNumber);
  const newTimes = [round(Math.max(2.05, oldTimes[0]))];
  const rigid = [];
  for (let i = 1; i < oldTimes.length; i += 1) {
    const gap = oldTimes[i] - oldTimes[i - 1];
    const keep = rigidGap(sorted, oldTimes[i - 1], oldTimes[i]);
    rigid.push(keep);
    let nextGap = gap;
    if (!keep) {
      if (gap >= 1.4) {
        // 1.4 秒以上视为喘息。后期缩得多一些，但至少留 1.5 秒。
        nextGap = Math.max(1.5, gap * breathShrink);
      } else if (gap >= 1.2) {
        // 已经很紧的间隔不动，避免把能跳过的节奏压成死路。
        nextGap = Math.max(1.02, gap * shrink);
      }
    }
    newTimes.push(round(newTimes[newTimes.length - 1] + nextGap));
  }
  sorted.forEach((event, index) => {
    event.t = newTimes[index];
  });
  separateFlips(sorted);
  return { events: sorted, oldTimes, newTimes, rigid };
}

/** 只把互相叠住的反转区错开。区内的尖刺跟着整个区一起挪，相对位置不变。 */
function separateFlips(events) {
  const flips = events.filter((event) => event.type === 'flip').sort((a, b) => a.t - b.t);
  for (let i = 1; i < flips.length; i += 1) {
    const minStart = flips[i - 1].t + flips[i - 1].span + 0.85;
    if (flips[i].t >= minStart) continue;
    const shift = round(minStart - flips[i].t);
    const mark = flips[i].t;
    for (const event of events) {
      if (event.t >= mark - 0.001) event.t = round(event.t + shift);
    }
  }
}

function mapTime(oldT, oldTimes, newTimes) {
  if (!oldTimes.length) return oldT;
  if (oldT <= oldTimes[0]) {
    return round(oldT * (newTimes[0] / Math.max(0.01, oldTimes[0])));
  }
  for (let i = 1; i < oldTimes.length; i += 1) {
    if (oldT <= oldTimes[i]) {
      const span = oldTimes[i] - oldTimes[i - 1];
      const p = span === 0 ? 0 : (oldT - oldTimes[i - 1]) / span;
      return round(newTimes[i - 1] + p * (newTimes[i] - newTimes[i - 1]));
    }
  }
  const last = oldTimes.length - 1;
  return round(newTimes[last] + (oldT - oldTimes[last]));
}

function insideFlip(events, time) {
  return events.some((zone) => zone.type === 'flip' && time > zone.t + 0.05 && time < zone.t + zone.span - 0.05);
}

/**
 * 在中等空档里插入 1 到 2 个短障碍，形成 2 连或 3 连。
 * 不往 1.85 秒以上的喘息里塞东西。
 */
function insertCombos(events, levelNumber, insertRate) {
  const gap = comboGapOf(levelNumber);
  const late = levelNumber >= 15;
  const mid = levelNumber >= 8;
  const out = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    out.push(event);
    const nextT = i + 1 < events.length ? events[i + 1].t : Infinity;
    const room = nextT - event.t;
    if (room >= 1.85) continue;
    if (event.type === 'flip' || event.type === 'crumble' || event.type === 'gate') continue;
    if (insideFlip(events, event.t + gap)) continue;
    const salt = i + levelNumber * 3;
    // 前期大约每四个空档插一次 2 连，后期大多数空档都插，而且尽量做成 3 连。
    const slot = late ? 2 : mid ? 3 : 4;
    const divisor = Math.max(slot, Math.round(slot / Math.max(0.25, insertRate)));
    if (salt % divisor !== 0) continue;
    let want = 1;
    if ((late || (mid && salt % 2 === 0)) && room >= gap * 2 + 0.7) want = 2;
    let cursor = event.t;
    for (let k = 0; k < want; k += 1) {
      const at = round(cursor + gap);
      const remain = nextT - at;
      if (remain < 0.36) break;
      // 留出 0.7 秒，避免和后一个障碍粘成超过 3 的一长串。
      if (remain <= 0.7) break;
      if (insideFlip(events, at)) break;
      const count = late && k === 0 ? 2 : 1;
      out.push({ t: at, type: 'spike', count });
      cursor = at;
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function occupied(events) {
  return events.map((event) => {
    const span = event.span || 0.28;
    return [event.t - 0.4, event.t + span + 0.45];
  });
}

function isClear(time, blocks) {
  return blocks.every(([start, end]) => time < start || time > end);
}

function safeCheckpoints(events, duration) {
  const blocks = occupied(events);
  const flips = events.filter((event) => event.type === 'flip');
  const points = [];
  for (let time = 11; time < duration - 6 && points.length < 4; time += 12) {
    let cursor = time;
    const blocked = (value) => !isClear(value, blocks)
      || flips.some((zone) => value > zone.t - 0.4 && value < zone.t + zone.span + 0.4);
    for (let step = 0; step < 18 && blocked(cursor); step += 1) cursor += 0.4;
    if (!blocked(cursor) && cursor < duration - 3) points.push(round(cursor));
  }
  return points;
}

function safeStars(events, duration, allowAerial) {
  const blocks = occupied(events);
  const flips = events.filter((event) => event.type === 'flip');
  const times = events.map((event) => event.t).sort((a, b) => a - b);
  const clear = [];
  for (let time = 1.1; time < duration - 3.2; time += 0.25) {
    const t = round(time);
    if (!isClear(t, blocks)) continue;
    if (flips.some((zone) => t > zone.t - 0.35 && t < zone.t + zone.span + 0.35)) continue;
    clear.push(t);
  }
  const picks = [];
  for (const ratio of [0.06, 0.42, 0.72]) {
    const target = duration * ratio;
    let best = null;
    let bestDist = Infinity;
    for (const time of clear) {
      if (picks.some((picked) => Math.abs(picked - time) < 7)) continue;
      const dist = Math.abs(time - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = time;
      }
    }
    if (best != null) picks.push(best);
  }
  while (picks.length < 3) picks.push(round(1.2 + picks.length * 8));

  // 第二颗尽量放在孤立尖刺上方，沿用原来的跳跃捡星。
  let aerial = null;
  for (const event of events) {
    if (event.type !== 'spike' || event.anchor === 'ceiling') continue;
    if (flips.some((zone) => event.t > zone.t && event.t < zone.t + zone.span)) continue;
    const prev = [...times].reverse().find((time) => time < event.t - 0.05);
    const next = times.find((time) => time > event.t + 0.05);
    if (prev != null && event.t - prev < 1.2) continue;
    if (next != null && next - event.t < 1.3) continue;
    aerial = round(event.t + 0.05);
    break;
  }
  const stars = picks.map((t) => ({ t, lift: 0 }));
  if (allowAerial && aerial != null) stars[1] = { t: aerial, lift: 64 };
  return stars;
}

function tuningOf(level) {
  return { ...TUNING, speed: level.speed };
}

function solve(def) {
  validateLevel(def, `${def.id}.json`);
  const level = compileLevel(def, Number(def.id.slice(6)));
  const tuning = tuningOf(level);
  const problems = auditLevel(level, tuning);
  if (problems.length) return { ok: false, problems, level };
  const result = findClearPath(level, tuning);
  return { ...result, problems, level };
}

function densify(def, levelNumber, loosen, insertRate, allowAerial) {
  const warp = warpEvents(def.obstacles, levelNumber);
  // loosen 用来在搜不到路时把非喘息、非反转区内部的间隔稍微撑开。
  if (loosen > 0) {
    const rebuilt = [{ ...warp.events[0] }];
    for (let i = 1; i < warp.events.length; i += 1) {
      const prev = rebuilt[i - 1];
      const gap = warp.events[i].t - warp.events[i - 1].t;
      const extra = gap >= 1.8 || warp.rigid[i - 1] ? 0 : loosen;
      rebuilt.push({ ...warp.events[i], t: round(prev.t + gap + extra) });
    }
    warp.events = rebuilt;
    separateFlips(warp.events);
  }
  let events = insertRate > 0 ? insertCombos(warp.events, levelNumber, insertRate) : warp.events.map((event) => ({ ...event }));
  const lastT = events.reduce((max, event) => {
    if (event.type === 'flip' || event.type === 'crumble') return Math.max(max, event.t + event.span);
    return Math.max(max, event.t);
  }, 0);
  // 终点前至少留 1.6 秒。内容被撑出时长时，只把超出的部分按比例收回非喘息段。
  if (lastT > def.duration - 1.6) {
    const overflow = lastT - (def.duration - 1.6);
    const movable = [];
    for (let i = 1; i < events.length; i += 1) {
      const gap = events[i].t - events[i - 1].t;
      if (gap < 1.8 && !rigidGap(events, events[i - 1].t, events[i].t)) movable.push(i);
    }
    const cut = movable.length ? overflow / movable.length : 0;
    if (cut > 0 && cut < 0.25) {
      let shift = 0;
      for (let i = 1; i < events.length; i += 1) {
        if (movable.includes(i)) shift += cut;
        events[i] = { ...events[i], t: round(events[i].t - shift) };
      }
    }
  }
  events = events.map((event) => {
    const copy = { ...event };
    for (const key of Object.keys(copy)) {
      if (typeof copy[key] === 'number') copy[key] = round(copy[key]);
    }
    return copy;
  });
  rephaseGates(events);
  return {
    ...def,
    obstacles: events,
    stars: safeStars(events, def.duration, allowAerial),
    checkpoints: safeCheckpoints(events, def.duration),
  };
}

const baseline = JSON.parse(readFileSync(new URL('./baseline-difficulty.json', import.meta.url), 'utf8'));
const levelDir = new URL('../src/levels/', import.meta.url);
const already = JSON.parse(readFileSync(new URL('level-01.json', levelDir), 'utf8'));
const alreadyGap = levelMetrics(compileLevel(already, 1)).avgGap;
if (alreadyGap < baseline[0].avgGap - 0.05) {
  console.error('关卡已经加密过。要重来的话，先把 src/levels 恢复成基线再运行。');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(new URL('manifest.json', levelDir), 'utf8'));

function withFreshStars(def, allowAerial) {
  const next = structuredClone(def);
  next.checkpoints = safeCheckpoints(next.obstacles, next.duration);
  next.stars = safeStars(next.obstacles, next.duration, allowAerial);
  return next;
}

/** 中等空档里可以尝试插入的 2 连或 3 连。一次返回一整段。 */
function comboCandidates(events, levelNumber) {
  const gap = comboGapOf(levelNumber);
  const late = levelNumber >= 15;
  const candidates = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const nextT = i + 1 < events.length ? events[i + 1].t : Infinity;
    const room = nextT - event.t;
    if (room < gap + 0.72 || room >= 1.48) continue;
    if (event.type === 'flip' || event.type === 'crumble' || event.type === 'gate') continue;
    if (insideFlip(events, event.t + gap)) continue;
    const extras = [];
    const want = late && room >= gap * 2 + 0.75 ? 2 : 1;
    let cursor = event.t;
    for (let k = 0; k < want; k += 1) {
      const at = round(cursor + gap);
      if (nextT - at <= 0.7) break;
      if (insideFlip(events, at)) break;
      extras.push({ t: at, type: 'spike', count: late && k === 0 ? 2 : 1 });
      cursor = at;
    }
    if (extras.length) candidates.push(extras);
  }
  return candidates;
}

const levels = [];
for (let n = 1; n <= 20; n += 1) {
  const file = `level-${String(n).padStart(2, '0')}.json`;
  const original = JSON.parse(readFileSync(new URL(file, levelDir), 'utf8'));
  let solved = null;
  let def = null;
  for (const loosen of [0, 0.06, 0.12, 0.2, 0.3]) {
    def = densify(original, n, loosen, 0, false);
    const started = Date.now();
    solved = solve(def);
    if (solved.ok) {
      console.log(`level ${n} base ok in ${Date.now() - started}ms loosen=${loosen.toFixed(2)} n=${solved.level.obstacles.length}`);
      break;
    }
    console.log(`level ${n} base fail loosen=${loosen.toFixed(2)}`, solved.problems?.slice(0, 1), solved.reason, 'bestX', solved.bestX);
    solved = null;
  }
  if (!solved?.ok) {
    console.error('give up', n);
    process.exit(1);
  }

  // 能捡空中星就留一颗，捡不到就保持地面星。
  const aerial = withFreshStars(def, true);
  const aerialSolved = solve(aerial);
  if (aerialSolved.ok) {
    def = aerial;
    solved = aerialSolved;
  }

  const limit = 3 + Math.floor((n - 1) * 0.55);
  let added = 0;
  for (const extras of comboCandidates(def.obstacles, n)) {
    if (added >= limit) break;
    const trial = withFreshStars({
      ...def,
      obstacles: [...def.obstacles, ...extras].sort((a, b) => a.t - b.t),
    }, false);
    const trialSolved = solve(trial);
    if (!trialSolved.ok) continue;
    def = trial;
    solved = trialSolved;
    added += 1;
  }
  console.log(`level ${n} combos added ${added}/${limit} n=${solved.level.obstacles.length}`);
  levels.push({ def, level: solved.level });
}

function bumpUntilMonotonic(rows) {
  for (let i = 1; i < rows.length; i += 1) {
    const blocked = new Set();
    let guard = 0;
    while (guard < 40) {
      const prev = levelMetrics(rows[i - 1].level);
      const curr = levelMetrics(rows[i].level);
      if (curr.obstacles > prev.obstacles && curr.avgGap < prev.avgGap - 0.0005) break;
      const def = structuredClone(rows[i].def);
      let index = -1;
      for (let k = 0; k < def.obstacles.length; k += 1) {
        const event = def.obstacles[k];
        if (blocked.has(k)) continue;
        if (event.type !== 'spike' || event.anchor === 'ceiling') continue;
        if ((event.count || 1) >= 4) continue;
        index = k;
        break;
      }
      guard += 1;
      if (index < 0) {
        console.error(`第 ${i + 1} 关没有可以加长的尖刺`);
        break;
      }
      def.obstacles[index].count = (def.obstacles[index].count || 1) + 1;
      def.checkpoints = safeCheckpoints(def.obstacles, def.duration);
      def.stars = safeStars(def.obstacles, def.duration).map((star) => ({ t: star.t, lift: 0 }));
      const solved = solve(def);
      if (!solved.ok) {
        blocked.add(index);
        console.log(`level ${i + 1} bump rejected`, solved.problems?.[0] || solved.reason, solved.missed);
        continue;
      }
      rows[i] = { def, level: solved.level };
    }
  }
}

bumpUntilMonotonic(levels);

function levelCut(row, index) {
  return 1 - levelMetrics(row.level).avgGap / baseline[index].avgGap;
}

/** 把 0.66 到 0.95 秒的间隔收成 0.55 秒，变成 2 连。搜不到路就放弃这一处。 */
function pinchGaps(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const limit = 2 + Math.floor(i * 0.35);
    let pinched = 0;
    const blocked = new Set();
    let guard = 0;
    while (pinched < limit && guard < 24) {
      guard += 1;
      const events = rows[i].def.obstacles;
      let index = -1;
      for (let k = 1; k < events.length; k += 1) {
        if (blocked.has(k)) continue;
        const gap = events[k].t - events[k - 1].t;
        if (gap < 0.64 || gap > 1.05) continue;
        if (rigidGap(events, events[k - 1].t, events[k].t)) continue;
        const left = events[k - 1].type;
        const right = events[k].type;
        if (left === 'flip' || left === 'crumble' || left === 'gate') continue;
        if (right === 'flip' || right === 'crumble' || right === 'gate') continue;
        index = k;
        break;
      }
      if (index < 0) break;
      const def = structuredClone(rows[i].def);
      const delta = def.obstacles[index].t - def.obstacles[index - 1].t - 0.55;
      for (let k = index; k < def.obstacles.length; k += 1) {
        def.obstacles[k].t = round(def.obstacles[k].t - delta);
      }
      const next = withFreshStars(def, false);
      const solved = solve(next);
      if (!solved.ok) {
        blocked.add(index);
        continue;
      }
      const metrics = levelMetrics(solved.level);
      if (i > 0) {
        const prev = levelMetrics(rows[i - 1].level);
        if (!(metrics.obstacles >= prev.obstacles && metrics.avgGap < prev.avgGap - 0.0005)) {
          blocked.add(index);
          continue;
        }
      }
      if (i + 1 < rows.length) {
        const nxt = levelMetrics(rows[i + 1].level);
        if (!(metrics.obstacles <= nxt.obstacles && metrics.avgGap > nxt.avgGap + 0.0005)) {
          blocked.add(index);
          continue;
        }
      }
      rows[i] = { def: next, level: solved.level, blocked: rows[i].blocked };
      pinched += 1;
    }
    if (pinched) console.log(`level ${i + 1} pinched ${pinched}`);
  }
}

function tryBump(rows, i) {
  const blocked = rows[i].blocked || new Set();
  rows[i].blocked = blocked;
  const source = rows[i].def.obstacles;
  let index = -1;
  for (let k = 0; k < source.length; k += 1) {
    const event = source[k];
    if (blocked.has(k)) continue;
    if (event.type !== 'spike' || event.anchor === 'ceiling') continue;
    if ((event.count || 1) >= (i >= 12 ? 4 : 3)) continue;
    index = k;
    break;
  }
  if (index < 0) return false;
  const def = structuredClone(rows[i].def);
  def.obstacles[index].count = (def.obstacles[index].count || 1) + 1;
  const next = withFreshStars(def, false);
  const solved = solve(next);
  if (!solved.ok) {
    blocked.add(index);
    return tryBump(rows, i);
  }
  const metrics = levelMetrics(solved.level);
  if (i > 0) {
    const prev = levelMetrics(rows[i - 1].level);
    if (!(metrics.obstacles > prev.obstacles && metrics.avgGap < prev.avgGap - 0.0005)) {
      blocked.add(index);
      return false;
    }
  }
  if (i + 1 < rows.length) {
    const nxt = levelMetrics(rows[i + 1].level);
    if (!(metrics.obstacles < nxt.obstacles && metrics.avgGap > nxt.avgGap + 0.0005)) {
      blocked.add(index);
      return false;
    }
  }
  rows[i] = { def: next, level: solved.level, blocked };
  return true;
}

pinchGaps(levels);

// 从最后一关往前加尖刺，让缩短比例落到大约 26% 到 33%，并且越往后越多。
for (let i = levels.length - 1; i >= 0; i -= 1) {
  const target = 0.26 + (i / 19) * 0.07;
  let guard = 0;
  while (levelCut(levels[i], i) < target && guard < 50) {
    guard += 1;
    if (!tryBump(levels, i)) break;
  }
  console.log(`level ${i + 1} cut ${(levelCut(levels[i], i) * 100).toFixed(1)}% target ${(target * 100).toFixed(0)}%`);
}

/** 每一关至少留出几段 2 连或 3 连。后期要求更多。 */
function ensureCombos(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const min = i >= 14 ? 6 : i >= 7 ? 3 : 2;
    let guard = 0;
    while (eventComboStats(rows[i].def).count < min && guard < 16) {
      guard += 1;
      if (!forceOneCombo(rows, i)) break;
    }
    const stats = eventComboStats(rows[i].def);
    console.log(`level ${i + 1} combos now ${stats.count} max ${stats.max}`);
  }
}

function forceOneCombo(rows, i) {
  const events = rows[i].def.obstacles;
  const blocked = rows[i].comboBlocked || new Set();
  rows[i].comboBlocked = blocked;
  for (let k = 1; k < events.length; k += 1) {
    if (blocked.has(k)) continue;
    const gap = events[k].t - events[k - 1].t;
    if (gap < 1.15 || gap >= 1.48) continue;
    if (rigidGap(events, events[k - 1].t, events[k].t)) continue;
    const left = events[k - 1];
    if (left.type === 'flip' || left.type === 'crumble' || left.type === 'gate') continue;
    const def = structuredClone(rows[i].def);
    def.obstacles.push({
      t: round(left.t + 0.52),
      type: 'spike',
      count: i >= 14 ? 2 : 1,
    });
    def.obstacles.sort((a, b) => a.t - b.t);
    const next = withFreshStars(def, false);
    const solved = solve(next);
    if (!solved.ok) {
      blocked.add(k);
      continue;
    }
    const metrics = levelMetrics(solved.level);
    const stats = eventComboStats(next);
    if (stats.count <= eventComboStats(rows[i].def).count) {
      blocked.add(k);
      continue;
    }
    if (i > 0) {
      const prev = levelMetrics(rows[i - 1].level);
      if (!(metrics.obstacles > prev.obstacles && metrics.avgGap < prev.avgGap - 0.0005)) {
        blocked.add(k);
        continue;
      }
    }
    if (i + 1 < rows.length) {
      const nxt = levelMetrics(rows[i + 1].level);
      if (!(metrics.obstacles < nxt.obstacles && metrics.avgGap > nxt.avgGap + 0.0005)) {
        blocked.add(k);
        continue;
      }
    }
    rows[i] = { def: next, level: solved.level, blocked: rows[i].blocked, comboBlocked: blocked };
    return true;
  }
  return false;
}

ensureCombos(levels);

let ratioSum = 0;
const earlyCut = [];
const lateCut = [];
console.log('\n指标');
for (const item of levels) {
  const metrics = levelMetrics(item.level);
  const before = baseline[metrics.index - 1];
  const ratio = metrics.avgGap / before.avgGap;
  ratioSum += ratio;
  if (metrics.index <= 6) earlyCut.push(1 - ratio);
  if (metrics.index >= 15) lateCut.push(1 - ratio);
  const combos = eventComboStats(item.def);
  const breaths = eventBreathCount(item.def);
  console.log([
    String(metrics.index).padStart(2, ' '),
    `n=${metrics.obstacles}(${before.obstacles})`,
    `gap=${metrics.avgGap.toFixed(3)}`,
    `was=${before.avgGap.toFixed(3)}`,
    `cut=${((1 - ratio) * 100).toFixed(1)}%`,
    `combo=${combos.count}`,
    `max=${combos.max}`,
    `p=${combos.pairs}`,
    `t3=${combos.triples}`,
    `long=${combos.longer}`,
    `breath=${breaths}`,
    `v=${metrics.speed}`,
    `dur=${item.def.duration}`,
  ].join('  '));
  if (metrics.speed !== before.speed) {
    console.error('跑速被改了', metrics.index);
    process.exit(1);
  }
  if (item.def.duration !== before.duration) {
    console.error('时长被改了', metrics.index);
    process.exit(1);
  }
}
const meanCut = 1 - ratioSum / levels.length;
const earlyMean = earlyCut.reduce((sum, value) => sum + value, 0) / earlyCut.length;
const lateMean = lateCut.reduce((sum, value) => sum + value, 0) / lateCut.length;
console.log(`\n平均缩短 ${(meanCut * 100).toFixed(2)}%  前期 ${(earlyMean * 100).toFixed(1)}%  后期 ${(lateMean * 100).toFixed(1)}%`);

for (let i = 1; i < levels.length; i += 1) {
  const prev = levelMetrics(levels[i - 1].level);
  const curr = levelMetrics(levels[i].level);
  if (!(curr.obstacles > prev.obstacles && curr.avgGap < prev.avgGap - 0.0005)) {
    console.error(`难度曲线不单调: ${i} -> ${i + 1}`, prev.obstacles, curr.obstacles, prev.avgGap, curr.avgGap);
    process.exit(1);
  }
}

if (meanCut < 0.25 || meanCut > 0.35 || !(lateMean > earlyMean)) {
  console.error('缩短比例不在目标里');
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
