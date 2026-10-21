import GamepadInput from '../js/GamepadInput.js'
import { getBestTime } from '../js/storage.js'
import { FONT, PIXEL_FONT, COLOR, drawPanel, formatTime, makeButton, FocusList } from '../js/ui.js'

export default class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause')
  }

  init(data) {
    this.pauseData = data || { mode: 'Survival', time: 0, kills: 0, wave: 1 }
  }

  create() {
    const W = this.scale.width
    const H = this.scale.height
    this.leaving = false
    this.pad = null
    this._inputLockUntil = performance.now() + 250
    this.levelKey = this.pauseData.mode === 'Tutorial' ? 'Tutorial' : 'Survival'

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)')
    this.cameras.main.fadeIn(150, 3, 5, 8)
    this.add.rectangle(W / 2, H / 2, W, H, 0x04070a, 0.72)

    const cardW = 720
    const cardH = 460
    const cx = W / 2
    const cy = H / 2 - 6
    const top = cy - cardH / 2

    drawPanel(this, cx, cy, cardW, cardH, {
      fill: 0x0b1219, alpha: 0.97, stroke: 0xf0b429, strokeAlpha: 0.8, radius: 20,
    })

    this.add.text(cx, top + 62, '已暂停', {
      fontFamily: PIXEL_FONT, fontSize: '48px', color: COLOR.amber,
      stroke: '#000000', strokeThickness: 5, resolution: 2,
    }).setOrigin(0.5)

    const levelName = this.levelKey === 'Survival' ? '第二关 · 生存极限' : '第一关 · 新兵训练'
    this.add.text(cx, top + 112, levelName, {
      fontFamily: FONT, fontSize: '16px', color: '#9fb3c8', resolution: 2,
    }).setOrigin(0.5)

    const best = getBestTime()
    const stats = this.levelKey === 'Tutorial'
      ? `训练用时  ${formatTime(this.pauseData.time)}      击毁单位  ${this.pauseData.kills}`
      : `生存时间  ${formatTime(this.pauseData.time)}      击杀  ${this.pauseData.kills}      第 ${this.pauseData.wave} 波\n历史最佳  ${best > 0 ? formatTime(best) : '—'}`
    this.add.text(cx, top + 170, stats, {
      fontFamily: FONT, fontSize: '16px', color: '#dbe6f0',
      align: 'center', lineSpacing: 9, resolution: 2,
    }).setOrigin(0.5)

    const btnW = 200
    const gap = 18
    const btnY = top + 320
    const actions = [
      { label: '继续游戏', variant: 'primary', action: 'resume' },
      { label: '重新开始', variant: 'secondary', action: 'restart' },
      { label: '返回主菜单', variant: 'ghost', action: 'menu' },
    ]
    const items = actions.map((def, i) => {
      const button = makeButton(this, {
        x: cx + (i - 1) * (btnW + gap),
        y: btnY,
        w: btnW,
        h: 60,
        label: def.label,
        variant: def.variant,
        onHover: () => this.focus?.set(i),
        onClick: () => this._runAction(def.action),
      })
      return { button, action: () => this._runAction(def.action) }
    })
    this.focus = new FocusList(this, items, { index: 0 })

    this.hintText = this.add.text(cx, top + 398, '', {
      fontFamily: FONT, fontSize: '13px', color: '#8fa4b8', resolution: 2,
    }).setOrigin(0.5)

    this.add.text(cx, top + 432, 'STEEL TIDE · 钢铁潮汐', {
      fontFamily: FONT, fontSize: '11px', color: '#566472', resolution: 2,
    }).setOrigin(0.5)

    const kbReady = () => performance.now() >= this._inputLockUntil
    this.input.keyboard.on('keydown-LEFT', (ev) => {
      if (!ev.repeat && kbReady()) this.focus.move(-1)
    })
    this.input.keyboard.on('keydown-RIGHT', (ev) => {
      if (!ev.repeat && kbReady()) this.focus.move(1)
    })
    this.input.keyboard.on('keydown-UP', (ev) => {
      if (!ev.repeat && kbReady()) this.focus.move(-1)
    })
    this.input.keyboard.on('keydown-DOWN', (ev) => {
      if (!ev.repeat && kbReady()) this.focus.move(1)
    })
    this.input.keyboard.on('keydown-ENTER', (ev) => {
      if (!ev.repeat && kbReady()) this._activateFocused()
    })
    this.input.keyboard.on('keydown-ESC', (ev) => {
      if (!ev.repeat && kbReady()) this._resume()
    })
    this.input.keyboard.on('keydown', () => this.game.audio?.ensure?.())

    this.pad = new GamepadInput(this, {
      onConnect: () => this._updateHint(),
      onDisconnect: () => this._updateHint(),
      onActivity: () => this.game.audio?.ensure?.(),
    })
    this.pad.sync()
    this._updateHint()
  }

  update() {
    if (this.leaving || performance.now() < this._inputLockUntil) return
    if (!this.pad) return

    const nav = this.pad.nav
    if (nav) {
      this.focus.move(nav)
      this.pad.tick()
    }

    if (this.pad.justPressed('a')) {
      this.pad.confirm()
      this._activateFocused()
    } else if (this.pad.justPressed('b') || this.pad.justPressed('start')) {
      this.pad.tick()
      this._resume()
    }
  }

  _updateHint() {
    if (!this.hintText) return
    this.hintText.setText(this.pad?.connected
      ? '手柄  方向键/左摇杆 选择 · A 确认 · B / Start 继续'
      : '键盘  方向键 选择 · Enter 确认 · Esc 继续')
  }

  _activateFocused() {
    this.game.audio?.ensure?.()
    this.focus?.activate()
  }

  _runAction(action) {
    if (this.leaving) return
    if (action === 'resume') this._resume()
    else if (action === 'restart') this._restart()
    else if (action === 'menu') this._menu()
  }

  _resume() {
    if (this.leaving) return
    this.leaving = true
    const key = this.levelKey
    this.scene.stop()
    this.scene.resume(key)
  }

  _restart() {
    if (this.leaving) return
    this.leaving = true
    const key = this.levelKey
    this.scene.stop(key)
    this.scene.start(key)
  }

  _menu() {
    if (this.leaving) return
    this.leaving = true
    const key = this.levelKey
    this.scene.stop(key)
    this.scene.start('Menu')
  }
}
