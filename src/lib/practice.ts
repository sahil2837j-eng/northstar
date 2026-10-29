import {
  addDays,
  dayKey,
  pad,
} from "./data";
import { CURRICULUM, PLACEMENT_IDS, TOPICS, exercisesInTopic } from "./curriculum";
import type {
  Contract,
  CurriculumProgress,
  LedgerEvent,
  LedgerType,
  Session,
  Strictness,
  TopicState,
} from "./types";

/* ---------------- strictness ---------------- */

const GIBBERISH = /^(.)\1*$/;
const KNOWN = new Set(["asdf", "qwer", "zxcv", "wasd", "aaaa", "test", "xxx", "lol", "idk", "hmm"]);

/** "asdfasdfasdf" and "ababab" are the same character pattern repeated, not a reason. */
function isRepetition(s: string): boolean {
  if (s.length < 4) return false;
  for (let unit = 1; unit <= Math.floor(s.length / 2); unit++) {
    if (s.length % unit === 0 && s.slice(0, unit).repeat(s.length / unit) === s) return true;
  }
  return false;
}

export function meaningfulCount(s: string): number {
  return (s || "").replace(/\s+/g, "").length;
}

export function isMeaningful(s: string): boolean {
  const trimmed = (s || "").trim();
  if (!trimmed) return false;
  const flat = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (flat.length < 4) return false;
  if (KNOWN.has(flat)) return false;
  if (GIBBERISH.test(flat)) return false;
  if (isRepetition(flat)) return false;
  return true;
}

export interface SkipGate {
  allowed: boolean;
  required: "none" | "reason" | "wait_or_sentence";
  count?: number;
  need?: number;
  message?: string;
}

export function skipGate(
  strictness: Strictness,
  input: { reason?: string; waitedMs?: number } = {},
): SkipGate {
  if (strictness === "gentle") return { allowed: true, required: "none" };
  const reason = (input.reason || "").trim();
  if (strictness === "firm") {
    const n = meaningfulCount(reason);
    if (n >= 12 && isMeaningful(reason)) return { allowed: true, required: "reason", count: n };
    return {
      allowed: false,
      required: "reason",
      count: n,
      need: 12,
      message: `A skip reason needs 12 meaningful characters. You have ${n}. Repeated characters do not count.`,
    };
  }
  if ((input.waitedMs ?? 0) >= 60000) return { allowed: true, required: "wait_or_sentence" };
  const n = meaningfulCount(reason);
  if (n >= 40 && isMeaningful(reason))
    return { allowed: true, required: "wait_or_sentence", count: n };
  return {
    allowed: false,
    required: "wait_or_sentence",
    count: n,
    need: 40,
    message: `Strict skip: wait 60 seconds, or type a sentence of 40 meaningful characters. You have ${n}.`,
  };
}

/* Lowering strictness during an active block, or within 2h before a scheduled block,
   takes effect the next local day. Raising may apply immediately after confirmation. */
export function loweringTakesEffectNextDay(
  current: Strictness,
  next: Strictness,
  scheduledAt: string | undefined,
  now: Date = new Date(),
): boolean {
  const rank = { gentle: 0, firm: 1, strict: 2 } as const;
  if (rank[next] >= rank[current]) return false;
  if (!scheduledAt) return false;
  const diff = +new Date(scheduledAt) - now.getTime();
  return diff > -2 * 3600 * 1000 && diff < 12 * 3600 * 1000;
}

/* ---------------- schedule ---------------- */

