import * as vscode from "vscode";
import {
  BackendWebSocketClient,
  ConnectionState,
} from "../websocket/backendWebSocketClient";
import {
  CALL_STATE_TYPE,
  CLIENT_TYPE_ANDROID,
  CLIENT_TYPE_VS_CODE,
  CREATE_PAIRING_TYPE,
  PAIR_FAIL_REASONS,
  isBackendErrorMessage,
  isClientStatusMessage,
  isPairFailedMessage,
  isPairSuccessMessage,
  isPairingCreatedMessage,
  parseIncomingMessage,
  type ClientStatusMessage,
  type PairSuccessMessage,
} from "../websocket/protocol";
import { generatePairingQrDataUrl } from "../qr/qrGenerator";
import type { BackendEndpoint } from "../config";
import { planAfterBackendUrlChange } from "../config";
import {
  derivePhoneConnectionStatus,
  type PhoneConnectionStatus,
} from "./phoneConnectionStatus";
import {
  clearPersistedPairingId as deletePersistedPairingId,
  loadPersistedPairingId,
  reconnectVscodeMessage,
  savePersistedPairingId,
  shouldCreatePairingOnConnect,
} from "./pairingRestore";
import type { PairingPanel } from "../ui/pairingPanel";
import type { PairingPanelAction } from "../ui/pairingPanel";
import type { PairingViewState } from "../ui/pairingViewState";

type PhonePairingState = "NOT_PAIRED" | "WAITING" | "PAIRED" | "DISCONNECTED";
type SecretStorageOperation = "read" | "save" | "clear";

interface ActivePairing {
  pairingId: string;
  pairingToken: string;
  expiresAt: string;
}

export class PairingManager {
  private activePairing: ActivePairing | null = null;
  private currentPairingId: string | null = null;
  private androidClientId: string | null = null;
  private phonePairingState: PhonePairingState = "DISCONNECTED";
  private androidConfirmed = false;
  private createPairingOnConnect = false;
  private persistedPairingId: string | null = null;
  private qrGeneration = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private restoreInProgress = false;
  private lastEmittedPhoneStatus: PhoneConnectionStatus | null = null;
  private backendUrlChangeReconnect = false;
  private readonly phoneStatusEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangePhoneStatus = this.phoneStatusEmitter.event;

  constructor(
    private readonly client: BackendWebSocketClient,
    private readonly panel: PairingPanel,
    private readonly secrets: vscode.SecretStorage,
    private readonly getEndpoint: () => BackendEndpoint,
  ) {
    this.client.onStateChange((state) => this.handleConnectionState(state));
    this.client.onMessage((message) => this.handleBackendMessage(message));
    this.client.onError(() => {
      if (this.activePairing !== null && this.hasUsablePairing()) {
        this.createPairingOnConnect = true;
      }
      this.clearSession("backend socket error");
      this.showBackendDisconnected(this.client.connectionState === ConnectionState.RECONNECTING);
      this.emitPhoneStatusChanged();
    });
    this.panel.onAction((action) => this.handlePanelAction(action));
  }

  startOnActivate(): void {
    void this.startOnActivateAsync().catch(() => {
      console.error("[Pairing] activate restore failed");
      this.handleSecretStorageFailure("read");
    });
  }

  applyBackendUrlChange(): void {
    this.started = true;
    const plan = planAfterBackendUrlChange(this.persistedPairingId);
    this.createPairingOnConnect = plan.createPairing;
    this.backendUrlChangeReconnect = plan.reconnect;
    this.androidConfirmed = false;
    this.androidClientId = null;
    this.client.reconnectNow();
  }

  open(): void {
    this.started = true;
    void this.openAsync().catch(() => {
      console.error("[Pairing] open failed");
      void vscode.window.showErrorMessage("Unable to open the Call Desk pairing page.");
    });
  }

  onWebviewRestored(): void {
    this.started = true;
    this.androidConfirmed = false;
    this.androidClientId = null;
    this.showBackendDisconnected(false);
    void this.restoreAndConnect().catch(() => {
      console.error("[Pairing] restore failed");
      this.handleSecretStorageFailure("read");
    });
  }

