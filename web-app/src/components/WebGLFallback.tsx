import { useTranslation } from 'react-i18next'
import { MonitorIcon } from './icons'

export default function WebGLFallback() {
  const { t } = useTranslation()
  return (
    <div className="fallback-screen" style={{ height: '100%', gap: 16 }}>
      <MonitorIcon size={48} />
      <strong className="fallback-title">{t('webgl.title')}</strong>
      {/* FIX (LOW-18-41): Remove hardcoded "Replit" reference — generic message */}
      <p className="fallback-msg">{t('webgl.message')}</p>
      <p className="fallback-hint">{t('webgl.hint')}</p>
    </div>
  )
}
