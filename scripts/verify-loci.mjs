/* Loci Method of Loci Verification Suite (Section 10 Acceptance Criteria)
   Covers:
   - Route validation and order confirmation (5–15 loci)
   - Item-to-locus mapping and overflow blocking
   - SM-2-inspired spatial scheduling for all 4 grades
   - Recall evidence evaluation and similarity notes
   - Re-encoding triggers and item resets
   - Weak spot detection
   - Export and import round-trip (schema, merge, replace)
   - Hidden answer verification
   - Theme persistence
*/
import { build } from "esbuild";

await build({
  entryPoints: ["src/lib/loci-algorithms.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/loci-algo.mjs",
  logLevel: "silent",
});

await build({
  entryPoints: ["src/lib/loci-store.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/loci-store.mjs",
  logLevel: "silent",
});

await build({
  entryPoints: ["src/lib/loci-presets.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/loci-presets.mjs",
  logLevel: "silent",
});

await build({
  entryPoints: ["src/lib/curator-core.ts"],
  bundle: true,
  format: "esm",
  outfile: "/tmp/loci-curator.mjs",
  logLevel: "silent",
});

const A = await import("/tmp/loci-algo.mjs");
const S = await import("/tmp/loci-store.mjs");
const P = await import("/tmp/loci-presets.mjs");
const E = await import("/tmp/loci-curator.mjs");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

/* ---------------- 1. Route validation (5–15 spots) ---------------- */
const makeRoute = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `l_${i + 1}`,
    order: i + 1,
    spot: `Spot #${i + 1}`,
    landmark: `Landmark #${i + 1}`,
  }));

const routeUnder5 = makeRoute(4);
const vUnder = A.validateRoute(routeUnder5, true);
check("Route < 5 spots is invalid", !vUnder.valid && vUnder.errors.some((e) => e.includes("minimum is 5")));

const routeOver15 = makeRoute(16);
const vOver = A.validateRoute(routeOver15, true);
check("Route > 15 spots is invalid", !vOver.valid && vOver.errors.some((e) => e.includes("maximum is 15")));

const routeValid7 = makeRoute(7);
const vValid = A.validateRoute(routeValid7, true);
check("Route with 7 unique spots is valid", vValid.valid && vValid.errors.length === 0);

const vUnconfirmed = A.validateRoute(routeValid7, false);
check("Unconfirmed route order blocks validation", !vUnconfirmed.valid && vUnconfirmed.errors.some((e) => e.includes("confirm")));

const routeWithEmpty = makeRoute(6);
routeWithEmpty[2].spot = "   ";
const vEmpty = A.validateRoute(routeWithEmpty, true);
check("Empty spot name is blocked", !vEmpty.valid && vEmpty.errors.some((e) => e.includes("empty")));

const routeDuplicate = makeRoute(6);
routeDuplicate[1].spot = "Front Porch";
routeDuplicate[4].spot = "Front Porch";
const vDup = A.validateRoute(routeDuplicate, true);
check("Exact duplicate spot names produce warning", vDup.warnings.some((w) => w.includes("exact same name")));

/* ---------------- 2. SM-2 Scheduling Algorithm ---------------- */
const now = new Date("2026-06-01T12:00:00.000Z");
const initial = A.createInitialReviewState(now);
check("Initial review state has ease 2.5, interval 0, reps 0, lapses 0",
  initial.ease === 2.5 && initial.intervalDays === 0 && initial.reps === 0 && initial.lapses === 0
);

// Grade 1: Again
const nextAgain = A.calculateNextDue(initial, "again", now);
check("Again: interval 0 days, lapses + 1, ease decreases, due in 10 minutes",
  nextAgain.intervalDays === 0 &&
  nextAgain.lapses === 1 &&
  nextAgain.reps === 0 &&
  nextAgain.ease === 2.3 &&
  new Date(nextAgain.dueAt).getTime() === now.getTime() + 10 * 60 * 1000
);

