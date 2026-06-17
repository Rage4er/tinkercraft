import { useState, useCallback, useEffect, useRef } from 'react'
import Viewport3D, { type GizmoMode } from './components/Viewport3D'
import ErrorBoundary from './components/ErrorBoundary'
import WebGLFallback from './components/WebGLFallback'
import { useDocumentStore } from './store/document-store'
import { isWorkerReady } from './csg/worker-client'
import type { ShapeType, TransformNR } from './csg/types'

const SHAPES: { type: ShapeType; label: string; icon: string }[] = [
  { type: 'cube',     label: 'Куб',     icon: '⬛' },
  { type: 'sphere',   label: 'Сфера',   icon: '🔵' },
  { type: 'cylinder', label: 'Цилиндр', icon: '🥫' },
  { type: 'cone',     label: 'Конус',   icon: '🔺' },
]

// ---- Числовое поле свойств ----
function NumInput({
  label, value, disabled,
  onChange,
}: {
  label: string
  value: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value.toFixed(1)))

  useEffect(() => { setDraft(value.toFixed(1)) }, [value])

  return (
    <div className="props-row">
      <span className="props-label">{label}</span>
      <input
        className="props-input"
        type="number"
        step="1"
        value={draft}
        disabled={disabled}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseFloat(draft)
          if (!Number.isNaN(v)) onChange(v)
          else setDraft(value.toFixed(1))
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') { setDraft(value.toFixed(1)); (e.target as HTMLInputElement).blur() }
        }}
      />
    </div>
  )
}

