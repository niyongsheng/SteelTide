import Phaser from 'phaser'
import GameAudio from '../js/Audio.js'
import GamepadInput from '../js/GamepadInput.js'
import { getBestTime, isTutorialDone } from '../js/storage.js'
import { FONT, PIXEL_FONT, COLOR, formatTime, FocusList } from '../js/ui.js'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu')
  }

  create() {
    const W = this.scale.width
    const H = this.scale.height
    this.cameras.main.setBackgroundColor('#0b1016')
    // 在菜单点击（用户手势）时初始化音频，保证进入教学关后第一声就能播放
    if (!this.game.audio) this.game.audio = new GameAudio()
    this.audio = this.game.audio
    this.leaving = false
    this.unlocked = isTutorialDone()
    this.best = getBestTime()

    this._buildBackdrop(W, H)
    this._buildTitle(W)
    this._buildLevelCards(W)
    this._buildFooter(W, H)

    this.toastText = this.add
      .text(W / 2, H - 34, '', {
        fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: COLOR.amber,
        stroke: '#000000', strokeThickness: 3, resolution: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(20)

    this.pad = new GamepadInput(this, {
      onConnect: () => {
        this._updateFooterHints()
        this._toast('手柄已连接')
      },
      onDisconnect: () => {
        this._updateFooterHints()
        this._toast('手柄已断开')
      },
      onActivity: () => this.audio?.ensure?.(),
    })
    this._updateFooterHints()

    this.input.on('pointerdown', () => this.audio?.ensure?.())
    this.input.keyboard.on('keydown-ONE', () => this._startLevel(1))
    this.input.keyboard.on('keydown-TWO', () => this._startLevel(2))
    this.input.keyboard.on('keydown-ENTER', () => this._activateFocused())
    this.input.keyboard.on('keydown-LEFT', (ev) => {
      if (!ev.repeat) this.focusList?.move(-1)
    })
    this.input.keyboard.on('keydown-RIGHT', (ev) => {
      if (!ev.repeat) this.focusList?.move(1)
    })
    this.input.keyboard.on('keydown-UP', (ev) => {
      if (!ev.repeat) this.focusList?.move(-1)
    })
    this.input.keyboard.on('keydown-DOWN', (ev) => {
      if (!ev.repeat) this.focusList?.move(1)
    })
    this.input.keyboard.on('keydown', () => this.audio?.ensure?.())

    // 进场动画
    this.titleText.setAlpha(0)
    this.subtitle.setAlpha(0)
    this.cameras.main.fadeIn(350, 6, 9, 13)
    this.tweens.add({
      targets: [this.titleText, this.subtitle],
      alpha: 1,
      duration: 420,
      ease: 'Quad.out',
    })
  }

  update() {
    if (this.leaving || !this.pad) return
    const nav = this.pad.nav
    if (nav) {
      this.focusList?.move(nav)
      this.pad.tick()
    }
    if (this.pad.justPressed('a') || this.pad.justPressed('start')) {
      this.pad.confirm()
      this._activateFocused()
    }
  }

  _activateFocused() {
    if (this.leaving) return
    this.audio?.ensure?.()
    this.focusList?.activate()
  }

  _updateFooterHints() {
    if (!this.footerRight) return
    this.footerRight.setText(this.pad?.connected
      ? '手柄  十字键/左摇杆 选择 · A 开始'
      : '方向键 / 1 / 2 选择关卡')
  }

  /* ---------------- 背景 ---------------- */

  _buildBackdrop(W, H) {
    // 沙漠地面
    const cols = Math.ceil(W / 64)
    const rows = Math.ceil(H / 64)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const key = (x * 7 + y * 5 + x * y) % 7 === 0 ? 'tileSand2' : 'tileSand1'
        this.add.image(x * 64 + 32, y * 64 + 32, key).setDepth(0)
      }
    }
    // 横向公路
    for (let x = 0; x < cols; x++) {
      this.add.image(x * 64 + 32, 9 * 64 + 32, 'tileSand_roadEast').setDepth(1)
    }
    // 公路标线感（履带印）
    for (let i = 2; i < cols; i += 3) {
      this.add.image(i * 64 + 20, 9 * 64 + 40, 'tracksLarge')
        .setDepth(2).setRotation(Math.PI / 2).setAlpha(0.12).setScale(0.8)
    }

    // 边缘装饰
    const deco = [
      [70, 120, 'treeBrown_large', 1.4, 0.2],
      [1160, 90, 'treeBrown_large', 1.2, -0.4],
      [1215, 600, 'treeBrown_small', 1.1, 0.6],
      [55, 640, 'treeBrown_small', 1.3, 0],
      [210, 250, 'crateWood', 1.6, 0.3],
      [1065, 250, 'crateMetal', 1.5, -0.2],
      [330, 610, 'barrelRust_side', 1.5, 0],
      [950, 620, 'barrelRed_side', 1.5, 0],
      [140, 400, 'sandbagBrown', 1.3, 0],
      [1120, 430, 'sandbagBrown', 1.3, Math.PI / 2],
      [500, 610, 'wireStraight', 1.3, 0.5],
      [760, 230, 'wireCrooked', 1.3, 0],
      [880, 650, 'oilSpill_small', 1.4, 0],
      [300, 200, 'treeBrown_leaf', 1.2, 0.3],
      [980, 200, 'treeBrown_twigs', 1.2, -0.6],
    ]
    for (const [x, y, key, scale, rot] of deco) {
      this.add.image(x, y, key).setScale(scale).setRotation(rot).setDepth(3).setAlpha(0.95)
    }

    // 两辆对峙的坦克（整坦克素材）
    this.blueTank = this.add
      .image(170, 520, 'tank_blue')
      .setScale(2.4)
      .setRotation(Math.PI / 2)
      .setDepth(6)
    this.redTank = this.add
      .image(1110, 520, 'tank_red')
      .setScale(2.4)
      .setRotation(-Math.PI / 2)
      .setDepth(6)
    this.tweens.add({ targets: this.blueTank, y: 524, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.tweens.add({ targets: this.redTank, y: 516, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.inOut' })

    // 压暗 + 标题区色带
    this.add.rectangle(W / 2, H / 2, W, H, 0x05080c, 0.48).setDepth(10)
    this.add.rectangle(W / 2, 150, W, 300, 0x05080c, 0.35).setDepth(10)
  }

  _buildTitle(W) {
    this.titleText = this.add
      .text(W / 2, 118, 'STEEL TIDE', {
        fontFamily: PIXEL_FONT, fontSize: '72px', color: COLOR.amber,
        resolution: 2, letterSpacing: 3,
      })
      .setOrigin(0.5)
      .setDepth(12)
    this.titleText.setShadow(0, 5, '#000000', 10)
    this.subtitle = this.add
      .text(W / 2, 183, '钢 铁 潮 汐 · 新 兵 与 老 兵 的 两 场 战 役', {
        fontFamily: PIXEL_FONT, fontSize: '24px', color: '#c6d1dc', resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(12)

    const line = this.add.graphics().setDepth(12)
    line.lineStyle(2, 0xf0b429, 0.5)
    line.lineBetween(W / 2 - 260, 158, W / 2 - 80, 158)
    line.lineBetween(W / 2 + 80, 158, W / 2 + 260, 158)
  }

  _buildLevelCards(W) {
    const card1 = this._makeLevelCard(W / 2 - 213, 400, {
      index: '01',
      title: '新兵训练',
      en: 'TRAINING GROUND',
      desc: '移动 · 瞄准 · 射击 · 补给',
      meta: '教学关 · 约 2 分钟',
      accent: 0xf0b429,
      locked: false,
      onStart: () => this._startLevel(1),
      onHover: () => this.focusList?.set(0),
    })
    const card2 = this._makeLevelCard(W / 2 + 213, 400, {
      index: '02',
      title: '生存极限',
      en: 'SURVIVAL',
      desc: '以生存时间计分 · 难度持续攀升',
      meta: this.unlocked
        ? (this.best > 0 ? `历史最佳  ${formatTime(this.best)}` : '历史最佳  —')
        : '完成第一关后解锁',
      accent: 0xff6b5b,
      locked: !this.unlocked,
      onStart: () => this._startLevel(2),
      onHover: () => this.focusList?.set(1),
    })
    this.focusList = new FocusList(this, [
      { button: card1, action: () => this._startLevel(1) },
      { button: card2, action: () => this._startLevel(2) },
    ], { index: 0 })
  }

  _makeLevelCard(x, y, opts) {
    const w = 400
    const h = 210
    const c = this.add.container(x, y).setDepth(11)
    const g = this.add.graphics()
    let hovered = false
    let focused = false
    const draw = () => {
      const locked = opts.locked
      const active = hovered || focused
      g.clear()
      g.fillStyle(0x000000, 0.45)
      g.fillRoundedRect(-w / 2 + 6, -h / 2 + 9, w, h, 16)
      g.fillStyle(locked ? 0x111820 : active ? 0x1b2a38 : 0x141f2a, 0.96)
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 16)
      g.lineStyle(2, locked ? 0x38434f : opts.accent, locked ? 0.55 : active ? 1 : 0.65)
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16)
      g.fillStyle(locked ? 0x38434f : opts.accent, locked ? 0.6 : 1)
      g.fillRoundedRect(-w / 2 + 1, -h / 2 + 26, 4, h - 52, 2)
      if (!locked && active) {
        g.fillStyle(opts.accent, 0.08)
        g.fillRoundedRect(-w / 2 + 16, -h / 2 + 14, w - 32, h - 28, 12)
      }
      if (focused) {
        g.lineStyle(2, locked ? 0x8fa4b8 : 0xffe08a, locked ? 0.7 : 0.95)
        g.strokeRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 20)
      }
    }
    draw()

    const index = this.add.text(-w / 2 + 28, -h / 2 + 22, opts.index, {
      fontFamily: PIXEL_FONT, fontSize: '48px',
      color: opts.locked ? '#3a4652' : '#2c3d4e', resolution: 2,
    })
    const title = this.add.text(-w / 2 + 100, -h / 2 + 30, opts.title, {
      fontFamily: PIXEL_FONT, fontSize: '24px',
      color: opts.locked ? '#8a97a3' : '#ffffff', resolution: 2,
    })
    title.setShadow(1, 2, '#000000', 4)
    const en = this.add.text(-w / 2 + 102, -h / 2 + 66, opts.en, {
      fontFamily: FONT, fontSize: '11px', color: opts.locked ? '#5b6874' : '#9fb3c8', resolution: 2,
    })
    const desc = this.add.text(-w / 2 + 28, -h / 2 + 108, opts.desc, {
      fontFamily: FONT, fontSize: '14px', color: opts.locked ? '#5f6b77' : '#c6d1dc', resolution: 2,
    })
    const meta = this.add.text(-w / 2 + 28, h / 2 - 44, opts.meta, {
      fontFamily: FONT, fontSize: '14px', fontStyle: 'bold',
      color: opts.locked ? '#8a641f' : opts.accent === 0xf0b429 ? '#f0b429' : '#ff9c8f', resolution: 2,
    })
    const cta = this.add
      .text(w / 2 - 28, h / 2 - 44, opts.locked ? '未解锁' : '开始 →', {
        fontFamily: FONT, fontSize: '15px', fontStyle: 'bold',
        color: opts.locked ? '#5f6b77' : '#ffffff', resolution: 2,
      })
      .setOrigin(1, 0)
    c.add([g, index, title, en, desc, meta, cta])

    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => {
      hovered = true
      draw()
      c.setScale(1.02)
      opts.onHover?.()
    })
    zone.on('pointerout', () => {
      hovered = false
      draw()
      c.setScale(focused ? 1.02 : 1)
    })
    zone.on('pointerup', () => {
      this.audio?.ensure?.()
      if (opts.locked) {
        this._toast('请先完成第一关「新兵训练」')
        return
      }
      opts.onStart?.()
    })
    c.add(zone)
    c.setFocused = (on) => {
      focused = !!on
      // 焦点切换时清掉旧的 hover 高亮，保证同一时间只有一张卡片被选中
      if (!focused) hovered = false
      draw()
      c.setScale(focused || hovered ? 1.02 : 1)
    }
    c.locked = !!opts.locked
    c.setAlpha(0)
    this.tweens.add({ targets: c, alpha: 1, y: y - 12, duration: 420, delay: 100, ease: 'Quad.out' })
    return c
  }

  _buildFooter(W, H) {
    const panel = this.add.graphics().setDepth(11)
    panel.fillStyle(0x05080c, 0.72)
    panel.fillRoundedRect(48, H - 96, 520, 62, 10)
    panel.lineStyle(1, 0x5b6f82, 0.4)
    panel.strokeRoundedRect(48, H - 96, 520, 62, 10)
    this.add.text(66, H - 84, '桌面  WASD / 方向键移动 · 鼠标瞄准 · 左键 / 空格开火', {
      fontFamily: FONT, fontSize: '13px', color: '#c6d1dc', resolution: 2,
    }).setDepth(12)
    this.add.text(66, H - 61, '手机  左摇杆移动 · 右摇杆瞄准并开火 · M 静音', {
      fontFamily: FONT, fontSize: '13px', color: '#8fa4b8', resolution: 2,
    }).setDepth(12)

    this.footerRight = this.add.text(W - 48, H - 78, '方向键 / 1 / 2 选择关卡', {
      fontFamily: FONT, fontSize: '13px', color: '#7d8b99', resolution: 2,
    }).setOrigin(1, 0).setDepth(12)
    this.add.text(W - 48, H - 55, '素材 Kenney · CC0  |  字体 Fusion Pixel · OFL', {
      fontFamily: FONT, fontSize: '12px', color: '#5f7183', resolution: 2,
    }).setOrigin(1, 0).setDepth(12)
  }

  _startLevel(n) {
    this.audio?.ensure?.()
    if (this.leaving) return
    if (n === 2 && !this.unlocked) {
      this._toast('请先完成第一关「新兵训练」')
      return
    }
    this.leaving = true
    this.cameras.main.fadeOut(220, 6, 9, 13)
    this.time.delayedCall(230, () => this.scene.start(n === 1 ? 'Tutorial' : 'Survival'))
  }

  _toast(text) {
    this.toastText.setText(text).setAlpha(1)
    this.tweens.killTweensOf(this.toastText)
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1400, duration: 500 })
  }
}
