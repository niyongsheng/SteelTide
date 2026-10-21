export const FONT = 'Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif'
export const MONO = '"SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'
// 标题/大号展示文字使用像素字体；正文与 HUD 仍用平滑字体保证可读性
export const PIXEL_FONT = '"Steel Tide Pixel", "PingFang SC", "Microsoft YaHei", sans-serif'

export const COLOR = {
  amber: '#f0b429',
  amberHex: 0xf0b429,
  steel: '#9fb3c8',
  text: '#e8eef5',
  dim: '#7d8b99',
  red: '#ff6b5b',
  redHex: 0xff6b5b,
  green: '#7ddc8a',
  greenHex: 0x7ddc8a,
}

/** 生存时间统一格式：mm:ss.d */
export function formatTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const tenth = Math.floor((s * 10) % 10)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenth}`
}

const BUTTON_STYLES = {
  primary: { fill: 0x2c5f8a, hover: 0x3a79ad, stroke: 0x9fd0ff, accent: 0xf0b429, text: '#ffffff', sub: '#cfe3ff' },
  gold: { fill: 0x7d5a19, hover: 0x9c7120, stroke: 0xf0b429, accent: 0xffe08a, text: '#ffffff', sub: '#ffe9b0' },
  secondary: { fill: 0x25313d, hover: 0x314252, stroke: 0x74899c, accent: 0x9fb3c8, text: '#e6eef6', sub: '#9fb3c8' },
  ghost: { fill: 0x151b22, hover: 0x222c36, stroke: 0x4a5866, accent: 0x74899c, text: '#c6d1dc', sub: '#8a99a8' },
  danger: { fill: 0x6f2a2a, hover: 0x8c3636, stroke: 0xff8a7a, accent: 0xffb4a8, text: '#ffffff', sub: '#ffd6cf' },
}

/**
 * 通用按钮（带悬停/按下反馈）。放在 container 里，坐标系为屏幕坐标。
 * 返回的 container 上挂了 setEnabled(bool) 便于动态禁用。
 */
export function makeButton(scene, {
  x, y, w = 240, h = 64, label, sub, onClick,
  variant = 'primary', disabled = false, fontSize = 24, onHover,
}) {
  const s = BUTTON_STYLES[variant] || BUTTON_STYLES.primary
  const c = scene.add.container(x, y)
  const g = scene.add.graphics()
  let state = 'idle'
  let focused = false

  const draw = () => {
    g.clear()
    const highlight = (state === 'hover' || focused) && !c.disabled
    const down = state === 'down' && !c.disabled
    const fill = c.disabled ? 0x1a2027 : down ? s.fill : highlight ? s.hover : s.fill
    g.fillStyle(0x000000, 0.35)
    g.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, 12)
    g.fillStyle(fill, 1)
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12)
    g.lineStyle(2, c.disabled ? 0x39434d : s.stroke, c.disabled ? 0.5 : highlight ? 1 : 0.65)
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12)
    g.fillStyle(c.disabled ? 0x39434d : s.accent, c.disabled ? 0.5 : 1)
    g.fillRoundedRect(-w / 2 + 12, -h / 2 + 12, 4, h - 24, 2)
    if (!c.disabled) {
      g.fillStyle(s.accent, highlight ? 0.22 : 0.1)
      g.fillRoundedRect(-w / 2 + 22, -h / 2 + 8, w - 34, 3, 2)
    }
    if (focused && !c.disabled) {
      g.lineStyle(3, 0xffe08a, 0.95)
      g.strokeRoundedRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10, 16)
    }
  }

  const applyScale = () => {
    c.setScale(focused && !c.disabled ? 1.025 : 1)
  }

  const textY = sub ? -9 : 0
  const labelText = scene.add
    .text(8, textY, label, {
      fontFamily: FONT, fontSize: `${fontSize}px`, fontStyle: 'bold', color: s.text,
      resolution: 2,
    })
    .setOrigin(0.5)
  labelText.setShadow(1, 2, '#000000', 3)
  const subText = sub
    ? scene.add
      .text(8, 19, sub, { fontFamily: FONT, fontSize: '14px', color: s.sub, resolution: 2 })
      .setOrigin(0.5)
    : null

  const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true })
  const reset = () => {
    state = 'idle'
    applyScale()
    draw()
  }
  zone.on('pointerover', () => {
    if (c.disabled) return
    state = 'hover'
    applyScale()
    draw()
    onHover?.()
  })
  zone.on('pointerout', reset)
  zone.on('pointerdown', () => {
    if (c.disabled) return
    scene.game.audio?.ensure?.()
    state = 'down'
    c.setScale(0.975)
    draw()
    onHover?.()
  })
  zone.on('pointerup', () => {
    if (c.disabled) return
    reset()
    onClick?.()
  })

  c.add([g, labelText])
  if (subText) c.add(subText)
  c.add(zone)
  c.setSize(w, h)
  c.disabled = disabled
  c.setFocused = (on = true) => {
    focused = !!on && !c.disabled
    // 焦点移走时清掉旧的 hover 高亮，避免鼠标和手柄同时高亮两个按钮
    if (!focused && state === 'hover') state = 'idle'
    applyScale()
    draw()
  }
  c.isFocused = () => focused
  c.setEnabled = (enabled) => {
    c.disabled = !enabled
    if (enabled) zone.setInteractive({ useHandCursor: true })
    else {
      zone.disableInteractive()
      focused = false
    }
    c.setAlpha(enabled ? 1 : 0.55)
    state = 'idle'
    applyScale()
    draw()
  }
  if (disabled) {
    zone.disableInteractive()
    c.setAlpha(0.55)
  }
  applyScale()
  draw()
  return c
}

const PILL_STYLES = {
  fill: 0x0b1219,
  fillAlpha: 0.78,
  hoverFill: 0x1b2a38,
  stroke: 0x74899c,
  strokeAlpha: 0.5,
  hoverStroke: 0xf0b429,
  hoverStrokeAlpha: 0.85,
  text: '#c6d1dc',
  hoverText: '#ffe08a',
  icon: 0xc6d1dc,
  hoverIcon: 0xffe08a,
}

/**
 * 紧凑型胶囊按钮，用于页面角落的辅助控件（全屏、GitHub 等）。
 * originX 为水平锚点：1 表示从 x 向左延伸，0 表示向右延伸。
 * icon(g, size, color) 可在右侧绘制小图标，坐标以图标中心为原点。
 */
export function makePillButton(scene, {
  x, y, label, icon, onClick, onHover, originX = 1,
  height = 34, fontSize = 13, paddingX = 14, gap = 8, iconSize = 14, depth = 30,
}) {
  const c = scene.add.container(x, y).setDepth(depth)
  const g = scene.add.graphics()
  const text = scene.add.text(0, 0, label, {
    fontFamily: FONT, fontSize: `${fontSize}px`, fontStyle: 'bold',
    color: PILL_STYLES.text, resolution: 2,
  }).setOrigin(0, 0.5)
  const iconG = icon ? scene.add.graphics() : null

  const contentW = text.width + (icon ? gap + iconSize : 0)
  const w = Math.ceil(contentW + paddingX * 2)
  const left = -w * originX
  const top = -height / 2
  text.setPosition(left + paddingX, 0.5)
  if (iconG) iconG.setPosition(left + paddingX + text.width + gap + iconSize / 2, 0)

  let hovered = false
  let pressed = false
  const draw = () => {
    g.clear()
    g.fillStyle(0x000000, 0.4)
    g.fillRoundedRect(left + 2, top + 3, w, height, height / 2)
    g.fillStyle(hovered ? PILL_STYLES.hoverFill : PILL_STYLES.fill, hovered ? 0.96 : PILL_STYLES.fillAlpha)
    g.fillRoundedRect(left, top, w, height, height / 2)
    g.lineStyle(1, hovered ? PILL_STYLES.hoverStroke : PILL_STYLES.stroke, hovered ? PILL_STYLES.hoverStrokeAlpha : PILL_STYLES.strokeAlpha)
    g.strokeRoundedRect(left, top, w, height, height / 2)
    text.setColor(hovered ? PILL_STYLES.hoverText : PILL_STYLES.text)
    c.setScale(pressed ? 0.97 : 1)
    if (iconG) {
      iconG.clear()
      icon(iconG, iconSize, hovered ? PILL_STYLES.hoverIcon : PILL_STYLES.icon)
    }
  }

  const zone = scene.add
    .zone(left + w / 2, 0, w, height)
    .setInteractive({ useHandCursor: true })
  zone.on('pointerover', () => {
    hovered = true
    draw()
    onHover?.()
  })
  zone.on('pointerout', () => {
    hovered = false
    pressed = false
    draw()
  })
  zone.on('pointerdown', () => {
    pressed = true
    draw()
  })
  zone.on('pointerup', () => {
    if (!pressed) return
    pressed = false
    draw()
    onClick?.()
  })

  c.add([g, text])
  if (iconG) c.add(iconG)
  c.add(zone)
  c.pillWidth = w
  c.redraw = draw
  draw()
  return c
}

/**
 * 小型通用焦点列表：按钮或关卡卡片都只需实现 setFocused(bool)。
 * items: [{ button, action, disabled? }]
 */
export class FocusList {
  constructor(scene, items = [], { index = 0 } = {}) {
    this.scene = scene
    this.items = items
    this.index = 0
    this.set(index)
  }

  set(index) {
    const count = this.items.length
    if (!count) return
    this.index = ((index % count) + count) % count
    this.items.forEach((item, i) => {
      const target = item.button || item
      target.setFocused?.(i === this.index)
    })
  }

  move(delta) {
    if (!delta) return
    this.set(this.index + Math.sign(delta))
  }

  activate() {
    const item = this.items[this.index]
    if (!item) return
    if (item.disabled || item.button?.disabled) return
    if (typeof item.action === 'function') item.action()
    else if (typeof item.button?.activate === 'function') item.button.activate()
  }
}

/** 半透明面板 + 描边（可带顶部高亮条） */
export function drawPanel(scene, cx, cy, w, h, {
  fill = 0x0d141c, alpha = 0.94, stroke = 0xf0b429, strokeAlpha = 0.7,
  radius = 18, accent = true, shadow = true,
} = {}) {
  const g = scene.add.graphics()
  if (shadow) {
    g.fillStyle(0x000000, 0.4)
    g.fillRoundedRect(cx - w / 2 + 6, cy - h / 2 + 8, w, h, radius)
  }
  g.fillStyle(fill, alpha)
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, radius)
  g.lineStyle(2, stroke, strokeAlpha)
  g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, radius)
  if (accent) {
    g.fillStyle(stroke, 0.95)
    g.fillRoundedRect(cx - w / 2 + 22, cy - h / 2 + 1, w - 44, 4, 2)
  }
  return g
}
