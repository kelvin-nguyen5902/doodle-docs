import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in editor:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 52, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Something went wrong.</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            The page hit an unexpected error and couldn't continue. Your work up to the last autosave is safe.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "9px 16px", border: "none", borderRadius: 8, background: "var(--ac)", color: "var(--card)", fontSize: 13, cursor: "pointer" }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