export default function App() {
  const [fps,       setFps]       = useState(0)
  const [workerOk,  setWorkerOk]  = useState(false)
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>(null)
  const fitViewRef = useRef<(() => void) | null>(null)

  const {
    objects, selectedIds, operations, historyIndex,
    busy, lastCsgMs, fileName, modified,
    addShape, deleteSelected, selectObjects, clearSelection,
    csgBoolean, undo, redo, clearScene, openDoodle, saveDoodle,
    moveObject, setColor, toggleVisible, exportStl,
  } = useDocumentStore()

  // Инициализация воркера
  useEffect(() => {
    if (workerOk) return
    const iv = setInterval(() => {
      if (isWorkerReady()) { setWorkerOk(true); clearInterval(iv) }
    }, 300)
    import('./csg/worker-client').then(m => m.workerClearAll().catch(() => {}))
    return () => clearInterval(iv)
  }, [workerOk])

  // Клавиатурные сочетания
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT') return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected() }
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if (ctrl && e.key === 'a') { e.preventDefault(); selectObjects(Object.keys(objects), false) }
      if (ctrl && e.key === 's') { e.preventDefault(); saveDoodle() }
      if (ctrl && e.key === 'o') { e.preventDefault(); openDoodle() }
      if (!ctrl && e.key === 'f') { e.preventDefault(); fitViewRef.current?.() }
      if (!ctrl && e.key === 'g') { e.preventDefault(); setGizmoMode(m => m === 'translate' ? null : 'translate') }
      if (!ctrl && e.key === 'r') { e.preventDefault(); setGizmoMode(m => m === 'rotate'    ? null : 'rotate')    }
      if (!ctrl && e.key === 's') { e.preventDefault(); setGizmoMode(m => m === 'scale'     ? null : 'scale')     }
      if (e.key === 'Escape')     { setGizmoMode(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [objects, deleteSelected, undo, redo, selectObjects, saveDoodle, openDoodle])

  const handleTransformEnd = useCallback((id: string, transform: TransformNR) => {
    moveObject(id, transform)
  }, [moveObject])

  const handleSelect = useCallback((id: string | null, add: boolean) => {
    if (!id) clearSelection(); else selectObjects([id], add)
  }, [clearSelection, selectObjects])

  // Derived
  const objectList    = Object.values(objects)
  const selSet        = new Set(selectedIds)
  const firstSelected = selectedIds.length > 0 ? objects[selectedIds[0]] : null
  const totalTris     = objectList.reduce((s, o) => s + o.indices.length / 3, 0)
  const canUndo       = historyIndex > 0
  const canRedo       = historyIndex < operations.length
  const canCsg        = selectedIds.length === 2 && !busy

  // Transform helpers
  const handleMoveAxis = useCallback((axis: 'x' | 'y' | 'z', val: number) => {
    if (!firstSelected) return
    const t: TransformNR = { ...firstSelected.transform, [axis]: val }
    moveObject(firstSelected.id, t)
  }, [firstSelected, moveObject])

  const handleColor = useCallback((color: string) => {
    if (firstSelected) setColor(firstSelected.id, color)
  }, [firstSelected, setColor])

  const titleSuffix = fileName
    ? ` — ${fileName}${modified ? ' •' : ''}`
    : (modified ? ' — без имени •' : '')

  return (
    <div className="app">

      {/* ── TOOLBAR ── */}
      <div className="toolbar">
        <span className="toolbar-logo">⬛ TinkerCraft Web{titleSuffix}</span>
        <div className="toolbar-divider" />

        <button className="btn" onClick={openDoodle} title="Открыть .doodle (Ctrl+O)">📂 Открыть</button>
        <button className="btn" onClick={saveDoodle} title="Сохранить .doodle (Ctrl+S)">💾 Сохранить</button>
        <button className="btn" onClick={exportStl}  disabled={objectList.length === 0} title="Экспорт STL">📐 STL</button>

        <div className="toolbar-divider" />

        <button className="btn" onClick={undo} disabled={!canUndo || busy} title="Отменить (Ctrl+Z)">↩ Отменить</button>
        <button className="btn" onClick={redo} disabled={!canRedo || busy} title="Повторить (Ctrl+Y)">↪ Повторить</button>

        <div className="toolbar-divider" />

        <button className="btn" onClick={() => fitViewRef.current?.()} title="Fit view (F)">🔍 Fit</button>

        <div className="toolbar-divider" />

        {/* Гизмо */}
        <button
          className={`btn${gizmoMode === 'translate' ? ' active' : ''}`}
          disabled={selectedIds.length === 0}
          onClick={() => setGizmoMode(m => m === 'translate' ? null : 'translate')}
          title="Переместить (G)"
        >⤢ Переместить</button>
        <button
          className={`btn${gizmoMode === 'rotate' ? ' active' : ''}`}
          disabled={selectedIds.length === 0}
          onClick={() => setGizmoMode(m => m === 'rotate' ? null : 'rotate')}
          title="Повернуть (R)"
        >↻ Повернуть</button>
        <button
          className={`btn${gizmoMode === 'scale' ? ' active' : ''}`}
          disabled={selectedIds.length === 0}
          onClick={() => setGizmoMode(m => m === 'scale' ? null : 'scale')}
          title="Масштаб (S)"
        >⤡ Масштаб</button>
        {gizmoMode !== null && (
          <button className="btn danger" onClick={() => setGizmoMode(null)} title="Выйти из режима (Esc)">✕</button>
        )}

        <div className="toolbar-divider" />

        <button className="btn"       onClick={deleteSelected} disabled={selectedIds.length === 0 || busy} title="Удалить (Del)">🗑 Удалить</button>
        <button className="btn danger" onClick={clearScene}    disabled={busy}                             title="Очистить сцену">✖ Очистить</button>

        <div className="toolbar-divider" />

        <button className="btn primary" disabled={!canCsg} onClick={() => csgBoolean('union')}    title="A ∪ B">∪ Объединение</button>
        <button className="btn primary" disabled={!canCsg} onClick={() => csgBoolean('subtract')} title="A − B">− Вычитание</button>
        <button className="btn primary" disabled={!canCsg} onClick={() => csgBoolean('intersect')} title="A ∩ B">∩ Пересечение</button>
      </div>

      {/* ── MAIN ── */}
      <div className="main">

        {/* ── Левая панель ── */}
        <div className="panel-left">
          <div className="panel-section-title">Фигуры</div>
          {SHAPES.map(s => (
            <button key={s.type} className="shape-btn"
              title={`Добавить ${s.label}`}
              disabled={!workerOk || busy}
              onClick={() => addShape(s.type)}
            >
              <span className="shape-icon">{s.icon}</span>
              {s.label}
            </button>
          ))}

          {/* Список объектов */}
          {objectList.length > 0 && (
            <>
              <div className="panel-section-title" style={{ marginTop: 12 }}>
                Объекты ({objectList.length})
              </div>
              <div className="object-list">
                {objectList.map(obj => {
                  const isSel = selSet.has(obj.id)
                  return (
                    <div
                      key={obj.id}
                      className={`object-list-item${isSel ? ' selected' : ''}`}
                      onClick={e => handleSelect(obj.id, e.shiftKey || e.ctrlKey || e.metaKey)}
                      title={`${obj.shapeType} — ${obj.id}`}
                    >
                      <div className="object-list-swatch" style={{ background: obj.color, opacity: obj.visible ? 1 : 0.35 }} />
                      <span className="object-list-label">{obj.shapeType}</span>
                      {!obj.visible && <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>скрыт</span>}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          <div className="panel-section-title" style={{ marginTop: 12 }}>История</div>
          <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.9 }}>
            <div>Шагов: <strong style={{ color: 'var(--text-primary)' }}>{operations.length}</strong></div>
            <div>Позиция: <strong style={{ color: 'var(--text-primary)' }}>{historyIndex}</strong></div>
            <div style={{ color: canUndo ? 'var(--accent)' : 'var(--bg-hover)' }}>↩ Ctrl+Z</div>
            <div style={{ color: canRedo ? 'var(--accent)' : 'var(--bg-hover)' }}>↪ Ctrl+Y</div>
          </div>
        </div>

        {/* ── Вьюпорт ── */}
        <div className="viewport">
          {busy && (
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(30,30,46,0.92)', border: '1px solid var(--border)',
              borderRadius: 20, padding: '4px 14px', fontSize: 11, color: 'var(--accent)',
              zIndex: 20, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
            }}>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Вычисление CSG…
            </div>
          )}
          {!workerOk && (
            <div className="viewport-loading">
              <div className="spinner" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка CSG движка (WASM)…</span>
            </div>
          )}
          <ErrorBoundary fallback={<WebGLFallback />}>
            <Viewport3D
              objects={objectList}
              selectedIds={selSet}
              onSelect={handleSelect}
              onFpsUpdate={setFps}
              fitViewRef={fitViewRef}
              gizmoMode={gizmoMode}
              onTransformEnd={handleTransformEnd}
            />
          </ErrorBoundary>
          <div className="viewport-hint">
            ЛКМ — выбор · Shift+ЛКМ — мульти · ПКМ — вращение · Колёсико — зум · F — Fit · G — Переместить · R — Повернуть · S — Масштаб · Esc — сбросить
          </div>
        </div>

        {/* ── Правая панель: свойства ── */}
        <div className="panel-right">
          <div className="props-header">Свойства объекта</div>

          {firstSelected ? (
            <>
              {/* Тип */}
              <div className="props-row">
                <span className="props-label">Тип</span>
                <span className="props-value">{firstSelected.shapeType}</span>
              </div>

              {/* Цвет */}
              <div className="props-row">
                <span className="props-label">Цвет</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="color-swatch" style={{ background: firstSelected.color }} />
                  <input
                    type="color"
                    value={firstSelected.color}
                    style={{ width: 28, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    onChange={e => handleColor(e.target.value)}
                  />
                </div>
              </div>

              {/* Видимость */}
              <div className="props-row">
                <span className="props-label">Видим</span>
                <button
                  className="btn"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => toggleVisible(firstSelected.id)}
                >
                  {firstSelected.visible ? '👁 Да' : '🚫 Нет'}
                </button>
              </div>

              {/* Треугольники */}
              <div className="props-row">
                <span className="props-label">Треугольников</span>
                <span className="props-value">{(firstSelected.indices.length / 3).toLocaleString()}</span>
              </div>

              {/* Позиция */}
              <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Позиция (мм)
              </div>
              <NumInput label="X" value={firstSelected.transform.x} disabled={busy}
                onChange={v => handleMoveAxis('x', v)} />
              <NumInput label="Y" value={firstSelected.transform.y} disabled={busy}
                onChange={v => handleMoveAxis('y', v)} />
              <NumInput label="Z" value={firstSelected.transform.z} disabled={busy}
                onChange={v => handleMoveAxis('z', v)} />

              {/* Вращение */}
              <div style={{ padding: '6px 12px 2px', fontSize: 10, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Вращение (°)
              </div>
              <NumInput label="rotX" value={firstSelected.transform.rotX} disabled={busy}
                onChange={v => moveObject(firstSelected.id, { ...firstSelected.transform, rotX: v })} />
              <NumInput label="rotY" value={firstSelected.transform.rotY} disabled={busy}
                onChange={v => moveObject(firstSelected.id, { ...firstSelected.transform, rotY: v })} />
              <NumInput label="rotZ" value={firstSelected.transform.rotZ} disabled={busy}
                onChange={v => moveObject(firstSelected.id, { ...firstSelected.transform, rotZ: v })} />

              {/* ID */}
              <div className="props-row" style={{ marginTop: 4 }}>
                <span className="props-label">ID</span>
                <span className="props-value" style={{ fontSize: 10, opacity: 0.7 }}>{firstSelected.id}</span>
              </div>

              {/* CSG группа (при выборе 2) */}
              {selectedIds.length === 2 && (
                <div className="csg-group">
                  <div className="csg-group-title">CSG операции</div>
                  <button className="btn primary" disabled={!canCsg} onClick={() => csgBoolean('union')}>∪ Объединение</button>
                  <button className="btn primary" disabled={!canCsg} onClick={() => csgBoolean('subtract')}>− Вычитание</button>
                  <button className="btn primary" disabled={!canCsg} onClick={() => csgBoolean('intersect')}>∩ Пересечение</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="props-empty">
                Выберите объект<br />для просмотра свойств
              </div>
              {objectList.length > 0 && (
                <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>
                  В сцене: <strong style={{ color: 'var(--text-primary)' }}>{objectList.length}</strong> объектов
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── СТАТУСБАР ── */}
      <div className="statusbar">
        <span className="status-item">
          Движок:&nbsp;{workerOk
            ? <strong className="status-ok">manifold-3d (Worker) ✓</strong>
            : <strong className="status-loading">загрузка…</strong>}
        </span>
        <span className="status-item">Объектов: <strong>{objectList.length}</strong></span>
        <span className="status-item">Треугольников: <strong>{totalTris.toLocaleString()}</strong></span>
        <span className="status-item">История: <strong>{historyIndex}/{operations.length}</strong></span>
        {lastCsgMs !== null && (
          <span className="status-item">
            CSG: <strong className={lastCsgMs < 100 ? 'status-ok' : 'status-warn'}>{lastCsgMs.toFixed(1)} мс</strong>
          </span>
        )}
        <span className="status-item" style={{ marginLeft: 'auto' }}>FPS: <strong>{fps}</strong></span>
        <span className="status-item" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          Фаза 1–2 — undo/redo · .doodle IO · Worker · STL export
        </span>
      </div>
    </div>
  )
}
