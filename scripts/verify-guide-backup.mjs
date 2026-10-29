/* Guide + backup rules: pattern threshold, banned phrasing, single question,
   payload caps, old-backup import, export shape, delete-everything. */
import { build } from "esbuild";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
globalThis.window = { postMessage: () => {} };

await build({
  entryPoints: ["src/lib/guide.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/ns-guide.mjs",
  logLevel: "silent",
});
await build({
  entryPoints: ["src/lib/store.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/ns-store.mjs",
  logLevel: "silent",
});
await build({
  entryPoints: ["src/lib/data.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/ns-data.mjs",
  logLevel: "silent",
});

const G = await import("/tmp/ns-guide.mjs");
const S = await import("/tmp/ns-store.mjs");
const D = await import("/tmp/ns-data.mjs");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

const at = (daysAgo, h, m, text) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return { id: `x${daysAgo}${h}${m}`, ts: d.toISOString(), text };
};

/* ---------- evidence threshold ---------- */
const twoDaysFew = [at(1, 9, 0, "blocked by the sandbox again"), at(1, 10, 0, "blocked again"), at(0, 9, 0, "still blocked")];
const p2 = D.findPatterns(twoDaysFew);
check(
  "3 entries across 2 days can form a pattern",
  p2.some((p) => p.keyword === "blocked"),
  JSON.stringify(p2.map((p) => p.keyword)),
);

const sameDay = [at(0, 9, 0, "blocked"), at(0, 11, 0, "blocked"), at(0, 13, 0, "blocked")];
check("3 entries in 1 day is not enough", D.findPatterns(sameDay).length === 0);

const twoEntries = [at(1, 9, 0, "blocked"), at(0, 9, 0, "blocked")];
check("2 entries are not enough", D.findPatterns(twoEntries).length === 0);

/* ---------- day strip ---------- */
const lateNight = new Date();
lateNight.setHours(2, 30, 0, 0);
const nightEntry = { id: "night", ts: lateNight.toISOString(), text: "A quiet moment." };
const nightStrip = D.buildDay(lateNight, [nightEntry], { wakeStart: 6, wakeEnd: 23 }, lateNight);
check("an entry outside waking hours still lights its hour", nightStrip[2].state === "logged_current");
check("unlogged hours outside waking hours stay quiet", nightStrip[3].state === "outside");

/* ---------- reply validation ---------- */
const okReply = "Your logs lean toward craft this week; which goal did those hours actually serve? Start with 20 minutes on the test harness.";
check("clean reply accepted", G.validateGuideReply(okReply).ok === true);

const twoQs = "Which one is next? And what would you do first?";
const twoQ = G.validateGuideReply(twoQs);
check("two questions rejected", twoQ.ok === false && twoQ.issues.some((i) => i.includes("question")), twoQ.issues.join(" | "));

check(
  "banned phrase rejected",
  G.validateGuideReply("You failed again. You always do this.").ok === false,
);
check(
  "'wasted time' rejected",
  G.validateGuideReply("That was wasted time, right?").ok === false,
);

/* ---------- payload caps ---------- */
const entries = Array.from({ length: 20 }, (_, i) => at(i % 7, 9, i, `entry ${i} `.repeat(40)));
const checkin = {
  goal: { id: "g", title: "Ship it", direction: "Finish the hard part", nextAction: "tests", domain: "craft", createdAt: new Date().toISOString(), active: true },
  noticed: "notice",
  sources: [],
  question: { category: "clarity", text: "Which one is next?" },
  action: { text: "20 min", minutes: 20 },
  window: "7",
  entryIds: entries.map((e) => e.id),
};
const payload = G.buildPayload(checkin, entries);
check("payload <= 2000 chars", payload.chars <= 2000, String(payload.chars));
check("payload uses at most 8 items", payload.itemCount <= 8, String(payload.itemCount));
check("payload aliases ids", /"e1"/.test(payload.text));
check("no raw entry ids leak", !payload.text.includes(entries[0].id));

/* ---------- profile flow ---------- */
const freshGuide = { version: 1, profile: {}, skippedQuestions: [], neverQuestions: [], answers: [], patterns: [], dismissed: [] };
check("first profile question is the 90-day one", G.nextProfileQuestion(freshGuide).id === "q90");
const answered = { ...freshGuide, profile: { q90: "x" } };
check("second question follows", G.nextProfileQuestion(answered).id === "qgood");
const never = { ...freshGuide, neverQuestions: ["q90"], profile: { qgood: "a", qpulled: "b", qrestart: "c", qtime: "d", qrest: "e", qvoice: "f", qnever: "g", qbecome: "h" } };
check("'never ask this' is respected", G.nextProfileQuestion(never) === null);

/* ---------- backup ---------- */
const oldBackup = JSON.stringify({
  version: 1,
  exportedAt: "2025-01-01T00:00:00.000Z",
  core: { version: 1, entries: [at(2, 9, 0, "old entry")], goals: [], reviews: [] },
});
const legacy = S.importBundle(oldBackup);
check("old backup imports cleanly", legacy.ok === true && legacy.note.includes("older"), legacy.note);
check("old backup leaves practice empty", S.readRaw(S.KEYS.contract, null) === null);

S.writeKey(S.KEYS.core, { version: 1, entries: [at(1, 9, 0, "a"), at(0, 9, 0, "b")], goals: [], reviews: [] });
const memoryItems = Array.from({ length: 10 }, (_, i) => ({
  id: `m${i + 1}`,
  kind: "principle",
  text: `memory ${i + 1}`,
  createdAt: new Date(2026, 0, i + 1).toISOString(),
  updatedAt: new Date(2026, 0, i + 1).toISOString(),
  active: true,
}));
S.writeKey(S.KEYS.memory, { version: 1, items: memoryItems });
const bundle = S.exportBundle();
check("export contains guide section", bundle.guide && bundle.guide.version === 1);
check(
  "export contains practice section",
  bundle.practice && typeof bundle.practice.curriculumProgress === "object" && Array.isArray(bundle.practice.ledger),
);
check("export caps active strategic memory at 8", bundle.memory.items.filter((i) => i.active).length === 8);
const legacyMemory = S.sanitizeMemory({
  version: 1,
  items: [
    { id: "legacy_on", kind: "principle", text: "on", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", active: 1 },
    { id: "legacy_off", kind: "lesson", text: "off", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", active: 0 },
  ],
});
check(
  "legacy 0/1 memory flags are accepted",
  legacyMemory.items.find((i) => i.id === "legacy_on")?.active === true &&
    legacyMemory.items.find((i) => i.id === "legacy_off")?.active === false,
);
localStorage.setItem("northstar.ai.remote.v1", JSON.stringify({ enabled: true }));
localStorage.setItem("northstar.ai.key.openai", "sk-test");
localStorage.setItem("northstar.entries.v1", "[]");
check("export never contains a remote API key", !JSON.stringify(bundle).includes("sk-test") && !JSON.stringify(bundle).includes("northstar.ai.key"));
const roundTrip = S.importBundle(JSON.stringify(bundle));
check("new backup round-trips", roundTrip.ok === true && !roundTrip.note.includes("older"), roundTrip.note);
check("imported strategic memory keeps the active cap", S.readRaw(S.KEYS.memory, { items: [] }).items.filter((i) => i.active).length === 8);

const bad = S.importBundle("{not json");
check("invalid file rejected without changes", bad.ok === false);

S.writeKey(S.KEYS.guide, { ...freshGuide, profile: { q90: "something" } });
S.writeKey(S.KEYS.contract, { title: "x", active: true });
S.writeKey(S.KEYS.sessions, [{ id: "s1" }]);
S.writeKey(S.KEYS.ledger, [{ id: "l1", type: "started" }]);
S.writeKey(S.KEYS.curriculum, { version: 1, placementDone: true, topics: {} });
S.writeKey(S.KEYS.prefs, { version: 1, aiFeedbackEnabled: false, openStartCard: true });
const del = S.deleteEverything();
check("delete clears every new key", [S.KEYS.guide, S.KEYS.contract, S.KEYS.sessions, S.KEYS.ledger, S.KEYS.curriculum, S.KEYS.prefs, S.KEYS.core].every((k) => S.readRaw(k, null) === null));
check("delete clears remote config, device key, and legacy keys", localStorage.getItem("northstar.ai.remote.v1") === null && localStorage.getItem("northstar.ai.key.openai") === null && localStorage.getItem("northstar.entries.v1") === null);
check("delete reports extension state honestly", del.extensionAcknowledged === false);
check("extension status is honest when absent", S.extensionStatus().present === false && S.extensionStatus().detail.includes("cannot wake itself"));

let fails = 0;
for (const r of results) {
  if (!r.pass) fails++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : "  → " + r.detail}`);
}
console.log(`\n${results.length - fails}/${results.length} guide/backup tests passed.`);
process.exit(fails ? 1 : 0);
