/* Curator (ULTRON) acceptance tests — runs in Node, no browser.
   Covers the appendix's acceptance criteria that can be verified without a DOM. */
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const bundles = [
  ["src/lib/curator-core.ts", "/tmp/cur-core.mjs"],
  ["src/lib/curator-proposals.ts", "/tmp/cur-prop.mjs"],
  ["src/lib/curator-llm.ts", "/tmp/cur-llm.mjs"],
  ["src/lib/loci-algorithms.ts", "/tmp/cur-algo.mjs"],
  ["src/lib/loci-store.ts", "/tmp/cur-store.mjs"],
  ["src/lib/loci-presets.ts", "/tmp/cur-presets.mjs"],
];
for (const [entry, outfile] of bundles) {
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile, logLevel: "silent" });
}
const C = await import("/tmp/cur-core.mjs");
const P = await import("/tmp/cur-prop.mjs");
const L = await import("/tmp/cur-llm.mjs");
const A = await import("/tmp/cur-algo.mjs");
const S = await import("/tmp/cur-store.mjs");
const PR = await import("/tmp/cur-presets.mjs");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });
const allTexts = [];
const collect = (...xs) => xs.flat().forEach((x) => typeof x === "string" && allTexts.push(x));

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}

const now = new Date("2026-02-10T12:00:00Z");
const day = (d) => new Date(`2026-01-${String(d).padStart(2, "0")}T12:00:00Z`).toISOString();
const rev = (over = {}) => ({ ease: 2.5, intervalDays: 3, dueAt: day(8), reps: 2, lapses: 0, lastReviewedAt: day(5), ...over });

/* ---------- fixture palace ---------- */
const route = [
  ["l1", "Front door", "Brass knocker"],
  ["l2", "Bookshelf 1", "Oak shelf with atlases"],
  ["l3", "Bookshelf 2", "Pine shelf with novels"],
  ["l4", "Kitchen sink", "Chrome tap"],
  ["l5", "Fridge", "Magnet-covered door"],
  ["l6", "Window seat", "Velvet cushion"],
  ["l7", "Back door", "Rusty bolt"],
  ["l8", "Garden gate", "Iron latch"],
].map(([id, spot, landmark], i) => ({ id, order: i + 1, spot, landmark, sense: "cold air" }));

const items = [
  { id: "i1", locusId: "l1", text: "Passport", imageCue: "A passport slams the brass knocker with a loud clang!", review: rev() },
  { id: "i2", locusId: "l2", text: "Train ticket", imageCue: "A giant elephant crashes into the oak shelf, hissing steam!", review: rev() },
  { id: "i3", locusId: "l3", text: "Umbrella", imageCue: "An umbrella sprays rain over the pine shelf, soaking the novels.", review: rev({ lapses: 2 }) },
  { id: "i4", locusId: "l4", text: "Milk", imageCue: "Milk floods the chrome tap with a sour smell.", review: rev({ lapses: 2, easeHistory: [{ date: day(2), ease: 2.5 }, { date: day(5), ease: 2.3 }, { date: day(9), ease: 2.1 }] }) },
  { id: "i5", locusId: "l5", text: "Cheese", imageCue: "A wheel of cheese rolls against the magnet door, sticky and warm.", review: rev({ lapses: 1 }) },
  { id: "i6", locusId: "l6", text: "Sunscreen", imageCue: "A purple elephant crashes through the velvet cushion, smelling of smoke!", review: rev() },
  { id: "i7", locusId: "l7", text: "Phone charger", imageCue: "A phone charger wraps the rusty bolt, buzzing with heat.", review: rev() },
  { id: "i8", locusId: "l8", text: "Keys", imageCue: "Keys rattle against the iron latch, ice cold.", review: rev() },
].map((it) => ({ ...it, imageSource: "user" }));

