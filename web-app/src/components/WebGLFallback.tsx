export default function WebGLFallback() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 16,
      background: '#1e1e2e', color: '#7f849c',
    }}>
      <span style={{ fontSize: 48 }}>🖥️</span>
      <strong style={{ color: '#cdd6f4', fontSize: 15 }}>WebGL недоступен</strong>
      <p style={{ fontSize: 12, maxWidth: 340, textAlign: 'center', lineHeight: 1.6 }}>
        Это окружение Replit не поддерживает WebGL (headless).
        Откройте приложение в&nbsp;браузере для полной 3D-визуализации.
      </p>
      <p style={{ fontSize: 11, color: '#585b70' }}>
        CSG движок и остальной UI работают корректно.
      </p>
    </div>
  )
}