  private async startOnActivateAsync(): Promise<void> {
    this.started = true;
    this.restoreInProgress = true;
    this.emitPhoneStatusChanged();
    await this.hydratePersistedPairingId();
    this.createPairingOnConnect = false;

    if (this.persistedPairingId === null) {
      this.restoreInProgress = false;
      this.setPhonePairingState("NOT_PAIRED", "activate no stored pairing");
      this.emitPhoneStatusChanged();
      return;
    }

    this.currentPairingId = this.persistedPairingId;
    this.setPhonePairingState("WAITING", "activate restore pairing");
    this.client.connect();
  }

  private async restoreAndConnect(): Promise<void> {
    await this.hydratePersistedPairingId();
    this.createPairingOnConnect = shouldCreatePairingOnConnect(this.persistedPairingId);
    this.client.connect();
  }

  private async openAsync(): Promise<void> {
    await this.hydratePersistedPairingId();

    const keepExistingQr = this.phonePairingState === "WAITING" && this.hasUsablePairing();
    const keepConnected =
      this.phonePairingState === "PAIRED" &&
      this.androidConfirmed &&
      this.currentPairingId !== null &&
      this.client.isConnected;

    if (!keepExistingQr && !keepConnected && this.panel.currentState.kind === "connected") {
      this.panel.setState(
        this.persistedPairingId !== null
          ? phoneDisconnectedState("Waiting for phone...", true)
          : phoneDisconnectedState("Phone is not paired."),
      );
    }

    if (!keepConnected) {
      this.forgetUnconfirmedPairing("command opened");
    }

    await this.panel.show();

    if (!this.client.isConnected) {
      this.createPairingOnConnect = this.persistedPairingId === null;
      this.setPhonePairingState("DISCONNECTED", "open while backend offline");
      if (this.client.connectionState === ConnectionState.RECONNECTING) {
        this.showBackendDisconnected(true);
      } else {
        this.panel.setState({
          kind: "connecting",
          status: "Connecting...",
        });
      }
      this.client.connect();
      return;
    }

    if (keepExistingQr) {
      return;
    }

    if (keepConnected) {
      this.panel.setState(connectedState());
      return;
    }

    if (this.persistedPairingId !== null) {
      this.sendReconnectVscode();
      return;
    }

    this.createPairingOnConnect = false;
    this.requestPairing();
  }

  get phoneConnectionStatus(): PhoneConnectionStatus {
    return derivePhoneConnectionStatus({
      phonePaired: this.phonePairingState === "PAIRED" && this.androidConfirmed,
      hasPersistedPairing: this.persistedPairingId !== null,
      restoreInProgress: this.restoreInProgress,
      connectionState: this.client.connectionState,
    });
  }

  dispose(): void {
    this.started = false;
    this.createPairingOnConnect = false;
    this.clearSession("dispose");
    this.client.dispose();
    this.panel.dispose();
    this.phoneStatusEmitter.dispose();
  }

  private handlePanelAction(action: PairingPanelAction): void {
    if (action.type === "retryConnection") {
      this.createPairingOnConnect = this.persistedPairingId === null;
      this.androidConfirmed = false;
      this.androidClientId = null;
      this.panel.setState({
        kind: "connecting",
        status: "Connecting...",
      });
      this.client.reconnectNow();
      return;
    }

    if (action.type === "generateNewQr") {
      void this.startNewPairing();
      return;
    }

    if (action.type === "pairingExpired") {
      this.handleExpired();
    }
  }

  private async startNewPairing(): Promise<void> {
    try {
      await this.clearPersistedPairingId();
    } catch (error) {
      console.error("[Pairing] failed to clear pairing", error);
      this.handleSecretStorageFailure("clear");
      return;
    }

    this.createPairingOnConnect = true;
    this.clearSession("generate new QR");
    if (this.client.isConnected) {
      this.requestPairing();
      return;
    }

    this.panel.setState({
      kind: "connecting",
      status: "Connecting...",
    });
    this.client.connect();
  }

