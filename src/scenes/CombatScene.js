import Phaser from 'phaser'
import Joystick from '../js/Joystick.js'
import GameAudio from '../js/Audio.js'
import GamepadInput from '../js/GamepadInput.js'
import { ENEMY_TYPES } from '../js/enemyTypes.js'
import { addTreads } from '../js/MapBuilder.js'
import { FONT, COLOR } from '../js/ui.js'

export const DEPTH = {
  GROUND: 0,
  DECOR: 5,
  ACTOR: 1000,
  BAR: 4000,
  DROP: 4500,
  BULLET: 5000,
  FX: 6000,
  HUD: 9000,
}

/** 掉落物定义：图标全部来自 Kenney specialBarrel 系列 */
export const DROP_DEFS = {
  drop_triple: { tex: 'specialBarrel1', name: '三连发', desc: '主炮三连射 10 秒', color: '#9fd0ff' },
  drop_rapid: { tex: 'specialBarrel2', name: '速射', desc: '射速翻倍 10 秒', color: '#9fd0ff' },
  drop_pierce: { tex: 'specialBarrel3', name: '穿甲弹', desc: '子弹穿透 8 秒', color: '#9fd0ff' },
  drop_heal: { tex: 'specialBarrel4', name: '维修包', desc: '恢复装甲', color: '#7ddc8a' },
  drop_shield: { tex: 'specialBarrel5', name: '护盾', desc: '吸收一次伤害', color: '#7ddc8a' },
  drop_clear: { tex: 'specialBarrel6', name: '战术清场', desc: '摧毁全部敌军', color: '#ffb36b' },
  drop_overdrive: { tex: 'specialBarrel7', name: '超载', desc: '三连发 + 极速 8 秒', color: '#ffd54a' },
}

const BUFF_ICONS = [
  { id: 'triple', tex: 'specialBarrel1', dur: 10 },
  { id: 'rapid', tex: 'specialBarrel2', dur: 10 },
  { id: 'pierce', tex: 'specialBarrel3', dur: 8 },
  { id: 'overdrive', tex: 'specialBarrel7', dur: 8 },
  { id: 'shield', tex: 'specialBarrel5', dur: 0 },
]

const DROP_TABLE = [
  { type: 'drop_heal', weight: 30 },
  { type: 'drop_triple', weight: 17 },
  { type: 'drop_rapid', weight: 17 },
  { type: 'drop_pierce', weight: 12 },
  { type: 'drop_shield', weight: 12 },
  { type: 'drop_clear', weight: 7 },
  { type: 'drop_overdrive', weight: 5 },
]

/**
 * 双关卡共用的战斗基类。
 * 子类只需提供 getLevelConfig / buildWorld / buildLevelHud / updateLevel 等钩子。
 */
export default class CombatScene extends Phaser.Scene {
  constructor(key) {
    super(key)
  }

  /* ================= 生命周期 ================= */

  create() {
    this.cfg = this.getLevelConfig()
    this.mapW = this.cfg.mapW
    this.mapH = this.cfg.mapH

    if (!this.game.audio) this.game.audio = new GameAudio()
    this.audio = this.game.audio
    this.isTouch = this.sys.game.device.input.touch

    this.dead = false
    this.invincible = 0
    this.nextFire = 0
    this.mouseDown = false
    this.pointerSeen = false
    this.onOil = false
    this.kills = 0
    this.timeAlive = 0
    this.trackTimer = 0
    this.trackMarks = []
    this.aimAngle = -Math.PI / 2
    this.lastMoveAngle = -Math.PI / 2
    this.buffs = { triple: 0, rapid: 0, pierce: 0, overdrive: 0, shield: false }
    this._lastEnemyShot = 0
    this._pausing = false
    this._pauseLockUntil = 0

    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH)
    this.physics.world.setBounds(0, 0, this.mapW, this.mapH)
    if (this.input.mouse) this.input.mouse.disableContextMenu()

    // 地图构建依赖这三个组
    this.solids = this.physics.add.staticGroup()
    this.covers = this.physics.add.staticGroup()
    this.oils = this.physics.add.staticGroup()

    this._createAnimations()
    this.buildWorld()

    this._createPlayer()
    this._createGroups()
    this._setupCollisions()
    this._buildBaseHud()
    this.buildLevelHud()

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,M')
    this._bindInput()
    this._buildJoysticks()

    this.pad = new GamepadInput(this, {
      onConnect: () => this._onPadConnection(true),
      onDisconnect: () => this._onPadConnection(false),
      onActivity: () => this.audio?.ensure?.(),
    })
    this.events.on(Phaser.Scenes.Events.RESUME, this._onSceneResume, this)
    this.onGamepadChanged?.(this.pad.connected)

    this.cameras.main.centerOn(this.playerBody.x, this.playerBody.y)
    this.cameras.main.startFollow(this.playerBody, true, 0.12, 0.12)
    if (this.cfg.deadzone) this.cameras.main.setDeadzone(this.cfg.deadzone[0], this.cfg.deadzone[1])

