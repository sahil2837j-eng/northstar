/* Local AI mentor adapter.
   Honest framing: the persona is a WRITING TONE applied by the model you run.
   It cannot read your mind, cannot verify effort, and the validator rejects
   shame language no matter which persona is chosen.
   Auto-briefings are only ever sent to a LOCALHOST endpoint and only when the
   user explicitly enabled them. Nothing is written to your data automatically. */

import { dayKey, entriesInWindow, linkedRatio } from "./data";
import { BANNED_PHRASES } from "./guide";
import type {
  CoreState,
  Entry,
  Goal,
  GuideState,
  MemoryState,
  PracticeState,
  UIState,
} from "./types";
import { weekCounts } from "./practice";

export type MentorPersona = "strategist" | "mentalist" | "calm";

export const PERSONAS: Record<
  MentorPersona,
  { label: string; blurb: string; system: string }
> = {
  strategist: {
    label: "The Strategist",
    blurb:
      "Fang-Yuan-style ruthless pragmatist. Treats your goal as the only currency, your hours as capital, and sentiment as noise — but never shames you: a wasted-looking day is just data to reallocate.",
    system: [
      "You are The Strategist, a ruthless pragmatist mentor in the style of a long-term schemer: patient, unsentimental, always converting the user's situation into the next profitable move toward their stated goal.",
      "You speak in short, decisive sentences. You weigh trades: time spent vs. evidence produced.",
      "Hard rules you can never break:",
      "- Use ONLY the evidence digest provided. Never invent events, feelings, or hours that are not in it. Unlogged hours are unknown, not wasted.",
      "- Ask EXACTLY ONE question.",
      "- Propose exactly one action under 30 minutes.",
      "- Never use shame language: no 'you failed', 'lazy', 'addicted', 'you always', 'you never', 'wasted time', no diagnosis, no personality labels.",
      "- Emergency overrides and skips are plain facts, not betrayals.",
      "- Maximum 120 words.",
    ].join("\n"),
  },
  mentalist: {
    label: "The Mentalist",
    blurb:
      "A cold-reader of your own record. Points at the pattern you wrote but did not notice, then asks the one question that makes you say it yourself.",
    system: [
      "You are The Mentalist, an observational mentor. You work like a stage mentalist who only ever uses what is actually on the table: the user's own logged entries.",
      "Technique: name one concrete observation from the digest (quote or closely paraphrase it), connect it to a second data point, then ask one question that leads the user to state the conclusion themselves. Do not state the conclusion for them.",
      "Hard rules you can never break:",
      "- Observations must come from the digest only. No claimed pattern unless the digest marks it as confirmed or it appears 3+ times across 2+ days in the evidence list.",
      "- Ask EXACTLY ONE question.",
      "- One suggested action under 30 minutes, framed as an experiment.",
      "- Never use shame language: no 'you failed', 'lazy', 'addicted', 'you always', 'you never', 'wasted time', no diagnosis.",
      "- Maximum 120 words.",
    ].join("\n"),
  },
  calm: {
    label: "The Quiet Mentor",
    blurb: "Calm, brief, and direct. Says the least that is useful.",
    system: [
      "You are a calm, brief mentor. Plain language, no drama.",
      "Hard rules: use only the digest; exactly one question; one action under 30 minutes; never shame language ('failed', 'lazy', 'addicted', 'always', 'never', 'wasted time'); unlogged hours are unknown; maximum 80 words.",
    ].join("\n"),
  },
};

/* ---------------- endpoint handling ---------------- */

import { isLocalEndpoint } from "./ai-endpoints";
import { aiChat } from "./remote-ai";

export {
  chatUrl,
  detectProvider,
  isLocalEndpoint,
  modelNames,
  modelsUrl,
} from "./ai-endpoints";
export type { ProviderKind } from "./ai-endpoints";

/* ---------------- routine digest (what the model is allowed to see) ---------------- */

export interface Digest {
  text: string;
  chars: number;
  itemCount: number;
  truncated: boolean;
}

