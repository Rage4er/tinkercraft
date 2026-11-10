// UX-AUDIT-7: интерфейс на английском — без русских строк.
//  1. Нет зашитых русских строк в коде интерфейса: AST-скан исходников — строковые литералы,
//     шаблоны и JSX-текст с кириллицей вне console/devLog (комментарии не литералы).
//     Тексты — только через i18n (`t('…')`). Исключения — EXEMPT (с причиной).
//  2. Локали ru и en — одинаковый набор ключей; в en нет кириллицы.
import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import en from './locales/en/translation.json'
import ru from './locales/ru/translation.json'

/** Исходники приложения (без тестов, моков, локалей) — текстом, средствами Vite. */
const SOURCES = import.meta.glob(
  ['../**/*.{ts,tsx}', '!../**/*.test.*', '!../**/__tests__/**', '!../**/__mocks__/**', '!../i18n/**', '!../**/*.d.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const CYR = /[А-Яа-яЁё]/

/** Файлы, где кириллица допустима: причина — в комментарии. */
const EXEMPT = new Set([
  'io/doodle-io.ts',            // .doodle (legacy) не открывается из UI — parseDoodle не вызывается
])

/** Кириллица в литералах файла: «строка: текст». Вызовы console.* / devLog* пропускаются. */
function cyrillicLiterals(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && /^(console\.|devLog|devWarn)/.test(n.expression.getText(sf))) return
    let text: string | null = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text
    else if (ts.isTemplateExpression(n)) text = n.getText(sf)
    else if (ts.isJsxText(n)) text = n.text
    if (text !== null && CYR.test(text)) {
      found.push(`${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${text.trim().slice(0, 60)}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

type Dict = { [k: string]: string | Dict }
function flatKeys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : flatKeys(v, `${prefix}${k}.`)))
}
function flatValues(d: Dict): string[] {
  return Object.values(d).flatMap((v) => (typeof v === 'string' ? [v] : flatValues(v)))
}

describe('i18n — UX-AUDIT-7', () => {
  it('в коде интерфейса нет зашитых русских строк (только через i18n)', () => {
    const files = Object.entries(SOURCES)
    expect(files.length).toBeGreaterThan(50)
    const offenders: string[] = []
    for (const [key, src] of files) {
      const rel = key.replace(/^\.\.\//, '')
      if (EXEMPT.has(rel)) continue
      for (const hit of cyrillicLiterals(rel, src)) offenders.push(`${rel}:${hit}`)
    }
    expect(offenders).toEqual([])
  })

  it('ru и en — одинаковые ключи (без учёта форм множественного числа)', () => {
    const norm = (keys: string[]) => [...new Set(keys.map((k) => k.replace(/_(zero|one|two|few|many|other)$/, '')))].sort()
    expect(norm(flatKeys(en as Dict))).toEqual(norm(flatKeys(ru as Dict)))
  })

  it('в английской локали нет кириллицы', () => {
    expect(flatValues(en as Dict).filter((v) => CYR.test(v))).toEqual([])
  })
})