    this._onWorldBounds = (body) => {
      const g = body.gameObject
      if (g && g.active && g.getData && g.getData('bullet')) this._despawnBullet(g)
    }
    this.physics.world.on('worldbounds', this._onWorldBounds)

    this.events.once('shutdown', () => {
      // 场景关闭时 Arcade 物理世界可能已被销毁，必须做空值保护
      const world = this.physics?.world
      if (world && this._onWorldBounds) world.off('worldbounds', this._onWorldBounds)
      this.jl?.destroy()
      this.jr?.destroy()
      this.jl = null
      this.jr = null
      this.pad?.destroy()
      this.pad = null
    })

    this.onLevelStart()
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05)
    if (this.dead) return
    if (this.pad?.justPressed('start') && this._canPause()) {
      this._pauseGame()
      return
    }
    this.timeAlive += dt
    this.onOil = false
    this._updateBuffs(dt)
    this._updatePlayer(dt)
    this._updateEnemies(dt)
    this._updateHudBase()
    this.updateLevel(dt)
  }

  /* ================= 子类钩子 ================= */

  getLevelConfig() {
    throw new Error('getLevelConfig() must be implemented')
  }

  buildWorld() {}
  buildLevelHud() {}
  updateLevel() {}
  onLevelStart() {}
  onEnemyKilled() {}
  onPlayerDeath() {}
  onPickup() {}
  onGamepadChanged() {}

  getDropChance(enemy) {
    return enemy.getData('elite') ? 0.45 : (this.cfg.dropChance ?? 0.1)
  }

  /* ================= 构建 ================= */

  _createAnimations() {
    if (this.anims.exists('explode')) return
    const framesOf = (keys) => keys.map((key) => ({ key }))
    const boom = ['explosion1', 'explosion2', 'explosion3', 'explosion4', 'explosion5']
    const smoke = ['explosionSmoke1', 'explosionSmoke2', 'explosionSmoke3', 'explosionSmoke4', 'explosionSmoke5']
    this.anims.create({ key: 'explode', frames: framesOf(boom), frameRate: 16, hideOnComplete: true })
    this.anims.create({ key: 'smoke', frames: framesOf(smoke), frameRate: 8, hideOnComplete: true })
  }

  _createPlayer() {
    const p = this.cfg.player
    this.S = {
      hp: p.hp,
      maxHp: p.hp,
      damage: p.damage,
      fireRate: p.fireRate,
      speed: p.speed,
    }
    this.playerShadow = this.add
      .ellipse(p.x, p.y + 14, 46, 22, 0x000000, 0.2)
      .setDepth(DEPTH.ACTOR + p.y - 1)
    this.playerBody = this.physics.add.image(p.x, p.y, 'tankBody_blue')
    this.playerBody.setDepth(DEPTH.ACTOR + p.y)
    this.playerBody.setCollideWorldBounds(true)
    this.playerBody.body.setSize(this.playerBody.width * 0.8, this.playerBody.height * 0.8)
    this.playerBody.body.mass = 100
    this.playerBody.setData('kind', 'player')

    this.playerBarrel = this.add
      .image(p.x, p.y, 'tankBlue_barrel1')
      .setOrigin(0.5, 0.85)
      .setDepth(DEPTH.ACTOR + p.y + 1)
  }

  _createGroups() {
    this.pBullets = this.physics.add.group({ maxSize: 140 })
    this.eBullets = this.physics.add.group({ maxSize: 160 })
    this.enemies = this.physics.add.group()
    this.drops = this.physics.add.group()
    for (const g of [this.pBullets, this.eBullets]) g.runChildUpdate = false
  }

  _setupCollisions() {
    this.physics.add.collider(this.playerBody, this.solids)
    this.physics.add.collider(this.enemies, this.solids)
    this.physics.add.collider(this.enemies, this.enemies)

    this.physics.add.overlap(this.pBullets, this.solids, (b) => this._bulletHitObstacle(b))
    this.physics.add.overlap(this.pBullets, this.covers, (b) => this._bulletHitObstacle(b))
    this.physics.add.overlap(this.eBullets, this.solids, (b) => this._despawnBullet(b))
    this.physics.add.overlap(this.eBullets, this.covers, (b) => this._despawnBullet(b))

    this.physics.add.overlap(this.pBullets, this.enemies, (b, e) => this._onBulletHitEnemy(b, e))
    // 注意：Group vs Sprite 的 Arcade 回调参数是 (sprite, groupChild)，
    // 即先传入 playerBody，再传入子弹/敌人，不能想当然按声明顺序取参数。
    this.physics.add.overlap(this.eBullets, this.playerBody, (player, bullet) => this._onEnemyBulletHitPlayer(bullet))

    this.physics.add.collider(this.enemies, this.playerBody, (player, enemy) => this._onEnemyTouchPlayer(enemy))
    this.physics.add.overlap(this.playerBody, this.drops, (p, d) => this._pickup(d))
    this.physics.add.overlap(this.playerBody, this.oils, () => { this.onOil = true })
  }

  _buildBaseHud() {
    this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.HUD)
    this.hpGfx = this.add.graphics()
    this.hpLabel = this.add
      .text(34, 45, '装甲', {
        fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#e8eef5', resolution: 2,
      })
      .setOrigin(0, 0.5)
    this.hpText = this.add
      .text(250, 45, '', {
        fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff', resolution: 2,
      })
      .setOrigin(1, 0.5)
    this.hud.add([this.hpGfx, this.hpLabel, this.hpText])
    this._hudRatio = -1
    this._hudColor = -1
    this._hudHpText = ''

    this.buffIcons = []
    BUFF_ICONS.forEach((def, i) => {
      const bx = 38 + i * 48
      const by = 82
      const bg = this.add
        .circle(bx, by, 20, 0x080d12, 0.8)
        .setStrokeStyle(1, 0x8fa4b8, 0.4)
        .setVisible(false)
      const icon = this.add.image(bx, by, def.tex).setScale(1.15).setVisible(false)
      const bar = this.add
        .rectangle(bx - 16, by + 25, 32, 3, 0xf0b429)
        .setOrigin(0, 0.5)
        .setVisible(false)
      this.hud.add([bg, icon, bar])
      this.buffIcons.push({ ...def, bg, icon, bar })
    })

    this.toastText = this.add
      .text(this.scale.width / 2, this.scale.height - 64, '', {
        fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: COLOR.amber,
        stroke: '#000000', strokeThickness: 4, resolution: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0)
    this.hud.add(this.toastText)
  }

  _bindInput() {
    this.input.on('pointerdown', (p) => {
      this.audio.ensure()
      if (!this.isTouch) {
        this.mouseDown = true
        this.pointerSeen = true
        this._downAt = p.time
      }
    })
    this.input.on('pointermove', () => {
      if (!this.isTouch) this.pointerSeen = true
    })
    this.input.on('pointerup', (p) => {
      if (this.isTouch) return
      // 快速点击时开火帧可能漏读 mouseDown，短按补一发
      if (this.playerBody?.active && p.time - this._downAt < 250) {
        const a = Phaser.Math.Angle.Between(this.playerBody.x, this.playerBody.y, p.worldX, p.worldY)
        this._fire(a)
      }
      this.mouseDown = false
    })
    this.input.keyboard.on('keydown-M', () => {
      const muted = this.audio.toggleMute()
      this._toast(muted ? '已静音' : '声音已开启', muted ? '#9fb3c8' : COLOR.amber)
    })
    this.input.keyboard.on('keydown-ESC', (ev) => {
      if (ev?.repeat) return
      if (this._canPause()) this._pauseGame()
    })
    this.input.keyboard.on('keydown', () => this.audio.ensure())
  }

  _buildJoysticks() {
    if (!this.isTouch) return
    this.jl = new Joystick(this, 'left')
    this.jr = new Joystick(this, 'right')
  }

  /* ================= 暂停 / 手柄状态 ================= */

  _onPadConnection(connected) {
    this._toast(connected ? '手柄已连接' : '手柄已断开，可继续使用键鼠')
    this.onGamepadChanged?.(connected)
  }

  _onSceneResume() {
    this._pausing = false
    this._pauseLockUntil = performance.now() + 350
    this.mouseDown = false
    this.jl?._release?.()
    this.jr?._release?.()
    this.pad?.sync()
    this.pad?.tick()
  }

  _canPause() {
    return !this.dead
      && !this.finished
      && !this._pausing
      && performance.now() >= this._pauseLockUntil
      && !this.scene.isPaused()
  }

  _pauseGame() {
    if (!this._canPause()) return
    this._pausing = true
    this._pauseLockUntil = performance.now() + 400
    this.audio?.ensure?.()
    this.pad?.confirm()
    this.mouseDown = false
    this.jl?._release?.()
    this.jr?._release?.()
    this.scene.pause()
    this.scene.launch('Pause', {
      mode: this.scene.key,
      time: this.timeAlive,
      kills: this.kills,
      wave: this.wave ?? 1,
    })
  }

  /* ================= 玩家 ================= */

  _updatePlayer(dt) {
    const k = this.keys
    let vx = 0
    let vy = 0
    if (k.A.isDown || k.LEFT.isDown) vx -= 1
    if (k.D.isDown || k.RIGHT.isDown) vx += 1
    if (k.W.isDown || k.UP.isDown) vy -= 1
    if (k.S.isDown || k.DOWN.isDown) vy += 1
    if (this.jl?.active) {
      vx = this.jl.dirX
      vy = this.jl.dirY
    }
    if (this.pad?.moveActive) {
      vx = this.pad.moveX
      vy = this.pad.moveY
    }
    const len = Math.hypot(vx, vy)
    if (len > 1) {
      vx /= len
      vy /= len
    }
    const moving = len > 0.08
    const oilMul = this.onOil ? 0.55 : 1
    const boost = this.buffs.overdrive > 0 ? 1.15 : 1
    const speed = this.S.speed * oilMul * boost
    this.playerBody.setVelocity(vx * speed, vy * speed)
    this.playerBody.setDepth(DEPTH.ACTOR + this.playerBody.y)
    this.playerShadow.setPosition(this.playerBody.x, this.playerBody.y + 14)
    this.playerShadow.setDepth(this.playerBody.depth - 1)
    this.playerBarrel.setDepth(this.playerBody.depth + 1)
    if (moving) this.lastMoveAngle = Math.atan2(vy, vx)

    // 瞄准：手柄右摇杆 > 触摸右摇杆 > 鼠标 > 移动方向
    let aim = null
    const pr = this.input.activePointer
    if (this.pad?.aimActive) {
      aim = Math.atan2(this.pad.aimY, this.pad.aimX)
    } else if (this.jr?.active && this.jr.magnitude > 0.25) {
      aim = Math.atan2(this.jr.dirY, this.jr.dirX)
    } else if (!this.isTouch && this.pointerSeen) {
      aim = Phaser.Math.Angle.Between(this.playerBody.x, this.playerBody.y, pr.worldX, pr.worldY)
    } else if (moving) {
      aim = this.lastMoveAngle
    }
    if (aim !== null) this.aimAngle = aim
    this._pointBarrel(this.playerBarrel, this.playerBody.x, this.playerBody.y, this.aimAngle)

    const barrelKey = this.buffs.pierce > 0
      ? 'tankBlue_barrel3'
      : this.buffs.rapid > 0 || this.buffs.overdrive > 0
        ? 'tankBlue_barrel2'
        : 'tankBlue_barrel1'
    if (this.playerBarrel.texture.key !== barrelKey) this.playerBarrel.setTexture(barrelKey)

    const firing = !!this.pad?.fireHeld
      || (this.jr?.active
        ? this.jr.magnitude > 0.25
        : (this.mouseDown || k.SPACE.isDown))
    if (firing) this._fire(this.aimAngle)

    this._emitTracks(dt, moving)

    if (this.invincible > 0) {
      this.invincible -= dt
      this.playerBody.setAlpha(Math.sin(this.time.now / 55) > 0 ? 0.45 : 1)
      if (this.invincible <= 0) this.playerBody.setAlpha(1)
    }
  }

  _pointBarrel(barrel, x, y, angle) {
    barrel.rotation = angle + Math.PI / 2
    barrel.setPosition(x, y)
  }

  _fire(angle) {
    const now = this.time.now
    const rapid = this.buffs.rapid > 0 || this.buffs.overdrive > 0
    const rate = rapid ? this.S.fireRate * 0.5 : this.S.fireRate
    if (this.dead || now < this.nextFire) return
    this.nextFire = now + rate

    const pierce = this.buffs.pierce > 0
    const spreads = this.buffs.triple > 0 || this.buffs.overdrive > 0 ? [-0.24, 0, 0.24] : [0]
    const key = pierce ? 'bulletBlue3' : 'bulletBlue2'
    const px = this.playerBody.x + Math.cos(angle) * 28
    const py = this.playerBody.y + Math.sin(angle) * 28

    for (const a of spreads) {
      this._spawnBullet(this.pBullets, px, py, a + angle, key, 680, {
        kind: 'player', dmg: this.S.damage, pierce, scale: pierce ? 1.25 : 1,
      })
    }

    // 炮口火光（Kenney shot 系列）
    const flash = this.add
      .image(px, py, this.buffs.overdrive > 0 ? 'shotLarge' : 'shotOrange')
      .setDepth(DEPTH.FX)
      .setRotation(angle + Math.PI / 2)
      .setScale(this.buffs.overdrive > 0 ? 1.15 : 0.9)
      .setAlpha(0.95)
    this.tweens.add({ targets: flash, alpha: 0, scale: flash.scale * 1.25, duration: 70, onComplete: () => flash.destroy() })
    this.audio.shoot()
    this.pad?.rumble({ duration: 45, strong: 0.05, weak: 0.13, priority: 1 })
  }

  _emitTracks(dt, moving) {
    if (!moving) return
    this.trackTimer -= dt
    if (this.trackTimer > 0) return
    this.trackTimer = 0.14
    const a = this.lastMoveAngle
    const ox = Math.cos(a + Math.PI / 2) * 10
    const oy = Math.sin(a + Math.PI / 2) * 10
    const key = Math.random() < 0.5 ? 'tracksLarge' : 'tracksSmall'
    for (const s of [1, -1]) {
      const mark = addTreads(this, this.playerBody.x + ox * s, this.playerBody.y + oy * s, a, {
        key, alpha: 0.17, scale: 0.7,
      })
      this.trackMarks.push(mark)
      this.tweens.add({ targets: mark, alpha: 0, duration: 5200, onComplete: () => mark.destroy() })
    }
    while (this.trackMarks.length > 70) {
      const old = this.trackMarks.shift()
      if (old.active) old.destroy()
    }
  }

  /* ================= 子弹 ================= */

  _spawnBullet(group, x, y, angle, key, speed, opts = {}) {
    const b = group.get(x, y)
    if (!b) return null
    b.setTexture(key)
    b.enableBody(true, x, y, true, true)
    b.setDepth(DEPTH.BULLET)
    b.setScale(opts.scale ?? 1)
    b.setAlpha(1)
    b.setRotation(angle + Math.PI / 2)
    b.setData('bullet', true)
    b.setData('kind', opts.kind || 'enemy')
    b.setData('dmg', opts.dmg ?? 8)
    b.setData('pierce', !!opts.pierce)
    b.body.setAllowGravity(false)
    b.body.onWorldBounds = true
    b.body.checkWorldBounds = true
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)
    return b
  }

  _despawnBullet(b) {
    // 只允许回收真正的子弹，防止错误对象（例如玩家）被 disableBody
    if (!b || !b.active || !b.getData || !b.getData('bullet')) return
    b.disableBody(true, true)
  }

  _bulletHitObstacle(b) {
    if (!b.active) return
    if (b.getData('pierce')) return
    this._despawnBullet(b)
  }

  _onBulletHitEnemy(b, e) {
    if (!b.active || !e.active) return
    this._hitEnemy(e, b.getData('dmg') || this.S.damage)
    if (!b.getData('pierce')) this._despawnBullet(b)
  }

  _onEnemyBulletHitPlayer(b) {
    if (!b.active || this.dead) return
    const dmg = b.getData('dmg') || 8
    this._despawnBullet(b)
    this._damagePlayer(dmg)
  }

  _onEnemyTouchPlayer(e) {
    if (this.dead || !e || e === this.playerBody || !e.active) return
    if (!e.getData('dmg')) return
    this._damagePlayer(e.getData('dmg') * 0.85)
    const a = Phaser.Math.Angle.Between(e.x, e.y, this.playerBody.x, this.playerBody.y)
    e.setVelocity(Math.cos(a) * 260, Math.sin(a) * 260)
  }

  /* ================= 敌人 ================= */

  _spawnEnemy(typeKey, x, y, opts = {}) {
    const t = ENEMY_TYPES[typeKey]
    if (!t) return null
    const hp = Math.round(t.hp * (opts.hpMul ?? 1))
    // 靶车 dmg 为 0，不能被 Math.max 抬成 1
    const dmg = t.dmg <= 0 ? 0 : Math.max(1, Math.round(t.dmg * (opts.dmgMul ?? 1)))
    const speed = Math.max(0, t.speed * (opts.speedMul ?? 1) + (opts.speedAdd ?? 0))
    const scale = t.scale * (opts.scaleMul ?? 1)
    const fireRate = t.fire * (opts.fireMul ?? 1)

    const e = this.physics.add.image(x, y, t.body)
    e.setScale(scale)
    e.setDepth(DEPTH.ACTOR + y)
    e.body.setSize(e.width * 0.72, e.height * 0.72)
    e.setCollideWorldBounds(true)
    if (t.dummy) e.setImmovable(true)

    const shadow = this.add
      .ellipse(x, y + 12 * scale, 44 * scale, 20 * scale, 0x000000, 0.18)
      .setDepth(e.depth - 1)
    const barrel = this.add.image(x, y, t.barrel).setOrigin(0.5, 0.85).setScale(scale)
    barrel.setDepth(e.depth + 1)

    e.setData({
      kind: 'enemy',
      typeKey,
      hp,
      maxHp: hp,
      speed,
      dmg,
      range: t.range,
      fireRate,
      fireCd: fireRate / 1000 + Math.random() * 0.8,
      barrel,
      shadow,
      elite: opts.elite ?? t.elite,
      dummy: !!t.dummy,
      wander: 0,
      wanderAngle: 0,
      stuck: 0,
    })

    const barW = Math.round(46 * scale)
    const barH = 6
    const barY = y - e.displayHeight * 0.65 - 12
    const barBg = this.add.rectangle(x, barY, barW + 2, barH + 2, 0x000000, 0.6).setDepth(DEPTH.BAR)
    const barFg = this.add
      .rectangle(x - barW / 2, barY, barW, barH, 0x66dd77)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.BAR + 1)
    e.setData({ barBg, barFg, barW, barH })
    barBg.setAlpha(0)
    barFg.setAlpha(0)
    this.tweens.add({ targets: [barBg, barFg], alpha: 1, duration: 260 })

    e.once('destroy', () => {
      shadow.destroy()
      barrel.destroy()
      barBg.destroy()
      barFg.destroy()
      const marker = e.getData('marker')
      if (marker) marker.destroy()
      const label = e.getData('label')
      if (label) label.destroy()
    })

    this.enemies.add(e)
    e.setAlpha(0)
    barrel.setAlpha(0)
    this.tweens.add({ targets: [e, barrel], alpha: 1, duration: 300 })
    return e
  }

  _updateEnemies(dt) {
    const px = this.playerBody.x
    const py = this.playerBody.y
    for (const e of this.enemies.getChildren()) {
      if (!e.active || !e.body) continue
      const barrel = e.getData('barrel')
      const dist = Phaser.Math.Distance.Between(px, py, e.x, e.y)
      const angle = Phaser.Math.Angle.Between(e.x, e.y, px, py)
      e.setDepth(DEPTH.ACTOR + e.y)
      barrel.setDepth(e.depth + 1)
      const shadow = e.getData('shadow')
      if (shadow) {
        shadow.setPosition(e.x, e.y + 12 * e.scaleY)
        shadow.setDepth(e.depth - 1)
      }
      this._pointBarrel(barrel, e.x, e.y, angle)

      if (e.getData('dummy')) {
        e.setVelocity(0, 0)
        this._placeHpBar(e)
        continue
      }

      const speed = e.getData('speed')
      const range = e.getData('range')
      let cd = e.getData('fireCd') - dt
      let wander = e.getData('wander') - dt
      let wanderAngle = e.getData('wanderAngle')
      let stuck = e.getData('stuck')

      if (dist > range) {
        let vx = Math.cos(angle) * speed
        let vy = Math.sin(angle) * speed
        if (e.body.blocked.left || e.body.blocked.right || e.body.blocked.up || e.body.blocked.down) {
          stuck += dt
        } else {
          stuck = 0
        }
        if (stuck > 0.45 && wander <= 0) {
          wander = 0.6 + Math.random() * 0.6
          wanderAngle = angle + Phaser.Math.FloatBetween(-2.4, 2.4)
        }
        if (wander > 0) {
          vx = Math.cos(wanderAngle) * speed
          vy = Math.sin(wanderAngle) * speed
        }
        e.setVelocity(vx, vy)
      } else {
        e.setVelocity(0, 0)
        if (cd <= 0) {
          cd = e.getData('fireRate') / 1000 + Math.random() * 0.4
          this._enemyFire(e, angle)
        }
      }

      e.setData({ fireCd: cd, wander, stuck, wanderAngle })
      this._placeHpBar(e)
    }
  }

  _placeHpBar(e) {
    const barBg = e.getData('barBg')
    if (!barBg) return
    const barW = e.getData('barW')
    const barH = e.getData('barH')
    const yy = e.y - e.displayHeight * 0.65 - 12
    barBg.x = e.x
    barBg.y = yy
    const fg = e.getData('barFg')
    fg.x = e.x - barW / 2
    fg.y = yy
    const frac = Phaser.Math.Clamp(e.getData('hp') / e.getData('maxHp'), 0, 1)
    fg.scaleX = frac
    fg.setFillStyle(frac > 0.5 ? 0x66dd77 : frac > 0.25 ? 0xffcc44 : 0xff5544)
  }

  _enemyFire(e, angle) {
    const t = ENEMY_TYPES[e.getData('typeKey')]
    const spread = t.spread || 0
    const angles = spread ? [-spread, 0, spread] : [0]
    const bx = e.x + Math.cos(angle) * 26
    const by = e.y + Math.sin(angle) * 26
    const dmg = e.getData('dmg')
    for (const a of angles) {
      this._spawnBullet(this.eBullets, bx, by, angle + a, t.bullet, t.bulletSpeed, {
        kind: 'enemy', dmg, scale: e.getData('elite') ? 1.15 : 1,
      })
    }
    const flash = this.add
      .image(bx, by, e.getData('elite') ? 'shotRed' : 'shotThin')
      .setDepth(DEPTH.FX)
      .setRotation(angle + Math.PI / 2)
      .setScale(e.getData('elite') ? 1 : 0.8)
      .setAlpha(0.9)
    this.tweens.add({ targets: flash, alpha: 0, duration: 70, onComplete: () => flash.destroy() })

    if (!this._lastEnemyShot || this.time.now - this._lastEnemyShot > 100) {
      this._lastEnemyShot = this.time.now
      this.audio.enemyShoot()
    }
  }

  _hitEnemy(e, dmg) {
    if (!e.active) return
    const hp = e.getData('hp') - dmg
    e.setData('hp', hp)
    if (hp <= 0) {
      this._killEnemy(e)
      return
    }
    e.setTintFill(0xffffff)
    this.time.delayedCall(55, () => {
      if (e.active) e.clearTint()
    })
  }

  _killEnemy(e) {
    if (!e.active) return
    const elite = e.getData('elite')
    const dummy = e.getData('dummy')
    this.kills++
    this._explode(e.x, e.y, elite ? 1.7 : 1.1)
    this.audio.explosion()
    this.pad?.rumble({
      duration: elite ? 150 : 75,
      strong: elite ? 0.4 : 0.18,
      weak: elite ? 0.25 : 0.12,
      priority: 2,
    })
    if (elite) this.cameras.main.shake(190, 0.007)
    if (!dummy && Math.random() < this.getDropChance(e)) {
      this._spawnDrop(this._randomDropType(elite), e.x, e.y)
    }
    this.onEnemyKilled(e)
    e.destroy()
  }

  _updateBuffs(dt) {
    for (const key of ['triple', 'rapid', 'pierce', 'overdrive']) {
      if (this.buffs[key] > 0) this.buffs[key] = Math.max(0, this.buffs[key] - dt)
    }
  }

  /* ================= 掉落物 ================= */

  _randomDropType(elite = false) {
    let total = 0
    for (const d of DROP_TABLE) total += d.weight
    let roll = Math.random() * total
    for (const d of DROP_TABLE) {
      roll -= d.weight
      if (roll <= 0) return elite && Math.random() < 0.35 ? 'drop_overdrive' : d.type
    }
    return 'drop_heal'
  }

  _spawnDrop(type, x, y, { permanent = false } = {}) {
    const def = DROP_DEFS[type]
    if (!def) return null
    const ring = this.add
      .circle(x, y, 27, 0xffd54a, 0.12)
      .setStrokeStyle(2, 0xffd54a, 0.75)
      .setDepth(DEPTH.DROP - 2)
    const glowTween = this.tweens.add({
      targets: ring, scale: 1.22, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    })
    const label = this.add
      .text(x, y + 36, def.name, {
        fontFamily: FONT, fontSize: '12px', color: '#ffe9b0', stroke: '#000000', strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.DROP + 1)

    const d = this.drops.create(x, y, def.tex)
    d.setScale(1.5)
    d.setDepth(DEPTH.DROP)
    d.setData('type', type)
    d.setData('ring', ring)
    d.setData('label', label)
    d.setData('glowTween', glowTween)
    d.body.setAllowGravity(false)
    d.body.setSize(34, 40)
    d.once('destroy', () => {
      if (ring.active) ring.destroy()
      if (label.active) label.destroy()
    })

    if (!permanent) {
      this.time.delayedCall(12000, () => {
        if (d.active) {
          this._toast('补给已消失', '#9fb3c8')
          d.destroy()
        }
      })
    }
    return d
  }

  _pickup(d) {
    if (!d.active) return
    const type = d.getData('type')
    const def = DROP_DEFS[type]
    d.destroy()
    if (!def) return
    this.audio.pickup()
    if (type === 'drop_clear') {
      this.pad?.rumble({ duration: 240, strong: 0.55, weak: 0.35, priority: 3 })
    } else {
      this.pad?.rumble({ duration: 60, strong: 0.08, weak: 0.14, priority: 1 })
    }
    switch (type) {
      case 'drop_heal': {
        const amount = Math.round(this.S.maxHp * 0.35)
        this.S.hp = Math.min(this.S.maxHp, this.S.hp + amount)
        this._toast(`维修包 +${amount} 装甲`, COLOR.green)
        break
      }
      case 'drop_shield':
        this.buffs.shield = true
        this._toast('护盾已就绪 · 可挡一次伤害', COLOR.green)
        break
      case 'drop_triple':
        this.buffs.triple = 10
        this._toast('三连发 10 秒', COLOR.steel)
        break
      case 'drop_rapid':
        this.buffs.rapid = 10
        this._toast('速射 10 秒', COLOR.steel)
        break
      case 'drop_pierce':
        this.buffs.pierce = 8
        this._toast('穿甲弹 8 秒', COLOR.steel)
        break
      case 'drop_overdrive':
        this.buffs.overdrive = 8
        this._toast('超载：三连发 + 极速！', COLOR.amber)
        break
      case 'drop_clear': {
        let n = 0
        for (const e of this.enemies.getChildren()) {
          if (!e.active) continue
          this._explode(e.x, e.y, 1.25)
          e.destroy()
          n++
        }
        this.kills += n
        this.cameras.main.shake(220, 0.008)
        this.audio.explosion()
        this._toast('战术清场！', COLOR.amber)
        break
      }
      default:
        break
    }
    this.onPickup(type)
  }

  /* ================= 伤害 / 死亡 ================= */

  _damagePlayer(dmg) {
    if (this.dead || this.invincible > 0) return
    if (this.buffs.shield) {
      this.buffs.shield = false
      this.invincible = 0.35
      this.audio.hit()
      this.pad?.rumble({ duration: 110, strong: 0.3, weak: 0.2, priority: 3 })
      this._toast('护盾吸收了伤害', COLOR.green)
      return
    }
    const amount = Math.max(1, Math.round(dmg * (this.cfg.player.damageTakenMul ?? 1)))
    this.S.hp -= amount
    this.invincible = this.cfg.player.invuln ?? 0.85
    this.audio.hit()
    this.pad?.rumble({ duration: 180, strong: 0.55, weak: 0.35, priority: 3 })
    this.cameras.main.shake(130, 0.004)
    this.playerBody.setTintFill(0xff5555)
    this.time.delayedCall(80, () => {
      if (this.playerBody.active) this.playerBody.clearTint()
    })
    if (this.S.hp <= 0) {
      if (this.cfg.player.godMode) {
        this.S.hp = Math.max(1, Math.round(this.S.maxHp * 0.35))
        this.invincible = 1.2
        this._toast('训练护盾启动：正式关卡可没有这种待遇', COLOR.amber)
      } else {
        this.S.hp = 0
        this._die()
      }
    }
  }

  _die() {
    if (this.dead) return
    this.dead = true
    this.physics.pause()
    this.playerBody.setVelocity(0, 0)
    // 留一具烧毁的残骸，让结算背景仍然有战场感
    this.playerBody.setTexture('tank_dark')
    this.playerBody.setTint(0x707070)
    this.playerBarrel.setVisible(false)
    this.jl?.destroy()
    this.jr?.destroy()
    this.jl = null
    this.jr = null
    this.audio.gameover()
    this.pad?.rumble({ duration: 500, strong: 0.9, weak: 0.6, priority: 4 })
    this.cameras.main.shake(420, 0.012)
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 150, () => {
        this._explode(
          this.playerBody.x + Phaser.Math.Between(-28, 28),
          this.playerBody.y + Phaser.Math.Between(-28, 28),
          1.8,
        )
        this.cameras.main.shake(160, 0.01)
      })
    }
    this.time.delayedCall(1250, () => this.onPlayerDeath())
  }

  /* ================= 特效 / HUD ================= */

  _explode(x, y, scale = 1) {
    const boom = this.add.sprite(x, y, 'explosion1').setDepth(DEPTH.FX).setScale(scale)
    boom.play('explode')
    boom.once('animationcomplete', () => boom.destroy())
    const smoke = this.add
      .sprite(x, y, 'explosionSmoke1')
      .setDepth(DEPTH.FX - 1)
      .setScale(scale)
      .setAlpha(0.8)
    smoke.play('smoke')
    smoke.once('animationcomplete', () => smoke.destroy())
  }

  _toast(text, color = COLOR.amber) {
    if (!this.toastText) return
    this.toastText.setText(text).setColor(color).setAlpha(1)
    this.toastTween?.remove()
    this.toastTween = this.tweens.add({
      targets: this.toastText, alpha: 0, delay: 1500, duration: 550,
    })
  }

  _updateHudBase() {
    const ratio = Phaser.Math.Clamp(this.S.hp / this.S.maxHp, 0, 1)
    const color = ratio > 0.55 ? 0x66cc77 : ratio > 0.28 ? 0xeec344 : 0xee4433
    const hpText = `${Math.max(0, Math.ceil(this.S.hp))} / ${this.S.maxHp}`
    if (ratio !== this._hudRatio || color !== this._hudColor) {
      this._hudRatio = ratio
      this._hudColor = color
      const x = 24
      const y = 34
      const w = 236
      const h = 22
      const g = this.hpGfx
      g.clear()
      g.fillStyle(0x000000, 0.45)
      g.fillRoundedRect(x + 4, y + 5, w, h, 6)
      g.fillStyle(0x070c11, 0.85)
      g.fillRoundedRect(x, y, w, h, 6)
      g.fillStyle(color, 1)
      g.fillRoundedRect(x + 2, y + 2, Math.max(0, (w - 4) * ratio), h - 4, 4)
      g.lineStyle(1.5, 0xffffff, 0.35)
      g.strokeRoundedRect(x, y, w, h, 6)
      for (let i = 1; i < 4; i++) {
        g.lineStyle(1, 0x000000, 0.25)
        g.lineBetween(x + (w / 4) * i, y + 2, x + (w / 4) * i, y + h - 2)
      }
    }
    if (hpText !== this._hudHpText) {
      this._hudHpText = hpText
      this.hpText.setText(hpText)
    }

    for (const b of this.buffIcons) {
      const remain = b.id === 'shield' ? (this.buffs.shield ? 1 : 0) : this.buffs[b.id]
      const show = remain > 0
      b.bg.setVisible(show)
      b.icon.setVisible(show)
      b.bar.setVisible(show && b.id !== 'shield')
      if (!show) continue
      b.icon.setAlpha(b.id === 'shield' ? 1 : 0.65 + 0.35 * Math.sin(this.time.now / 110))
      if (b.id !== 'shield') {
        const frac = Phaser.Math.Clamp(remain / b.dur, 0, 1)
        b.bar.scaleX = frac
        b.bar.setFillStyle(frac > 0.3 ? 0xf0b429 : 0xff8844)
      }
    }
  }

  /* ================= 工具 ================= */

  /** 地图边缘找一个离玩家足够远、不卡进障碍的出生点 */
  _findSpawnPoint(minDist = 460) {
    const margin = 46
    let best = null
    for (let i = 0; i < 40; i++) {
      const edge = Phaser.Math.Between(0, 3)
      let x = 0
      let y = 0
      if (edge === 0) { x = Phaser.Math.Between(margin, this.mapW - margin); y = margin }
      else if (edge === 1) { x = Phaser.Math.Between(margin, this.mapW - margin); y = this.mapH - margin }
      else if (edge === 2) { x = margin; y = Phaser.Math.Between(margin, this.mapH - margin) }
      else { x = this.mapW - margin; y = Phaser.Math.Between(margin, this.mapH - margin) }
      best = { x, y }
      if (Phaser.Math.Distance.Between(this.playerBody.x, this.playerBody.y, x, y) < minDist) continue
      if (this._spawnBlocked(x, y)) continue
      return { x, y }
    }
    return best || { x: margin, y: margin }
  }

  _spawnBlocked(x, y) {
    const all = [...this.solids.getChildren(), ...this.covers.getChildren()]
    for (const o of all) {
      if (!o.active) continue
      const dx = o.x - x
      const dy = o.y - y
      if (dx * dx + dy * dy < 58 * 58) return true
    }
    return false
  }

  _formatTime(seconds) {
    const s = Math.max(0, seconds)
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    const tenth = Math.floor((s * 10) % 10)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenth}`
  }
}
