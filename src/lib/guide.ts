import { dayKey, entriesInWindow, findPatterns, goalById } from "./data";
import type { FoundPattern } from "./data";
import type { Entry, Goal, GuideState, Pattern } from "./types";

export interface ProfileQuestion {
  id: string;
  text: string;
}

export const FIRST_PROFILE_QUESTION: ProfileQuestion = {
  id: "q90",
  text: "What would make the next 90 days feel meaningful to you?",
};

export const LATER_PROFILE_QUESTIONS: ProfileQuestion[] = [
  { id: "qgood", text: "What does a good day minimally include for you?" },
  { id: "qbecome", text: "What are you trying to become better at right now?" },
  { id: "qpulled", text: "What usually pulls you away from your work?" },
  { id: "qrestart", text: "When you are stuck, what helps you restart?" },
  { id: "qtime", text: "Which time of day is easiest for focused work?" },
  { id: "qrest", text: "What kind of rest actually helps you recover?" },
  { id: "qvoice", text: "How should NorthStar speak to you: calm, direct, or brief?" },
  { id: "qnever", text: "What should NorthStar never say or do?" },
];

export function nextProfileQuestion(guide: GuideState): ProfileQuestion | null {
  const pool = [FIRST_PROFILE_QUESTION, ...LATER_PROFILE_QUESTIONS];
  return (
    pool.find(
      (q) =>
        guide.profile[q.id] === undefined &&
        !guide.skippedQuestions.includes(q.id) &&
        !guide.neverQuestions.includes(q.id),
    ) ?? null
  );
}

/* ---------------- evidence skill ---------------- */

export type Window = "today" | "7" | "14";

export interface CheckinContext {
  goal?: Goal;
  entries: Entry[];
  window: Window;
  guide: GuideState;
  goals: Goal[];
}

export interface Source {
  label: string;
  detail: string;
}

export interface Checkin {
  goal?: Goal;
  noticed: string;
  sources: Source[];
  question: { category: Category; text: string };
  action: { text: string; minutes: number };
  pattern?: FoundPattern;
  window: Window;
  entryIds: string[];
}

export type Category = "clarity" | "friction" | "alignment" | "recovery";

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const BANK: Record<Category, string[]> = {
  clarity: [
    "Which of these two things is the actual next one — and what would make that obvious by tonight?",
    "If today moved exactly one goal forward, which one should it be, and what is the smallest visible proof of that?",
  ],
  friction: [
    "What is the specific step you keep postponing, and what is the smallest version of it you would start within 20 minutes?",
    "Where does this work actually stall — at starting it, or at finishing it — and which one is today's case?",
  ],
  alignment: [
    "Your logged hours lean toward {heavy} this window. Is that the split you want, or should {light} claim one block this week?",
    "Which goal did your logged hours genuinely serve this week, and does that match what you say matters?",
  ],
  recovery: [
    "You logged {n} entries across {d} local days in this window. What would make tomorrow's first hour easier to begin?",
    "Given the energy you actually have today, what would a workable — not ideal — version of this day look like?",
  ],
};

export function buildCheckin(ctx: CheckinContext): Checkin {
  const windowed = entriesInWindow(ctx.entries, ctx.window);
  const sources: Source[] = [];
  const today = dayKey(new Date());

  sources.push({
    label: "Active goal",
    detail: ctx.goal
      ? ctx.goal.title
      : ctx.goals.length
        ? "None selected — using your most recent entries."
        : "No goals yet.",
  });
  sources.push({
    label: `${ctx.window === "today" ? "Today" : ctx.window + "-day"} window`,
    detail: `${windowed.length} entries, ${windowed.filter((e) => e.goalId).length} linked, ${
      new Set(windowed.map((e) => dayKey(e.ts))).size
    } local days.`,
  });

  const patterns = findPatterns(ctx.entries);
  const confirmed = ctx.guide.patterns;
  const pattern =
    patterns.find((p) => confirmed.some((c) => c.keyword === p.keyword)) ?? undefined;
  if (pattern)
    sources.push({
      label: "Confirmed pattern",
      detail: `“${pattern.keyword}” across ${pattern.days.length} local days (${pattern.entryIds.length} entries) — you confirmed this one.`,
    });

  const domains = new Map<string, number>();
  windowed.forEach((e) => e.domain && domains.set(e.domain, (domains.get(e.domain) ?? 0) + 1));
  const sorted = [...domains.entries()].sort((a, b) => b[1] - a[1]);
  const heavy = sorted[0]?.[0] ?? "focus";
  const light = sorted[sorted.length - 1]?.[0] ?? "admin";

  /* category selection: deterministic, evidence-first, no diagnosis */
  let category: Category = "clarity";
  const frictionHit = windowed.find((e) =>
    /(struggl|stuck|blocked|postpon|avoid|keep putting|delay)/i.test(e.text),
  );
  const distinctDays = new Set(windowed.map((e) => dayKey(e.ts))).size;
  if (frictionHit) category = "friction";
  else if (windowed.length && windowed.filter((e) => e.goalId).length === 0)
    category = "alignment";
  else if (windowed.length < 3 || distinctDays < 2) category = "recovery";

  const bank = BANK[category];
  const text = bank[hash(today + category) % bank.length]
    .replace("{heavy}", heavy)
    .replace("{light}", light)
    .replace("{n}", String(windowed.length))
    .replace("{d}", String(distinctDays));

  const noticed =
    category === "friction"
      ? `One entry in this window names a stall: “${frictionHit?.text.slice(0, 90)}…”`
      : category === "alignment"
        ? `${windowed.filter((e) => !e.goalId).length} of ${windowed.length} entries in this window are not linked to any goal yet.`
        : category === "recovery"
          ? `${windowed.length} entries across ${distinctDays} local days. Unlogged hours are unknown, not wasted.`
          : `Your heaviest logged domain in this window is ${heavy} (${domains.get(heavy)} entries).`;

  const action = {
    text: ctx.goal?.nextAction || `Write the single next step for ${ctx.goal?.title ?? "your direction"} and stop there.`,
    minutes: 20,
  };

  return {
    goal: ctx.goal,
    noticed,
    sources,
    question: { category, text },
    action,
    pattern,
    window: ctx.window,
    entryIds: windowed.slice(0, 8).map((e) => e.id),
  };
}

