/**
 * 无尽模式的一段障碍怎么摆上画面、怎么拆掉。
 * 跑过的段要销毁贴图和刚体，避免越跑对象越多。
 */
import { HITBOX, TUNING, FLIP_CEILING_Y, obstaclePose, starPose } from '../logic/world.js';
import { THEME } from './theme.js';

function applyHitbox(sprite, spec) {
  sprite.body.setSize(spec.bodyW, spec.bodyH, false);
  sprite.body.setOffset(spec.offsetX, spec.offsetY);
}

function destroyObject(obj) {
  if (!obj || !obj.scene) return;
  obj.destroy();
}

/** 碰撞组先建好。后面新加的障碍不用重新注册 overlap。 */
export function createEndlessGroups(scene) {
  const hazards = scene.physics.add.staticGroup();
  const stars = scene.physics.add.staticGroup();
  scene.physics.add.overlap(scene.player, hazards, () => scene.onHazard(), null, scene);
  scene.physics.add.overlap(scene.player, stars, (_player, star) => scene.onStar(star), null, scene);
  return { hazards, stars };
}

/** 把一个已经算好坐标的片段摆进场景。 */
export function mountEndlessPiece(scene, groups, piece) {
  const nodes = [];
  const crumbles = [];
  const flips = [];
  const decks = [];
  const objects = [];
  // 每段自己的碰撞器。段拆掉时要一起销毁，否则会一直留在物理世界里。
  const colliders = [];

  for (const obstacle of piece.obstacles) {
    if (obstacle.type === 'flip') {
      const zone = piece.flips.find((item) => item.id === obstacle.id) || obstacle;
      const width = Math.max(8, zone.x1 - zone.x0);
      const cx = (zone.x0 + zone.x1) / 2;
      const visual = scene.add.rectangle(
        cx,
        (FLIP_CEILING_Y + TUNING.groundY) / 2,
        width,
        TUNING.groundY - FLIP_CEILING_Y,
        0x67e8f9,
        0.22,
      ).setDepth(1);
      const ceiling = scene.add.rectangle(cx, FLIP_CEILING_Y - 10, width, 20, 0xffffff).setDepth(3);
      scene.physics.add.existing(ceiling, true);
      colliders.push(scene.physics.add.collider(scene.player, ceiling));
      objects.push(visual, ceiling);
      const entry = { ...zone, visual, ceiling };
      flips.push(entry);
      scene.flipVisuals.push(entry);
      continue;
    }
    if (obstacle.type === 'crumble') {
      const tiles = [];
      const tileW = HITBOX.block.w;
      const baseY = TUNING.groundY - tileW / 2;
      for (let x = obstacle.x0 + tileW / 2; x < obstacle.x1 - 8; x += tileW) {
        const tile = scene.add.image(x, baseY, 'crumble').setDepth(3);
        tiles.push(tile);
        objects.push(tile);
      }
      const width = Math.max(8, obstacle.x1 - obstacle.x0);
      const kill = scene.add.rectangle(
        (obstacle.x0 + obstacle.x1) / 2,
        TUNING.groundY - 23,
        width,
        46,
        0x000000,
        0,
      );
      scene.physics.add.existing(kill, true);
      kill.body.enable = false;
      groups.hazards.add(kill);
      objects.push(kill);
      const entry = {
        obstacle,
        tiles,
        kill,
        baseY,
        x0: obstacle.x0,
        x1: obstacle.x1,
      };
      crumbles.push(entry);
      scene.crumbles.push(entry);
      scene.hazardSprites.push(kill);
      continue;
    }
    const pose = obstaclePose(
      obstacle,
      scene.tuning,
      0,
      obstacle.type === 'gate' ? { forceClosed: true } : {},
    );
    if (!pose) continue;
    const sprite = scene.physics.add.staticSprite(pose.cx, pose.cy, pose.key);
    applyHitbox(sprite, pose.spec);
    sprite.setDepth(5);
    sprite.setData('id', obstacle.id);
    groups.hazards.add(sprite);
    objects.push(sprite);
    scene.hazardSprites.push(sprite);
    const node = {
      obstacle,
      sprite,
      x: obstacle.x,
      baseY: pose.cy,
    };
    nodes.push(node);
    scene.courseNodes.push(node);
  }

  for (const star of piece.stars) {
    const pose = starPose(star);
    const sprite = scene.physics.add.staticSprite(pose.cx, pose.cy, pose.key);
    applyHitbox(sprite, pose.spec);
    sprite.setDepth(4);
    sprite.setData('id', star.id);
    groups.stars.add(sprite);
    objects.push(sprite);
    scene.starSprites.push(sprite);
  }

  for (const deck of piece.decks) {
    const width = Math.max(8, deck.x1 - deck.x0);
    const cx = (deck.x0 + deck.x1) / 2;
    const color = deck.kind === 'step' ? 0xfde68a : (deck.layer >= 3 ? 0xfde047 : 0x67e8f9);
    const slab = scene.add.rectangle(cx, deck.top + 4, width, 8, color).setDepth(3);
    const lip = scene.add.rectangle(cx, deck.top + 1, width, 3, 0xffffff).setDepth(4);
    const mark = scene.add.rectangle(deck.x0 + 10, deck.top - 12, 6, 20, 0xffffff).setDepth(4);
    const body = scene.add.rectangle(cx, deck.top + 3, width, 6, 0x000000, 0);
    scene.physics.add.existing(body, true);
    body.setData('deck', deck);
    colliders.push(scene.physics.add.collider(
      scene.player,
      body,
      null,
      (_player, plat) => scene.canLandOnDeck(plat),
      scene,
    ));
    objects.push(slab, lip, mark, body);
    const entry = {
      deck,
      body,
      x0: deck.x0,
      x1: deck.x1,
      visuals: [slab, lip, mark],
    };
    decks.push(entry);
    scene.deckNodes.push(entry);
  }

  return {
    id: piece.id,
    nodes,
    crumbles,
    flips,
    decks,
    objects,
    colliders,
  };
}

