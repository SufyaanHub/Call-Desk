import type { ConnectionState } from "../websocket/backendWebSocketClient";

export const PhoneConnectionStatus = {
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  WAITING_FOR_PHONE: "waitingForPhone",
  DISCONNECTED: "disconnected",
} as const;

export type PhoneConnectionStatus = (typeof PhoneConnectionStatus)[keyof typeof PhoneConnectionStatus];

export interface PhoneConnectionStatusInput {
  phonePaired: boolean;
  hasPersistedPairing: boolean;
  restoreInProgress: boolean;
  connectionState: ConnectionState;
}

export function derivePhoneConnectionStatus(input: PhoneConnectionStatusInput): PhoneConnectionStatus {
  if (input.phonePaired && input.connectionState === "CONNECTED") {
    return PhoneConnectionStatus.CONNECTED;
  }

  if (input.restoreInProgress || input.connectionState === "CONNECTING" || input.connectionState === "RECONNECTING") {
    if (input.hasPersistedPairing || input.restoreInProgress) {
      return PhoneConnectionStatus.RECONNECTING;
    }
  }

  if (input.hasPersistedPairing) {
    if (input.connectionState === "CONNECTED") {
      return PhoneConnectionStatus.WAITING_FOR_PHONE;
    }

    return PhoneConnectionStatus.RECONNECTING;
  }

  return PhoneConnectionStatus.DISCONNECTED;
}

export function phoneConnectionStatusLabel(status: PhoneConnectionStatus): string {
  switch (status) {
    case PhoneConnectionStatus.CONNECTED:
      return "Connected";
    case PhoneConnectionStatus.RECONNECTING:
    case PhoneConnectionStatus.WAITING_FOR_PHONE:
      return "Connecting...";
    case PhoneConnectionStatus.DISCONNECTED:
      return "Disconnected";
  }
}
