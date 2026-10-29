import { useState } from "react";
import { Bay, Eyebrow } from "../components/ui";
import {
  clearRemoteKey,
  getRemoteKey,
  isRemoteEndpointAllowed,
  loadRemoteConfig,
  remoteChatUrl,
  saveRemoteConfig,
  setRemoteKey,
  type RemoteConfig,
  type RemoteProvider,
} from "../lib/remote-ai";
import { useRemoteKey } from "../lib/use-remote-ai";
import { useApp } from "../lib/ctx";

const PROVIDERS: { id: RemoteProvider; label: string; endpoint: string; model: string }[] = [
  {
    id: "openai",
    label: "OpenAI-compatible",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    endpoint: "https://api.anthropic.com",
    model: "claude-3-5-haiku-latest",
  },
];

function testBody(provider: RemoteProvider, model: string) {
  const messages = [{ role: "user" as const, content: "Reply with the single word OK." }];
  return provider === "anthropic"
    ? { model, messages, max_tokens: 1, temperature: 0 }
    : { model, messages, stream: false, max_tokens: 1, temperature: 0 };
}

export default function RemoteAISettings({ compact = false }: { compact?: boolean }) {
  const { toast } = useApp();
  const [form, setForm] = useState<RemoteConfig>(() => loadRemoteConfig());
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const keyState = useRemoteKey(form.provider);

  const set = <K extends keyof RemoteConfig>(key: K, value: RemoteConfig[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const switchProvider = (provider: RemoteProvider) => {
    const meta = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
    setForm((f) => ({
      ...f,
      provider,
      endpoint: f.provider === provider ? f.endpoint : meta.endpoint,
      model: f.provider === provider ? f.model : meta.model,
    }));
    setKeyInput("");
  };

  const save = () => {
    const endpoint = form.endpoint.trim();
    const model = form.model.trim();
    if (form.enabled && !isRemoteEndpointAllowed(endpoint)) {
      toast("Remote API needs a valid HTTPS endpoint. Nothing was saved.", "plain");
      return;
    }
    if (form.enabled && !model) {
      toast("Remote API needs a model name. Nothing was saved.", "plain");
      return;
    }
    const existing = getRemoteKey(form.provider);
    const nextKey = keyInput.trim() || existing;
    const saved = saveRemoteConfig({ ...form, endpoint, model });
    if (nextKey) setRemoteKey(form.provider, nextKey, saved.rememberKey);
    else setRemoteKey(form.provider, "", saved.rememberKey);
    setForm(saved);
    setKeyInput("");
    toast(
      saved.enabled
        ? "Remote API enabled. Calls you start will use it; auto-brief stays local."
        : "Remote API disabled. Local AI is the only path again.",
      "lit",
    );
  };

  const clearKey = () => {
    clearRemoteKey(form.provider);
    setKeyInput("");
    toast("Remote key removed from this browser. Nothing else changed.", "plain");
  };

  const test = async () => {
    const endpoint = form.endpoint.trim();
    const model = form.model.trim();
    if (!isRemoteEndpointAllowed(endpoint)) {
      toast("Enter a valid HTTPS endpoint first.", "plain");
      return;
    }
    if (!model) {
      toast("Enter a model name first.", "plain");
      return;
    }
    const key = keyInput.trim() || getRemoteKey(form.provider);
    if (!key) {
      toast("Add a key before testing.", "plain");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/remote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Northstar-Remote": "1" },
        body: JSON.stringify({
          endpoint: remoteChatUrl({ provider: form.provider, endpoint }),
          provider: form.provider,
          apiKey: key,
          body: testBody(form.provider, model),
        }),
      });
      if (res.ok) {
        toast("Remote connection works. The test used one tiny request.", "lit");
      } else {
        toast(`Remote endpoint answered ${res.status}. Check the key, model, and endpoint.`, "plain");
      }
    } catch {
      toast("Could not reach the remote endpoint. Check the network and endpoint.", "plain");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Bay className={compact ? "p-3" : "p-4"}>
      <Eyebrow right={form.enabled ? "opt-in · on" : "opt-in · off"}>Remote cloud API</Eyebrow>
      <p className="pb-3 text-[12px] muted">
        Off by default. When you turn it on and save a key, the Guide, Mentor, Loci cue helper, and
        Curator can use this endpoint instead of local Ollama. Auto-briefings stay local. The key is
        kept outside your notebook, exports, and logs.
      </p>

      <label className="mb-3 flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
          className="mt-1"
        />
        <span>
          Use this remote API when I press a send or generate button
          <span className="block text-[11px] faint">
            Nothing is sent in the background. Turning this off returns every call to local AI.
          </span>
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px]">
          <span className="eyebrow">Provider</span>
          <select
            value={form.provider}
            onChange={(e) => switchProvider(e.target.value as RemoteProvider)}
            className="mt-1 w-full"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px]">
          <span className="eyebrow">Model</span>
          <input
            value={form.model}
            onChange={(e) => set("model", e.target.value)}
            placeholder={PROVIDERS.find((p) => p.id === form.provider)?.model}
            className="mt-1 w-full"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      <label className="mt-3 block text-[12px]">
        <span className="eyebrow">HTTPS endpoint</span>
        <input
          value={form.endpoint}
          onChange={(e) => set("endpoint", e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="mt-1 w-full"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="mt-1 block text-[11px] faint">
          The app server checks the destination, refuses local/private hosts and redirects, and
          forwards the key only to the endpoint you enter.
        </span>
      </label>

      <label className="mt-3 block text-[12px]">
        <span className="eyebrow">API key</span>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={
            keyState.hasKey
              ? keyState.location === "device"
                ? "Saved on this device — leave blank to keep it"
                : "Saved for this tab — leave blank to keep it"
              : "Paste a key; it is never exported"
          }
          className="mt-1 w-full"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] faint">
          <span>
            {keyState.hasKey
              ? keyState.location === "device"
                ? "Key stored on this device."
                : "Key stored for this tab only."
              : "No key stored."}
          </span>
          {keyState.hasKey && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearKey}>
              Remove key
            </button>
          )}
        </span>
      </label>

      <label className="mt-3 flex items-start gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={form.rememberKey}
          onChange={(e) => set("rememberKey", e.target.checked)}
          className="mt-1"
        />
        <span>
          Remember the key on this device
          <span className="block text-[11px] faint">
            Off: the key lives in this tab&apos;s session storage and disappears when the browser
            closes. On: it stays in this browser profile until you remove it.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-3">
        <button className="btn btn-primary btn-sm" type="button" onClick={save}>
          Save remote settings
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={test} disabled={busy}>
          {busy ? "Testing…" : "Test connection"}
        </button>
        <span className="mono text-[10px] faint">
          {form.enabled && keyState.hasKey
            ? "ready"
            : form.enabled
              ? "enabled · key missing"
              : "local AI only"}
        </span>
      </div>
    </Bay>
  );
}
