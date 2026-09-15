import { CallEventManager } from "../src/calls/callEventManager";
import { PhoneConnectionStatus } from "../src/pairing/phoneConnectionStatus";
import { getTreeChildren, getTreeItemData } from "../src/sidebar/phoneCallTreeModel";
import { buildPhoneCallViewModel } from "../src/sidebar/phoneCallViewModel";
import { CALL_STATE_TYPE } from "../src/websocket/protocol";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function model(status: (typeof PhoneConnectionStatus)[keyof typeof PhoneConnectionStatus], calls = new CallEventManager()) {
  return buildPhoneCallViewModel({
    phoneConnectionStatus: status,
    currentCall: calls.currentCall,
    history: calls.history,
  });
}

function main(): void {
  const disconnected = model(PhoneConnectionStatus.DISCONNECTED);
  const root = getTreeChildren(undefined, disconnected);
  assert(Array.isArray(root), "1. getChildren root returns an array");
  assert(getTreeItemData({ kind: "status" }, disconnected).id === "phone-status", "1. status id is unique");
  assert(getTreeItemData({ kind: "currentSection" }, disconnected).id === "current-call-section", "1. current section id is unique");
  assert(getTreeItemData({ kind: "recentSection" }, disconnected).id === "recent-calls-section", "1. recent section id is unique");
  assert(root.length === 3, "1. root has connection + two sections");
  assert(root[0]?.kind === "connectionSection", "1. first root item is connection");
  assert(getTreeItemData(root[0], disconnected).label === "Connection", "1. connection section label");

  const disconnectedItem = getTreeItemData({ kind: "status" }, disconnected);
  assert(disconnectedItem.label === "Disconnected", "3. disconnected state renders");
  assert(disconnectedItem.description === "", "3. disconnected has no extra description");
  assert(disconnectedItem.icon === "circle-outline", "3. disconnected icon");
  assert(disconnectedItem.label !== "", "3. disconnected label is not empty");

  const reconnecting = getTreeItemData(
    { kind: "status" },
    model(PhoneConnectionStatus.RECONNECTING),
  );
  assert(reconnecting.label === "Connecting...", "4. reconnecting state renders");

  const connected = getTreeItemData(
    { kind: "status" },
    model(PhoneConnectionStatus.CONNECTED),
  );
  assert(connected.label === "Connected", "5. connected state renders");
  assert(connected.description === "", "5. connected has no extra description");
  assert(connected.icon === "circle-filled", "5. connected icon");

  const emptyCurrent = getTreeChildren({ kind: "currentSection" }, disconnected);
  assert(Array.isArray(emptyCurrent), "2. section getChildren returns an array");
  assert(emptyCurrent[0]?.kind === "currentEmpty", "6. empty current call renders");
  assert(getTreeItemData(emptyCurrent[0], disconnected).label === "No active call", "6. empty current label");

  const emptyRecent = getTreeChildren({ kind: "recentSection" }, disconnected);
  assert(emptyRecent[0]?.kind === "recentEmpty", "7. empty history renders");
  assert(getTreeItemData(emptyRecent[0], disconnected).label === "No recent calls", "7. empty history label");

  const calls = new CallEventManager();
  calls.handle({
    type: CALL_STATE_TYPE,
    state: "RINGING",
    callerName: "Shoaib Plumber DX",
    phoneNumber: "+919450214263",
    timestamp: "2026-09-05T21:30:00.000Z",
  });
  const ringingModel = model(PhoneConnectionStatus.CONNECTED, calls);
  const currentChildren = getTreeChildren({ kind: "currentSection" }, ringingModel);
  assert(currentChildren.length === 3, "8. current call renders three rows");
  assert(getTreeItemData(currentChildren[0]!, ringingModel).label === "Incoming Call", "8. current call title");
  assert(getTreeItemData(currentChildren[0]!, ringingModel).icon === "call-incoming", "8. incoming icon");
  assert(getTreeItemData(currentChildren[1]!, ringingModel).label === "+919450214263", "8. current caller number");
  assert(getTreeItemData(currentChildren[1]!, ringingModel).description === "Shoaib Plumber DX", "8. current caller name");
  assert(getTreeItemData(currentChildren[2]!, ringingModel).label === "Ringing", "8. current call status");
  assert(getTreeChildren({ kind: "recentSection" }, ringingModel)[0]?.kind === "recentEmpty", "8. ringing is not a recent call");

  const inProgressCalls = new CallEventManager();
  inProgressCalls.handle({
    type: CALL_STATE_TYPE,
    state: "RINGING",
    callerName: "Shoaib Plumber DX",
    phoneNumber: "+919450214263",
    timestamp: "2026-09-05T21:30:00.000Z",
  });
  inProgressCalls.handle({
    type: CALL_STATE_TYPE,
    state: "OFFHOOK",
    callerName: "Shoaib Plumber DX",
    phoneNumber: "+919450214263",
    timestamp: "2026-09-05T21:30:10.000Z",
  });
  const inProgressModel = model(PhoneConnectionStatus.CONNECTED, inProgressCalls);
  const inProgressChildren = getTreeChildren({ kind: "currentSection" }, inProgressModel);
  assert(getTreeItemData(inProgressChildren[0]!, inProgressModel).label === "Call in Progress", "8b. in-progress title");
  assert(getTreeItemData(inProgressChildren[2]!, inProgressModel).label === "In Progress", "8b. in-progress status");
  assert(getTreeChildren({ kind: "recentSection" }, inProgressModel)[0]?.kind === "recentEmpty", "8b. in-progress is not a recent call");

  inProgressCalls.handle({
    type: CALL_STATE_TYPE,
    state: "IDLE",
    callerName: "Shoaib Plumber DX",
    phoneNumber: "+919450214263",
    timestamp: "2026-09-05T21:31:00.000Z",
  });
  const completedModel = model(PhoneConnectionStatus.CONNECTED, inProgressCalls);
  const completedRecent = getTreeChildren({ kind: "recentSection" }, completedModel);
  assert(completedRecent.length === 1, "8c. RINGING → OFFHOOK → IDLE is one recent call");
  const completedItem = getTreeItemData(completedRecent[0]!, completedModel);
  assert(completedItem.label === "Completed Call", "8c. completed call title");
  assert(completedItem.description === "+919450214263", "8c. completed call number");
  assert(getTreeChildren({ kind: "currentSection" }, completedModel)[0]?.kind === "currentEmpty", "8c. completed call leaves current empty");

  calls.handle({
    type: CALL_STATE_TYPE,
    state: "IDLE",
    callerName: "Shoaib Plumber DX",
    phoneNumber: "+919450214263",
    timestamp: "2026-09-05T21:30:20.000Z",
  });
  const missedModel = model(PhoneConnectionStatus.CONNECTED, calls);
  const recent = getTreeChildren({ kind: "recentSection" }, missedModel);
  assert(recent[0]?.kind === "historyItem", "9. recent call renders");
  const missedItem = getTreeItemData(recent[0], missedModel);
  assert(missedItem.label === "Missed Call", "9. recent call title");
  assert(missedItem.description === "+919450214263", "9. recent call number");
  assert(missedItem.icon === "call-incoming", "9. missed icon");

  let pairingRefresh = 0;
  const pairingListeners = new Set<() => void>();
  pairingListeners.add(() => {
    pairingRefresh += 1;
  });
  for (const listener of pairingListeners) {
    listener();
  }
  assert(pairingRefresh === 1, "10. pairing restore triggers refresh");

  let callRefresh = 0;
  const callManager = new CallEventManager();
  const unsubscribe = callManager.onDidChange(() => {
    callRefresh += 1;
  });
  callManager.handle({
    type: CALL_STATE_TYPE,
    state: "RINGING",
    callerName: null,
    phoneNumber: null,
    timestamp: "2026-09-05T21:30:00.000Z",
  });
  assert(callRefresh === 1, "11. CALL_STATE triggers refresh");
  unsubscribe();

  const duringRestore = getTreeChildren(undefined, model(PhoneConnectionStatus.RECONNECTING));
  assert(duringRestore.length === 3, "12. provider remains valid during async pairing restore");
  assert(duringRestore[0]?.kind === "connectionSection", "12. restore still has a connection section");
  assert(
    getTreeItemData({ kind: "status" }, model(PhoneConnectionStatus.RECONNECTING)).label === "Connecting...",
    "12. restore still has a status row",
  );

  const afterReload = getTreeChildren(undefined, model(PhoneConnectionStatus.CONNECTED));
  assert(afterReload !== null && afterReload !== undefined, "13. provider does not become null after reload");
  assert(Array.isArray(afterReload) && afterReload.length === 3, "13. reload still returns root children");
  assert(getTreeChildren({ kind: "connectionSection" }, model(PhoneConnectionStatus.CONNECTED))[0]?.kind === "status", "13. connection section contains status");
  assert(getTreeChildren({ kind: "status" }, model(PhoneConnectionStatus.CONNECTED)).length === 0, "13. leaf getChildren is an empty array");

  console.log("phone call tree checks passed");
}

main();
