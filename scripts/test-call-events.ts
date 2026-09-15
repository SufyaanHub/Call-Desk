import { CallEventManager } from "../src/calls/callEventManager";
import { MAX_CALL_HISTORY } from "../src/calls/callHistory";
import { formatCallNotification } from "../src/calls/callNotifications";
import { UNKNOWN_CALLER } from "../src/calls/callState";
import {
  CALL_STATE_TYPE,
  isCallStateMessage,
  parseCallStateEvent,
  parseIncomingMessage,
  type CallState,
  type CallStateEvent,
} from "../src/websocket/protocol";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function event(
  state: CallState,
  overrides: Partial<Omit<CallStateEvent, "type" | "state">> = {},
): CallStateEvent {
  return {
    type: CALL_STATE_TYPE,
    state,
    callerName: "Shoaib Plumber DX",
    phoneNumber: "+919450214263",
    timestamp: overrides.timestamp ?? "2026-09-05T21:30:00.000Z",
    ...overrides,
  };
}

function ingestUnknownOrInvalid(raw: unknown): "invalid" | "ignored" | CallStateEvent {
  const parsed = parseIncomingMessage(raw);
  if (parsed === null) {
    return "invalid";
  }

  if (parsed.type !== CALL_STATE_TYPE) {
    return "ignored";
  }

  const callState = parseCallStateEvent(parsed);
  if (callState === null) {
    return "invalid";
  }

  return callState;
}

