/**
 * 生成 20 关 JSON。跑速、障碍数量和间隔按关卡编号递增。
 * 生成后用和游戏相同的搜索确认能通关并捡满星星，不通过就加宽间隔重试。
 */
import { writeFileSync } from 'node:fs';
import { auditLevel } from '../src/logic/audit.js';
import { findClearPath } from '../src/logic/search.js';
import { TUNING } from '../src/logic/world.js';
import { compileLevel } from '../src/game/compileLevel.js';
import { validateLevel, validateManifest } from '../src/game/levelSchema.js';
import { levelMetrics, suggestedUnlock } from '../src/game/metrics.js';
import { LEVEL_PALETTES } from '../src/game/theme.js';

const AIR = 0.8667;

const NAMES = [
  '紫色冲刺',
  '紫晶连跳',
  '靛色窄缝',
  '玫红平台',
  '夜紫疾走',
  '裂隙初现',
  '坠台连跳',
  '闸门初开',
  '开合之间',
  '双闸窄道',
  '密门节奏',
  '倒悬入口',
  '天花板',
  '坠门交织',
  '反转尖刺',
  '深渊节奏',
  '三重机关',
  '无缝连跳',
  '终幕前夜',
  '夜紫终章',
];

function round(value) {
  return Math.round(value * 100) / 100;
}

function phaseFor(t, period, open, mode) {
  const target = mode === 'open' ? open * 0.45 : open + (period - open) * 0.55;
  return round(target - (t % period));
}

function buildDef(levelNumber, pad) {
  const speed = 318 + (levelNumber - 1) * 6;
  const denseGap = Math.max(1.05, 1.52 - (levelNumber - 1) * 0.028) + pad;
  const events = [];
  let t = 2.15;
  let introduced = { crumble: false, gate: false, flip: false, flipCourse: false };
  // 新机关先单独出现：前后留出喘息，再进入后面的组合。
  if (levelNumber === 5) {
    events.push({ t, type: 'crumble', span: 1.18, delay: 0.52 });
    introduced.crumble = true;
    t += 1.18 + 1.7;
  } else if (levelNumber === 8) {
    events.push({
      t,
      type: 'gate',
      period: 1.4,
      open: 0.62,
      phase: phaseFor(t, 1.4, 0.62, 'closed'),
    });
    introduced.gate = true;
    t += 1.7;
  } else if (levelNumber === 12) {
    events.push({ t, type: 'flip', span: 2.35 });
    introduced.flip = true;
    t += 2.35 + 1.15;
  }
  let guard = 0;
  let segment = 0;
  const limit = 56 + (levelNumber % 4);

  while (t < limit && guard < 120) {
    guard += 1;
    // 密集段和喘息段交替。密集段多放几组，喘息段只留空和存档点。
    const dense = segment % 2 === 0;
    segment += 1;
    if (!dense) {
      t += 2.15 + pad * 0.25;
      continue;
    }

    const burst = 3 + Math.floor(levelNumber / 5);
    for (let i = 0; i < burst && t < limit; i += 1) {
      const kind = pickKind(levelNumber, events, introduced);
      const placed = placeKind(kind, t, speed, levelNumber);
      events.push(...placed);
      if (kind === 'crumble') introduced.crumble = true;
      if (kind === 'gate' || kind === 'over-gate') introduced.gate = true;
      if (kind === 'flip' || kind === 'flip-empty') introduced.flip = true;
      if (kind === 'flip') introduced.flipCourse = true;
      const last = placed[placed.length - 1];
      t = advanceAfter(placed, denseGap);
      if (last.type === 'flip') t = Math.max(t, last.t + last.span + 0.9);
      if (last.type === 'crumble') t = Math.max(t, last.t + last.span + 0.5);
    }
  }

  const lastT = events.reduce((max, item) => {
    if (item.type === 'flip' || item.type === 'crumble') return Math.max(max, item.t + item.span);
    return Math.max(max, item.t);
  }, 0);
  let duration = Math.round(Math.max(64, Math.min(86, lastT + 3.1)));
  if (duration <= lastT + 1.6) duration = Math.min(90, Math.ceil(lastT + 2.4));

  const obstacles = events.map(cleanEvent);
  return {
    id: `level-${levelNumber}`,
    name: NAMES[levelNumber - 1],
    speed,
    duration,
    palette: LEVEL_PALETTES[levelNumber - 1].id,
    obstacles,
    stars: buildStars(obstacles, duration),
    checkpoints: safeCheckpoints(obstacles, duration),
  };
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
  const points = [];
  for (let time = 11; time < duration - 6 && points.length < 4; time += 12) {
    let cursor = time;
    for (let step = 0; step < 16 && !isClear(cursor, blocks); step += 1) cursor += 0.45;
    if (isClear(cursor, blocks) && cursor < duration - 3) points.push(round(cursor));
  }
  return points;
}

