/* Curator — session planning and the graded hint ladder.

   Both are deterministic so a review works identically with the model off.
   Hints are validated against the answer before they are shown: a hint that
   contains the item text is replaced rather than displayed. */

import type { HintDepth, Locus, Palace, PalaceItem, ReviewResult, ReviewSession } from "./loci-types";
import { isItemDue, isWeakSpot, normalizeText } from "./loci-algorithms";
import {
  article,
  categoryOf,
  isActionWord,
  isSenseWord,
  pct,
  plural,
  sortRoute,
  stem,
  words,
} from "./curator-text";

/* ============================================================
   MODULE 5 — SESSION PLANNER
   ============================================================ */

export const SESSION_CAP = 20;
export const SESSION_MINUTES = 15;
export const STOP_WINDOW = 6;
export const STOP_THRESHOLD = 0.5;

export interface SessionPlan {
  queue: PalaceItem[];
  dueCount: number;
  narration: string;
  estMinutes: number;
  warmupIds: string[];
  practicePass: boolean;
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function planSession(
  palace: Palace,
  mode: ReviewSession["mode"],
  now: Date = new Date(),
  useRules = true,
): SessionPlan {
  const order = new Map(sortRoute(palace.route).map((l, i) => [l.id, i]));
  const byRoute = palace.items
    .filter((it) => order.has(it.locusId))
    .sort((a, b) => (order.get(a.locusId) ?? 0) - (order.get(b.locusId) ?? 0));

  if (mode === "first-walk") {
    const queue = byRoute.slice(0, SESSION_CAP);
    return {
      queue,
      dueCount: queue.length,
      narration: `First-walk recall pass: ${plural(queue.length, "item")} in route order.`,
      estMinutes: Math.max(1, Math.ceil((queue.length * 25) / 60)),
      warmupIds: [],
      practicePass: false,
    };
  }

  const due = byRoute.filter((it) => isItemDue(it, now));
  const practicePass = due.length === 0;
  const pool = practicePass ? byRoute : due;
  let queue = pool.slice(0, SESSION_CAP);
  if (mode === "random") queue = shuffle(queue);

  let warmupIds: string[] = [];
  if (useRules && mode === "recall" && queue.length > 4) {
    const warm = queue.filter((it) => it.review.ease > 2.3 && it.review.reps > 0 && !isWeakSpot(it)).slice(0, 2);
    if (warm.length) {
      warmupIds = warm.map((w) => w.id);
      queue = [...warm, ...queue.filter((it) => !warmupIds.includes(it.id))];
    }
  }
  if (useRules && queue.length > 2 && isWeakSpot(queue[queue.length - 1])) {
    const weak = queue.pop() as PalaceItem;
    queue.splice(Math.floor(queue.length / 2), 0, weak);
  }

  const estMinutes = Math.max(1, Math.ceil((queue.length * 25) / 60));
  const modeText =
    mode === "random"
      ? "in random order"
      : mode === "reverse"
        ? "as reverse recall (item shown, spot asked) in route order"
        : "in route order";
  const capped = pool.length > SESSION_CAP ? ` (capped at ${SESSION_CAP})` : "";
  const warmText = warmupIds.length ? `, ${plural(warmupIds.length, "warm-up item")} first` : "";
  const stopText = ` Stopping early is offered if accuracy drops below ${pct(STOP_THRESHOLD)} over ${STOP_WINDOW} consecutive items, or at ${SESSION_MINUTES} minutes.`;
  const narration =
    queue.length === 0
      ? "This palace has no placed items yet, so there is nothing to test."
      : practicePass
        ? `Nothing is due. Practice pass of ${plural(queue.length, "item")} ${modeText}${capped}; grades still update each item's schedule. Est. ${estMinutes} min.${stopText}`
        : `${due.length} due. Running ${queue.length} ${modeText}${capped}${warmText}, est. ${estMinutes} min.${stopText}`;

  return { queue, dueCount: due.length, narration, estMinutes, warmupIds, practicePass };
}

export interface StopOffer {
  reason: "accuracy" | "time";
  text: string;
}

export function shouldOfferStop(
  results: ReviewResult[],
  startedAt: string,
  now: Date,
  opts: { sinceIndex: number; timeOffered: boolean },
): StopOffer | null {
  const recent = results.slice(opts.sinceIndex);
  if (recent.length >= STOP_WINDOW) {
    const windowed = recent.slice(-STOP_WINDOW);
    const recalled = windowed.filter((r) => r.recalled).length;
    if (recalled / STOP_WINDOW < STOP_THRESHOLD) {
      return {
        reason: "accuracy",
        text: `${recalled} of the last ${STOP_WINDOW} items were recalled (below ${pct(STOP_THRESHOLD)}). Graded items so far are saved either way.`,
      };
    }
  }
  const minutes = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60000);
  if (!opts.timeOffered && minutes >= SESSION_MINUTES) {
    return {
      reason: "time",
      text: `${minutes} minutes have passed (session cap ${SESSION_MINUTES}). Graded items so far are saved either way.`,
    };
  }
  return null;
}


