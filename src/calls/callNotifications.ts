import type * as vscode from "vscode";
import type { CallPresentation } from "./callState";

export function formatCallNotification(presentation: CallPresentation): string {
  const name = presentation.displayName;
  switch (presentation.kind) {
    case "incoming":
      return `Incoming call from ${name}`;
    case "in_progress":
      return `Call in progress with ${name}`;
    case "ended":
      return `Call with ${name} ended`;
    case "missed":
      return `Missed call from ${name}`;
  }
}

export function showCallNotification(
  window: Pick<typeof vscode.window, "showInformationMessage" | "showWarningMessage">,
  presentation: CallPresentation,
): void {
  const message = formatCallNotification(presentation);
  if (presentation.kind === "missed") {
    void window.showWarningMessage(message);
    return;
  }

  void window.showInformationMessage(message);
}
