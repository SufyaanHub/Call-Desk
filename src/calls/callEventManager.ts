import type { CallStateEvent } from "../websocket/protocol";
import { CallHistory } from "./callHistory";
import {
  type ActiveCall,
  type CallHistoryItem,
  type CallPresentation,
  normalizeCallerField,
  presentationForKind,
} from "./callState";

type CallChangeListener = () => void;

export class CallEventManager {
  private current: ActiveCall | null = null;
  private readonly historyStore = new CallHistory();
  private readonly changeListeners = new Set<CallChangeListener>();

  get currentCall(): ActiveCall | null {
    return this.current;
  }

  get history(): readonly CallHistoryItem[] {
    return this.historyStore.list();
  }

  onDidChange(listener: CallChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  handle(event: CallStateEvent): CallPresentation | null {
    let presentation: CallPresentation | null;
    switch (event.state) {
      case "RINGING":
        presentation = this.handleRinging(event);
        break;
      case "OFFHOOK":
        presentation = this.handleOffhook(event);
        break;
      case "IDLE":
        presentation = this.handleIdle(event);
        break;
    }

    this.notifyChange();
    return presentation;
  }

  clearActiveCall(): void {
    if (this.current === null) {
      return;
    }

    this.current = null;
    this.notifyChange();
  }

  dispose(): void {
    this.changeListeners.clear();
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }

  private handleRinging(event: CallStateEvent): CallPresentation | null {
    if (this.current !== null) {
      this.mergeIdentity(event);
      return null;
    }

    this.current = this.createCall(event, { sawRinging: true, sawOffhook: false, lastState: "RINGING" });
    return presentationForKind("incoming", this.current.callerName, this.current.phoneNumber);
  }

  private handleOffhook(event: CallStateEvent): CallPresentation | null {
    if (this.current !== null && this.current.lastState === "OFFHOOK") {
      this.mergeIdentity(event);
      return null;
    }

    if (this.current === null) {
      this.current = this.createCall(event, { sawRinging: false, sawOffhook: true, lastState: "OFFHOOK" });
    } else {
      this.mergeIdentity(event);
      this.current.sawOffhook = true;
      this.current.lastState = "OFFHOOK";
    }

    return presentationForKind("in_progress", this.current.callerName, this.current.phoneNumber);
  }

  private handleIdle(event: CallStateEvent): CallPresentation | null {
    if (this.current === null) {
      return null;
    }

    this.mergeIdentity(event);
    const missed = this.current.sawRinging && !this.current.sawOffhook;
    const ended: CallHistoryItem = {
      callerName: this.current.callerName,
      phoneNumber: this.current.phoneNumber,
      status: missed ? "MISSED" : "COMPLETED",
      startTime: this.current.startedAt,
      endTime: event.timestamp,
    };
    this.historyStore.add(ended);

    const presentation = presentationForKind(
      missed ? "missed" : "ended",
      this.current.callerName,
      this.current.phoneNumber,
    );
    this.current = null;
    return presentation;
  }

  private createCall(
    event: CallStateEvent,
    flags: Pick<ActiveCall, "sawRinging" | "sawOffhook" | "lastState">,
  ): ActiveCall {
    return {
      callerName: normalizeCallerField(event.callerName),
      phoneNumber: normalizeCallerField(event.phoneNumber),
      startedAt: event.timestamp,
      sawRinging: flags.sawRinging,
      sawOffhook: flags.sawOffhook,
      lastState: flags.lastState,
    };
  }

  private mergeIdentity(event: CallStateEvent): void {
    if (this.current === null) {
      return;
    }

    const callerName = normalizeCallerField(event.callerName);
    const phoneNumber = normalizeCallerField(event.phoneNumber);
    if (callerName !== null) {
      this.current.callerName = callerName;
    }
    if (phoneNumber !== null) {
      this.current.phoneNumber = phoneNumber;
    }
  }
}
