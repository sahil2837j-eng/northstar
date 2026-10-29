#!/usr/bin/env node
/* NorthStar loopback server.
   - Serves the production build from ./dist
   - Proxies /ollama/* to a loopback Ollama instance (no CORS setup needed)
   - Exposes /api/health for a quick local status check
   - Binds to 127.0.0.1 only; never logs request bodies or notebook text. */

import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const DIST = join(ROOT, "dist");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const MAX_BODY = 2 * 1024 * 1024;
const PROXY_TIMEOUT_MS = 120_000;
const MAX_REMOTE_RESPONSE = 2 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 120_000;
const REMOTE_HOST_BLOCKLIST = [
  "localhost",
  "metadata.google.internal",
  "metadata",
];
const REMOTE_SUFFIX_BLOCKLIST = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
  ".test",
  ".invalid",
  ".example",
];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);
const BIND_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!BIND_HOSTS.has(HOST)) {
  fail(`Refusing to bind to ${HOST}: NorthStar is loopback-only. Use 127.0.0.1 or localhost.`);
}
if (!LOOPBACK_HOSTS.has(new URL(OLLAMA_URL).hostname)) {
  fail(`Refusing to proxy to ${OLLAMA_URL}: the upstream must be on this machine.`);
}
if (!existsSync(join(DIST, "index.html"))) {
  fail("dist/index.html is missing. Run `npm run build` first.");
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(json);
}

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

async function ollamaHealth() {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { reachable: false, status: res.status, models: [], ms: Date.now() - started };
    const data = await res.json();
    const models = Array.isArray(data?.models)
      ? data.models
          .map((m) => (m && typeof m === "object" ? m.name : null))
          .filter((name) => typeof name === "string")
      : [];
    return { reachable: true, status: res.status, models, ms: Date.now() - started };
  } catch {
    clearTimeout(timer);
    return { reachable: false, status: 0, models: [], ms: Date.now() - started };
  }
}

function proxyOllama(req, res, url) {
  if (!["GET", "POST", "HEAD", "DELETE"].includes(req.method || "")) {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const upstreamPath = (url.pathname.replace(/^\/ollama/, "") || "/") + url.search;
  const upstream = new URL(OLLAMA_URL);
  const headers = { accept: req.headers.accept || "application/json" };
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];

  const request = http.request(
    {
      hostname: upstream.hostname,
      port: upstream.port || 80,
      path: `${upstream.pathname.replace(/\/+$/, "")}${upstreamPath}`,
      method: req.method,
      headers,
      timeout: PROXY_TIMEOUT_MS,
    },
    (upstreamRes) => {
      securityHeaders(res);
      res.statusCode = upstreamRes.statusCode || 502;
      if (upstreamRes.headers["content-type"]) {
        res.setHeader("Content-Type", upstreamRes.headers["content-type"]);
      }
      res.setHeader("Cache-Control", "no-store");
      upstreamRes.pipe(res);
    },
  );

  request.on("timeout", () => request.destroy(new Error("Upstream timed out.")));
  request.on("error", (error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendJson(res, 502, {
      error: "Local AI upstream is not reachable.",
      upstream: OLLAMA_URL,
      detail: error.message,
    });
  });

  if (req.method === "GET" || req.method === "HEAD") {
    request.end();
  } else {
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        request.destroy(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.pipe(request);
  }
}

/* ---------------- opt-in remote AI proxy ----------------
   The browser sends the key only to this loopback server. This handler
   validates the destination, resolves it to a public address, pins the
   connection to that address, refuses redirects, and never logs the key,
   the notebook text, or the upstream body. */

function ipv4Private(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function ipv6Private(ip) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("::ffff:")) {
    const v4 = s.slice(7);
    if (net.isIP(v4) === 4) return ipv4Private(v4);
  }
  if (s.startsWith("fc") || s.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(s)) return true;
  if (s.startsWith("ff")) return true;
  if (s.startsWith("2001:db8")) return true;
  return false;
}

function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return ipv4Private(ip);
  if (family === 6) return ipv6Private(ip);
  return true;
}

function remoteHostAllowed(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (REMOTE_HOST_BLOCKLIST.includes(host)) return false;
  if (REMOTE_SUFFIX_BLOCKLIST.some((suffix) => host.endsWith(suffix))) return false;
  return true;
}

async function resolvePublicHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!remoteHostAllowed(host)) throw Object.assign(new Error("Remote host is not allowed."), { status: 400 });
  const literal = net.isIP(host);
  if (literal) {
    if (isPrivateAddress(host)) throw Object.assign(new Error("Remote host is private."), { status: 400 });
    return { address: host, family: literal };
  }
  const rows = await dns.promises.lookup(host, { all: true, verbatim: true });
  if (!rows.length) throw Object.assign(new Error("Remote host did not resolve."), { status: 400 });
  if (rows.some((row) => isPrivateAddress(row.address))) {
    throw Object.assign(new Error("Remote host resolves to a private address."), { status: 400 });
  }
  const chosen = rows.find((row) => row.family === 4) ?? rows[0];
  return { address: chosen.address, family: chosen.family };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Request body too large."), { status: 413 }));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
    return (
      u.protocol === "http:" &&
      (host === "127.0.0.1" || host === "localhost" || host === "::1") &&
      port === PORT
    );
  } catch {
    return false;
  }
}

