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
import { getTreeView, formatParams, reasonFromRootFailure, viewGroupSplit, type TreeViewNode, type NotEditableReason } from '../csg/tree-view'
import { useRootConsistency } from '../hooks/useRootConsistency'
import { useUiStore } from '../store/ui-store'
import {
  CubeIcon,
  SphereIcon,
  CylinderIcon,
  ConeIcon,
  TorusIcon,
  PrismIcon,
  PyramidIcon, CapsuleIcon, TubeIcon, SpringIcon,
  ImportIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UnlockIcon,
  DeleteIcon,
  UnionIcon,
  SubtractIcon,
  IntersectIcon,
  TextIcon,
} from './icons'
import { isTextObject, textsByObjectId, textOfNode, defaultTextName } from '../store/text-object'
import { useDocumentStore } from '../store/document-store'
import { useCsgGroupModeStore } from '../store/csg-group-mode'

interface Props {
  objects: SceneObject[]
  selectedIds: Set<string>
  onSelect: (id: string, add: boolean) => void
  onRename: (id: string, name: string) => void
  onToggleVis: (id: string) => void
  onDelete: (id: string) => void
  /** LOCK-OBJECT: замок в строке объекта */
  onToggleLock?: (id: string) => void
}

// FIX (LOW-18-30): Named constant instead of magic number
const INPUT_SELECT_DELAY_MS = 30

/** Имя объекта как в дереве (своё имя или «Фигура N»); также панель шага 9.5.2. */
export function displayName(obj: Pick<SceneObject, 'id' | 'shapeType' | 'name' | 'text'>, t: (key: string, opts?: Record<string, unknown>) => string): string {
  // UX-AUDIT-36: имя 3D-текста по умолчанию — на языке интерфейса (переименованный — своё имя)
  const text = defaultTextName(obj)
  if (text !== undefined) return t('textModal.objectName', { text })
  if (obj.name) return obj.name
  const num = obj.id.split('_')[1] ?? ''
  if (obj.shapeType === 'csg') return t('csg.result') + (num ? ` ${num}` : '')
  if (obj.shapeType === 'import_mesh') return t('componentTree.import') + (num ? ` ${num}` : '')
  return `${t(`shapes.${obj.shapeType}`)} ${num}`
}

/** Иконка фигуры / CSG-операции (общая для строк объектов и детей); `text` — 3D-текст (UX-AUDIT-31). */
function Glyph({ shapeType, operation, text }: { shapeType?: ShapeType | 'csg'; operation?: 'union' | 'subtract' | 'intersect'; text?: boolean }) {
  if (text) return <TextIcon size={32} />
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
    case 'capsule': return <CapsuleIcon size={32} />
    case 'tube': return <TubeIcon size={32} />
    case 'spring': return <SpringIcon size={32} />
    default: return <ImportIcon size={32} />
  }
}

/** UX-AUDIT-25: операция корня CSG — из Build Tree (корень — boolean-узел), иначе — из объекта. */
function rootOperation(obj: SceneObject, view: TreeViewNode | undefined): 'union' | 'subtract' | 'intersect' | undefined {
  return view?.operation ?? obj.operation
}

