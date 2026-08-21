// src/platform/types.ts — Интерфейс платформы + типы SDK
import type { SDK, Player } from 'ysdk'

export interface IPlatform {
  // SDK объект (для прямого доступа)
  ysdk: SDK | null

  // Инициализация
  init(): Promise<boolean>

  // Реклама
  showFullscreenAd(): Promise<boolean>
  showRewardedVideo(): Promise<'tokens' | 'hints' | null>

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

  // Очистка
  dispose(): void
}
