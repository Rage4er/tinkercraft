export default function WebGLFallback() {
  return (
    <div className="fallback-screen" style={{ height: '100%', gap: 16 }}>
      <span className="fallback-icon">🖥️</span>
      <strong className="fallback-title">WebGL недоступен</strong>
      <p className="fallback-msg">
        Это окружение Replit не поддерживает WebGL (headless).
        Откройте приложение в&nbsp;браузере для полной 3D-визуализации.
      </p>
      <p className="fallback-hint">
        CSG движок и остальной UI работают корректно.
      </p>
    </div>
  )
}
