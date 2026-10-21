import Phaser from 'phaser'

// W3C 标准手柄按键索引（Xbox / PlayStation / Switch Pro 通用）
const BUTTON = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, LS: 10, RS: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const actionIndex = (action) => {
  if (typeof action === 'number') return action
  if (typeof action !== 'string') return undefined
  return BUTTON[action.toUpperCase()]
}

/**
 * 场景级手柄输入封装。
 *
 * 用法：
 *   this.pad = new GamepadInput(this, { onActivity: () => this.audio.ensure() })
 *   if (this.pad.moveActive) { ... this.pad.moveX / moveY }
 *   if (this.pad.fireHeld) ...
 *   if (this.pad.justPressed('start')) ...
 *   if (this.pad.nav) ...
 *
 * - 每帧自动通过 scene UPDATE 事件更新，不需要手动 poll。
 * - 场景暂停/恢复后调用 sync()，丢弃仍按住的按钮和摇杆。
 * - 没有手柄 / 手柄不支持时所有 getter 返回中立值。
 */
export default class GamepadInput {
  constructor(scene, {
    onConnect,
    onDisconnect,
    onActivity,
    deadzone = 0.18,
    aimDeadzone = 0.25,
    triggerThreshold = 0.35,
    navFirstDelay = 320,
    navRepeat = 130,
  } = {}) {
    this.scene = scene
    this.plugin = scene.input?.gamepad || null
    this.onConnect = onConnect
    this.onDisconnect = onDisconnect
    this.onActivity = onActivity
    this.deadzone = deadzone
    this.aimDeadzone = aimDeadzone
    this.triggerThreshold = triggerThreshold
    this.navFirstDelay = navFirstDelay
    this.navRepeat = navRepeat

    this.pad = null
    this._connected = false
    this._destroyed = false
    this._prev = []
    this._edges = new Set()
    this._lockUntil = 0

    this.moveX = 0
    this.moveY = 0
    this.moveActive = false
    this.aimX = 0
    this.aimY = 0
    this.aimMagnitude = 0
    this.aimActive = false
    this.fireHeld = false
    this.navStep = 0

    this._navDir = 0
    this._navNextAt = 0
    this._navRequireNeutral = true
    this._prevFire = false
    this._rumbleUntil = 0
    this._rumblePriority = 0

    if (!this.plugin) return

    this._onConnected = (pad) => this._handleConnect(pad)
    this._onDisconnected = (pad) => this._handleDisconnect(pad)
    this.plugin.on('connected', this._onConnected)
    this.plugin.on('disconnected', this._onDisconnected)

    // Phaser 在 Scene.update 之前发出 UPDATE 事件，因此 getter 当帧可用
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)

