/* Motion + mentor rule tests (Node, no browser):
   - motion level resolution (OS reduced → off; user overrides; low power → calm, never auto-full)
   - tweenNumber lands exactly on the final value
   - mentor endpoint rules: localhost detection, URL normalisation, auto-brief gate
   - mentor reply validation: one question, banned phrases, persona cannot bypass
   - digest caps and aliasing */
import { build } from "esbuild";

globalThis.window = { matchMedia: () => ({ matches: false }), innerWidth: 1440, setTimeout, clearTimeout };
Object.defineProperty(globalThis, "navigator", {
  value: { hardwareConcurrency: 8 },
  configurable: true,
  writable: true,
});
globalThis.document = undefined;

for (const [entry, out] of [
  ["src/lib/motion.ts", "/tmp/ns-motion.mjs"],
  ["src/lib/mentor.ts", "/tmp/ns-mentor.mjs"],
]) {
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
}

const M = await import("/tmp/ns-motion.mjs");
const A = await import("/tmp/ns-mentor.mjs");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

/* ---------- motion level resolution ---------- */
check("OS reduced-motion defaults to off", M.resolveMotionLevel(undefined, true, false) === "off");
check("user Full overrides OS reduced", M.resolveMotionLevel("full", true, false) === "full");
check("low power defaults to calm", M.resolveMotionLevel(undefined, false, true) === "calm");
check("low power never auto-enables full", M.resolveMotionLevel(undefined, false, true) !== "full");
check("explicit off is respected", M.resolveMotionLevel("off", false, false) === "off");
check("default is calm", M.resolveMotionLevel(undefined, false, false) === "calm");

/* ---------- tweenNumber exact landing ---------- */
{
  // deterministic fake clock + raf
  let t = 0;
  const raf = (cb) => { t += 50; cb(t); return 0; };
  const el = { textContent: "" };
  // level() returns "off" with no document → instant path must still land exactly
  await M.tweenNumber(el, 3, 17, 300, (n) => String(Math.round(n)), raf, () => t);
  check("tweenNumber lands exactly on final value", el.textContent === "17", el.textContent);
}

/* ---------- endpoint rules ---------- */
check("localhost detected", A.isLocalEndpoint("http://localhost:11434"));
check("127.0.0.1 detected", A.isLocalEndpoint("http://127.0.0.1:1234/v1"));
check("remote is not local", !A.isLocalEndpoint("https://api.example.com/v1"));
check("garbage is not local", !A.isLocalEndpoint("not a url"));
check("same-origin /ollama proxy is local", A.isLocalEndpoint("/ollama"));
check("protocol-relative URL is not local", !A.isLocalEndpoint("//evil.example/v1"));
check("lookalike host is not local", !A.isLocalEndpoint("http://localhost.evil.example/v1"));

check("ollama base normalises", A.chatUrl("http://localhost:11434") === "http://localhost:11434/api/chat");
check("ollama full path kept", A.chatUrl("http://localhost:11434/api/chat") === "http://localhost:11434/api/chat");
check("openai v1 normalises", A.chatUrl("http://localhost:1234/v1") === "http://localhost:1234/v1/chat/completions");
check("relative ollama proxy normalises", A.chatUrl("/ollama") === "/ollama/api/chat");
check("relative openai proxy normalises", A.chatUrl("/v1") === "/v1/chat/completions");
check("provider detection: 11434 → ollama", A.detectProvider("http://localhost:11434") === "ollama");
check("provider detection: /v1 → openai", A.detectProvider("http://localhost:1234/v1") === "openai");
check("provider detection: /ollama → ollama", A.detectProvider("/ollama") === "ollama");
check("models URL: /ollama → tags", A.modelsUrl("/ollama") === "/ollama/api/tags");
check("models URL: openai v1 → models", A.modelsUrl("http://localhost:1234/v1") === "http://localhost:1234/v1/models");