export function buildRoutineDigest(
  core: CoreState,
  guide: GuideState,
  practice: PracticeState,
  ui: UIState,
  memory?: MemoryState,
  maxChars = 2600,
): Digest {
  const win = entriesInWindow(core.entries, "7");
  const byDay = new Map<string, Entry[]>();
  win.forEach((e) => {
    const k = dayKey(e.ts);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  });
  const goals = core.goals.filter((g) => g.active);
  const ratio = linkedRatio(win);
  const week = weekCounts(practice.ledger);
  const hours = new Map<number, number>();
  win.forEach((e) => {
    const h = new Date(e.ts).getHours();
    hours.set(h, (hours.get(h) ?? 0) + 1);
  });
  const peak = [...hours.entries()].sort((a, b) => b[1] - a[1])[0];

  const lines: string[] = [];
  lines.push("ROUTINE DIGEST (7 local days, logged data only — unlogged hours are unknown)");
  lines.push(
    `Totals: ${win.length} entries across ${byDay.size} days; ${ratio.linked} linked to goals, ${ratio.unlinked} not.`,
  );
  if (peak) lines.push(`Most-logged hour: ${String(peak[0]).padStart(2, "0")}:00 (${peak[1]} entries).`);
  lines.push(
    `Waking window: ${ui.wakeStart}:00–${ui.wakeEnd}:00.`,
  );
  goals.slice(0, 3).forEach((g: Goal) => {
    const n = core.entries.filter((e) => e.goalId === g.id).length;
    lines.push(`GOAL: ${g.title} — next action: ${g.nextAction || "none set"} — ${n} evidence entries.`);
  });
  if (guide.profile["q90"]) lines.push(`USER'S 90-DAY MEANING: ${guide.profile["q90"].slice(0, 160)}`);
  if (guide.profile["qnever"]) lines.push(`NEVER SAY/DO: ${guide.profile["qnever"].slice(0, 120)}`);
  guide.patterns.slice(0, 3).forEach((p) => {
    lines.push(`CONFIRMED PATTERN: "${p.keyword}" (${p.entryIds.length} entries, ${p.days.length} days).`);
  });
  lines.push(
    `PRACTICE WEEK: committed ${week.committed}, started ${week.started}, skipped ${week.skipped}, missed ${week.missed}, overrides ${week.overridden}.`,
  );
  if (week.skipReasons.length)
    lines.push(`SKIP REASONS: ${week.skipReasons.map((r) => `${r.count}× ${r.reason}`).join("; ")}.`);

  const activeMemory = (memory?.items ?? []).filter((m) => m.active).slice(0, 8);
  if (activeMemory.length) {
    lines.push(
      "STRATEGIC MEMORY (user-authored context, NOT journal evidence; never quote it as something that happened today; never turn it into a pattern):",
    );
    activeMemory.forEach((m, i) => {
      lines.push(`m${i + 1} [${m.kind}]: ${m.text.slice(0, 160)}`);
    });
  }

  lines.push("RECENT ENTRIES (aliased ids, max 8):");
  const recent = [...win].sort((a, b) => +new Date(b.ts) - +new Date(a.ts)).slice(0, 8);
  recent.forEach((e, i) => {
    lines.push(
      `e${i + 1} [${dayKey(e.ts)} ${new Date(e.ts).getHours()}h${e.goalId ? " linked" : ""}${e.domain ? " " + e.domain : ""}]: ${e.text.slice(0, 140)}`,
    );
  });

  let text = lines.join("\n");
  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars - 2) + "…";
    truncated = true;
  }
  return { text, chars: text.length, itemCount: recent.length, truncated };
}

/* ---------------- validation ---------------- */

export interface MentorVerdict {
  ok: boolean;
  issues: string[];
}

