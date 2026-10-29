/* Curator — command bar parsing.

   Read-only questions are answered directly. Anything that would change state
   returns an AiProposal with a diff instead, which the user confirms. Deletion
   is refused outright and redirected to the typed-confirmation flow. */

import type { LociState, Palace, ReviewSession } from "./loci-types";
import { isItemDue, isWeakSpot, normalizeText, stringSimilarityRatio } from "./loci-algorithms";
import { STOP, fmtDayTime, plural, sortRoute, stem, words } from "./curator-text";
import { createProposal, type AiProposal } from "./curator-findings";
import { planSession } from "./curator-session";

/* ============================================================
   MODULE 6 — COMMAND BAR (parse → read-only answer or proposal)
   ============================================================ */

export type CommandIntentName =
  | "start_session"
  | "query_lapses"
  | "query_due"
  | "add_loci"
  | "export"
  | "list"
  | "weak"
  | "delete";

export const COMMAND_INTENTS: CommandIntentName[] = [
  "start_session", "query_lapses", "query_due", "add_loci", "export", "list", "weak", "delete",
];

export interface ParsedIntent {
  intent: CommandIntentName;
  palaceId?: string;
  params: Record<string, unknown>;
  confidence: number;
}

export type CommandResult =
  | { kind: "answer"; lines: string[] }
  | { kind: "proposal"; proposal: AiProposal; summary: string }
  | { kind: "refuse"; message: string }
  | { kind: "unknown"; suggestions: string[] };

