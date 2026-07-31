import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import BattleScene from './scenes/BattleScene.js'
import GameOverScene from './scenes/GameOverScene.js'
import './style.css'

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#2b3a2b',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, BattleScene, GameOverScene],
}

const game = new Phaser.Game(config)
// 调试钩子：浏览器控制台可访问 window.__game
window.__game = game
