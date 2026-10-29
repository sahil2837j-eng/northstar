/* VIGIL overseer rule tests: mood selection, no-shame language, factual telemetry,
   unknown-hours honesty, and readiness for missing practice / mentor config. */
import { build } from "esbuild";

await build({
  entryPoints: ["src/lib/overseer.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/ns-overseer.mjs",
  logLevel: "silent",
});

const O = await import("/tmp/ns-overseer.mjs");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

const now = new Date();
now.setHours(10, 30, 0, 0);

const at = (h, m) => {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const coreEmpty = { version: 1, entries: [], goals: [], reviews: [] };
const guide = { version: 1, profile: {}, skippedQuestions: [], neverQuestions: [], answers: [], patterns: [], dismissed: [] };
const noPractice = {
  contract: null,
  schedule: null,
  sessions: [],
  ledger: [],
  curriculum: { version: 1, placementDone: false, topics: {} },
  prefs: { version: 1, aiFeedbackEnabled: false, openStartCard: true },
};
const ui = { version: 1, wakeStart: 6, wakeEnd: 23, aiMentorEnabled: false, aiEndpointNote: "" };

/* ---------- scanning ---------- */
const scanning = O.buildOverseer(coreEmpty, guide, noPractice, ui, now);
check("empty day → scanning", scanning.mood === "scanning", scanning.mood);
check("scanning action is capture", scanning.directive.action === "capture");
check("scanning line says unknown not wasted", scanning.line.includes("unknown"), scanning.line);
check("signal states no contract", scanning.signals.some((s) => s.includes("No practice contract")));
check("mentor telemetry is off", scanning.telemetry.find((t) => t.label === "mentor").value === "off");

/* ---------- dormant ---------- */
const late = new Date(now);
late.setHours(23, 40, 0, 0);
const dormant = O.buildOverseer(coreEmpty, guide, noPractice, ui, late);
check("outside waking window → dormant", dormant.mood === "dormant", dormant.mood);
check("dormant line expects nothing", dormant.line.toLowerCase().includes("ask nothing of you") || dormant.line.toLowerCase().includes("nothing is expected"), dormant.line);

/* ---------- observing, linked ---------- */
const core = {
  version: 1,
  entries: [
    { id: "a", ts: at(8, 5), text: "sandbox tests", goalId: "g1", domain: "craft" },
    { id: "b", ts: at(9, 10), text: "test harness notes", goalId: "g1", domain: "craft" },
    { id: "c", ts: at(10, 0), text: "walked outside", domain: "health" },
  ],
  goals: [{ id: "g1", title: "Ship it", direction: "d", nextAction: "wire tests", domain: "craft", createdAt: now.toISOString(), active: true }],
  reviews: [],
};
const observing = O.buildOverseer(core, guide, noPractice, ui, now);
check("entries today → observing", observing.mood === "observing", observing.mood);
check("telemetry counts entries + linked", observing.telemetry[0].value === "3" && observing.telemetry[1].value === "2");

/* ---------- unlinked notice is optional, not shaming ---------- */
const coreUnlinked = { ...core, entries: core.entries.map((e) => ({ ...e, goalId: undefined })) };
const unlinked = O.buildOverseer(coreUnlinked, guide, noPractice, ui, now);
check("unlinked day notes linking is optional", unlinked.line.includes("optional"), unlinked.line);

/* ---------- active session → focused ---------- */
const activePractice = {
  ...noPractice,
  contract: {
    title: "Coding practice", days: [now.getDay()], time: "07:00", duration: 20, mode: "coding",
    strictness: "firm", grace: 15, notify: true, chime: true, fullscreen: true, extension: false,
    restricted: [], commitment: "", active: true, createdAt: now.toISOString(), updatedAt: now.toISOString(),
  },
  sessions: [{ id: "s1", date: now.toISOString().slice(0, 10), scheduledAt: at(7, 0), status: "active", startedAt: at(10, 20), lastKnownElapsedMs: 0, snoozes: 0, hintsUsed: 0 }],
};
const focused = O.buildOverseer(core, guide, activePractice, ui, now);
check("active session → focused", focused.mood === "focused", focused.mood);
check("focused line mentions timestamps", focused.line.includes("timestamp"), focused.line);

/* ---------- overdue block → alert, no punishment ---------- */
const overdue = {
  ...activePractice,
  sessions: [],
};
const alert = O.buildOverseer(coreEmpty, guide, overdue, ui, now);
check("overdue block → alert", alert.mood === "alert", alert.mood);
check("alert line treats override as fact", /plain facts|override/i.test(alert.line));

/* ---------- no shame anywhere ---------- */
const shame = /(you failed|you always|you never|wasted time|wasted|lazy|addicted|failure|discipline score|undisciplined)/i;
const scenarios = [scanning, dormant, observing, unlinked, focused, alert];
const allText = scenarios.flatMap((s) => [s.line, s.headline, s.directive.text, s.directive.label, ...s.signals]).join("\n");
check("no shame language in any overseer string", !shame.test(allText), allText.match(shame)?.[0] ?? "");

/* ---------- pattern threshold stays honest ---------- */
const sparse = {
  ...core,
  entries: [
    { id: "p", ts: at(8, 0), text: "sandbox", goalId: "g1" },
    { id: "q", ts: at(9, 0), text: "sandbox", goalId: "g1" },
  ],
};
const sig = O.buildOverseer(sparse, guide, noPractice, ui, now).signals.join("\n");
check("no pattern claim below threshold", !sig.includes("Pattern candidate"), sig);
const dense = {
  ...core,
  entries: [
    { id: "p", ts: at(8, 0), text: "sandbox work", goalId: "g1" },
    { id: "q", ts: at(9, 0), text: "sandbox again", goalId: "g1" },
    { id: "r", ts: new Date(now.getTime() - 86400000).toISOString(), text: "sandbox notes", goalId: "g1" },
  ],
};
const sig2 = O.buildOverseer(dense, guide, noPractice, ui, now).signals.join("\n");
check("pattern candidate appears at 3 entries / 2 days and asks confirmation", sig2.includes("Pattern candidate") && sig2.includes("confirmation"), sig2);

/* ---------- mood colours present ---------- */
check("every mood has a colour", ["observing", "focused", "scanning", "dormant", "alert"].every((m) => Boolean(O.MOOD_COLOR[m])));

/* ---------- remote mentor honesty ---------- */
const remote = O.buildOverseer(coreEmpty, guide, noPractice, { ...ui, aiEndpointNote: "https://api.example.com/v1" }, now);
check("remote mentor flagged as leaving device", remote.signals.some((s) => s.includes("leaves this device")));
const local = O.buildOverseer(coreEmpty, guide, noPractice, { ...ui, aiEndpointNote: "http://localhost:11434" }, now);
check("local mentor flagged as staying", local.signals.some((s) => s.includes("stay on this machine")));

let fails = 0;
for (const r of results) {
  if (!r.pass) fails++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : "  → " + r.detail}`);
}
console.log(`\n${results.length - fails}/${results.length} overseer tests passed.`);
process.exit(fails ? 1 : 0);