  private handleConnectionState(state: ConnectionState): void {
    try {
      this.applyConnectionState(state);
    } finally {
      this.emitPhoneStatusChanged();
    }
  }

  private applyConnectionState(state: ConnectionState): void {
    if (!this.started) {
      return;
    }

    if (state === ConnectionState.CONNECTED) {
      const shouldCreatePairing = this.createPairingOnConnect;
      this.createPairingOnConnect = false;
      this.androidConfirmed = false;
      this.androidClientId = null;

      if (this.persistedPairingId !== null) {
        this.sendReconnectVscode();
        return;
      }

      this.restoreInProgress = false;
      this.clearSession("backend connected");
      this.setPhonePairingState("NOT_PAIRED", "awaiting pairing status");

      if (shouldCreatePairing) {
        this.requestPairing();
        return;
      }

      this.panel.setState(phoneDisconnectedState("Phone not connected"));
      return;
    }

    if (state === ConnectionState.CONNECTING) {
      if (this.persistedPairingId === null) {
        this.clearSession("backend connecting");
      } else {
        this.androidConfirmed = false;
        this.setPhonePairingState("WAITING", "backend connecting");
      }
      this.panel.setState({
        kind: "connecting",
        status: "Connecting...",
      });
      return;
    }

    if (state === ConnectionState.RECONNECTING || state === ConnectionState.DISCONNECTED) {
      this.androidConfirmed = false;
      if (this.persistedPairingId === null) {
        this.clearSession("backend disconnected");
      } else {
        this.setPhonePairingState("DISCONNECTED", "backend disconnected");
      }
      this.showBackendDisconnected(state === ConnectionState.RECONNECTING);
    }
  }

  private handleBackendMessage(raw: unknown): void {
    const message = parseIncomingMessage(raw);
    if (message === null) {
      return;
    }

    if (message.type === CALL_STATE_TYPE) {
      return;
    }

    if (isPairingCreatedMessage(message)) {
      void this.handlePairingCreated(message.pairingId, message.pairingToken, message.expiresAt).catch(() => {
        console.error("[Pairing] QR update failed");
      });
      return;
    }

    if (isPairSuccessMessage(message)) {
      this.handleIncomingPairSuccess(message);
      return;
    }

    if (isClientStatusMessage(message)) {
      this.handleClientStatus(message);
      return;
    }

    if (isPairFailedMessage(message)) {
      this.handlePairFailed(message.reason);
      return;
    }

    if (isBackendErrorMessage(message)) {
      console.error("Backend pairing error");
      if (this.phonePairingState !== "PAIRED") {
        this.panel.setState({
          kind: "failed",
          status: "Unable to pair",
          message: userFacingFailureMessage(message.message),
        });
      }
    }
  }

  private requestPairing(): void {
    if (!shouldCreatePairingOnConnect(this.persistedPairingId)) {
      this.sendReconnectVscode();
      return;
    }
    this.androidClientId = null;
    this.androidConfirmed = false;
    this.currentPairingId = null;
    this.setPhonePairingState("WAITING", "CREATE_PAIRING");
    this.clearPendingPairing();
    this.panel.setState({
      kind: "connecting",
      status: "Requesting pairing...",
    });

    const sent = this.client.sendJson({ type: CREATE_PAIRING_TYPE });
    if (!sent) {
      this.showBackendDisconnected(false);
    }
  }

