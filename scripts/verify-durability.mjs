/* Durability regression tests.

   Each case here corresponds to a defect that was found by probing the built
   code, not by reading it. They exist so the same class of failure cannot
   return silently: corrupt scheduling state, malformed backups, quadratic
   text comparison, warning floods, and leaked object URLs. */
import { build } from "esbuild";
import { readFileSync } from "node:fs";

for (const [entry, outfile] of [
  ["src/lib/loci-algorithms.ts", "/tmp/d-algo.mjs"],
  ["src/lib/loci-schema.ts", "/tmp/d-schema.mjs"],
  ["src/lib/loci-store.ts", "/tmp/d-store.mjs"],
  ["src/lib/curator-core.ts", "/tmp/d-core.mjs"],
]) {
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile, logLevel: "silent" });
}

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const A = await import("/tmp/d-algo.mjs");
const SC = await import("/tmp/d-schema.mjs");
const ST = await import("/tmp/d-store.mjs");
const C = await import("/tmp/d-core.mjs");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });
const now = new Date("2026-05-01T12:00:00Z");

/* ---------- 1. Scheduling never produces an invalid date ---------- */
const corruptStates = [
  ["NaN ease", { ease: NaN, intervalDays: 3, reps: 2, lapses: 0, dueAt: now.toISOString() }],
  ["null ease", { ease: null, intervalDays: 3, reps: 2, lapses: 0, dueAt: now.toISOString() }],
  ["NaN interval", { ease: 2.5, intervalDays: NaN, reps: 2, lapses: 0, dueAt: now.toISOString() }],
  ["negative interval", { ease: 2.5, intervalDays: -40, reps: 3, lapses: 0, dueAt: now.toISOString() }],
  ["overflow interval", { ease: 3, intervalDays: 1e9, reps: 9, lapses: 0, dueAt: now.toISOString() }],
  ["Infinity ease", { ease: Infinity, intervalDays: 2, reps: 1, lapses: 0, dueAt: now.toISOString() }],
  ["string numbers", { ease: "2.5", intervalDays: "3", reps: "2", lapses: "0", dueAt: now.toISOString() }],
  ["missing everything", {}],
  ["null state", null],
];
let scheduleOk = true;
const scheduleDetail = [];
for (const [label, state] of corruptStates) {
  for (const grade of ["again", "hard", "good", "easy"]) {
    try {
      const out = A.calculateNextDue(state, grade, now);
      const valid =
        !Number.isNaN(Date.parse(out.dueAt)) &&
        Number.isFinite(out.ease) &&
        out.ease >= A.MIN_EASE &&
        out.ease <= A.MAX_EASE &&
        Number.isInteger(out.intervalDays) &&
        out.intervalDays >= 0 &&
        out.intervalDays <= A.MAX_INTERVAL_DAYS;
      if (!valid) {
        scheduleOk = false;
        scheduleDetail.push(`${label}/${grade}: ${JSON.stringify(out)}`);
      }
    } catch (e) {
      scheduleOk = false;
      scheduleDetail.push(`${label}/${grade} threw ${e.message}`);
    }
  }
}
check("Scheduling survives corrupt state and always yields a valid date", scheduleOk, scheduleDetail[0] ?? "");
check("Interval is capped so the due date cannot overflow", A.calculateNextDue({ ease: 3, intervalDays: 1e9, reps: 9, lapses: 0, dueAt: now.toISOString() }, "easy", now).intervalDays === A.MAX_INTERVAL_DAYS);
check("isItemDue treats an unparseable due date as due", A.isItemDue({ review: { dueAt: "not-a-date" } }, now) === true);
check("isWeakSpot tolerates a missing review", A.isWeakSpot({}) === false);
check("sanitizeReviewState repairs rather than throws", A.sanitizeReviewState({ ease: "x", easeHistory: "nope" }, now).ease === 2.5);

/* ---------- 2. Malformed backups cannot reach the UI ---------- */
const malformed = {
  format: "loci:v1",
  exportedAt: now.toISOString(),
  data: {
    palaces: [
      { id: "ok", name: "Fine", location: "x", locationConfirmed: true, route: [{ id: "l1", order: 1, spot: "A", landmark: "B" }], items: [], createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: "bad1", name: "No route key" },
      { id: "bad2", name: "Null route", route: null, items: null },
      { id: "bad3", name: "Item without review", route: [{ id: "l1", order: 1, spot: "s", landmark: "l" }], items: [{ id: "i1", locusId: "l1", text: "t", imageCue: "c" }] },
      { name: "No id", route: [], items: [] },
      { id: "bad4", name: "Dangling item", route: [{ id: "l1", order: 1, spot: "s", landmark: "l" }], items: [{ id: "i9", locusId: "ghost", text: "t", imageCue: "c" }] },
      { id: "bad5", name: "Two items one spot", route: [{ id: "l1", order: 1, spot: "s", landmark: "l" }], items: [{ id: "a", locusId: "l1", text: "A", imageCue: "c" }, { id: "b", locusId: "l1", text: "B", imageCue: "c" }] },
      { id: "bad6", name: "Out of order spots", route: [{ id: "z", order: 9, spot: "Z", landmark: "l" }, { id: "y", order: 2, spot: "Y", landmark: "l" }], items: [] },
      "not even an object",
    ],
    sessions: [{ id: "s", palaceId: "ok", startedAt: now.toISOString(), mode: "banana", results: [{ itemId: "i1", grade: "nonsense", hintDepth: 99 }] }],
    settings: {},
  },
};