const palace = { id: "p1", name: "Apartment Route", location: "My flat", locationConfirmed: true, route, items, createdAt: day(1), updatedAt: day(9) };
const sessions = [
  { id: "s1", palaceId: "p1", startedAt: day(2), endedAt: day(2), mode: "recall", results: [{ itemId: "i3", grade: "again", recalled: false, hintUsed: false }, { itemId: "i4", grade: "again", recalled: false, hintUsed: false }] },
  { id: "s2", palaceId: "p1", startedAt: day(5), endedAt: day(5), mode: "recall", results: [{ itemId: "i4", grade: "again", recalled: false, hintUsed: false }, { itemId: "i5", grade: "again", recalled: false, hintUsed: false }] },
];
deepFreeze(palace);
deepFreeze(sessions);

/* ---------- 1. Analysis is pure: frozen inputs, no writes ---------- */
let doctor;
try {
  doctor = C.routeDoctor(palace, sessions, now);
  C.interferenceGuard(palace.route, palace.items);
  C.planSession(palace, "recall", now);
  C.critiqueCueLocal({ cue: items[0].imageCue, landmark: "Brass knocker", spot: "Front door", siblingCues: [] });
  C.explainSchedule(items[3].review, now);
  C.loadAdvice(palace, now);
  C.buildCommandResult(C.parseIntentLocal("quiz me on apartment", [palace]), { version: 1, palaces: [palace], sessions, settings: S.DEFAULT_LOCI_SETTINGS }, now);
  check("Analysis functions run on deep-frozen palace data without mutating it", true);
} catch (e) {
  check("Analysis functions run on deep-frozen palace data without mutating it", false, e.message);
  doctor = [];
}

const forbidden = ["localStorage", "indexedDB", "saveLociState", "commitProposal", "setItem(", "userIntentFromEvent"];
for (const f of ["src/lib/curator-core.ts", "src/lib/curator-llm.ts"]) {
  const src = readFileSync(f, "utf8");
  const hits = forbidden.filter((w) => src.includes(w));
  check(`${f} has no storage access and cannot commit proposals`, hits.length === 0, hits.join(", "));
}

/* ---------- 2. Route Doctor ---------- */
const kinds = new Set(doctor.map((f) => f.kind));
for (const k of ["CONFUSABLE_SPOTS", "SEMANTIC_INTERFERENCE", "CUE_COLLISION", "SERIAL_POSITION_SAG", "EASE_DECAY", "LAPSE_CLUSTER", "STALE_PALACE"]) {
  check(`Route Doctor detects ${k}`, kinds.has(k), [...kinds].join(", "));
}
check("Every finding cites concrete dates or counts", doctor.length > 0 && doctor.every((f) => /\d/.test(f.evidence)), doctor.map((f) => f.evidence).join(" | "));
check("Every finding starts as proposed", doctor.every((f) => f.status === "proposed"));
check("Confusable-spot evidence includes the lapse date", doctor.some((f) => f.kind === "CONFUSABLE_SPOTS" && /Jan 2/.test(f.evidence)));
collect(doctor.map((f) => [f.evidence, f.suggestion]));

const loaded = { ...palace, load: { cycles: 3, lastClearedAt: day(30), residual: { l2: 2, l7: 1 } } };
const load = C.loadAdvice(loaded, now);
check("Load advisor reports cycles, residual spots and a cooldown", load && /3 item sets/.test(load.evidence) && /Spots 2, 7/.test(load.evidence) && /Cooldown/.test(load.suggestion), load?.evidence);
check("Load advisor stays quiet for a single-set route", C.loadAdvice(palace, now) === null);
collect(load?.evidence, load?.suggestion);

