import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Last-resort catch-all around the whole app — without this, any render
 * throw anywhere in the tree (a malformed saved calendar, a corrupted
 * character sheet, anything) takes down the entire window to a blank white
 * screen with no way back short of restarting. "Try again" just clears the
 * error and re-renders the same tree, which is enough when the throw was
 * transient; "Reload" does a full renderer reload for when it isn't.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error('Unhandled render error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          height: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: 'var(--bg-surface, #1e1c18)',
          color: 'var(--text-primary, #e8e3d8)'
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h2>
        <p style={{ margin: 0, maxWidth: 480, fontSize: 13, color: 'var(--text-muted, #9a9385)' }}>{this.state.error.message}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              borderRadius: 6,
              border: '1px solid var(--border-subtle, #4a4436)',
              background: 'var(--bg-surface-raised, #2a271f)',
              color: 'inherit'
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent, #b5883a)',
              color: '#1e1c18',
              fontWeight: 600
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
