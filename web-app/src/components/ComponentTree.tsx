// ============================================================
// ComponentTree — дерево объектов сцены с переименованием
// Analog of SceneTreePanel.java from the original TinkerCraft
// ============================================================

import { useState, useRef, useEffect } from 'react'
import type { SceneObject } from '../csg/types'
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

function displayName(obj: SceneObject): string {
  if (obj.name) return obj.name
  return `${obj.shapeType} ${obj.id.split('_')[1] ?? ''}`
}

export default function ComponentTree({ objects, selectedIds, onSelect, onRename, onToggleVis, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    setEditValue(obj.name ?? displayName(obj))
    if (selectTimerRef.current !== null) clearTimeout(selectTimerRef.current)
    selectTimerRef.current = setTimeout(() => inputRef.current?.select(), INPUT_SELECT_DELAY_MS)
  }

  function commitEdit(id: string) {
    const trimmed = editValue.trim()
    if (trimmed) onRename(id, trimmed)
    setEditingId(null)
  }

  if (objects.length === 0) {
    return <div className="ct-empty">Сцена пуста</div>
  }

  return (
    <div className="ct-list">
      {objects.map(obj => {
        const isSel = selectedIds.has(obj.id)
        const isEd = editingId === obj.id
        return (
          <div key={obj.id}
            className={`ct-item${isSel ? ' ct-selected' : ''}${!obj.visible ? ' ct-hidden' : ''}`}
            onClick={e => !isEd && onSelect(obj.id, e.shiftKey || e.ctrlKey || e.metaKey)}
          >
            {/* Цветовая метка */}
            <div className="ct-swatch" style={{ background: obj.color, opacity: obj.visible ? 1 : 0.4 }} />

            {/* Иконка фигуры */}
            <span className="ct-icon">
              {obj.shapeType === 'cube' && <CubeIcon size={32} />}
              {obj.shapeType === 'sphere' && <SphereIcon size={32} />}
              {obj.shapeType === 'cylinder' && <CylinderIcon size={32} />}
              {obj.shapeType === 'cone' && <ConeIcon size={32} />}
              {obj.shapeType === 'torus' && <TorusIcon size={32} />}
              {obj.shapeType === 'prism' && <PrismIcon size={32} />}
              {obj.shapeType === 'pyramid' && <PyramidIcon size={32} />}
              {obj.shapeType === 'import_mesh' && <ImportIcon size={32} />}
            </span>

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
                title="Двойной клик — переименовать"
              >
                {displayName(obj)}
              </span>
            )}

            {/* Треугольники */}
            <span className="ct-tri">{(obj.indices.length / 3).toLocaleString()}</span>

            {/* Действия */}
            <button
              className="ct-btn"
              title={obj.visible ? 'Скрыть' : 'Показать'}
              onClick={e => { e.stopPropagation(); onToggleVis(obj.id) }}
            >
              {obj.visible ? <EyeIcon size={32} /> : <EyeOffIcon size={32} />}
            </button>
            <button
              className="ct-btn ct-del"
              title="Удалить"
              onClick={e => { e.stopPropagation(); onDelete(obj.id) }}
            >
              <DeleteIcon size={32} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