function remoteRequestHeaders(provider, apiKey, payload) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": "NorthStar/2.0",
    "content-length": Buffer.byteLength(payload),
  };
  if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function forwardRemote({ endpoint, provider, apiKey, body }) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      reject(Object.assign(new Error("Invalid remote endpoint."), { status: 400 }));
      return;
    }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      reject(Object.assign(new Error("Remote endpoint must be HTTPS."), { status: 400 }));
      return;
    }
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!remoteHostAllowed(host)) {
      reject(Object.assign(new Error("Remote host is not allowed."), { status: 400 }));
      return;
    }

    resolvePublicHost(host)
      .then(({ address, family }) => {
        const payload = JSON.stringify(body);
        if (Buffer.byteLength(payload) > MAX_BODY) {
          reject(Object.assign(new Error("Remote request body too large."), { status: 413 }));
          return;
        }
        const options = {
          hostname: host,
          port: url.port ? Number(url.port) : 443,
          path: `${url.pathname || "/"}${url.search}`,
          method: "POST",
          headers: remoteRequestHeaders(provider, apiKey, payload),
          timeout: REMOTE_TIMEOUT_MS,
          lookup: (_hostname, lookupOptions, callback) => {
            if (lookupOptions && lookupOptions.all) {
              callback(null, [{ address, family }]);
            } else {
              callback(null, address, family);
            }
          },
        };
        const request = https.request(options, (upstream) => {
          const status = upstream.statusCode || 502;
          if (status >= 300 && status < 400) {
            upstream.resume();
            reject(Object.assign(new Error("Remote redirects are not allowed."), { status: 502 }));
            return;
          }
          let size = 0;
          let tooLarge = false;
          const chunks = [];
          upstream.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_REMOTE_RESPONSE) {
              tooLarge = true;
              return;
            }
            chunks.push(chunk);
          });
          upstream.on("end", () => {
            if (tooLarge) {
              reject(Object.assign(new Error("Remote response too large."), { status: 502 }));
              return;
            }
            resolve({ status, chunks });
          });
          upstream.on("error", reject);
        });
        request.on("timeout", () => request.destroy(new Error("Remote request timed out.")));
        request.on("error", reject);
        request.end(payload);
      })
      .catch(reject);
  });
}

async function proxyRemote(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }
  if (!sameOrigin(req) || req.headers["x-northstar-remote"] !== "1") {
    sendJson(res, 403, { error: "Remote requests must come from this app." });
    return;
  }
  if (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin") {
    sendJson(res, 403, { error: "Cross-site remote requests are not allowed." });
    return;
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { error: "Content-Type must be application/json." });
    return;
  }

  let parsed;
  try {
    const raw = await readBody(req);
    parsed = JSON.parse(raw.toString("utf8"));
  } catch (e) {
    sendJson(res, e?.status || 400, { error: e?.status === 413 ? "Request body too large." : "Invalid JSON." });
    return;
  }

  const endpoint = typeof parsed?.endpoint === "string" ? parsed.endpoint.trim() : "";
  const provider = parsed?.provider === "anthropic" ? "anthropic" : parsed?.provider === "openai" ? "openai" : "";
  const apiKey = typeof parsed?.apiKey === "string" ? parsed.apiKey.trim() : "";
  const body = parsed?.body;
  if (!endpoint || !provider || !apiKey || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) {
    sendJson(res, 400, { error: "Remote request is missing endpoint, provider, key, or body." });
    return;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendJson(res, 400, { error: "Remote request body must be a JSON object." });
    return;
  }

  try {
    const { status, chunks } = await forwardRemote({ endpoint, provider, apiKey, body });
    if (status >= 400) {
      sendJson(res, status, { error: "Remote endpoint rejected the request." });
      return;
    }
    let json;
    try {
      let text = Buffer.concat(chunks).toString("utf8");
      /* A hostile or misconfigured endpoint could echo the request key.
         Never hand it back to the browser. */
      if (apiKey) text = text.split(apiKey).join("[redacted]");
      json = JSON.parse(text);
    } catch {
      sendJson(res, 502, { error: "Remote endpoint returned non-JSON." });
      return;
    }
    sendJson(res, 200, json);
  } catch (e) {
    const status = e?.status === 400 || e?.status === 413 ? e.status : 502;
    sendJson(res, status, {
      error:
        status === 400
          ? "Remote endpoint rejected by safety checks."
          : status === 413
            ? "Remote request body too large."
            : "Remote endpoint is not reachable.",
    });
  }
}

function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: "Bad path." });
    return;
  }

  const hasExtension = extname(pathname) !== "";
  const relative = pathname === "/" ? "/index.html" : pathname;
  let filePath = resolve(DIST, `.${relative}`);

  if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    if (hasExtension) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    filePath = join(DIST, "index.html");
  }

  const stat = statSync(filePath);
  securityHeaders(res);
  res.setHeader("Content-Type", MIME[extname(filePath).toLowerCase()] || "application/octet-stream");
  res.setHeader("Content-Length", stat.size);
  res.setHeader(
    "Cache-Control",
    filePath.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
  );
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === "/api/health" || url.pathname === "/api/ai/status") {
    const ai = await ollamaHealth();
    sendJson(res, 200, {
      ok: true,
      app: "northstar",
      version: "2.0.0",
      ai: {
        endpoint: "/ollama",
        upstream: OLLAMA_URL,
        ...ai,
      },
    });
    return;
  }

  if (url.pathname === "/api/remote") {
    await proxyRemote(req, res);
    return;
  }

  if (url.pathname === "/ollama" || url.pathname.startsWith("/ollama/")) {
    proxyOllama(req, res, url);
    return;
  }

  serveStatic(req, res, url);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    fail(`Port ${PORT} is already in use. Stop the other server or set PORT to another value.`);
  }
  fail(error.message);
});

server.listen(PORT, HOST, () => {
  console.log(`NorthStar running at http://${HOST}:${PORT}`);
  console.log(`Local AI proxy: /ollama -> ${OLLAMA_URL}`);
  console.log("Loopback only. No request bodies are logged.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
