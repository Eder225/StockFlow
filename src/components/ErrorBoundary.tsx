import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, padding: 40, textAlign: 'center' }}>
          <AlertTriangle size={48} style={{ color: 'var(--color-danger)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-gray-900)' }}>Une erreur est survenue</h1>
          <p style={{ fontSize: 14, color: 'var(--color-gray-500)', maxWidth: 400 }}>
            {this.state.error?.message || 'Erreur inattendue'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <RefreshCw size={18} /> Recharger l'application
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
