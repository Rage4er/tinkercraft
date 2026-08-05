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

  // FIX (LOW-18-38): Add retry button to allow user to recover from error
  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="error-screen" style={{ height: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
          <span className="error-icon">⚠️</span>
          <strong className="error-title">Ошибка компонента</strong>
          <code className="error-detail">
            {this.state.error.message}
          </code>
          <button className="btn primary" onClick={this.handleRetry}>
            ↻ Повторить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
