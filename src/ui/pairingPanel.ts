import { randomBytes } from "node:crypto";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as vscode from "vscode";
import type { PairingPanelMessage, PairingViewState } from "./pairingViewState";

export const PAIRING_VIEW_TYPE = "phoneCallManager.pairing";

export type PairingPanelAction = Exclude<PairingPanelMessage, { type: "ready" }>;

export class PairingPanel {
  private server: http.Server | undefined;
  private serverUrl: string | undefined;
  private readonly sseClients = new Set<http.ServerResponse>();
  private state: PairingViewState = {
    kind: "disconnected",
    status: "Unable to connect to Call Desk backend.",
    reconnecting: false,
  };
  private readonly actionListeners = new Set<(action: PairingPanelAction) => void>();

  constructor(_context: vscode.ExtensionContext) {}

  onAction(listener: (action: PairingPanelAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  async show(): Promise<void> {
    const url = await this.ensureServer();
    const opened = await vscode.env.openExternal(vscode.Uri.parse(url));
    if (!opened) {
      void vscode.window.showErrorMessage(`Unable to open the Call Desk pairing page. Open this URL: ${url}`);
    }
  }

  setState(state: PairingViewState): void {
    this.state = state;
    this.broadcastState();
  }

  get currentState(): PairingViewState {
    return this.state;
  }

  dispose(): void {
    this.actionListeners.clear();
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();
    this.server?.close();
    this.server = undefined;
    this.serverUrl = undefined;
  }

  private async ensureServer(): Promise<string> {
    if (this.serverUrl !== undefined) {
      return this.serverUrl;
    }

    this.server = http.createServer((req, res) => {
      try {
        this.handleRequest(req, res);
      } catch {
        console.error("[Pairing] pairing page request failed");
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      }
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (server === undefined) {
        reject(new Error("pairing UI server missing"));
        return;
      }
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = this.server.address() as AddressInfo | null;
    if (address === null || typeof address === "string") {
      throw new Error("pairing UI server did not bind");
    }

    this.serverUrl = `http://127.0.0.1:${address.port}`;
    return this.serverUrl;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const path = (req.url ?? "/").split("?")[0];

    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(this.getHtml());
      return;
    }

    if (req.method === "GET" && path === "/state") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(this.state));
      return;
    }

    if (req.method === "GET" && path === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify(this.state)}\n\n`);
      this.sseClients.add(res);
      req.on("close", () => {
        this.sseClients.delete(res);
      });
      return;
    }

    if (req.method === "POST" && path === "/action") {
      this.readJson(req, (payload) => {
        if (isPairingPanelMessage(payload) && payload.type !== "ready") {
          for (const listener of this.actionListeners) {
            listener(payload);
          }
        }
        res.writeHead(204);
        res.end();
      });
      return;
    }

    res.writeHead(404);
    res.end();
  }

  private readJson(req: http.IncomingMessage, done: (value: unknown) => void): void {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        done(JSON.parse(raw) as unknown);
      } catch {
        done(null);
      }
    });
  }

  private broadcastState(): void {
    const payload = `data: ${JSON.stringify(this.state)}\n\n`;
    for (const client of this.sseClients) {
      client.write(payload);
    }
  }

  private getHtml(): string {
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      "img-src data:",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
      "connect-src 'self'",
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Call Desk</title>
  <style nonce="${nonce}">
    :root { color-scheme: dark; }
    html, body { height: 100%; margin: 0; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      color: #cccccc;
      background: #1e1e1e;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 24px;
      box-sizing: border-box;
    }
    .card { width: min(420px, 100%); text-align: center; }
    h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
    .subtitle { margin: 0 0 28px; font-size: 13px; opacity: 0.8; }
    .status-title { margin: 0 0 16px; font-size: 18px; font-weight: 600; }
    .qr-wrap {
      display: none;
      margin: 0 auto 20px;
      padding: 16px;
      width: fit-content;
      background: #ffffff;
      border-radius: 12px;
    }
    .qr-wrap.visible { display: inline-block; }
    .qr-wrap img { display: block; width: 240px; height: 240px; }
    .hint, .meta, .message { margin: 0 0 10px; line-height: 1.5; }
    .hint { opacity: 0.85; }
    .meta { font-variant-numeric: tabular-nums; }
    .message { color: #f48771; }
    .status { margin: 18px 0 0; font-weight: 500; }
    .actions { margin-top: 20px; display: none; justify-content: center; gap: 8px; }
    .actions.visible { display: flex; }
    button {
      font-family: inherit;
      font-size: 13px;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      background: #0e639c;
      color: #ffffff;
    }
    button:hover { background: #1177bb; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Call Desk</h1>
    <p class="subtitle" id="subtitle">Connect your phone</p>
    <p class="status-title" id="statusTitle"></p>
    <div class="qr-wrap" id="qrWrap">
      <img id="qrImage" alt="Pairing QR code" />
    </div>
    <p class="hint" id="hint"></p>
    <p class="meta" id="expiry"></p>
    <p class="message hidden" id="message"></p>
    <p class="status" id="status"></p>
    <div class="actions" id="actions">
      <button type="button" id="primaryAction"></button>
    </div>
  </main>
  <script nonce="${nonce}">
    const subtitle = document.getElementById("subtitle");
    const statusTitle = document.getElementById("statusTitle");
    const qrWrap = document.getElementById("qrWrap");
    const qrImage = document.getElementById("qrImage");
    const hint = document.getElementById("hint");
    const expiry = document.getElementById("expiry");
    const message = document.getElementById("message");
    const status = document.getElementById("status");
    const actions = document.getElementById("actions");
    const primaryAction = document.getElementById("primaryAction");

    let countdownTimer = null;
    let currentExpiresAt = null;
    let expiredNotified = false;

    function postAction(type) {
      fetch("/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: type })
      });
    }

    primaryAction.addEventListener("click", () => {
      const action = primaryAction.dataset.action;
      if (action) {
        postAction(action);
      }
    });

    fetch("/state").then((response) => response.json()).then(render);
    const events = new EventSource("/events");
    events.onmessage = (event) => {
      render(JSON.parse(event.data));
    };

    function render(state) {
      clearCountdown();
      expiredNotified = false;
      currentExpiresAt = null;
      qrWrap.classList.remove("visible");
      qrImage.removeAttribute("src");
      message.classList.add("hidden");
      message.textContent = "";
      actions.classList.remove("visible");
      primaryAction.dataset.action = "";
      statusTitle.textContent = "";
      hint.textContent = "";
      expiry.textContent = "";
      subtitle.textContent = "Connect your phone";

      if (state.kind === "connecting") {
        status.textContent = state.status;
        return;
      }

      if (state.kind === "waiting") {
        qrImage.src = state.qrDataUrl;
        qrWrap.classList.add("visible");
        hint.textContent = "Scan this QR code with the Call Desk Android app.";
        status.textContent = state.status;
        currentExpiresAt = state.expiresAt;
        startCountdown();
        return;
      }

      if (state.kind === "expired") {
        hint.textContent = "This pairing code is no longer valid.";
        expiry.textContent = "Pairing expired";
        status.textContent = state.status;
        showAction("Generate New QR", "generateNewQr");
        return;
      }

      if (state.kind === "failed") {
        message.textContent = state.message;
        message.classList.remove("hidden");
        status.textContent = state.status;
        showAction("Generate New QR", "generateNewQr");
        return;
      }

      if (state.kind === "connected") {
        subtitle.textContent = "";
        statusTitle.textContent = "Phone connected successfully.";
        hint.textContent = "";
        status.textContent = "";
        return;
      }

      if (state.kind === "phoneDisconnected") {
        subtitle.textContent = "";
        if (state.waitingForReconnect) {
          statusTitle.textContent = "Connecting...";
          hint.textContent = "The phone will reconnect automatically. Use Re-pair only if you want a new computer or a new QR.";
          status.textContent = state.status;
          showAction("Re-pair with new QR", "generateNewQr");
          return;
        }
        statusTitle.textContent = "Phone is not paired.";
        hint.textContent = "Pair your phone to continue.";
        status.textContent = state.status;
        showAction("Generate New QR", "generateNewQr");
        return;
      }

      if (state.kind === "disconnected") {
        statusTitle.textContent = state.reconnecting
          ? "Connection lost. Reconnecting..."
          : "Unable to connect to Call Desk backend.";
        hint.textContent = state.reconnecting
          ? "Trying to reconnect automatically."
          : "Start the Call Desk backend, then retry.";
        status.textContent = state.status;
        showAction("Retry Connection", "retryConnection");
      }
    }

    function showAction(label, action) {
      primaryAction.textContent = label;
      primaryAction.dataset.action = action;
      actions.classList.add("visible");
    }

    function startCountdown() {
      updateExpiry();
      countdownTimer = setInterval(updateExpiry, 1000);
    }

    function updateExpiry() {
      if (!currentExpiresAt) {
        return;
      }
      const remainingMs = Date.parse(currentExpiresAt) - Date.now();
      if (remainingMs <= 0) {
        expiry.textContent = "Expires in: 00:00";
        qrWrap.classList.remove("visible");
        qrImage.removeAttribute("src");
        hint.textContent = "This pairing code is no longer valid.";
        clearCountdown();
        if (!expiredNotified) {
          expiredNotified = true;
          postAction("pairingExpired");
        }
        return;
      }
      expiry.textContent = "Expires in: " + formatRemaining(remainingMs);
    }

    function formatRemaining(ms) {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
    }

    function clearCountdown() {
      if (countdownTimer !== null) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }
  </script>
</body>
</html>`;
  }
}

function isPairingPanelMessage(value: unknown): value is PairingPanelMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const type = (value as { type: unknown }).type;
  return (
    type === "ready" ||
    type === "generateNewQr" ||
    type === "retryConnection" ||
    type === "pairingExpired"
  );
}

function getNonce(): string {
  return randomBytes(16).toString("hex");
}
