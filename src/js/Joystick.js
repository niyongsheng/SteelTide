import Phaser from 'phaser'

/**
 * 虚拟摇杆：left = 移动，right = 瞄准+开火（按下即触发）。
 * 仅在触摸设备上显示；坐标用屏幕/相机空间，地图缩放后依然可点。
 * 用法：
 *   const jl = new Joystick(this, 'left')
 *   update 里读 jl.dirX / jl.dirY（-1~1，未激活为 0）、jl.active
 *   right.active 且 jl.magnitude > 0.2 → 瞄准并开火
 */
export default class Joystick {
  constructor(scene, side) {
    this.scene = scene
    this.side = side
    this.isTouch = scene.sys.game.device.input.touch
    this.active = false
    this.pointer = null
    this.dirX = 0
    this.dirY = 0
    this.magnitude = 0
    this.maxR = 70
    this.gfx = null

    const w = scene.scale.width
    const h = scene.scale.height
    if (side === 'left') this.zone = new Phaser.Geom.Rectangle(0, 0, w / 2, h)
    else this.zone = new Phaser.Geom.Rectangle(w / 2, 0, w / 2, h)

    this._bind()
    if (this.isTouch) this._createGfx()
  }

  _bind() {
    const sc = this.scene
    this.onDown = (p) => {
      // Phaser 的 Pointer.pointerType 可能为 undefined，用原生事件对象判断
      if (p.event && p.event.pointerType === 'mouse') return
      if (!Phaser.Geom.Rectangle.Contains(this.zone, p.x, p.y)) return
      // 已有摇杆占用该侧时忽略新指针
      if (this.active && this.pointer !== p) return
      this.active = true
      this.pointer = p
      this.baseX = p.x
      this.baseY = p.y
      this._updateDir(p)
      this._show()
    }
    this.onMove = (p) => {
      if (this.active && p === this.pointer) this._updateDir(p)
    }
    this.onUp = (p) => {
      if (this.active && p === this.pointer) this._release()
    }
    sc.input.on('pointerdown', this.onDown)
    sc.input.on('pointermove', this.onMove)
    sc.input.on('pointerup', this.onUp)
    sc.input.on('pointerupoutside', this.onUp)
  }

  _updateDir(p) {
    let dx = p.x - this.baseX
    let dy = p.y - this.baseY
    const len = Math.hypot(dx, dy)
    if (len > this.maxR) {
      dx = (dx / len) * this.maxR
      dy = (dy / len) * this.maxR
    }
    this.dirX = dx / this.maxR
    this.dirY = dy / this.maxR
    this.magnitude = Math.min(1, len / this.maxR)
    if (this.gfx) this._draw(dx, dy)
  }

  _release() {
    this.active = false
    this.pointer = null
    this.dirX = 0
    this.dirY = 0
    this.magnitude = 0
    if (this.gfx) this.gfx.clear()
  }

  _createGfx() {
    // 必须绘制在场景 HUD 之上：本作世界物体深度按 y 排序（1000+），1000 会被坦克盖住
    this.gfx = this.scene.add.graphics().setDepth(9500)
    this.gfx.setScrollFactor(0)
  }

  _show() {
    if (this.gfx) this._draw(0, 0)
  }

  _draw(dx, dy) {
    const g = this.gfx
    g.clear()
    // base
    g.fillStyle(0xffffff, 0.14)
    g.fillCircle(this.baseX, this.baseY, this.maxR)
    g.lineStyle(2, 0xffffff, 0.35)
    g.strokeCircle(this.baseX, this.baseY, this.maxR)
    // thumb
    g.fillStyle(0xffffff, 0.45)
    g.fillCircle(this.baseX + dx, this.baseY + dy, 36)
  }

  destroy() {
    const sc = this.scene
    sc.input.off('pointerdown', this.onDown)
    sc.input.off('pointermove', this.onMove)
    sc.input.off('pointerup', this.onUp)
    sc.input.off('pointerupoutside', this.onUp)
    if (this.gfx) this.gfx.destroy()
  }
}