  private async handlePairingCreated(
    pairingId: string,
    pairingToken: string,
    expiresAt: string,
  ): Promise<void> {
    if (Date.parse(expiresAt) <= Date.now()) {
      this.handleExpired();
      return;
    }

    const generation = ++this.qrGeneration;
    this.activePairing = { pairingId, pairingToken, expiresAt };
    this.currentPairingId = pairingId;
    this.androidClientId = null;
    this.androidConfirmed = false;
    this.setPhonePairingState("WAITING", "PAIRING_CREATED");
    this.armExpiryTimer(expiresAt);

    let qrDataUrl: string;
    try {
      qrDataUrl = await generatePairingQrDataUrl(pairingId, pairingToken, this.getEndpoint());
    } catch (error) {
      const message = error instanceof Error ? error.message : "QR generation failed";
      console.error("QR generation failed:", message);
      if (generation !== this.qrGeneration) {
        return;
      }
      this.setPhonePairingState("NOT_PAIRED", "QR generation failed");
      this.clearPendingPairing();
      this.panel.setState({
        kind: "failed",
        status: "Unable to pair",
        message: "Unable to pair",
      });
      return;
    }

    if (generation !== this.qrGeneration || this.activePairing?.pairingId !== pairingId) {
      return;
    }

    this.panel.setState({
      kind: "waiting",
      status: "Waiting for phone...",
      qrDataUrl,
      expiresAt,
    });
  }

  private handlePairSuccess(source: string): void {
    if (this.activePairing !== null) {
      this.currentPairingId = this.activePairing.pairingId;
    }

    this.restoreInProgress = false;
    this.androidConfirmed = true;
    this.backendUrlChangeReconnect = false;
    this.setPhonePairingState("PAIRED", source);
    this.emitPhoneStatusChanged();
    this.clearPendingPairing();
    if (this.persistedPairingId === null && this.currentPairingId !== null) {
      void this.savePersistedPairingId(this.currentPairingId).catch(() => {
        console.error("[Pairing] failed to persist pairing");
        this.handleSecretStorageFailure("save");
      });
    }
    this.panel.setState(connectedState());
  }

  private handleIncomingPairSuccess(message: PairSuccessMessage): void {
    const pairingId = typeof message.pairingId === "string" && message.pairingId.trim() !== ""
      ? message.pairingId
      : null;
    const clientId = typeof message.clientId === "string" && message.clientId.trim() !== ""
      ? message.clientId
      : null;
    const reconnectFlow = this.isReconnectConfirmation();
    if (message.paired === false) {
      return;
    }

    if (pairingId !== null && !this.matchesLivePairingId(pairingId)) {
      return;
    }

    if (this.phonePairingState !== "WAITING" && this.phonePairingState !== "PAIRED" && this.persistedPairingId === null) {
      return;
    }

    if (pairingId !== null) {
      this.currentPairingId = pairingId;
    }
    if (clientId !== null) {
      this.androidClientId = clientId;
    }

    this.handlePairSuccess(reconnectFlow ? "RECONNECT PAIR_SUCCESS" : "PAIR_SUCCESS");
  }

  private handleClientStatus(message: ClientStatusMessage): void {
    const reconnectFlow = this.isReconnectConfirmation() || this.phonePairingState === "PAIRED";

    if (message.clientType === CLIENT_TYPE_ANDROID) {
      if (message.paired) {
        if (!this.matchesLivePairingId(message.pairingId)) {
          return;
        }

        this.androidClientId = message.clientId;
        if (message.pairingId !== null) {
          this.currentPairingId = message.pairingId;
        }
        this.handlePairSuccess(reconnectFlow ? "RECONNECT CLIENT_STATUS" : "CLIENT_STATUS ANDROID paired");
        return;
      }

      if (!this.matchesDisconnectedAndroid(message)) {
        return;
      }

      this.handlePhoneDisconnected();
      return;
    }

    if (
      message.clientType === CLIENT_TYPE_VS_CODE &&
      !message.paired &&
      this.phonePairingState === "PAIRED"
    ) {
      this.handlePhoneDisconnected();
    }
  }

  private matchesLivePairingId(pairingId: string | null): boolean {
    if (pairingId === null) {
      return false;
    }

    if (this.currentPairingId !== null) {
      return pairingId === this.currentPairingId;
    }

    if (this.persistedPairingId !== null) {
      return pairingId === this.persistedPairingId;
    }

    return this.phonePairingState === "WAITING";
  }