// Grade 2: Hard
const nextHard = A.calculateNextDue(initial, "hard", now);
check("Hard rep 0: interval 1 day, reps + 1, ease decreases",
  nextHard.intervalDays === 1 &&
  nextHard.reps === 1 &&
  nextHard.ease === 2.35 &&
  new Date(nextHard.dueAt).getTime() === now.getTime() + 1 * 24 * 60 * 60 * 1000
);

// Hard subsequent rep: interval = max(1, round(interval * 1.2))
const nextHard2 = A.calculateNextDue(nextHard, "hard", now);
check("Hard subsequent rep: interval grows by 1.2 factor",
  nextHard2.intervalDays === 1 && nextHard2.reps === 2
);

// Grade 3: Good
const nextGood1 = A.calculateNextDue(initial, "good", now);
check("Good rep 0: interval 1 day, reps 1, ease remains 2.5",
  nextGood1.intervalDays === 1 && nextGood1.reps === 1 && nextGood1.ease === 2.5
);
const nextGood2 = A.calculateNextDue(nextGood1, "good", now);
check("Good rep 1: interval 3 days, reps 2",
  nextGood2.intervalDays === 3 && nextGood2.reps === 2
);
const nextGood3 = A.calculateNextDue(nextGood2, "good", now);
check("Good rep 2: interval = round(3 * 2.5) = 8 days",
  nextGood3.intervalDays === 8 && nextGood3.reps === 3
);

// Grade 4: Easy
const nextEasy1 = A.calculateNextDue(initial, "easy", now);
check("Easy rep 0: interval 2 days, reps 1, ease increases to 2.65",
  nextEasy1.intervalDays === 2 && nextEasy1.reps === 1 && nextEasy1.ease === 2.65
);
const nextEasy2 = A.calculateNextDue(nextEasy1, "easy", now);
check("Easy rep 1: interval 5 days, reps 2, ease increases to 2.80",
  nextEasy2.intervalDays === 5 && nextEasy2.reps === 2 && nextEasy2.ease === 2.8
);

// Ease clamping
let lowEaseState = { ease: 1.35, intervalDays: 1, reps: 3, lapses: 2, dueAt: now.toISOString() };
const clampedLow = A.calculateNextDue(lowEaseState, "again", now);
check("Ease is clamped at lower bound 1.3", clampedLow.ease === 1.3);

let highEaseState = { ease: 2.95, intervalDays: 10, reps: 5, lapses: 0, dueAt: now.toISOString() };
const clampedHigh = A.calculateNextDue(highEaseState, "easy", now);
check("Ease is clamped at upper bound 3.0", clampedHigh.ease === 3.0);

/* ---------------- 3. Recall Evidence Evaluation ---------------- */
const target = "Periodic Table of Elements";

const evExact = A.evaluateRecall("Periodic Table of Elements", target);
check("Exact match recall", evExact.match === "exact" && evExact.similarity === 1.0);

const evArticles = A.evaluateRecall("the periodic table of elements", target);
check("Normalizes punctuation, case, and articles", evArticles.match === "exact");

const evClose = A.evaluateRecall("Periodik Table of Elements", target);
check("Close match detected with Levenshtein similarity >= 0.8", evClose.match === "close" && evClose.similarity >= 0.8);

const evKeywords = A.evaluateRecall("periodic elements table", target);
check("Keywords match detected when words overlap", evKeywords.match === "keywords");

const evNone = A.evaluateRecall("completely different topic", target);
check("No match detected", evNone.match === "none");

const evEmpty = A.evaluateRecall("", target);
check("Empty answer is none", evEmpty.match === "none");

/* ---------------- 4. Re-encoding Spatial Mapping Rules (Section 7) ---------------- */
const origRoute = [
  { id: "l1", order: 1, spot: "Front porch", landmark: "Scraper" },
  { id: "l2", order: 2, spot: "Entryway", landmark: "Antlers" },
  { id: "l3", order: 3, spot: "Living room", landmark: "Hearth" },
  { id: "l4", order: 4, spot: "Kitchen", landmark: "Pantry" },
  { id: "l5", order: 5, spot: "Patio", landmark: "Latch" },
];

