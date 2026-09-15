export const BACKEND_URL_SETTING = "phoneCallManager.backendUrl";
export const DEFAULT_BACKEND_URL = "wss://backend-calldesk.onrender.com";

export interface BackendEndpoint {
  host: string;
  port: number;
}

export type BackendUrlParseResult =
  | { ok: true; href: string; host: string; port: number }
  | { ok: false; reason: "invalid" };

export function parseBackendUrl(raw: string): BackendUrlParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, reason: "invalid" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    return { ok: false, reason: "invalid" };
  }

  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "invalid" };
  }

  if (url.hostname.trim() === "") {
    return { ok: false, reason: "invalid" };
  }

  if (url.search !== "" || url.hash !== "") {
    return { ok: false, reason: "invalid" };
  }

  if (url.pathname !== "" && url.pathname !== "/") {
    return { ok: false, reason: "invalid" };
  }

  const defaultPort = url.protocol === "wss:" ? 443 : 80;
  const port = url.port === "" ? defaultPort : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    href: `${url.protocol}//${url.hostname}:${port}`,
    host: url.hostname,
    port,
  };
}

export function backendEndpointFromUrl(href: string): BackendEndpoint {
  const parsed = parseBackendUrl(href);
  if (!parsed.ok) {
    const fallback = parseBackendUrl(DEFAULT_BACKEND_URL);
    if (!fallback.ok) {
      return { host: "localhost", port: 8080 };
    }
    return { host: fallback.host, port: fallback.port };
  }

  return { host: parsed.host, port: parsed.port };
}

export function resolveBackendUrl(raw: unknown, previousHref: string): { href: string; invalid: boolean; changed: boolean } {
  const candidate = typeof raw === "string" ? parseBackendUrl(raw) : { ok: false as const, reason: "invalid" as const };
  if (!candidate.ok) {
    const previous = parseBackendUrl(previousHref);
    const href = previous.ok ? previous.href : DEFAULT_BACKEND_URL;
    return { href, invalid: true, changed: false };
  }

  return {
    href: candidate.href,
    invalid: false,
    changed: candidate.href !== previousHref,
  };
}

export function planAfterBackendUrlChange(persistedPairingId: string | null): {
  createPairing: false;
  reconnect: boolean;
} {
  return {
    createPairing: false,
    reconnect: persistedPairingId !== null && persistedPairingId.trim() !== "",
  };
}
