/* Endpoint rules shared by the mentor, Loci cues, Curator, and remote transport. */

export type ProviderKind = "ollama" | "openai";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

export function isLocalEndpoint(url: string): boolean {
  const raw = url.trim();
  if (!raw) return false;
  /* Same-origin paths are served by the loopback app server (e.g. /ollama).
     Reject protocol-relative URLs, which would leave this machine. */
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return true;
  try {
    const u = new URL(raw);
    return LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export function detectProvider(url: string): ProviderKind {
  const raw = url.trim().toLowerCase();
  if (raw.startsWith("/ollama") || /11434|\/api\/(chat|generate|tags)/.test(raw)) return "ollama";
  return "openai";
}

/** Normalise what the user typed into a callable chat URL. */
export function chatUrl(raw: string, kind: ProviderKind = detectProvider(raw)): string {
  const base = raw.trim().replace(/\/+$/, "");
  if (kind === "ollama") {
    if (/\/api\/chat$/.test(base)) return base;
    if (/\/api$/.test(base)) return base + "/chat";
    return base + "/api/chat";
  }
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v1$/.test(base)) return base + "/chat/completions";
  return base + "/v1/chat/completions";
}

/** Normalise what the user typed into a model-list URL for a connection test. */
export function modelsUrl(raw: string, kind: ProviderKind = detectProvider(raw)): string {
  const base = raw.trim().replace(/\/+$/, "");
  if (kind === "ollama") {
    if (/\/api\/tags$/.test(base)) return base;
    if (/\/api$/.test(base)) return base + "/tags";
    return base + "/api/tags";
  }
  if (/\/models$/.test(base)) return base;
  if (/\/v1$/.test(base)) return base + "/models";
  return base + "/v1/models";
}

/** Pull a list of model names out of an Ollama or OpenAI-compatible response. */
export function modelNames(data: unknown, kind: ProviderKind): string[] {
  const o = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (kind === "ollama") {
    const models = Array.isArray(o.models) ? o.models : [];
    return models
      .map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>).name : null))
      .filter((n): n is string => typeof n === "string");
  }
  const models = Array.isArray(o.data) ? o.data : [];
  return models
    .map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>).id : null))
    .filter((n): n is string => typeof n === "string");
}
