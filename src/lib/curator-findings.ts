/* Curator — findings and proposals.

   Detection is entirely deterministic here: the local model may only rephrase a
   suggestion (see curator-llm.ts). Nothing in this file mutates its inputs or
   writes to storage; findings and proposals are plain data that the user
   accepts or dismisses through curator-proposals.ts. */

import type { Locus, Palace, PalaceItem, ReviewSession } from "./loci-types";
import { stringSimilarityRatio } from "./loci-algorithms";
import {
  article,
  categoryOf,
  contentTokens,
  daysBetween,
  findAction,
  fmtDay,
  isActionWord,
  isSenseWord,
  lintCuratorText,
  pct,
  plural,
  sortRoute,
  themeCategory,
  themeTokens,
} from "./curator-text";

/* ============================================================
   FINDINGS & PROPOSALS — plain data, created here, committed elsewhere
   ============================================================ */

export type FindingKind =
  | "CONFUSABLE_SPOTS"
  | "SEMANTIC_INTERFERENCE"
  | "CUE_COLLISION"
  | "SERIAL_POSITION_SAG"
  | "EASE_DECAY"
  | "LAPSE_CLUSTER"
  | "STALE_PALACE"
  | "PALACE_OVERLOAD";

export const FINDING_LABELS: Record<FindingKind, string> = {
  CONFUSABLE_SPOTS: "Confusable spots",
  SEMANTIC_INTERFERENCE: "Similar neighbouring items",
  CUE_COLLISION: "Cue collision",
  SERIAL_POSITION_SAG: "Middle-of-route sag",
  EASE_DECAY: "Ease decaying",
  LAPSE_CLUSTER: "Lapse cluster",
  STALE_PALACE: "Untested palace",
  PALACE_OVERLOAD: "Route load",
};

export interface AiFinding {
  id: string;
  palaceId: string;
  locusId?: string;
  itemId?: string;
  locusIds: string[];
  itemIds: string[];
  kind: FindingKind;
  severity: "low" | "medium" | "high";
  evidence: string; // must cite dates or counts
  suggestion: string;
  status: "proposed" | "accepted" | "dismissed";
  createdAt: string;
  dismissedAt?: string;
}

export type ProposalType =
  | "edit_cue"
  | "rename_spot"
  | "add_loci"
  | "split_palace"
  | "reorder"
  | "start_session"
  | "export";

export interface AiProposal {
  id: string;
  type: ProposalType;
  targetIds: string[];
  diff: { before: Record<string, unknown>; after: Record<string, unknown> };
  rationale: string;
  params?: Record<string, unknown>;
  status: "proposed" | "applied" | "cancelled";
  createdAt: string;
  expiresAt: string; // proposals expire; stale diffs never apply
}

export const PROPOSAL_TTL_MS = 10 * 60 * 1000;

export function createProposal(
  type: ProposalType,
  targetIds: string[],
  diff: AiProposal["diff"],
  rationale: string,
  params: Record<string, unknown> = {},
  now: Date = new Date(),
): AiProposal {
  return Object.freeze({
    id: `prop_${Math.random().toString(36).slice(2, 10)}`,
    type,
    targetIds: [...targetIds],
    diff,
    rationale,
    params,
    status: "proposed" as const,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
  });
}

function finding(
  kind: FindingKind,
  severity: AiFinding["severity"],
  palace: Palace,
  locusIds: string[],
  itemIds: string[],
  evidence: string,
  suggestion: string,
  now: Date,
): AiFinding {
  const safeSuggestion = lintCuratorText(suggestion).length ? "See the evidence above." : suggestion;
  return {
    id: `${kind}:${palace.id}:${[...locusIds].sort().join("+") || "palace"}`,
    palaceId: palace.id,
    locusId: locusIds[0],
    itemId: itemIds[0],
    locusIds,
    itemIds,
    kind,
    severity,
    evidence,
    suggestion: safeSuggestion,
    status: "proposed",
    createdAt: now.toISOString(),
  };
}

