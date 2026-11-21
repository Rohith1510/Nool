// Adapted from Hairline UI tool-call, MIT License.
// Copyright (c) 2026 Hairline UI https://hairlineui.com/license#components
import { Check, ChevronDown, CircleAlert, Loader2, Wrench } from "lucide-react";
import type { ReactNode } from "react";
export type ToolCallStatus = "running" | "done" | "error";
export function ToolCall({
  title,
  status,
  children,
  statusLabel,
}: {
  title: string;
  status: ToolCallStatus;
  children?: ReactNode;
  statusLabel?: string;
}) {
  const Icon =
    status === "running" ? Loader2 : status === "done" ? Check : CircleAlert;
  return (
    <details className={`agent-tool agent-tool-${status}`}>
      <summary>
        <Wrench size={15} aria-hidden="true" />
        <span className="agent-tool-title">{title}</span>
        <span className="agent-tool-status">
          <Icon
            size={14}
            aria-hidden="true"
            className={status === "running" ? "spin" : undefined}
          />
          {statusLabel ??
            (status === "running"
              ? "Running"
              : status === "done"
                ? "Completed"
                : "Failed")}
        </span>
        <ChevronDown
          size={14}
          className="agent-tool-chevron"
          aria-hidden="true"
        />
      </summary>
      <div className="agent-tool-body">
        {children ??
          (status === "running"
            ? "Checking the current order and shared resource records."
            : status === "done"
              ? "The backend returned a result. Review the resulting plan in the workspace."
              : "The check did not complete. Reconnect or use the order controls.")}
      </div>
    </details>
  );
}
