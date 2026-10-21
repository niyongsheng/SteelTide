/**
 * 浏览器全屏封装。
 * 全屏对象是整个页面（documentElement），这样画布和页面背景一起铺满屏幕；
 * Phaser 的 Scale.FIT 会跟随 window resize 自动重新适配。
 * 兼容 Safari 的 webkit 前缀；iOS 等不支持元素全屏的环境会被识别出来。
 */

const EVENT_NAMES = ['fullscreenchange', 'webkitfullscreenchange']

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement)
}

export function isFullscreenSupported() {
  const root = document.documentElement
  if (!root) return false
  const request = root.requestFullscreen || root.webkitRequestFullscreen
  if (typeof request !== 'function') return false
  const enabled = 'fullscreenEnabled' in document
    ? document.fullscreenEnabled
    : document.webkitFullscreenEnabled
  return enabled !== false
}

export async function enterFullscreen() {
  if (isFullscreen()) return
  const root = document.documentElement
  const request = root.requestFullscreen || root.webkitRequestFullscreen
  if (typeof request !== 'function') throw new Error('Fullscreen API unavailable')
  await request.call(root)
}

export function exitFullscreen() {
  if (!isFullscreen()) return
  const exit = document.exitFullscreen || document.webkitExitFullscreen
  if (typeof exit === 'function') exit.call(document)
}

export async function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen()
  else await enterFullscreen()
}

/** 订阅全屏状态变化，返回取消订阅的函数 */
export function onFullscreenChange(callback) {
  const handler = () => callback(isFullscreen())
  for (const name of EVENT_NAMES) document.addEventListener(name, handler)
  return () => {
    for (const name of EVENT_NAMES) document.removeEventListener(name, handler)
  }
}