/* ============================================================
   MODULE 4 — INTERFERENCE GUARD (pre-commit, blocks nothing)
   ============================================================ */

export type GuardKind = "ADJACENT_CATEGORY" | "CUE_DUPLICATE" | "SPOT_NEAR_DUPLICATE" | "CIRCULAR_CUE";

export interface GuardDraft {
  id: string;
  locusId: string;
  text: string;
  imageCue: string;
}

export interface GuardWarning {
  id: string;
  kind: GuardKind;
  itemIds: string[];
  locusIds: string[];
  message: string; // facts only
  advice: string;
}

/** A cue can collide with many others; showing every pair is noise, so only the
    strongest few per item are surfaced. */
export const MAX_COLLISIONS_PER_ITEM = 2;

export function interferenceGuard(route: Locus[], drafts: GuardDraft[]): GuardWarning[] {
  const ordered = sortRoute(route);
  const pos = new Map(ordered.map((l, i) => [l.id, i + 1]));
  const byLocus = new Map(drafts.map((d) => [d.locusId, d]));
  const filled = drafts.filter((d) => d.text.trim() && pos.has(d.locusId));
  const texts = filled.map((d) => d.text);
  const themeCat = themeCategory(texts);
  const themeTok = themeTokens(texts);
  const out: GuardWarning[] = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];

    if (a.spot.trim() && b.spot.trim()) {
      const sim = stringSimilarityRatio(a.spot, b.spot);
      if (sim >= 0.75) {
        out.push({
          id: `SPOT:${a.id}:${b.id}`,
          kind: "SPOT_NEAR_DUPLICATE",
          itemIds: [],
          locusIds: [a.id, b.id],
          message: `Spots ${i + 1} and ${i + 2} have nearly the same name (“${a.spot}” / “${b.spot}”, ${pct(sim)} similar).`,
          advice: "Rename one after a landmark only it has.",
        });
      }
    }

    const da = byLocus.get(a.id);
    const db = byLocus.get(b.id);
    if (da?.text.trim() && db?.text.trim()) {
      const ca = categoryOf(da.text);
      const cb = categoryOf(db.text);
      let reason: string | null = null;
      if (ca && ca === cb && ca !== themeCat) {
        reason = `are both ${article(ca)}`;
      } else {
        const sa = new Set(contentTokens(da.text));
        const shared = contentTokens(db.text).filter((t) => sa.has(t) && !themeTok.has(t));
        if (shared.length) reason = `share “${shared[0]}”`;
      }
      if (reason) {
        out.push({
          id: `CAT:${da.id}:${db.id}`,
          kind: "ADJACENT_CATEGORY",
          itemIds: [da.id, db.id],
          locusIds: [a.id, b.id],
          message: `Items at spots ${i + 1} and ${i + 2} ${reason} (“${da.text.trim()}”, “${db.text.trim()}”).`,
          advice: "Similar neighbours are easy to swap. Move one to a non-adjacent spot, or give their cues contrasting actions.",
        });
      }
    }
  }

  const info = filled
    .filter((d) => d.imageCue.trim())
    .map((d) => {
      const locus = ordered.find((l) => l.id === d.locusId)!;
      const exclude = new Set([
        ...contentTokens(locus.landmark),
        ...contentTokens(locus.spot),
        ...contentTokens(d.text),
      ]);
      const toks = new Set(contentTokens(d.imageCue, exclude).filter((t) => !isActionWord(t) && !isSenseWord(t)));
      return { d, at: pos.get(d.locusId)!, toks, action: findAction(d.imageCue) };
    });

  // Cue collisions are pairwise, so a palace where every cue shares a stock
  // phrase would emit one warning per pair and bury the editor. Collect them
  // with a strength score, then keep only the strongest few per item.
  const collisions: (GuardWarning & { strength: number })[] = [];
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const a = info[i];
      const b = info[j];
      const shared = [...a.toks].filter((t) => b.toks.has(t));
      const sameAction = !!a.action && a.action === b.action;
      if (shared.length >= 2 || (sameAction && shared.length >= 1)) {
        const parts = sameAction ? [...shared.slice(0, 2), a.action as string] : shared.slice(0, 3);
        collisions.push({
          id: `CUE:${a.d.id}:${b.d.id}`,
          kind: "CUE_DUPLICATE",
          itemIds: [a.d.id, b.d.id],
          locusIds: [a.d.locusId, b.d.locusId],
          message: `Cues at spots ${a.at} and ${b.at} both use ${parts.map((p) => `“${p}”`).join(" and ")}.`,
          advice: "Swap the shared element in one cue for something only its landmark could do.",
          strength: shared.length + (sameAction ? 1 : 0) + (Math.abs(a.at - b.at) <= 1 ? 1 : 0),
        });
      }
    }
  }

  const perItem = new Map<string, number>();
  collisions
    .sort((x, y) => y.strength - x.strength)
    .forEach(({ strength, ...w }) => {
      void strength;
      const counts = w.itemIds.map((id) => perItem.get(id) ?? 0);
      if (counts.some((n) => n >= MAX_COLLISIONS_PER_ITEM)) return;
      w.itemIds.forEach((id) => perItem.set(id, (perItem.get(id) ?? 0) + 1));
      out.push(w);
    });

  for (const d of filled) {
    const locus = ordered.find((l) => l.id === d.locusId)!;
    const simS = stringSimilarityRatio(d.text, locus.spot);
    const simL = stringSimilarityRatio(d.text, locus.landmark);
    const itemToks = contentTokens(d.text);
    const spotToks = new Set([...contentTokens(locus.spot), ...contentTokens(locus.landmark)]);
    const subset = itemToks.length > 0 && itemToks.every((t) => spotToks.has(t));
    if (simS >= 0.8 || simL >= 0.8 || subset) {
      out.push({
        id: `CIRC:${d.id}`,
        kind: "CIRCULAR_CUE",
        itemIds: [d.id],
        locusIds: [d.locusId],
        message: `“${d.text.trim()}” nearly repeats its own spot (“${locus.spot}”).`,
        advice: "When item and spot match, the spot cannot act as a separate cue. Move the item or choose another spot.",
      });
    }
  }

  return out;
}