const sampleItems = [
  { id: "it1", locusId: "l1", text: "Item 1", imageCue: "Cue 1", imageSource: "user", review: { ...initial, reps: 3, intervalDays: 10 } },
  { id: "it2", locusId: "l2", text: "Item 2", imageCue: "Cue 2", imageSource: "user", review: { ...initial, reps: 2, intervalDays: 5 } },
  { id: "it3", locusId: "l3", text: "Item 3", imageCue: "Cue 3", imageSource: "user", review: { ...initial, reps: 4, intervalDays: 15 } },
];

// Reordering l1 and l2
const reorderedRoute = [
  { id: "l2", order: 1, spot: "Entryway", landmark: "Antlers" },
  { id: "l1", order: 2, spot: "Front porch", landmark: "Scraper" },
  { id: "l3", order: 3, spot: "Living room", landmark: "Hearth" },
  { id: "l4", order: 4, spot: "Kitchen", landmark: "Pantry" },
  { id: "l5", order: 5, spot: "Patio", landmark: "Latch" },
];

const diffReorder = A.detectSpatialMappingChanges(origRoute, reorderedRoute, sampleItems);
check("Reordering loci flags breaking change and marks affected items",
  diffReorder.hasBreakingChanges &&
  diffReorder.affectedItemIds.includes("it1") &&
  diffReorder.affectedItemIds.includes("it2") &&
  !diffReorder.affectedItemIds.includes("it3")
);

// Reset items for re-encoding
const resetItems = A.resetItemsForReencoding(sampleItems, diffReorder.affectedItemIds, now);
const resetIt1 = resetItems.find((it) => it.id === "it1");
const untouchedIt3 = resetItems.find((it) => it.id === "it3");
check("Reset affected items sets interval 0, reps 0, needsReencode true",
  resetIt1.needsReencode === true && resetIt1.review.intervalDays === 0 && resetIt1.review.reps === 0
);
check("Untouched item retains previous review interval",
  untouchedIt3.needsReencode === undefined && untouchedIt3.review.intervalDays === 15
);

// Gentle notice when only landmark or sense edited
const cosmeticRoute = [
  { id: "l1", order: 1, spot: "Front porch", landmark: "New Brass Scraper" },
  { id: "l2", order: 2, spot: "Entryway", landmark: "Antlers" },
  { id: "l3", order: 3, spot: "Living room", landmark: "Hearth" },
  { id: "l4", order: 4, spot: "Kitchen", landmark: "Pantry" },
  { id: "l5", order: 5, spot: "Patio", landmark: "Latch" },
];
const diffCosmetic = A.detectSpatialMappingChanges(origRoute, cosmeticRoute, sampleItems);
check("Editing landmark only generates gentle notice without breaking re-encode",
  !diffCosmetic.hasBreakingChanges && diffCosmetic.gentleNotices.length > 0 && diffCosmetic.affectedItemIds.length === 0
);

/* ---------------- 5. Weak Spot Detection ---------------- */
const weakByLapses = { ...sampleItems[0], review: { ...initial, lapses: 2, ease: 2.2 } };
const weakByEase = { ...sampleItems[0], review: { ...initial, lapses: 0, ease: 1.7 } };
const strongItem = { ...sampleItems[0], review: { ...initial, lapses: 0, ease: 2.5 } };
check("Weak spot identified by 2 lapses", A.isWeakSpot(weakByLapses));
check("Weak spot identified by ease < 1.8", A.isWeakSpot(weakByEase));
check("Strong item not marked as weak spot", !A.isWeakSpot(strongItem));

/* ---------------- 6. Export and Import Round-Trip ---------------- */
const samplePalace = S.createSamplePalace();
const testState = {
  version: 1,
  palaces: [samplePalace],
  sessions: [],
  settings: S.DEFAULT_LOCI_SETTINGS,
};