const preview = ST.previewLociImport(JSON.stringify(malformed));
check("A backup with malformed palaces still previews", preview.valid, preview.error ?? "");
check("The preview reports that repairs were needed", typeof preview.repairNote === "string" && preview.repairNote.length > 0, String(preview.repairNote));

const repaired = preview.parsedData.data.palaces;
check("Every imported palace has array route and items", repaired.every((p) => Array.isArray(p.route) && Array.isArray(p.items)));
check("Every imported palace has an id", repaired.every((p) => typeof p.id === "string" && p.id.length > 0));
check("Every imported item has a usable review state", repaired.every((p) => p.items.every((i) => !Number.isNaN(Date.parse(i.review.dueAt)) && Number.isFinite(i.review.ease))));
check("An item pointing at a missing spot is unassigned, not dropped", (() => { const p = repaired.find((x) => x.name === "Dangling item"); return p.items.length === 1 && p.items[0].locusId === ""; })());
check("Two items on one spot: the second is unassigned (one item per spot)", (() => { const p = repaired.find((x) => x.name === "Two items one spot"); return p.items.filter((i) => i.locusId === "l1").length === 1; })());
check("Route order is re-indexed to 1..n", (() => { const p = repaired.find((x) => x.name === "Out of order spots"); return p.route.map((l) => l.order).join(",") === "1,2" && p.route[0].id === "y"; })());
check("A non-object palace entry is skipped, not crashed on", repaired.length === 8);
check("Unknown session mode and grade fall back to safe values", (() => { const s = preview.parsedData.data.sessions[0]; return s.mode === "recall" && s.results[0].grade === "again" && s.results[0].hintDepth === undefined; })());

const emptyBackup = ST.previewLociImport(JSON.stringify({ format: "loci:v1", data: { palaces: ["junk", 42], sessions: [] } }));
check("A backup with no readable palaces is rejected", !emptyBackup.valid);

/* ---------- 3. Merge keeps session history attached to the right palace ---------- */
const sharedId = "palace_dup";
const current = {
  version: 1,
  palaces: [{ id: sharedId, name: "Mine", location: "", locationConfirmed: true, route: [], items: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }],
  sessions: [{ id: "mine", palaceId: sharedId, startedAt: now.toISOString(), mode: "recall", results: [] }],
  settings: ST.DEFAULT_LOCI_SETTINGS,
};
const incoming = ST.previewLociImport(JSON.stringify({
  format: "loci:v1",
  data: {
    palaces: [{ id: sharedId, name: "Theirs", location: "", locationConfirmed: true, route: [], items: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }],
    sessions: [{ id: "theirs", palaceId: sharedId, startedAt: now.toISOString(), mode: "recall", results: [] }],
    settings: {},
  },
}));
const merged = await ST.executeLociImport(incoming, "merge", current);
const theirPalace = merged.palaces.find((p) => p.name.startsWith("Theirs"));
const theirSession = merged.sessions.find((s) => s.id === "theirs");
check("Merging a colliding palace re-identifies it", theirPalace && theirPalace.id !== sharedId);
check("Its imported sessions follow the new id instead of attaching to the wrong palace", theirSession && theirSession.palaceId === theirPalace.id);
check("The original palace keeps its own session", merged.sessions.find((s) => s.id === "mine").palaceId === sharedId);
check("Every surviving session points at a real palace", merged.sessions.every((s) => merged.palaces.some((p) => p.id === s.palaceId)));

/* ---------- 4. Text comparison stays responsive ---------- */
const long = (n, seed) => (seed + " ").repeat(Math.ceil(n / (seed.length + 1))).slice(0, n);
let worst = 0;
for (const n of [500, 2000, 8000, 20000]) {
  const t0 = Date.now();
  A.evaluateRecall(long(n, "lorem ipsum dolor"), long(n, "lorem ipsom dolar"));
  worst = Math.max(worst, Date.now() - t0);
}
check(`Recall evidence on very long answers stays under 50 ms (worst ${worst} ms)`, worst < 50, `${worst} ms`);
check("Edit distance is length-capped", A.MAX_COMPARE_CHARS <= 1000);
check("Similarity still ranks a near-match above an unrelated string", A.stringSimilarityRatio("periodic table", "periodik table") > A.stringSimilarityRatio("periodic table", "zebra crossing"));

