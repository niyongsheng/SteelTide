import Phaser from 'phaser'
import CombatScene, { DEPTH } from './CombatScene.js'
import { buildTrainingGround, TILE } from '../js/MapBuilder.js'
import { markTutorialDone } from '../js/storage.js'
import { FONT, PIXEL_FONT, COLOR, drawPanel } from '../js/ui.js'

const STEPS = [
  {
    title: '移动',
    hint: '走到黄色集合点',
    detail: 'WASD / 方向键移动 · 手机使用左半屏摇杆',
  },
  {
    title: '瞄准与射击',
    hint: '击毁 3 辆靶车',
    detail: '鼠标瞄准，左键 / 空格开火 · 手机使用右半屏摇杆',
  },
  {
    title: '实战演练',
    hint: '击毁 3 辆敌方坦克',
    detail: '移动中开火，注意躲开敌方炮弹',
  },
  {
    title: '拾取补给',
    hint: '拾取战场上的维修补给',
    detail: '靠近补给自动拾取，可恢复装甲',
  },
]

export default class TutorialScene extends CombatScene {
  constructor() {
    super('Tutorial')
  }

  getLevelConfig() {
    return {
      mapW: 20 * TILE,
      mapH: 14 * TILE,
      player: {
        x: 10 * TILE + TILE / 2,
        y: 7 * TILE + TILE / 2,
        hp: 150,
        damage: 20,
        fireRate: 240,
        speed: 235,
        godMode: true,
        invuln: 0.7,
      },
      dropChance: 0,
      deadzone: [200, 140],
    }
  }

  buildWorld() {
    buildTrainingGround(this)
  }

