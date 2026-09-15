import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_BACKEND_URL,
  backendEndpointFromUrl,
  parseBackendUrl,
  planAfterBackendUrlChange,
  resolveBackendUrl,
} from "../src/config";
import {
  reconnectVscodeMessage,
  shouldCreatePairingOnConnect,
} from "../src/pairing/pairingRestore";
import { RECONNECT_VSCODE_TYPE } from "../src/websocket/protocol";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function listSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function main(): void {
  const production = parseBackendUrl(DEFAULT_BACKEND_URL);
  assert(production.ok, "1. default URL parses");
  assert(DEFAULT_BACKEND_URL === "wss://backend-calldesk.onrender.com", "1. default is production wss URL");
  assert(production.ok && production.href === "wss://backend-calldesk.onrender.com:443", "1. default normalizes to wss:// host:443");
  assert(backendEndpointFromUrl(DEFAULT_BACKEND_URL).host === "backend-calldesk.onrender.com", "1. default host is production");
  assert(backendEndpointFromUrl(DEFAULT_BACKEND_URL).port === 443, "1. default port is 443");

  const custom = parseBackendUrl("ws://192.168.1.10:8080");
  assert(custom.ok && custom.href === "ws://192.168.1.10:8080", "2. custom LAN URL is accepted");
  assert(custom.ok && custom.host === "192.168.1.10" && custom.port === 8080, "2. custom URL endpoint is parsed");

  assert(parseBackendUrl("ws://localhost:8080").ok, "3. ws://localhost:8080 override is valid");
  assert(parseBackendUrl("ws://127.0.0.1:8080").ok, "3. ws://127.0.0.1:8080 is valid");
  assert(parseBackendUrl("ws://hostname:8080").ok, "3. ws://hostname:8080 is valid");
  const localOverride = resolveBackendUrl("ws://localhost:8080", DEFAULT_BACKEND_URL);
  assert(localOverride.changed === true && localOverride.href === "ws://localhost:8080", "3. local ws://localhost:8080 override is applied");

  const secure = parseBackendUrl("wss://backend.example:443");
  assert(secure.ok && secure.href === "wss://backend.example:443", "4. wss:// URL is valid");
  const productionSecure = parseBackendUrl("wss://backend-calldesk.onrender.com");
  assert(productionSecure.ok, "4. production wss without explicit port is valid");
  assert(productionSecure.ok && productionSecure.host === "backend-calldesk.onrender.com", "4. production host");
  assert(productionSecure.ok && productionSecure.port === 443, "4. production uses TLS port 443");
  assert(!parseBackendUrl("https://backend-calldesk.onrender.com").ok, "4. https:// production URL is rejected");
  assert(parseBackendUrl("ws://backend-calldesk.onrender.com").ok, "4. ws:// remains a valid override scheme");

  assert(!parseBackendUrl("http://localhost:8080").ok, "5. http:// is rejected");
  assert(!parseBackendUrl("https://localhost:8080").ok, "6. https:// is rejected");
  assert(!parseBackendUrl("ws://localhost:99999").ok, "7. invalid port is rejected");
  assert(!parseBackendUrl("ws://localhost:0").ok, "7. port 0 is rejected");
  assert(!parseBackendUrl("").ok, "8. empty URL is rejected");
  assert(!parseBackendUrl("   ").ok, "8. whitespace URL is rejected");
  assert(!parseBackendUrl("not-a-url").ok, "9. malformed URL is rejected");
  assert(!parseBackendUrl("javascript:alert(1)").ok, "9. javascript: is rejected");
  assert(!parseBackendUrl("file://localhost:8080").ok, "9. file:// is rejected");
  assert(!parseBackendUrl("ws://localhost:8080/path").ok, "9. path is rejected");

  const unchanged = resolveBackendUrl("ws://localhost:8080", "ws://localhost:8080");
  assert(unchanged.changed === false && unchanged.invalid === false, "10. same URL is not a change");
  const changed = resolveBackendUrl("ws://10.0.0.5:8080", "ws://localhost:8080");
  assert(changed.changed === true && changed.href === "ws://10.0.0.5:8080", "10. configuration change updates URL");
  const invalidKeepsPrevious = resolveBackendUrl("http://localhost:8080", "ws://localhost:8080");
  assert(invalidKeepsPrevious.invalid === true, "10. invalid URL is flagged");
  assert(invalidKeepsPrevious.changed === false, "10. invalid URL does not replace previous");
  assert(invalidKeepsPrevious.href === "ws://localhost:8080", "10. previous valid URL is kept");

  const pairingId = "pairing-123";
  const afterChange = planAfterBackendUrlChange(pairingId);
  assert(afterChange.createPairing === false, "11. URL change does not CREATE_PAIRING");
  assert(afterChange.reconnect === true, "11. existing pairing reconnects");
  assert(shouldCreatePairingOnConnect(pairingId) === false, "11. stored pairing still skips CREATE_PAIRING");
  assert(planAfterBackendUrlChange(null).createPairing === false, "12. URL change without pairing still skips CREATE_PAIRING");
  assert(planAfterBackendUrlChange(null).reconnect === false, "12. no pairing means no reconnect payload");

  const reconnect = reconnectVscodeMessage(pairingId);
  assert(reconnect !== null && reconnect.type === RECONNECT_VSCODE_TYPE, "13. backend reconnect uses RECONNECT_VSCODE");
  assert(reconnect.pairingId === pairingId, "13. reconnect keeps pairingId");
  assert(reconnectVscodeMessage(pairingId)?.pairingId === pairingId, "14. backend restart restore still uses pairingId");
  assert(reconnectVscodeMessage(pairingId)?.type === RECONNECT_VSCODE_TYPE, "15. extension restart restore still uses RECONNECT_VSCODE");

  const srcRoot = join(__dirname, "..", "src");
  for (const file of listSourceFiles(srcRoot)) {
    const text = readFileSync(file, "utf8");
    assert(!/192\.168\./.test(text), `16. no hardcoded 192.168 IP in ${file}`);
    assert(!/172\.(1[6-9]|2\d|3[0-1])\./.test(text), `16. no hardcoded 172.16-31 IP in ${file}`);
    assert(!/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(text), `16. no hardcoded 10.x IP in ${file}`);
  }
  const websocketClient = readFileSync(join(srcRoot, "websocket", "backendWebSocketClient.ts"), "utf8");
  assert(!websocketClient.includes("backend-calldesk.onrender.com"), "16. WebSocket client does not hardcode the production URL");
  assert(!websocketClient.includes(":10000"), "16. WebSocket client does not use Render internal port 10000");

  console.log("backend URL checks passed");
}

main();
