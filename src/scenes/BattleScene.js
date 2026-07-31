import Phaser from 'phaser'
import Joystick from '../js/Joystick.js'
import GameAudio from '../js/Audio.js'

const MAP_W = 1280
const MAP_H = 896
const TILE = 64

// 敌人类型表（数值为基数，按波数缩放）
const ENEMY_TYPES = {
  sand:      { body: 'e_sand',      barrel: 'eb_sand',  hp: 40,  speed: 70,  dmg: 12, range: 250, fire: 2000, unlock: 1,  elite: false, scale: 1 },
  green:     { body: 'e_green',     barrel: 'eb_green', hp: 55,  speed: 80,  dmg: 13, range: 250, fire: 1800, unlock: 1,  elite: false, scale: 1 },
  blue:      { body: 'e_blue',      barrel: 'eb_blue',  hp: 75,  speed: 95,  dmg: 14, range: 260, fire: 1600, unlock: 2,  elite: false, scale: 1 },
  red:       { body: 'e_red',       barrel: 'eb_red',   hp: 100, speed: 105, dmg: 16, range: 270, fire: 1400, unlock: 3,  elite: false, scale: 1 },
  dark:      { body: 'e_dark',      barrel: 'eb_dark',  hp: 140, speed: 120, dmg: 18, range: 280, fire: 1200, unlock: 4,  elite: false, scale: 1 },
  darkLarge: { body: 'e_darkLarge', barrel: 'eb_dark',  hp: 220, speed: 95,  dmg: 22, range: 280, fire: 1300, unlock: 6,  elite: true,  scale: 1.1 },
  bigRed:    { body: 'e_bigRed',    barrel: 'eb_red',   hp: 380, speed: 80,  dmg: 28, range: 300, fire: 1500, unlock: 8,  elite: true,  scale: 1.15 },
  huge:      { body: 'e_huge',      barrel: 'eb_red',   hp: 600, speed: 60,  dmg: 35, range: 200, fire: 1800, unlock: 10, elite: true,  scale: 1.25 },
}

// 升级选项（升级时随机抽 3 个）
const UPGRADES = [
  { id: 'dmg',  name: '强化火力', desc: '伤害 +25%',            apply: (s) => (s.damage *= 1.25) },
  { id: 'rate', name: '快速装填', desc: '射速 +15%',            apply: (s) => (s.fireRate *= 0.85) },
  { id: 'spd',  name: '引擎升级', desc: '移速 +10%',            apply: (s) => (s.speed *= 1.1) },
  { id: 'hp',   name: '装甲强化', desc: '最大血量 +25 并回满',   apply: (s) => { s.maxHp += 25; s.hp = s.maxHp } },
  { id: 'heal', name: '战场维修', desc: '立即回复 50 血量',      apply: (s) => (s.hp = Math.min(s.maxHp, s.hp + 50)) },
]

// 玩家初始状态（GameOverScene 重开一局时复用同一份，避免两处漂移）
export const DEFAULT_STATE = {
  inited: true, wave: 1, kills: 0, score: 0,
  hp: 100, maxHp: 100, damage: 14, fireRate: 240, speed: 220,
}

