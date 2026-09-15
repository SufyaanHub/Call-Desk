import type { CallEventManager } from "../calls/callEventManager";
import { displayCaller, presentationForActiveCall } from "../calls/callState";
import type { PhoneConnectionStatus } from "../pairing/phoneConnectionStatus";
import { phoneConnectionStatusLabel } from "../pairing/phoneConnectionStatus";

export interface CurrentCallViewModel {
  title: string;
  displayName: string;
  phoneNumber: string | null;
  statusLabel: string;
  startedAt: string;
}

export interface RecentCallViewModel {
  displayName: string;
  phoneNumber: string | null;
  statusLabel: "Completed" | "Missed";
  startTime: string;
  endTime: string | null;
}

export interface PhoneCallViewModel {
  status: PhoneConnectionStatus;
  statusLabel: string;
  statusDetail: string;
  currentCall: CurrentCallViewModel | null;
  recentCalls: readonly RecentCallViewModel[];
}

export interface PhoneCallViewSources {
  phoneConnectionStatus: PhoneConnectionStatus;
  currentCall: CallEventManager["currentCall"];
  history: CallEventManager["history"];
}

export function buildPhoneCallViewModel(sources: PhoneCallViewSources): PhoneCallViewModel {
  const status = sources.phoneConnectionStatus;
  return {
    status,
    statusLabel: phoneConnectionStatusLabel(status),
    statusDetail: phoneConnectionStatusDetail(status),
    currentCall: sources.currentCall === null ? null : toCurrentCallView(sources.currentCall),
    recentCalls: sources.history.map((item) => ({
      displayName: displayCaller(item.callerName, item.phoneNumber),
      phoneNumber: item.phoneNumber,
      statusLabel: item.status === "MISSED" ? "Missed" : "Completed",
      startTime: item.startTime,
      endTime: item.endTime,
    })),
  };
}

export function phoneConnectionStatusDetail(status: PhoneConnectionStatus): string {
  switch (status) {
    case "connected":
      return "";
    case "disconnected":
      return "Pair your phone to continue.";
    case "reconnecting":
      return "Connection lost. Reconnecting...";
    case "waitingForPhone":
      return "Waiting for the paired phone.";
  }
}

export function formatCallWhen(isoTimestamp: string, nowMillis: number = Date.now()): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const dayDiff = Math.round((startOfDay(nowMillis) - startOfDay(date.getTime())) / 86_400_000);
  if (dayDiff === 0) {
    return `Today ${time}`;
  }
  if (dayDiff === 1) {
    return `Yesterday ${time}`;
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
  return `${dateLabel} ${time}`;
}

export function formatRecentCallDescription(call: RecentCallViewModel, nowMillis: number = Date.now()): string {
  const when = formatCallWhen(call.endTime ?? call.startTime, nowMillis);
  return when === "" ? call.statusLabel : `${call.statusLabel} · ${when}`;
}

function startOfDay(millis: number): number {
  const date = new Date(millis);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatCurrentCallTooltip(call: CurrentCallViewModel): string {
  const lines = [
    call.title,
    `Caller: ${call.displayName}`,
  ];
  if (call.phoneNumber !== null && call.phoneNumber !== call.displayName) {
    lines.push(`Number: ${call.phoneNumber}`);
  }
  lines.push(`Status: ${call.statusLabel}`);
  lines.push(`Started: ${call.startedAt}`);
  return lines.join("\n");
}

export function formatRecentCallTooltip(call: RecentCallViewModel): string {
  const lines = [
    `Caller: ${call.displayName}`,
  ];
  if (call.phoneNumber !== null && call.phoneNumber !== call.displayName) {
    lines.push(`Number: ${call.phoneNumber}`);
  }
  lines.push(`Status: ${call.statusLabel}`);
  lines.push(`Started: ${call.startTime}`);
  if (call.endTime !== null) {
    lines.push(`Ended: ${call.endTime}`);
  }
  return lines.join("\n");
}

export function currentCallCommandMessage(model: PhoneCallViewModel): string {
  if (model.currentCall === null) {
    return "No active call";
  }

  return formatCurrentCallTooltip(model.currentCall);
}

export function callHistoryCommandMessage(model: PhoneCallViewModel): string {
  if (model.recentCalls.length === 0) {
    return "No recent calls";
  }

  return model.recentCalls
    .map((call) => {
      const title = call.statusLabel === "Missed" ? "Missed Call" : "Completed Call";
      const identity = call.phoneNumber ?? call.displayName;
      return `${title}  ${identity}`;
    })
    .join("\n");
}

function toCurrentCallView(call: NonNullable<CallEventManager["currentCall"]>): CurrentCallViewModel {
  const presentation = presentationForActiveCall(call);
  return {
    title: presentation.title,
    displayName: presentation.displayName,
    phoneNumber: call.phoneNumber,
    statusLabel: presentation.statusLabel,
    startedAt: call.startedAt,
  };
}