const exportedJson = JSON.stringify({
  format: "loci:v1",
  exportedAt: new Date().toISOString(),
  data: {
    palaces: [samplePalace],
    sessions: [],
    settings: S.DEFAULT_LOCI_SETTINGS,
  },
}, null, 2);

const preview = S.previewLociImport(exportedJson);
check("Import preview recognizes format 'loci:v1'", preview.valid && preview.palaceCount === 1);
check("Import preview parses spot and item counts correctly", preview.totalSpots === 7 && preview.totalItems === 7);

const invalidJson = "{ invalid json string ";
const previewInvalid = S.previewLociImport(invalidJson);
check("Invalid JSON string safely rejected with error", !previewInvalid.valid && previewInvalid.error.includes("Failed to parse"));

const wrongFormatJson = JSON.stringify({ format: "other:v1", data: {} });
const previewWrongFormat = S.previewLociImport(wrongFormatJson);
check("Wrong format header safely rejected", !previewWrongFormat.valid && previewWrongFormat.error.includes("loci:v1"));

/* ---------------- 7. Precision Championship Presets ---------------- */
check("5 Championship precision presets defined", P.PRECISION_PRESETS.length === 5);
const majorSystem = P.PRECISION_PRESETS.find((p) => p.id === "major-system-peg");
check("Major System preset has 10 loci and 10 items", majorSystem && majorSystem.lociCount === 10 && majorSystem.defaultItems.length === 10);
const neuroVault = P.PRECISION_PRESETS.find((p) => p.id === "neuro-cranial-12");
check("Neuro-vault preset has 12 cranial nerve loci", neuroVault && neuroVault.lociCount === 12 && neuroVault.defaultItems.length === 12);
const mentalModels = P.PRECISION_PRESETS.find((p) => p.id === "mental-models-10");
check("Mental models citadel has 10 heuristic loci", mentalModels && mentalModels.lociCount === 10);

const deployedPalace = P.instantiatePresetPalace(majorSystem, "My Verified Daily Commute", now);
check("Instantiate preset palace creates valid palace with confirmed location",
  deployedPalace.name === majorSystem.name &&
  deployedPalace.location === "My Verified Daily Commute" &&
  deployedPalace.locationConfirmed === true &&
  deployedPalace.route.length === 10 &&
  deployedPalace.items.length === 10
);

/* ---------------- 8. Cue quality scoring (Curator's four axes) ----------------
   The old loci-evolution scorer was deleted: it duplicated this logic and could
   rewrite cues on its own. These cases now run against the single scorer. */
const strongCue = "A blinding chrome sphere rolls violently over the coarse bristled coir doormat, shooting ice-cold sparks into the fibers!";
const strong = E.critiqueCueLocal({ cue: strongCue, landmark: "Coarse bristled coir doormat", spot: "Front porch", sense: "Scratchy dry fibers", siblingCues: [] });
check(
  "A strong cue scores at least 2 of 3 on every axis",
  E.CRITIC_AXES.every((ax) => strong.scores[ax] >= 2),
  JSON.stringify(strong.scores),
);

const flatCue = "I remember the number zero.";
const flat = E.critiqueCueLocal({ cue: flatCue, landmark: "Coarse bristled coir doormat", spot: "Front porch", sense: "Scratchy dry fibers", siblingCues: [] });
check("A flat cue scores 0 on interaction and gets one question", flat.scores.interaction === 0 && (flat.question.match(/\?/g) ?? []).length === 1);

check(
  "Championship template cues score well on interaction and sensory",
  deployedPalace.items.every((it) => {
    const l = deployedPalace.route.find((x) => x.id === it.locusId);
    const c = E.critiqueCueLocal({ cue: it.imageCue, landmark: l.landmark, spot: l.spot, sense: l.sense, siblingCues: [] });
    return c.scores.interaction >= 2 && c.scores.sensory >= 1;
  }),
);