/* ---------------- memory skill ---------------- */

export function proposePattern(guide: GuideState, p: FoundPattern): GuideState {
  if (guide.patterns.some((x) => x.keyword === p.keyword)) return guide;
  const saved: Pattern = {
    id: p.keyword,
    keyword: p.keyword,
    entryIds: p.entryIds,
    days: p.days,
    confirmedAt: new Date().toISOString(),
  };
  return { ...guide, patterns: [...guide.patterns, saved] };
}

export function forgetPattern(guide: GuideState, keyword: string): GuideState {
  return { ...guide, patterns: guide.patterns.filter((p) => p.keyword !== keyword) };
}

/* ---------------- optional AI ---------------- */

export const BANNED_PHRASES = [
  "you failed",
  "you are lazy",
  "you are addicted",
  "you always",
  "you never",
  "wasted time",
  "you're lazy",
  "youre lazy",
  "lazy person",
  "failure",
  "addicted",
  "undisciplined",
  "you should be ashamed",
  "disappointed in you",
];

export function buildPayload(checkin: Checkin, entries: Entry[], aliasIds = true) {
  const picked = checkin.entryIds
    .map((id) => entries.find((e) => e.id === id))
    .filter(Boolean) as Entry[];
  const items = picked.slice(0, 8).map((e, i) => ({
    id: aliasIds ? `e${i + 1}` : e.id,
    when: dayKey(e.ts),
    text: e.text.slice(0, 240),
    linked: !!e.goalId,
    domain: e.domain ?? null,
  }));
  const body = {
    goal: checkin.goal ? { title: checkin.goal.title, direction: checkin.goal.direction } : null,
    window: checkin.window,
    noticed: checkin.noticed,
    questionAsked: checkin.question.text,
    evidence: items,
    instruction:
      "Ask exactly one question from {clarity, friction, alignment, recovery}. No diagnosis. No pattern unless supported by 3+ entries across 2+ local days. Offer one action under 30 minutes.",
  };
  const compact = {
    ...body,
    noticed: body.noticed.slice(0, 320),
    questionAsked: body.questionAsked.slice(0, 220),
    evidence: items.map((item) => ({ ...item, text: item.text.slice(0, 180) })),
  };
  let json = JSON.stringify(compact);
  let truncated = false;
  /* Shrink whole evidence items rather than cutting the JSON string mid-object. */
  while (json.length > 2000 && compact.evidence.length > 0) {
    compact.evidence.pop();
    json = JSON.stringify(compact);
    truncated = true;
  }
  if (json.length > 2000) {
    compact.noticed = compact.noticed.slice(0, 160);
    compact.questionAsked = compact.questionAsked.slice(0, 120);
    json = JSON.stringify(compact);
    truncated = true;
  }
  if (json.length > 2000) {
    compact.evidence = [];
    json = JSON.stringify(compact);
    truncated = true;
  }
  return { text: json, truncated, itemCount: compact.evidence.length, chars: json.length };
}

export function validateGuideReply(reply: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const lower = reply.toLowerCase();
  BANNED_PHRASES.forEach((p) => {
    if (lower.includes(p)) issues.push(`Banned phrasing: “${p}”.`);
  });
  const q = (reply.match(/\?/g) ?? []).length;
  if (q !== 1) issues.push(`Exactly one question is required — found ${q} question marks.`);
  if (reply.trim().length < 20) issues.push("Reply is too short to be useful.");
  return { ok: issues.length === 0, issues };
}

export function goalForCheckin(goals: Goal[], entries: Entry[]): Goal | undefined {
  const active = goals.filter((g) => g.active);
  const scored = active
    .map((g) => ({ g, n: entries.filter((e) => e.goalId === g.id).length }))
    .sort((a, b) => b.n - a.n);
  return scored[0]?.g ?? active[0] ?? undefined;
}

export { goalById };