  private matchesDisconnectedAndroid(message: ClientStatusMessage): boolean {
    if (this.androidClientId !== null) {
      return message.clientId === this.androidClientId;
    }

    return this.currentPairingId !== null && message.pairingId === this.currentPairingId;
  }

  private isReconnectConfirmation(): boolean {
    return this.activePairing === null && this.persistedPairingId !== null;
  }

  private handlePhoneDisconnected(): void {
    if (this.phonePairingState === "WAITING" && this.activePairing !== null) {
      this.androidConfirmed = false;
      this.androidClientId = null;
      return;
    }

    this.restoreInProgress = false;
    this.androidConfirmed = false;
    this.androidClientId = null;
    this.setPhonePairingState("DISCONNECTED", "android CLIENT_STATUS paired=false");
    this.clearPendingPairing();
    this.panel.setState(
      this.persistedPairingId !== null
        ? phoneDisconnectedState("Waiting for phone...", true)
        : phoneDisconnectedState("Phone is not paired."),
    );
  }

  private handlePairFailed(reason: string): void {
    if (this.phonePairingState === "PAIRED" && this.androidConfirmed && this.activePairing === null) {
      return;
    }

    const reconnectFailed = this.persistedPairingId !== null && this.activePairing === null;
    this.restoreInProgress = false;
    this.androidConfirmed = false;
    this.androidClientId = null;
    const pairingRevoked = reconnectFailed && reason === PAIR_FAIL_REASONS.INVALID;
    const keepPairingAfterBackendChange = pairingRevoked && this.backendUrlChangeReconnect;
    this.backendUrlChangeReconnect = false;
    if (pairingRevoked && !keepPairingAfterBackendChange) {
      void this.clearPersistedPairingId().catch(() => {
        console.error("[Pairing] failed to clear pairing");
        this.handleSecretStorageFailure("clear");
      });
    }
    this.setPhonePairingState("DISCONNECTED", `PAIR_FAILED ${reason}`);
    this.clearPendingPairing();

    if (keepPairingAfterBackendChange) {
      void vscode.window.showInformationMessage("Call Desk backend URL changed. Pair your phone to continue.");
      this.panel.setState(phoneDisconnectedState("Phone is not paired."));
      return;
    }

    if (reason === PAIR_FAIL_REASONS.EXPIRED) {
      this.panel.setState({
        kind: "expired",
        status: "Pairing expired",
      });
      return;
    }

    if (reconnectFailed && !pairingRevoked) {
      this.panel.setState(phoneDisconnectedState("Waiting for phone...", true));
      return;
    }

    this.panel.setState(phoneDisconnectedState("Phone is not paired."));
  }

  private handleExpired(): void {
    if (this.phonePairingState === "PAIRED" && this.androidConfirmed) {
      return;
    }

    if (this.activePairing !== null && Date.parse(this.activePairing.expiresAt) > Date.now()) {
      return;
    }

    if (this.panel.currentState.kind !== "waiting" && this.activePairing === null) {
      return;
    }

    this.androidConfirmed = false;
    this.setPhonePairingState("NOT_PAIRED", "pairing expired");
    this.clearPendingPairing();
    this.panel.setState({
      kind: "expired",
      status: "Pairing expired",
    });
  }

  private sendReconnectVscode(): void {
    const message = reconnectVscodeMessage(this.persistedPairingId);
    if (message === null) {
      return;
    }

    const pairingId = message.pairingId;
    this.currentPairingId = pairingId;
    this.androidConfirmed = false;
    this.androidClientId = null;
    this.setPhonePairingState("WAITING", "RECONNECT_VSCODE");
    this.clearPendingPairing();
    this.panel.setState(phoneDisconnectedState("Waiting for phone...", true));
    const sent = this.client.sendJson(message);
    if (!sent) {
      this.showBackendDisconnected(false);
    }
  }

  private async hydratePersistedPairingId(): Promise<void> {
    try {
      this.persistedPairingId = await loadPersistedPairingId(this.secrets);
      if (this.persistedPairingId !== null) {
        this.currentPairingId = this.persistedPairingId;
      }
    } catch (error) {
      this.persistedPairingId = null;
      this.currentPairingId = null;
      this.restoreInProgress = false;
      throw error;
    }
  }

