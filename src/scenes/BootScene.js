import Phaser from 'phaser'
import { FONT, PIXEL_FONT, COLOR } from '../js/ui.js'

/**
 * 素材全部来自 Kenney《Top-Down Tanks Redux》(CC0)。
 * key 直接使用文件名，便于对照素材包。
 */
const IMAGES = [
  // 玩家 / 敌方坦克
  'tankBody_blue', 'tankBlue_barrel1', 'tankBlue_barrel2', 'tankBlue_barrel3',
  'tankBody_sand', 'tankSand_barrel1', 'tankSand_barrel2',
  'tankBody_green', 'tankGreen_barrel1', 'tankGreen_barrel2',
  'tankBody_red', 'tankRed_barrel1', 'tankRed_barrel2', 'tankRed_barrel3',
  'tankBody_dark', 'tankDark_barrel1', 'tankDark_barrel2', 'tankDark_barrel3',
  'tankBody_darkLarge', 'tankBody_bigRed', 'tankBody_huge',
  // 整坦克（菜单展示 / 沙漠残骸）
  'tank_blue', 'tank_red', 'tank_sand', 'tank_green', 'tank_dark', 'tank_huge',
  'tank_bigRed', 'tank_darkLarge',
  // 子弹
  'bulletBlue1', 'bulletBlue2', 'bulletBlue3',
  'bulletSand2', 'bulletGreen2', 'bulletRed2', 'bulletRed3', 'bulletRed3_outline',
  'bulletDark2', 'bulletDark3',
  // 爆炸 / 炮口火光
  'explosion1', 'explosion2', 'explosion3', 'explosion4', 'explosion5',
  'explosionSmoke1', 'explosionSmoke2', 'explosionSmoke3', 'explosionSmoke4', 'explosionSmoke5',
  'shotLarge', 'shotOrange', 'shotRed', 'shotThin',
  // 草地地形
  'tileGrass1', 'tileGrass2',
  'tileGrass_roadEast', 'tileGrass_roadNorth',
  'tileGrass_roadCrossingRound', 'tileGrass_roadCrossing',
  'tileGrass_roadCornerUL', 'tileGrass_roadCornerUR', 'tileGrass_roadCornerLL', 'tileGrass_roadCornerLR',
  'tileGrass_roadSplitE', 'tileGrass_roadSplitN', 'tileGrass_roadSplitS', 'tileGrass_roadSplitW',
  'tileGrass_roadTransitionE', 'tileGrass_roadTransitionN', 'tileGrass_roadTransitionS', 'tileGrass_roadTransitionW',
  'tileGrass_transitionE', 'tileGrass_transitionN', 'tileGrass_transitionS', 'tileGrass_transitionW',
  // 沙地地形
  'tileSand1', 'tileSand2',
  'tileSand_roadEast', 'tileSand_roadNorth',
  'tileSand_roadCrossingRound', 'tileSand_roadCrossing',
  'tileSand_roadCornerUL', 'tileSand_roadCornerUR', 'tileSand_roadCornerLL', 'tileSand_roadCornerLR',
  'tileSand_roadSplitE', 'tileSand_roadSplitN', 'tileSand_roadSplitS', 'tileSand_roadSplitW',
  // 掩体 / 装饰
  'barrelRed_side', 'barrelGreen_side', 'barrelBlack_side', 'barrelRust_side',
  'barrelRed_top', 'barrelGreen_top', 'barrelBlack_top', 'barrelRust_top',
  'crateWood_side', 'crateMetal_side', 'crateWood', 'crateMetal',
  'sandbagBeige', 'sandbagBrown',
  'barricadeMetal', 'barricadeWood', 'fenceRed', 'fenceYellow',
  'treeGreen_small', 'treeGreen_large', 'treeGreen_leaf', 'treeGreen_twigs',
  'treeBrown_small', 'treeBrown_large', 'treeBrown_leaf', 'treeBrown_twigs',
  'wireStraight', 'wireCrooked',
  'oilSpill_large', 'oilSpill_small',
  'tracksLarge', 'tracksSmall',
  // 掉落补给
  'specialBarrel1', 'specialBarrel2', 'specialBarrel3', 'specialBarrel4',
  'specialBarrel5', 'specialBarrel6', 'specialBarrel7',
]

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#080c11')

    // 背景装饰线
    const deco = this.add.graphics()
    deco.lineStyle(1, 0xf0b429, 0.08)
    for (let i = -6; i < 20; i++) {
      deco.lineBetween(i * 90, 0, i * 90 - height, height)
    }

    this.bootTitle = this.add
      .text(width / 2, height / 2 - 92, 'STEEL TIDE', {
        fontFamily: PIXEL_FONT, fontSize: '72px', color: COLOR.amber, resolution: 2,
      })
      .setOrigin(0.5)
      .setShadow(3, 4, '#000000', 8)
    this.bootSubtitle = this.add
      .text(width / 2, height / 2 - 34, '钢 铁 潮 汐', {
        fontFamily: PIXEL_FONT, fontSize: '24px', color: '#c6d1dc', resolution: 2,
      })
      .setOrigin(0.5)

    const barW = 480
    const barH = 18
    const bx = width / 2 - barW / 2
    const by = height / 2 + 46
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.65)
    bg.fillRoundedRect(bx - 4, by - 4, barW + 8, barH + 8, 6)
    bg.lineStyle(1, 0x8fa4b8, 0.4)
    bg.strokeRoundedRect(bx - 4, by - 4, barW + 8, barH + 8, 6)
    this.progressBar = this.add.graphics()

    this.percent = this.add
      .text(width / 2, by + 46, '0%', {
        fontFamily: FONT, fontSize: '14px', color: '#9fb3c8', resolution: 2,
      })
      .setOrigin(0.5)
    this.add
      .text(width / 2, by + 82, '正在部署装甲部队…', {
        fontFamily: FONT, fontSize: '13px', color: '#5f7183', resolution: 2,
      })
      .setOrigin(0.5)

    this.load.on('progress', (v) => {
      this.progressBar.clear()
      this.progressBar.fillStyle(0xf0b429, 1)
      this.progressBar.fillRoundedRect(bx, by, barW * v, barH, 5)
      this.percent.setText(`${Math.round(v * 100)}%`)
    })
    this.load.on('loaderror', (file) => {
      console.warn('[Steel Tide] 素材加载失败:', file.src)
    })

    for (const key of IMAGES) {
      this.load.image(key, `assets/${key}.png`)
    }
  }

  create() {
    // 世界像素贴图使用 NEAREST 保持锐利；文字纹理保持 LINEAR 抗锯齿
    const nearest = Phaser.Textures.FilterMode.NEAREST
    for (const key of IMAGES) {
      this.textures.get(key)?.setFilter(nearest)
    }

    const start = () => this.scene.start('Menu')
    if (!document.fonts?.load) {
      start()
      return
    }

    // 等像素字体就绪后再进入菜单，避免标题先以回退字体渲染
    let done = false
    const go = () => {
      if (done) return
      done = true
      // 重新渲染加载页标题，若之前字体尚未就绪
      this.bootTitle?.setText('STEEL TIDE')
      this.bootSubtitle?.setText('钢 铁 潮 汐')
      start()
    }
    Promise.race([
      document.fonts.load('72px "Steel Tide Pixel"').then(() => document.fonts.ready),
      new Promise((resolve) => setTimeout(resolve, 1800)),
    ]).then(go).catch(go)
  }
}
