/**
 * WebAudio 合成音效，零素材依赖。
 * 首次用户交互时 ensure() 恢复 AudioContext。
 */
export default class GameAudio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.master = null
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5
    return this.muted
  }

  /** 方波音，频率从 f0 滑到 f1 */
  _tone(f0, f1, dur, type = 'square', vol = 0.15, delay = 0) {
    if (!this.ctx || this.muted) return
    const t = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /** 白噪声爆发（爆炸）；噪声 buffer 只生成一次，全部音源共享 */
  _noise(dur, vol = 0.35, lowpass = 500, delay = 0) {
    if (!this.ctx || this.muted) return
    const t = this.ctx.currentTime + delay
    if (!this._noiseBuf) {
      const len = Math.floor(this.ctx.sampleRate * 0.5)
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this._noiseBuf = buf
    }
    const src = this.ctx.createBufferSource()
    src.buffer = this._noiseBuf
    const filt = this.ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.value = lowpass
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(filt).connect(g).connect(this.master)
    src.start(t)
  }

  shoot() { this._tone(700, 160, 0.08, 'square', 0.08) }
  enemyShoot() { this._tone(320, 90, 0.1, 'sawtooth', 0.05) }
  explosion() { this._noise(0.35, 0.3, 600); this._tone(90, 30, 0.3, 'triangle', 0.2) }
  hit() { this._tone(180, 70, 0.15, 'sawtooth', 0.18); this._noise(0.12, 0.2, 1200) }
  pickup() { this._tone(660, 660, 0.08, 'sine', 0.15); this._tone(990, 990, 0.1, 'sine', 0.15, 0.08) }
  upgrade() { [523, 659, 784].forEach((f, i) => this._tone(f, f, 0.12, 'triangle', 0.15, i * 0.09)) }
  waveStart() { this._tone(440, 440, 0.1, 'square', 0.1); this._tone(660, 660, 0.12, 'square', 0.1, 0.1) }
  gameover() { [392, 311, 233, 155].forEach((f, i) => this._tone(f, f * 0.9, 0.25, 'triangle', 0.2, i * 0.18)) }
}
