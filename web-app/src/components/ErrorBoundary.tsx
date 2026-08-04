import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    // FIX (MED-18-40): Log errors to console so developers can catch them
    console.error('[ErrorBoundary] Caught error:', error)
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="error-screen" style={{ height: '100%', padding: 24 }}>
          <span className="error-icon">⚠️</span>
          <strong className="error-title">Ошибка компонента</strong>
          <code className="error-detail">
            {this.state.error.message}
          </code>
        </div>
      )
    }
    return this.props.children
  }
}
