import { MonitorIcon } from './icons'
import { useTranslation } from 'react-i18next'

export default function WebGLFallback() {
  const { t } = useTranslation()
  return (
    <div className="fallback-screen" style={{ height: '100%', gap: 16 }}>
      <MonitorIcon size={48} />
      <strong className="fallback-title">{t('webgl.unavailable')}</strong>
      <p className="fallback-msg">
        {t('webgl.msg')}
      </p>
      <p className="fallback-hint">
        {t('webgl.hint')}
      </p>
    </div>
  )
}