function buildStars(events, duration) {
  const blocks = occupied(events);
  const spikes = events.filter((item) => {
    if (item.type !== 'spike' || item.anchor === 'ceiling') return false;
    return !events.some((zone) => zone.type === 'flip' && item.t > zone.t && item.t < zone.t + zone.span);
  });
  const ground = [1.15];
  for (let time = 6; time < duration - 4 && ground.length < 6; time += 3.5) {
    if (isClear(time, blocks)) ground.push(round(time));
  }
  const mid = spikes[Math.floor(spikes.length * 0.4)];
  const late = spikes[Math.floor(spikes.length * 0.75)];
  const stars = [{ t: 1.15, lift: 0 }];
  if (mid) stars.push({ t: round(mid.t + 0.05), lift: 70 });
  else stars.push({ t: ground[1] || 8, lift: 0 });
  if (late && late !== mid) stars.push({ t: round(late.t + 0.06), lift: 98 });
  else stars.push({ t: ground[2] || ground[1] || 14, lift: 0 });
  return stars;
}

function cleanEvent(event) {
  const copy = { ...event };
  delete copy.mode;
  for (const key of Object.keys(copy)) {
    if (typeof copy[key] === 'number') copy[key] = round(copy[key]);
  }
  return copy;
}

function pickKind(levelNumber, events, introduced) {
  if (levelNumber >= 5 && !introduced.crumble) return 'crumble';
  if (levelNumber >= 8 && !introduced.gate) return 'gate';
  if (levelNumber >= 12 && !introduced.flip) return 'flip-empty';
  if (levelNumber >= 12 && introduced.flip && !introduced.flipCourse) return 'flip';

  const roll = events.length + levelNumber * 3;
  const bag = ['spike1', 'spike2', 'block', 'overhead'];
  if (levelNumber >= 2) bag.push('spike2', 'over-spike');
  if (levelNumber >= 3) bag.push('spike3');
  if (levelNumber >= 4) bag.push('spike3', 'block');
  if (levelNumber >= 6) bag.push('crumble');
  if (levelNumber >= 9) bag.push('gate', 'over-gate');
  if (levelNumber >= 10) bag.push('spike2', 'over-spike');
  if (levelNumber >= 13) bag.push('flip');
  if (levelNumber >= 15) bag.push('crumble', 'over-gate', 'spike3');
  if (levelNumber >= 18) bag.push('flip', 'gate', 'spike3');
  return bag[roll % bag.length];
}

function placeKind(kind, t, speed, levelNumber) {
  const period = 1.4;
  const open = 0.62;
  if (kind === 'spike1') return [{ t, type: 'spike', count: 1 }];
  if (kind === 'spike2') return [{ t, type: 'spike', count: 2 }];
  if (kind === 'spike3') return [{ t, type: 'spike', count: levelNumber >= 16 ? 3 : 3 }];
  if (kind === 'block') return [{ t, type: 'block' }];
  if (kind === 'overhead') return [{ t, type: 'overhead', gap: 58 }];
  if (kind === 'over-spike') {
    return [
      { t, type: 'overhead', gap: 58 },
      { t: t + 0.78, type: 'spike', count: levelNumber >= 14 ? 3 : 2 },
    ];
  }
  if (kind === 'crumble') {
    return [{ t, type: 'crumble', span: 1.18, delay: 0.52 }];
  }
  if (kind === 'gate') {
    return [{
      t,
      type: 'gate',
      period,
      open,
      phase: phaseFor(t, period, open, 'closed'),
    }];
  }
  if (kind === 'over-gate') {
    const gateT = t + 0.86;
    return [
      { t, type: 'overhead', gap: 58 },
      {
        t: gateT,
        type: 'gate',
        period,
        open,
        phase: phaseFor(gateT, period, open, 'closed'),
      },
    ];
  }
  if (kind === 'flip-empty') {
    return [{ t, type: 'flip', span: 2.35 }];
  }
  if (kind === 'flip') {
    const span = levelNumber >= 18 ? 4.15 : 3.55;
    const events = [
      { t, type: 'flip', span },
      { t: t + 1.2, type: 'spike', anchor: 'ceiling', count: 1 },
      { t: t + 2.35, type: 'spike', anchor: 'ceiling', count: levelNumber >= 16 ? 2 : 1 },
    ];
    if (levelNumber >= 15) {
      events.push({ t: t + 1.55, type: 'spike', count: 2 });
    }
    if (span > 3.8) {
      events.push({ t: t + 3.25, type: 'spike', anchor: 'ceiling', count: 1 });
    }
    return events;
  }
  return [{ t, type: 'spike', count: 1 }];
}

