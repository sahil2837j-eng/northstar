import type { CurriculumExercise, HarnessTest } from "./curriculum";

export interface CaseResult {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface RunOutcome {
  timedOut: boolean;
  cases: CaseResult[];
  logs: string[];
  error?: string;
  durationMs: number;
}

/* The worker never sees the DOM. It is created inside a sandboxed iframe
   (no allow-same-origin) whose CSP forbids all network access. */
const WORKER_SRC = [
  "self.onmessage = function (ev) {",
  "  var msg = ev.data || {};",
  "  var fnName = msg.fn;",
  "  var tests = msg.tests || [];",
  "  var cases = [];",
  "  var hadLog = false;",
  "  try {",
  "    console.log = function () { hadLog = true; };",
  "  } catch (e) {}",
  "  function deepEq(a, b) {",
  "    if (typeof a === 'number' && typeof b === 'number') {",
  "      if (a === b) return true;",
  "      return Math.abs(a - b) < 1e-6;",
  "    }",
  "    if (a === b) return true;",
  "    if (a && b && typeof a === 'object' && typeof b === 'object') {",
  "      if (Array.isArray(a) !== Array.isArray(b)) return false;",
  "      var ka = Object.keys(a), kb = Object.keys(b);",
  "      if (ka.length !== kb.length) return false;",
  "      for (var i = 0; i < ka.length; i++) {",
  "        if (kb.indexOf(ka[i]) === -1) return false;",
  "        if (!deepEq(a[ka[i]], b[ka[i]])) return false;",
  "      }",
  "      return true;",
  "    }",
  "    return false;",
  "  }",
  "  function show(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }",
  "  for (var i = 0; i < tests.length; i++) {",
  "    var t = tests[i] || {};",
  "    var name = t.name || (fnName + ' — case ' + (i + 1));",
  "    var pass = false, detail = '';",
  "    hadLog = false;",
  "    try {",
  "      var F = new Function('\"use strict\";\\n' + msg.code + '\\n; return typeof ' + fnName + ' === \"function\" ? ' + fnName + ' : null;');",
  "      var impl = F();",
  "      if (typeof impl !== 'function') {",
  "        detail = 'Function ' + fnName + ' was not found in your code.';",
  "      } else {",
  "        var args = t.argsExpr",
  "          ? (new Function('return (' + t.argsExpr + ');'))()",
  "          : (t.args ? JSON.parse(JSON.stringify(t.args)) : []);",
  "        var before = JSON.stringify(args);",
  "        var result;",
  "        if (t.call) {",
  "          var made = impl.apply(null, args);",
  "          if (typeof made !== 'function') throw new Error('Expected ' + fnName + '(\\u2026) to return a function.');",
  "          result = made.apply(null, t.call);",
  "        } else if (t.calls) {",
  "          var made2 = impl.apply(null, args);",
  "          if (typeof made2 !== 'function') throw new Error('Expected ' + fnName + '(\\u2026) to return a function.');",
  "          result = undefined;",
  "          for (var k = 0; k < t.calls; k++) result = made2();",
  "        } else {",
  "          result = impl.apply(null, args);",
  "        }",
  "        var after = JSON.stringify(args);",
  "        if (before !== after) {",
  "          detail = 'This function changed the argument it was given; inputs must not be mutated.';",
  "        } else if (hadLog) {",
  "          detail = 'console.log is not allowed in submitted code.';",
  "        } else if (deepEq(result, t.expected)) {",
  "          pass = true;",
  "        } else {",
  "          detail = 'Expected ' + show(t.expected) + ' but got ' + show(result) + '.';",
  "        }",
  "      }",
  "    } catch (err) {",
  "      detail = String((err && err.message) || err);",
  "    }",
  "    cases.push({ name: name, pass: pass, detail: detail });",
  "  }",
  "  self.postMessage({ cases: cases, logs: [] });",
  "};",
].join("\n");

const IFRAME_SRC = [
  "<!doctype html><html><head><meta charset='utf-8'>",
  "<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\">",
  "</head><body><script>",
  "var workerUrl = null;",
  "window.addEventListener('message', function (ev) {",
  "  var d = ev.data || {};",
  "  if (d.__ns === 'worker-src') {",
  "    try {",
  "      var blob = new Blob([d.src], { type: 'text/javascript' });",
  "      workerUrl = URL.createObjectURL(blob);",
  "      parent.postMessage({ __ns: 'ready' }, '*');",
  "    } catch (e) { parent.postMessage({ __ns: 'error', message: String(e) }, '*'); }",
  "    return;",
  "  }",
  "  if (d.__ns === 'run') {",
  "    if (!workerUrl) { parent.postMessage({ __ns: 'error', message: 'Sandbox did not start.' }, '*'); return; }",
  "    var w;",
  "    try { w = new Worker(workerUrl); } catch (e) { parent.postMessage({ __ns: 'error', message: String(e) }, '*'); return; }",
  "    var done = false;",
  "    var t = setTimeout(function () {",
  "      if (done) return; done = true;",
  "      try { w.terminate(); } catch (e) {}",
  "      parent.postMessage({ __ns: 'result', timedOut: true }, '*');",
  "    }, d.timeoutMs);",
  "    w.onmessage = function (mv) {",
  "      if (done) return; done = true; clearTimeout(t);",
  "      try { w.terminate(); } catch (e) {}",
  "      parent.postMessage({ __ns: 'result', payload: mv.data, timedOut: false }, '*');",
  "    };",
  "    w.onerror = function (err) {",
  "      if (done) return; done = true; clearTimeout(t);",
  "      try { w.terminate(); } catch (e) {}",
  "      parent.postMessage({ __ns: 'result', error: String((err && err.message) || err), timedOut: false }, '*');",
  "    };",
  "    w.postMessage({ code: d.code, fn: d.fn, tests: d.tests });",
  "  }",
  "});",
  "</scr" + "ipt></body></html>",
].join("\n");

export const SANDBOX_NOTE =
  "Code runs in a Web Worker inside a sandboxed iframe with a Content-Security-Policy that blocks all network access. The page owns the 5 second timeout and destroys the iframe if it expires. This is best-effort isolation, not an adversarial proof — do not paste secrets into it.";

export function runHarness(
  ex: Pick<CurriculumExercise, "fn" | "tests">,
  code: string,
  timeoutMs = 5000,
): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    let timer = 0;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("title", "NorthStar code sandbox");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;left:-10000px;top:0;width:600px;height:400px;border:0;opacity:0;pointer-events:none";

