/**
 * 战绩截图：Phaser 画面快照 → 拼接品牌页脚 → 原生分享 / 剪贴板 / 下载。
 * 分享失败时都可退回下载，不依赖任何第三方库。
 */

/** 等待 Phaser 渲染一帧并读取画布（WebGL / Canvas 都走 renderer.snapshot） */
export function snapshotGame(game) {
  return new Promise((resolve, reject) => {
    if (!game?.renderer?.snapshot) {
      reject(new Error('renderer.snapshot unavailable'))
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('snapshot timeout'))
    }, 2500)

    try {
      game.renderer.snapshot((image) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (image) resolve(image)
        else reject(new Error('empty snapshot'))
      })
    } catch (err) {
      settled = true
      clearTimeout(timer)
      reject(err)
    }
  })
}

/** 快照失败时的兜底：读取 canvas（renderer 需 preserveDrawingBuffer） */
function canvasFallback(game) {
  return new Promise((resolve, reject) => {
    try {
      const data = game.canvas.toDataURL('image/png')
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('canvas decode failed'))
      img.src = data
    } catch (err) {
      reject(err)
    }
  })
}

function loadImage(source) {
  if (typeof source === 'string') {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('image load failed'))
      img.src = source
    })
  }
  return Promise.resolve(source)
}

function drawShareCard(image, info) {
  const footer = 62
  const w = image.width || image.naturalWidth
  const h = image.height || image.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h + footer
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, w, h)

  // 页脚
  ctx.fillStyle = '#0b0f14'
  ctx.fillRect(0, h, w, footer)
  ctx.fillStyle = '#f0b429'
  ctx.fillRect(0, h, w, 3)

  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f0b429'
  ctx.font = `24px ${'"Steel Tide Pixel", "PingFang SC", "Microsoft YaHei", sans-serif'}`
  ctx.fillText('STEEL TIDE · 钢铁潮汐', 30, h + footer / 2 + 2)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#c9d4df'
  ctx.font = `400 18px ${'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'}`
  ctx.fillText(info.footer, w - 30, h + footer / 2 + 2)
  return canvas
}

/** 生成分享用 PNG（游戏画面 + 品牌页脚） */
export async function buildShareImage(game, info) {
  let image
  try {
    image = await snapshotGame(game)
  } catch {
    image = await canvasFallback(game)
  }
  image = await loadImage(image)
  const canvas = drawShareCard(image, info)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('toBlob failed')
  return blob
}

/**
 * 分享图片。返回 'shared' | 'copied' | 'downloaded' | 'cancelled' | 'failed'
 */
export async function shareImage(blob, { title, text, filename = 'steel-tide.png' }) {
  const file = typeof File !== 'undefined'
    ? new File([blob], filename, { type: 'image/png' })
    : null

  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // 其他错误继续走兜底方案
    }
  }

  try {
    if (window.isSecureContext && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return 'copied'
    }
  } catch {
    // 剪贴板不可用时继续下载
  }

  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
