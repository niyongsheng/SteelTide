/**
 * 敌方坦克档案。
 * body / barrel 贴图均来自 Kenney Top-Down Tanks Redux。
 * dummy = 教学靶车（不移动、不开火）。
 * spread = 精英单位扇形弹幕半角（弧度）。
 */
export const ENEMY_TYPES = {
  target: {
    name: '靶车', body: 'tankBody_red', barrel: 'tankRed_barrel1',
    hp: 60, speed: 0, dmg: 0, range: 0, fire: 999999,
    bullet: 'bulletRed2', bulletSpeed: 0, scale: 1.05,
    dummy: true, elite: false,
  },
  sand: {
    name: '沙色侦察兵', body: 'tankBody_sand', barrel: 'tankSand_barrel1',
    hp: 30, speed: 105, dmg: 8, range: 270, fire: 2000,
    bullet: 'bulletSand2', bulletSpeed: 300, scale: 1,
    elite: false,
  },
  green: {
    name: '绿色突击兵', body: 'tankBody_green', barrel: 'tankGreen_barrel1',
    hp: 45, speed: 115, dmg: 10, range: 280, fire: 1800,
    bullet: 'bulletGreen2', bulletSpeed: 310, scale: 1,
    elite: false,
  },
  blue: {
    name: '蓝色猎手', body: 'tankBody_blue', barrel: 'tankBlue_barrel1',
    hp: 68, speed: 125, dmg: 12, range: 290, fire: 1600,
    bullet: 'bulletBlue2', bulletSpeed: 330, scale: 1,
    elite: false,
  },
  red: {
    name: '红色重炮', body: 'tankBody_red', barrel: 'tankRed_barrel1',
    hp: 95, speed: 138, dmg: 15, range: 300, fire: 1400,
    bullet: 'bulletRed2', bulletSpeed: 350, scale: 1,
    elite: false,
  },
  dark: {
    name: '暗影杀手', body: 'tankBody_dark', barrel: 'tankDark_barrel2',
    hp: 130, speed: 150, dmg: 18, range: 310, fire: 1200,
    bullet: 'bulletDark2', bulletSpeed: 370, scale: 1,
    elite: false,
  },
  darkLarge: {
    name: '重装坦克', body: 'tankBody_darkLarge', barrel: 'tankDark_barrel3',
    hp: 260, speed: 110, dmg: 24, range: 320, fire: 1100,
    bullet: 'bulletRed3_outline', bulletSpeed: 350, scale: 1.12,
    elite: true, spread: 0.16,
  },
  bigRed: {
    name: '红色巨兽', body: 'tankBody_bigRed', barrel: 'tankRed_barrel2',
    hp: 400, speed: 100, dmg: 30, range: 330, fire: 1000,
    bullet: 'bulletRed3_outline', bulletSpeed: 380, scale: 1.18,
    elite: true, spread: 0.2,
  },
  huge: {
    name: '泰坦', body: 'tankBody_huge', barrel: 'tankRed_barrel3',
    hp: 900, speed: 78, dmg: 42, range: 340, fire: 950,
    bullet: 'bulletDark3', bulletSpeed: 400, scale: 1.3,
    elite: true, spread: 0.3,
  },
}

/** 第二关随时间解锁的兵种权重 */
export const SURVIVAL_TYPES = [
  { key: 'sand', unlock: 0, weight: 46 },
  { key: 'green', unlock: 8, weight: 38 },
  { key: 'blue', unlock: 22, weight: 30 },
  { key: 'red', unlock: 38, weight: 24 },
  { key: 'dark', unlock: 55, weight: 18 },
  { key: 'darkLarge', unlock: 72, weight: 10 },
  { key: 'bigRed', unlock: 95, weight: 7 },
]

export function pickSurvivalType(elapsed) {
  const pool = SURVIVAL_TYPES.filter((t) => t.unlock <= elapsed)
  let total = 0
  for (const t of pool) total += t.weight
  let roll = Math.random() * total
  for (const t of pool) {
    roll -= t.weight
    if (roll <= 0) return t.key
  }
  return pool[pool.length - 1].key
}
