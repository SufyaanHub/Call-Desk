import type { PhoneConnectionStatus } from "../pairing/phoneConnectionStatus";

export function callDeskStatusBarText(status: PhoneConnectionStatus): string {
  switch (status) {
    case "connected":
      return "$(circle-filled) Call Desk: Connected";
    case "reconnecting":
    case "waitingForPhone":
      return "$(sync) Call Desk: Connecting...";
    case "disconnected":
      return "$(circle-outline) Call Desk: Disconnected";
  }
}

export function callDeskStatusBarTooltip(status: PhoneConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Phone connected. Click to open Call Desk.";
    case "reconnecting":
    case "waitingForPhone":
      return "Connecting to the phone. Click to open Call Desk.";
    case "disconnected":
      return "Phone is not paired. Click to open Call Desk.";
  }
}
