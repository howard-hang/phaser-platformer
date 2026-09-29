/**
 * 第一关的剧本。
 * 时间单位是秒，0 表示玩家出发的瞬间。坐标由速度换算，方便以后加关时照着抄。
 * 尖刺和地面方块必须跳过去；头顶方块要贴着地面跑过去，跳起来会撞死。
 */
import { HITBOX, TUNING } from '../logic/world.js';

const START_X = 240;

/** 第 t 秒时，跑道上的世界坐标。 */
function xAt(t) {
  return Math.round(START_X + t * TUNING.speed);
}

/**
 * 把紧凑剧本展开成障碍、星星和存档点。
 * 每个地面障碍的 t 是它左边缘出现的时间。
 */
function buildLevel() {
  const obstacles = [];
  const stars = [];
  const checkpoints = [START_X];

  function addSpikes(t, count) {
    const spec = HITBOX.spike;
    const left = xAt(t);
    for (let i = 0; i < count; i += 1) {
      obstacles.push({
        id: `spike-${t}-${i}`,
        type: 'spike',
        x: left + spec.w / 2 + i * spec.w,
      });
    }
  }

  function addBlock(t) {
    const spec = HITBOX.block;
    obstacles.push({
      id: `block-${t}`,
      type: 'block',
      x: xAt(t) + spec.w / 2,
    });
  }

  function addOverhead(t) {
    const spec = HITBOX.block;
    obstacles.push({
      id: `over-${t}`,
      type: 'overhead',
      x: xAt(t) + spec.w / 2,
      // 方块底边离地的空隙，站立的玩家能钻过去。
      gap: 58,
    });
  }

  function addStar(t, lift = 0, dx = 0) {
    stars.push({
      id: `star-${t}-${lift}`,
      // dx 把空中星星挪到起跳弧线上，正常跳过去就能捡到。
      x: xAt(t) + dx,
      lift,
    });
  }

  function addCheckpoint(t) {
    checkpoints.push(xAt(t));
  }

  // 开场先让玩家看清自动跑，并顺手捡到第一颗星。
  addStar(1.5, 0);
  addSpikes(3.2, 1);
  addStar(4.6, 58, 40);
  addSpikes(5.0, 1);
  addSpikes(6.8, 2);
  addStar(8.2, 58, 40);
  addBlock(8.6);
  addSpikes(10.4, 2);
  addOverhead(12.2);
  addStar(13.4, 0);
  addSpikes(14.2, 1);
  addSpikes(16.0, 2);
  addBlock(17.8);
  addStar(18.8, 0);
  addCheckpoint(19.6);

  addSpikes(21.4, 3);
  addStar(22.8, 58, 40);
  addBlock(23.2);
  addSpikes(25.0, 2);
  addOverhead(26.8);
  addSpikes(28.8, 2);
  addStar(30.2, 58, 40);
  addBlock(30.6);
  addSpikes(32.4, 3);
  addSpikes(34.2, 1);
  addStar(35.2, 0);
  addCheckpoint(36.0);

  addSpikes(37.8, 2);
  addOverhead(39.6);
  addStar(41.2, 58, 40);
  addSpikes(41.6, 3);
  addBlock(43.4);
  addSpikes(45.2, 2);
  addOverhead(47.0);
  addStar(48.4, 0);
  addSpikes(49.0, 3);
  addStar(50.4, 58, 40);
  addSpikes(50.8, 2);
  addBlock(52.6);
  addStar(53.6, 0);
  addCheckpoint(54.4);

  addSpikes(56.2, 3);
  addOverhead(58.0);
  addStar(60.3, 116, 20);
  addSpikes(60.0, 2);
  addSpikes(61.8, 3);
  addBlock(63.6);
  addOverhead(65.4);
  addStar(66.6, 0);
  addSpikes(67.4, 3);
  addSpikes(69.2, 2);
  addStar(70.6, 58, 40);
  addBlock(71.0);
  addSpikes(72.8, 2);

  const finishX = xAt(75);

  return {
    id: 'level-1',
    name: '紫色冲刺',
    startX: START_X,
    finishX,
    // 终点后再留一屏，摄像机不会把终点门卡在边缘。
    worldWidth: finishX + TUNING.viewWidth,
    checkpoints,
    obstacles,
    stars,
  };
}

export const LEVEL = buildLevel();
