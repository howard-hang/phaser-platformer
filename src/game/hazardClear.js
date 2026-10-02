/**
 * 把已经算进关卡数据里的障碍从画面上拿掉。
 * 无尽模式的数据在片段上，只改本帧的视图的话，下一帧又会被拼回来。
 */
import { TUNING, obstaclePose } from '../logic/world.js';

function destroyObject(obj) {
  if (!obj || !obj.scene) return;
  obj.destroy();
}

function pull(list, item) {
  if (!list) return;
  const index = list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}

/** 爆炸圈要画在障碍原来的位置上。 */
export function obstacleBurstPoint(obstacle, tuning = TUNING) {
  if (Number.isFinite(obstacle?.x0) && Number.isFinite(obstacle?.x1)) {
    return { x: (obstacle.x0 + obstacle.x1) / 2, y: tuning.groundY - 28 };
  }
  const pose = obstaclePose(obstacle, tuning, 0, { forceClosed: true });
  if (!pose) return { x: obstacle.x, y: tuning.groundY - 24 };
  return { x: pose.cx, y: pose.cy };
}

/**
 * 按 id 清掉障碍的数据和贴图。
 * 平台、地面和反转区不走这里。
 */
export function removeObstacles(scene, removed) {
  const points = [];
  if (!removed?.length) return points;
  const ids = new Set();
  for (let i = 0; i < removed.length; i += 1) {
    ids.add(removed[i].id);
    points.push(obstacleBurstPoint(removed[i]));
  }
  if (scene.level?.obstacles) {
    scene.level.obstacles = scene.level.obstacles.filter((obstacle) => !ids.has(obstacle.id));
  }
  const live = scene.stream?.live;
  if (live) {
    for (let i = 0; i < live.length; i += 1) {
      const piece = live[i];
      if (!piece.obstacles) continue;
      piece.obstacles = piece.obstacles.filter((obstacle) => !ids.has(obstacle.id));
    }
  }

  const nodes = [];
  const courseNodes = scene.courseNodes || [];
  for (let i = 0; i < courseNodes.length; i += 1) {
    const node = courseNodes[i];
    if (!ids.has(node.obstacle.id)) {
      nodes.push(node);
      continue;
    }
    pull(scene.hazardSprites, node.sprite);
    destroyObject(node.sprite);
  }
  scene.courseNodes = nodes;

  const crumbles = [];
  const list = scene.crumbles || [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!ids.has(item.obstacle.id)) {
      crumbles.push(item);
      continue;
    }
    pull(scene.hazardSprites, item.kill);
    destroyObject(item.kill);
    const tiles = item.tiles || [];
    for (let t = 0; t < tiles.length; t += 1) destroyObject(tiles[t]);
  }
  scene.crumbles = crumbles;
  return points;
}
