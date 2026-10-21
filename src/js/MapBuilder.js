import Phaser from 'phaser'

export const TILE = 64

const cell = (gx, gy) => ({ x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2 })

function paintGround(scene, cols, rows, keyA, keyB) {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const key = (x * 5 + y * 7 + x * y) % 6 === 0 ? keyB : keyA
      scene.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, key).setDepth(0)
    }
  }
}

function paintCrossRoad(scene, cols, rows, row, col, biome, crossingKey) {
  const east = `tile${biome}_roadEast`
  const north = `tile${biome}_roadNorth`
  const crossing = crossingKey || `tile${biome}_roadCrossingRound`
  const put = (gx, gy, key, depth = 1) =>
    scene.add.image(gx * TILE + TILE / 2, gy * TILE + TILE / 2, key).setDepth(depth)
  for (let x = 0; x < cols; x++) put(x, row, east)
  for (let y = 0; y < rows; y++) put(col, y, north)
  put(col, row, crossing)
  return { put, row, col }
}

function roadTile(scene, gx, gy, key, depth = 1.1) {
  return scene.add.image(gx * TILE + TILE / 2, gy * TILE + TILE / 2, key).setDepth(depth)
}

/** 训练场支路：两条 T 字分叉 + 直角弯 + 土路收尾 */
function paintTrainingBranches(scene) {
  // 北侧支路（col 16）：主路向北 → 右转 → 土路尽头
  roadTile(scene, 16, 7, 'tileGrass_roadSplitN')
  roadTile(scene, 16, 6, 'tileGrass_roadNorth')
  roadTile(scene, 16, 5, 'tileGrass_roadNorth')
  roadTile(scene, 16, 4, 'tileGrass_roadCornerLR')
  roadTile(scene, 17, 4, 'tileGrass_roadEast')
  roadTile(scene, 18, 4, 'tileGrass_roadTransitionE')

  // 南侧支路（col 4）：主路向南 → 右转 → 土路尽头
  roadTile(scene, 4, 7, 'tileGrass_roadSplitS')
  roadTile(scene, 4, 8, 'tileGrass_roadNorth')
  roadTile(scene, 4, 9, 'tileGrass_roadNorth')
  roadTile(scene, 4, 10, 'tileGrass_roadCornerUR')
  roadTile(scene, 5, 10, 'tileGrass_roadEast')
  roadTile(scene, 6, 10, 'tileGrass_roadEast')
  roadTile(scene, 7, 10, 'tileGrass_roadTransitionE')
}

/** 静态障碍：默认挡人挡弹；cover=true 时只挡子弹（树冠） */
export function addSolid(scene, x, y, key, {
  cover = false, scale = 1, rotation = 0, bodyScale = 0.74, depth = null,
} = {}) {
  const img = scene.add.image(x, y, key).setScale(scale).setRotation(rotation)
  img.setDepth(depth ?? 1000 + y)
  ;(cover ? scene.covers : scene.solids).add(img)
  img.body.setSize(img.displayWidth * bodyScale, img.displayHeight * bodyScale)
  return img
}

function addDecor(scene, x, y, key, { scale = 1, rotation = 0, alpha = 1, depth = 4 } = {}) {
  return scene.add.image(x, y, key).setScale(scale).setRotation(rotation).setAlpha(alpha).setDepth(depth)
}

/** 履带印（坦克朝上素材，故转动 angle + 90°） */
export function addTreads(scene, x, y, angle, {
  key = 'tracksLarge', alpha = 0.16, scale = 0.7,
} = {}) {
  return scene.add
    .image(x, y, key)
    .setDepth(4)
    .setRotation(angle + Math.PI / 2)
    .setAlpha(alpha)
    .setScale(scale)
}

function addTreadPair(scene, x, y, angle, opts = {}) {
  const off = (opts.spread ?? 11)
  const ox = Math.cos(angle + Math.PI / 2) * off
  const oy = Math.sin(angle + Math.PI / 2) * off
  addTreads(scene, x + ox, y + oy, angle, opts)
  addTreads(scene, x - ox, y - oy, angle, opts)
}

function addOil(scene, x, y, large = true) {
  const o = scene.add
    .image(x, y, large ? 'oilSpill_large' : 'oilSpill_small')
    .setDepth(5)
    .setAlpha(0.78)
    .setScale(Phaser.Math.FloatBetween(0.9, 1.25))
  scene.oils.add(o)
  o.body.setSize(o.displayWidth * 0.72, o.displayHeight * 0.72)
  return o
}

