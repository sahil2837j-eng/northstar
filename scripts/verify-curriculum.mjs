/* Verifies the exercise bank outside the browser, using the same rules as the sandbox worker:
   reference solution must pass every hidden test; every anti-solution must fail at least one. */
import { build } from "esbuild";

await build({
  entryPoints: ["src/lib/curriculum.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/ns-curriculum.mjs",
  logLevel: "silent",
});

const { CURRICULUM, PLACEMENT_IDS, TOPICS } = await import("/tmp/ns-curriculum.mjs");

function deepEq(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return true;
    return Math.abs(a - b) < 1e-6;
  }
  if (a === b) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!kb.includes(k)) return false;
      if (!deepEq(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

let failures = 0;
const report = [];

function runCase(code, ex, t) {
  let logCalled = false;
  const origLog = console.log;
  console.log = () => { logCalled = true; };
  try {
    const F = new Function(
      `"use strict";\n${code}\n;return typeof ${ex.fn} === "function" ? ${ex.fn} : null;`,
    );
    const impl = F();
    if (typeof impl !== "function") return { pass: false, detail: "missing fn" };
    const args = t.argsExpr ? eval(`(${t.argsExpr})`) : JSON.parse(JSON.stringify(t.args ?? []));
    const before = JSON.stringify(args);
    let result;
    if (t.call) {
      const made = impl.apply(null, args);
      if (typeof made !== "function") return { pass: false, detail: "did not return fn" };
      result = made.apply(null, t.call);
    } else if (t.calls) {
      const made = impl.apply(null, args);
      if (typeof made !== "function") return { pass: false, detail: "did not return fn" };
      for (let i = 0; i < t.calls; i++) result = made();
    } else {
      result = impl.apply(null, args);
    }
    const after = JSON.stringify(args);
    if (before !== after) return { pass: false, detail: "mutated input" };
    if (logCalled) return { pass: false, detail: "console.log used" };
    return deepEq(result, t.expected)
      ? { pass: true }
      : { pass: false, detail: `expected ${JSON.stringify(t.expected)} got ${JSON.stringify(result)}` };
  } catch (err) {
    return { pass: false, detail: String(err.message || err) };
  } finally {
    console.log = origLog;
  }
}

for (const ex of CURRICULUM) {
  const refFails = ex.tests.filter((t) => !runCase(ex.ref, ex, t).pass);
  const antiStopped = ex.anti.filter((a) =>
    ex.tests.some((t) => !runCase(a, ex, t).pass),
  ).length;
  const ok = refFails.length === 0 && antiStopped === ex.anti.length;
  if (!ok) failures++;
  report.push({
    id: ex.id,
    tests: ex.tests.length,
    refPass: `${ex.tests.length - refFails.length}/${ex.tests.length}`,
    antiStopped: `${antiStopped}/${ex.anti.length}`,
    ok,
    detail: refFails.map((t) => `${ex.fn} case "${t.name ?? ""}"`).join(", "),
  });
}

/* console.log(1) must fail. An infinite loop must be killable from outside the running code —
   in the app that is the parent-owned timeout destroying the iframe; here it is Worker.terminate(). */
const logProbe = CURRICULUM[0];
const logCase = runCase(`${logProbe.ref}\nconsole.log(1);`, logProbe, logProbe.tests[0]);

const { Worker } = await import("node:worker_threads");
const loopWorker = new Worker(
  "require('node:worker_threads').parentPort.on('message', () => { while (true) {} });",
  { eval: true },
);
loopWorker.postMessage("run");
await new Promise((r) => setTimeout(r, 60));
const t0 = Date.now();
const mainThreadBefore = Date.now();
await loopWorker.terminate();
const mainThreadAfter = Date.now();
const killMs = Date.now() - t0;
const loopContained = mainThreadAfter - mainThreadBefore < 500;

for (const r of report) {
  console.log(
    `${r.ok ? "PASS" : "FAIL"} ${r.id.padEnd(4)} tests ${r.refPass.padEnd(8)} anti ${r.antiStopped} ${r.detail}`,
  );
}
console.log("\nconsole.log(1) rejected:", logCase.pass === false ? "yes" : "NO");
console.log(
  "infinite loop killed from outside in",
  `${killMs}ms, main thread responsive during the kill:`,
  loopContained ? "yes" : "NO",
);
console.log(
  `\n${report.filter((r) => r.ok).length}/${report.length} exercises verified. Placement ids: ${PLACEMENT_IDS.join(", ")}. Topics: ${TOPICS.length}.`,
);
process.exit(failures === 0 ? 0 : 1);
