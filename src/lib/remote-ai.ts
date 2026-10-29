/* Remote AI transport, opt-in and explicit.
   - Off by default. The local endpoint remains the normal path.
   - The API key never enters UIState, LociState, exports, or logs.
   - The browser sends the key only to the loopback NorthStar server, which
     forwards it to an HTTPS endpoint. Remote HTTP is rejected.
   - Auto-briefings remain local-only; remote calls are always user-initiated. */

import { chatUrl, detectProvider, isLocalEndpoint } from "./ai-endpoints";

export type RemoteProvider = "openai" | "anthropic";

export interface RemoteConfig {
  version: 1;
  enabled: boolean;
  provider: RemoteProvider;
  endpoint: string;
  model: string;
  rememberKey: boolean;
}

export const REMOTE_CONFIG_KEY = "northstar.ai.remote.v1";
export const REMOTE_CHANGED_EVENT = "northstar:remote-changed";

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  version: 1,
  enabled: false,
  provider: "openai",
  endpoint: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  rememberKey: false,
};

const keyName = (provider: RemoteProvider) => `northstar.ai.key.${provider}`;

function storage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function announce() {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(REMOTE_CHANGED_EVENT));
  } catch {
    /* no DOM */
  }
}

export function loadRemoteConfig(): RemoteConfig {
  try {
    const raw = storage("local")?.getItem(REMOTE_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_REMOTE_CONFIG };
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      version: 1,
      enabled: o.enabled === true,
      provider: o.provider === "anthropic" ? "anthropic" : "openai",
      endpoint: typeof o.endpoint === "string" ? o.endpoint : DEFAULT_REMOTE_CONFIG.endpoint,
      model: typeof o.model === "string" ? o.model : DEFAULT_REMOTE_CONFIG.model,
      rememberKey: o.rememberKey === true,
    };
  } catch {
    return { ...DEFAULT_REMOTE_CONFIG };
  }
}

export function saveRemoteConfig(config: RemoteConfig): RemoteConfig {
  const next: RemoteConfig = {
    version: 1,
    enabled: config.enabled === true,
    provider: config.provider === "anthropic" ? "anthropic" : "openai",
    endpoint: config.endpoint.trim(),
    model: config.model.trim(),
    rememberKey: config.rememberKey === true,
  };
  try {
    storage("local")?.setItem(REMOTE_CONFIG_KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode */
  }
  announce();
  return next;
}

/** The key is read from session storage first, then device storage. */
export function getRemoteKey(provider: RemoteProvider): string {
  try {
    return (
      storage("session")?.getItem(keyName(provider)) ||
      storage("local")?.getItem(keyName(provider)) ||
      ""
    );
  } catch {
    return "";
  }
}

export function hasRemoteKey(provider: RemoteProvider): boolean {
  return Boolean(getRemoteKey(provider));
}

export function remoteKeyLocation(provider: RemoteProvider): "session" | "device" | "none" {
  try {
    if (storage("local")?.getItem(keyName(provider))) return "device";
    if (storage("session")?.getItem(keyName(provider))) return "session";
    return "none";
  } catch {
    return "none";
  }
}

export function setRemoteKey(provider: RemoteProvider, rawKey: string, remember: boolean): void {
  const key = rawKey.trim().slice(0, 4096);
  try {
    if (key && remember) {
      storage("local")?.setItem(keyName(provider), key);
      storage("session")?.removeItem(keyName(provider));
    } else if (key) {
      storage("session")?.setItem(keyName(provider), key);
      storage("local")?.removeItem(keyName(provider));
    } else {
      storage("session")?.removeItem(keyName(provider));
      storage("local")?.removeItem(keyName(provider));
    }
  } catch {
    /* quota or private mode */
  }
  announce();
}

export function clearRemoteKey(provider: RemoteProvider): void {
  try {
    storage("session")?.removeItem(keyName(provider));
    storage("local")?.removeItem(keyName(provider));
  } catch {
    /* ignore */
  }
  announce();
}

/** Remote endpoints must be HTTPS and must not carry credentials in the URL. */
export function isRemoteEndpointAllowed(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && !u.username && !u.password && Boolean(u.hostname);
  } catch {
    return false;
  }
}

export function remoteChatUrl(config: Pick<RemoteConfig, "provider" | "endpoint">): string {
  const base = config.endpoint.trim().replace(/\/+$/, "");
  if (config.provider === "anthropic") {
    if (/\/messages$/.test(base)) return base;
    if (/\/v1$/.test(base)) return `${base}/messages`;
    return `${base}/v1/messages`;
  }
  return chatUrl(base, "openai");
}

export function remoteReady(config: RemoteConfig = loadRemoteConfig()): boolean {
  return (
    config.enabled &&
    Boolean(config.endpoint.trim()) &&
    Boolean(config.model.trim()) &&
    isRemoteEndpointAllowed(config.endpoint) &&
    hasRemoteKey(config.provider)
  );
}

export type AiRole = "system" | "user" | "assistant";
export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiChatOptions {
  messages: AiMessage[];
  localEndpoint: string;
  localModel: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
  /** Background work (auto-brief) must never use the remote API, even when it is on. */
  localOnly?: boolean;
}

