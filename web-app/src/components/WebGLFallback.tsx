import { MonitorIcon } from './icons'

export default function WebGLFallback() {
  return (
    <div className="fallback-screen" style={{ height: '100%', gap: 16 }}>
      <MonitorIcon size={48} />
      <strong className="fallback-title">WebGL недоступен</strong>
      <p className="fallback-msg">
        {/* FIX (LOW-18-41): Remove hardcoded "Replit" reference — generic message */}
        Это окружение не поддерживает WebGL (headless или software rendering).
        Откройте приложение в&nbsp;браузере с аппаратным ускорением для полной 3D-визуализации.
      </p>
      <p className="fallback-hint">
        CSG движок и остальной UI работают корректно.
      </p>
    </div>
  )
}
