import * as vscode from "vscode";
import type { CallEventManager } from "../calls/callEventManager";
import type { PairingManager } from "../pairing/pairingManager";
import {
  getTreeChildren,
  getTreeItemData,
  treeElementFromContextValue,
  type PhoneCallTreeElement,
  type PhoneCallTreeItemData,
} from "./phoneCallTreeModel";
import { buildPhoneCallViewModel, type PhoneCallViewModel } from "./phoneCallViewModel";

export class PhoneCallTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly pairing: PairingManager,
    private readonly calls: CallEventManager,
  ) {
    this.disposables.push(
      this._onDidChangeTreeData,
      this.pairing.onDidChangePhoneStatus(() => this.refresh()),
      { dispose: this.calls.onDidChange(() => this.refresh()) },
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    try {
      const model = this.model();
      const node = element === undefined ? undefined : treeElementFromContextValue(element.contextValue);
      const children =
        element === undefined
          ? getTreeChildren(undefined, model)
          : node === undefined
            ? []
            : getTreeChildren(node, model);
      return children.map((child) => this.toTreeItem(child, model));
    } catch (error) {
      console.error("[Call Desk] tree update failed", error);
      return [new vscode.TreeItem("Call Desk", vscode.TreeItemCollapsibleState.None)];
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  private model(): PhoneCallViewModel {
    return buildPhoneCallViewModel({
      phoneConnectionStatus: this.pairing.phoneConnectionStatus,
      currentCall: this.calls.currentCall,
      history: this.calls.history,
    });
  }

  private toTreeItem(element: PhoneCallTreeElement, model: PhoneCallViewModel): vscode.TreeItem {
    return toVsCodeTreeItem(getTreeItemData(element, model));
  }
}

function toVsCodeTreeItem(data: PhoneCallTreeItemData): vscode.TreeItem {
  const collapsible =
    data.collapsible === "expanded"
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;
  const item = new vscode.TreeItem(data.label, collapsible);
  item.id = data.id;
  item.description = data.description === "" ? undefined : data.description;
  item.tooltip = data.tooltip;
  item.contextValue = data.contextValue;
  if (data.icon !== undefined) {
    item.iconPath =
      data.iconColor === undefined
        ? new vscode.ThemeIcon(data.icon)
        : new vscode.ThemeIcon(data.icon, new vscode.ThemeColor(data.iconColor));
  }
  if (data.command !== undefined) {
    item.command = { command: data.command, title: data.label };
  }
  return item;
}
