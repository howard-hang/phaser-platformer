/**
 * 彩色跑动灰尘。
 * 小方块事先放进对象池，同时最多 DUST_CAP 颗。播完回收，不再新建，避免奔跑时越堆越多。
 * 颜色是界面上的粉、薄荷绿、柠檬黄、天蓝。向后上方飘，边缩小边变淡。
 */

/** 同时存在的灰尘上限。对象池只建这么多。 */
export const DUST_CAP = 32;

/** 糖果色，和按钮脸同一套色值。 */
export const DUST_COLORS = [0xff4b8d, 0x2ee6a6, 0xffe14a, 0x3ec6ff];

/**
 * 这一帧要吐出几颗。
 * 地面奔跑按秒累计；起跳和落地再加一撮；空中不吐。关掉特效时一颗都不吐。
 * 切回前台时单帧最多补 3 颗，避免一次把池子灌满。
 */
export function planDustEmits({ grounded, burst, rate, burstCount, dt, carry }) {
  const perSec = Math.max(0, Number(rate) || 0);
  const burstN = Math.max(0, burstCount | 0);
  if (perSec <= 0 && burstN <= 0) return { count: 0, carry: 0 };
  let count = 0;
  if ((burst === 'jump' || burst === 'land') && burstN > 0) count += burstN;
  let next = Number.isFinite(carry) ? carry : 0;
  if (grounded && perSec > 0) {
    next += perSec * Math.max(0, Number(dt) || 0);
    const whole = Math.floor(next);
    const take = Math.min(whole, 3);
    count += take;
    next -= whole;
    if (whole > take) next = 0;
  } else if (!grounded) {
    next = 0;
  }
  if (count > DUST_CAP) count = DUST_CAP;
  return { count, carry: next };
}

/** 从方块尾部下方生成一颗。序号决定颜色和飘散方向，结果是确定的。 */
export function makeDustParticle(x, y, index) {
  const i = index | 0;
  const color = DUST_COLORS[((i % DUST_COLORS.length) + DUST_COLORS.length) % DUST_COLORS.length];
  const lane = ((i % 4) + 4) % 4;
  const life = 0.34 + (Math.abs(i) % 3) * 0.05;
  return {
    x: x - 18 + (lane - 1.5) * 2.5,
    y: y + 16 + (Math.abs(i) % 3),
    vx: -110 - lane * 30,
    vy: -80 - (Math.abs(i) % 5) * 18,
    life,
    max: life,
    size: 6 + (Math.abs(i) % 3) * 2,
    color,
    scale: 1,
    alpha: 1,
    alive: true,
  };
}

/** 往后上方挪一截，并按剩余寿命缩小、变淡。寿命到了就回收。 */
export function stepDust(particle, dt) {
  if (!particle?.alive) return particle;
  const step = Math.max(0, Number(dt) || 0);
  const life = particle.life - step;
  const max = particle.max > 0 ? particle.max : 1;
  const t = 1 - Math.max(0, life) / max;
  const drag = Math.max(0, 1 - step * 0.8);
  return {
    ...particle,
    life,
    x: particle.x + particle.vx * step,
    y: particle.y + particle.vy * step,
    vx: particle.vx * drag,
    vy: particle.vy * drag,
    scale: Math.max(0, 1 - t),
    alpha: Math.max(0, 1 - t),
    alive: life > 0,
  };
}

/** 建一个装满空位的池。长度始终是 DUST_CAP。 */
export function createDustPool() {
  const pool = [];
  for (let i = 0; i < DUST_CAP; i += 1) pool.push({ alive: false });
  return pool;
}

/**
 * 往池里塞灰尘。池满了就丢掉多余的，不会把数组撑大。
 * cursor 用来轮换颜色，调用方下次接着传。
 */
export function emitDust(pool, x, y, count, cursor = 0) {
  const list = pool || [];
  let index = cursor | 0;
  let spawned = 0;
  const want = Math.max(0, count | 0);
  for (let n = 0; n < want; n += 1) {
    let slot = -1;
    for (let i = 0; i < list.length; i += 1) {
      if (!list[i].alive) {
        slot = i;
        break;
      }
    }
    if (slot < 0) break;
    Object.assign(list[slot], makeDustParticle(x, y, index));
    index += 1;
    spawned += 1;
  }
  return { spawned, cursor: index };
}

/** 还活着的颗数。用来确认没有超过上限。 */
export function aliveDustCount(pool) {
  let count = 0;
  for (let i = 0; i < pool.length; i += 1) if (pool[i].alive) count += 1;
  return count;
}
