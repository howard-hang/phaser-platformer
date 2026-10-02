/**
 * 道具的时长、范围和投放。
 * 跳跃高度、重力和跑速不在这里，避免和基础手感缠在一起。
 * 闯关的具体坐标写在关卡 JSON 里，这里只规定每一关放几个。
 */
export const POWERUP_CONFIG = {
  double: {
    // 二段跳持续时间（秒）。
    duration: 8,
  },
  plane: {
    // 飞机巡航时间（秒）。落地和落地后的无敌另算，不占这 5 秒。
    duration: 5,
    // 巡航时方块中心比站立时再高这么多像素。不超过普通跳的离地高度太多，画面上仍在半空。
    flightLift: 118,
    // 从巡航高度缓缓落到地面的时间（秒）。
    landDuration: 0.7,
    // 落地之后再无敌一小段，防止刚好贴上障碍。
    landInvuln: 0.45,
    // 清场再往前多留的像素，盖住落地后的滑行。
    landingPad: 180,
    // 清场时也清掉脚边这一小截，避免人还压在尖刺上。
    clearBehind: 48,
    // 飞行时顺路吃星星的垂直、水平距离。地面星星和上层星星都够得到。
    starReach: 240,
    starCatchX: 46,
  },
  bomb: {
    // 从玩家往前清这么远（像素）。平台和地面不在这套规则里。
    range: 460,
    // 脚底下重叠到的障碍也算前方，避免吃到炸弹的同一帧被尖刺刺中。
    behind: 36,
    // 爆炸圈持续的时间（秒）。
    fxSeconds: 0.42,
  },
  endless: {
    // 两个道具中心至少隔开这么远。
    spacing: 3200,
    // 这次没投中，隔这么远再试一次，避免每个空档都重掷。
    retry: 1400,
    // 这段距离之内用更低的概率，开局少放。
    earlyDistance: 6400,
    earlyChance: 0.42,
    chance: 0.86,
    types: ['double', 'bomb', 'plane'],
  },
  // 第 1 关起，每一关放几个。前期少，后面每种都见得到。
  campaign: {
    counts: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  },
};

/** 第 index 关（从 1 开始）要放的道具数量。 */
export function campaignPowerCount(levelIndex) {
  const counts = POWERUP_CONFIG.campaign.counts;
  return counts[levelIndex - 1] ?? counts[counts.length - 1];
}

/** 这一关第 slot 个道具用哪种。三种轮着来，第一关先给二段跳。 */
export function campaignPowerType(levelIndex, slot) {
  const types = POWERUP_CONFIG.endless.types;
  return types[(levelIndex - 1 + slot) % types.length];
}
