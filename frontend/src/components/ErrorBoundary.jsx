import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <h2 className="font-display text-2xl font-bold text-text mb-4">Something went wrong</h2>
          <p className="text-sm text-muted mb-6 max-w-md">
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            type="button"
            className="px-5 py-3 rounded-xl border border-primary/20 text-primary text-sm font-semibold hover:bg-primary/10 transition"
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
export default ErrorBoundary;
