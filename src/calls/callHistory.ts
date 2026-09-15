import type { CallHistoryItem } from "./callState";

export const MAX_CALL_HISTORY = 20;

export class CallHistory {
  private readonly items: CallHistoryItem[] = [];

  add(item: CallHistoryItem): void {
    this.items.unshift(item);
    if (this.items.length > MAX_CALL_HISTORY) {
      this.items.length = MAX_CALL_HISTORY;
    }
  }

  list(): readonly CallHistoryItem[] {
    return this.items;
  }
}
