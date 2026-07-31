import Phaser from 'phaser'
import { DEFAULT_STATE } from './BattleScene.js'

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver')
  }

  create() {
    const reg = this.registry
    const W = this.scale.width
    const H = this.scale.height

    this.cameras.main.setBackgroundColor('#141414')

    this.add
      .text(W / 2, H / 2 - 240, '坦克被击毁', { fontFamily: 'Arial', fontSize: '72px', fontStyle: 'bold', color: '#ff5544' })
      .setOrigin(0.5)
      .setShadow(4, 4, '#000', 6)

    const wave = reg.get('wave')
    const kills = reg.get('kills')
    const score = reg.get('score')
    // _die 已在死亡时把 best 写入 registry 并持久化，无需再取 max
    const best = reg.get('best')

    const stats = `存活波次   ${wave}\n击杀敌人   ${kills}\n本局得分   ${score}\n历史最佳   ${best}`
    this.add
      .text(W / 2, H / 2 - 60, stats, {
        fontFamily: 'Arial',
        fontSize: '30px',
        color: '#eeeeee',
        align: 'center',
        lineSpacing: 18,
      })
      .setOrigin(0.5)

    if (score >= best && score > 0) {
      this.add
        .text(W / 2, H / 2 + 110, '★ 新纪录！', { fontFamily: 'Arial', fontSize: '34px', fontStyle: 'bold', color: '#ffd54a' })
        .setOrigin(0.5)
    }

    // 重新开始按钮（大热区，移动端友好）
    const btnW = 320
    const btnH = 92
    const btnX = W / 2
    const btnY = H / 2 + 190
    const g = this.add.graphics()
    g.fillStyle(0x3a6ea5, 1)
    g.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 18)
    g.lineStyle(4, 0x8fc8ff, 1)
    g.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 18)
    const label = this.add
      .text(btnX, btnY, '再 战 一 局', { fontFamily: 'Arial', fontSize: '36px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)

    const btn = this.add.zone(btnX, btnY, btnW, btnH).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => {
      g.fillStyle(0x2a5480, 1).fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 18)
      g.lineStyle(4, 0x8fc8ff, 1).strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 18)
    })
    btn.on('pointerup', () => {
      // 重置一局
      reg.reset({ ...DEFAULT_STATE, best })
      this.scene.start('Battle')
    })

    this.add
      .text(W / 2, H / 2 + 285, '触屏：左摇杆移动 · 右摇杆瞄准开火   |   桌面：WASD 移动 · 鼠标瞄准 · 左键/空格开火', {
        fontFamily: 'Arial', fontSize: '15px', color: '#777777',
      })
      .setOrigin(0.5)

    // 标题闪烁入场
    this.add
      .text(W / 2, H / 2 - 170, '— 战 报 —', { fontFamily: 'Arial', fontSize: '20px', color: '#888888' })
      .setOrigin(0.5)
  }
}
