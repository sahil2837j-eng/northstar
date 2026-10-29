/* Runs the rule-layer tests from Section 10 outside the browser: strictness, timer,
   ledger, mastery/recall. Exit code 0 = all pass. */
import { build } from "esbuild";

await build({
  entryPoints: ["src/lib/practice.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/ns-practice.mjs",
  logLevel: "silent",
});

const P = await import("/tmp/ns-practice.mjs");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

/* ---------- strictness ---------- */
check("gentle skip is one tap", P.skipGate("gentle", {}).allowed === true);

const firmShort = P.skipGate("firm", { reason: "tired" });
check("firm rejects < 12 meaningful chars", !firmShort.allowed && firmShort.need === 12);

check(
  "firm rejects 'asdf'",
  !P.skipGate("firm", { reason: "asdf" }).allowed,
);

check(
  "firm rejects repeated characters padded to 12+",
  !P.skipGate("firm", { reason: "asdfasdfasdfasdf" }).allowed,
);

check(
  "firm rejects whitespace only",
  !P.skipGate("firm", { reason: "            " }).allowed,
);

check(
  "firm accepts a real 12+ char reason",
  P.skipGate("firm", { reason: "child woke up early" }).allowed === true,
);

const strictWait = P.skipGate("strict", { waitedMs: 60000 });
check("strict allows the 60 second wait", strictWait.allowed === true);

check(
  "strict rejects a short sentence before the wait",
  !P.skipGate("strict", { reason: "not today", waitedMs: 0 }).allowed,
);

check(
  "strict accepts a 40+ character sentence",
  P.skipGate("strict", {
    reason: "I am travelling today and the connection where I am is unusable",
    waitedMs: 0,
  }).allowed === true,
);

check("strict does not accept 'asdf...' repetition", !P.skipGate("strict", { reason: "asdfasdfasdfasdfasdfasdfasdfasdfasdfasdf" }).allowed);

/* lowering takes effect next local day when close to a block */
const soon = new Date(Date.now() + 30 * 60000).toISOString();
const far = new Date(Date.now() + 40 * 3600000).toISOString();
check(
  "lowering within 2h of a block defers to next local day",
  P.loweringTakesEffectNextDay("strict", "gentle", soon) === true,
);
check(
  "lowering far from any block is immediate",
  P.loweringTakesEffectNextDay("strict", "gentle", far) === false,
);
check(
  "raising strictness is never deferred",
  P.loweringTakesEffectNextDay("gentle", "strict", soon) === false,
);

/* ---------- timer ---------- */
const base = { id: "s", date: "2026-01-05", scheduledAt: "2026-01-05T07:00:00.000Z", lastKnownElapsedMs: 0, snoozes: 0, hintsUsed: 0 };
const started = new Date("2026-01-05T07:00:00.000Z");
const active = { ...base, status: "active", startedAt: started.toISOString() };
const later = new Date(started.getTime() + 12 * 60000);
check("elapsed derived from timestamps", P.computeElapsed(active, later) === 12 * 60000);

const anchor = { ...active, lastKnownElapsedMs: 12 * 60000, startedAt: new Date(started.getTime() + 12 * 60000).toISOString() };
const evenLater = new Date(started.getTime() + 20 * 60000);
check(
  "re-anchored total is not double counted",
  P.computeElapsed(anchor, evenLater) === 20 * 60000,
  String(P.computeElapsed(anchor, evenLater)),
);

/* clock moved backwards: the stored total (12 min) must survive even though the anchor is ahead */
const rolledBack = { ...anchor };
const beforeJump = new Date(started.getTime() + 5 * 60000);
check(
  "clock rollback keeps lastKnownElapsedMs",
  P.computeElapsed(rolledBack, beforeJump) === 12 * 60000,
  String(P.computeElapsed(rolledBack, beforeJump)),
);

check(
  "paused session stops accruing",
  P.computeElapsed({ ...active, status: "paused", startedAt: undefined }, new Date(started.getTime() + 99 * 60000)) ===
    active.lastKnownElapsedMs,
);

/* ---------- ledger ---------- */
const now = new Date();
const iso = (minAgo) => new Date(now.getTime() - minAgo * 60000).toISOString();
const ledger = [
  P.ledgerEvent("scheduled", { now: new Date(iso(60)) }),
  P.ledgerEvent("started", { now: new Date(iso(59)) }),
  P.ledgerEvent("skipped", { note: "tired", now: new Date(iso(50)) }),
  P.ledgerEvent("skipped", { note: "family", now: new Date(iso(40)) }),
  P.ledgerEvent("overridden", { now: new Date(iso(30)) }),
  P.ledgerEvent("missed", { now: new Date(iso(20)) }),
];
const week = P.weekCounts(ledger, now);
check("week counts committed/started", week.committed === 1 && week.started === 1);
check("week counts skipped + reasons", week.skipped === 2 && week.skipReasons.length === 2);
check("week counts overrides and misses", week.overridden === 1 && week.missed === 1);
check("ledger events are plain facts (no shame words)", !JSON.stringify(ledger).match(/failed|lazy|addict|wasted/i));

/* ---------- mastery & recall ---------- */
let prog = { version: 1, placementDone: false, topics: {} };
prog = P.applyAttempt(prog, "loops", { pass: false, hints: 2 });
check("failed attempt => weak", prog.topics.loops.state === "weak");

prog = { version: 1, placementDone: false, topics: {} };
prog = P.applyAttempt(prog, "loops", { pass: true, hints: 0 });
check("pass with 0 hints => solid_candidate", prog.topics.loops.state === "solid_candidate");
const firstRecall = new Date(prog.topics.loops.nextRecall);
const day1 = Math.round((firstRecall.setHours(0, 0, 0, 0) - new Date(new Date().toDateString()).getTime()) / 86400000);
check("first recall due in 1 day", day1 === 1, String(day1));

const midnight = new Date(new Date().toDateString());
const second = P.recallFor(2);
second.setHours(0, 0, 0, 0);
const third = P.recallFor(3);
third.setHours(0, 0, 0, 0);
const diff2 = Math.round((second - midnight) / 86400000);
const diff3 = Math.round((third - midnight) / 86400000);
check("second recall in 3 days", diff2 === 3, String(diff2));
check("third recall in 7 days", diff3 === 7, String(diff3));

/* two successful attempts on different local days => solid (simulated via distinct dates) */
let prog2 = { version: 1, placementDone: false, topics: { arrays: { state: "untested", attempts: [{ date: "2026-01-01", pass: true, hints: 0 }] } } };
prog2 = P.applyAttempt(prog2, "arrays", { pass: true, hints: 1 });
check("two pass days => solid", prog2.topics.arrays.state === "solid", prog2.topics.arrays.state);

/* recall failure drops back to weak */
let prog3 = { version: 1, placementDone: false, topics: {} };
prog3 = P.applyAttempt(prog3, "loops", { pass: true, hints: 0 });
prog3 = P.applyAttempt(prog3, "loops", { pass: false, hints: 0, recall: true });
check("failed recall => weak", prog3.topics.loops.state === "weak");

/* next-exercise adaptation */
const fresh = { version: 1, placementDone: false, topics: {} };
const seededWeak = P.applyAttempt(fresh, "loops", { pass: false, hints: 0 });
const nextWeak = P.nextExercise(seededWeak);
check("weak topic is seeded", nextWeak.ex.topic === "loops" && nextWeak.reason.includes("weak"), nextWeak.reason);

const easyAfterFail = P.nextExercise(seededWeak, { lastPass: false, lastTopic: "loops", lastHints: 0 });
check("fail => easier in same topic", easyAfterFail.ex.topic === "loops");

const harderAfterClean = P.nextExercise(
  { version: 1, placementDone: false, topics: { vars: { state: "solid", attempts: [{ date: "2026-01-01", pass: true, hints: 0 }] } } },
  { lastPass: true, lastTopic: "vars", lastHints: 0 },
);
check("0 hints + pass advances", harderAfterClean.ex.topic !== "vars" || harderAfterClean.ex.id !== "v1", harderAfterClean.reason);

let fails = 0;
for (const r of results) {
  if (!r.pass) fails++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : "  → " + r.detail}`);
}
console.log(`\n${results.length - fails}/${results.length} rule tests passed.`);
process.exit(fails ? 1 : 0);
