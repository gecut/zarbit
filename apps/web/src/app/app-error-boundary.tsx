import { Component, type ReactNode } from "react";
import { AppErrorFallback } from "./app-error-fallback";

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <AppErrorFallback /> : this.props.children;
  }
}