export function scheduledDateTime(contract: Contract, when: Date): Date {
  const [h, m] = contract.time.split(":").map(Number);
  const d = new Date(when);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function scheduledToday(contract: Contract, now: Date = new Date()): Date | null {
  if (!contract.active || !contract.days.includes(now.getDay())) return null;
  const at = scheduledDateTime(contract, now);
  return at;
}

export function nextScheduled(contract: Contract, now: Date = new Date()): Date {
  for (let i = 0; i < 8; i++) {
    const d = addDays(now, i);
    if (!contract.days.includes(d.getDay())) continue;
    const at = scheduledDateTime(contract, d);
    if (at.getTime() > now.getTime() - contract.grace * 60000) return at;
  }
  return scheduledDateTime(contract, addDays(now, 1));
}

export function blockState(
  contract: Contract | null,
  sessions: Session[],
  now: Date = new Date(),
): { status: "none" | "upcoming" | "due" | "missed"; at?: Date; session?: Session } {
  if (!contract || !contract.active) return { status: "none" };
  const at = scheduledToday(contract, now);
  if (!at) return { status: "none" };
  const existing = sessions.find((s) => s.scheduledAt === at.toISOString());
  if (existing && !["missed", "skipped"].includes(existing.status))
    return { status: "upcoming", at, session: existing };
  const due = at.getTime() + contract.grace * 60000;
  if (now.getTime() > due) return { status: "missed", at, session: existing };
  if (now.getTime() >= at.getTime()) return { status: "due", at, session: existing };
  return { status: "upcoming", at, session: existing };
}

/* ---------------- timer (timestamps only) ---------------- */

export function computeElapsed(session: Session, now: Date = new Date()): number {
  let elapsed = session.lastKnownElapsedMs || 0;
  if (session.status === "active" && session.startedAt) {
    const sinceAnchor = now.getTime() - +new Date(session.startedAt);
    /* negative or absurd deltas mean the clock moved backwards — keep the stored total */
    if (sinceAnchor > 0) elapsed += sinceAnchor;
  }
  /* clock rollback never erases progress */
  return Math.max(elapsed, session.lastKnownElapsedMs || 0);
}

export function tickSession(session: Session, now: Date = new Date()): Session {
  const elapsed = computeElapsed(session, now);
  return { ...session, lastKnownElapsedMs: elapsed };
}

/* ---------------- ledger ---------------- */

export const LEDGER_LABELS: Record<LedgerType, string> = {
  contract_created: "Contract created",
  contract_updated: "Contract updated",
  scheduled: "Scheduled",
  invited: "Invited",
  snoozed: "Snoozed",
  started: "Started",
  paused: "Paused",
  resumed: "Resumed",
  interrupted: "Interrupted",
  elapsed: "Elapsed",
  evidence_submitted: "Evidence submitted",
  tests_passed: "Tests passed",
  tests_failed: "Tests failed",
  completed: "Completed",
  partial: "Partial — no artifact",
  rescheduled: "Rescheduled",
  skipped: "Skipped",
  missed: "Missed",
  overridden: "Emergency override",
  corrected: "Corrected",
  journal_prefill_created: "Journal prefill created",
};

export function ledgerEvent(
  type: LedgerType,
  opts: { sessionId?: string; note?: string; now?: Date } = {},
): LedgerEvent {
  return {
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    ts: (opts.now ?? new Date()).toISOString(),
    type,
    sessionId: opts.sessionId,
    note: opts.note,
  };
}

export interface WeekCounts {
  committed: number;
  started: number;
  completedPass: number;
  testsFailed: number;
  completedUnverified: number;
  partial: number;
  rescheduled: number;
  skipped: number;
  missed: number;
  overridden: number;
  skipReasons: { reason: string; count: number }[];
}

export function weekCounts(ledger: LedgerEvent[], now: Date = new Date()): WeekCounts {
  const from = addDays(now, -6);
  from.setHours(0, 0, 0, 0);
  const rows = ledger.filter((e) => +new Date(e.ts) >= from.getTime());
  const has = (t: LedgerType) => rows.filter((r) => r.type === t).length;
  const skipReasons = new Map<string, number>();
  rows
    .filter((r) => r.type === "skipped" && r.note)
    .forEach((r) => {
      const k = (r.note || "").trim().toLowerCase().slice(0, 60);
      skipReasons.set(k, (skipReasons.get(k) ?? 0) + 1);
    });
  return {
    committed: has("scheduled"),
    started: has("started"),
    completedPass: Math.max(0, has("completed") - has("partial")),
    testsFailed: has("tests_failed"),
    completedUnverified: has("evidence_submitted") - has("tests_passed") - has("tests_failed"),
    partial: has("partial"),
    rescheduled: has("rescheduled"),
    skipped: has("skipped"),
    missed: has("missed"),
    overridden: has("overridden"),
    skipReasons: [...skipReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ---------------- mastery & recall ---------------- */

const TODAY = () => dayKey(new Date());

export function recallFor(passCount: number): Date {
  const step = passCount >= 3 ? 7 : passCount === 2 ? 3 : 1;
  return addDays(new Date(), step);
}

export function applyAttempt(
  progress: CurriculumProgress,
  topic: string,
  opts: { pass: boolean; hints: number; recall?: boolean },
): CurriculumProgress {
  const prev: TopicState = progress.topics[topic] ?? { state: "untested", attempts: [] };
  const attempts = [...prev.attempts, { date: TODAY(), pass: opts.pass, hints: opts.hints }];
  let state: TopicState["state"];
  const passes = attempts.filter((a) => a.pass);
  const distinctPassDays = new Set(passes.map((a) => a.date)).size;

  if (opts.recall) {
    if (opts.pass) {
      state = distinctPassDays >= 2 ? "solid" : "learning";
      return {
        ...progress,
        topics: {
          ...progress.topics,
          [topic]: {
            state,
            attempts,
            nextRecall: opts.pass ? recallFor(passes.length).toISOString() : undefined,
          },
        },
      };
    }
    return {
      ...progress,
      topics: {
        ...progress.topics,
        [topic]: { state: "weak", attempts, nextRecall: addDays(new Date(), 1).toISOString() },
      },
    };
  }

  if (!opts.pass) state = "weak";
  else if (opts.hints === 0) state = distinctPassDays >= 2 ? "solid" : "solid_candidate";
  else state = distinctPassDays >= 2 ? "solid" : "learning";

  const due =
    opts.pass && state !== "solid" ? recallFor(passes.length).toISOString() : undefined;

  return {
    ...progress,
    topics: { ...progress.topics, [topic]: { state, attempts, nextRecall: due } },
  };
}

export function markReviewDue(progress: CurriculumProgress): CurriculumProgress {
  const topics = { ...progress.topics };
  const now = Date.now();
  Object.entries(topics).forEach(([id, t]) => {
    if (t.nextRecall && +new Date(t.nextRecall) <= now && t.state !== "weak")
      topics[id] = { ...t, state: "review_due" };
  });
  return { ...progress, topics };
}

export function placementResults(progress: CurriculumProgress): {
  weakTopics: string[];
  tested: string[];
} {
  const tested = PLACEMENT_IDS.map(
    (id) => CURRICULUM.find((e) => e.id === id)?.topic ?? "",
  ).filter(Boolean);
  const weakTopics = [...new Set(tested.filter((t) => progress.topics[t]?.state === "weak"))];
  return { weakTopics, tested };
}

/** Choose the next exercise from hint count, mastery and weak-topic seeding. */
export function nextExercise(
  progress: CurriculumProgress,
  opts: { lastHints?: number; lastPass?: boolean; lastTopic?: string } = {},
): { ex: (typeof CURRICULUM)[number]; reason: string } {
  const topicState = (t: string) => progress.topics[t]?.state ?? "untested";
  const order = TOPICS.map((t) => t.id);

  const reviewDue = order.find((t) => topicState(t) === "review_due");
  const weak = order.filter((t) => topicState(t) === "weak");

  const pick = (topic: string, harder?: boolean) => {
    const list = exercisesInTopic(topic);
    const done = new Set(
      Object.entries(progress.topics)
        .filter(([, s]) => s.attempts.some((a) => a.pass))
        .map(([t]) => t),
    );
    void done;
    const attempted = new Set(
      CURRICULUM.filter((e) =>
        progress.topics[e.topic]?.attempts.some((a) => a.pass),
      ).map((e) => e.id),
    );
    const pool = list.filter((e) => !attempted.has(e.id));
    const sorted = [...(pool.length ? pool : list)].sort(
      (a, b) => (harder ? b.difficulty - a.difficulty : a.difficulty - b.difficulty),
    );
    return sorted[0];
  };

  if (opts.lastPass === false && opts.lastTopic) {
    return {
      ex: pick(opts.lastTopic),
      reason: "Same topic, easier exercise — the last one did not pass.",
    };
  }
  if (opts.lastPass === true && opts.lastTopic) {
    const h = opts.lastHints ?? 0;
    if (h === 0) {
      const nextTopic = order[order.indexOf(opts.lastTopic) + 1];
      if (nextTopic && topicState(nextTopic) === "untested")
        return { ex: pick(nextTopic), reason: "Zero hints — moving to the next topic." };
      return { ex: pick(opts.lastTopic, true), reason: "Zero hints — same topic, harder." };
    }
    if (h <= 2)
      return { ex: pick(opts.lastTopic), reason: "One or two hints — same topic, similar difficulty." };
    return { ex: pick(opts.lastTopic), reason: "Three or four hints — easier exercise in this topic." };
  }
  if (reviewDue) return { ex: pick(reviewDue), reason: "Spaced recall is due in this topic." };
  if (weak.length) return { ex: pick(weak[0]), reason: "Seeded from a weak topic." };
  const firstUnseen = order.find((t) => topicState(t) === "untested");
  if (firstUnseen) return { ex: pick(firstUnseen), reason: "New topic, untested." };
  return { ex: CURRICULUM[0], reason: "Everything is tested — keep the chain warm." };
}

/* ---------------- attention: chime + tab title ---------------- */

export function playChime(enabled: boolean) {
  if (!enabled) return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(784, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1046, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
    setTimeout(() => ctx.close(), 1400);
  } catch {
    /* audio blocked — silently ignored, reported in Settings */
  }
}

export function flashTabTitle(ms = 30000): () => void {
  const original = document.title;
  const stopAt = Date.now() + ms;
  let on = false;
  const id = window.setInterval(() => {
    if (Date.now() > stopAt) {
      window.clearInterval(id);
      document.title = original;
      return;
    }
    on = !on;
    document.title = on ? "NorthStar — practice now" : original;
  }, 1200);
  return () => {
    window.clearInterval(id);
    document.title = original;
  };
}

export function requestNotificationPermission(): string | null {
  try {
    if (typeof Notification === "undefined") return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    Notification.requestPermission();
    return Notification.permission;
  } catch {
    return "unsupported";
  }
}

export function showBrowserNotification(title: string, body: string): string {
  try {
    if (typeof Notification === "undefined") return "unsupported";
    if (Notification.permission !== "granted") return Notification.permission;
    new Notification(title, { body });
    return "granted";
  } catch {
    return "blocked";
  }
}

/* ---------------- journal bridge ---------------- */

export function journalPrefill(exerciseTitle: string, minutes: number, outcome: string) {
  return `Today I practiced ${exerciseTitle} for ${minutes} minutes. Result: ${outcome}.`;
}

export function nextRecallLabel(progress: CurriculumProgress, topic: string): string | null {
  const t = progress.topics[topic];
  if (!t?.nextRecall) return null;
  const d = new Date(t.nextRecall);
  const diff = Math.round((+dayKey(d) - +dayKey(new Date())) / 86400000);
  if (diff <= 0) return "recall due now";
  return `next recall in ${diff} day${diff === 1 ? "" : "s"}`;
}

export function topicLabel(topic: string) {
  return TOPICS.find((t) => t.id === topic)?.name ?? topic;
}

export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
