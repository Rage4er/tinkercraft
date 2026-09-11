// src/platform/types.ts — Интерфейс платформы + типы SDK
import type { SDK, Player } from 'ysdk'

export interface IPlatform {
  // SDK объект (для прямого доступа)
  ysdk: SDK | null

  /**
   * Инициализация платформы.
   * ⚠️ Возвращает true только при УСПЕШНОЙ инициализации Yandex SDK.
   * При фолбэке в clean-режим (SDK недоступен/упал) — false, но _platform
   * всё равно установлен (stub), чтобы игра работала без SDK.
   * Для различения «платформа есть» и «SDK доступен» используйте
   * isYandexSdkReady() / isEconomyAvailable() (P0-6).
   */
  init(): Promise<boolean>

  /**
   * Готов ли Yandex SDK (P0-6: clean-фолбэк ≠ активная экономика).
   * true — только если YaGames.init() успешно завершён и ysdk доступен.
   * false — clean-режим или SDK упал при инициализации.
   */
  isYandexSdkReady(): boolean

  /** Тип платформы: 'yandex' | 'clean' (для диагностики/UI). */
  getPlatformType(): string

  // LoadingAPI.ready() — сообщить платформе, что игра загрузилась (§1.2 SDK).
  // Вызывается ПОСЛЕ полной готовности вьюпорта (CSG-воркер готов),
  // с внутренним fallback-таймером на случай зависшей загрузки.
  loadingReady(): void

  // Реклама
  showFullscreenAd(): Promise<boolean>
  showRewardedVideo(): Promise<boolean>

  // Игрок
  getPlayer(): Player | null
  isAuthorized(): boolean

  // Сохранения
  saveData(data: Record<string, unknown>): Promise<void>
  loadData(): Promise<Record<string, unknown>>

  // Лидерборды
  submitScore(leaderboardName: string, score: number): Promise<void>
  getLeaderboardEntries(
    leaderboardName: string,
    count?: number
  ): Promise<Array<{ rank: number; userId: string; score: number; playerName: string }>>

  // Геймплей
  startGameplay(): void
  stopGameplay(): void

  // Серверное время (§5 ECONOMY.md v2.0)
  getServerTime(): Promise<number>

  // Стики-баннер (§6.3, §SDK)
  showBannerAdv(): Promise<{ stickyAdvIsShowing: boolean; reason?: string }>
  hideBannerAdv(): Promise<{ stickyAdvIsShowing: boolean }>
  getBannerAdvStatus(): Promise<{ stickyAdvIsShowing: boolean; reason?: string }>

  // Очистка
  dispose(): void
}