// buff 定义：dur 为秒，0 = 持续到被消耗（护盾）
const BUFFS = {
  triple: { key: 'drop_triple', dur: 10 },
  rapid:  { key: 'drop_rapid',  dur: 10 },
  pierce: { key: 'drop_pierce', dur: 8 },
  shield: { key: 'drop_shield', dur: 0 },
}

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle')
  }

  init() {
    // 玩家状态：首次进入初始化，之后从 registry 恢复
    const reg = this.registry
    if (!reg.get('inited')) {
      reg.set({ ...DEFAULT_STATE, best: Number(localStorage.getItem('tankBest') || 0) })
    }
    this.S = {
      hp: reg.get('hp'), maxHp: reg.get('maxHp'),
      damage: reg.get('damage'), fireRate: reg.get('fireRate'),
      speed: reg.get('speed'),
    }
  }

  create() {
    if (!this.game.audio) this.game.audio = new GameAudio()
    this.audio = this.game.audio

    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H)
    // 物理世界边界必须与地图一致（默认是画布尺寸 1280×720，会把玩家 clamp 在地图中部）
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H)
    // Phaser 3.90 的 Pointer.pointerType 在部分环境为 undefined，不能用它区分设备
    this.isTouch = this.sys.game.device.input.touch
    this.buffs = { triple: 0, rapid: 0, pierce: 0, shield: false }
    this.invincible = 0
    this.nextFire = 0
    this.upgrading = false
    this.dead = false

    this._buildMap()
    this._buildPlayer()
    this._buildGroups()
    this._buildColliders()
    this._buildHud()
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,M')
    this._bindSceneInput()
    this._buildJoysticks()

    // 波次状态
    this.wave = this.registry.get('wave')
    this.waveState = 'idle' // idle -> spawning -> fighting
    this.waveTimer = 1.2
    this.spawnQueue = []
    this.spawnTimer = 0

    this.cameras.main.startFollow(this.playerBody, true, 0.12, 0.12)
    // 子弹出界即销毁
    this.physics.world.on('worldbounds', (body) => {
      const g = body.gameObject
      if (g && g.getData && (g.getData('kind') === 'player' || g.getData('kind') === 'enemy') && g.active) {
        g.destroy()
      }
    })
    this._waveBanner('第 ' + this.wave + ' 波', true)
  }

  /* ---------------- 构建 ---------------- */

  _buildMap() {
    // 草地铺底（两色交替）
    const cols = MAP_W / TILE
    const rows = MAP_H / TILE
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.add
          .image(x * TILE + TILE / 2, y * TILE + TILE / 2, (x + y) % 2 ? 'grass1' : 'grass2')
          .setOrigin(0.5)
      }
    }
    const cx = cols / 2
    const cy = rows / 2
    // 道路网：横纵贯穿全图的十字大道 + 四象限各一条 L 形支路
    // （grass 版素材只有 East/North 两个朝向，竖路统一用 road_north）
    const roadSet = new Set()
    const roadTile = (gx, gy, key) => {
      this.add.image(gx * TILE + TILE / 2, gy * TILE + TILE / 2, key).setOrigin(0.5)
      roadSet.add(gx + ',' + gy)
    }
    for (let x = 0; x < cols; x++) roadTile(x, cy, 'road_east')   // 横主路
    for (let y = 0; y < rows; y++) roadTile(cx, y, 'road_north')  // 竖主路
    roadTile(cx, cy, 'road_crossing')                             // 中央十字路口
    // 支路 = 主路分叉 → 3 格直路 → 转弯 → 2 格直路 → 土路收尾
    // 每条：[分叉x, 分叉y, 拐角, 拐角tile, 端头x, 端头y, 端头tile]
    const branches = [
      [6, 7, [6, 4, 'road_cornerLL'], [4, 4, 'road_transW']],
      [14, 7, [14, 4, 'road_cornerLR'], [16, 4, 'road_transE']],
      [4, 7, [4, 10, 'road_cornerUL'], [2, 10, 'road_transW']],
      [16, 7, [16, 10, 'road_cornerUR'], [18, 10, 'road_transE']],
    ]
    for (const [bx, by, [tx, ty, cornerKey], [ex, ey, endKey]] of branches) {
      const dy = Math.sign(ty - by) // 先沿竖主路方向走 3 格
      for (let i = 1; i <= 3; i++) roadTile(bx, by + dy * i, 'road_north')
      roadTile(tx, ty, cornerKey) // 转弯格
      const dx = Math.sign(ex - tx) // 再横向走 2 格
      for (let i = 1; i <= 2; i++) roadTile(tx + dx * i, ty, 'road_east')
      roadTile(ex, ey, endKey) // 端头土路过渡
    }

    // 障碍物：solid 挡人挡弹，cover（树）只挡子弹
    this.solids = this.physics.add.staticGroup()
    this.covers = this.physics.add.staticGroup()
    const solidPool = ['obs_crate', 'obs_crateMetal', 'obs_barrelRed', 'obs_barrelGreen', 'obs_barrelBlack', 'obs_sandbag', 'obs_barricade', 'obs_fence']
    const coverPool = ['obs_tree1', 'obs_tree2']
    const placed = []
    let attempts = 0
    while (placed.length < 46 && attempts < 4000) {
      attempts++
      const gx = Phaser.Math.Between(1, cols - 2) // 边缘留 1 格，避免贴边半身出界
      const gy = Phaser.Math.Between(1, rows - 2)
      // 避开中央出生区和道路
      if (Math.abs(gx - cx) <= 1 && Math.abs(gy - cy) <= 1) continue
      if (roadSet.has(gx + ',' + gy)) continue
      const x = gx * TILE + TILE / 2
      const y = gy * TILE + TILE / 2
      // 间距 ≥1.4 格：保证障碍物间有 ≥ 64px 通道，坦克不会被窄缝卡住
      if (placed.some((p) => { const dx = p.x - x, dy = p.y - y; return dx * dx + dy * dy < 90 * 90 })) continue
      placed.push({ x, y })
      const isCover = Math.random() < 0.42
      const key = Phaser.Utils.Array.GetRandom(isCover ? coverPool : solidPool)
      const s = this.add.image(x, y, key)
      s.setDepth(2)
      // 小物件随机旋转增加自然感
      if (!isCover && Math.random() < 0.5) s.rotation = Math.random() < 0.5 ? 0 : Math.PI / 2
      ;(isCover ? this.covers : this.solids).add(s)
      s.body.setSize(s.width * 0.8, s.height * 0.8)
    }

    // 油污减速区
    this.oils = this.physics.add.staticGroup()
    for (let i = 0; i < 3; i++) {
      const gx = Phaser.Math.Between(2, cols - 3)
      const gy = Phaser.Math.Between(2, rows - 3)
      if (roadSet.has(gx + ',' + gy)) continue
      if (Phaser.Math.Distance.Between(gx * TILE + TILE / 2, gy * TILE + TILE / 2, MAP_W / 2, MAP_H / 2) < 200) continue
      const x = gx * TILE + TILE / 2
      const y = gy * TILE + TILE / 2
      const o = this.add.image(x, y, 'oil').setDepth(1)
      this.oils.add(o)
    }
    this.onOil = false

    // 爆炸动画（frames 用对象形式，字符串数组不会解析贴图）
    if (!this.anims.exists('explode')) {
      const framesOf = (keys) => keys.map((k) => ({ key: k }))
      this.anims.create({ key: 'explode', frames: framesOf(['explosion1', 'explosion2', 'explosion3', 'explosion4', 'explosion5']), frameRate: 16, hideOnComplete: true })
      this.anims.create({ key: 'smoke', frames: framesOf(['smoke1', 'smoke2', 'smoke3', 'smoke4', 'smoke5']), frameRate: 8, hideOnComplete: true })
    }
  }

  _buildPlayer() {
    const cx = MAP_W / 2
    const cy = MAP_H / 2
    this.playerBody = this.physics.add.image(cx, cy, 'player_body').setDepth(10)
    this.playerBody.setCollideWorldBounds(true)
    // 贴图 38px，0.8 缩放 ≈ 30px 碰撞体；质量加大避免被敌人推着走
    this.playerBody.body.setSize(this.playerBody.width * 0.8, this.playerBody.height * 0.8)
    this.playerBody.body.mass = 100
    this.playerBarrel = this.add.image(cx, cy, 'player_barrel').setDepth(11)
    this.playerBarrel.setOrigin(0.5, 0.85)
    this.playerBody.setData('kind', 'player')
  }

  _buildGroups() {
    // 玩家 / 敌人子弹
    this.pBullets = this.physics.add.group()
    this.eBullets = this.physics.add.group()
    for (const g of [this.pBullets, this.eBullets]) {
      g.runChildUpdate = false
      g.maxSize = 90
    }
    // 敌人
    this.enemies = this.physics.add.group()
    // 道具
    this.drops = this.physics.add.group()
  }

  _buildColliders() {
    const solidCb = (b, solid) => {
      if (b.getData('kind') !== 'player' || this.buffs.pierce) return
      b.destroy()
    }
    this.physics.add.collider(this.playerBody, this.solids)
    this.physics.add.collider(this.enemies, this.solids)
    this.physics.add.overlap(this.pBullets, this.solids, solidCb)
    this.physics.add.overlap(this.pBullets, this.covers, solidCb)
    const eSolidCb = (b) => b.destroy()
    this.physics.add.overlap(this.eBullets, this.solids, eSolidCb)
    this.physics.add.overlap(this.eBullets, this.covers, eSolidCb)
    this.physics.add.overlap(this.pBullets, this.enemies, (b, e) => {
      this._hitEnemy(e, this.S.damage)
      // 普通弹命中即毁，穿透弹（b_dark2）穿过
      if (b.texture.key !== 'b_dark2') b.destroy()
    })
    this.physics.add.overlap(this.eBullets, this.playerBody, () => this._damagePlayer(1))
    // 敌人与玩家：collider 分离（避免重叠），碰撞时伤害 + 大力推开敌人（防敌人群堵路）
    this.physics.add.collider(this.enemies, this.playerBody, (e) => {
      if (this.dead || this.upgrading) return
      const d = e.getData('dmg')
      this._damagePlayer(d * 0.6)
      // 敌人 AI 每帧重设速度，260ms 后归零的 delayedCall 是无效开销
      const a = Phaser.Math.Angle.Between(e.x, e.y, this.playerBody.x, this.playerBody.y)
      e.setVelocity(Math.cos(a) * 260, Math.sin(a) * 260)
    })
    // 敌人之间也分离，避免堆叠成墙
    this.physics.add.collider(this.enemies, this.enemies)
    this.physics.add.overlap(this.playerBody, this.drops, (p, d) => this._pickup(d))
    this.physics.add.overlap(this.playerBody, this.oils, () => (this.onOil = true))
  }

  _buildHud() {
    const g = (this.hudGfx = this.add.graphics().setScrollFactor(0).setDepth(1500))
    this.hpBar = { w: 230, h: 18, x: 18, y: 18 }
    this.hudText = this.add
      .text(18, 52, '', { fontFamily: 'Arial', fontSize: '17px', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(1500)
    this.hudText.setShadow(1, 1, '#000000', 2)

    // buff 图标区（右上角），图标与定时逻辑共用 BUFFS 表
    this.buffIcons = []
    Object.entries(BUFFS).forEach(([id, d], i) => {
      const icon = this.add
        .image(this.scale.width - 30 - i * 52, 34, d.key)
        .setScrollFactor(0)
        .setDepth(1500)
        .setVisible(false)
      const bar = this.add
        .rectangle(this.scale.width - 30 - i * 52, 60, 36, 5, 0x66ff66)
        .setScrollFactor(0)
        .setDepth(1500)
        .setVisible(false)
      this.buffIcons.push({ id, icon, bar })
    })

    this.waveBanner = this.add
      .text(MAP_W / 2, MAP_H / 2 - 160, '', { fontFamily: 'Arial', fontSize: '64px', fontStyle: 'bold', color: '#ffd54a' })
      .setOrigin(0.5)
      .setAlpha(0)
    this.waveBanner.setShadow(4, 4, '#000000', 6)
    this.cameras.main.setDeadzone(200, 140)
    this.waveBanner.setScrollFactor(0)
  }

  // 场景级输入监听只注册一次（升级弹窗不重建，避免重复监听导致事件叠加）
  _bindSceneInput() {
    this.mouseDown = false
    this._downAt = 0
    this.input.on('pointerdown', (p) => {
      if (!this.isTouch) {
        this.mouseDown = true
        this._downAt = p.time
      }
      this.audio.ensure()
    })
    this.input.on('pointerup', (p) => {
      if (!this.isTouch) {
        // 快速点击（down/up 同帧处理）会让开火帧漏读 mouseDown，短按结束补一发
        if (p.time - this._downAt < 250 && this.cameras.main.worldView.contains(p.worldX, p.worldY)) {
          const a = Phaser.Math.Angle.Between(this.playerBody.x, this.playerBody.y, p.worldX, p.worldY)
          this._fire(a)
        }
        this.mouseDown = false
      }
    })
    this.input.keyboard.on('keydown-M', () => {
      const m = this.audio.toggleMute()
      this.hudText.setText(this.hudText.text + (m ? ' [静音]' : ''))
    })
  }

  // 虚拟摇杆（触摸）；升级弹窗会销毁旧摇杆，需重建
  _buildJoysticks() {
    this.jl = new Joystick(this, 'left')
    this.jr = new Joystick(this, 'right')
  }

  /* ---------------- 波次 ---------------- */

  _waveBanner(text, isWaveStart) {
    this.waveBanner.setText(text)
    this.waveBanner.setAlpha(1)
    if (isWaveStart) this.audio.waveStart()
    this.tweens.add({ targets: this.waveBanner, alpha: 0, delay: 1400, duration: 600 })
  }

  _startWave() {
    this.waveState = 'spawning'
    const count = Math.min(4 + this.wave * 2, 20)
    this.spawnQueue = []
    const pool = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k].unlock <= this.wave && !ENEMY_TYPES[k].elite)
    for (let i = 0; i < count; i++) {
      if (this.wave >= 8 && i === 0) this.spawnQueue.push('bigRed')
      else if (this.wave >= 10 && this.wave % 2 === 0 && i === 1) this.spawnQueue.push('huge')
      else this.spawnQueue.push(Phaser.Utils.Array.GetRandom(pool))
    }
    this.spawnTimer = 0
    this._waveBanner('第 ' + this.wave + ' 波', true)
  }

  _spawnOne(typeKey) {
    const t = ENEMY_TYPES[typeKey]
    const wave = this.wave
    const hp = Math.round(t.hp * (1 + (wave - 1) * 0.12))
    const speed = Math.min(t.speed + (wave - 1) * 2, 200)
    const dmg = t.dmg + Math.floor((wave - 1) / 2)
    // 边缘随机生成，距玩家足够远
    const px = this.playerBody.x
    const py = this.playerBody.y
    let x = 0
    let y = 0
    for (let i = 0; i < 20; i++) {
      const edge = Phaser.Math.Between(0, 3)
      if (edge === 0) { x = Phaser.Math.Between(40, MAP_W - 40); y = 40 }
      else if (edge === 1) { x = Phaser.Math.Between(40, MAP_W - 40); y = MAP_H - 40 }
      else if (edge === 2) { x = 40; y = Phaser.Math.Between(40, MAP_H - 40) }
      else { x = MAP_W - 40; y = Phaser.Math.Between(40, MAP_H - 40) }
      if (Phaser.Math.Distance.Between(px, py, x, y) > 380) break
    }
    const e = this.physics.add.image(x, y, t.body).setDepth(5)
    const barrel = this.add.image(x, y, t.barrel).setDepth(6)
    barrel.setOrigin(0.5, 0.85)
    barrel.setScale(t.scale)
    e.setScale(t.scale)
    e.setData({
      kind: 'enemy', typeKey, hp, maxHp: hp, speed, dmg, range: t.range,
      fireCd: t.fire / 1000 + Math.random() * 0.6,
      barrel, elite: t.elite, wander: 0, wanderAngle: 0, stuck: 0,
    })
    e.body.setSize(e.width * 0.72, e.height * 0.72)
    e.setCollideWorldBounds(true)
    // 头顶血条（背景 + 前景，随敌人销毁自动清理）
    const barW = Math.round(46 * t.scale)
    const barH = 6
    const barY = e.y - 40 * t.scale
    const barBg = this.add.rectangle(e.x, barY, barW + 2, barH + 2, 0x000000, 0.55).setDepth(7)
    const barFg = this.add
      .rectangle(e.x - barW / 2, barY, barW, barH, 0x66ff66)
      .setOrigin(0, 0.5)
      .setDepth(7)
    e.setData({ barBg, barFg })
    e.on('destroy', () => {
      barrel.destroy()
      barBg.destroy()
      barFg.destroy()
    })
    barBg.setAlpha(0)
    barFg.setAlpha(0)
    this.tweens.add({ targets: [barBg, barFg], alpha: 1, duration: 300 })
    this.enemies.add(e)
    // 出场动画：从地下弹出
    e.setAlpha(0)
    this.tweens.add({ targets: e, alpha: 1, duration: 300 })
    this.tweens.add({ targets: barrel, alpha: 1, duration: 300 })
    barrel.setAlpha(0)
  }

  /* ---------------- 战斗 ---------------- */

  // 从对象池取一发子弹并摆好（玩家/敌人共用）
  _spawnBullet(group, x, y, angle, key, speed, depth, kind) {
    const b = group.get(x, y)
    if (!b) return null
    b.setTexture(key)
    b.setDepth(depth)
    b.setData('kind', kind)
    b.setActive(true).setVisible(true)
    b.rotation = angle - Math.PI / 2
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)
    b.body.checkWorldBounds = true
    return b
  }

  // 炮管贴图初始朝上，Phaser 正旋转为顺时针 → 指向 θ 需 rotation = θ + π/2
  _pointBarrel(barrel, x, y, angle) {
    barrel.rotation = angle + Math.PI / 2
    barrel.setPosition(x, y)
  }

  _fire(dirAngle) {
    const now = this.time.now
    const rate = this.buffs.rapid > 0 ? this.S.fireRate * 0.5 : this.S.fireRate
    if (now < this.nextFire) return
    this.nextFire = now + rate
    const spreads = this.buffs.triple > 0 ? [-0.26, 0, 0.26] : [0]
    const key = this.buffs.pierce > 0 ? 'b_dark2' : 'b_blue1'
    const px = this.playerBody.x + Math.cos(dirAngle) * 22
    const py = this.playerBody.y + Math.sin(dirAngle) * 22
    const pierce = this.buffs.pierce > 0
    for (const a of spreads) {
      const b = this._spawnBullet(this.pBullets, px, py, dirAngle + a, key, 640, 8, 'player')
      if (b) b.setScale(pierce ? 1.3 : 1)
    }
    this.audio.shoot()
  }

  _enemyFire(e, angle) {
    const t = ENEMY_TYPES[e.getData('typeKey')]
    const key = t.unlock >= 4 ? 'b_dark2' : 'b_red1'
    const s = t.unlock >= 4 ? 330 : 240
    this._spawnBullet(this.eBullets, e.x + Math.cos(angle) * 24, e.y + Math.sin(angle) * 24, angle, key, s, 4, 'enemy')
    this.audio.enemyShoot()
  }

  _explode(x, y, scale = 1) {
    const s = this.add.sprite(x, y, 'explosion1').setDepth(20).setScale(scale)
    s.play('explode')
    s.on('animationcomplete', () => s.destroy())
    const m = this.add.sprite(x, y, 'smoke1').setDepth(19).setScale(scale).setAlpha(0.8)
    m.play('smoke')
    m.on('animationcomplete', () => m.destroy())
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
    this.time.delayedCall(60, () => {
      if (e.active) e.clearTint()
    })
  }

  _killEnemy(e) {
    if (!e.active) return
    const elite = e.getData('elite')
    this._explode(e.x, e.y, elite ? 1.6 : 1.1)
    this.audio.explosion()
    this.registry.set('kills', this.registry.get('kills') + 1)
    this.registry.set('score', this.registry.get('score') + 10 * this.wave)
    if (Math.random() < (elite ? 0.45 : 0.18)) this._drop(e.x, e.y)
    e.destroy()
  }

  _drop(x, y) {
    const keys = ['drop_triple', 'drop_rapid', 'drop_pierce', 'drop_heal', 'drop_shield', 'drop_clear']
    const d = this.drops.get(x, y)
    if (!d) return
    d.setTexture(Phaser.Utils.Array.GetRandom(keys))
    d.setDepth(9)
    d.setActive(true).setVisible(true)
    d.setData('type', d.texture.key)
    d.body.setSize(24, 24)
    this.tweens.add({ targets: d, angle: 180, duration: 600, repeat: -1 })
    // 8s 后消失
    this.time.delayedCall(8000, () => {
      if (d.active) d.destroy()
    })
  }

  _pickup(d) {
    const type = d.getData('type')
    d.destroy()
    this.audio.pickup()
    switch (type) {
      case 'drop_heal':
        this.S.hp = Math.min(this.S.maxHp, this.S.hp + 40)
        break
      case 'drop_shield':
        this.buffs.shield = true
        break
      case 'drop_triple':
        this.buffs.triple = BUFFS.triple.dur
        break
      case 'drop_rapid':
        this.buffs.rapid = BUFFS.rapid.dur
        break
      case 'drop_pierce':
        this.buffs.pierce = BUFFS.pierce.dur
        break
      case 'drop_clear': {
        this.enemies.getChildren().forEach((e) => {
          if (e.active) {
            this._explode(e.x, e.y, 1.3)
            e.destroy()
          }
        })
        this.audio.explosion()
        break
      }
    }
  }

  _damagePlayer(mult) {
    if (this.dead || this.upgrading) return
    if (this.invincible > 0) return
    if (this.buffs.shield) {
      this.buffs.shield = false
      this.audio.hit()
      return
    }
    this.S.hp -= Math.round(this.registry.get('wave') * 1.5 * mult + 6)
    this.invincible = 0.9
    this.audio.hit()
    this.playerBody.setTintFill(0xff4444)
    this.tweens.add({ targets: this.playerBody, tintFill: 0xff4444, duration: 60, onComplete: () => this.playerBody.clearTint() })
    if (this.S.hp <= 0) {
      this.S.hp = 0
      this._die()
    }
  }

  _die() {
    this.dead = true
    this.playerBody.setVisible(false)
    this.playerBarrel.setVisible(false)
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 160, () =>
        this._explode(this.playerBody.x + Phaser.Math.Between(-24, 24), this.playerBody.y + Phaser.Math.Between(-24, 24), 1.8)
      )
    }
    this.audio.gameover()
    const best = this.registry.get('best')
    const score = this.registry.get('score')
    if (score > best) {
      this.registry.set('best', score)
      localStorage.setItem('tankBest', String(score))
    }
    this.time.delayedCall(1600, () => this.scene.start('GameOver'))
  }

  /* ---------------- 升级 UI ---------------- */

  _openUpgrade() {
    this.upgrading = true
    this.jl.destroy()
    this.jr.destroy()
    this.audio.upgrade()

    const W = this.scale.width
    const H = this.scale.height
    this.upgradeUI = this.add.container(0, 0).setDepth(2000).setScrollFactor(0)
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65)
    this.upgradeUI.add(dim)
    const title = this.add
      .text(W / 2, H / 2 - 190, '第 ' + this.wave + ' 波完成！', { fontFamily: 'Arial', fontSize: '44px', fontStyle: 'bold', color: '#ffd54a' })
      .setOrigin(0.5)
    title.setShadow(3, 3, '#000', 4)
    this.upgradeUI.add(title)
    const sub = this.add
      .text(W / 2, H / 2 - 130, '击杀 ' + this.registry.get('kills') + ' · 分数 ' + this.registry.get('score'), { fontFamily: 'Arial', fontSize: '20px', color: '#cccccc' })
      .setOrigin(0.5)
    this.upgradeUI.add(sub)
    const hint = this.add
      .text(W / 2, H / 2 + 250, '选择一个强化 · 键位 1/2/3', { fontFamily: 'Arial', fontSize: '16px', color: '#999999' })
      .setOrigin(0.5)
    this.upgradeUI.add(hint)

    const options = Phaser.Utils.Array.Shuffle(UPGRADES.slice()).slice(0, 3)
    this.upgradeUI.setData('options', options)
    options.forEach((u, i) => {
      const cardW = 300
      const cardH = 150
      const x = W / 2 + (i - 1) * (cardW + 26)
      const y = H / 2 + 10
      const card = this.add.graphics()
      const drawCard = (fill, stroke) => {
        card.clear()
        card.fillStyle(fill, 0.95)
        card.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 14)
        card.lineStyle(3, stroke, 1)
        card.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 14)
      }
      drawCard(0x1c2a3a, 0x4a90d9)
      const container = this.add.container(x, y, [card])
      const idxText = this.add
        .text(0, -cardH / 2 + 16, (i + 1).toString(), { fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: '#4a90d9' })
        .setOrigin(0.5)
      const nameText = this.add
        .text(0, -cardH / 2 + 52, u.name, { fontFamily: 'Arial', fontSize: '26px', fontStyle: 'bold', color: '#ffffff' })
        .setOrigin(0.5)
      const descText = this.add
        .text(0, -cardH / 2 + 96, u.desc, { fontFamily: 'Arial', fontSize: '17px', color: '#aaddaa' })
        .setOrigin(0.5)
      container.add([idxText, nameText, descText])
      this.upgradeUI.add(container)

      // 大按钮热区（手机好点）
      container.setSize(cardW, cardH)
      container.setInteractive({ useHandCursor: true })
      container.on('pointerover', () => drawCard(0x24405c, 0x6ab0ff))
      container.on('pointerout', () => drawCard(0x1c2a3a, 0x4a90d9))
      container.on('pointerup', () => this._applyUpgrade(u))
    })

    // 键盘 1/2/3
    this.upgradeKeys = this.input.keyboard.addKeys('ONE,TWO,THREE')
    this.input.keyboard.once('keydown-ONE', () => this._applyUpgrade(options[0]))
    this.input.keyboard.once('keydown-TWO', () => this._applyUpgrade(options[1]))
    this.input.keyboard.once('keydown-THREE', () => this._applyUpgrade(options[2]))
  }

  _applyUpgrade(u) {
    if (!this.upgradeUI) return
    this.upgradeUI.destroy()
    this.upgradeUI = null
    this.upgrading = false
    u.apply(this.S)
    const reg = this.registry
    reg.set({ damage: this.S.damage, fireRate: this.S.fireRate, speed: this.S.speed, maxHp: this.S.maxHp, hp: this.S.hp })
    this.wave++
    reg.set('wave', this.wave)
    this.audio.upgrade()
    this._buildJoysticks()
    this.waveState = 'idle'
    this.waveTimer = 1.6
    this._waveBanner('第 ' + this.wave + ' 波', true)
  }

  /* ---------------- 每帧 ---------------- */

  _updatePlayer(dt) {
    const k = this.keys
    let vx = 0
    let vy = 0
    // 键盘
    if (k.A.isDown || k.LEFT.isDown) vx -= 1
    if (k.D.isDown || k.RIGHT.isDown) vx += 1
    if (k.W.isDown || k.UP.isDown) vy -= 1
    if (k.S.isDown || k.DOWN.isDown) vy += 1
    // 左摇杆
    if (this.jl.active) {
      vx = this.jl.dirX
      vy = this.jl.dirY
    }
    const len = Math.hypot(vx, vy)
    if (len > 1) { vx /= len; vy /= len }
    const speed = this.S.speed * (this.onOil ? 0.55 : 1)
    this.playerBody.setVelocity(vx * speed, vy * speed)
    const depth = 10 + (this.playerBody.y > MAP_H * 0.5 ? 1 : 0)
    if (this.playerBody.depth !== depth) this.playerBody.setDepth(depth)

    // 瞄准
    let aimAngle = null
    const pr = this.input.activePointer
    if (this.jr.active && this.jr.magnitude > 0.25) {
      aimAngle = Math.atan2(this.jr.dirY, this.jr.dirX)
    } else if (!this.isTouch && this.cameras.main.worldView.contains(pr.worldX, pr.worldY)) {
      aimAngle = Phaser.Math.Angle.Between(this.playerBody.x, this.playerBody.y, pr.worldX, pr.worldY)
    } else if (len > 0.05) {
      aimAngle = Math.atan2(vy, vx) // 无鼠标/无右摇杆时朝移动方向
    }
    if (aimAngle !== null) {
      this._pointBarrel(this.playerBarrel, this.playerBody.x, this.playerBody.y, aimAngle)
      // buff 生效时切换炮塔造型
      const barrelKey = this.buffs.pierce > 0 ? 'player_barrel2' : this.buffs.rapid > 0 ? 'player_barrel3' : 'player_barrel'
      if (this.playerBarrel.texture.key !== barrelKey) this.playerBarrel.setTexture(barrelKey)
      const firing = this.jr.active ? this.jr.magnitude > 0.25 : this.mouseDown || k.SPACE.isDown
      if (firing) this._fire(aimAngle)
    }

    // 受击无敌闪烁
    if (this.invincible > 0) {
      this.invincible -= dt
      this.playerBody.setAlpha(Math.sin(this.time.now / 60) > 0 ? 0.45 : 1)
      if (this.invincible <= 0) this.playerBody.setAlpha(1)
    }
  }

  _updateEnemies(dt) {
    const px = this.playerBody.x
    const py = this.playerBody.y
    this.enemies.getChildren().forEach((e) => {
      if (!e.active || this.dead) return
      const dist = Phaser.Math.Distance.Between(px, py, e.x, e.y)
      const angle = Phaser.Math.Angle.Between(e.x, e.y, px, py)
      const speed = e.getData('speed')
      const range = e.getData('range')
      // 每帧只读写一次 DataManager（getData/setData 是 map 查询 + 事件派发）
      let cd = e.getData('fireCd') - dt
      let wander = e.getData('wander') - dt
      let wanderAngle = e.getData('wanderAngle')
      let stuck = e.getData('stuck')

      if (dist > range) {
        // 追踪玩家，卡住时随机绕行
        let vx = Math.cos(angle) * speed
        let vy = Math.sin(angle) * speed
        if (e.body.blocked.left || e.body.blocked.right || e.body.blocked.up || e.body.blocked.down) {
          stuck += dt
        } else {
          stuck = 0
        }
        if (stuck > 0.5 && wander <= 0) {
          wander = 0.7 + Math.random() * 0.6
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
          cd = ENEMY_TYPES[e.getData('typeKey')].fire / 1000 + Math.random() * 0.5
          this._enemyFire(e, angle)
        }
      }
      e.setData({ fireCd: cd, wander, stuck, wanderAngle })
      // 炮塔始终指向玩家
      this._pointBarrel(e.getData('barrel'), e.x, e.y, angle)
      // 血条跟随 + 按剩余血量变色
      const barBg = e.getData('barBg')
      if (barBg) {
        const yy = e.y - 40 * e.scale
        barBg.x = e.x
        barBg.y = yy
        const fg = e.getData('barFg')
        fg.x = e.x - fg.width / 2
        fg.y = yy
        const frac = Phaser.Math.Clamp(e.getData('hp') / e.getData('maxHp'), 0, 1)
        fg.scaleX = frac
        fg.setFillStyle(frac > 0.5 ? 0x66ff66 : frac > 0.25 ? 0xffdd44 : 0xff5533)
      }
    })
  }

  _updateWave(dt) {
    if (this.upgrading || this.dead) return
    if (this.waveState === 'idle') {
      this.waveTimer -= dt
      if (this.waveTimer <= 0) this._startWave()
    } else if (this.waveState === 'spawning') {
      if (this.spawnQueue.length > 0 && this.enemies.countActive(true) < 16) {
        this.spawnTimer -= dt
        if (this.spawnTimer <= 0) {
          this.spawnTimer = 0.9
          this._spawnOne(this.spawnQueue.shift())
        }
      }
      if (this.spawnQueue.length === 0) this.waveState = 'fighting'
    } else if (this.waveState === 'fighting' && this.enemies.countActive(true) === 0) {
      this.waveState = 'cleared'
      this.time.delayedCall(900, () => this._openUpgrade())
    }
  }

  _updateBuffs(dt) {
    for (const k of ['triple', 'rapid', 'pierce']) {
      if (this.buffs[k] > 0) this.buffs[k] = Math.max(0, this.buffs[k] - dt)
    }
  }

  _updateHud() {
    const { x, y, w, h } = this.hpBar
    const ratio = Phaser.Math.Clamp(this.S.hp / this.S.maxHp, 0, 1)
    const color = ratio > 0.55 ? 0x66cc66 : ratio > 0.28 ? 0xeecc33 : 0xee4444
    // 血条只在数值变化时重绘
    if (ratio !== this._hudRatio || color !== this._hudColor) {
      this._hudRatio = ratio
      this._hudColor = color
      const g = this.hudGfx
      g.clear()
      g.fillStyle(0x000000, 0.55)
      g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 6)
      g.fillStyle(color, 1)
      g.fillRoundedRect(x, y, w * ratio, h, 4)
      g.lineStyle(2, 0xffffff, 0.8)
      g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 6)
    }

    const text = `波次 ${this.wave}   击杀 ${this.registry.get('kills')}   分数 ${this.registry.get('score')}   最佳 ${this.registry.get('best')}`
    if (text !== this._hudTextStr) {
      this._hudTextStr = text
      this.hudText.setText(text)
    }

    // buff 图标
    for (const b of this.buffIcons) {
      let remain = 0
      if (b.id === 'shield') remain = this.buffs.shield ? 1 : 0
      else remain = this.buffs[b.id]
      const show = remain > 0
      b.icon.setVisible(show)
      b.bar.setVisible(show && b.id !== 'shield')
      if (show) {
        b.icon.setAlpha(b.id === 'shield' ? 1 : 0.5 + 0.5 * Math.sin(this.time.now / 120))
        if (b.id !== 'shield') {
          const frac = Phaser.Math.Clamp(remain / BUFFS[b.id].dur, 0, 1)
          b.bar.scaleX = frac
          b.bar.setFillStyle(frac > 0.3 ? 0x66ff66 : 0xff8844)
        }
      }
    }
  }

  update(time, delta) {
    // 兜底：血条归零但死亡流程未触发的任何情况下强制判死
    if (!this.dead && this.S.hp <= 0) this._die()
    if (this.dead) return
    const dt = delta / 1000
    this.onOil = false
    this._updateBuffs(dt)
    this._updateWave(dt)
    this._updatePlayer(dt)
    this._updateEnemies(dt)
    this._updateHud()
  }
}
