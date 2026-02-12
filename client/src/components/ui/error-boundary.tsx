import * as React from "react";
import { ErrorState } from "./error-state";

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((props: { error: Error; reset: () => void }) => React.ReactNode);
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return typeof this.props.fallback === "function"
        ? this.props.fallback({ error, reset: this.reset })
        : this.props.fallback;
    }

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <ErrorState
          heading="Something went wrong"
          description={error.message}
          onRetry={this.reset}
        />
      </div>
    );
  }
}
