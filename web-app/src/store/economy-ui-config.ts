// src/store/economy-ui-config.ts — Конфигурация UI экономики
// Отвечает за отображение UI элементов экономики (токены, бонусы, квесты)

/** Кнопки экономики на UI */
export const ECONOMY_UI = {
  /** Показать ежедневный бонус */
  showDailyBonus: true,
  /** Показать кнопку рекламы */
  showAdButton: true,
  /** Показать квесты */
  showQuests: true,
} as const

/** Ключи иконок для сложности квестов */
export const DIFFICULTY_ICON = {
  easy: 'spark' as const,
  medium: 'star' as const,
  hard: 'trophy' as const,
} as const

/** Ключи иконок для категорий квестов */
export const CATEGORY_ICON = {
  composition: 'cube' as const,
  variety: 'palette' as const,
  boolean: 'union' as const,
  transform: 'mirror' as const,
  output: 'export' as const,
  text: 'text3d' as const,
} as const

/**
 * Единый реестр иконок для рендера в PropertiesPanel / EconomyMiniHUD
 * Ключ — из DIFFICULTY_ICON / CATEGORY_ICON
 */
import type { ComponentType, SVGProps } from 'react'
import {
  TokenIcon, GiftIcon, AdFilmIcon,
  SparkIcon, StarIcon, TrophyIcon,
  CubeIcon, ColorIcon, UnionIcon,
  MirrorYZIcon, ExportIcon, TextIcon,
} from '../components/icons'

export const ICON_REGISTRY: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  token: TokenIcon,
  gift: GiftIcon,
  ad: AdFilmIcon,
  spark: SparkIcon,
  star: StarIcon,
  trophy: TrophyIcon,
  cube: CubeIcon,
  palette: ColorIcon,
  union: UnionIcon,
  mirror: MirrorYZIcon,
  export: ExportIcon,
  text3d: TextIcon,
} as const