export interface AiChatResult {
  ok: boolean;
  text?: string;
  error?: string;
  ms: number;
  source: "local" | "remote";
}

function contentFrom(json: unknown, source: "local" | "remote", provider?: RemoteProvider): string {
  if (!json || typeof json !== "object") return "";
  const o = json as Record<string, any>;
  if (source === "remote" && provider === "anthropic") {
    if (Array.isArray(o.content)) {
      return o.content
        .map((part: any) => (part && part.type === "text" && typeof part.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
    }
    return "";
  }
  if (typeof o.message?.content === "string") return o.message.content;
  const content = o.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  return typeof o.response === "string" ? o.response : "";
}

function errorMessage(e: unknown, local: boolean): string {
  if (e && typeof e === "object" && (e as { name?: string }).name === "AbortError") {
    return "Timed out. The model did not answer in time.";
  }
  if (local) {
    return "Could not reach the local endpoint. Start Ollama and open the app through `npm start`, or point this at an OpenAI-compatible local server.";
  }
  return "Could not reach the remote endpoint. Check the endpoint, key, and network, then try again.";
}

export async function aiChat(opts: AiChatOptions): Promise<AiChatResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const config = loadRemoteConfig();

  if (!opts.localOnly && config.enabled) {
    if (!isRemoteEndpointAllowed(config.endpoint)) {
      return {
        ok: false,
        error: "Remote API is enabled, but the endpoint is not a valid HTTPS URL. Nothing was sent.",
        ms: Date.now() - start,
        source: "remote",
      };
    }
    if (!config.model.trim()) {
      return {
        ok: false,
        error: "Remote API is enabled, but no model is set. Nothing was sent.",
        ms: Date.now() - start,
        source: "remote",
      };
    }
    const apiKey = getRemoteKey(config.provider);
    if (!apiKey) {
      return {
        ok: false,
        error: "Remote API is enabled, but no key is saved. Add a key in Settings. Nothing was sent.",
        ms: Date.now() - start,
        source: "remote",
      };
    }

    const system = opts.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const conversation = opts.messages.filter((m) => m.role !== "system");
    const body =
      config.provider === "anthropic"
        ? {
            model: config.model,
            ...(system ? { system } : {}),
            messages: conversation,
            max_tokens: opts.maxTokens ?? 1024,
            temperature: opts.temperature ?? 0.7,
          }
        : {
            model: config.model,
            messages: opts.messages,
            stream: false,
            temperature: opts.temperature ?? 0.7,
            ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("/api/remote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Northstar-Remote": "1" },
        body: JSON.stringify({
          endpoint: remoteChatUrl(config),
          provider: config.provider,
          apiKey,
          body,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        return {
          ok: false,
          error: `Remote endpoint answered ${res.status}. Nothing was written to your data.`,
          ms: Date.now() - start,
          source: "remote",
        };
      }
      const json = (await res.json()) as unknown;
      const text = contentFrom(json, "remote", config.provider);
      if (!text) {
        return {
          ok: false,
          error: "Remote endpoint returned no message content.",
          ms: Date.now() - start,
          source: "remote",
        };
      }
      return { ok: true, text, ms: Date.now() - start, source: "remote" };
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, error: errorMessage(e, false), ms: Date.now() - start, source: "remote" };
    }
  }

  /* Local path. A non-loopback endpoint is rejected before any request. */
  const endpoint = opts.localEndpoint.trim();
  if (!isLocalEndpoint(endpoint)) {
    return {
      ok: false,
      error: "Local AI only accepts loopback endpoints or the /ollama proxy. Nothing was sent.",
      ms: Date.now() - start,
      source: "local",
    };
  }
  const kind = detectProvider(endpoint);
  const url = chatUrl(endpoint, kind);
  const model = opts.localModel.trim() || "qwen2.5:7b-instruct";
  const body =
    kind === "ollama"
      ? {
          model,
          messages: opts.messages,
          stream: false,
          ...(opts.json ? { format: "json" } : {}),
          options: {
            temperature: opts.temperature ?? 0.7,
            ...(opts.maxTokens ? { num_predict: opts.maxTokens } : {}),
          },
        }
      : {
          model,
          messages: opts.messages,
          stream: false,
          temperature: opts.temperature ?? 0.7,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        ok: false,
        error: `Endpoint answered ${res.status}.`,
        ms: Date.now() - start,
        source: "local",
      };
    }
    const json = (await res.json()) as unknown;
    const text = contentFrom(json, "local");
    if (!text) {
      return {
        ok: false,
        error: "Endpoint returned no message content.",
        ms: Date.now() - start,
        source: "local",
      };
    }
    return { ok: true, text, ms: Date.now() - start, source: "local" };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: errorMessage(e, true), ms: Date.now() - start, source: "local" };
  }
}

/** Strip a fenced JSON block, then parse. Used by Curator and cue generation. */
export function parseJsonLoose(raw: string): unknown | null {
  const text = raw.trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
