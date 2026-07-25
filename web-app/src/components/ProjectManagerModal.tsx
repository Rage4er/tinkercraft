// ============================================================
// ProjectManagerModal — управление проектами (IndexedDB)
// Analog of ProjectManager.java from the original TinkerCraft
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  listProjects, saveProject, deleteProject, updateProject,
  type ProjectMeta,
} from '../io/project-manager'

interface Props {
  onClose:   () => void
  onLoad:    (id: string) => void
  onSave:    (name: string) => Promise<void>
  currentProjectId?: string
  setCurrentProjectId: (id: string | undefined) => void
}

export default function ProjectManagerModal({ onClose, onLoad, onSave, currentProjectId, setCurrentProjectId }: Props) {
  const [projects,    setProjects]    = useState<ProjectMeta[]>([])
  const [loading,     setLoading]     = useState(true)
  const [newName,     setNewName]     = useState('Новый проект')
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try { setProjects(await listProjects()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function handleSave() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await onSave(newName.trim())
      await refresh()
    } finally { setSaving(false) }
  }

  async function handleLoad(id: string) {
    setCurrentProjectId(id)
    onLoad(id)
    onClose()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await deleteProject(id)
      if (id === currentProjectId) setCurrentProjectId(undefined)
      await refresh()
    } finally { setDeleting(null) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>📁 Менеджер проектов</span>
          <button className="btn" onClick={onClose} title="Закрыть">✕</button>
        </div>

        {/* Сохранить текущий */}
        <div className="modal-section">
          <div className="modal-section-title">Сохранить текущую сцену</div>
          <div className="flex-row" style={{ gap: 6 }}>
            <input
              className="modal-input"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Имя проекта"
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            />
            <button className="btn primary" onClick={handleSave} disabled={saving || !newName.trim()}>
              {saving ? '…' : '💾 Сохранить'}
            </button>
          </div>
        </div>

        {/* Список проектов */}
        <div className="modal-section">
          <div className="modal-section-title">Сохранённые проекты ({projects.length})</div>
          {loading ? (
            <div className="modal-empty">Загрузка…</div>
          ) : projects.length === 0 ? (
            <div className="modal-empty">Нет сохранённых проектов</div>
          ) : (
            <div className="proj-list">
              {projects.map(p => (
                <div key={p.id} className={`proj-item${p.id === currentProjectId ? ' proj-current' : ''}`}>
                  {p.thumbnail && (
                    <img src={p.thumbnail} alt="" className="proj-thumb" />
                  )}
                  <div className="proj-info">
                    <div className="proj-name">{p.name}</div>
                    <div className="proj-meta">
                      {p.objectCount} объект{p.objectCount === 1 ? '' : p.objectCount < 5 ? 'а' : 'ов'} ·{' '}
                      {new Date(p.savedAt).toLocaleString('ru')}
                      {p.id === currentProjectId && ' · текущий'}
                    </div>
                  </div>
                  <div className="proj-actions">
                    <button className="btn" onClick={() => handleLoad(p.id)}>
                      📂 Открыть
                    </button>
                    <button
                      className="btn danger"
                      disabled={deleting === p.id}
                      onClick={() => handleDelete(p.id)}
                      title="Удалить проект"
                    >
                      {deleting === p.id ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
