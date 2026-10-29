/* Remote AI transport tests — pure Node, no browser and no network.
   Verifies the opt-in boundary, key storage, URL normalisation, and that
   remote calls go only through the loopback /api/remote proxy. */
import { build } from "esbuild";

await build({
  entryPoints: ["src/lib/remote-ai.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/remote-ai.mjs",
  logLevel: "silent",
});

await build({
  entryPoints: ["src/lib/mentor.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/remote-mentor.mjs",
  logLevel: "silent",
});

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

globalThis.window = {
  localStorage: memoryStorage(),
  sessionStorage: memoryStorage(),
  dispatchEvent: () => true,
};

const R = await import("/tmp/remote-ai.mjs");
const M = await import("/tmp/remote-mentor.mjs");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });

/* ---------------- endpoint rules ---------------- */
check("HTTPS remote endpoints are allowed", R.isRemoteEndpointAllowed("https://api.openai.com/v1"));
check("HTTP remote endpoints are rejected", !R.isRemoteEndpointAllowed("http://api.openai.com/v1"));
check("Credentials in a remote URL are rejected", !R.isRemoteEndpointAllowed("https://user:pass@api.openai.com/v1"));
check("Malformed remote endpoints are rejected", !R.isRemoteEndpointAllowed("not a url"));
check("OpenAI URL normalises to chat/completions", R.remoteChatUrl({ provider: "openai", endpoint: "https://api.openai.com/v1" }) === "https://api.openai.com/v1/chat/completions");
check("Anthropic URL normalises to /v1/messages", R.remoteChatUrl({ provider: "anthropic", endpoint: "https://api.anthropic.com" }) === "https://api.anthropic.com/v1/messages");
check("Anthropic /v1 normalises without doubling", R.remoteChatUrl({ provider: "anthropic", endpoint: "https://api.anthropic.com/v1" }) === "https://api.anthropic.com/v1/messages");

/* ---------------- config + key storage ---------------- */
const defaults = R.loadRemoteConfig();
check("Remote is off by default", defaults.enabled === false && defaults.provider === "openai");
const saved = R.saveRemoteConfig({ ...defaults, enabled: true, endpoint: " https://api.example.com/v1 ", model: " test-model " });
check("Config trims endpoint and model", saved.endpoint === "https://api.example.com/v1" && saved.model === "test-model");
check("Config persists in local storage", R.loadRemoteConfig().enabled === true);
R.setRemoteKey("openai", "  sk-session  ", false);
check("A session key is stored without device persistence", R.getRemoteKey("openai") === "sk-session" && R.remoteKeyLocation("openai") === "session");
check("A session key does not enter local storage", window.localStorage.getItem("northstar.ai.key.openai") === null);
R.setRemoteKey("openai", "sk-device", true);
check(
  "Remembering a key moves it to device storage",
  R.remoteKeyLocation("openai") === "device" &&
    window.localStorage.getItem("northstar.ai.key.openai") === "sk-device" &&
    window.sessionStorage.getItem("northstar.ai.key.openai") === null,
);
R.clearRemoteKey("openai");
check("Removing a key clears both storages", !R.hasRemoteKey("openai") && R.remoteKeyLocation("openai") === "none");
check("Remote is not ready without a key", !R.remoteReady({ ...saved, enabled: true }));