/* ---------- auto-brief gate ---------- */
const uiBase = { aiEndpointNote: "", mentorAutoBrief: false };
check("gate: off by default", !A.autoBriefAllowed({ ...uiBase }).allowed);
check("gate: no endpoint blocks", !A.autoBriefAllowed({ ...uiBase, mentorAutoBrief: true }).allowed);
check(
  "gate: remote endpoint always blocked",
  !A.autoBriefAllowed({ ...uiBase, mentorAutoBrief: true, aiEndpointNote: "https://api.openai.com/v1" }).allowed,
);
check(
  "gate: localhost + toggle allowed",
  A.autoBriefAllowed({ ...uiBase, mentorAutoBrief: true, aiEndpointNote: "http://localhost:11434" }).allowed,
);

/* ---------- validation: persona cannot bypass no-shame ---------- */
const good = "Your record shows 5 craft entries before noon and none after 15:00. Which block tomorrow belongs to the sandbox work? Try 25 minutes on the harness at 09:00 as an experiment.";
check("valid strategist-style reply accepted", A.validateMentorReply(good).ok === true);
check("shame reply rejected regardless of persona", !A.validateMentorReply("You failed. You always drift. One question: why?").ok);
check("zero questions rejected", !A.validateMentorReply("Do the work. Twenty five minutes. Now. That is the move and the whole move.").ok);
check("two questions rejected", !A.validateMentorReply("Which goal matters? And when will you start?").ok);
check("'wasted time' rejected", !A.validateMentorReply("That afternoon was wasted time, wasn't it?").ok);

/* ---------- persona prompts carry the hard rules ---------- */
for (const key of ["strategist", "mentalist", "calm"]) {
  const sys = A.PERSONAS[key].system.toLowerCase();
  check(
    `persona '${key}' embeds one-question + no-shame + unknown-hours rules`,
    sys.includes("exactly one question") && sys.includes("lazy") && (sys.includes("unknown") || sys.includes("digest")),
  );
}

/* ---------- digest caps ---------- */
const mk = (i, daysAgo) => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(9, i, 0, 0);
  return { id: `real_${i}`, ts: d.toISOString(), text: `entry ${i} ${"x".repeat(200)}`, goalId: i % 2 ? "g1" : undefined };
};
const core = {
  version: 1,
  entries: Array.from({ length: 30 }, (_, i) => mk(i, i % 6)),
  goals: [{ id: "g1", title: "Ship it", direction: "d", nextAction: "next", domain: "craft", createdAt: new Date().toISOString(), active: true }],
  reviews: [],
};
const guide = { version: 1, profile: { q90: "ship the engine" }, skippedQuestions: [], neverQuestions: [], answers: [], patterns: [], dismissed: [] };
const practice = { contract: null, schedule: null, sessions: [], ledger: [], curriculum: { version: 1, placementDone: false, topics: {} }, prefs: { version: 1, aiFeedbackEnabled: false, openStartCard: true } };
const ui = { version: 1, wakeStart: 6, wakeEnd: 23, aiMentorEnabled: true, aiEndpointNote: "http://localhost:11434" };
const digest = A.buildRoutineDigest(core, guide, practice, ui);
check("digest capped", digest.chars <= 2600, String(digest.chars));
check("digest max 8 recent entries", digest.itemCount <= 8);
check("digest aliases entry ids", !digest.text.includes("real_0") && /e1 \[/.test(digest.text));
check("digest states unlogged = unknown", digest.text.includes("unlogged hours are unknown"));
check("digest carries the 90-day answer", digest.text.includes("ship the engine"));

const memory = {
  version: 1,
  items: [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `mem_${i + 1}`,
      kind: "principle",
      text: `keep memory ${i + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: true,
    })),
    {
      id: "mem_archived",
      kind: "lesson",
      text: "archived memory must not appear",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: false,
    },
  ],
};
const withMemory = A.buildRoutineDigest(core, guide, practice, ui, memory);
check("digest labels strategic memory as context, not evidence", withMemory.text.includes("STRATEGIC MEMORY") && withMemory.text.includes("NOT journal evidence"));
check("digest includes at most 8 active memories", withMemory.text.includes("keep memory 8") && !withMemory.text.includes("keep memory 9"));
check("digest excludes archived memories", !withMemory.text.includes("archived memory must not appear"));

let fails = 0;
for (const r of results) {
  if (!r.pass) fails++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : "  → " + r.detail}`);
}
console.log(`\n${results.length - fails}/${results.length} motion/mentor tests passed.`);
process.exit(fails ? 1 : 0);
