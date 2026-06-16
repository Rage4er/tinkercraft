import { useState, useCallback, useEffect } from 'react'
import Viewport3D from './components/Viewport3D'
import ErrorBoundary from './components/ErrorBoundary'
import WebGLFallback from './components/WebGLFallback'
import { useDocumentStore } from './store/document-store'
import { isWorkerReady } from './csg/worker-client'
import type { ShapeType } from './csg/types'

const SHAPES: { type: ShapeType; label: string; icon: string }[] = [
  { type: 'cube',     label: 'Куб',     icon: '⬛' },
  { type: 'sphere',   label: 'Сфера',   icon: '🔵' },
  { type: 'cylinder', label: 'Цилиндр', icon: '🥫' },
  { type: 'cone',     label: 'Конус',   icon: '🔺' },
]

export default function App() {
  const [fps,        setFps]        = useState(0)
  const [workerOk,   setWorkerOk]   = useState(false)

  const {
    objects, selectedIds, operations, historyIndex,
    busy, lastCsgMs, fileName, modified,
    addShape, deleteSelected, selectObjects, clearSelection,
    csgBoolean, undo, redo, clearScene, openDoodle, saveDoodle,
  } = useDocumentStore()

  // Проверяем готовность воркера каждые 300 мс (он инициализируется лениво)
  useEffect(() => {
    if (workerOk) return
    const iv = setInterval(() => {
      if (isWorkerReady()) { setWorkerOk(true); clearInterval(iv) }
    }, 300)
    // Триггерим создание воркера первым вызовом addShape не нужно —
    // worker-client создаёт воркер при первом вызове workerBuildShape.
    // Чтобы инициализация шла сразу, делаем горячий запуск:
    import('./csg/worker-client').then(m => m.workerClearAll().catch(() => {}))
    return () => clearInterval(iv)
  }, [workerOk])

  // ── Клавиатурные сочетания ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if ((e.target as HTMLElement).tagName !== 'INPUT') {
          e.preventDefault()
          deleteSelected()
        }
      }
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if (ctrl && e.key === 'a') {
        e.preventDefault()
        selectObjects(Object.keys(objects), false)
      }
      if (ctrl && e.key === 's') { e.preventDefault(); saveDoodle() }
      if (ctrl && e.key === 'o') { e.preventDefault(); openDoodle() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [objects, deleteSelected, undo, redo, selectObjects, saveDoodle, openDoodle])

  // ── Viewport callbacks ──
  const handleSelect = useCallback((id: string | null, addToSelection: boolean) => {
    if (!id) clearSelection()
    else selectObjects([id], addToSelection)
  }, [clearSelection, selectObjects])

  // ── Derived values ──
  const objectList    = Object.values(objects)
  const selSet        = new Set(selectedIds)
  const firstSelected = selectedIds.length > 0 ? objects[selectedIds[0]] : null
  const totalTris     = objectList.reduce((s, o) => s + o.indices.length / 3, 0)
  const canUndo       = historyIndex > 0
  const canRedo       = historyIndex < operations.length
  const canCsg        = selectedIds.length === 2 && !busy

  const titleSuffix = fileName
    ? ` — ${fileName}${modified ? ' •' : ''}`
    : (modified ? ' — без имени •' : '')

  return (
    <div className="app">

      {/* ─── TOOLBAR ─── */}
      <div className="toolbar">
        <span className="toolbar-logo">⬛ CaDoodle Web{titleSuffix}</span>

        <div className="toolbar-divider" />

        {/* Файловые операции */}
        <button className="btn" onClick={openDoodle} title="Открыть .doodle (Ctrl+O)">
          📂 Открыть
        </button>
        <button className="btn" onClick={saveDoodle} title="Сохранить .doodle (Ctrl+S)">
          💾 Сохранить
        </button>

        <div className="toolbar-divider" />

        {/* Undo / Redo */}
        <button className="btn" onClick={undo} disabled={!canUndo || busy} title="Отменить (Ctrl+Z)">
          ↩ Отменить
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo || busy} title="Повторить (Ctrl+Y)">
          ↪ Повторить
        </button>

        <div className="toolbar-divider" />

        {/* Удалить / Очистить */}
        <button
          className="btn"
          onClick={deleteSelected}
          disabled={selectedIds.length === 0 || busy}
          title="Удалить выбранные (Del)"
        >
          🗑 Удалить
        </button>
        <button className="btn danger" onClick={clearScene} disabled={busy} title="Очистить сцену">
          ✖ Очистить
        </button>

        <div className="toolbar-divider" />

        {/* CSG */}
        <button className="btn primary" disabled={!canCsg} onClick={() => csgBoolean('union')}    title="Объединение (A ∪ B)">∪ Объединение</button>
        <button className="btn primary" disabled={!canCsg} onClick={() => csgBoolean('subtract')} title="Вычитание (A − B)">− Вычитание</button>
        <button className="btn primary" disabled={!canCsg} onClick={() => csgBoolean('intersect')} title="Пересечение (A ∩ B)">∩ Пересечение</button>
      </div>

      {/* ─── MAIN ─── */}
      <div className="main">

        {/* ── Панель фигур (левая) ── */}
        <div className="panel-left">
          <div className="panel-section-title">Фигуры</div>
          {SHAPES.map(s => (
            <button
              key={s.type}
              className="shape-btn"
              title={`Добавить ${s.label}`}
              disabled={!workerOk || busy}
              onClick={() => addShape(s.type)}
            >
              <span className="shape-icon">{s.icon}</span>
              {s.label}
            </button>
          ))}

          <div className="panel-section-title" style={{ marginTop: 12 }}>История</div>
          <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <div>Шагов: <strong style={{ color: 'var(--text-primary)' }}>{operations.length}</strong></div>
            <div>Позиция: <strong style={{ color: 'var(--text-primary)' }}>{historyIndex}</strong></div>
            <div style={{ color: canUndo ? 'var(--accent)' : 'var(--text-muted)' }}>↩ Ctrl+Z</div>
            <div style={{ color: canRedo ? 'var(--accent)' : 'var(--text-muted)' }}>↪ Ctrl+Y</div>
          </div>
        </div>

        {/* ── Вьюпорт ── */}
        <div className="viewport">
          {busy && (
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(30,30,46,0.9)', border: '1px solid var(--border)',
              borderRadius: 20, padding: '4px 14px', fontSize: 11, color: 'var(--accent)',
              zIndex: 20, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Вычисление CSG…
            </div>
          )}
          {!workerOk && (
            <div className="viewport-loading">
              <div className="spinner" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Загрузка CSG движка (WASM)…
              </span>
            </div>
          )}
          <ErrorBoundary fallback={<WebGLFallback />}>
            <Viewport3D
              objects={objectList}
              selectedIds={selSet}
              onSelect={handleSelect}
              onFpsUpdate={setFps}
            />
          </ErrorBoundary>
          <div className="viewport-hint">
            ЛКМ — выбор · Shift+ЛКМ — мульти-выбор · ПКМ — вращение · Колёсико — зум
          </div>
        </div>

        {/* ── Правая панель: свойства ── */}
        <div className="panel-right">
          <div className="props-header">Свойства объекта</div>

          {firstSelected ? (
            <>
              <div className="props-row">
                <span className="props-label">ID</span>
                <span className="props-value" style={{ fontSize: 10 }}>{firstSelected.id}</span>
              </div>
              <div className="props-row">
                <span className="props-label">Тип</span>
                <span className="props-value">{firstSelected.shapeType}</span>
              </div>
              <div className="props-row">
                <span className="props-label">Цвет</span>
                <div
                  className="color-swatch"
                  style={{ background: firstSelected.color }}
                  title={firstSelected.color}
                />
              </div>
              <div className="props-row">
                <span className="props-label">Треугольников</span>
                <span className="props-value">{(firstSelected.indices.length / 3).toLocaleString()}</span>
              </div>
              <div className="props-row">
                <span className="props-label">X</span>
                <span className="props-value">{firstSelected.transform.x.toFixed(1)}</span>
              </div>
              <div className="props-row">
                <span className="props-label">Y</span>
                <span className="props-value">{firstSelected.transform.y.toFixed(1)}</span>
              </div>
              <div className="props-row">
                <span className="props-label">Z</span>
                <span className="props-value">{firstSelected.transform.z.toFixed(1)}</span>
              </div>
              <div className="props-row">
                <span className="props-label">Видим</span>
                <span className="props-value">{firstSelected.visible ? '✓' : '—'}</span>
              </div>

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
                  Объектов в сцене: <strong style={{ color: 'var(--text-primary)' }}>{objectList.length}</strong>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── СТАТУСБАР ─── */}
      <div className="statusbar">
        <span className="status-item">
          Движок:&nbsp;
          {workerOk
            ? <strong className="status-ok">manifold-3d (Worker) ✓</strong>
            : <strong className="status-loading">загрузка…</strong>
          }
        </span>
        <span className="status-item">Объектов: <strong>{objectList.length}</strong></span>
        <span className="status-item">Треугольников: <strong>{totalTris.toLocaleString()}</strong></span>
        <span className="status-item">История: <strong>{historyIndex}/{operations.length}</strong></span>
        {lastCsgMs !== null && (
          <span className="status-item">
            CSG: <strong className={lastCsgMs < 100 ? 'status-ok' : 'status-warn'}>{lastCsgMs.toFixed(1)} мс</strong>
          </span>
        )}
        <span className="status-item" style={{ marginLeft: 'auto' }}>
          FPS: <strong>{fps}</strong>
        </span>
        <span className="status-item" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          Фаза 1 — undo/redo · .doodle IO · Web Worker
        </span>
      </div>
    </div>
  )
}
