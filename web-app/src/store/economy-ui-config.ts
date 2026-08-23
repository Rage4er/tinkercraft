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

/** Метки для триггеров квестов */
export const TRIGGER_LABELS: Record<string, string> = {
  'addShape:cube': 'Добавь куб',
  'addShape:sphere': 'Добавь сферу',
  'addShape:cylinder': 'Добавь цилиндр',
  'addShape:cone': 'Добавь конус',
  'addShape:torus': 'Добавь тор',
  'addShape:prism': 'Добавь призму',
  'addShape:pyramid': 'Добавь пирамиду',
  'tool:mirror': 'Отрази зеркалом',
  'setColor': 'Измени цвет',
  'tool:align': 'Выровняй объект',
  'csg:union': 'CSG: Объединение',
  'csg:subtract': 'CSG: Вычитание',
  'csg:intersect': 'CSG: Пересечение',
  'export:stl': 'Экспорт STL',
  'import:stl': 'Импорт STL',
  'sceneSize': 'Размер сцены',
} as const
