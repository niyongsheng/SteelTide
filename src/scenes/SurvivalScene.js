import Phaser from 'phaser'
import CombatScene, { DEPTH } from './CombatScene.js'
import { buildDesertArena, TILE } from '../js/MapBuilder.js'
import { getBestTime, saveBestTime } from '../js/storage.js'
import { pickSurvivalType } from '../js/enemyTypes.js'
import { FONT, PIXEL_FONT, COLOR, drawPanel, formatTime } from '../js/ui.js'

export default class SurvivalScene extends CombatScene {
  constructor() {
    super('Survival')
  }

  getLevelConfig() {
    return {
      mapW: 26 * TILE,
      mapH: 19 * TILE,
      player: {
        x: 13 * TILE + TILE / 2,
        y: 9 * TILE + TILE / 2,
        hp: 100,
        damage: 17,
        fireRate: 220,
        speed: 225,
        invuln: 0.9,
      },
      dropChance: 0.1,
      deadzone: [240, 170],
    }
  }

  buildWorld() {
    buildDesertArena(this)
  }

  buildLevelHud() {
    const W = this.scale.width
    const H = this.scale.height

    this.title = this.add.text(24, 8, '第二关 · 生存极限', {
      fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: COLOR.red, resolution: 2,
    })
    this.title.setShadow(1, 1, '#000000', 3)
    this.hud.add(this.title)

    // 中央计时器（得分）
    const timerW = 286
    const timerPanel = drawPanel(this, W / 2, 62, timerW, 88, {
      fill: 0x0a1118, alpha: 0.97, stroke: 0xf0b429, strokeAlpha: 0.6, accent: false,
    })
    timerPanel.setScrollFactor(0).setDepth(DEPTH.HUD - 1)
    const timerLabel = this.add
      .text(W / 2, 30, '生存时间', {
        fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#9fb3c8', resolution: 2,
      })
      .setOrigin(0.5)
    this.timerText = this.add
      .text(W / 2, 64, '00:00.0', {
        fontFamily: PIXEL_FONT, fontSize: '48px', color: COLOR.amber, resolution: 2,
      })
      .setOrigin(0.5)
    this.timerText.setShadow(2, 2, '#000000', 4)

    // 右侧战况
    const statW = 232
    const statCx = W - 24 - statW / 2
    const statPanel = drawPanel(this, statCx, 68, statW, 104, {
      fill: 0x0a1118, alpha: 0.97, stroke: 0x8fa4b8, strokeAlpha: 0.4, accent: false,
    })
    statPanel.setScrollFactor(0).setDepth(DEPTH.HUD - 1)
    this.statText = this.add
      .text(statCx + statW / 2 - 16, 28, '', {
        fontFamily: FONT, fontSize: '15px', color: '#dbe6f0', align: 'right', lineSpacing: 7, resolution: 2,
      })
      .setOrigin(1, 0)
    this.hud.add([timerLabel, this.timerText, this.statText])

    // 波次/警告横幅
    this.bannerText = this.add
      .text(W / 2, 188, '', {
        fontFamily: PIXEL_FONT, fontSize: '48px', color: COLOR.amber,
        stroke: '#000000', strokeThickness: 8, resolution: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0)
    this.bannerSub = this.add
      .text(W / 2, 238, '', {
        fontFamily: PIXEL_FONT, fontSize: '24px', color: '#c6d1dc', stroke: '#000000', strokeThickness: 4, resolution: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0)
    this.hud.add([this.bannerText, this.bannerSub])

    // 低血量红色警示
    this.lowHpFx = this.add
      .rectangle(W / 2, H / 2, W, H, 0xff2218, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD - 100)
  }

  onLevelStart() {
    this.wave = 1
    this.spawnTimer = 1.8
    this.burstQueue = []
    this.burstTimer = 0
    this.nextBossAt = 75
    this.nextSupplyAt = 40
    this.bestAtStart = getBestTime()
    this.beatBestShown = false
    this._lastTimerUpdate = -1
    this._lastTimerText = ''
    this._lastStatText = ''
    this._updateStatsHud(true)
    this._banner('生存开始', '生存时间就是得分 · 尽可能活下去')
    this.audio.waveStart()
  }

  updateLevel(dt) {
    const t = this.timeAlive

    // 每 18 秒一波，波次越高增援越多
    const waveNow = 1 + Math.floor(t / 18)
    if (waveNow !== this.wave) {
      this.wave = waveNow
      this._onWave(waveNow)
    }

    // 连续增援（越来越快）
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.55, 2.7 - t * 0.016)
      if (this.enemies.countActive(true) < 38) this._spawnAtEdge(t)
    }

    // 波次爆发队列（错峰出生）
    if (this.burstQueue.length > 0) {
      this.burstTimer -= dt
      if (this.burstTimer <= 0) {
        this.burstTimer = 0.22
        this._spawnAtEdge(t, this.burstQueue.shift())
      }
    }

    // 泰坦
    if (t >= this.nextBossAt) {
      this.nextBossAt += 62
      this._spawnBoss(t)
    }

    // 定期空投维修
    if (t >= this.nextSupplyAt) {
      this.nextSupplyAt += 42
      this._dropSupply()
    }

    // 计时器（10Hz 刷新）
    if (t - this._lastTimerUpdate >= 0.08) {
      this._lastTimerUpdate = t
      const text = formatTime(t)
      if (text !== this._lastTimerText) {
        this._lastTimerText = text
        this.timerText.setText(text)
      }
      this._updateStatsHud()
    }

    // 低血量脉冲
    const low = this.S.hp / this.S.maxHp < 0.3
    this.lowHpFx.setAlpha(low ? 0.07 + 0.05 * (0.5 + 0.5 * Math.sin(this.time.now / 180)) : 0)

    // 首次超过历史最佳
    if (!this.beatBestShown && this.bestAtStart > 0 && t > this.bestAtStart) {
      this.beatBestShown = true
      this._toast('已超越历史最佳！', COLOR.amber)
      this.audio.upgrade()
    }
  }

