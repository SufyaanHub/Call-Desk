import type { PhoneConnectionStatus } from "../pairing/phoneConnectionStatus";
import { phoneConnectionStatusLabel } from "../pairing/phoneConnectionStatus";
import type { PhoneCallViewModel } from "./phoneCallViewModel";
import { formatRecentCallDescription } from "./phoneCallViewModel";

export type PhoneCallTreeElement =
  | { kind: "connectionSection" }
  | { kind: "status" }
  | { kind: "onboardingSection" }
  | { kind: "onboardingHint" }
  | { kind: "installAndroid" }
  | { kind: "pairAndroid" }
  | { kind: "currentSection" }
  | { kind: "currentCall" }
  | { kind: "currentCaller" }
  | { kind: "currentStatus" }
  | { kind: "currentEmpty" }
  | { kind: "recentSection" }
  | { kind: "recentEmpty" }
  | { kind: "historyItem"; index: number };

export type TreeItemCollapsible = "none" | "expanded";

export type TreeIconId =
  | "device-mobile"
  | "circle-filled"
  | "circle-outline"
  | "sync"
  | "call-incoming"
  | "call"
  | "plug"
  | "history"
  | "cloud-download";

export interface PhoneCallTreeItemData {
  id: string;
  label: string;
  description: string;
  tooltip: string;
  collapsible: TreeItemCollapsible;
  icon: TreeIconId | undefined;
  iconColor: string | undefined;
  contextValue: string;
  command: string | undefined;
}

export function getRootTreeElements(model: PhoneCallViewModel): PhoneCallTreeElement[] {
  const elements: PhoneCallTreeElement[] = [{ kind: "connectionSection" }];
  if (model.status === "disconnected") {
    elements.push({ kind: "onboardingSection" });
  }
  elements.push({ kind: "currentSection" }, { kind: "recentSection" });
  return elements;
}

export function getTreeChildren(
  element: PhoneCallTreeElement | undefined,
  model: PhoneCallViewModel,
): PhoneCallTreeElement[] {
  if (element === undefined) {
    return getRootTreeElements(model);
  }

  if (element.kind === "connectionSection") {
    return [{ kind: "status" }];
  }

  if (element.kind === "onboardingSection") {
    return [{ kind: "onboardingHint" }, { kind: "installAndroid" }, { kind: "pairAndroid" }];
  }

  if (element.kind === "currentSection") {
    if (model.currentCall === null) {
      return [{ kind: "currentEmpty" }];
    }

    return [{ kind: "currentCall" }, { kind: "currentCaller" }, { kind: "currentStatus" }];
  }

  if (element.kind === "recentSection") {
    if (model.recentCalls.length === 0) {
      return [{ kind: "recentEmpty" }];
    }

    return model.recentCalls.map((_, index) => ({ kind: "historyItem" as const, index }));
  }

  return [];
}

export function treeElementFromContextValue(contextValue: string | undefined): PhoneCallTreeElement | undefined {
  switch (contextValue) {
    case "connectionSection":
      return { kind: "connectionSection" };
    case "phoneDisconnected":
    case "phoneStatus":
      return { kind: "status" };
    case "onboardingSection":
      return { kind: "onboardingSection" };
    case "onboardingHint":
      return { kind: "onboardingHint" };
    case "installAndroid":
      return { kind: "installAndroid" };
    case "pairAndroid":
      return { kind: "pairAndroid" };
    case "currentSection":
      return { kind: "currentSection" };
    case "recentCalls":
      return { kind: "recentSection" };
    case "currentCall":
      return { kind: "currentCall" };
    case "currentCaller":
      return { kind: "currentCaller" };
    case "currentStatus":
      return { kind: "currentStatus" };
    default:
      return undefined;
  }
}

export function getTreeItemData(
  element: PhoneCallTreeElement,
  model: PhoneCallViewModel,
): PhoneCallTreeItemData {
  switch (element.kind) {
    case "connectionSection":
      return sectionItemData("Connection", "connectionSection", "connection-section", "plug");
    case "status":
      return statusItemData(model);
    case "onboardingSection":
      return sectionItemData("Get started", "onboardingSection", "onboarding-section", "device-mobile");
    case "onboardingHint":
      return placeholderItemData("Install the app, then pair", "onboarding-hint");
    case "installAndroid":
      return actionItemData(
        "1. Install Android App",
        "install-android",
        "Download the Call Desk Android app APK.",
        "phoneCallManager.downloadAndroidApp",
        "cloud-download",
      );
    case "pairAndroid":
      return actionItemData(
        "2. Pair Android Phone",
        "pair-android",
        "Open the existing QR pairing flow.",
        "phoneCallManager.connectPhone",
        "device-mobile",
      );
    case "currentSection":
      return sectionItemData("CURRENT CALL", "currentSection", "current-call-section");
    case "recentSection":
      return sectionItemData("RECENT CALLS", "recentCalls", "recent-calls-section");
    case "currentEmpty":
      return placeholderItemData("No active call", "current-call-empty");
    case "recentEmpty":
      return placeholderItemData("No recent calls", "recent-calls-empty");
    case "currentCall":
      return currentCallItemData(model);
    case "currentCaller":
      return currentCallerItemData(model);
    case "currentStatus":
      return currentStatusItemData(model);
    case "historyItem":
      return historyItemData(model, element.index);
  }
}

