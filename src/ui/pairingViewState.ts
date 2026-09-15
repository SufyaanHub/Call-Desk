export type PairingViewState =
  | { kind: "connecting"; status: string }
  | { kind: "waiting"; status: string; qrDataUrl: string; expiresAt: string }
  | { kind: "expired"; status: string }
  | { kind: "failed"; status: string; message: string }
  | { kind: "connected"; status: string }
  | { kind: "phoneDisconnected"; status: string; waitingForReconnect?: boolean }
  | { kind: "disconnected"; status: string; reconnecting: boolean };

export type PairingPanelMessage =
  | { type: "ready" }
  | { type: "generateNewQr" }
  | { type: "retryConnection" }
  | { type: "pairingExpired" };