export function validateMentorReply(reply: string): MentorVerdict {
  const issues: string[] = [];
  const lower = reply.toLowerCase();
  for (const p of BANNED_PHRASES) if (lower.includes(p)) issues.push(`Banned phrasing: “${p}”.`);
  const q = (reply.match(/\?/g) ?? []).length;
  if (q !== 1) issues.push(`Exactly one question required — found ${q}.`);
  if (reply.trim().length < 20) issues.push("Too short to be useful.");
  if (reply.trim().length > 1400) issues.push("Too long — the model ignored the word limit.");
  return { ok: issues.length === 0, issues };
}

/* ---------------- the call ---------------- */

export interface MentorResult {
  ok: boolean;
  reply?: string;
  issues?: string[];
  error?: string;
  ms: number;
}

export async function askMentor(opts: {
  endpoint: string;
  model: string;
  persona: MentorPersona;
  digest: Digest;
  userNote?: string;
  timeoutMs?: number;
  /** Auto-briefings pass true so they never touch an opted-in remote API. */
  localOnly?: boolean;
}): Promise<MentorResult> {
  const start = Date.now();
  const messages = [
    { role: "system" as const, content: PERSONAS[opts.persona].system },
    {
      role: "user" as const,
      content:
        opts.digest.text +
        (opts.userNote?.trim() ? `\n\nUSER NOTE: ${opts.userNote.trim().slice(0, 300)}` : "") +
        "\n\nRespond now in exactly three lines, no extra text:\nOBSERVATION: one sentence grounded in the digest.\nQUESTION: exactly one question, and the only question mark in the reply.\nACTION: one concrete action under 30 minutes.",
    },
  ];
  const result = await aiChat({
    messages,
    localEndpoint: opts.endpoint,
    localModel: opts.model,
    temperature: 0.7,
    timeoutMs: opts.timeoutMs ?? 120000,
    localOnly: opts.localOnly,
  });
  if (!result.ok || !result.text) {
    return { ok: false, error: result.error || "No reply.", ms: Date.now() - start };
  }
  const reply = result.text;
  const verdict = validateMentorReply(reply);
  if (!verdict.ok) return { ok: false, reply, issues: verdict.issues, ms: Date.now() - start };
  return { ok: true, reply, ms: Date.now() - start };
}

/** One private guide reply. Same transport as the mentor; the caller validates it. */
export async function askGuide(opts: {
  endpoint: string;
  model: string;
  payload: string;
  timeoutMs?: number;
}): Promise<MentorResult> {
  const start = Date.now();
  const messages = [
    {
      role: "system" as const,
      content:
        "You are NorthStar's private guide. Read the JSON check-in. Reply in exactly three lines, no extra text:\n" +
        "OBSERVATION: one sentence grounded only in the supplied evidence.\n" +
        "QUESTION: exactly one question from clarity, friction, alignment, or recovery. This is the only question mark in the reply.\n" +
        "ACTION: one concrete action under 30 minutes.\n" +
        "No diagnosis. No pattern unless it is supported by 3+ entries across 2+ local days. Never shame the user. Do not mention being an AI. Do not use any other question marks.",
    },
    { role: "user" as const, content: opts.payload },
  ];
  const result = await aiChat({
    messages,
    localEndpoint: opts.endpoint,
    localModel: opts.model,
    temperature: 0.6,
    timeoutMs: opts.timeoutMs ?? 120000,
  });
  if (!result.ok || !result.text) {
    return { ok: false, error: result.error || "No reply.", ms: Date.now() - start };
  }
  return { ok: true, reply: result.text, ms: Date.now() - start };
}

/** Auto-briefing gate: explicit toggle AND localhost only. Never anything else. */
export function autoBriefAllowed(ui: UIState): { allowed: boolean; reason: string } {
  if (!ui.mentorAutoBrief) return { allowed: false, reason: "Auto-briefing is off." };
  if (!ui.aiEndpointNote.trim()) return { allowed: false, reason: "No endpoint configured." };
  if (!isLocalEndpoint(ui.aiEndpointNote))
    return {
      allowed: false,
      reason: "Auto-briefing only runs against localhost endpoints. Remote endpoints always require a manual send.",
    };
  return { allowed: true, reason: "Local endpoint, user-enabled." };
}