/* ---------- 3. Interference Guard ---------- */
const guard = C.interferenceGuard(palace.route, palace.items);
check("Guard flags adjacent same-category items (milk / cheese)", guard.some((w) => w.kind === "ADJACENT_CATEGORY" && w.itemIds.includes("i4") && w.itemIds.includes("i5")));
check("Guard flags duplicated cue actor + action (elephant / crash)", guard.some((w) => w.kind === "CUE_DUPLICATE" && w.itemIds.includes("i2") && w.itemIds.includes("i6")));
check("Guard flags near-duplicate adjacent spot names", guard.some((w) => w.kind === "SPOT_NEAR_DUPLICATE"));
const circ = C.interferenceGuard([{ id: "x1", order: 1, spot: "Front door", landmark: "Knocker" }], [{ id: "c1", locusId: "x1", text: "Front door", imageCue: "a cue" }]);
check("Guard flags a circular cue (item repeats its spot)", circ.some((w) => w.kind === "CIRCULAR_CUE"));
const elemRoute = route.slice(0, 5);
const elemItems = ["Hydrogen", "Helium", "Lithium", "Beryllium", "Boron"].map((t, i) => ({ id: `e${i}`, locusId: elemRoute[i].id, text: t, imageCue: "" }));
check("A list whose theme is one category is not flagged as interference", !C.interferenceGuard(elemRoute, elemItems).some((w) => w.kind === "ADJACENT_CATEGORY"));
collect(guard.map((w) => [w.message, w.advice]));

/* ---------- 4. Explain panel arithmetic ---------- */
const t = (d) => new Date(`2026-03-${String(d).padStart(2, "0")}T12:00:00Z`);
let r = A.createInitialReviewState(t(1));
r = A.calculateNextDue(r, "good", t(1));
r = A.calculateNextDue(r, "good", t(2));
r = A.calculateNextDue(r, "good", t(5));
const ex = C.explainSchedule(r, t(6)).join(" ");
check("Explain shows the exact interval arithmetic (3d × 2.50 → 8d)", /3d × 2\.50 = 7\.5d, rounded to 8d/.test(ex), ex);
check("Ease history is recorded on each grade", r.easeHistory?.length === 3);
const exAgain = C.explainSchedule(A.calculateNextDue(r, "again", t(13)), t(13)).join(" ");
check("Explain describes Again (10 minutes, ease −0.20)", /10 minutes/.test(exAgain) && /− 0\.20/.test(exAgain), exAgain);
check("Explain is honest when inputs were never recorded", /not recorded/.test(C.explainSchedule(rev({ lastGrade: "good" }), now).join(" ")));
const previews = C.gradePreviews(r, t(13));
check("Grade previews list all four grades; Again is 10 min", previews.length === 4 && /10 min/.test(previews[0]));
collect(ex, exAgain, previews);

/* ---------- 5. Hint ladder never leaks the answer at L1–L3 ---------- */
const hintItems = [
  ...items,
  ...S.createSamplePalace().items,
  ...PR.PRECISION_PRESETS.flatMap((p) => p.defaultItems.map((d, i) => ({ id: `${p.id}${i}`, text: d.text, imageCue: d.imageCue }))),
];
let leaks = [];
for (const it of hintItems) {
  for (const lvl of [1, 2, 3]) {
    const h = C.deterministicHint(lvl, it);
    collect(h);
    if (C.hintLeaksAnswer(h, it.text)) leaks.push(`${it.text} L${lvl}: ${h}`);
  }
}
check(`Hints L1–L3 never contain the item text (${hintItems.length} items × 3 levels)`, leaks.length === 0, leaks.slice(0, 3).join(" | "));
check("Leak detector catches an answer token", C.hintLeaksAnswer("It is hydrogen gas", "Hydrogen"));
const revH = C.reverseHint(3, route[0], 0, route.length);
check("Reverse-recall hints never contain the spot name", !C.hintLeaksAnswer(revH, route[0].spot) && !C.hintLeaksAnswer(C.reverseHint(1, route[0], 0, 8), route[0].spot));
check("Hint advisory at level 3 suggests Hard or Again as information", /Hard or Again/.test(C.hintAdvisory(3)) && /level 0/.test(C.hintAdvisory(0)));
collect(revH, [0, 1, 2, 3, 4, 5].map(C.hintAdvisory));

