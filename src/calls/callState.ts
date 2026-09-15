import type { CallState, CallStateEvent } from "../websocket/protocol";

export type { CallState, CallStateEvent };

export const UNKNOWN_CALLER = "Unknown Caller";

export type CallHistoryStatus = "MISSED" | "COMPLETED";

export type CallUiKind = "incoming" | "in_progress" | "ended" | "missed";

export interface ActiveCall {
  callerName: string | null;
  phoneNumber: string | null;
  startedAt: string;
  sawRinging: boolean;
  sawOffhook: boolean;
  lastState: CallState;
}

export interface CallHistoryItem {
  callerName: string | null;
  phoneNumber: string | null;
  status: CallHistoryStatus;
  startTime: string;
  endTime: string | null;
}

export interface CallPresentation {
  kind: CallUiKind;
  emoji: string;
  title: string;
  statusLabel: string;
  displayName: string;
  phoneNumber: string | null;
}

export function normalizeCallerField(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function displayCaller(callerName: string | null, phoneNumber: string | null): string {
  return callerName ?? phoneNumber ?? UNKNOWN_CALLER;
}

export function presentationForActiveCall(call: ActiveCall): CallPresentation {
  if (call.lastState === "RINGING") {
    return presentationForKind("incoming", call.callerName, call.phoneNumber);
  }

  return presentationForKind("in_progress", call.callerName, call.phoneNumber);
}

export function presentationForKind(
  kind: CallUiKind,
  callerName: string | null,
  phoneNumber: string | null,
): CallPresentation {
  const displayName = displayCaller(callerName, phoneNumber);

  switch (kind) {
    case "incoming":
      return {
        kind,
        emoji: "📞",
        title: "Incoming Call",
        statusLabel: "Ringing",
        displayName,
        phoneNumber,
      };
    case "in_progress":
      return {
        kind,
        emoji: "📞",
        title: "Call in Progress",
        statusLabel: "In Progress",
        displayName,
        phoneNumber,
      };
    case "ended":
      return {
        kind,
        emoji: "📞",
        title: "Call Ended",
        statusLabel: "Ended",
        displayName,
        phoneNumber,
      };
    case "missed":
      return {
        kind,
        emoji: "📵",
        title: "Missed Call",
        statusLabel: "Missed",
        displayName,
        phoneNumber,
      };
  }
}