/* ============================================================
   MODULE 1 — ROUTE DOCTOR (heuristics; the model may only rephrase)
   ============================================================ */

function againDates(itemIds: string[], sessions: ReviewSession[]): string[] {
  const ids = new Set(itemIds);
  const stamps: string[] = [];
  sessions.forEach((s) =>
    s.results.forEach((r) => {
      if (ids.has(r.itemId) && r.grade === "again") stamps.push(s.endedAt ?? s.startedAt);
    }),
  );
  const seen = new Set<string>();
  return stamps
    .sort()
    .map(fmtDay)
    .filter((d) => (seen.has(d) ? false : (seen.add(d), true)))
    .slice(0, 4);
}

export function routeDoctor(palace: Palace, sessions: ReviewSession[], now: Date = new Date()): AiFinding[] {
  const out: AiFinding[] = [];
  const route = sortRoute(palace.route);
  const mine = sessions.filter((s) => s.palaceId === palace.id);
  const itemAt = (l: Locus) => palace.items.find((it) => it.locusId === l.id);
  const lapsesOf = (id?: string) => palace.items.find((it) => it.id === id)?.review.lapses ?? 0;

  // CONFUSABLE_SPOTS — adjacent or near-adjacent
  for (let i = 0; i < route.length; i++) {
    for (let j = i + 1; j <= Math.min(i + 2, route.length - 1); j++) {
      const a = route[i];
      const b = route[j];
      const simS = stringSimilarityRatio(a.spot, b.spot);
      const simL = stringSimilarityRatio(a.landmark, b.landmark);
      const sim = Math.max(simS, simL);
      if (sim < 0.7) continue;
      const which = simS >= simL ? "names" : "landmarks";
      const ia = itemAt(a);
      const ib = itemAt(b);
      const lapses = (ia?.review.lapses ?? 0) + (ib?.review.lapses ?? 0);
      const dates = againDates([ia?.id, ib?.id].filter(Boolean) as string[], mine);
      let severity: AiFinding["severity"] = sim >= 0.9 && j - i === 1 ? "high" : j - i === 1 ? "medium" : "low";
      if (lapses >= 2 && severity === "low") severity = "medium";
      out.push(
        finding(
          "CONFUSABLE_SPOTS",
          severity,
          palace,
          [a.id, b.id],
          [ia?.id, ib?.id].filter(Boolean) as string[],
          `Spots ${i + 1} and ${j + 1} have ${pct(sim)} similar ${which} (“${which === "names" ? a.spot : a.landmark}” / “${which === "names" ? b.spot : b.landmark}”); ${plural(lapses, "lapse")} on their items${dates.length ? ` (${dates.join(", ")})` : ""}.`,
          `Consider renaming spot ${j + 1} after a landmark only it has, or moving its item to a more distinct spot.`,
          now,
        ),
      );
    }
  }

  // SEMANTIC_INTERFERENCE + CUE_COLLISION — shared logic with the Guard
  const drafts = palace.items.map((it) => ({ id: it.id, locusId: it.locusId, text: it.text, imageCue: it.imageCue }));
  for (const w of interferenceGuard(route, drafts)) {
    const lapseText = `Lapses on these items: ${w.itemIds.map(lapsesOf).join(" and ")}.`;
    if (w.kind === "ADJACENT_CATEGORY") {
      out.push(
        finding("SEMANTIC_INTERFERENCE", w.itemIds.some((id) => lapsesOf(id) >= 2) ? "medium" : "low", palace, w.locusIds, w.itemIds,
          `${w.message} ${lapseText}`,
          "Consider moving one item to a non-adjacent spot, or giving each cue a contrasting action.", now),
      );
    } else if (w.kind === "CUE_DUPLICATE") {
      out.push(
        finding("CUE_COLLISION", "low", palace, w.locusIds, w.itemIds, `${w.message} ${lapseText}`,
          "Consider replacing the shared element in one cue with something unique to its landmark.", now),
      );
    }
  }

  // SERIAL_POSITION_SAG
  const placed = route.map((l) => itemAt(l)).filter(Boolean) as PalaceItem[];
  if (placed.length >= 6) {
    const third = Math.floor(placed.length / 3);
    const first = placed.slice(0, third);
    const mid = placed.slice(third, placed.length - third);
    const last = placed.slice(placed.length - third);
    const sum = (xs: PalaceItem[]) => xs.reduce((s, it) => s + it.review.lapses, 0);
    const fs = sum(first);
    const ms = sum(mid);
    const ls = sum(last);
    const rate = (n: number, len: number) => (len ? n / len : 0);
    if (fs + ms + ls >= 3 && ms >= 2 && rate(ms, mid.length) >= 2 * Math.max(rate(fs, first.length), rate(ls, last.length))) {
      out.push(
        finding("SERIAL_POSITION_SAG", ms >= 4 ? "high" : "medium", palace, mid.map((it) => it.locusId), mid.map((it) => it.id),
          `Middle third (spots ${third + 1}–${placed.length - third}): ${plural(ms, "lapse")} across ${plural(mid.length, "item")}; first third: ${fs}; last third: ${ls}.`,
          "Consider walking the middle stretch on its own for one session, or strengthening how those cues act on their landmarks.", now),
      );
    }
  }

  // EASE_DECAY — ease falling across 3+ consecutive reviews
  for (const it of palace.items) {
    const h = (it.review.easeHistory ?? []).slice(-3);
    if (h.length === 3 && h[0].ease > h[1].ease && h[1].ease > h[2].ease) {
      const idx = route.findIndex((l) => l.id === it.locusId) + 1;
      out.push(
        finding("EASE_DECAY", h[2].ease < 1.8 ? "high" : "medium", palace, [it.locusId], [it.id],
          `Spot ${idx}: ease ${h.map((x) => x.ease.toFixed(2)).join(" → ")} on ${h.map((x) => fmtDay(x.date)).join(", ")}; ${plural(it.review.lapses, "lapse")} total.`,
          "Consider rewriting this cue so it acts directly on the landmark, using the spot's sensory detail.", now),
      );
    }
  }

  // LAPSE_CLUSTER — runs of 2+ consecutive loci with lapses
  let run: { pos: number; item: PalaceItem; locus: Locus }[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const total = run.reduce((s, r) => s + r.item.review.lapses, 0);
      const dates = againDates(run.map((r) => r.item.id), mine);
      out.push(
        finding("LAPSE_CLUSTER", total >= 4 ? "high" : "medium", palace, run.map((r) => r.locus.id), run.map((r) => r.item.id),
          `Spots ${run[0].pos}–${run[run.length - 1].pos}: ${plural(total, "lapse")} across ${run.length} consecutive spots${dates.length ? ` (${dates.join(", ")})` : ""}.`,
          "Consecutive lapses often mean the route blurs here. Consider checking that these spots are physically distinct.", now),
      );
    }
    run = [];
  };
  route.forEach((l, i) => {
    const it = itemAt(l);
    if (it && it.review.lapses >= 1) run.push({ pos: i + 1, item: it, locus: l });
    else flush();
  });
  flush();

  // STALE_PALACE
  const reviewed = palace.items.map((it) => it.review.lastReviewedAt).filter(Boolean) as string[];
  if (reviewed.length) {
    const last = reviewed.sort().slice(-1)[0];
    const maxInt = Math.max(...palace.items.map((it) => it.review.intervalDays || 0));
    if (maxInt >= 1) {
      const days = daysBetween(last, now);
      if (days > 2 * maxInt) {
        out.push(
          finding("STALE_PALACE", days > 4 * maxInt ? "medium" : "low", palace, [], [],
            `Last tested ${fmtDay(last)} (${days} days ago); longest interval ${maxInt}d, so the stale threshold is ${2 * maxInt}d.`,
            "A review would show what is still retrievable. Nothing is assumed either way.", now),
        );
      }
    }
  }

  return out;
}