/* ---------- 6. Cue Critic asks exactly one question ---------- */
const weak = C.critiqueCueLocal({ cue: "Milk is near the fridge.", landmark: "Magnet-covered door", spot: "Fridge", siblingCues: [] });
const oneQ = (q) => (q.match(/\?/g) ?? []).length === 1 && q.trim().split(/\s+/).length <= 20;
check("Critic returns one question of 20 words or fewer", oneQ(weak.question), weak.question);
check("Critic targets the weakest axis (interaction → 'what does it do TO')", /TO the/.test(weak.question), weak.question);
check("Critic scores each axis 0–3", C.CRITIC_AXES.every((a) => weak.scores[a] >= 0 && weak.scores[a] <= 3));
const aph = C.critiqueCueLocal({ cue: "The milk sits there.", landmark: "door", spot: "Fridge", siblingCues: [], aphantasia: true });
check("Aphantasia mode swaps Salience for Narrative and uses no visual words", aph.salienceLabel === "Narrative" && !C.hasVisualLanguage(aph.question), aph.question);
const dup = C.critiqueCueLocal({ cue: "A giant elephant crashes into the oak shelf!", landmark: "Oak shelf", spot: "Bookshelf", siblingCues: ["A purple elephant stomps the cushion"] });
check("Critic lowers distinctness when a sibling cue shares an element", dup.scores.distinctness <= 2);
collect(weak.question, aph.question, dup.question, Object.values(weak.notes));

/* ---------- 7. Session planner ---------- */
const plan = C.planSession(palace, "recall", now);
check("Planner narration states due count, estimate and stop rule", /due/.test(plan.narration) && /min/.test(plan.narration) && /50%/.test(plan.narration), plan.narration);
check("Weak spots are never placed last", !(plan.queue.length > 2 && A.isWeakSpot(plan.queue[plan.queue.length - 1])));
const big = {
  ...palace,
  route: Array.from({ length: 22 }, (_, i) => ({ id: `b${i}`, order: i + 1, spot: `Spot ${i}`, landmark: `Mark ${i}` })),
  items: Array.from({ length: 22 }, (_, i) => ({ id: `bi${i}`, locusId: `b${i}`, text: `Thing ${i}`, imageCue: "x", imageSource: "user", review: rev({ dueAt: day(1) }) })),
};
check("Planner caps a session at 20 items", C.planSession(big, "recall", now).queue.length === 20);
const sixMisses = Array.from({ length: 6 }, (_, i) => ({ itemId: `x${i}`, grade: i < 2 ? "good" : "again", recalled: i < 2, hintUsed: false }));
check("Early stop is offered when accuracy < 50% over 6 items", C.shouldOfferStop(sixMisses, now.toISOString(), now, { sinceIndex: 0, timeOffered: false })?.reason === "accuracy");
check("Early stop is offered at 15 minutes", C.shouldOfferStop([sixMisses[0]], new Date(now.getTime() - 16 * 60000).toISOString(), now, { sinceIndex: 0, timeOffered: false })?.reason === "time");
check("Declining the offer is respected (no re-nag in the same window)", C.shouldOfferStop(sixMisses, now.toISOString(), now, { sinceIndex: 6, timeOffered: true }) === null);
collect(plan.narration);