/* ---------------- transport ---------------- */
let calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  const outer = JSON.parse(init.body);
  const body = outer.body ?? outer;
  if (body.model === "remote-model") {
    return new Response(JSON.stringify({ choices: [{ message: { content: "REMOTE OK" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ message: { content: "LOCAL OK" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

/* remote disabled → local path */
calls = [];
R.saveRemoteConfig({ ...R.DEFAULT_REMOTE_CONFIG, enabled: false });
let result = await R.aiChat({
  messages: [{ role: "user", content: "hello" }],
  localEndpoint: "/ollama",
  localModel: "local-model",
});
check("Remote off uses the local proxy", result.ok && result.source === "local" && result.text === "LOCAL OK" && calls[0]?.url === "/ollama/api/chat", JSON.stringify({ result, url: calls[0]?.url }));

/* remote enabled but missing key → no request */
calls = [];
R.saveRemoteConfig({ ...R.DEFAULT_REMOTE_CONFIG, enabled: true, endpoint: "https://api.example.com/v1", model: "remote-model" });
R.clearRemoteKey("openai");
result = await R.aiChat({
  messages: [{ role: "user", content: "hello" }],
  localEndpoint: "/ollama",
  localModel: "local-model",
});
check("Enabled remote without a key sends nothing", !result.ok && calls.length === 0 && /no key/i.test(result.error || ""), result.error);

/* remote enabled with HTTP → rejected before fetch */
calls = [];
R.saveRemoteConfig({ ...R.DEFAULT_REMOTE_CONFIG, enabled: true, endpoint: "http://api.example.com/v1", model: "remote-model" });
R.setRemoteKey("openai", "sk-test", false);
result = await R.aiChat({
  messages: [{ role: "user", content: "hello" }],
  localEndpoint: "/ollama",
  localModel: "local-model",
});
check("Remote HTTP is rejected before fetch", !result.ok && calls.length === 0 && /HTTPS/i.test(result.error || ""), result.error);

/* remote enabled with HTTPS + key → loopback proxy only */
calls = [];
R.saveRemoteConfig({ ...R.DEFAULT_REMOTE_CONFIG, enabled: true, endpoint: "https://api.example.com/v1", model: "remote-model" });
R.setRemoteKey("openai", "sk-test", false);
result = await R.aiChat({
  messages: [{ role: "user", content: "hello" }],
  localEndpoint: "/ollama",
  localModel: "local-model",
});
const proxied = calls[0] ? JSON.parse(calls[0].init.body) : null;
check("Remote call goes only to /api/remote", calls[0]?.url === "/api/remote" && proxied?.apiKey === "sk-test" && proxied?.endpoint === "https://api.example.com/v1/chat/completions", JSON.stringify({ url: calls[0]?.url, endpoint: proxied?.endpoint }));
check("Remote response is parsed and marked remote", result.ok && result.source === "remote" && result.text === "REMOTE OK", JSON.stringify(result));

/* localOnly (auto-brief) must ignore an enabled remote config */
calls = [];
result = await R.aiChat({
  messages: [{ role: "user", content: "hello" }],
  localEndpoint: "/ollama",
  localModel: "local-model",
  localOnly: true,
});
check("localOnly ignores an enabled remote API", result.ok && result.source === "local" && calls[0]?.url === "/ollama/api/chat", JSON.stringify({ result, url: calls[0]?.url }));

/* non-loopback local endpoint is rejected when remote is off */
calls = [];
R.saveRemoteConfig({ ...R.DEFAULT_REMOTE_CONFIG, enabled: false });
result = await R.aiChat({
  messages: [{ role: "user", content: "hello" }],
  localEndpoint: "https://api.example.com/v1",
  localModel: "local-model",
});
check("Non-loopback local endpoint is rejected without a request", !result.ok && calls.length === 0 && /loopback/i.test(result.error || ""), result.error);

/* auto-brief stays local-only even when a remote endpoint is typed in */
const gate = M.autoBriefAllowed({ mentorAutoBrief: true, aiEndpointNote: "https://api.example.com/v1" });
check("Auto-brief refuses a remote endpoint", gate.allowed === false && /localhost/i.test(gate.reason), gate.reason);

/* loose JSON parser */
check("Fenced JSON is parsed", R.parseJsonLoose('```json\n{"cue":"x"}\n```')?.cue === "x");
check("JSON embedded in prose is parsed", R.parseJsonLoose('Here: {"cue":"y"} done')?.cue === "y");
check("Unparseable output returns null", R.parseJsonLoose("not json") === null);

let fails = 0;
for (const r of results) {
  if (!r.pass) fails++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : "  → " + r.detail}`);
}
console.log(`\n${results.length - fails}/${results.length} remote tests passed.`);
process.exit(fails ? 1 : 0);
