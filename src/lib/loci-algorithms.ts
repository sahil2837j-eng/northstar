import type { Locus, PalaceItem, ReviewGrade, ReviewState } from "./loci-types";
import { isLocalEndpoint } from "./ai-endpoints";
import { aiChat, remoteReady } from "./remote-ai";

/* ============================================================
   SM-2 SPATIAL SCHEDULING ALGORITHM
   ============================================================ */

/** Longest interval we will ever schedule (~27 years). Keeps dueAt a valid date
    even when stored state is corrupt; no human schedule needs more. */
export const MAX_INTERVAL_DAYS = 10000;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;

const finite = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const isoOrUndefined = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

/** Coerce any stored or imported review state into a usable one. Never throws. */
export function sanitizeReviewState(
  r: Partial<ReviewState> | null | undefined,
  now: Date = new Date(),
): ReviewState {
  const src = r && typeof r === "object" ? r : {};
  const history = Array.isArray(src.easeHistory)
    ? src.easeHistory
        .filter((h) => h && typeof h === "object" && isoOrUndefined(h.date))
        .map((h) => ({
          date: isoOrUndefined(h.date) as string,
          ease: clamp(finite(h.ease, 2.5), MIN_EASE, MAX_EASE),
        }))
        .slice(-20)
    : [];

  return {
    ease: clamp(Math.round(finite(src.ease, 2.5) * 100) / 100, MIN_EASE, MAX_EASE),
    intervalDays: clamp(Math.round(finite(src.intervalDays, 0)), 0, MAX_INTERVAL_DAYS),
    reps: Math.max(0, Math.round(finite(src.reps, 0))),
    lapses: Math.max(0, Math.round(finite(src.lapses, 0))),
    dueAt: isoOrUndefined(src.dueAt) ?? now.toISOString(),
    lastReviewedAt: isoOrUndefined(src.lastReviewedAt),
    lastGrade: (["again", "hard", "good", "easy"] as const).includes(src.lastGrade as ReviewGrade)
      ? (src.lastGrade as ReviewGrade)
      : undefined,
    ...(history.length ? { easeHistory: history } : {}),
    ...(src.prevIntervalDays !== undefined
      ? { prevIntervalDays: clamp(Math.round(finite(src.prevIntervalDays, 0)), 0, MAX_INTERVAL_DAYS) }
      : {}),
    ...(src.prevEase !== undefined ? { prevEase: clamp(finite(src.prevEase, 2.5), MIN_EASE, MAX_EASE) } : {}),
    ...(src.prevReps !== undefined ? { prevReps: Math.max(0, Math.round(finite(src.prevReps, 0))) } : {}),
  };
}

export function createInitialReviewState(now: Date = new Date()): ReviewState {
  return {
    ease: 2.5,
    intervalDays: 0,
    dueAt: now.toISOString(),
    reps: 0,
    lapses: 0,
  };
}

export function calculateNextDue(
  current: ReviewState,
  grade: ReviewGrade,
  now: Date = new Date(),
): ReviewState {
  // Corrupt state (NaN ease, absurd interval, hand-edited backup) must never
  // produce an invalid date, so everything is coerced into range first.
  const safe = sanitizeReviewState(current, now);
  let ease = safe.ease;
  let interval = safe.intervalDays;
  let reps = safe.reps;
  let lapses = safe.lapses;
  let nextDue: Date;

  switch (grade) {
    case "again": {
      lapses += 1;
      reps = 0;
      ease = Math.max(1.3, ease - 0.2);
      interval = 0;
      // 10 minutes from now
      nextDue = new Date(now.getTime() + 10 * 60 * 1000);
      break;
    }
    case "hard": {
      ease = Math.max(MIN_EASE, ease - 0.15);
      interval = reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
      reps += 1;
      break;
    }
    case "good": {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 3;
      else interval = Math.max(1, Math.round(interval * ease));
      reps += 1;
      break;
    }
    case "easy": {
      ease = Math.min(MAX_EASE, ease + 0.15);
      if (reps === 0) interval = 2;
      else if (reps === 1) interval = 5;
      else interval = Math.max(1, Math.round(interval * ease * 1.3));
      reps += 1;
      break;
    }
  }

  // Clamp ease and interval, then derive the due date so it is always valid.
  ease = clamp(Math.round(ease * 100) / 100, MIN_EASE, MAX_EASE);
  interval = clamp(interval, 0, MAX_INTERVAL_DAYS);
  if (grade !== "again") nextDue = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

  return {
    ease,
    intervalDays: interval,
    dueAt: nextDue!.toISOString(),
    reps,
    lapses,
    lastReviewedAt: now.toISOString(),
    lastGrade: grade,
    // Recorded for the Explain panel: the inputs this grade was computed from.
    prevIntervalDays: safe.intervalDays,
    prevEase: safe.ease,
    prevReps: safe.reps,
    easeHistory: [...(safe.easeHistory ?? []), { date: now.toISOString(), ease }].slice(-20),
  };
}

