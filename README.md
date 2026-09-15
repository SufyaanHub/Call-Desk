# Call Desk

Call Desk connects the Call Desk Android app to VS Code so you can see cellular call activity while you work.

Repository: [github.com/SufyaanHub/Call-Desk](https://github.com/SufyaanHub/Call-Desk)

## What it does

- Shows phone connection status in the Activity Bar, sidebar, and status bar.
- Reports incoming, in-progress, missed, and completed cellular calls.
- Shows native VS Code notifications for call events.
- Shows the current call and recent in-memory call history.
- Restores an existing pairing after an extension reload.

Call Desk does not answer or reject calls, record calls, send SMS, or synchronize contacts.

## How it works

Call Desk has three components:

1. **Call Desk VS Code extension** — receives call-state events and presents them in VS Code.
2. **Call Desk Android app** — detects cellular call state and sends events.
3. **Call Desk backend** — relays WebSocket messages between the Android app and VS Code.

The extension opens a local pairing page in your browser. The page displays a QR code that the Android app scans. After pairing, the extension stores only the pairing ID in VS Code SecretStorage and uses it to restore the connection.

## Requirements

- VS Code 1.85 or newer, or a compatible VS Code-based editor such as Cursor.
- The Call Desk Android app.
- Network access from the phone and editor to the configured Call Desk backend.

## Installation

When published, search for **Call Desk** by **Sufyaan Ahmad** in the VS Code Marketplace and select **Install**.

To install a local package:

1. Open the Extensions view.
2. Select **...** → **Install from VSIX...**.
3. Choose the Call Desk `.vsix` file.

## Pair your phone

1. Open **Call Desk** in the Activity Bar.
2. Run **Call Desk: Connect your phone**.
3. Scan the displayed QR code with the Call Desk Android app.
4. Wait for **Phone connected successfully.**

The pairing is restored automatically after an extension reload when the same backend still knows the pairing. Use **Re-pair with new QR** only when you intentionally want a new pairing.

## Backend configuration

Packaged builds use the production backend by default:

```text
wss://backend-calldesk.onrender.com
```

You can change the endpoint in **Settings → Extensions → Call Desk → Backend URL** (`phoneCallManager.backendUrl`). `wss://` is recommended for production. `ws://localhost:8080` and `ws://<PC-LAN-IP>:8080` are supported for local development only.

Changing the endpoint reconnects the extension. A pairing ID is retained, but a different backend may require pairing again.

## Privacy and security

- Production communication uses the configured secure WebSocket endpoint.
- The pairing ID is stored using VS Code SecretStorage.
- Pairing tokens are used during the QR pairing flow and are not stored as extension settings.
- Call events can include the caller name and phone number supplied by the Android app. They are relayed through the configured backend and displayed in VS Code.
- Recent call history is kept in memory by the extension and is not written to disk.

Only use a backend you trust. For production, keep the default `wss://` endpoint and do not replace it with an insecure or unknown service.

## Limitations

- Call Desk monitors normal cellular call state; it does not control the phone call.
- It does not answer, reject, record, or transcribe calls.
- It does not send SMS or synchronize contacts.
- The extension requires the Android app and an active backend connection.

## Troubleshooting

- **Unable to connect to the backend:** confirm the configured endpoint and network access.
- **Phone is not paired:** run **Call Desk: Connect your phone** and scan a new QR code.
- **Connection lost:** wait for automatic reconnect, or open the pairing page and choose **Retry Connection**.
- **Pairing does not restore:** confirm that the Android app is still paired and that the same backend endpoint is configured.

## Development

From this `vscode-extension/` folder:

```bash
npm install
npm test
npm run build
npx @vscode/vsce package
```

For development-only backend overrides, use `ws://localhost:8080` or a PC LAN address in the Backend URL setting. Press F5 and choose **Run Call Desk Extension** to launch the extension host.
