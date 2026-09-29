/**
 * 计分、死亡、捡星星、存档点和终点。
 * 这些函数不依赖 Phaser，方便 headless 测试，场景里直接调用。
 */

/** 一局开始时的计数。collected 用 Set 记住已经捡过的星星 id。 */
export function createRunState() {
  return {
    score: 0,
    deaths: 0,
    stars: 0,
    maxDistance: 0,
    collected: new Set(),
  };
}

/**
 * 按本局最远距离更新分数。死亡被传回存档点后，距离变小也不会把分数扣回去。
 */
export function noteProgress(state, distancePx, pxPerScore) {
  const distance = Math.max(0, distancePx);
  const maxDistance = Math.max(state.maxDistance, distance);
  const score = Math.floor(maxDistance / pxPerScore);
  return { ...state, maxDistance, score };
}

/** 死亡次数加一。星星和分数保持原样。 */
export function noteDeath(state) {
  return { ...state, deaths: state.deaths + 1 };
}

/**
 * 捡到一颗星星。同一 id 只会加一次。
 * 返回新状态，以及这次是不是新捡到的。
 */
export function noteStar(state, starId) {
  if (state.collected.has(starId)) {
    return { state, picked: false };
  }
  const collected = new Set(state.collected);
  collected.add(starId);
  return {
    state: { ...state, collected, stars: state.stars + 1 },
    picked: true,
  };
}

/**
 * 选择不大于玩家当前位置的最近存档点。
 * checkpoints 必须从小到大排好。
 */
export function pickCheckpoint(checkpoints, playerX) {
  let chosen = checkpoints[0];
  for (const point of checkpoints) {
    if (point <= playerX) chosen = point;
    else break;
  }
  return chosen;
}

/** 玩家中心越过终点线即通关。 */
export function reachedFinish(playerX, finishX) {
  return playerX >= finishX;
}
