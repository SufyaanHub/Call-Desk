import {
  PhoneConnectionStatus,
  derivePhoneConnectionStatus,
  phoneConnectionStatusLabel,
} from "../src/pairing/phoneConnectionStatus";
import {
  PAIRING_ID_SECRET_KEY,
  clearPersistedPairingId,
  loadPersistedPairingId,
  reconnectVscodeMessage,
  savePersistedPairingId,
  shouldClearPersistedPairing,
  shouldCreatePairingOnConnect,
  shouldPreservePersistedPairingOnAndroidDisconnect,
  type SecretStore,
} from "../src/pairing/pairingRestore";
import { buildPhoneCallViewModel } from "../src/sidebar/phoneCallViewModel";
import { RECONNECT_VSCODE_TYPE } from "../src/websocket/protocol";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

async function run(): Promise<void> {
  const emptySecrets = new MemorySecretStore();
  assert((await loadPersistedPairingId(emptySecrets)) === null, "1. first startup has no pairingId");
  assert(shouldCreatePairingOnConnect(null) === true, "1. no pairingId requires pairing");
  assert(
    derivePhoneConnectionStatus({
      phonePaired: false,
      hasPersistedPairing: false,
      restoreInProgress: false,
      connectionState: "DISCONNECTED",
    }) === PhoneConnectionStatus.DISCONNECTED,
    "1. first startup is disconnected",
  );

  const secrets = new MemorySecretStore();
  await savePersistedPairingId(secrets, "pairing-123");
  assert((await secrets.get(PAIRING_ID_SECRET_KEY)) === "pairing-123", "2. first pairing stores pairingId");
  assert((await loadPersistedPairingId(secrets)) === "pairing-123", "2. stored pairingId can be read");

  const reloaded = new MemorySecretStore();
  await savePersistedPairingId(reloaded, "pairing-123");
  const restored = await loadPersistedPairingId(reloaded);
  assert(restored === "pairing-123", "3. reload restores pairingId");

  assert(shouldCreatePairingOnConnect(restored) === false, "4. reload with pairingId does not CREATE_PAIRING");
  assert(reconnectVscodeMessage(null) === null, "4. no pairingId means no reconnect payload");

  const reconnect = reconnectVscodeMessage(restored);
  assert(reconnect !== null, "5. reload sends RECONNECT_VSCODE");
  assert(reconnect.type === RECONNECT_VSCODE_TYPE, "5. reconnect type is RECONNECT_VSCODE");
  assert(reconnect.pairingId === "pairing-123", "5. reconnect uses restored pairingId");

  assert(
    derivePhoneConnectionStatus({
      phonePaired: true,
      hasPersistedPairing: true,
      restoreInProgress: false,
      connectionState: "CONNECTED",
    }) === PhoneConnectionStatus.CONNECTED,
    "6. backend confirmation is Connected",
  );
  assert(phoneConnectionStatusLabel("connected") === "Connected", "6. connected label");

  assert(shouldPreservePersistedPairingOnAndroidDisconnect() === true, "7. android drop keeps pairingId");
  assert(
    shouldClearPersistedPairing({
      explicitUnpair: false,
      explicitRepair: false,
      pairingRevoked: false,
    }) === false,
    "7. temporary disconnect does not clear pairingId",
  );
  const afterAndroidDrop = derivePhoneConnectionStatus({
    phonePaired: false,
    hasPersistedPairing: true,
    restoreInProgress: false,
    connectionState: "CONNECTED",
  });
  assert(afterAndroidDrop === PhoneConnectionStatus.WAITING_FOR_PHONE, "7. android offline is waiting for phone");
  assert((await loadPersistedPairingId(reloaded)) === "pairing-123", "7. pairingId still stored");

  assert(
    derivePhoneConnectionStatus({
      phonePaired: true,
      hasPersistedPairing: true,
      restoreInProgress: false,
      connectionState: "CONNECTED",
    }) === PhoneConnectionStatus.CONNECTED,
    "8. android reconnect is Connected",
  );

  assert(
    shouldClearPersistedPairing({
      explicitUnpair: true,
      explicitRepair: false,
      pairingRevoked: false,
    }) === true,
    "9. explicit unpair clears pairingId",
  );
  await clearPersistedPairingId(reloaded);
  assert((await loadPersistedPairingId(reloaded)) === null, "9. pairingId removed after unpair");

  await savePersistedPairingId(secrets, "old-pairing");
  assert(
    shouldClearPersistedPairing({
      explicitUnpair: false,
      explicitRepair: true,
      pairingRevoked: false,
    }) === true,
    "10. generate new QR / re-pair clears old pairingId",
  );
  await clearPersistedPairingId(secrets);
  await savePersistedPairingId(secrets, "new-pairing");
  assert((await loadPersistedPairingId(secrets)) === "new-pairing", "10. re-pair stores replacement pairingId");
  assert(shouldCreatePairingOnConnect("new-pairing") === false, "10. replacement pairing does not auto CREATE_PAIRING");

  assert(
    shouldClearPersistedPairing({
      explicitUnpair: false,
      explicitRepair: false,
      pairingRevoked: true,
    }) === true,
    "11. revoked pairing clears pairingId",
  );
  await clearPersistedPairingId(secrets);
  assert(
    derivePhoneConnectionStatus({
      phonePaired: false,
      hasPersistedPairing: false,
      restoreInProgress: false,
      connectionState: "CONNECTED",
    }) === PhoneConnectionStatus.DISCONNECTED,
    "11. revoked pairing returns to pairing-required",
  );

  assert(
    derivePhoneConnectionStatus({
      phonePaired: false,
      hasPersistedPairing: true,
      restoreInProgress: true,
      connectionState: "DISCONNECTED",
    }) === PhoneConnectionStatus.RECONNECTING,
    "12. restore in progress is Reconnecting, not null",
  );
  const restoringTree = buildPhoneCallViewModel({
    phoneConnectionStatus: PhoneConnectionStatus.RECONNECTING,
    currentCall: null,
    history: [],
  });
  assert(restoringTree.statusLabel === "Connecting...", "12. tree uses restored reconnecting state");
  const waitingTree = buildPhoneCallViewModel({
    phoneConnectionStatus: PhoneConnectionStatus.WAITING_FOR_PHONE,
    currentCall: null,
    history: [],
  });
  assert(waitingTree.statusLabel === "Connecting...", "12. tree uses waiting-for-phone state");
  const connectedTree = buildPhoneCallViewModel({
    phoneConnectionStatus: PhoneConnectionStatus.CONNECTED,
    currentCall: null,
    history: [],
  });
  assert(connectedTree.statusLabel === "Connected", "12. tree uses restored paired state");

  assert(phoneConnectionStatusLabel("waitingForPhone") === "Connecting...", "waiting label");
  assert(
    derivePhoneConnectionStatus({
      phonePaired: false,
      hasPersistedPairing: false,
      restoreInProgress: false,
      connectionState: "CONNECTED",
    }) === PhoneConnectionStatus.DISCONNECTED,
    "backend up without pairing stays disconnected",
  );

  console.log("pairing restore checks passed");
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
