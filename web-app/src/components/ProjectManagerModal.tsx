// ============================================================
// ProjectManagerModal — управление проектами (IndexedDB)
// Analog of ProjectManager.java from the original TinkerCraft
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  listProjects, saveProject, deleteProject, updateProject,
  type ProjectMeta,
} from '../io/project-manager'
import { FolderIcon, CloseIcon, SaveIcon, OpenIcon, DeleteIcon } from './icons'

interface Props {
  onClose: () => void
  onLoad: (id: string) => void
  onSave: (name: string) => Promise<void>
  currentProjectId?: string
  setCurrentProjectId: (id: string | undefined) => void
}

export default function ProjectManagerModal({ onClose, onLoad, onSave, currentProjectId, setCurrentProjectId }: Props) {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language?.startsWith("ru") ? "ru" : "en"
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState(t('projectManager.newProject'))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

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
          <span><FolderIcon size={32} /> {t('projectManager.title')}</span>
          <button className="btn" onClick={onClose} title={t('actions.close')}><CloseIcon size={32} /></button>
        </div>

        {/* Сохранить текущий */}
        <div className="modal-section">
          <div className="modal-section-title">{t('projectManager.saveCurrentScene')}</div>
          <div className="flex-row" style={{ gap: 6 }}>
            <input
              className="modal-input"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t('projectManager.projectName')}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            />
            <button className="btn primary" onClick={handleSave} disabled={saving || !newName.trim()}>
              {saving ? '…' : <><SaveIcon size={32} /> {t('projectManager.save')}</>}
            </button>
          </div>
        </div>

        {/* Список проектов */}
        <div className="modal-section">
          <div className="modal-section-title">{t('projectManager.savedProjects', { count: projects.length })}</div>
          {loading ? (
            <div className="modal-empty">{t('projectManager.loading')}</div>
          ) : projects.length === 0 ? (
            <div className="modal-empty">{t('projectManager.noProjects')}</div>
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
                      {t('projectManager.objectCount', { count: p.objectCount })} ·{' '}
                      {new Date(p.savedAt).toLocaleString(currentLang)}
                      {p.id === currentProjectId && ` · ${t('projectManager.current')}`}
                    </div>
                  </div>
                  <div className="proj-actions">
                    <button className="btn" onClick={() => handleLoad(p.id)}>
                      <OpenIcon size={32} /> {t('projectManager.open')}
                    </button>
                    <button
                      className="btn danger"
                      disabled={deleting === p.id}
                      onClick={() => handleDelete(p.id)}
                      title={t('projectManager.deleteProject')}
                    >
                      {deleting === p.id ? '…' : <DeleteIcon size={32} />}
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