    this._selectPad()
    this._connected = !!this.pad
    this._snapshot()
    this._lockUntil = performance.now() + 120
  }

  get connected() {
    return this._connected && !!this.pad
  }

  get locked() {
    return performance.now() < this._lockUntil
  }

  /** 当前帧的菜单方向：-1 / 0 / +1（含按住重复） */
  get nav() {
    return this.locked ? 0 : this.navStep
  }

  isDown(action) {
    const index = actionIndex(action)
    if (index === undefined) return false
    return this._button(index)?.pressed === true
  }

  justPressed(action) {
    if (this.locked) return false
    const index = actionIndex(action)
    return index !== undefined && this._edges.has(index)
  }

  /**
   * 触发震动。优先使用标准 GamepadHapticActuator.playEffect('dual-rumble')，
   * 并兼容旧版 pulse() / hapticActuators。
   * priority 越大越优先；高优先级震动未结束时不会被低优先级打断。
   */
  rumble({ duration = 100, strong = 0, weak = 0, priority = 1 } = {}) {
    const native = this.pad?.pad
    if (!native) return false

    const now = performance.now()
    if (now < this._rumbleUntil && priority < this._rumblePriority) return false

    const ms = Math.max(1, Math.round(duration))
    const strongMag = clamp(strong, 0, 1)
    const weakMag = clamp(weak, 0, 1)
    const actuator = native.vibrationActuator
    let played = false

    if (actuator && typeof actuator.playEffect === 'function') {
      try {
        const result = actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: ms,
          strongMagnitude: strongMag,
          weakMagnitude: weakMag,
        })
        result?.catch?.(() => {})
        played = true
      } catch {
        played = false
      }
    }

    if (!played) {
      const pulse = (actuator && typeof actuator.pulse === 'function')
        ? actuator.pulse.bind(actuator)
        : (Array.isArray(native.hapticActuators)
          && native.hapticActuators[0]
          && typeof native.hapticActuators[0].pulse === 'function'
          ? native.hapticActuators[0].pulse.bind(native.hapticActuators[0])
          : null)
      if (pulse) {
        try {
          const result = pulse((strongMag + weakMag) / 2, ms)
          result?.catch?.(() => {})
          played = true
        } catch {
          played = false
        }
      }
    }

    if (!played) return false
    this._rumbleUntil = now + ms
    this._rumblePriority = priority
    return true
  }

  /** 菜单焦点移动的轻微反馈 */
  tick() {
    return this.rumble({ duration: 22, strong: 0.02, weak: 0.05, priority: 0 })
  }

  /** 菜单确认的短反馈 */
  confirm() {
    return this.rumble({ duration: 55, strong: 0.1, weak: 0.16, priority: 1 })
  }

  /** 场景创建/恢复时调用：丢弃当前仍按住的输入，避免误触发 */
  sync() {
    if (this._destroyed || !this.plugin) return
    this.plugin.refreshPads?.()

    const wasConnected = this._connected
    this._selectPad()
    this._connected = !!this.pad

    if (!wasConnected && this._connected) this.onConnect?.(this.pad)
    else if (wasConnected && !this._connected) this.onDisconnect?.()

    this._snapshot()
    this._lockUntil = performance.now() + 120
  }

  update() {
    if (this._destroyed) return

    if (!this.pad) {
      this._selectPad()
      if (this.pad) {
        if (!this._connected) {
          this._connected = true
          this.onConnect?.(this.pad)
        }
        this._snapshot()
      } else {
        this._resetOutputs()
        if (this._connected) {
          this._connected = false
          this.onDisconnect?.()
        }
        return
      }
    }

    if (!this._isPadAvailable(this.pad)) {
      this.pad = null
      this._connected = false
      this._resetOutputs()
      this.onDisconnect?.()
      return
    }

    const buttons = this._readButtons()
    const edges = new Set()
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i] && !this._prev[i]) edges.add(i)
    }
    this._edges = edges
    this._prev = buttons

    this._readAxes()
    this._updateNav()

    if (edges.size > 0) this.onActivity?.()
    if (this.fireHeld && !this._prevFire) this.onActivity?.()
    this._prevFire = this.fireHeld
  }

  destroy() {
    if (this._destroyed) return
    this._destroyed = true
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this)
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    if (this.plugin) {
      this.plugin.off('connected', this._onConnected)
      this.plugin.off('disconnected', this._onDisconnected)
    }
    this.pad = null
    this._edges.clear()
    this._prev = []
    this._rumbleUntil = 0
    this._rumblePriority = 0
    this._resetOutputs()
  }

  /* ---------------- 内部 ---------------- */

  _isPadAvailable(pad) {
    if (!pad) return false
    const native = pad.pad
    if (native && native.connected === false) return false
    const mapping = native?.mapping ?? pad.mapping
    return !mapping || mapping === 'standard'
  }

  _selectPad() {
    if (!this.plugin) {
      this.pad = null
      return null
    }
    const candidates = []
    if (this.plugin.pad1) candidates.push(this.plugin.pad1)
    const all = typeof this.plugin.getAll === 'function'
      ? this.plugin.getAll()
      : (this.plugin.gamepads || [])
    for (const candidate of all) {
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate)
    }
    this.pad = candidates.find((candidate) => this._isPadAvailable(candidate)) || null
    return this.pad
  }

  _handleConnect(pad) {
    if (this._destroyed) return
    if (pad && this._isPadAvailable(pad)) this.pad = pad
    else this._selectPad()
    if (!this.pad) return

    if (!this._connected) {
      this._connected = true
      this.onConnect?.(this.pad)
    }
    // 浏览器常常在第一次按键后才暴露手柄，吞掉这次按键
    this._snapshot()
    this._lockUntil = performance.now() + 120
  }

  _handleDisconnect(pad) {
    if (this._destroyed) return
    const activeIndex = this.pad?.index
    if (pad && activeIndex !== undefined && pad.index !== activeIndex) return

    this.pad = null
    this._selectPad()
    if (this.pad) {
      this._snapshot()
      this._lockUntil = performance.now() + 120
      return
    }
    if (this._connected) {
      this._connected = false
      this._resetOutputs()
      this.onDisconnect?.()
    }
  }

  _snapshot() {
    this._prev = this._readButtons()
    this._edges.clear()
    this._navDir = 0
    this._navNextAt = 0
    this._navRequireNeutral = true
    this.navStep = 0
    this._readAxes()
    this._prevFire = this.fireHeld
  }

  _readButtons() {
    const buttons = this.pad?.buttons
    if (!buttons || !buttons.length) return []
    const out = new Array(buttons.length)
    for (let i = 0; i < buttons.length; i++) {
      out[i] = buttons[i]?.pressed === true
    }
    return out
  }

  _button(index) {
    return this.pad?.buttons?.[index] || null
  }

  _buttonValue(index) {
    const button = this._button(index)
    return typeof button?.value === 'number' ? button.value : 0
  }

  _readAxes() {
    if (!this.pad) {
      this._resetOutputs()
      return
    }

    const left = this.pad.leftStick || { x: 0, y: 0 }
    let x = Number(left.x) || 0
    let y = Number(left.y) || 0
    if (this.isDown('left')) x -= 1
    if (this.isDown('right')) x += 1
    if (this.isDown('up')) y -= 1
    if (this.isDown('down')) y += 1
    x = clamp(x, -1, 1)
    y = clamp(y, -1, 1)

    const moveMag = Math.hypot(x, y)
    if (moveMag > this.deadzone) {
      const scale = moveMag > 1 ? 1 / moveMag : 1
      this.moveX = x * scale
      this.moveY = y * scale
      this.moveActive = true
    } else {
      this.moveX = 0
      this.moveY = 0
      this.moveActive = false
    }

    const right = this.pad.rightStick || { x: 0, y: 0 }
    const rx = Number(right.x) || 0
    const ry = Number(right.y) || 0
    const aimMag = Math.hypot(rx, ry)
    if (aimMag > this.aimDeadzone) {
      this.aimX = rx
      this.aimY = ry
      this.aimMagnitude = Math.min(1, aimMag)
      this.aimActive = true
    } else {
      this.aimX = 0
      this.aimY = 0
      this.aimMagnitude = 0
      this.aimActive = false
    }

    const rt = this._buttonValue(BUTTON.RT)
    const rb = this._button(BUTTON.RB)?.pressed === true
    this.fireHeld = rb || rt > this.triggerThreshold
  }

  _updateNav() {
    this.navStep = 0
    if (this.locked) return

    let x = 0
    let y = 0
    if (this.isDown('left')) x -= 1
    if (this.isDown('right')) x += 1
    if (this.isDown('up')) y -= 1
    if (this.isDown('down')) y += 1

    const left = this.pad?.leftStick
    if (left) {
      if (Math.abs(left.x) > 0.55) x = Math.sign(left.x)
      if (Math.abs(left.y) > 0.55) y = Math.sign(left.y)
    }

    let direction = 0
    if (x !== 0 && Math.abs(x) >= Math.abs(y)) direction = Math.sign(x)
    else if (y !== 0) direction = Math.sign(y)

    if (direction === 0) {
      this._navDir = 0
      this._navNextAt = 0
      if (this._navRequireNeutral) this._navRequireNeutral = false
      return
    }

    // 恢复场景后，摇杆必须先回中，避免沿用旧方向立刻切换焦点
    if (this._navRequireNeutral) return

    const now = performance.now()
    if (direction !== this._navDir) {
      this._navDir = direction
      this._navNextAt = now + this.navFirstDelay
      this.navStep = direction
    } else if (now >= this._navNextAt) {
      this._navNextAt = now + this.navRepeat
      this.navStep = direction
    }
  }

  _resetOutputs() {
    this.moveX = 0
    this.moveY = 0
    this.moveActive = false
    this.aimX = 0
    this.aimY = 0
    this.aimMagnitude = 0
    this.aimActive = false
    this.fireHeld = false
    this.navStep = 0
    this._edges.clear()
  }
}
