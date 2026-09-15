import * as vscode from "vscode";
import {
  BACKEND_URL_SETTING,
  DEFAULT_BACKEND_URL,
  backendEndpointFromUrl,
  resolveBackendUrl,
} from "./config";
import { CallEventManager } from "./calls/callEventManager";
import { showCallNotification } from "./calls/callNotifications";
import { PairingManager } from "./pairing/pairingManager";
import {
  callHistoryCommandMessage,
  currentCallCommandMessage,
  buildPhoneCallViewModel,
} from "./sidebar/phoneCallViewModel";
import { PhoneCallTreeProvider } from "./sidebar/phoneCallTreeProvider";
import { CallDeskStatusBar } from "./ui/callDeskStatusBar";
import { PairingPanel } from "./ui/pairingPanel";
import { BackendWebSocketClient, ConnectionState } from "./websocket/backendWebSocketClient";

const INVALID_BACKEND_URL_MESSAGE = "Invalid Call Desk backend URL.";

export function activate(context: vscode.ExtensionContext): void {
  const backendUrl = { current: readInitialBackendUrl() };
  const client = new BackendWebSocketClient(() => backendUrl.current);
  const panel = new PairingPanel(context);
  const pairing = new PairingManager(client, panel, context.secrets, () => backendEndpointFromUrl(backendUrl.current));
  const calls = new CallEventManager();
  const treeProvider = new PhoneCallTreeProvider(pairing, calls);
  const statusBar = new CallDeskStatusBar(pairing);

  client.onStateChange((state) => {
    if (state !== ConnectionState.CONNECTED) {
      calls.clearActiveCall();
    }
  });

  client.onCallState((event) => {
    try {
      const presentation = calls.handle(event);
      if (presentation !== null) {
        showCallNotification(vscode.window, presentation);
      }
    } catch (error) {
      console.error("[CALL] handler failed", error);
    }
  });

  context.subscriptions.push(
    treeProvider,
    statusBar,
    vscode.window.registerTreeDataProvider("phoneCallManager.calls", treeProvider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(BACKEND_URL_SETTING)) {
        return;
      }
      applyBackendUrlSetting(backendUrl, pairing, true);
    }),
    vscode.commands.registerCommand("phoneCallManager.connectPhone", () => {
      pairing.open();
    }),
    vscode.commands.registerCommand("phoneCallManager.refreshCalls", () => {
      treeProvider.refresh();
    }),
    vscode.commands.registerCommand("phoneCallManager.showCurrentCall", () => {
      void vscode.window.showInformationMessage(currentCallCommandMessage(viewModel(pairing, calls)));
    }),
    vscode.commands.registerCommand("phoneCallManager.showCallHistory", () => {
      void vscode.window.showInformationMessage(callHistoryCommandMessage(viewModel(pairing, calls)));
    }),
    {
      dispose: () => {
        calls.dispose();
        pairing.dispose();
      },
    },
  );

  pairing.startOnActivate();
}

export function deactivate(): void {}

function readInitialBackendUrl(): string {
  const resolved = resolveBackendUrl(vscode.workspace.getConfiguration().get(BACKEND_URL_SETTING), DEFAULT_BACKEND_URL);
  if (resolved.invalid) {
    void vscode.window.showErrorMessage(INVALID_BACKEND_URL_MESSAGE);
  }
  return resolved.href;
}

function applyBackendUrlSetting(
  backendUrl: { current: string },
  pairing: PairingManager,
  reconnect: boolean,
): void {
  const resolved = resolveBackendUrl(vscode.workspace.getConfiguration().get(BACKEND_URL_SETTING), backendUrl.current);
  if (resolved.invalid) {
    void vscode.window.showErrorMessage(INVALID_BACKEND_URL_MESSAGE);
    return;
  }
  if (!resolved.changed) {
    return;
  }
  backendUrl.current = resolved.href;
  if (reconnect) {
    pairing.applyBackendUrlChange();
  }
}

function viewModel(pairing: PairingManager, calls: CallEventManager) {
  return buildPhoneCallViewModel({
    phoneConnectionStatus: pairing.phoneConnectionStatus,
    currentCall: calls.currentCall,
    history: calls.history,
  });
}
