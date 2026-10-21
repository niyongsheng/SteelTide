import Phaser from 'phaser'
import { buildShareImage, shareImage } from '../js/Share.js'
import GamepadInput from '../js/GamepadInput.js'
import { addScreenChrome } from '../js/screenChrome.js'
import { FONT, PIXEL_FONT, COLOR, drawPanel, formatTime, makeButton, FocusList } from '../js/ui.js'

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result')
  }

  init(data) {
    this.result = data || { mode: 'survival', time: 0, kills: 0, wave: 1, best: 0, isRecord: false }
  }

  create() {
    const W = this.scale.width
    const H = this.scale.height
    this.leaving = false
    const survival = this.result.mode !== 'tutorial'
    const accent = survival ? 0xff6b5b : 0xf0b429
    const accentText = survival ? COLOR.red : COLOR.amber

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)')
    this.cameras.main.fadeIn(220, 3, 5, 8)

    // 暗幕
    this.add.rectangle(W / 2, H / 2, W, H, 0x04070a, 0.7)
    addScreenChrome(this, { x: W - 28, y: 26 })

    const cardW = 780
    const cardH = 500
    const cx = W / 2
    const cy = H / 2 - 8
    const top = cy - cardH / 2

    drawPanel(this, cx, cy, cardW, cardH, {
      fill: 0x0b1219, alpha: 0.97, stroke: accent, strokeAlpha: 0.85, radius: 20, accent: true,
    })

    // 标题区
    this.add.text(cx, top + 30, 'MISSION REPORT  ·  战 报', {
      fontFamily: FONT, fontSize: '13px', color: '#8fa4b8', resolution: 2, letterSpacing: 3,
    }).setOrigin(0.5)

    const title = survival ? '生存结束' : '训练完成'
    this.add.text(cx, top + 78, title, {
      fontFamily: PIXEL_FONT, fontSize: '48px', color: accentText,
      stroke: '#000000', strokeThickness: 5, resolution: 2,
    }).setOrigin(0.5)

    if (survival) this._buildSurvivalBody(cx, top)
    else this._buildTutorialBody(cx, top)

    // 按钮
    const btnY = top + 400
    const defs = survival
      ? [
          { key: 'share', label: '分享截图', sub: '战绩海报', variant: 'gold', w: 208 },
          { key: 'retry', label: '再来一次', variant: 'primary', w: 208 },
          { key: 'menu', label: '返回主菜单', variant: 'ghost', w: 208 },
        ]
      : [
          { key: 'next', label: '进入第二关', sub: '生存极限', variant: 'primary', w: 208 },
          { key: 'retry', label: '重练一次', variant: 'secondary', w: 208 },
          { key: 'menu', label: '返回主菜单', variant: 'ghost', w: 208 },
        ]
    const gap = 18
    const buttonW = defs[0].w
    const bx = (i) => cx + (i - (defs.length - 1) / 2) * (buttonW + gap)
    this.resultButtons = defs.map((def, i) => {
      const button = makeButton(this, {
        x: bx(i), y: btnY, w: def.w, h: 62, label: def.label, sub: def.sub,
        variant: def.variant, fontSize: def.fontSize,
        onHover: () => this.focusList?.set(i),
        onClick: () => this._activate(def.key),
      })
      return { button, action: () => this._activate(def.key) }
    })
    this.focusList = new FocusList(this, this.resultButtons, { index: survival ? 1 : 0 })

    this.add.text(cx, top + 462, survival
      ? '截图包含最终画面与战绩页脚，可直接分享给好友'
      : '进入下一关后计时立即开始', {
      fontFamily: FONT, fontSize: '12px', color: '#6f7f8f', resolution: 2,
    }).setOrigin(0.5)

    this.add.text(cx, H - 26, 'STEEL TIDE · 钢铁潮汐    |    素材 Kenney (CC0) · 字体 Fusion Pixel (OFL) · Phaser 3', {
      fontFamily: FONT, fontSize: '12px', color: '#566472', resolution: 2,
    }).setOrigin(0.5)

    this.toastText = this.add
      .text(cx, H - 62, '', {
        fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: COLOR.green,
        stroke: '#000000', strokeThickness: 3, resolution: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0)

    this.padHint = this.add.text(cx, top + 484, '', {
      fontFamily: FONT, fontSize: '12px', color: '#8fa4b8', resolution: 2,
    }).setOrigin(0.5).setVisible(false)

    this.shotBlob = null
    this.shotPromise = null
    this.sharing = false
    // 仅第二关生存结算提供分享截图
    this.shareInfo = survival
      ? { footer: `生存 ${formatTime(this.result.time)} · 击杀 ${this.result.kills} · 第 ${this.result.wave} 波` }
      : null
    if (survival) {
      // 预先截图，保证原生分享仍在用户手势的激活窗口内
      this.time.delayedCall(500, () => this._prepareScreenshot())
    }

    this.input.keyboard.on('keydown-R', () => this._retry())
    this.input.keyboard.on('keydown-ENTER', (ev) => {
      if (!ev.repeat) this._activateFocused()
    })
    this.input.keyboard.on('keydown-ESC', (ev) => {
      if (!ev.repeat) this._menu()
    })
    this.input.keyboard.on('keydown-LEFT', (ev) => {
      if (!ev.repeat) this.focusList?.move(-1)
    })
    this.input.keyboard.on('keydown-RIGHT', (ev) => {
      if (!ev.repeat) this.focusList?.move(1)
    })
    this.input.keyboard.on('keydown-UP', (ev) => {
      if (!ev.repeat) this.focusList?.move(-1)
    })
    this.input.keyboard.on('keydown-DOWN', (ev) => {
      if (!ev.repeat) this.focusList?.move(1)
    })
    this.input.keyboard.on('keydown', () => this.game.audio?.ensure?.())

    this.pad = new GamepadInput(this, {
      onConnect: () => this._updatePadHint(),
      onDisconnect: () => this._updatePadHint(),
      onActivity: () => this.game.audio?.ensure?.(),
    })
    this.pad.sync()
    this._updatePadHint()
  }

  update() {
    if (this.leaving || !this.pad) return
    const nav = this.pad.nav
    if (nav) {
      this.focusList?.move(nav)
      this.pad.tick()
    }
    if (this.pad.justPressed('a') || this.pad.justPressed('start')) {
      this.pad.confirm()
      this._activateFocused()
    } else if (this.pad.justPressed('b')) {
      this.pad.tick()
      this._menu()
    }
  }

  _activateFocused() {
    if (this.leaving) return
    this.game.audio?.ensure?.()
    this.focusList?.activate()
  }

  _activate(action) {
    if (this.leaving) return
    this.game.audio?.ensure?.()
    if (action === 'share') this._onShare()
    else if (action === 'retry') this._retry()
    else if (action === 'next') this._nextLevel()
    else if (action === 'menu') this._menu()
  }

  _updatePadHint() {
    if (!this.padHint) return
    const connected = !!this.pad?.connected
    this.padHint.setVisible(connected)
    if (connected) this.padHint.setText('手柄  十字键/左摇杆 选择 · A 确认 · B 返回')
  }

  /* ---------------- 内容 ---------------- */

  _buildSurvivalBody(cx, top) {
    const r = this.result
    this.add.text(cx, top + 128, '生 存 时 间', {
      fontFamily: FONT, fontSize: '14px', color: '#8fa4b8', resolution: 2,
    }).setOrigin(0.5)
    const timeText = this.add.text(cx, top + 172, formatTime(r.time), {
      fontFamily: PIXEL_FONT, fontSize: '60px', color: COLOR.amber, resolution: 2,
    }).setOrigin(0.5)
    timeText.setShadow(0, 4, '#000000', 8)

    const line = this.add.graphics()
    line.lineStyle(1, 0x3b4a59, 0.8)
    line.lineBetween(cx - 300, top + 232, cx + 300, top + 232)

    const columns = [
      { label: '击 杀', value: String(r.kills) },
      { label: '抵达波次', value: String(r.wave) },
      { label: '历史最佳', value: r.best > 0 ? formatTime(r.best) : '—' },
    ]
    columns.forEach((col, i) => {
      const x = cx + (i - 1) * 220
      this.add.text(x, top + 254, col.label, {
        fontFamily: FONT, fontSize: '13px', color: '#8fa4b8', resolution: 2,
      }).setOrigin(0.5)
      this.add.text(x, top + 286, col.value, {
        fontFamily: FONT, fontSize: '28px', fontStyle: 'bold',
        color: i === 2 ? '#ffd98a' : '#ffffff', resolution: 2,
      }).setOrigin(0.5)
    })

    if (r.isRecord) {
      const badge = this.add.container(cx + 286, top + 78)
      const g = this.add.graphics()
      g.fillStyle(0xf0b429, 0.16)
      g.fillRoundedRect(-74, -22, 148, 44, 8)
      g.lineStyle(1.5, 0xf0b429, 0.85)
      g.strokeRoundedRect(-74, -22, 148, 44, 8)
      const t = this.add.text(0, 0, '★ 新纪录', {
        fontFamily: PIXEL_FONT, fontSize: '24px', color: '#ffe08a', resolution: 2,
      }).setOrigin(0.5)
      badge.add([g, t])
      badge.setRotation(0.035)
      this.tweens.add({ targets: badge, scale: 1.07, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    }
  }

  _buildTutorialBody(cx, top) {
    const r = this.result
    this.add.text(cx, top + 128, '基 本 操 作 已 掌 握', {
      fontFamily: FONT, fontSize: '16px', color: '#9fb3c8', resolution: 2,
    }).setOrigin(0.5)

    const line = this.add.graphics()
    line.lineStyle(1, 0x3b4a59, 0.8)
    line.lineBetween(cx - 280, top + 154, cx + 280, top + 154)

    const columns = [
      { label: '训练用时', value: formatTime(r.time) },
      { label: '击毁单位', value: String(r.kills) },
    ]
    columns.forEach((col, i) => {
      const x = cx + (i - 0.5) * 260
      this.add.text(x, top + 182, col.label, {
        fontFamily: FONT, fontSize: '13px', color: '#8fa4b8', resolution: 2,
      }).setOrigin(0.5)
      this.add.text(x, top + 216, col.value, {
        fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffffff', resolution: 2,
      }).setOrigin(0.5)
    })

    // 下一关简报
    const briefBg = this.add.graphics()
    briefBg.fillStyle(0x151f29, 0.9)
    briefBg.fillRoundedRect(cx - 300, top + 248, 600, 108, 12)
    briefBg.lineStyle(1, 0xff6b5b, 0.5)
    briefBg.strokeRoundedRect(cx - 300, top + 248, 600, 108, 12)
    this.add.text(cx - 278, top + 262, '下一关 · 生存极限', {
      fontFamily: PIXEL_FONT, fontSize: '24px', color: COLOR.red, resolution: 2,
    })
    this.add.text(cx - 278, top + 292, '敌潮从四面八方涌来，强度随时间持续攀升。\n没有升级面板，生存时间就是你的最终得分。', {
      fontFamily: FONT, fontSize: '14px', color: '#c6d1dc', lineSpacing: 7, resolution: 2,
    })
  }

  /* ---------------- 截图分享 ---------------- */

  _prepareScreenshot() {
    if (!this.shareInfo) return Promise.resolve(null)
    if (this.shotBlob) return Promise.resolve(this.shotBlob)
    if (this.shotPromise) return this.shotPromise
    this.shotPromise = buildShareImage(this.game, this.shareInfo)
      .then((blob) => {
        this.shotBlob = blob
        return blob
      })
      .catch((err) => {
        console.warn('[Steel Tide] 截图生成失败:', err)
        this.shotPromise = null
        return null
      })
    return this.shotPromise
  }

  async _onShare() {
    if (!this.shareInfo || this.sharing) return
    this.sharing = true
    this._toast('正在准备战绩截图…', '#c6d1dc')
    try {
      const blob = this.shotBlob || await this._prepareScreenshot()
      if (!blob) {
        this._toast('截图生成失败，请直接截屏保存', COLOR.red)
        return
      }
      const survival = this.result.mode !== 'tutorial'
      const res = await shareImage(blob, {
        title: survival ? 'Steel Tide · 生存战报' : 'Steel Tide · 新兵训练完成',
        text: survival
          ? `我在《Steel Tide 钢铁潮汐》生存挑战中坚持了 ${formatTime(this.result.time)}，击杀 ${this.result.kills} 辆敌军坦克！`
          : `我完成了《Steel Tide 钢铁潮汐》的新兵训练，用时 ${formatTime(this.result.time)}！`,
        filename: `steel-tide-${survival ? 'survival' : 'training'}-${Date.now()}.png`,
      })
      const messages = {
        shared: '已打开系统分享',
        copied: '截图已复制到剪贴板，可直接粘贴分享',
        downloaded: '截图已保存到下载目录',
        cancelled: '已取消分享',
        failed: '分享失败，请直接截屏保存',
      }
      this._toast(messages[res] || '完成', res === 'failed' ? COLOR.red : COLOR.green)
    } catch (err) {
      console.warn('[Steel Tide] 分享失败:', err)
      this._toast('分享不可用，请直接截屏保存', COLOR.red)
    } finally {
      this.sharing = false
    }
  }

  _toast(text, color = COLOR.green) {
    if (!this.toastText?.active) return
    this.toastText.setText(text).setColor(color).setAlpha(1)
    this.tweens.killTweensOf(this.toastText)
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 2200, duration: 500 })
  }

  /* ---------------- 场景切换 ---------------- */

  _leave(target) {
    if (this.leaving) return
    this.leaving = true
    this.scene.stop('Tutorial')
    this.scene.stop('Survival')
    this.scene.start(target)
  }

  _retry() {
    this._leave(this.result.mode === 'tutorial' ? 'Tutorial' : 'Survival')
  }

  _nextLevel() {
    this._leave('Survival')
  }

  _menu() {
    this._leave('Menu')
  }
}