function statusItemData(model: PhoneCallViewModel): PhoneCallTreeItemData {
  const status = model.status;
  const label = model.statusLabel.trim() === "" ? phoneConnectionStatusLabel(status) : model.statusLabel;
  const connected = status === "connected";
  const disconnected = status === "disconnected";
  const tooltip = model.statusDetail === "" ? label : `${label}\n${model.statusDetail}`;
  return {
    id: "phone-status",
    label,
    description: "",
    tooltip,
    collapsible: "none",
    icon: connected ? "circle-filled" : disconnected ? "circle-outline" : "sync",
    iconColor: connected ? "testing.iconPassed" : disconnected ? "testing.iconFailed" : undefined,
    contextValue: disconnected ? "phoneDisconnected" : "phoneStatus",
    command: disconnected ? "phoneCallManager.connectPhone" : undefined,
  };
}

function sectionItemData(
  label: string,
  contextValue: string,
  id: string,
  icon?: TreeIconId,
): PhoneCallTreeItemData {
  return {
    id,
    label,
    description: "",
    tooltip: label,
    collapsible: "expanded",
    icon,
    iconColor: undefined,
    contextValue,
    command: undefined,
  };
}

function placeholderItemData(label: string, id: string): PhoneCallTreeItemData {
  return {
    id,
    label,
    description: "",
    tooltip: label,
    collapsible: "none",
    icon: undefined,
    iconColor: undefined,
    contextValue: "placeholder",
    command: undefined,
  };
}

function actionItemData(
  label: string,
  id: string,
  tooltip: string,
  command: string,
  icon: TreeIconId,
): PhoneCallTreeItemData {
  return {
    id,
    label,
    description: "",
    tooltip,
    collapsible: "none",
    icon,
    iconColor: undefined,
    contextValue: id,
    command,
  };
}

function currentCallItemData(model: PhoneCallViewModel): PhoneCallTreeItemData {
  if (model.currentCall === null) {
    return placeholderItemData("No active call", "current-call-empty");
  }

  const call = model.currentCall;
  const incoming = call.title === "Incoming Call";
  return {
    id: "current-call",
    label: call.title,
    description: "",
    tooltip: [
      call.title,
      call.displayName,
      ...(call.phoneNumber !== null && call.phoneNumber !== call.displayName ? [call.phoneNumber] : []),
    ].join("\n"),
    collapsible: "none",
    icon: incoming ? "call-incoming" : "call",
    iconColor: incoming ? "charts.blue" : "testing.iconPassed",
    contextValue: "currentCall",
    command: "phoneCallManager.showCurrentCall",
  };
}

function currentCallerItemData(model: PhoneCallViewModel): PhoneCallTreeItemData {
  if (model.currentCall === null) {
    return placeholderItemData("No active call", "current-call-empty");
  }

  const call = model.currentCall;
  const number = call.phoneNumber;
  return {
    id: "current-call-caller",
    label: number ?? call.displayName,
    description: number !== null && number !== call.displayName ? call.displayName : "",
    tooltip: [
      call.displayName,
      ...(number !== null && number !== call.displayName ? [number] : []),
    ].join("\n"),
    collapsible: "none",
    icon: "device-mobile",
    iconColor: undefined,
    contextValue: "currentCaller",
    command: undefined,
  };
}

function currentStatusItemData(model: PhoneCallViewModel): PhoneCallTreeItemData {
  if (model.currentCall === null) {
    return placeholderItemData("No active call", "current-call-empty");
  }

  const call = model.currentCall;
  return {
    id: "current-call-status",
    label: call.statusLabel,
    description: "",
    tooltip: call.statusLabel,
    collapsible: "none",
    icon: undefined,
    iconColor: undefined,
    contextValue: "currentStatus",
    command: undefined,
  };
}

function historyItemData(model: PhoneCallViewModel, index: number): PhoneCallTreeItemData {
  const call = model.recentCalls[index];
  if (call === undefined) {
    return placeholderItemData("No recent calls", "recent-calls-empty");
  }

  const missed = call.statusLabel === "Missed";
  const title = missed ? "Missed Call" : "Completed Call";
  const identity = call.phoneNumber ?? call.displayName;
  return {
    id: `recent-call:${index}:${call.startTime}`,
    label: title,
    description: identity,
    tooltip: [
      title,
      call.displayName,
      formatRecentCallDescription(call),
      ...(call.phoneNumber !== null && call.phoneNumber !== call.displayName ? [call.phoneNumber] : []),
    ].join("\n"),
    collapsible: "none",
    icon: missed ? "call-incoming" : "call",
    iconColor: missed ? "testing.iconFailed" : "testing.iconPassed",
    contextValue: "historyItem",
    command: undefined,
  };
}