  buildLevelHud() {
    const W = this.scale.width
    const H = this.scale.height

    this.title = this.add.text(24, 8, '第一关 · 新兵训练', {
      fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: COLOR.amber, resolution: 2,
    })
    this.title.setShadow(1, 1, '#000000', 3)
    this.hud.add(this.title)

    // 右上角目标卡
    const panelW = 330
    const panelH = 196
    const cx = W - 24 - panelW / 2
    const cy = 16 + panelH / 2
    const panel = drawPanel(this, cx, cy, panelW, panelH, {
      fill: 0x0a1118, alpha: 0.97, stroke: 0x8fa4b8, strokeAlpha: 0.45, accent: false,
    })
    panel.setScrollFactor(0).setDepth(DEPTH.HUD - 1)
    this.objectiveTitle = this.add.text(cx - panelW / 2 + 18, 32, '训练目标', {
      fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#e8eef5', resolution: 2,
    })
    this.objectiveCount = this.add
      .text(cx + panelW / 2 - 18, 34, '0 / 4', {
        fontFamily: FONT, fontSize: '15px', color: '#9fb3c8', resolution: 2,
      })
      .setOrigin(1, 0)
    this.objectiveRows = []
    for (let i = 0; i < STEPS.length; i++) {
      const t = this.add.text(cx - panelW / 2 + 18, 64 + i * 31, '', {
        fontFamily: FONT, fontSize: '16px', color: '#7d8b99', resolution: 2,
      })
      this.objectiveRows.push(t)
    }
    this.hud.add([this.objectiveTitle, this.objectiveCount, ...this.objectiveRows])

    // 步骤横幅
    this.stepBanner = this.add
      .text(W / 2, 178, '', {
        fontFamily: PIXEL_FONT, fontSize: '36px', color: COLOR.amber,
        stroke: '#000000', strokeThickness: 7, resolution: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0)
    this.hud.add(this.stepBanner)

    // 底部指令条
    const hintBg = drawPanel(this, W / 2, H - 100, 840, 84, {
      fill: 0x0a1017, alpha: 0.78, stroke: 0x46586a, strokeAlpha: 0.55, accent: false,
    })
    hintBg.setScrollFactor(0).setDepth(DEPTH.HUD - 1)
    this.stepHint = this.add
      .text(W / 2, H - 116, '', {
        fontFamily: PIXEL_FONT, fontSize: '24px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 4, resolution: 2,
      })
      .setOrigin(0.5)
    this._defaultControlHint = this.isTouch
      ? '左半屏摇杆移动 · 右半屏摇杆瞄准并开火'
      : 'WASD / 方向键 移动 · 鼠标瞄准 · 左键 / 空格 开火'
    this.controlHint = this.add
      .text(W / 2, H - 86, this._defaultControlHint, {
        fontFamily: FONT, fontSize: '14px', color: '#9fb3c8', resolution: 2,
      })
      .setOrigin(0.5)
    const modeHint = this.add.text(24, H - 26, '训练模式 · 不会真正阵亡', {
      fontFamily: FONT, fontSize: '12px', color: '#6f7f8f', resolution: 2,
    })
    this.hud.add([this.stepHint, this.controlHint, modeHint])
  }

  onGamepadChanged(connected) {
    if (!this.controlHint) return
    this.controlHint.setText(connected
      ? '手柄 左摇杆移动 · 右摇杆瞄准 · RT/RB 开火 · Start 暂停'
      : this._defaultControlHint)
  }

  onLevelStart() {
    this.stepIndex = -1
    this.stepBusy = false
    this.targetsLeft = 0
    this.enemiesLeft = 0
    this.finished = false
    this.checkpoint = null
    this._advanceStep()
  }

  updateLevel() {
    if (this.finished || this.stepBusy) return
    if (this.stepIndex === 0 && this.checkpoint) {
      const d = Phaser.Math.Distance.Between(
        this.playerBody.x, this.playerBody.y, this.checkpoint.x, this.checkpoint.y,
      )
      if (d < 60) {
        this._popCheckpoint()
        this._completeStep()
      }
    }
  }

  onEnemyKilled(e) {
    if (this.finished || this.stepBusy) return
    if (this.stepIndex === 1 && e.getData('dummy')) {
      this.targetsLeft--
      this.stepHint.setText(`击毁 3 辆靶车（${3 - this.targetsLeft}/3）`)
      this._updateObjectiveHud()
      if (this.targetsLeft <= 0) this._completeStep()
    } else if (this.stepIndex === 2 && !e.getData('dummy')) {
      this.enemiesLeft--
      this.stepHint.setText(`击毁 3 辆敌方坦克（${3 - this.enemiesLeft}/3）`)
      this._updateObjectiveHud()
      if (this.enemiesLeft <= 0) this._completeStep()
    }
  }

  onPickup() {
    if (this.finished || this.stepBusy) return
    if (this.stepIndex === 3) this._completeStep()
  }

  /* ---------------- 步骤流转 ---------------- */

  _advanceStep() {
    this.stepIndex++
    if (this.stepIndex >= STEPS.length) {
      this._completeTutorial()
      return
    }
    const step = STEPS[this.stepIndex]
    this._updateObjectiveHud()
    this._showBanner(`目标 ${this.stepIndex + 1} · ${step.title}`, COLOR.amber)
    this.stepHint.setText(step.hint)
    this.stepHint.setColor('#ffffff')
    this.audio.waveStart()

    if (this.stepIndex === 0) this._createCheckpoint()
    else if (this.stepIndex === 1) this._spawnTargets()
    else if (this.stepIndex === 2) this._spawnTrainingEnemies()
    else if (this.stepIndex === 3) this._spawnSupply()
  }

  _completeStep() {
    if (this.stepBusy || this.finished) return
    this.stepBusy = true
    this.audio.stepComplete()
    this._showBanner('☑ 目标完成', '#7ddc8a')
    this.time.delayedCall(700, () => {
      this.stepBusy = false
      this._advanceStep()
    })
  }

  _completeTutorial() {
    if (this.finished) return
    this.finished = true
    this._updateObjectiveHud()
    markTutorialDone()
    this.audio.victory()
    this.stepHint.setText('训练完成，准备进入生存战场').setColor('#7ddc8a')
    this._showBanner('训练完成', '#7ddc8a')
    this.time.delayedCall(1000, () => {
      this.scene.pause()
      this.scene.launch('Result', {
        mode: 'tutorial',
        time: this.timeAlive,
        kills: this.kills,
      })
    })
  }

  _updateObjectiveHud() {
    const done = Math.min(this.stepIndex, STEPS.length)
    this.objectiveCount.setText(`${done} / ${STEPS.length}`)
    STEPS.forEach((step, i) => {
      const row = this.objectiveRows[i]
      if (i < this.stepIndex) {
        row.setText(`✓  ${step.title}`).setColor('#7ddc8a')
      } else if (i === this.stepIndex) {
        row.setText(`▶  ${step.title}`).setColor(COLOR.amber)
      } else {
        row.setText(`○  ${step.title}`).setColor('#7d8b99')
      }
    })
  }

  _showBanner(text, color) {
    this.stepBanner.setText(text).setColor(color).setAlpha(0)
    this.tweens.killTweensOf(this.stepBanner)
    this.tweens.add({
      targets: this.stepBanner,
      alpha: 1,
      y: { from: 168, to: 178 },
      duration: 220,
      ease: 'Quad.out',
      yoyo: true,
      hold: 900,
      onComplete: () => this.stepBanner.setAlpha(0),
    })
  }

  /* ---------------- 步骤内容 ---------------- */

  _createCheckpoint() {
    const x = 14 * TILE + TILE / 2
    const y = 9 * TILE + TILE / 2
    const c = this.add.container(x, y).setDepth(8)
    const ring = this.add.circle(0, 0, 46).setStrokeStyle(3, 0xf0b429, 0.95)
    const inner = this.add.circle(0, 0, 14, 0xf0b429, 0.35)
    const label = this.add
      .text(0, -68, '集合点', {
        fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffe9b0',
        stroke: '#000000', strokeThickness: 3, resolution: 2,
      })
      .setOrigin(0.5)
    const beam = this.add.rectangle(0, -34, 4, 60, 0xf0b429, 0.35)
    c.add([ring, inner, beam, label])
    this.tweens.add({
      targets: ring, scale: 1.28, alpha: 0.25, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    })
    this.checkpoint = c
  }

  _popCheckpoint() {
    if (!this.checkpoint) return
    const { x, y } = this.checkpoint
    this._explode(x, y, 0.6)
    this.checkpoint.destroy()
    this.checkpoint = null
  }

  _spawnTargets() {
    this.targetsLeft = 3
    const spots = [
      [4, 5], [16, 8], [17, 11],
    ]
    for (const [gx, gy] of spots) {
      const x = gx * TILE + TILE / 2
      const y = gy * TILE + TILE / 2
      const e = this._spawnEnemy('target', x, y)
      if (!e) continue
      const marker = this.add.container(x, y).setDepth(7)
      const ring = this.add.circle(0, 0, 38).setStrokeStyle(2, 0xff5544, 0.8)
      const dot = this.add.circle(0, 0, 5, 0xff5544, 0.8)
      const label = this.add
        .text(0, -62, '靶车', {
          fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffb4a8',
          stroke: '#000000', strokeThickness: 3, resolution: 2,
        })
        .setOrigin(0.5)
      marker.add([ring, dot, label])
      this.tweens.add({
        targets: ring, scale: 1.24, alpha: 0.2, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      })
      e.setData('marker', marker)
      e.once('destroy', () => { if (marker.active) marker.destroy() })
    }
    this._updateObjectiveHud()
  }

  _spawnTrainingEnemies() {
    this.enemiesLeft = 3
    const spawns = [
      { x: 72, y: 7 * TILE + TILE / 2 },
      { x: this.mapW - 72, y: 7 * TILE + TILE / 2 },
      { x: 10 * TILE + TILE / 2, y: this.mapH - 64 },
    ]
    spawns.forEach((p, i) => {
      const type = i % 2 === 0 ? 'sand' : 'green'
      this._spawnEnemy(type, p.x, p.y, {
        hpMul: 0.6, dmgMul: 0.35, speedMul: 0.78, fireMul: 2.4,
      })
    })
    this._updateObjectiveHud()
  }

  _spawnSupply() {
    const x = 10 * TILE + TILE / 2
    const y = 10 * TILE + TILE / 2
    // 掉落物自带光环与名称标签，不再重复叠加信标
    this._spawnDrop('drop_heal', x, y, { permanent: true })
    this._updateObjectiveHud()
  }
}
