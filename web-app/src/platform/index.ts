// src/platform/index.ts — Переключение платформ по VITE_PLATFORM
import type { IPlatform } from './types'

let _platform: IPlatform | null = null

export function getPlatform(): IPlatform | null {
  return _platform
}

/**
 * P0-6: доступна ли экономика.
 * Экономика активна ТОЛЬКО при реальном Yandex SDK (не clean-фолбэк).
 * ⚠️ При падении yandex.init() платформа остаётся установленной (stub),
 * но isYandexSdkReady() === false → экономика полностью отключена.
 * Все UI-панели экономики и store-действия должны проверять именно этот хелпер.
 */
export function isEconomyAvailable(): boolean {
  return _platform?.isYandexSdkReady() ?? false
}

/** Тип активной платформы: 'yandex' | 'clean' | null (до инициализации) */
export function getPlatformType(): string | null {
  return _platform?.getPlatformType() ?? null
}

export async function initPlatform(): Promise<boolean> {
  if (_platform) return _platform.isYandexSdkReady()

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