export function formatIntervalPreview(grade: ReviewGrade, current: ReviewState): string {
  const simulated = calculateNextDue(current, grade);
  if (simulated.intervalDays === 0) {
    return "10 min";
  }
  if (simulated.intervalDays === 1) {
    return "1 day";
  }
  return `${simulated.intervalDays} days`;
}

export function isItemDue(item: PalaceItem, now: Date = new Date()): boolean {
  const due = Date.parse(item?.review?.dueAt ?? "");
  // An unusable due date means "never scheduled", which counts as due.
  return Number.isNaN(due) ? true : due <= now.getTime();
}

export function isWeakSpot(item: PalaceItem): boolean {
  const r = item?.review;
  if (!r) return false;
  return finite(r.lapses, 0) >= 2 || finite(r.ease, 2.5) < 1.8;
}

/* ============================================================
   STRING SIMILARITY & RECALL EVIDENCE EVALUATION
   ============================================================ */

export function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, " ")
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Longest strings we run edit distance on. Beyond this the quadratic cost
    would block the main thread, and the similarity figure stops being useful. */
export const MAX_COMPARE_CHARS = 400;

/** Levenshtein distance, two-row (O(min(n,m)) memory) and length-capped. */
export function levenshtein(a: string, b: string): number {
  const s = a.length > MAX_COMPARE_CHARS ? a.slice(0, MAX_COMPARE_CHARS) : a;
  const t = b.length > MAX_COMPARE_CHARS ? b.slice(0, MAX_COMPARE_CHARS) : b;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  // Keep the inner loop over the shorter string so the rows stay small.
  const [short, long] = s.length <= t.length ? [s, t] : [t, s];
  let prev = new Uint32Array(short.length + 1);
  let curr = new Uint32Array(short.length + 1);
  for (let j = 0; j <= short.length; j++) prev[j] = j;

  for (let i = 1; i <= long.length; i++) {
    curr[0] = i;
    const lc = long.charCodeAt(i - 1);
    for (let j = 1; j <= short.length; j++) {
      const cost = lc === short.charCodeAt(j - 1) ? 0 : 1;
      const del = curr[j - 1] + 1;
      const ins = prev[j] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[short.length];
}

export function stringSimilarityRatio(a: string, b: string): number {
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);
  if (!s1 && !s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1 === s2) return 1.0;
  // Compare the same capped slices the distance actually sees.
  const c1 = s1.slice(0, MAX_COMPARE_CHARS);
  const c2 = s2.slice(0, MAX_COMPARE_CHARS);
  const maxLen = Math.max(c1.length, c2.length);
  if (maxLen === 0) return 1.0;
  return Math.max(0, 1 - levenshtein(c1, c2) / maxLen);
}

export interface RecallEvidence {
  match: "exact" | "close" | "keywords" | "none";
  note: string;
  similarity: number;
}

export function evaluateRecall(typed: string, target: string): RecallEvidence {
  const rawTyped = (typed || "").trim();
  if (!rawTyped) {
    return { match: "none", note: "No answer typed", similarity: 0 };
  }

  const normTyped = normalizeText(rawTyped);
  const normTarget = normalizeText(target);

  if (normTyped === normTarget) {
    return { match: "exact", note: "Exact match", similarity: 1.0 };
  }

  const ratio = stringSimilarityRatio(normTyped, normTarget);
  if (ratio >= 0.8) {
    return {
      match: "close",
      note: `Close match (${Math.round(ratio * 100)}% similarity)`,
      similarity: ratio,
    };
  }

  // Keyword overlap
  const typedTokens = new Set(normTyped.split(" ").filter((w) => w.length > 2));
  const targetTokens = new Set(normTarget.split(" ").filter((w) => w.length > 2));
  let overlapCount = 0;
  for (const t of typedTokens) {
    if (targetTokens.has(t)) overlapCount++;
  }

  if (overlapCount > 0 && targetTokens.size > 0) {
    const keywordRatio = overlapCount / targetTokens.size;
    if (keywordRatio >= 0.5) {
      return {
        match: "keywords",
        note: `Keywords matched (${overlapCount} of ${targetTokens.size} words)`,
        similarity: Math.max(ratio, keywordRatio * 0.75),
      };
    }
  }

  return {
    match: "none",
    note: "Does not match target text",
    similarity: ratio,
  };
}

/* ============================================================
   ROUTE VALIDATION
   ============================================================ */

export interface RouteValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateRoute(loci: Locus[], orderConfirmed: boolean = false): RouteValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (loci.length < 5) {
    errors.push(`Route has ${loci.length} spots (minimum is 5). Method of Loci requires an ordered path of 5 to 15 distinct spots.`);
  } else if (loci.length > 15) {
    errors.push(`Route has ${loci.length} spots (maximum is 15). To prevent cognitive crowding, keep palaces between 5 and 15 spots or split into another palace.`);
  }

  const emptySpots = loci.filter((l) => !l.spot.trim());
  if (emptySpots.length > 0) {
    errors.push(`${emptySpots.length} spot${emptySpots.length === 1 ? "" : "s"} have empty names.`);
  }

  const emptyLandmarks = loci.filter((l) => !l.landmark.trim());
  if (emptyLandmarks.length > 0) {
    errors.push(`${emptyLandmarks.length} spot${emptyLandmarks.length === 1 ? "" : "s"} have empty landmark descriptions.`);
  }

  if (!orderConfirmed) {
    errors.push("You must confirm the physical order of your route before continuing.");
  }

  // Check for duplicate or very similar spot names
  const normalizedSpots = loci.map((l, idx) => ({ idx: idx + 1, norm: normalizeText(l.spot), raw: l.spot }));
  for (let i = 0; i < normalizedSpots.length; i++) {
    for (let j = i + 1; j < normalizedSpots.length; j++) {
      const a = normalizedSpots[i];
      const b = normalizedSpots[j];
      if (a.norm && b.norm) {
        if (a.norm === b.norm) {
          warnings.push(`Spots #${a.idx} ("${a.raw}") and #${b.idx} ("${b.raw}") have the exact same name. Make sure they are physically distinct loci.`);
        } else if (stringSimilarityRatio(a.norm, b.norm) > 0.8) {
          warnings.push(`Spots #${a.idx} ("${a.raw}") and #${b.idx} ("${b.raw}") have very similar names. Spatial recall requires clearly distinct spots.`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/* ============================================================
   RE-ENCODING SPATIAL MAPPING RULES (Section 7)
   ============================================================ */

export interface SpatialMappingDiff {
  hasBreakingChanges: boolean;
  affectedItemIds: string[];
  reasons: string[];
  gentleNotices: string[];
}

export function detectSpatialMappingChanges(
  originalRoute: Locus[],
  updatedRoute: Locus[],
  items: PalaceItem[],
): SpatialMappingDiff {
  const affectedItemIds = new Set<string>();
  const reasons: string[] = [];
  const gentleNotices: string[] = [];

  const originalMap = new Map<string, { locus: Locus; order: number }>();
  originalRoute.forEach((l, idx) => originalMap.set(l.id, { locus: l, order: idx + 1 }));

  const updatedMap = new Map<string, { locus: Locus; order: number }>();
  updatedRoute.forEach((l, idx) => updatedMap.set(l.id, { locus: l, order: idx + 1 }));

  // Deleted loci
  for (const [id, orig] of originalMap.entries()) {
    if (!updatedMap.has(id)) {
      reasons.push(`Locus #${orig.order} ("${orig.locus.spot}") was deleted.`);
      items.filter((it) => it.locusId === id).forEach((it) => affectedItemIds.add(it.id));
    }
  }

  // Inserted or reordered loci
  for (const [id, updated] of updatedMap.entries()) {
    const orig = originalMap.get(id);
    if (!orig) {
      // newly inserted locus
      reasons.push(`New locus inserted at #${updated.order} ("${updated.locus.spot}").`);
    } else if (orig.order !== updated.order) {
      reasons.push(`Locus "${updated.locus.spot}" moved from #${orig.order} to #${updated.order}.`);
      items.filter((it) => it.locusId === id).forEach((it) => affectedItemIds.add(it.id));
    } else {
      // Same position: check if landmark, sense, or photo changed (gentle notice only)
      if (orig.locus.landmark !== updated.locus.landmark) {
        gentleNotices.push(`Landmark description updated at #${updated.order} ("${updated.locus.spot}").`);
      }
      if (orig.locus.sense !== updated.locus.sense) {
        gentleNotices.push(`Sensory detail updated at #${updated.order}.`);
      }
      if (orig.locus.photoId !== updated.locus.photoId) {
        gentleNotices.push(`Photo updated at #${updated.order}.`);
      }
    }
  }

  return {
    hasBreakingChanges: affectedItemIds.size > 0 || reasons.length > 0,
    affectedItemIds: Array.from(affectedItemIds),
    reasons,
    gentleNotices,
  };
}

export function resetItemsForReencoding(items: PalaceItem[], affectedIds: string[], now: Date = new Date()): PalaceItem[] {
  const affectedSet = new Set(affectedIds);
  return items.map((item) => {
    if (affectedSet.has(item.id)) {
      return {
        ...item,
        needsReencode: true,
        review: createInitialReviewState(now),
      };
    }
    return item;
  });
}

/* ============================================================
   IMAGE CUE GENERATION (Local Ollama / Fallbacks)
   ============================================================ */

export interface CueSuggestionOptions {
  item: string;
  spot: string;
  landmark: string;
  sense?: string;
  verbalMode?: boolean;
  aiEndpoint?: string;
  aiModel?: string;
}

function parseCueContent(content: unknown): string | null {
  if (typeof content !== "string") return null;
  const raw = content.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (parsed && typeof parsed.cue === "string" && parsed.cue.trim()) return parsed.cue.trim();
  } catch {
    /* not pure JSON */
  }

  const embedded = raw.match(/"cue"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (embedded) {
    try {
      return JSON.parse(`"${embedded[1]}"`).trim();
    } catch {
      return embedded[1].trim();
    }
  }

  /* Some local models ignore the JSON instruction and return one plain sentence. */
  const first = raw.split(/\n/)[0].replace(/^["'`]|["'`]$/g, "").trim();
  if (first && !first.startsWith("{") && first.split(/\s+/).length <= 30) return first;
  return null;
}

export async function suggestImageCue(options: CueSuggestionOptions): Promise<string> {
  const endpoint = (options.aiEndpoint || "/ollama").replace(/\/+$/, "");
  const model = options.aiModel || "qwen2.5:7b-instruct";

  // Network rule: never call anything off this machine unless the user
  // explicitly opted in to the remote API and it is ready (HTTPS + key).
  if (!remoteReady() && !isLocalEndpoint(endpoint)) return generateFallbackCue(options);

  const system = options.verbalMode
    ? 'You write one vivid, narrative memory cue for a Method of Loci trainer. Describe a sound, story, or feeling instead of relying on sight. One sentence, under 25 words, physically attached to the landmark. No praise, no commands, no claims about memory. JSON only: {"cue":"your sentence"}'
    : 'You write one absurd, highly memorable, sensory-rich memory cue for a Method of Loci trainer. Place the item physically interacting with the landmark. One sentence, under 25 words. Make it bizarre, humorous, or physically impossible. No praise, no commands, no claims about memory. JSON only: {"cue":"your sentence"}';

  const user = JSON.stringify({
    item: options.item,
    spot: options.spot,
    landmark: options.landmark,
    sense: options.sense ?? null,
  });

  const result = await aiChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    localEndpoint: endpoint,
    localModel: model,
    temperature: 0.8,
    maxTokens: 200,
    json: true,
    timeoutMs: 60000,
  });

  if (result.ok && result.text) {
    const cue = parseCueContent(result.text);
    if (cue) return cue;
  }

  // Deterministic memory-science fallback template
  return generateFallbackCue(options);
}

export function generateFallbackCue(options: CueSuggestionOptions): string {
  const { item, spot, landmark, sense, verbalMode } = options;

  if (verbalMode) {
    if (sense) {
      return `At the ${spot}, a giant ${item} is wedged into the ${landmark}, filled with the unmistakable sensation of ${sense}.`;
    }
    return `Right by the ${landmark} at the ${spot}, an oversized ${item} blocks your path, humming with mysterious energy.`;
  }

  // Absurd physical interaction linking item to landmark
  if (sense) {
    return `A gargantuan, glowing ${item} violently crashes into the ${landmark}, exploding with the sharp scent of ${sense}!`;
  }
  return `A gigantic, animated ${item} is comically stuck inside the ${landmark}, spinning out of control!`;
}
