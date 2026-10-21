import { makePillButton } from './ui.js'
import { isFullscreen, isFullscreenSupported, onFullscreenChange, toggleFullscreen } from './fullscreen.js'

export const GITHUB_URL = 'https://github.com/niyongsheng/SteelTide'

/** 四角括号图标：进入全屏朝外，退出全屏朝内 */
function drawFullscreenIcon(g, size, color, active) {
  const s = size / 2
  const arm = size * 0.45
  g.lineStyle(2, color, 0.95)
  const corner = (px, py, dx, dy) => {
    g.beginPath()
    g.moveTo(px + dx * arm, py)
    g.lineTo(px, py)
    g.lineTo(px, py + dy * arm)
    g.strokePath()
  }
  if (active) {
    corner(-s + arm, -s + arm, -1, -1)
    corner(s - arm, -s + arm, 1, -1)
    corner(-s + arm, s - arm, -1, 1)
    corner(s - arm, s - arm, 1, 1)
  } else {
    corner(-s, -s, 1, 1)
    corner(s, -s, -1, 1)
    corner(-s, s, 1, -1)
    corner(s, s, -1, -1)
  }
}

/** 右上角辅助控件组：GitHub 源码 + 全屏切换（不支持全屏的环境只显示 GitHub） */
export function addScreenChrome(scene, { x, y, github = true, fullscreen = true }) {
  let cursor = x
  if (fullscreen && isFullscreenSupported()) {
    const button = addFullscreenButton(scene, cursor, y)
    cursor -= button.pillWidth + 8
  }
  if (github) addGithubButton(scene, cursor, y)
}

export function addFullscreenButton(scene, x, y) {
  let active = isFullscreen()
  const button = makePillButton(scene, {
    x,
    y,
    label: '全屏',
    icon: (g, size, color) => drawFullscreenIcon(g, size, color, active),
    onClick: () => {
      toggleFullscreen().catch((err) => {
        console.warn('[Steel Tide] 切换全屏失败:', err)
      })
    },
  })

  // 无论从按钮、F 键还是系统操作进入/退出全屏，都同步图标状态
  const off = onFullscreenChange((next) => {
    active = next
    button.redraw()
  })
  scene.events.once('shutdown', off)
  return button
}

export function addGithubButton(scene, x, y) {
  return makePillButton(scene, {
    x,
    y,
    label: 'GitHub 源码 ↗',
    onClick: () => {
      window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')
    },
  })
}
