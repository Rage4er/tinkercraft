// src/platform/index.ts — Переключение платформ по VITE_PLATFORM
import type { IPlatform } from './types'

let _platform: IPlatform | null = null

export function getPlatform(): IPlatform | null {
  return _platform
}

export async function initPlatform(): Promise<boolean> {
  if (_platform) return true

  // Определяем платформу
  const platformType = import.meta.env.VITE_PLATFORM || 'clean'

  if (platformType === 'yandex') {
    const { platform: yandex } = await import('./yandex')
    _platform = yandex
    return await _platform.init()
  }

  // Clean-версия — stub
  const { platform: clean } = await import('./clean')
  _platform = clean
  return false
}
