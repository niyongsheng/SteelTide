import Phaser from 'phaser'

/**
 * 加载全部素材，带进度条。
 * key 命名约定：
 *   player_*   玩家（tankBody_blue + tankBlue_barrel*）
 *   e_* / eb_* 敌人车身 / 敌人炮塔（按配色区分）
 *   b_*        子弹
 *   explosion* / smoke*  爆炸动画帧
 *   obs_*      障碍物
 *   drop_*     掉落道具
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload() {
    const { width, height } = this.scale

    // 加载进度条
    const barW = 480
    const barH = 22
    const bx = width / 2 - barW / 2
    const by = height / 2 + 40
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.6)
    bg.fillRoundedRect(bx - 4, by - 4, barW + 8, barH + 8, 6)
    this.progressBar = this.add.graphics()

    this.add
      .text(width / 2, height / 2 - 60, '坦克生存', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: '#ffd54a',
      })
      .setOrigin(0.5)

    this.load.on('progress', (v) => {
      this.progressBar.clear()
      this.progressBar.fillStyle(0x66c266, 1)
      this.progressBar.fillRoundedRect(bx, by, barW * v, barH, 6)
    })

    const A = 'assets/'

    // 玩家坦克
    this.load.image('player_body', A + 'tankBody_blue.png')
    this.load.image('player_barrel', A + 'tankBlue_barrel1.png')
    this.load.image('player_barrel2', A + 'tankBlue_barrel2.png')
    this.load.image('player_barrel3', A + 'tankBlue_barrel3.png')

    // 敌人车身（按波数渐进出场的配色）
    this.load.image('e_sand', A + 'tankBody_sand.png')
    this.load.image('e_green', A + 'tankBody_green.png')
    this.load.image('e_blue', A + 'tankBody_blue.png')
    this.load.image('e_red', A + 'tankBody_red.png')
    this.load.image('e_dark', A + 'tankBody_dark.png')
    this.load.image('e_darkLarge', A + 'tankBody_darkLarge.png')
    this.load.image('e_bigRed', A + 'tankBody_bigRed.png')
    this.load.image('e_huge', A + 'tankBody_huge.png')

    // 敌人炮塔
    this.load.image('eb_sand', A + 'tankSand_barrel1.png')
    this.load.image('eb_green', A + 'tankGreen_barrel1.png')
    this.load.image('eb_blue', A + 'tankBlue_barrel1.png')
    this.load.image('eb_red', A + 'tankRed_barrel1.png')
    this.load.image('eb_dark', A + 'tankDark_barrel1.png')

    // 子弹
    this.load.image('b_blue1', A + 'bulletBlue1.png')
    this.load.image('b_red1', A + 'bulletRed1.png')
    this.load.image('b_dark2', A + 'bulletDark2.png')

    // 爆炸特效
    for (let i = 1; i <= 5; i++) {
      this.load.image('explosion' + i, A + 'explosion' + i + '.png')
      this.load.image('smoke' + i, A + 'explosionSmoke' + i + '.png')
    }

    // 地形
    this.load.image('grass1', A + 'tileGrass1.png')
    this.load.image('grass2', A + 'tileGrass2.png')
    this.load.image('road_crossing', A + 'tileGrass_roadCrossing.png')
    this.load.image('road_east', A + 'tileGrass_roadEast.png')
    this.load.image('road_north', A + 'tileGrass_roadNorth.png')
    this.load.image('road_cornerUL', A + 'tileGrass_roadCornerUL.png')
    this.load.image('road_cornerUR', A + 'tileGrass_roadCornerUR.png')
    this.load.image('road_cornerLL', A + 'tileGrass_roadCornerLL.png')
    this.load.image('road_cornerLR', A + 'tileGrass_roadCornerLR.png')
    this.load.image('road_transE', A + 'tileGrass_roadTransitionE.png')
    this.load.image('road_transW', A + 'tileGrass_roadTransitionW.png')

    // 障碍物
    this.load.image('obs_barrelRed', A + 'barrelRed_side.png')
    this.load.image('obs_barrelGreen', A + 'barrelGreen_side.png')
    this.load.image('obs_barrelBlack', A + 'barrelBlack_side.png')
    this.load.image('obs_crate', A + 'crateWood_side.png')
    this.load.image('obs_crateMetal', A + 'crateMetal_side.png')
    this.load.image('obs_sandbag', A + 'sandbagBeige.png')
    this.load.image('obs_barricade', A + 'barricadeMetal.png')
    this.load.image('obs_tree1', A + 'treeGreen_small.png')
    this.load.image('obs_tree2', A + 'treeGreen_large.png')
    this.load.image('obs_fence', A + 'fenceRed.png')

    // 掉落道具
    this.load.image('drop_triple', A + 'specialBarrel1.png')
    this.load.image('drop_rapid', A + 'specialBarrel2.png')
    this.load.image('drop_pierce', A + 'specialBarrel3.png')
    this.load.image('drop_heal', A + 'barrelRed_top.png')
    this.load.image('drop_shield', A + 'barrelGreen_top.png')
    this.load.image('drop_clear', A + 'barrelBlack_top.png')

    // 装饰（减速油污）
    this.load.image('oil', A + 'oilSpill_large.png')
  }

  create() {
    this.scene.start('Battle')
  }
}