/** 第一关：草地训练场（横向 + 纵向主路，靶车与补给位保持空旷） */
export function buildTrainingGround(scene) {
  const cols = 20
  const rows = 14
  paintGround(scene, cols, rows, 'tileGrass1', 'tileGrass2')
  paintCrossRoad(scene, cols, rows, 7, 10, 'Grass', 'tileGrass_roadCrossingRound')
  paintTrainingBranches(scene)

  // 树（只挡子弹）——沿边角布置
  const trees = [
    [1, 1, 'treeGreen_large'], [2, 1, 'treeGreen_small'],
    [18, 1, 'treeGreen_large'], [17, 2, 'treeGreen_small'],
    [1, 12, 'treeGreen_large'], [2, 12, 'treeGreen_small'],
    [18, 12, 'treeGreen_large'], [16, 12, 'treeGreen_small'],
  ]
  for (const [gx, gy, key] of trees) {
    const p = cell(gx, gy)
    addSolid(scene, p.x, p.y, key, { cover: true, bodyScale: 0.55 })
  }

  // 训练场物资 / 掩体（避开三条靶车火线与集合点）
  const props = [
    [3, 2, 'crateWood_side', 1], [16, 2, 'crateMetal_side', 1],
    [2, 5, 'barrelRed_side', 1], [17, 5, 'barrelGreen_side', 1],
    [2, 9, 'barrelRust_side', 1], [17, 9, 'barrelBlack_side', 1],
    [3, 11, 'sandbagBeige', 1], [4, 11, 'sandbagBeige', 1],
    [12, 2, 'sandbagBeige', 1], [13, 2, 'sandbagBeige', 1],
    [6, 12, 'fenceRed', 1], [7, 12, 'fenceRed', 1],
  ]
  for (const [gx, gy, key, scale] of props) {
    const p = cell(gx, gy)
    addSolid(scene, p.x, p.y, key, { scale, bodyScale: 0.7 })
  }

  // 零散装饰：铁丝、落叶、枯枝
  const decor = [
    [2, 6, 'wireStraight', 1, Math.PI / 2], [2, 8, 'wireCrooked', 1, 0],
    [17, 8, 'wireStraight', 1, Math.PI / 2],
    [5, 3, 'treeGreen_leaf', 1, 0], [15, 10, 'treeGreen_leaf', 1, 0.6],
    [4, 12, 'treeGreen_twigs', 1, 0.3], [14, 11, 'treeGreen_twigs', 1, -0.5],
    [8, 2, 'treeGreen_twigs', 1, 1.1], [12, 11, 'treeGreen_leaf', 0.9, -0.3],
    [3, 3, 'barrelRed_top', 1.2, 0], [4, 3, 'barrelGreen_top', 1.2, 0],
    [16, 3, 'barrelRust_top', 1.2, 0], [15, 11, 'barrelBlack_top', 1.2, 0],
  ]
  for (const [gx, gy, key, scale, rotation] of decor) {
    const p = cell(gx, gy)
    addDecor(scene, p.x, p.y, key, { scale, rotation, alpha: 0.9, depth: 3 })
  }

  // 训练场履带印
  for (let x = 6; x <= 9; x++) {
    const p = cell(x, 7)
    addTreadPair(scene, p.x, p.y, 0, { alpha: 0.13 })
  }
  for (let y = 8; y <= 10; y++) {
    const p = cell(10, y)
    addTreadPair(scene, p.x, p.y, Math.PI / 2, { alpha: 0.13, key: 'tracksSmall' })
  }
  addTreadPair(scene, 480, 420, -0.7, { alpha: 0.12, spread: 14 })
  addTreadPair(scene, 800, 560, 2.4, { alpha: 0.12, spread: 14 })

  return { cols, rows }
}