/* ============================================================
   MODULE 7 — PALACE LOAD ADVISOR
   ============================================================ */

export function loadAdvice(palace: Palace, now: Date = new Date()): AiFinding | null {
  const cycles = palace.load?.cycles ?? 1;
  if (cycles < 2) return null;
  const route = sortRoute(palace.route);
  const residual = Object.entries(palace.load?.residual ?? {})
    .filter(([, n]) => n > 0)
    .map(([locusId, n]) => ({ locusId, n, pos: route.findIndex((l) => l.id === locusId) + 1 }))
    .filter((r) => r.pos > 0)
    .sort((a, b) => a.pos - b.pos);
  if (!residual.length && cycles < 3) return null;

  const since = palace.load?.lastClearedAt ? daysBetween(palace.load.lastClearedAt, now) : null;
  const cooldown = since === null ? 14 : Math.max(0, 14 - since);
  const residualText = residual.length
    ? ` Spots ${residual.map((r) => r.pos).join(", ")} carried ${residual.map((r) => r.n).join(", ")} lapses from the previous set.`
    : "";
  const sinceText =
    since !== null && palace.load?.lastClearedAt
      ? ` Last set change ${fmtDay(palace.load.lastClearedAt)} (${plural(since, "day")} ago).`
      : "";

  return finding(
    "PALACE_OVERLOAD",
    residual.length >= 2 || cycles >= 4 ? "medium" : "low",
    palace,
    residual.map((r) => r.locusId),
    [],
    `This route has held ${cycles} item sets.${residualText}${sinceText}`,
    cooldown > 0
      ? `Cooldown ~${plural(cooldown, "more day")} before loading another set, or build a second palace.`
      : "The suggested 14-day cooldown has passed. A second palace remains an option for new sets.",
    now,
  );
}

