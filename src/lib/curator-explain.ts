/* Curator — schedule transparency.

   Pure arithmetic over a ReviewState, so the Explain panel is fully available
   with the local model switched off. It states what was computed and from
   which inputs; it never claims anything about what the user remembers. */

import type { ReviewGrade, ReviewState } from "./loci-types";
import { calculateNextDue } from "./loci-algorithms";
import { fmtDay, fmtDayTime, plural } from "./curator-text";

/* ============================================================
   MODULE 8 — EXPLAIN PANEL (pure arithmetic, no model)
   ============================================================ */

const GRADE_LABEL: Record<ReviewGrade, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

export function explainSchedule(r: ReviewState, now: Date = new Date()): string[] {
  const lines: string[] = [];
  const due = new Date(r.dueAt).getTime() <= now.getTime() ? "now" : fmtDayTime(r.dueAt);

  if (!r.lastReviewedAt || !r.lastGrade) {
    lines.push(`Not tested yet. Due ${due}. New items start at ease ${r.ease.toFixed(2)}, interval ${r.intervalDays}d.`);
    return lines;
  }

  lines.push(`Due ${due}. Last graded ${GRADE_LABEL[r.lastGrade]} on ${fmtDay(r.lastReviewedAt)}.`);
  const prevI = r.prevIntervalDays;
  const prevE = r.prevEase;
  const prevR = r.prevReps;

  if (prevI === undefined || prevE === undefined || prevR === undefined) {
    lines.push(`Interval inputs were not recorded for that review. Current interval ${r.intervalDays}d, ease ${r.ease.toFixed(2)}.`);
  } else {
    switch (r.lastGrade) {
      case "again":
        lines.push(`Again resets reps to 0 and schedules a retry 10 minutes later. Ease ${prevE.toFixed(2)} − 0.20 = ${r.ease.toFixed(2)} (floor 1.30).`);
        break;
      case "hard":
        lines.push(
          (prevR === 0
            ? "A first review graded Hard sets a fixed 1d interval."
            : `Hard: ${prevI}d × 1.2 = ${(prevI * 1.2).toFixed(1)}d, rounded to ${r.intervalDays}d (minimum 1d).`) +
            ` Ease ${prevE.toFixed(2)} − 0.15 = ${r.ease.toFixed(2)}.`,
        );
        break;
      case "good":
        lines.push(
          (prevR === 0
            ? "A first review graded Good sets a fixed 1d interval."
            : prevR === 1
              ? "A second review graded Good sets a fixed 3d interval."
              : `${prevI}d × ${r.ease.toFixed(2)} = ${(prevI * r.ease).toFixed(1)}d, rounded to ${r.intervalDays}d.`) + " Ease unchanged.",
        );
        break;
      case "easy":
        lines.push(
          (prevR === 0
            ? "A first review graded Easy sets a fixed 2d interval."
            : prevR === 1
              ? "A second review graded Easy sets a fixed 5d interval."
              : `${prevI}d × ${r.ease.toFixed(2)} × 1.3 = ${(prevI * r.ease * 1.3).toFixed(1)}d, rounded to ${r.intervalDays}d.`) +
            ` Ease ${prevE.toFixed(2)} + 0.15 = ${r.ease.toFixed(2)} (cap 3.00).`,
        );
        break;
    }
  }

  if (r.lapses > 0) lines.push(`${plural(r.lapses, "lapse")} so far; each Again lowers ease by 0.20.`);
  const hist = r.easeHistory ?? [];
  if (hist.length >= 2) {
    lines.push(`Ease history: ${hist.slice(-4).map((h) => `${h.ease.toFixed(2)} (${fmtDay(h.date)})`).join(" → ")}.`);
  }
  if (r.lapses >= 2) lines.push("Flagged as a weak spot: 2 or more lapses.");
  else if (r.ease < 1.8) lines.push("Flagged as a weak spot: ease below 1.80.");
  return lines;
}

export function gradePreviews(r: ReviewState, now: Date = new Date()): string[] {
  return (["again", "hard", "good", "easy"] as ReviewGrade[]).map((g) => {
    const n = calculateNextDue(r, g, now);
    const when = n.intervalDays === 0 ? "10 min" : `${n.intervalDays}d`;
    return `${GRADE_LABEL[g]} → next test in ${when}, ease ${n.ease.toFixed(2)}${g === "again" ? ", reps reset to 0" : ""}.`;
  });
}