/* ---------- 8. Command bar ---------- */
const sample = S.createSamplePalace();
const st = { version: 1, palaces: [sample], sessions: [], settings: S.DEFAULT_LOCI_SETTINGS };
const run = (q) => {
  const i = C.parseIntentLocal(q, st.palaces);
  return i && i.confidence >= 0.7 ? C.buildCommandResult(i, st, now) : { kind: "unknown", suggestions: C.nearestCommands(q) };
};
const q1 = run("which spots have lapsed twice");
check("Read-only query answers immediately", q1.kind === "answer");
const q2 = run("quiz me on the childhood home, reverse order");
check("Starting a session is a proposal with a diff, not an action", q2.kind === "proposal" && q2.proposal.type === "start_session" && q2.proposal.params.mode === "reverse" && q2.proposal.diff.after.items > 0);
const q3 = run("add 4 loci to childhood home");
check("Adding loci is a proposal (diff 7 → 11 spots)", q3.kind === "proposal" && q3.proposal.diff.before.spots === 7 && q3.proposal.diff.after.spots === 11);
const q4 = run("delete childhood home");
check("Destructive commands are refused and point to typed confirmation", q4.kind === "refuse" && /type the palace name/.test(q4.message));
const q5 = run("make me a sandwich");
check("Unparseable input → 'Not understood' with 5 suggestions, no mutation", q5.kind === "unknown" && q5.suggestions.length === 5);
check("Export is a proposal", run("export everything").kind === "proposal");
check("'when is palace 1 next due' answers read-only", run("when is palace 1 next due").kind === "answer");
collect(q1.lines, q2.proposal?.rationale, q3.proposal?.rationale, q4.message);

/* ---------- 9. Commit layer: no write without explicit user action ---------- */
const prop = q2.proposal;
let threw = false;
try { P.commitProposal(prop, undefined, now); } catch { threw = true; }
check("A proposal cannot be applied without a user intent", threw);
threw = false;
try { P.userIntentFromEvent({ isTrusted: false, type: "click" }); } catch { threw = true; }
check("Untrusted (scripted) events cannot mint a user intent", threw);
threw = false;
try { P.userIntentFromEvent({ isTrusted: true, type: "mouseover" }); } catch { threw = true; }
check("Non-explicit event types cannot mint a user intent", threw);
const intent = P.userIntentFromEvent({ isTrusted: true, type: "click" });
const applied = P.commitProposal(prop, intent, now);
check("A trusted click applies the proposal", applied.status === "applied");
threw = false;
try { P.commitProposal(applied, intent, now); } catch { threw = true; }
check("An applied proposal cannot be applied twice", threw);
const stale = C.createProposal("export", [], { before: {}, after: {} }, "r", {}, new Date(now.getTime() - 11 * 60000));
threw = false;
try { P.commitProposal(stale, intent, now); } catch { threw = true; }
check("Expired proposals cannot be applied", threw);
const cache = { findings: { p1: doctor }, lastRun: {} };
threw = false;
try { P.setFindingStatus(cache, "p1", doctor[0].id, "dismissed", {}); } catch { threw = true; }
check("Finding status cannot change without a user intent", threw);
const dismissedCache = P.setFindingStatus(cache, "p1", doctor[0].id, "dismissed", intent);
const merged = P.mergeFindings(dismissedCache.findings.p1, C.routeDoctor(palace, sessions, now));
check("Dismissed findings stay dismissed when Route Doctor re-runs", merged.find((f) => f.id === doctor[0].id)?.status === "dismissed");

/* ---------- 10. Network & model output validation ---------- */
const calls = [];
let payload = "";
globalThis.fetch = async (url) => {
  calls.push(String(url));
  return { ok: true, json: async () => ({ message: { content: payload } }) };
};
const base = { ...S.DEFAULT_LOCI_SETTINGS, aiEnabled: true, aiModel: "llama3.1" };
const critIn = { cue: "Milk is near the fridge.", landmark: "Magnet-covered door", spot: "Fridge", siblingCues: [] };

threw = false;
try { L.assertLocalEndpoint("https://api.openai.com/v1"); } catch { threw = true; }
check("Network layer rejects non-localhost endpoints", threw);
const remote = await L.critiqueCue(critIn, { ...base, aiEndpoint: "https://api.example.com/v1" });
check("A remote endpoint triggers zero fetch calls and the built-in fallback", calls.length === 0 && remote.source === "fallback" && remote.notice === L.AI_UNAVAILABLE);

