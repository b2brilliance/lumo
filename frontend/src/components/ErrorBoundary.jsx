import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Generic React error boundary with a Tailwind-styled fallback.
 *
 * Wrap any sub-tree that might crash so the rest of the app stays usable.
 * Optional `onReset` lets the parent route the user somewhere safe (e.g.
 * back to the admin home) instead of just retrying the same broken view.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === "function") this.props.onReset();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const { label = "this section", testid = "error-boundary" } = this.props;
    return (
      <div className="border border-amber-300 bg-amber-50 p-6 text-sm" data-testid={testid}>
        <div className="flex items-center gap-2 text-amber-800 font-semibold">
          <AlertTriangle className="w-4 h-4" />
          Something went wrong loading {label}.
        </div>
        <p className="text-amber-700 mt-2 text-xs leading-relaxed">
          We&apos;ve logged the error. Try retrying — or use the button below to go back somewhere safe.
        </p>
        <div className="mt-4 flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={this.reset}
            className="text-xs font-mono uppercase tracking-wider border border-slate-900 bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800"
            data-testid={`${testid}-retry`}
          >
            Retry
          </button>
          {this.props.onReset && (
            <button
              type="button"
              onClick={this.reset}
              className="text-xs font-mono uppercase tracking-wider border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
              data-testid={`${testid}-safe`}
            >
              Go to {this.props.resetLabel || "safety"}
            </button>
          )}
        </div>
      </div>
    );
  }
}