function main(): void {
  const ringing = new CallEventManager();
  const incoming = ringing.handle(event("RINGING"));
  assert(incoming !== null, "1. RINGING should create an incoming call");
  assert(incoming.kind === "incoming", "1. RINGING presentation should be incoming");
  assert(incoming.title === "Incoming Call", "1. RINGING title");
  assert(incoming.statusLabel === "Ringing", "1. RINGING status");
  assert(incoming.displayName === "Shoaib Plumber DX", "1. RINGING caller name");
  assert(ringing.currentCall?.lastState === "RINGING", "1. current call should be RINGING");

  const answered = new CallEventManager();
  answered.handle(event("RINGING"));
  const inProgress = answered.handle(event("OFFHOOK", { timestamp: "2026-09-05T21:30:05.000Z" }));
  assert(inProgress !== null, "2. RINGING → OFFHOOK should become active");
  assert(inProgress.kind === "in_progress", "2. OFFHOOK presentation");
  assert(inProgress.title === "Call in Progress", "2. in progress title");
  assert(answered.currentCall?.sawOffhook === true, "2. current call saw OFFHOOK");

  const completed = new CallEventManager();
  completed.handle(event("RINGING"));
  completed.handle(event("OFFHOOK", { timestamp: "2026-09-05T21:30:05.000Z" }));
  const ended = completed.handle(event("IDLE", { timestamp: "2026-09-05T21:31:00.000Z" }));
  assert(ended !== null, "3. OFFHOOK → IDLE should complete");
  assert(ended.kind === "ended", "3. ended presentation");
  assert(ended.statusLabel === "Ended", "3. ended status");
  assert(formatCallNotification(ended) === "Call with Shoaib Plumber DX ended", "3. ended notification copy");
  assert(completed.currentCall === null, "3. no current call after IDLE");
  assert(completed.history.length === 1, "3. history has one item");
  assert(completed.history[0]?.status === "COMPLETED", "3. history status COMPLETED");
  assert(completed.history[0]?.endTime === "2026-09-05T21:31:00.000Z", "3. end time recorded");

  const missed = new CallEventManager();
  missed.handle(event("RINGING"));
  const missedPresentation = missed.handle(event("IDLE", { timestamp: "2026-09-05T21:30:20.000Z" }));
  assert(missedPresentation !== null, "4. RINGING → IDLE should be missed");
  assert(missedPresentation.kind === "missed", "4. missed presentation");
  assert(missedPresentation.emoji === "📵", "4. missed emoji");
  assert(formatCallNotification(missedPresentation) === "Missed call from Shoaib Plumber DX", "4. missed notification copy");
  assert(missed.history[0]?.status === "MISSED", "4. history status MISSED");

  const duplicate = new CallEventManager();
  const firstRing = duplicate.handle(event("RINGING"));
  const secondRing = duplicate.handle(event("RINGING", { timestamp: "2026-09-05T21:30:01.000Z" }));
  assert(firstRing !== null, "5. first RINGING notifies");
  assert(secondRing === null, "5. duplicate RINGING does not notify");
  assert(duplicate.currentCall !== null, "5. still one current call");
  assert(duplicate.history.length === 0, "5. duplicate RINGING is not a new history item");

  const idleOnly = new CallEventManager();
  const ignoredIdle = idleOnly.handle(event("IDLE"));
  assert(ignoredIdle === null, "6. IDLE without active call is ignored");
  assert(idleOnly.history.length === 0, "6. ignored IDLE does not write history");

  const noName = new CallEventManager();
  const noNamePresentation = noName.handle(event("RINGING", { callerName: null }));
  assert(noNamePresentation?.displayName === "+919450214263", "7. missing caller name uses phone number");

  const noNumber = new CallEventManager();
  const noNumberPresentation = noNumber.handle(event("RINGING", { phoneNumber: null }));
  assert(noNumberPresentation?.displayName === "Shoaib Plumber DX", "8. missing phone number uses caller name");
  assert(
    formatCallNotification(noNumberPresentation!).includes("+919450214263") === false,
    "8. notification should not invent a phone number",
  );
  assert(
    formatCallNotification(noNumberPresentation!) === "Incoming call from Shoaib Plumber DX",
    "8. incoming notification copy",
  );

  const unknown = new CallEventManager();
  const unknownPresentation = unknown.handle(event("RINGING", { callerName: null, phoneNumber: null }));
  assert(unknownPresentation?.displayName === UNKNOWN_CALLER, "9. no caller information shows Unknown Caller");

  const capped = new CallEventManager();
  for (let index = 0; index < MAX_CALL_HISTORY + 3; index += 1) {
    capped.handle(
      event("RINGING", {
        timestamp: `2026-09-05T21:30:${String(index).padStart(2, "0")}.000Z`,
      }),
    );
    capped.handle(
      event("IDLE", {
        timestamp: `2026-09-05T21:31:${String(index).padStart(2, "0")}.000Z`,
      }),
    );
  }
  assert(capped.history.length === MAX_CALL_HISTORY, "10. history is capped at 20");
  assert(capped.history[0]?.endTime === "2026-09-05T21:31:22.000Z", "10. newest call is first");
  assert(capped.history[19]?.endTime === "2026-09-05T21:31:03.000Z", "10. oldest retained call is the 20th newest");

  assert(parseCallStateEvent({ type: CALL_STATE_TYPE, state: "BUSY", timestamp: "2026-09-05T21:30:00.000Z" }) === null, "11. invalid state is rejected");
  assert(parseCallStateEvent({ type: CALL_STATE_TYPE, timestamp: "2026-09-05T21:30:00.000Z" }) === null, "11. missing state is rejected");
  assert(
    parseCallStateEvent({
      type: CALL_STATE_TYPE,
      state: "RINGING",
      phoneNumber: 12345,
      timestamp: "2026-09-05T21:30:00.000Z",
    }) === null,
    "11. non-string phoneNumber is rejected",
  );
  assert(isCallStateMessage({ type: CALL_STATE_TYPE, state: "RINGING", timestamp: "not-a-date" }) === false, "11. invalid CALL_STATE is not accepted");

  assert(ingestUnknownOrInvalid({ type: "SOMETHING_ELSE" }) === "ignored", "12. unknown message type is ignored");
  assert(ingestUnknownOrInvalid({ type: "PAIR_SUCCESS" }) === "ignored", "12. pairing messages are ignored by call ingest");

  assert(parseCallStateEvent({ type: CALL_STATE_TYPE, state: "RINGING", timestamp: "not-a-date" }) === null, "13. malformed timestamp is rejected");
  assert(parseCallStateEvent({ type: CALL_STATE_TYPE, state: "RINGING", timestamp: "" }) === null, "13. empty timestamp is rejected");
  assert(parseIncomingMessage("not-json-object") === null, "13. non-object payload is invalid");

  const disconnected = new CallEventManager();
  disconnected.handle(event("RINGING"));
  assert(disconnected.currentCall?.lastState === "RINGING", "14. active call survives with no fake IDLE");
  assert(disconnected.history.length === 0, "14. disconnect must not write call history");
  disconnected.clearActiveCall();
  assert(disconnected.currentCall === null, "14. disconnect clears stale active call");
  assert(disconnected.history.length === 0, "14. disconnect does not write fake call history");
  const afterReconnect = disconnected.handle(event("OFFHOOK", { timestamp: "2026-09-05T21:30:10.000Z" }));
  assert(afterReconnect?.kind === "in_progress", "14. a new OFFHOOK after reconnect starts a new call");

  const outgoing = new CallEventManager();
  const outgoingActive = outgoing.handle(event("OFFHOOK"));
  const outgoingEnded = outgoing.handle(event("IDLE", { timestamp: "2026-09-05T21:32:00.000Z" }));
  assert(outgoingActive?.kind === "in_progress", "C. OFFHOOK without RINGING is in progress");
  assert(outgoingEnded?.kind === "ended", "C. OFFHOOK → IDLE is completed");
  assert(outgoing.history[0]?.status === "COMPLETED", "C. outgoing/active call is COMPLETED");

  console.log("call event unit checks passed");
}

main();