export const SUPPORTED_COMMANDS = [
  "quiz me on <palace>",
  "quiz me on <palace>, reverse order",
  "quiz me on <palace>, random order",
  "which spots have lapsed twice",
  "when is <palace> next due",
  "add 4 loci to <palace>",
  "show weak spots",
  "list palaces",
  "export everything",
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, once: 1, two: 2, twice: 2, three: 3, thrice: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function numberIn(t: string, fallback: number): number {
  const d = t.match(/\b(\d{1,2})\b/);
  if (d) return Number(d[1]);
  for (const [w, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  return fallback;
}

const COMMAND_WORDS = new Set(
  (
    "quiz review test drill practice practise start walk order reverse backward backwards random shuffle shuffled " +
    "which spots spot have lapsed lapse lapses twice once thrice when next due add loci locus export everything " +
    "show weak list palaces palace route backup download delete remove"
  ).split(" "),
);

function matchPalace(text: string, palaces: Palace[]): { palace: Palace; confidence: number } | null {
  const active = palaces.filter((p) => !p.archived);
  const nth = text.match(/\bpalace\s+(\d{1,2})\b/);
  if (nth && active[Number(nth[1]) - 1]) return { palace: active[Number(nth[1]) - 1], confidence: 0.95 };

  const query = words(text).filter((w) => w.length >= 3 && !STOP.has(w) && !COMMAND_WORDS.has(w)).map(stem);
  let best: Palace | null = null;
  let score = 0;
  for (const p of active) {
    const toks = new Set(words(`${p.name} ${p.location}`).filter((w) => w.length >= 3 && !STOP.has(w) && w !== "palace" && w !== "route").map(stem));
    const overlap = query.filter((w) => toks.has(w)).length;
    if (overlap > score) {
      score = overlap;
      best = p;
    }
  }
  if (best && score > 0) return { palace: best, confidence: 0.95 };
  if (active.length === 1) return { palace: active[0], confidence: 0.75 };
  return null;
}

export function parseIntentLocal(text: string, palaces: Palace[]): ParsedIntent | null {
  const t = (text || "").toLowerCase().trim();
  if (!t) return null;
  const m = matchPalace(t, palaces);
  const strong = m && m.confidence >= 0.9 ? m.palace.id : undefined;

  if (/\b(delete|remove|erase|wipe|destroy)\b/.test(t)) return { intent: "delete", palaceId: m?.palace.id, params: {}, confidence: 1 };
  if (/\b(export|backup|back up|download)\b/.test(t)) return { intent: "export", params: { scope: "all" }, confidence: 0.95 };
  if (/\blapse/.test(t)) return { intent: "query_lapses", palaceId: strong, params: { min: numberIn(t, 1) }, confidence: 0.95 };
  if (/\bweak\b/.test(t)) return { intent: "weak", palaceId: strong, params: {}, confidence: 0.9 };
  if (/\badd\b/.test(t) && /\b(loci|locus|spots?)\b/.test(t)) {
    return m
      ? { intent: "add_loci", palaceId: m.palace.id, params: { count: numberIn(t, 1) }, confidence: m.confidence }
      : { intent: "add_loci", params: { count: numberIn(t, 1) }, confidence: 0.4 };
  }
  if (/\b(quiz|review|test|drill|practi[cs]e|start)\b/.test(t)) {
    const mode = /\b(reverse|backwards?)\b/.test(t) ? "reverse" : /\b(random|shuffled?)\b/.test(t) ? "random" : "recall";
    return m
      ? { intent: "start_session", palaceId: m.palace.id, params: { mode }, confidence: m.confidence }
      : { intent: "start_session", params: { mode }, confidence: 0.4 };
  }
  if (/\b(when|due|next)\b/.test(t)) return { intent: "query_due", palaceId: strong, params: {}, confidence: 0.9 };
  if (/\b(list|palaces|show)\b/.test(t)) return { intent: "list", params: {}, confidence: 0.85 };
  return null;
}

function overlapScore(a: string, b: string): number {
  const at = words(a).filter((w) => w.length >= 3);
  if (!at.length) return 0;
  const bt = new Set(words(b));
  return at.filter((w) => bt.has(w)).length / at.length;
}

export function nearestCommands(text: string, n = 5): string[] {
  return SUPPORTED_COMMANDS.map((c) => ({ c, s: stringSimilarityRatio(text, c) + overlapScore(text, c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.c);
}

export function paletteMatches(text: string, palaces: Palace[], n = 6): string[] {
  const filled = palaces
    .filter((p) => !p.archived)
    .flatMap((p) => [`quiz me on ${p.name}`, `quiz me on ${p.name}, reverse order`, `when is ${p.name} next due`, `add 2 loci to ${p.name}`]);
  const all = [...filled, "which spots have lapsed twice", "show weak spots", "list palaces", "export everything"];
  const t = normalizeText(text);
  return all
    .map((c) => ({ c, s: (t && normalizeText(c).includes(t) ? 1 : 0) + overlapScore(text, c) + stringSimilarityRatio(text, c) * 0.5 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.c);
}

const MODE_LABEL: Record<string, string> = { recall: "recall", reverse: "reverse recall", random: "random-order recall" };

export function buildCommandResult(intent: ParsedIntent, state: LociState, now: Date = new Date()): CommandResult {
  const active = state.palaces.filter((p) => !p.archived);
  const target = intent.palaceId ? active.find((p) => p.id === intent.palaceId) : undefined;
  const scope = target ? [target] : active;
  const whichPalace: CommandResult = { kind: "unknown", suggestions: active.slice(0, 5).map((p) => `quiz me on ${p.name}`) };

  switch (intent.intent) {
    case "delete":
      return {
        kind: "refuse",
        message: "Deletion is not available from the command bar. Use the palace menu, which asks you to type the palace name to confirm.",
      };
    case "list":
      return {
        kind: "answer",
        lines: active.length
          ? active.map((p) => `${p.name} — ${plural(p.route.length, "spot")}, ${plural(p.items.length, "item")}, ${p.items.filter((it) => isItemDue(it, now)).length} due now.`)
          : ["No palaces yet."],
      };
    case "query_lapses": {
      const min = Math.max(1, Number(intent.params.min ?? 1));
      const lines: string[] = [];
      scope.forEach((p) =>
        sortRoute(p.route).forEach((l, i) => {
          const it = p.items.find((x) => x.locusId === l.id);
          if (it && it.review.lapses >= min) lines.push(`${p.name}: spot ${i + 1} “${l.spot}” — ${plural(it.review.lapses, "lapse")}.`);
        }),
      );
      return { kind: "answer", lines: lines.length ? lines : [`No spots have ${min} or more lapses.`] };
    }
    case "weak": {
      const lines: string[] = [];
      scope.forEach((p) =>
        sortRoute(p.route).forEach((l, i) => {
          const it = p.items.find((x) => x.locusId === l.id);
          if (it && isWeakSpot(it)) lines.push(`${p.name}: spot ${i + 1} “${l.spot}” — ${plural(it.review.lapses, "lapse")}, ease ${it.review.ease.toFixed(2)}.`);
        }),
      );
      return { kind: "answer", lines: lines.length ? lines : ["No weak spots (2+ lapses or ease below 1.80)."] };
    }
    case "query_due":
      return {
        kind: "answer",
        lines: scope.length
          ? scope.map((p) => {
              if (!p.items.length) return `${p.name}: no items placed.`;
              const dueNow = p.items.filter((it) => isItemDue(it, now)).length;
              const next = p.items
                .filter((it) => !isItemDue(it, now))
                .map((it) => it.review.dueAt)
                .sort()[0];
              return `${p.name}: ${dueNow} due now${next ? `; next scheduled ${fmtDayTime(next)}` : ""}.`;
            })
          : ["No palaces yet."],
      };
    case "start_session": {
      if (!target) return whichPalace;
      if (!target.items.length) return { kind: "refuse", message: `${target.name} has no items placed yet.` };
      const mode = String(intent.params.mode ?? "recall");
      const plan = planSession(target, mode as ReviewSession["mode"], now);
      return {
        kind: "proposal",
        summary: `Start a ${MODE_LABEL[mode] ?? mode} session on ${target.name}.`,
        proposal: createProposal(
          "start_session",
          [target.id],
          { before: { session: "none" }, after: { palace: target.name, mode: MODE_LABEL[mode] ?? mode, items: plan.queue.length, estimate: `${plan.estMinutes} min` } },
          plan.narration,
          { mode },
          now,
        ),
      };
    }
    case "add_loci": {
      if (!target) return whichPalace;
      const len = target.route.length;
      const room = 15 - len;
      if (room <= 0) return { kind: "refuse", message: `${target.name} already has 15 spots (the maximum). Split new items into another palace instead.` };
      const requested = Math.max(1, Number(intent.params.count ?? 1));
      const n = Math.min(requested, room);
      return {
        kind: "proposal",
        summary: `Add ${plural(n, "blank spot")} to ${target.name}.`,
        proposal: createProposal(
          "add_loci",
          [target.id],
          {
            before: { spots: len },
            after: { spots: len + n, added: Array.from({ length: n }, (_, k) => `spot ${len + k + 1} (blank)`) },
          },
          `Opens the route builder with ${plural(n, "blank spot")} appended after spot ${len}. Nothing is saved until you name them and confirm the route there.${n < requested ? ` Capped at ${n} to stay within 15 spots.` : ""}`,
          { count: n },
          now,
        ),
      };
    }
    case "export":
      return {
        kind: "proposal",
        summary: "Download a JSON backup of every palace.",
        proposal: createProposal(
          "export",
          [],
          {
            before: { file: "none" },
            after: { file: `loci-backup-${now.toISOString().slice(0, 10)}.json`, palaces: state.palaces.length, photos: "not included" },
          },
          "Downloads a JSON backup to this device. Photos are excluded here; Settings can include them.",
          {},
          now,
        ),
      };
  }
}
