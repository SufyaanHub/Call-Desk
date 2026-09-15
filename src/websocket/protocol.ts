export const CREATE_PAIRING_TYPE = "CREATE_PAIRING";
export const PAIRING_CREATED_TYPE = "PAIRING_CREATED";
export const PAIR_SUCCESS_TYPE = "PAIR_SUCCESS";
export const PAIR_FAILED_TYPE = "PAIR_FAILED";
export const CLIENT_STATUS_TYPE = "CLIENT_STATUS";
export const RECONNECT_VSCODE_TYPE = "RECONNECT_VSCODE";
export const ERROR_TYPE = "ERROR";
export const CALL_STATE_TYPE = "CALL_STATE";

export const CALL_STATES = ["RINGING", "OFFHOOK", "IDLE"] as const;
export type CallState = (typeof CALL_STATES)[number];

export const CLIENT_TYPE_ANDROID = "ANDROID";
export const CLIENT_TYPE_VS_CODE = "VS_CODE";

export const PAIR_FAIL_REASONS = {
  INVALID: "invalid pairing",
  EXPIRED: "pairing expired",
  USED: "pairing already used",
  ALREADY_PAIRED: "already paired",
  INVALID_REQUEST: "invalid request",
} as const;

export interface CreatePairingMessage {
  type: typeof CREATE_PAIRING_TYPE;
}

export interface PairingCreatedMessage {
  type: typeof PAIRING_CREATED_TYPE;
  pairingId: string;
  pairingToken: string;
  expiresAt: string;
}

export interface PairSuccessMessage {
  type: typeof PAIR_SUCCESS_TYPE;
  pairingId?: string;
  clientId?: string;
  paired?: boolean;
  deviceToken?: string;
}

export interface PairFailedMessage {
  type: typeof PAIR_FAILED_TYPE;
  reason: string;
}

export interface ClientStatusMessage {
  type: typeof CLIENT_STATUS_TYPE;
  clientId: string;
  clientType: string;
  pairingId: string | null;
  paired: boolean;
}

export interface BackendErrorMessage {
  type: typeof ERROR_TYPE;
  message: string;
}

export interface CallStateEvent {
  type: typeof CALL_STATE_TYPE;
  state: CallState;
  callerName?: string | null;
  phoneNumber?: string | null;
  timestamp: string;
}

export type IncomingBackendMessage =
  | PairingCreatedMessage
  | PairSuccessMessage
  | PairFailedMessage
  | ClientStatusMessage
  | BackendErrorMessage
  | CallStateEvent
  | { type: string; [key: string]: unknown };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseIncomingMessage(value: unknown): IncomingBackendMessage | null {
  if (!isRecord(value) || typeof value.type !== "string" || value.type.trim() === "") {
    return null;
  }

  return value as IncomingBackendMessage;
}

export function isPairingCreatedMessage(message: IncomingBackendMessage): message is PairingCreatedMessage {
  return (
    message.type === PAIRING_CREATED_TYPE &&
    typeof message.pairingId === "string" &&
    message.pairingId.trim() !== "" &&
    typeof message.pairingToken === "string" &&
    message.pairingToken.trim() !== "" &&
    typeof message.expiresAt === "string" &&
    message.expiresAt.trim() !== ""
  );
}

export function isPairSuccessMessage(message: IncomingBackendMessage): message is PairSuccessMessage {
  return message.type === PAIR_SUCCESS_TYPE;
}

export function isPairFailedMessage(message: IncomingBackendMessage): message is PairFailedMessage {
  return message.type === PAIR_FAILED_TYPE && typeof message.reason === "string";
}

export function isClientStatusMessage(message: IncomingBackendMessage): message is ClientStatusMessage {
  return (
    message.type === CLIENT_STATUS_TYPE &&
    typeof message.paired === "boolean" &&
    typeof message.clientId === "string" &&
    typeof message.clientType === "string" &&
    (message.pairingId === null || typeof message.pairingId === "string")
  );
}

export function isBackendErrorMessage(message: IncomingBackendMessage): message is BackendErrorMessage {
  return message.type === ERROR_TYPE && typeof message.message === "string";
}

export function isCallState(value: unknown): value is CallState {
  return typeof value === "string" && (CALL_STATES as readonly string[]).includes(value);
}

export function isCallStateMessage(value: unknown): value is CallStateEvent {
  return parseCallStateEvent(value) !== null;
}

export function parseCallStateEvent(value: unknown): CallStateEvent | null {
  if (!isRecord(value) || value.type !== CALL_STATE_TYPE) {
    return null;
  }

  if (!isCallState(value.state)) {
    return null;
  }

  if (!isOptionalNullableString(value.callerName) || !isOptionalNullableString(value.phoneNumber)) {
    return null;
  }

  if (typeof value.timestamp !== "string" || value.timestamp.trim() === "") {
    return null;
  }

  if (!Number.isFinite(Date.parse(value.timestamp))) {
    return null;
  }

  return {
    type: CALL_STATE_TYPE,
    state: value.state,
    callerName: value.callerName ?? null,
    phoneNumber: value.phoneNumber ?? null,
    timestamp: value.timestamp,
  };
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}
