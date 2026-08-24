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
  /** Показать токены в статус-баре */
  showTokensInStatusBar: true,
} as const

/** Метки для квестов */
export const QUEST_LABELS = {
  easy: '🌟 Лёгкое',
  medium: '⭐ Среднее',
  hard: '🏆 Сложное',
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

/** Метки для триггеров квестов V2 */
export const TRIGGER_LABELS: Record<string, string> = {
  // 🧱 Состав
  'count_cubes': 'Кубовая база (≥ 5 кубов)',
  'count_objects': 'Непустая сцена (≥ {n} объектов)',
  // 🎨 Разнообразие
  'count_unique_shapes': 'Разнообразие (≥ {n} разных примитива)',
  'count_colored': 'Маляр (≥ {n} объектов с цветом)',
  // 🧩 Булевы
  'count_csg': 'Булев дебют (≥ {n} CSG)',
  'csg_complex': 'Сложная геометрия (CSG с ≥ 3 детьми)',
  // 🪞 Преобразования
  'count_mirrored': 'Зазеркалье (≥ {n} зеркал)',
  // 📤 Вывод
  'export_stl': 'Первая выгрузка (экспорт STL)',
  'export_stl_large': 'Достойная печать (экспорт ≥ 10 объектов)',
  'import_stl': 'Чужая геометрия (импорт STL)',
  // 🔤 Текст
  'count_text3d': 'Гравировка (≥ 1 3D-текст)',
} as const

/**
 * Единый реестр иконок для рендера в QuestPanel / EconomyHUD
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
