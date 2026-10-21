import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import MenuScene from './scenes/MenuScene.js'
import TutorialScene from './scenes/TutorialScene.js'
import SurvivalScene from './scenes/SurvivalScene.js'
import ResultScene from './scenes/ResultScene.js'
import PauseScene from './scenes/PauseScene.js'
import { isFullscreenSupported, toggleFullscreen } from './js/fullscreen.js'
import './style.css'

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#080c11',
  // 不全局开启 pixelArt：那会把文字纹理也设为 NEAREST，导致字体锯齿。
  // 世界贴图在 BootScene 里单独设为 NEAREST，文字保持 LINEAR 平滑采样。
  roundPixels: true,
  disableContextMenu: true,
  // 双摇杆需要至少 2 个触摸指针（默认仅 1 个）
  input: {
    activePointers: 3,
    gamepad: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    // 允许 WebGL 画布直接读取像素，保证战绩截图可靠
    preserveDrawingBuffer: true,
    // 文字与矢量图形使用线性采样；像素贴图会在 BootScene 中单独切回 NEAREST
    antialias: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, TutorialScene, SurvivalScene, ResultScene, PauseScene],
}

const game = new Phaser.Game(config)
// 调试钩子：浏览器控制台可访问 window.__game
window.__game = game

// 全局 F 键切换全屏（菜单、暂停、战斗中都可使用）
if (isFullscreenSupported()) {
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key !== 'f' && event.key !== 'F') return
    const target = event.target
    if (target instanceof HTMLElement) {
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
    }
    toggleFullscreen().catch((err) => console.warn('[Steel Tide] 切换全屏失败:', err))
  })
}
