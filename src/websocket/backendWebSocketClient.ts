import { WebSocket, type RawData } from "ws";
import { CALL_STATE_TYPE, isRecord, parseCallStateEvent, type CallStateEvent } from "./protocol";

export const ConnectionState = {
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  DISCONNECTED: "DISCONNECTED",
  RECONNECTING: "RECONNECTING",
} as const;

export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];

export type ConnectionStateListener = (state: ConnectionState) => void;
export type MessageListener = (message: unknown) => void;
export type CallStateListener = (event: CallStateEvent) => void;
export type ErrorListener = (message: string) => void;

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export class BackendWebSocketClient {
  private socket: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private hasConnectedOnce = false;
  private disposed = false;

  private readonly stateListeners = new Set<ConnectionStateListener>();
  private readonly messageListeners = new Set<MessageListener>();
  private readonly callStateListeners = new Set<CallStateListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(private readonly getUrl: () => string) {}

  get connectionState(): ConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED && this.socket?.readyState === WebSocket.OPEN;
  }

  onStateChange(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onCallState(listener: CallStateListener): () => void {
    this.callStateListeners.add(listener);
    return () => this.callStateListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  connect(): void {
    if (this.disposed) {
      return;
    }

    this.shouldReconnect = true;
    this.clearReconnectTimer();

    if (this.hasActiveSocket()) {
      return;
    }

    this.discardSocket();
    this.setState(this.hasConnectedOnce || this.reconnectAttempt > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING);

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.getUrl());
    } catch (error) {
      const message = error instanceof Error ? error.message : "WebSocket error";
      console.error("Backend WebSocket error:", message);
      for (const listener of this.errorListeners) {
        listener(message);
      }
      this.setState(ConnectionState.DISCONNECTED);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.on("open", () => {
      if (this.socket !== socket) {
        return;
      }

      this.hasConnectedOnce = true;
      this.reconnectAttempt = 0;
      this.setState(ConnectionState.CONNECTED);
    });

    socket.on("message", (data) => {
      if (this.socket !== socket) {
        return;
      }

      const text = rawDataToString(data);
      if (text === null || text.trim() === "") {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        console.error("Ignored malformed backend message");
        return;
      }

      if (isRecord(parsed) && parsed.type === CALL_STATE_TYPE) {
        const event = parseCallStateEvent(parsed);
        if (event === null) {
          console.warn("[CALL] ignored invalid CALL_STATE");
          return;
        }

        for (const listener of this.callStateListeners) {
          listener(event);
        }
        return;
      }

      for (const listener of this.messageListeners) {
        listener(parsed);
      }
    });

    socket.on("error", (error) => {
      if (this.socket !== socket) {
        return;
      }

      const message = error instanceof Error ? error.message : "WebSocket error";
      console.error("Backend WebSocket error:", message);
      for (const listener of this.errorListeners) {
        listener(message);
      }
    });

    socket.on("close", () => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = null;
      this.setState(ConnectionState.DISCONNECTED);
      this.scheduleReconnect();
    });
  }

  reconnectNow(): void {
    if (this.disposed) {
      return;
    }

    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.closeSocket();
    this.connect();
  }

  sendJson(payload: object): boolean {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "WebSocket send failed";
      console.error("Backend WebSocket error:", message);
      return false;
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.closeSocket();
    this.setState(ConnectionState.DISCONNECTED);
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.stateListeners.clear();
    this.messageListeners.clear();
    this.callStateListeners.clear();
    this.errorListeners.clear();
  }

  private hasActiveSocket(): boolean {
    if (this.socket === null) {
      return false;
    }

    return this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.disposed || this.reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempt += 1;
    this.setState(ConnectionState.RECONNECTING);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket === null) {
      return;
    }

    socket.removeAllListeners();
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  }

  private discardSocket(): void {
    if (this.socket === null) {
      return;
    }

    this.closeSocket();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) {
      return;
    }

    this.state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}

function rawDataToString(raw: RawData): string | null {
  if (typeof raw === "string") {
    return raw;
  }

  if (Buffer.isBuffer(raw)) {
    return raw.toString("utf8");
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }

  return null;
}
