// ============================================================
// ComponentTree — дерево объектов сцены с переименованием
// Analog of SceneTreePanel.java from the original TinkerCraft
//
// Фаза 9.1: CSG-результат раскрывается — показываются его дети из Build Tree
// (примитивы / вложенные CSG / запечённые меши). Ребёнок — не объект сцены:
// его выбор хранится в ui-store.selectedChild (rootId выделяется в сцене).
// ============================================================

import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SceneObject, ShapeType } from '../csg/types'
import { getTreeView, formatParams, reasonFromRootFailure, type TreeViewNode, type NotEditableReason } from '../csg/tree-view'
import { useRootConsistency } from '../hooks/useRootConsistency'
import { useUiStore } from '../store/ui-store'
import {
  CubeIcon,
  SphereIcon,
  CylinderIcon,
  ConeIcon,
  TorusIcon,
  PrismIcon,
  PyramidIcon,
  ImportIcon,
  EyeIcon,
  EyeOffIcon,
  DeleteIcon,
  UnionIcon,
  SubtractIcon,
  IntersectIcon,
} from './icons'

interface Props {
  objects: SceneObject[]
  selectedIds: Set<string>
  onSelect: (id: string, add: boolean) => void
  onRename: (id: string, name: string) => void
  onToggleVis: (id: string) => void
  onDelete: (id: string) => void
}

// FIX (LOW-18-30): Named constant instead of magic number
const INPUT_SELECT_DELAY_MS = 30

function displayName(obj: SceneObject, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (obj.name) return obj.name
  const num = obj.id.split('_')[1] ?? ''
  if (obj.shapeType === 'csg') return t('csg.result') + (num ? ` ${num}` : '')
  if (obj.shapeType === 'import_mesh') return t('componentTree.import') + (num ? ` ${num}` : '')
  return `${t(`shapes.${obj.shapeType}`)} ${num}`
}

/** Иконка фигуры / CSG-операции (общая для строк объектов и детей). */
function Glyph({ shapeType, operation }: { shapeType?: ShapeType | 'csg'; operation?: 'union' | 'subtract' | 'intersect' }) {
  if (operation === 'subtract') return <SubtractIcon size={32} />
  if (operation === 'intersect') return <IntersectIcon size={32} />
  if (operation === 'union' || shapeType === 'csg') return <UnionIcon size={32} />
  switch (shapeType) {
    case 'cube': return <CubeIcon size={32} />
    case 'sphere': return <SphereIcon size={32} />
    case 'cylinder': return <CylinderIcon size={32} />
    case 'cone': return <ConeIcon size={32} />
    case 'torus': return <TorusIcon size={32} />
    case 'prism': return <PrismIcon size={32} />
    case 'pyramid': return <PyramidIcon size={32} />
    default: return <ImportIcon size={32} />
  }
}

