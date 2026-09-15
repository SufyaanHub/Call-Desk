import { CallEventManager } from "../src/calls/callEventManager";
import { UNKNOWN_CALLER } from "../src/calls/callState";
import {
  PhoneConnectionStatus,
  derivePhoneConnectionStatus,
  phoneConnectionStatusLabel,
} from "../src/pairing/phoneConnectionStatus";
import {
  buildPhoneCallViewModel,
  callHistoryCommandMessage,
  currentCallCommandMessage,
  formatCallWhen,
  formatRecentCallDescription,
} from "../src/sidebar/phoneCallViewModel";
import { callDeskStatusBarText } from "../src/sidebar/statusBarPresentation";
import { CALL_STATE_TYPE, type CallStateEvent } from "../src/websocket/protocol";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function ringingEvent(): CallStateEvent {
  return {
    type: CALL_STATE_TYPE,
    state: "RINGING",
    callerName: "Shoaib Plumber DX",
    phoneNumber: "+919450214263",
    timestamp: "2026-09-05T21:30:00.000Z",
  };
}

function main(): void {
  assert(
    derivePhoneConnectionStatus({
      phonePaired: true,
      hasPersistedPairing: true,
      restoreInProgress: false,
      connectionState: "CONNECTED",
    }) === PhoneConnectionStatus.CONNECTED,
    "paired + connected is Connected",
  );
  assert(
    derivePhoneConnectionStatus({
      phonePaired: true,
      hasPersistedPairing: true,
      restoreInProgress: false,
      connectionState: "RECONNECTING",
    }) === PhoneConnectionStatus.RECONNECTING,
    "backend reconnect does not drop to disconnected",
  );
  assert(
    derivePhoneConnectionStatus({
      phonePaired: true,
      hasPersistedPairing: true,
      restoreInProgress: false,
      connectionState: "DISCONNECTED",
    }) === PhoneConnectionStatus.RECONNECTING,
    "socket down with persisted pairing is reconnecting",
  );
  assert(
    derivePhoneConnectionStatus({
      phonePaired: false,
      hasPersistedPairing: false,
      restoreInProgress: false,
      connectionState: "CONNECTED",
    }) === PhoneConnectionStatus.DISCONNECTED,
    "backend up without phone is Disconnected",
  );
  assert(
    derivePhoneConnectionStatus({
      phonePaired: false,
      hasPersistedPairing: false,
      restoreInProgress: false,
      connectionState: "CONNECTING",
    }) === PhoneConnectionStatus.DISCONNECTED,
    "initial connecting without pairing is Disconnected",
  );
  assert(phoneConnectionStatusLabel("connected") === "Connected", "connected label");
  assert(phoneConnectionStatusLabel("reconnecting") === "Connecting...", "reconnecting label");
  assert(phoneConnectionStatusLabel("disconnected") === "Disconnected", "disconnected label");

  const calls = new CallEventManager();
  let changeCount = 0;
  const unsubscribe = calls.onDidChange(() => {
    changeCount += 1;
  });
  const empty = buildPhoneCallViewModel({
    phoneConnectionStatus: PhoneConnectionStatus.DISCONNECTED,
    currentCall: calls.currentCall,
    history: calls.history,
  });
  assert(empty.statusLabel === "Disconnected", "empty model uses pairing status");
  assert(empty.statusDetail === "Pair your phone to continue.", "empty model disconnected detail");
  assert(empty.currentCall === null, "no current call before RINGING");
  assert(empty.recentCalls.length === 0, "no history before calls");
  assert(currentCallCommandMessage(empty) === "No active call", "show current call empty");
  assert(callHistoryCommandMessage(empty) === "No recent calls", "show history empty");

  calls.handle(ringingEvent());
  assert(changeCount === 1, "call manager notifies listeners without a second state store");
  const incoming = buildPhoneCallViewModel({
    phoneConnectionStatus: PhoneConnectionStatus.CONNECTED,
    currentCall: calls.currentCall,
    history: calls.history,
  });
  assert(incoming.statusLabel === "Connected", "status comes from pairing, not the call");
  assert(incoming.statusDetail === "", "connected detail");
  assert(incoming.currentCall?.title === "Incoming Call", "current call title");
  assert(incoming.currentCall?.displayName === "Shoaib Plumber DX", "current call name");
  assert(incoming.currentCall?.phoneNumber === "+919450214263", "current call number");
  assert(incoming.currentCall?.statusLabel === "Ringing", "current call status");
  assert(incoming.recentCalls.length === 0, "RINGING is not history");

  calls.handle({
    ...ringingEvent(),
    state: "OFFHOOK",
    timestamp: "2026-09-05T21:30:05.000Z",
  });
  const active = buildPhoneCallViewModel({
    phoneConnectionStatus: PhoneConnectionStatus.CONNECTED,
    currentCall: calls.currentCall,
    history: calls.history,
  });
  assert(active.currentCall?.title === "Call in Progress", "OFFHOOK title");
  assert(active.currentCall?.statusLabel === "In Progress", "OFFHOOK status");

  calls.handle({
    ...ringingEvent(),
    state: "IDLE",
    timestamp: "2026-09-05T21:31:00.000Z",
  });
  const completed = buildPhoneCallViewModel({
    phoneConnectionStatus: PhoneConnectionStatus.RECONNECTING,
    currentCall: calls.currentCall,
    history: calls.history,
  });
  assert(completed.currentCall === null, "IDLE clears current call in the existing manager");
  assert(completed.statusLabel === "Connecting...", "reconnect status is independent of call end");
  assert(completed.recentCalls.length === 1, "completed call is in history");
  assert(completed.recentCalls[0]?.displayName === "Shoaib Plumber DX", "history name");
  assert(completed.recentCalls[0]?.statusLabel === "Completed", "history completed label");
  assert(callHistoryCommandMessage(completed).includes("Completed"), "history command lists completed");
  assert(
    formatRecentCallDescription(completed.recentCalls[0]!).startsWith("Completed · "),
    "history description includes completed and time",
  );
  assert(callDeskStatusBarText("connected") === "$(circle-filled) Call Desk: Connected", "status bar connected");
  assert(callDeskStatusBarText("disconnected") === "$(circle-outline) Call Desk: Disconnected", "status bar disconnected");
  assert(callDeskStatusBarText("reconnecting") === "$(sync) Call Desk: Connecting...", "status bar reconnecting is connecting");
  const noon = Date.parse("2026-09-15T12:00:00");
  assert(formatCallWhen("2026-09-15T06:52:00.000Z", noon).startsWith("Today"), "same-day call uses Today");

  const missedManager = new CallEventManager();
  missedManager.handle({
    type: CALL_STATE_TYPE,
    state: "RINGING",
    callerName: null,
    phoneNumber: null,
    timestamp: "2026-09-05T21:30:00.000Z",
  });
  missedManager.handle({
    type: CALL_STATE_TYPE,
    state: "IDLE",
    callerName: null,
    phoneNumber: null,
    timestamp: "2026-09-05T21:30:20.000Z",
  });
  const missed = buildPhoneCallViewModel({
    phoneConnectionStatus: PhoneConnectionStatus.CONNECTED,
    currentCall: missedManager.currentCall,
    history: missedManager.history,
  });
  assert(missed.recentCalls[0]?.displayName === UNKNOWN_CALLER, "unknown caller in history");
  assert(missed.recentCalls[0]?.statusLabel === "Missed", "missed history label");

  unsubscribe();
  calls.handle(ringingEvent());
  assert(changeCount === 3, "disposed listener is not notified");

  console.log("sidebar view model checks passed");
}

main();
