// src/hooks/useRootConsistency.ts — согласованность дерева CSG-корней с их мешем (Фаза 9.9)
//
// Согласованность — свойство КОРНЯ (дерево со старыми params воспроизводит меш?), поэтому
// проверка идёт один раз на корень и делится между всеми его детьми. Результат:
//   undefined — ещё не проверено; null — согласован; иначе причина отказа.
// Прежнее значение остаётся, пока идёт новая проверка (без мигания замков).
import { useEffect, useState } from 'react'
import { useDocumentStore } from '../store/document-store'
import { checkRootConsistency, type EditChildFailure } from '../store/edit-child'

export type RootConsistency = Record<string, EditChildFailure | null | undefined>

export function useRootConsistency(rootIds: string[]): RootConsistency {
  const objects = useDocumentStore((s) => s.objects)
  const operations = useDocumentStore((s) => s.operations)
  const historyIndex = useDocumentStore((s) => s.historyIndex)
  const [result, setResult] = useState<RootConsistency>({})
  const key = rootIds.join('|')

  useEffect(() => {
    let cancelled = false
    const ids = key ? key.split('|') : []
    void (async () => {
      for (const rootId of ids) {
        const r = await checkRootConsistency({ rootId, objects, operations, historyIndex })
        if (cancelled) return
        setResult((prev) => (prev[rootId] === r ? prev : { ...prev, [rootId]: r }))
      }
    })()
    return () => { cancelled = true }
  }, [key, objects, operations, historyIndex])

  return result
}
