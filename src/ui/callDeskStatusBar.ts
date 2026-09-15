import * as vscode from "vscode";
import type { PairingManager } from "../pairing/pairingManager";
import { callDeskStatusBarText, callDeskStatusBarTooltip } from "../sidebar/statusBarPresentation";

export class CallDeskStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscription: vscode.Disposable;
  private lastText: string | undefined;

  constructor(private readonly pairing: PairingManager) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.name = "Call Desk";
    this.item.command = "phoneCallManager.calls.focus";
    this.subscription = this.pairing.onDidChangePhoneStatus(() => this.render());
    this.render();
    this.item.show();
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }

  private render(): void {
    const status = this.pairing.phoneConnectionStatus;
    const text = callDeskStatusBarText(status);
    if (this.lastText === text) {
      return;
    }

    this.lastText = text;
    this.item.text = text;
    this.item.tooltip = callDeskStatusBarTooltip(status);
    this.item.accessibilityInformation = { label: text.replace(/\$\([^)]+\)\s*/g, "") };
  }
}