  onEnemyKilled() {
    this._updateStatsHud(true)
  }

  getDropChance(enemy) {
    return enemy.getData('elite') ? 0.55 : 0.11
  }

  /* ---------------- 增援 ---------------- */

  _onWave(wave) {
    this._banner(`第 ${wave} 波`, '敌军增援正在逼近')
    this.audio.waveStart()
    this.cameras.main.flash(120, 240, 180, 60, false)
    const count = Math.min(3 + wave, 12)
    for (let i = 0; i < count; i++) {
      this.burstQueue.push(pickSurvivalType(this.timeAlive))
    }
  }

  _diff(t) {
    return {
      hpMul: 1 + t / 42,
      dmgMul: 1 + t / 95,
      speedAdd: Math.min(85, t * 0.42),
      fireMul: Math.max(0.45, 1 - t / 260),
    }
  }

  _spawnAtEdge(t, forcedType) {
    const type = forcedType || pickSurvivalType(t)
    const p = this._findSpawnPoint(470)
    this._spawnEnemy(type, p.x, p.y, this._diff(t))
  }

  _spawnBoss(t) {
    const p = this._findSpawnPoint(520)
    this._spawnEnemy('huge', p.x, p.y, {
      hpMul: 0.9 + t / 75,
      dmgMul: 1 + t / 120,
      fireMul: Math.max(0.6, 1 - t / 400),
      scaleMul: 1.05,
    })
    this._banner('警告：泰坦来袭', '重装单位进入战场')
    this.bannerText.setColor(COLOR.red)
    this.cameras.main.shake(420, 0.008)
    this.audio.warning()
  }

  _dropSupply() {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Phaser.Math.Between(240, 470)
      const x = Phaser.Math.Clamp(this.playerBody.x + Math.cos(a) * r, 80, this.mapW - 80)
      const y = Phaser.Math.Clamp(this.playerBody.y + Math.sin(a) * r, 80, this.mapH - 80)
      if (this._spawnBlocked(x, y)) continue
      this._spawnDrop('drop_heal', x, y)
      this._toast('维修补给已空投', COLOR.green)
      return
    }
    this._spawnDrop('drop_heal', this.playerBody.x + 120, this.playerBody.y, { permanent: true })
    this._toast('维修补给已投放在附近', COLOR.green)
  }

  /* ---------------- HUD / 结算 ---------------- */

  _banner(title, sub = '') {
    this.bannerText.setText(title).setColor(COLOR.amber).setAlpha(0)
    this.bannerSub.setText(sub).setAlpha(0)
    this.tweens.killTweensOf([this.bannerText, this.bannerSub])
    this.tweens.add({
      targets: this.bannerText, alpha: 1, duration: 180, yoyo: true, hold: 1000,
      onComplete: () => this.bannerText.setAlpha(0),
    })
    this.tweens.add({
      targets: this.bannerSub, alpha: 0.95, duration: 180, yoyo: true, hold: 1000,
      onComplete: () => this.bannerSub.setAlpha(0),
    })
  }

  _updateStatsHud(force = false) {
    const best = this.bestAtStart
    const text = `击杀   ${this.kills}\n波次   ${this.wave}\n最佳   ${best > 0 ? formatTime(best) : '—'}`
    if (force || text !== this._lastStatText) {
      this._lastStatText = text
      this.statText.setText(text)
    }
  }

  onPlayerDeath() {
    const time = Math.round(this.timeAlive * 10) / 10
    const prevBest = getBestTime()
    const isRecord = time > prevBest
    if (isRecord) saveBestTime(time)
    this.scene.pause()
    this.scene.launch('Result', {
      mode: 'survival',
      time,
      kills: this.kills,
      wave: this.wave,
      best: Math.max(prevBest, time),
      isRecord,
    })
  }
}