    const finish = (out: Omit<RunOutcome, "durationMs">) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      iframe.remove();
      resolve({ ...out, durationMs: Date.now() - start });
    };

    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow) return;
      const d: any = ev.data || {};
      if (d.__ns === "ready") {
        iframe.contentWindow?.postMessage(
          { __ns: "run", code, fn: ex.fn, tests: ex.tests as HarnessTest[], timeoutMs },
          "*",
        );
      } else if (d.__ns === "error") {
        finish({ timedOut: false, cases: [], logs: [], error: d.message });
      } else if (d.__ns === "result") {
        finish({
          timedOut: !!d.timedOut,
          cases: d.payload?.cases ?? [],
          logs: d.payload?.logs ?? [],
          error: d.error,
        });
      }
    };

    window.addEventListener("message", onMsg);
    timer = window.setTimeout(
      () =>
        finish({
          timedOut: true,
          cases: [],
          logs: [],
          error: "Your code did not finish within 5 seconds. The sandbox was destroyed.",
        }),
      timeoutMs + 400,
    );

    iframe.addEventListener("load", () => {
      iframe.contentWindow?.postMessage({ __ns: "worker-src", src: WORKER_SRC }, "*");
    });
    iframe.srcdoc = IFRAME_SRC;
    document.body.appendChild(iframe);
  });
}

export interface SelfCheckRow {
  id: string;
  title: string;
  refPassed: number;
  refTotal: number;
  antiStopped: number;
  antiTotal: number;
  ok: boolean;
}

/** Harness self-check: reference solutions must pass every case; anti-solutions must fail at least one. */
export async function selfCheck(
  exercises: CurriculumExercise[],
  onRow?: (r: SelfCheckRow) => void,
): Promise<SelfCheckRow[]> {
  const rows: SelfCheckRow[] = [];
  for (const ex of exercises) {
    const ref = await runHarness(ex, ex.ref);
    const refPassed = ref.timedOut ? 0 : ref.cases.filter((c) => c.pass).length;
    let antiStopped = 0;
    for (const anti of ex.anti) {
      const out = await runHarness(ex, anti);
      const allPass = !out.timedOut && out.cases.length > 0 && out.cases.every((c) => c.pass);
      if (!allPass) antiStopped++;
    }
    const row: SelfCheckRow = {
      id: ex.id,
      title: ex.title,
      refPassed,
      refTotal: ex.tests.length,
      antiStopped,
      antiTotal: ex.anti.length,
      ok: refPassed === ex.tests.length && antiStopped === ex.anti.length,
    };
    rows.push(row);
    onRow?.(row);
  }
  return rows;
}