export default function ComponentTree({ objects, selectedIds, onSelect, onRename, onToggleVis, onDelete, onToggleLock }: Props) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  // значение поля при начале правки: без изменений — шаг «Переименовать» не пишется (имя текста по
  // умолчанию показывается на языке интерфейса — UX-AUDIT-36 — и может отличаться от сохранённого)
  const editStartRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const expanded = useUiStore((s) => s.expandedTreeIds)
  const toggleExpanded = useUiStore((s) => s.toggleTreeExpanded)
  const selectedChild = useUiStore((s) => s.selectedChild)
  // CSG-GROUP-FIX: режим вычитания / пересечения — «A» у зафиксированной группы, «B» у выделения
  const csgGroupMode = useCsgGroupModeStore((s) => s.csgGroupMode)
  const groupOfId = useMemo(() => {
    const m = new Map<string, 'a' | 'b'>()
    if (!csgGroupMode) return m
    for (const id of selectedIds) m.set(id, 'b')
    for (const id of csgGroupMode.groupA) m.set(id, 'a')
    return m
  }, [csgGroupMode, selectedIds])
  const setSelectedChild = useUiStore((s) => s.setSelectedChild)
  // UX-AUDIT-34: какие запечённые дети CSG — 3D-текст (по истории; объект-текст поглощён CSG)
  const operations = useDocumentStore((s) => s.operations)
  const historyIndex = useDocumentStore((s) => s.historyIndex)
  const texts = useMemo(() => textsByObjectId(operations.slice(0, historyIndex)), [operations, historyIndex])

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
    editStartRef.current = displayName(obj, t)
    setEditValue(editStartRef.current)
    if (selectTimerRef.current !== null) clearTimeout(selectTimerRef.current)
    selectTimerRef.current = setTimeout(() => inputRef.current?.select(), INPUT_SELECT_DELAY_MS)
  }

  function commitEdit(id: string) {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== editStartRef.current) onRename(id, trimmed)
    setEditingId(null)
  }

  function childLabel(node: TreeViewNode): string {
    if (node.type === 'boolean') {
      return `${t('componentTree.nestedCsg')} · ${t(`csg.${node.operation ?? 'union'}`)}`
    }
    const shape = node.shapeType ? t(`shapes.${node.shapeType}`) : t('componentTree.import')
    if (node.type === 'baked') {
      // UX-AUDIT-34: текст внутри CSG — «Текст: Дом», а не «Импорт»
      const text = node.shapeType ? undefined : textOfNode(node.id, texts)
      const label = text !== undefined ? t('textModal.objectName', { text }) : shape
      return node.mirrored ? `${label} (${t('componentTree.mirroredShort')})` : label
    }
    const summary = formatParams(node.params, node.shapeType)
    const base = summary ? `${shape} · ${summary}` : shape
    // Фаза 9.8: зеркальный примитив редактируем — помечаем только как «зеркало»
    return node.mirrored ? `${base} (${t('componentTree.mirroredShort')})` : base
  }

  // N-ARY-CSG: вычитание/пересечение больше двух детей — заголовки «Группа A» / «Группа B»
  // перед первым ребёнком каждой группы (дети остаются плоским списком одного узла)
  function groupHeader(node: TreeViewNode, index: number, depth: number): React.ReactNode {
    const split = viewGroupSplit(node)
    if (split === null || (index !== 0 && index !== split)) return null
    const which = index === 0 ? 'a' : 'b'
    return (
      <div
        className="ct-item ct-group-header"
        style={{ paddingLeft: 6 + depth * 14 }}
        data-group={which}
        data-testid={`ct-group-${which}`}
      >
        {t(which === 'a' ? 'csg.groupA' : 'csg.groupB')}
      </div>
    )
  }

  function renderChildren(node: TreeViewNode, rootId: string, depth: number): React.ReactNode {
    return node.children.map((child, index) => {
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
          {groupHeader(node, index, depth)}
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
            <span className="ct-icon"><Glyph shapeType={child.shapeType} operation={child.operation} text={child.type === 'baked' && !child.shapeType && textOfNode(child.id, texts) !== undefined} /></span>
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
        const group = groupOfId.get(obj.id)
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

              {/* Иконка фигуры; UX-AUDIT-25: у корня CSG — иконка его операции (вычитание,
                  пересечение), как у вложенных CSG и в истории, а не всегда объединения */}
              <span className="ct-icon"><Glyph shapeType={obj.shapeType} operation={obj.shapeType === 'csg' ? rootOperation(obj, view) : undefined} text={isTextObject(obj)} /></span>

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

              {/* CSG-GROUP-FIX: объект — в группе A / B режима вычитания / пересечения */}
              {group && (
                <span className="ct-csg-group" data-testid="ct-csg-group" data-group={group} title={t(group === 'a' ? 'csg.groupA' : 'csg.groupB')}>
                  {group === 'a' ? 'A' : 'B'}
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
              {onToggleLock && (
                <button
                  className={`ct-btn ct-objlock${obj.locked ? ' active' : ''}`}
                  data-testid="obj-lock"
                  aria-pressed={!!obj.locked}
                  title={obj.locked ? t("lock.unlock") : t("lock.lock")}
                  onClick={e => { e.stopPropagation(); onToggleLock(obj.id) }}
                >
                  {obj.locked ? <LockIcon size={32} /> : <UnlockIcon size={32} />}
                </button>
              )}
              <button
                className="ct-btn ct-del"
                title={t("componentTree.delete")}
                disabled={!!obj.locked}
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
