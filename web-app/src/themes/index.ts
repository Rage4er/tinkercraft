// ============================================================
// themes — темы оформления (THEME-ENGINE)
// ============================================================
// Тема — JSON-файл в этой папке (`dark.json`, `light.json`, `high-contrast.json`): подхватываются
// сами (`import.meta.glob`), НОВАЯ ТЕМА = НОВЫЙ ФАЙЛ, код не правится. Поля:
//   id       — уникальный id (хранится в настройках);
//   order    — место в списке «Настройки → Тема»;
//   name     — подпись { ru, en } (язык интерфейса, иначе en);
//   base     — "dark" | "light": стили `[data-theme="light"]` в App.css и прочие «светлые» правила;
//   vars     — CSS-переменные интерфейса (`--bg-panel`, `--accent`, …); недостающие — из темы базы;
//   scene    — фон сцены и цвета сетки (`background`, `gridMinor`, `gridMajor`, «#rrggbb»).
// Применение — `applyTheme` (переменные на <html>, `data-theme` = база, `data-theme-id` = id).
// Выбор — «Настройки» (`store/settings.ts`), кнопка темы в тулбаре — тёмная ↔ светлая.

export type ThemeBase = 'dark' | 'light'
export interface ThemeScene { background: string; gridMinor: string; gridMajor: string }
export interface ThemeDef {
  id: string
  order: number
  name: { ru: string; en: string }
  base: ThemeBase
  vars: Record<string, string>
  scene: ThemeScene
}

/** CSS-переменные темы (все темы задают этот набор; недостающие — из темы базы) */
export const THEME_VARS = [
  '--bg-deep', '--bg-panel', '--bg-surface', '--bg-hover', '--bg-selected', '--border',
  '--text-primary', '--text-muted', '--accent', '--accent-red', '--accent-green', '--accent-yellow',
  '--accent-mauve', '--btn-bg', '--btn-hover', '--btn-active',
] as const

const COLOR = /^#[0-9a-f]{6}$/i
const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v : d)
const color = (v: unknown, d: string) => (typeof v === 'string' && COLOR.test(v) ? v : d)

/**
 * JSON темы → тема; без id / с чужой базой — null. Цвета не «#rrggbb» и недостающие переменные —
 * из `fallback` (тема той же базы). Имя без перевода — id.
 */
export function parseTheme(raw: unknown, fallback?: ThemeDef): ThemeDef | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !/^[a-z0-9-]+$/.test(r.id)) return null
  if (r.base !== 'dark' && r.base !== 'light') return null
  const name = (r.name && typeof r.name === 'object' ? r.name : {}) as Record<string, unknown>
  const vars = (r.vars && typeof r.vars === 'object' ? r.vars : {}) as Record<string, unknown>
  const scene = (r.scene && typeof r.scene === 'object' ? r.scene : {}) as Record<string, unknown>
  const fb = fallback
  const en = str(name.en, r.id)
  return {
    id: r.id,
    order: typeof r.order === 'number' && Number.isFinite(r.order) ? r.order : 100,
    name: { en, ru: str(name.ru, en) },
    base: r.base,
    vars: Object.fromEntries(THEME_VARS.map((k) => [k, color(vars[k], fb?.vars[k] ?? '#808080')])),
    scene: {
      background: color(scene.background, fb?.scene.background ?? '#1e1e2e'),
      gridMinor: color(scene.gridMinor, fb?.scene.gridMinor ?? '#2e2e4c'),
      gridMajor: color(scene.gridMajor, fb?.scene.gridMajor ?? '#45456e'),
    },
  }
}

/** Темы из JSON-файлов папки: сначала базовые dark / light (запас для остальных), потом прочие */
export function buildThemes(files: Record<string, unknown>): ThemeDef[] {
  const raws = Object.values(files).map((m) => (m && typeof m === 'object' && 'default' in m ? (m as { default: unknown }).default : m))
  const bases: Partial<Record<ThemeBase, ThemeDef>> = {}
  for (const r of raws) {
    const t = parseTheme(r)
    if (t && (t.id === 'dark' || t.id === 'light') && t.id === t.base) bases[t.base] = t
  }
  const out: ThemeDef[] = []
  for (const r of raws) {
    const base = (r as { base?: unknown })?.base
    const t = parseTheme(r, base === 'light' ? bases.light : bases.dark)
    if (t && !out.some((o) => o.id === t.id)) out.push(t)
  }
  return out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

export const THEMES: readonly ThemeDef[] = buildThemes(import.meta.glob('./*.json', { eager: true }))

/** Тема по id (неизвестный — первая, тёмная) */
export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Подпись темы на языке интерфейса */
export function themeName(t: ThemeDef, lang: string): string {
  return lang.startsWith('ru') ? t.name.ru : t.name.en
}

/** «#rrggbb» → число для THREE.Color */
export const hexColor = (c: string): number => parseInt(c.slice(1), 16)

/** Применить тему к документу: CSS-переменные, `data-theme` (база), `data-theme-id` */
export function applyTheme(t: ThemeDef, root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v)
  root.setAttribute('data-theme', t.base)
  root.setAttribute('data-theme-id', t.id)
}
