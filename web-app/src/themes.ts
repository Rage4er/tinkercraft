// ============================================================
// themes.ts — темы оформления (APP-SETTINGS; движок — THEME-ENGINE)
// ============================================================
// Тема — запись в THEMES: id, подпись (i18n), база (dark / light — стили `[data-theme="light"]` в
// App.css, цвета сцены). Выбор — «Настройки» (`store/settings.ts`), кнопка темы в тулбаре
// переключает тёмную ↔ светлую.

export type ThemeBase = 'dark' | 'light'
export interface ThemeDef {
  id: string
  /** ключ i18n подписи */
  labelKey: string
  /** база: стили светлой / тёмной темы, цвета сцены и сетки */
  base: ThemeBase
}

export const THEMES: readonly ThemeDef[] = [
  { id: 'dark', labelKey: 'theme.dark', base: 'dark' },
  { id: 'light', labelKey: 'theme.light', base: 'light' },
]

/** Тема по id (неизвестный — тёмная) */
export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