function advanceAfter(placed, denseGap) {
  const last = placed[placed.length - 1];
  if (placed.length > 1 && placed[0].type === 'overhead') {
    return last.t + denseGap * 0.92;
  }
  if (last.type === 'overhead' && placed.length === 1) return last.t + 0.72;
  if (last.type === 'crumble') return last.t + last.span + 0.55;
  if (last.type === 'flip') return last.t + last.span + 0.95;
  return placed[0].t + denseGap;
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

function softenStars(def) {
  const next = structuredClone(def);
  next.stars = next.stars.map((star, index) => {
    if (index === 0) return star;
    if (star.lift > 36) return { ...star, lift: Math.max(0, star.lift - 34) };
    return star;
  });
  return next;
}

const levels = [];
for (let n = 1; n <= 20; n += 1) {
  let pad = 0;
  let solved = null;
  let def = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    def = buildDef(n, pad);
    if (attempt >= 2) def = softenStars(def);
    if (attempt >= 5) {
      def = softenStars(def);
      def.stars = [
        { t: 1.2, lift: 0 },
        { t: round(def.duration * 0.45), lift: 0 },
        { t: round(def.duration * 0.72), lift: 0 },
      ];
    }
    const started = Date.now();
    solved = solve(def);
    const ms = Date.now() - started;
    if (solved.ok) {
      console.log(`level ${n} ok in ${ms}ms pad=${pad.toFixed(2)} obstacles=${solved.level.obstacles.length} seen=${solved.seen}`);
      break;
    }
    console.log(`level ${n} fail attempt ${attempt} in ${ms}ms`, solved.problems?.slice(0, 3), solved.reason, solved.missed, 'bestX', solved.bestX);
    pad += 0.08;
  }
  if (!solved?.ok) {
    console.error('give up', n, JSON.stringify(def, null, 2).slice(0, 1500));
    process.exit(1);
  }
  levels.push({ def, level: solved.level });
}

// 障碍数量严格变多，平均间隔严格变小。在已有障碍的空档里补尖刺。
for (let i = 1; i < levels.length; i += 1) {
  let guard = 0;
  while (guard < 24) {
    const prev = levelMetrics(levels[i - 1].level);
    const curr = levelMetrics(levels[i].level);
    if (curr.obstacles > prev.obstacles && curr.avgGap < prev.avgGap - 0.001) break;
    const def = structuredClone(levels[i].def);
    const times = def.obstacles.map((item) => item.t).sort((a, b) => a - b);
    let slot = null;
    let widest = 0;
    for (let k = 1; k < times.length; k += 1) {
      const gap = times[k] - times[k - 1];
      if (gap > widest && gap > 0.8) {
        widest = gap;
        slot = times[k - 1] + gap * 0.5;
      }
    }
    if (slot == null) break;
    def.obstacles.push({ t: round(slot), type: 'spike', count: guard % 3 === 2 ? 2 : 1 });
    def.obstacles.sort((a, b) => a.t - b.t);
    def.checkpoints = safeCheckpoints(def.obstacles, def.duration);
    const solved = solve(def);
    guard += 1;
    if (!solved.ok) {
      console.log(`level ${i + 1} filler rejected`, solved.problems?.[0] || solved.reason, solved.missed);
      continue;
    }
    levels[i] = { def, level: solved.level };
  }
}

const manifest = {
  levels: levels.map((item, index) => ({
    file: `level-${String(index + 1).padStart(2, '0')}.json`,
    unlockStars: suggestedUnlock(index + 1),
  })),
};

const files = {};
levels.forEach((item, index) => {
  const name = manifest.levels[index].file;
  files[name] = item.def;
  writeFileSync(new URL(`../src/levels/${name}`, import.meta.url), `${JSON.stringify(item.def, null, 2)}\n`);
});
validateManifest(manifest, files);
writeFileSync(new URL('../src/levels/manifest.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);

console.log('\n指标');
for (const item of levels) {
  const metrics = levelMetrics(item.level);
  console.log([
    String(metrics.index).padStart(2, ' '),
    metrics.name,
    `v=${metrics.speed}`,
    `n=${metrics.obstacles}`,
    `gap=${metrics.avgGap.toFixed(3)}`,
    `t=${metrics.duration.toFixed(1)}`,
    metrics.typeLabels.join('/'),
  ].join('  '));
}
