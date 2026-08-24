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
