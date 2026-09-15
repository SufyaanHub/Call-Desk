import { RECONNECT_VSCODE_TYPE } from "../websocket/protocol";

export const PAIRING_ID_SECRET_KEY = "phoneCallManager.pairingId";

export interface SecretStore {
  get(key: string): Promise<string | undefined> | Thenable<string | undefined>;
  store(key: string, value: string): Promise<void> | Thenable<void>;
  delete(key: string): Promise<void> | Thenable<void>;
}

export async function loadPersistedPairingId(secrets: SecretStore): Promise<string | null> {
  const stored = await secrets.get(PAIRING_ID_SECRET_KEY);
  const pairingId = stored?.trim() ?? "";
  if (pairingId === "") {
    return null;
  }

  return pairingId;
}

export async function savePersistedPairingId(secrets: SecretStore, pairingId: string): Promise<void> {
  await secrets.store(PAIRING_ID_SECRET_KEY, pairingId);
}

export async function clearPersistedPairingId(secrets: SecretStore): Promise<void> {
  await secrets.delete(PAIRING_ID_SECRET_KEY);
}

export function shouldCreatePairingOnConnect(persistedPairingId: string | null): boolean {
  return persistedPairingId === null;
}

export function reconnectVscodeMessage(
  persistedPairingId: string | null,
): { type: typeof RECONNECT_VSCODE_TYPE; pairingId: string } | null {
  if (persistedPairingId === null || persistedPairingId.trim() === "") {
    return null;
  }

  return {
    type: RECONNECT_VSCODE_TYPE,
    pairingId: persistedPairingId,
  };
}

export function shouldClearPersistedPairing(reason: {
  explicitUnpair: boolean;
  explicitRepair: boolean;
  pairingRevoked: boolean;
}): boolean {
  return reason.explicitUnpair || reason.explicitRepair || reason.pairingRevoked;
}

export function shouldPreservePersistedPairingOnAndroidDisconnect(): boolean {
  return true;
}