const local = { ...base, aiEndpoint: "http://localhost:11434" };
payload = "this is not json";
const malformed = await L.critiqueCue(critIn, local);
check("Malformed model output degrades to fallback with a visible notice", malformed.source === "fallback" && malformed.notice === L.AI_UNAVAILABLE);
check("Exactly one retry before falling back", calls.length === 2, String(calls.length));
check("Calls go only to localhost", calls.every((u) => u.startsWith("http://localhost")));

payload = JSON.stringify({ interaction: 1, sensory: 0, salience: 1, distinctness: 3, question: "What does it do to the door? And what sound?" });
check("A critique with two questions is rejected", (await L.critiqueCue(critIn, local)).source === "fallback");
payload = JSON.stringify({ interaction: 1, sensory: 0, salience: 1, distinctness: 3, question: "You have mastered this, so what next?" });
check("A critique containing banned language is rejected", (await L.critiqueCue(critIn, local)).source === "fallback");
payload = JSON.stringify({ interaction: 1, sensory: 0, salience: 1, distinctness: 3, question: "What does the milk do to the magnet door?" });
const good = await L.critiqueCue(critIn, local);
check("A valid critique from the local model is accepted", good.source === "ai" && good.value.question.includes("magnet door"));

payload = JSON.stringify({ hint: "It is hydrogen gas" });
check("A model hint that leaks the answer is discarded", (await L.llmHint(3, "cue", "Hydrogen", local)) === null);
payload = JSON.stringify({ hint: "Something hisses here" });
check("A clean model hint is accepted", (await L.llmHint(1, "cue", "Hydrogen", local)) === "Something hisses here");

payload = JSON.stringify({ intent: "start_session", targetIds: [sample.id], params: { mode: "recall" }, confidence: 0.4 });
check("Low-confidence command parses produce no intent", (await L.parseCommandAI("do the thing", [sample], local)).value === null);
payload = JSON.stringify({ intent: "start_session", targetIds: ["not-a-palace"], params: {}, confidence: 0.95 });
check("Command parses naming unknown palaces are rejected", (await L.parseCommandAI("quiz", [sample], local)).value === null);

payload = JSON.stringify({ suggestion: "Rename spot 3 after its pine shelf. That keeps it apart from spot 2." });
const single = doctor.find((f) => f.locusIds.length === 1) ?? doctor[0];
const phrased = await L.phraseFinding(single, local);
check("Route Doctor phrasing only replaces the suggestion, never the evidence", phrased.value.evidence === single.evidence);
const multi = doctor.find((f) => f.locusIds.length > 1);
const before = calls.length;
await L.phraseFinding(multi, local);
check("Minimal data scope never sends multi-spot findings", calls.length === before);

/* ---------- 11. Language lint over everything the Curator produced ---------- */
check("Lint catches banned phrases", L !== null && C.lintCuratorText("You've mastered this and it is locked in.").length === 2);
const violations = allTexts.filter((s) => C.lintCuratorText(s).length);
check(`No Curator output contains "mastered", "memorized", "locked in" or labels (${allTexts.length} strings)`, violations.length === 0, violations.slice(0, 3).join(" | "));

/* ---------- 12. Templates arrive unapproved ---------- */
const tpl = PR.instantiatePresetPalace(PR.PRECISION_PRESETS[0], "My verified route", now);
check("Championship template cues arrive unapproved (rule 4)", tpl.items.every((it) => it.cueApproved === false));

let fails = 0;
for (const res of results) {
  if (!res.pass) fails++;
  console.log(`${res.pass ? "PASS" : "FAIL"}  ${res.name}${res.pass ? "" : "  → " + res.detail}`);
}
console.log(`\n${results.length - fails}/${results.length} Curator tests passed.`);
process.exit(fails ? 1 : 0);