export default function ComponentTree({ objects, selectedIds, onSelect, onRename, onToggleVis, onDelete }: Props) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const expanded = useUiStore((s) => s.expandedTreeIds)
  const toggleExpanded = useUiStore((s) => s.toggleTreeExpanded)
  const selectedChild = useUiStore((s) => s.selectedChild)
  const setSelectedChild = useUiStore((s) => s.setSelectedChild)

  // Снимки поддеревьев CSG. treeStore не реактивен — пересчёт при смене objects
  // (дерево мутируется до set() в сторе, поэтому к рендеру оно актуально).
  const views = useMemo(() => {
    const map = new Map<string, TreeViewNode>()
    for (const o of objects) {
      if (o.shapeType !== 'csg') continue
      const v = getTreeView(o.id)
      if (v && v.children.length > 0) map.set(o.id, v)
    }
    return map
  }, [objects])

  // Фаза 9.9: согласованность раскрытых CSG-корней (замок «вложенный CSG сдвинут до объединения»)
  const openRootIds = useMemo(
    () => [...views.keys()].filter((id) => !!expanded[id]),
    [views, expanded],
  )
  const consistency = useRootConsistency(openRootIds)

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (selectTimerRef.current !== null) {
        clearTimeout(selectTimerRef.current)
      }
    }
  }, [])

  function startEdit(obj: SceneObject) {
    setEditingId(obj.id)
    setEditValue(obj.name ?? displayName(obj, t))
    if (selectTimerRef.current !== null) clearTimeout(selectTimerRef.current)
    selectTimerRef.current = setTimeout(() => inputRef.current?.select(), INPUT_SELECT_DELAY_MS)
  }

  function commitEdit(id: string) {
    const trimmed = editValue.trim()
    if (trimmed) onRename(id, trimmed)
    setEditingId(null)
  }

  function childLabel(node: TreeViewNode): string {
    if (node.type === 'boolean') {
      return `${t('componentTree.nestedCsg')} · ${t(`csg.${node.operation ?? 'union'}`)}`
    }
    const shape = node.shapeType ? t(`shapes.${node.shapeType}`) : t('componentTree.import')
    if (node.type === 'baked') {
      return node.mirrored ? `${shape} (${t('componentTree.mirroredShort')})` : shape
    }
    const summary = formatParams(node.params)
    return summary ? `${shape} · ${summary}` : shape
  }

  function renderChildren(node: TreeViewNode, rootId: string, depth: number): React.ReactNode {
    return node.children.map((child) => {
      const isSel = selectedChild?.nodeId === child.id
      const hasKids = child.children.length > 0
      const isOpen = !!expanded[child.id]
      // Эффективная причина: статическая (тип узла) либо свойство корня (дерево ≠ меш).
      const reason: NotEditableReason = child.notEditableReason ?? reasonFromRootFailure(consistency[rootId])
      // Вложенная операция — контейнер, не «заблокированный» параметр: замок не нужен.
      const locked = reason !== null && reason !== 'boolean'
      const lockTitle = locked ? `${t('tree.child_not_editable')}: ${t(`tree.reason.${reason}`)}` : undefined
      return (
        <div key={child.id}>
          <div
            className={`ct-item ct-child${isSel ? ' ct-selected ct-child-selected' : ''}${reason === null ? '' : ' ct-readonly'}`}
            style={{ paddingLeft: 6 + depth * 14 }}
            data-node-id={child.id}
            title={lockTitle}
            onClick={() => {
              onSelect(rootId, false)
              setSelectedChild({ rootId, nodeId: child.id })
            }}
          >
            {hasKids ? (
              <button
                className="ct-btn ct-chevron"
                title={isOpen ? t('componentTree.collapse') : t('componentTree.expand')}
                onClick={(e) => { e.stopPropagation(); toggleExpanded(child.id) }}
              >
                {isOpen ? '▾' : '▸'}
              </button>
            ) : (
              <span className="ct-chevron-spacer" />
            )}
            <span className="ct-icon"><Glyph shapeType={child.shapeType} operation={child.operation} /></span>
            <span className="ct-name">{childLabel(child)}</span>
            {locked && (
              <span className="ct-lock" data-testid="ct-lock" data-reason={reason} title={lockTitle} aria-label={lockTitle}>🔒</span>
            )}
          </div>
          {hasKids && isOpen && renderChildren(child, rootId, depth + 1)}
        </div>
      )
    })
  }

  if (objects.length === 0) {
    return <div className="ct-empty">{t("componentTree.sceneEmpty")}</div>
  }

  return (
    <div className="ct-list">
      {objects.map(obj => {
        const isSel = selectedIds.has(obj.id)
        const isEd = editingId === obj.id
        const view = views.get(obj.id)
        const isOpen = !!expanded[obj.id]
        return (
          <div key={obj.id}>
            <div
              className={`ct-item${isSel && !selectedChild ? ' ct-selected' : ''}${!obj.visible ? ' ct-hidden' : ''}`}
              data-object-id={obj.id}
              onClick={e => {
                if (isEd) return
                setSelectedChild(null)
                onSelect(obj.id, e.shiftKey || e.ctrlKey || e.metaKey)
              }}
            >
              {/* Раскрытие CSG (Фаза 9.1) */}
              {view ? (
                <button
                  className="ct-btn ct-chevron"
                  title={isOpen ? t('componentTree.collapse') : t('componentTree.expand')}
                  onClick={e => { e.stopPropagation(); toggleExpanded(obj.id) }}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
              ) : (
                <span className="ct-chevron-spacer" />
              )}

              {/* Цветовая метка */}
              <div className="ct-swatch" style={{ background: obj.color, opacity: obj.visible ? 1 : 0.4 }} />

              {/* Иконка фигуры */}
              <span className="ct-icon"><Glyph shapeType={obj.shapeType} /></span>

              {/* Имя (двойной клик = редактирование) */}
              {isEd ? (
                <input
                  ref={inputRef}
                  className="ct-name-input"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(obj.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(obj.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="ct-name"
                  onDoubleClick={e => { e.stopPropagation(); startEdit(obj) }}
                  title={t("componentTree.doubleClickRename")}
                >
                  {displayName(obj, t)}
                </span>
              )}

              {/* Треугольники */}
              <span className="ct-tri">{(obj.indices.length / 3).toLocaleString()}</span>

              {/* Действия */}
              <button
                className="ct-btn"
                title={obj.visible ? t("componentTree.hide") : t("componentTree.show")}
                onClick={e => { e.stopPropagation(); onToggleVis(obj.id) }}
              >
                {obj.visible ? <EyeIcon size={32} /> : <EyeOffIcon size={32} />}
              </button>
              <button
                className="ct-btn ct-del"
                title={t("componentTree.delete")}
                onClick={e => { e.stopPropagation(); onDelete(obj.id) }}
              >
                <DeleteIcon size={32} />
              </button>
            </div>
            {view && isOpen && renderChildren(view, obj.id, 1)}
          </div>
        )
      })}
    </div>
  )
}