function pullFrom(list, item) {
  const index = list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}

/** 这段已经在身后，贴图和刚体一起丢掉。 */
export function unmountEndlessPiece(scene, handle) {
  if (!handle) return;
  for (const node of handle.nodes) pullFrom(scene.courseNodes, node);
  for (const item of handle.crumbles) {
    pullFrom(scene.crumbles, item);
    pullFrom(scene.hazardSprites, item.kill);
  }
  for (const item of handle.flips) pullFrom(scene.flipVisuals, item);
  for (const item of handle.decks) pullFrom(scene.deckNodes, item);
  for (const collider of handle.colliders || []) collider.destroy();
  for (const obj of handle.objects) {
    pullFrom(scene.hazardSprites, obj);
    pullFrom(scene.starSprites, obj);
    destroyObject(obj);
  }
}

/** 一条跟着玩家走的地面。不用把整条无限跑道都做成刚体。 */
export function createEndlessGround(scene) {
  const width = 14000;
  const ground = scene.add.rectangle(scene.level.startX, TUNING.groundY + 40, width, 80, 0x000000, 0);
  scene.physics.add.existing(ground, true);
  const line = scene.add.rectangle(scene.level.startX, TUNING.groundY + 1.5, width, 3, THEME.ground).setDepth(2);
  scene.ground = ground;
  scene.groundLine = line;
}

/** 玩家快走到地面边缘时，把地面挪回脚下。 */
export function recenterEndlessGround(scene) {
  const ground = scene.ground;
  const line = scene.groundLine;
  if (!ground || !scene.player) return;
  if (Math.abs(ground.x - scene.player.x) < 2800) return;
  const y = TUNING.groundY + 40;
  ground.setPosition(scene.player.x, y);
  // 地面是矩形刚体，没有精灵的 refreshBody。挪完要按贴图重算静态碰撞盒。
  ground.body.updateFromGameObject();
  line.setPosition(scene.player.x, TUNING.groundY + 1.5);
}