/** 第二关：沙漠竞技场（更大的地图、更多掩体与油污） */
export function buildDesertArena(scene) {
  const cols = 26
  const rows = 19
  paintGround(scene, cols, rows, 'tileSand1', 'tileSand2')
  paintCrossRoad(scene, cols, rows, 9, 13, 'Sand', 'tileSand_roadCrossing')

  // 两条南北向支路，让沙地地图不是单调的十字路口
  const roadCells = new Set()
  for (let x = 0; x < cols; x++) roadCells.add(`${x},9`)
  for (let y = 0; y < rows; y++) roadCells.add(`13,${y}`)
  roadTile(scene, 20, 9, 'tileSand_roadSplitN')
  for (let y = 0; y <= 8; y++) {
    roadTile(scene, 20, y, 'tileSand_roadNorth')
    roadCells.add(`20,${y}`)
  }
  roadTile(scene, 8, 9, 'tileSand_roadSplitS')
  for (let y = 10; y < rows; y++) {
    roadTile(scene, 8, y, 'tileSand_roadNorth')
    roadCells.add(`8,${y}`)
  }

  const placed = []

  // 四辆废弃坦克残骸（实体掩体，使用整坦克贴图）
  const wrecks = [
    [4, 4, 'tank_dark', 0.55], [22, 5, 'tank_sand', -0.8],
    [5, 15, 'tank_green', 1.15], [21, 14, 'tank_red', -0.35],
    [2, 8, 'tank_bigRed', 0.9], [23, 11, 'tank_darkLarge', -0.6],
  ]
  for (const [gx, gy, key, rotation] of wrecks) {
    const p = cell(gx, gy)
    addSolid(scene, p.x, p.y, key, { rotation, bodyScale: 0.82, scale: 1.15 })
    placed.push(p)
    addDecor(scene, p.x + 26, p.y + 18, 'oilSpill_small', { scale: 0.8, alpha: 0.45, depth: 3 })
  }

  // 工事旁散落的油桶（俯视）
  const topBarrels = [
    [7, 4, 'barrelRust_top'],
    [19, 13, 'barrelGreen_top'],
    [18, 3, 'barrelRed_top'],
    [9, 14, 'barrelBlack_top'],
  ]
  for (const [gx, gy, key] of topBarrels) {
    const p = cell(gx, gy)
    addDecor(scene, p.x, p.y, key, { scale: 1.2, depth: 3 })
    placed.push(p)
  }

  // 三组沙袋工事
  const sandbags = [
    [6, 5], [7, 5], [6, 6],
    [19, 12], [20, 12], [20, 13],
    [17, 4], [18, 4], [17, 5],
  ]
  for (const [gx, gy] of sandbags) {
    const p = cell(gx, gy)
    addSolid(scene, p.x, p.y, 'sandbagBrown', { bodyScale: 0.72 })
    placed.push(p)
  }

  const solidPool = [
    'barrelRust_side', 'barrelRed_side', 'barrelGreen_side', 'barrelBlack_side',
    'crateWood', 'crateMetal', 'crateWood_side', 'crateMetal_side',
    'sandbagBrown', 'barricadeWood', 'fenceYellow', 'barricadeMetal',
  ]
  const coverPool = ['treeBrown_large', 'treeBrown_small', 'treeBrown_large', 'treeBrown_leaf']

  const tooClose = (x, y) =>
    placed.some((p) => {
      const dx = p.x - x
      const dy = p.y - y
      return dx * dx + dy * dy < 96 * 96
    })

  let attempts = 0
  while (placed.length < 68 && attempts < 5000) {
    attempts++
    const gx = Phaser.Math.Between(1, cols - 2)
    const gy = Phaser.Math.Between(1, rows - 2)
    // 不压任何道路
    if (roadCells.has(`${gx},${gy}`)) continue
    const p = cell(gx, gy)
    // 中央出生区留空
    if (Math.abs(gx - 13) <= 2 && Math.abs(gy - 9) <= 2) continue
    if (tooClose(p.x, p.y)) continue
    placed.push(p)
    if (Math.random() < 0.36) {
      const key = Phaser.Utils.Array.GetRandom(coverPool)
      addSolid(scene, p.x, p.y, key, {
        cover: true, bodyScale: 0.55, rotation: Phaser.Math.FloatBetween(-0.25, 0.25),
      })
    } else {
      const key = Phaser.Utils.Array.GetRandom(solidPool)
      addSolid(scene, p.x, p.y, key, {
        bodyScale: 0.7,
        rotation: Math.random() < 0.5 ? 0 : Math.PI / 2,
      })
    }
  }

  // 油污减速带
  let oils = 0
  let oilAttempts = 0
  while (oils < 6 && oilAttempts < 200) {
    oilAttempts++
    const gx = Phaser.Math.Between(1, cols - 2)
    const gy = Phaser.Math.Between(1, rows - 2)
    const p = cell(gx, gy)
    if (Math.abs(gx - 13) <= 3 && Math.abs(gy - 9) <= 3) continue
    if (tooClose(p.x, p.y)) continue
    addOil(scene, p.x, p.y, Math.random() < 0.5)
    oils++
  }

  // 散落装饰
  for (let i = 0; i < 46; i++) {
    const gx = Phaser.Math.Between(1, cols - 2)
    const gy = Phaser.Math.Between(1, rows - 2)
    const p = cell(gx, gy)
    const key = Phaser.Utils.Array.GetRandom([
      'treeBrown_leaf', 'treeBrown_twigs', 'treeBrown_leaf', 'treeBrown_twigs',
      'wireStraight', 'wireCrooked',
    ])
    addDecor(scene, p.x + Phaser.Math.Between(-18, 18), p.y + Phaser.Math.Between(-18, 18), key, {
      scale: Phaser.Math.FloatBetween(0.8, 1.1),
      rotation: Phaser.Math.FloatBetween(-1.2, 1.2),
      alpha: 0.8,
      depth: 3,
    })
  }

  // 旧履带印
  for (let i = 0; i < 34; i++) {
    const gx = Phaser.Math.Between(1, cols - 2)
    const gy = Phaser.Math.Between(1, rows - 2)
    const p = cell(gx, gy)
    addTreadPair(scene, p.x, p.y, Phaser.Math.FloatBetween(-Math.PI, Math.PI), {
      alpha: Phaser.Math.FloatBetween(0.08, 0.18),
      key: Math.random() < 0.5 ? 'tracksLarge' : 'tracksSmall',
      spread: Phaser.Math.Between(9, 14),
    })
  }

  return { cols, rows }
}