/* ---------- 5. Guard warnings stay readable ---------- */
const route15 = Array.from({ length: 15 }, (_, i) => ({ id: `l${i}`, order: i + 1, spot: `Spot ${i}`, landmark: `Mark ${i}` }));
const sameCue = route15.map((l, i) => ({ id: `i${i}`, locusId: l.id, text: `Item ${i}`, imageCue: `A giant elephant crashes into the thing with cold metal and loud smoke` }));
const flood = C.interferenceGuard(route15, sameCue);
const perItem = new Map();
flood.forEach((w) => w.itemIds.forEach((id) => perItem.set(id, (perItem.get(id) ?? 0) + 1)));
const maxPerItem = Math.max(0, ...perItem.values());
check(`Worst-case cue collisions are capped per item (max ${maxPerItem})`, maxPerItem <= C.MAX_COLLISIONS_PER_ITEM + 1, `${maxPerItem} on one item`);
check("A pathological palace does not emit a hundred warnings", flood.length < 40, `${flood.length} warnings`);
check("Collisions are still detected at all", flood.some((w) => w.kind === "CUE_DUPLICATE"));

/* ---------- 6. Object URLs have a single owner ---------- */
const dbSrc = readFileSync("src/lib/loci-db.ts", "utf8");
check("loci-db no longer hands out unowned object URLs", !/export async function getLociImageUrl/.test(dbSrc));
const hookSrc = readFileSync("src/features/loci/useLociImage.ts", "utf8");
check("The image hook revokes on cleanup", /revokeObjectURL/.test(hookSrc) && /return \(\) => \{/.test(hookSrc));
check("The image hook handles unmount during load", /if \(!active\)/.test(hookSrc) && (hookSrc.match(/revokeObjectURL/g) ?? []).length >= 2);
for (const f of ["src/features/loci/RecallSession.tsx", "src/features/loci/WalkSession.tsx"]) {
  const src = readFileSync(f, "utf8");
  check(`${f.split("/").pop()} loads photos through the hook`, /useLociImage/.test(src) && !/createObjectURL/.test(src));
}

/* ---------- 7. Single source of truth for the localhost rule ---------- */
const algoSrc = readFileSync("src/lib/loci-algorithms.ts", "utf8");
check("The duplicate localhost check was removed", !/function isLocalhostUrl/.test(algoSrc));
check("Cue generation still enforces localhost", /isLocalEndpoint\(endpoint\)/.test(algoSrc));

/* ---------- 8. The autonomous rewrite module is gone ---------- */
let evolutionPresent = true;
try {
  readFileSync("src/lib/loci-evolution.ts", "utf8");
} catch {
  evolutionPresent = false;
}
check("The self-rewriting evolution module no longer exists", !evolutionPresent);

/* ---------- 9. Empty palace planning reads sensibly ---------- */
const emptyPlan = C.planSession({ id: "e", name: "Empty", location: "", locationConfirmed: true, route: [], items: [], createdAt: "", updatedAt: "" }, "recall", now);
check("An empty palace says so instead of offering a 0-item practice pass", /no placed items/.test(emptyPlan.narration), emptyPlan.narration);

/* ---------- 10. Every form control has a programmatic label ----------
   A <label> that merely sits next to a field looks correct but is not
   announced, so these are checked structurally rather than by eye. */
import { readdirSync } from "node:fs";
const uiFiles = readdirSync("src/features/loci").filter((f) => f.endsWith(".tsx"));
const unlabelled = [];
for (const file of uiFiles) {
  const lines = readFileSync(`src/features/loci/${file}`, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!line.includes("<label") || line.includes("htmlFor")) return;
    const chunk = lines.slice(i, i + 14).join("\n");
    const close = chunk.indexOf("</label>");
    if (close === -1) return;
    const wrapsControl = /<(input|select|textarea)/.test(chunk.slice(0, close));
    const controlFollows = /<(input|select|textarea)/.test(chunk.slice(close));
    if (!wrapsControl && controlFollows) unlabelled.push(`${file}:${i + 1}`);
  });
}
check("No label sits beside a field without htmlFor", unlabelled.length === 0, unlabelled.slice(0, 4).join(", "));

/* ---------- 11. Curator modules stay pure ---------- */
for (const f of ["curator-text", "curator-findings", "curator-session", "curator-explain", "curator-critic", "curator-commands"]) {
  const src = readFileSync(`src/lib/${f}.ts`, "utf8");
  const banned = ["localStorage", "indexedDB", "fetch(", "commitProposal", "saveLociState"].filter((w) => src.includes(w));
  check(`${f} performs no I/O and cannot commit`, banned.length === 0, banned.join(", "));
}

let fails = 0;
for (const r of results) {
  if (!r.pass) fails++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : "  → " + r.detail}`);
}
console.log(`\n${results.length - fails}/${results.length} durability tests passed.`);
process.exit(fails ? 1 : 0);
