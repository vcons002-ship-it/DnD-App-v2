import { Component, type ReactNode } from 'react';

/**
 * Catches render-time exceptions so a single bad bit of state (e.g. a stale
 * active-turn pointer to a token on another map) shows a readable error instead
 * of a blank white screen — which is otherwise almost impossible to diagnose.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface it in the console for debugging too.
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-screen">
          <h2>Something went wrong rendering this view.</h2>
          <p className="muted">
            This is usually a one-off data hiccup. Reloading almost always fixes it.
          </p>
          <pre className="error-detail">{String(this.state.error.message || this.state.error)}</pre>
          <button className="btn big" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
