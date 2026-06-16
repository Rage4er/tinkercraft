import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%',
          color: '#7f849c', gap: 12, padding: 24,
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <strong style={{ color: '#f38ba8' }}>Ошибка компонента</strong>
          <code style={{ fontSize: 11, maxWidth: 400, textAlign: 'center', opacity: 0.7 }}>
            {this.state.error.message}
          </code>
        </div>
      )
    }
    return this.props.children
  }
}
