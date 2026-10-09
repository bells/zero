import { Component, type ErrorInfo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  pluginId: string;
  children: ReactNode;
  fallback: ReactNode;
}

export class DiagnosticBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    void invoke("emit_frontend_diagnostic", {
      input: {
        pluginId: this.props.pluginId,
        event: { level: "error", code: "ui.render_failed", phase: "ui", outcome: "failed" },
      },
    }).catch(() => undefined);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