  private async savePersistedPairingId(pairingId: string): Promise<void> {
    const normalizedPairingId = pairingId.trim();
    if (normalizedPairingId === "") {
      throw new Error("Cannot persist an empty pairing ID");
    }

    await savePersistedPairingId(this.secrets, normalizedPairingId);
    this.persistedPairingId = normalizedPairingId;
  }

  private async clearPersistedPairingId(): Promise<void> {
    await deletePersistedPairingId(this.secrets);
    this.persistedPairingId = null;
    this.restoreInProgress = false;
  }

  private hasUsablePairing(): boolean {
    if (this.activePairing === null) {
      return false;
    }

    return Date.parse(this.activePairing.expiresAt) > Date.now();
  }

  private armExpiryTimer(expiresAt: string): void {
    this.clearExpiryTimer();
    const remainingMs = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(remainingMs)) {
      this.handleExpired();
      return;
    }

    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      this.handleExpired();
    }, Math.max(0, remainingMs));
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer === null) {
      return;
    }

    clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }

  private clearPendingPairing(): void {
    this.qrGeneration += 1;
    this.clearExpiryTimer();
    this.activePairing = null;
  }

  private clearSession(reason: string): void {
    this.androidConfirmed = false;
    this.currentPairingId = null;
    this.androidClientId = null;
    this.setPhonePairingState("DISCONNECTED", reason);
    this.clearPendingPairing();
  }

  private handleSecretStorageFailure(operation: SecretStorageOperation): void {
    if (!this.started) {
      return;
    }

    this.createPairingOnConnect = false;
    this.persistedPairingId = null;
    this.restoreInProgress = false;
    this.androidConfirmed = false;
    this.androidClientId = null;
    this.clearSession(`SecretStorage ${operation} failed`);
    this.panel.setState({
      kind: "failed",
      status: "Unable to pair",
      message:
        operation === "read"
          ? "Unable to restore saved pairing. Pair your phone again."
          : operation === "save"
            ? "Unable to save pairing. Please try pairing again."
            : "Unable to clear saved pairing. Please try again.",
    });
    this.emitPhoneStatusChanged();
  }

  private forgetUnconfirmedPairing(reason: string): void {
    if (this.phonePairingState === "PAIRED" && this.androidConfirmed) {
      return;
    }

    this.androidConfirmed = false;
    if (this.phonePairingState === "PAIRED") {
      this.setPhonePairingState("DISCONNECTED", reason);
    }
  }

  private setPhonePairingState(next: PhonePairingState, reason: string): void {
    if (this.phonePairingState === next) {
      return;
    }

    this.phonePairingState = next;
    this.emitPhoneStatusChanged();
  }

  private emitPhoneStatusChanged(): void {
    const status = this.phoneConnectionStatus;
    if (this.lastEmittedPhoneStatus === status) {
      return;
    }

    this.lastEmittedPhoneStatus = status;
    this.phoneStatusEmitter.fire();
  }

  private showBackendDisconnected(reconnecting: boolean): void {
    this.panel.setState({
      kind: "disconnected",
      status: reconnecting ? "Connection lost. Reconnecting..." : "Unable to connect to Call Desk backend.",
      reconnecting,
    });
  }
}

function connectedState(): PairingViewState {
  return {
    kind: "connected",
    status: "Phone connected successfully.",
  };
}

function phoneDisconnectedState(status: string, waitingForReconnect = false): PairingViewState {
  return {
    kind: "phoneDisconnected",
    status,
    waitingForReconnect,
  };
}

function userFacingFailureMessage(reason: string): string {
  switch (reason) {
    case PAIR_FAIL_REASONS.EXPIRED:
      return "Pairing expired";
    case PAIR_FAIL_REASONS.INVALID:
      return "Invalid pairing";
    case PAIR_FAIL_REASONS.USED:
      return "Pairing already used";
    default:
      return "Unable to pair";
  }
}