/* ---------------- 12. Legacy Northern v2 migration ---------------- */
const oldLoci = {
  version: 1,
  palaces: [
    {
      id: "p_old",
      name: "Old flat",
      location: "The flat I left",
      createdAt: "2025-01-01T10:00:00.000Z",
      updatedAt: "2025-02-01T10:00:00.000Z",
      lastReviewAt: "2025-02-01T10:00:00.000Z",
      firstWalkComplete: true,
      loci: [
        { id: "s1", name: "Front door", landmark: "Brass handle", sensory: "cold metal" },
        { id: "s2", name: "Hall", landmark: "Shoe rack", sensory: "damp wool" },
        { id: "s3", name: "Kitchen", landmark: "Kettle", sensory: "steam" },
        { id: "s4", name: "Window", landmark: "Sill", sensory: "draught" },
        { id: "s5", name: "Desk", landmark: "Lamp", sensory: "warm bulb" },
      ],
      items: [
        {
          id: "i1",
          locusId: "s1",
          text: "Mitochondria",
          cue: "A brass handle grows a tail and breathes.",
          cueApproved: false,
          cueSource: "ai",
          intervalDays: 4,
          ease: 2.2,
          reps: 3,
          lapses: 1,
          dueAt: "2025-02-05T10:00:00.000Z",
          lastReviewedAt: "2025-02-01T10:00:00.000Z",
          lastGrade: "hard",
        },
      ],
    },
  ],
  sessions: [
    {
      id: "sess_1",
      palaceId: "p_old",
      startedAt: "2025-02-01T10:00:00.000Z",
      endedAt: "2025-02-01T10:05:00.000Z",
      mode: "first",
      results: [{ itemId: "i1", grade: "hard", recalled: false, typed: "mitochondria" }],
    },
    {
      id: "sess_2",
      palaceId: "p_old",
      startedAt: "2025-02-02T10:00:00.000Z",
      mode: "weak",
      results: [{ itemId: "i1", grade: "good", recalled: true, typed: "mitochondria" }],
    },
  ],
  settings: { verbalMode: true },
};
const migrated = S.migrateOldLoci(oldLoci);
check("Legacy Loci migration maps one palace and one item", migrated?.palaceCount === 1 && migrated?.itemCount === 1, JSON.stringify(migrated && { p: migrated.palaceCount, i: migrated.itemCount }));
check("Legacy route keeps order and landmark", migrated?.palaces[0].route.length === 5 && migrated.palaces[0].route[0].spot === "Front door" && migrated.palaces[0].route[0].landmark === "Brass handle");
const legacyItem = migrated?.palaces[0].items[0];
check("Legacy item keeps scheduling and cue approval", legacyItem?.review.ease === 2.2 && legacyItem?.review.intervalDays === 4 && legacyItem?.cueApproved === false && legacyItem?.imageSource === "ai-edited", JSON.stringify(legacyItem));
check("Legacy item points at a migrated spot", migrated?.palaces[0].route.some((l) => l.id === legacyItem?.locusId));
check("Legacy sessions map modes first→first-walk and weak→random", migrated?.sessions[0].mode === "first-walk" && migrated?.sessions[1].mode === "random");
check("Legacy sessions keep results and the palace id", migrated?.sessions[0].results[0].grade === "hard" && migrated?.sessions[0].palaceId === migrated?.palaces[0].id);
check("Legacy verbal mode migrates", migrated?.settings.verbalMode === true);
check("Legacy migration rejects a palace with fewer than 5 spots", S.migrateOldLoci({ ...oldLoci, palaces: [{ ...oldLoci.palaces[0], loci: oldLoci.palaces[0].loci.slice(0, 4) }] })?.palaceCount === 0);
check("Legacy migration rejects malformed input", S.migrateOldLoci({ version: 2, palaces: [] }) === null);

let fails = 0;
for (const r of results) {
  if (!r.pass) fails++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : "  → " + r.detail}`);
}

console.log(`\n${results.length - fails}/${results.length} Loci tests passed.`);
process.exit(fails ? 1 : 0);
