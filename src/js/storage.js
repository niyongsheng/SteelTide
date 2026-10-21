const BEST_KEY = 'steelTide.bestTime'
const DONE_KEY = 'steelTide.tutorialDone'

// 隐私模式下 localStorage 可能抛错，用内存值兜底，保证当前会话内进度正常
let memoryBest = 0
let memoryDone = false

function safeGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value) } catch { /* 隐私模式忽略 */ }
}

/** 历史最佳生存时间（秒） */
export function getBestTime() {
  const stored = Number(safeGet(BEST_KEY) || 0) || 0
  if (stored > memoryBest) memoryBest = stored
  return memoryBest
}

export function saveBestTime(seconds) {
  memoryBest = Math.max(memoryBest, seconds)
  safeSet(BEST_KEY, String(seconds))
}

export function isTutorialDone() {
  return memoryDone || safeGet(DONE_KEY) === '1'
}

export function markTutorialDone() {
  memoryDone = true
  safeSet(DONE_KEY, '1')
}