/* ============================================================
   MODULE 3 — SOCRATIC HINT LADDER (deterministic L1–L3)
   ============================================================ */

export function hintLeaksAnswer(hint: string, answer: string): boolean {
  const h = normalizeText(hint);
  const a = normalizeText(answer);
  if (!a) return false;
  if (a.length >= 3 && ` ${h} `.includes(` ${a} `)) return true;
  const hTokens = new Set(h.split(" ").flatMap((t) => [t, stem(t)]));
  return a
    .split(" ")
    .filter((t) => t.length >= 3)
    .some((t) => hTokens.has(t) || hTokens.has(stem(t)));
}

const firstInitial = (t: string) => (t.trim().match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();

export function deterministicHint(level: 1 | 2 | 3, item: Pick<PalaceItem, "text" | "imageCue">): string {
  const answerStems = new Set(normalizeText(item.text).split(" ").filter((t) => t.length >= 3).map(stem));
  const safe = (w: string) => w.length >= 3 && !answerStems.has(stem(w)) && !answerStems.has(w);
  const cueWords = words(item.imageCue);
  const candidates: string[] = [];

  if (level === 1) {
    const s = cueWords.find((w) => isSenseWord(w) && safe(w));
    if (s) candidates.push(`A sensory clue from your cue: “${s}”.`);
    candidates.push("Something at this spot has a sound, smell, or texture.", "Something at this spot can be felt.");
  } else if (level === 2) {
    const v = cueWords.find((w) => isActionWord(w) && safe(w));
    if (v) candidates.push(`An action from your cue: “${v}”.`);
    candidates.push("Something at this spot is moving.", "Something here is in motion.");
  } else {
    const n = item.text.trim().split(/\s+/).length;
    const cat = categoryOf(item.text);
    const initial = firstInitial(item.text);
    if (cat) candidates.push(`${article(cat).replace(/^a/, "A")}, starts with “${initial}”.`);
    candidates.push(`It starts with “${initial}” and has ${plural(n, "word")}.`, `It starts with “${initial}”.`);
  }
  // Every candidate — including the generic ones — must pass the leak check.
  return candidates.find((c) => !hintLeaksAnswer(c, item.text)) ?? "Try the next hint level.";
}

export function reverseHint(level: 1 | 2 | 3, locus: Locus, routePos: number, total: number): string {
  let text: string;
  const fallback = `It is spot ${routePos + 1} of ${total}.`;
  if (level === 1) {
    const s = (locus.sense || "").split(/[\s,]+/).find((w) => w.length >= 3);
    text = s ? `A sensory clue from that spot: “${s.toLowerCase()}”.` : fallback;
  } else if (level === 2) {
    text = `It is spot ${routePos + 1} of ${total} along the route.`;
  } else {
    const n = locus.spot.trim().split(/\s+/).length;
    text = `The spot name starts with “${firstInitial(locus.spot)}” and has ${plural(n, "word")}.`;
  }
  return hintLeaksAnswer(text, locus.spot) ? fallback : text;
}

/** Shown at grading time as information only — the user still chooses the grade. */
export function hintAdvisory(depth: HintDepth): string {
  if (depth === 0) return "Answered cold (hint level 0).";
  if (depth <= 2) return `Recalled at hint level ${depth}.`;
  if (depth <= 4) return `Recalled at hint level ${depth}. Hint level ${depth} usually corresponds to Hard or Again.`;
  return "Answer revealed (hint level 5). A revealed answer usually corresponds to Again.";
}

