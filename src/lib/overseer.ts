/* VIGIL — the overseer's deterministic brain.
   It reads only locally stored data. No AI needed for its presence.
   Every line is a fact or a proposal; nothing is a verdict, nothing shames. */

import { dayKey, entriesInWindow, findPatterns, relDay } from "./data";
import { blockState, nextScheduled, weekCounts } from "./practice";
import { isLocalEndpoint } from "./mentor";
import type { CoreState, GuideState, PracticeState, UIState } from "./types";

export type Mood = "observing" | "focused" | "scanning" | "dormant" | "alert";
export type OverseerAction = "capture" | "practice" | "guide" | "mentor" | "none";

export interface OverseerSnapshot {
  mood: Mood;
  status: string;
  headline: string;
  line: string;
  directive: { text: string; action: OverseerAction; label: string };
  telemetry: { label: string; value: string; tone?: string }[];
  signals: string[];
  boot: string;
}

const MOOD_STATUS: Record<Mood, string> = {
  observing: "watching the day",
  focused: "in session",
  scanning: "awaiting a signal",
  dormant: "off duty",
  alert: "block window open",
};

const MOOD_HEADLINE: Record<Mood, string> = {
  observing: "Keeping watch",
  focused: "Instrument live",
  scanning: "Nothing logged yet",
  dormant: "Quiet hours",
  alert: "Practice window open",
};

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function buildOverseer(
  core: CoreState,
  guide: GuideState,
  practice: PracticeState,
  ui: UIState,
  now: Date = new Date(),
): OverseerSnapshot {
  const today = core.entries.filter((e) => dayKey(e.ts) === dayKey(now));
  const linkedToday = today.filter((e) => e.goalId).length;
  const sortedToday = [...today].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const inWake = now.getHours() >= ui.wakeStart && now.getHours() < ui.wakeEnd;
  const week = entriesInWindow(core.entries, "7");
  const weekDays = new Set(week.map((e) => dayKey(e.ts))).size;
  const live = practice.sessions.find((s) =>
    ["active", "paused", "awaiting_evidence"].includes(s.status),
  );
  const block = blockState(practice.contract, practice.sessions, now);
  const nextBlock = practice.contract?.active ? nextScheduled(practice.contract, now) : null;
  const counts = weekCounts(practice.ledger, now);
  const candidates = findPatterns(core.entries).filter(
    (p) => !guide.patterns.some((g) => g.keyword === p.keyword),
  );
  const mentorLocal = ui.aiEndpointNote.trim() ? isLocalEndpoint(ui.aiEndpointNote) : false;

  let mood: Mood;
  let line: string;
  let directive: OverseerSnapshot["directive"];

  if (live?.status === "active") {
    mood = "focused";
    line = `A ${practice.contract?.duration ?? 20} minute block is open. The ring reads timestamps — reloading cannot reset it.`;
    directive = {
      text: `Return to "${live.exerciseId ? "the open exercise" : "the block"}" and finish the evidence step.`,
      action: "practice",
      label: "Return to session",
    };
  } else if (block.status === "due" || block.status === "missed") {
    mood = "alert";
    const at = block.at ? timeOf(block.at.toISOString()) : practice.contract?.time ?? "the set time";
    line = `A practice block was due at ${at}. Resuming, rescheduling and overriding are all recorded as plain facts.`;
    directive = {
      text: "Open the block. You can start, resize it, move it, or use the emergency override — it stays available.",
      action: "practice",
      label: "Open the block",
    };
  } else if (!inWake) {
    mood = "dormant";
    line = `Outside your ${ui.wakeStart}:00–${ui.wakeEnd}:00 waking window. I keep watch and ask nothing of you.`;
    directive = {
      text: "Nothing is expected. If you are awake anyway, one line is still allowed.",
      action: "capture",
      label: "Log a line anyway",
    };
  } else if (today.length === 0) {
    mood = "scanning";
    line = "No entries yet today. One sentence is enough to light the strip — unlogged hours stay unknown, not judged.";
    directive = {
      text: "Write one honest sentence about what actually happened so far.",
      action: "capture",
      label: "Log one sentence",
    };
  } else if (linkedToday === 0) {
    mood = "observing";
    line = `${today.length} ${today.length === 1 ? "entry" : "entries"} today, none linked. Linking is optional — only link what is true evidence.`;
    directive = {
      text: "Read today's timeline and link the one entry that genuinely supports a goal — or leave it unlinked.",
      action: "capture",
      label: "Add to the record",
    };
  } else {
    mood = "observing";
    const last = sortedToday[0];
    line = `${today.length} entries today, ${linkedToday} linked. Last signal at ${timeOf(last.ts)} — the shape of today is yours to set.`;
    directive = {
      text: practice.contract?.active
        ? "Protect the next block. One specific task, one honest evidence line after it."
        : "Choose one direction for the next hour and give it a visible piece of evidence.",
      action: practice.contract?.active ? "practice" : "guide",
      label: practice.contract?.active ? "Open practice" : "Ask NorthStar",
    };
  }

  const signals: string[] = [];
  signals.push(
    `${weekDays} ${weekDays === 1 ? "day" : "days"} logged in the last 7 — ${week.length} entries; ${week.filter((e) => e.goalId).length} linked.`,
  );
  if (practice.contract?.active && nextBlock) {
    signals.push(`Next scheduled block: ${relDay(nextBlock.toISOString())} at ${timeOf(nextBlock.toISOString())} (${practice.contract.duration} min).`);
  } else if (!practice.contract) {
    signals.push("No practice contract yet. Nothing is scheduled, and nothing is expected.");
  }
  if (practice.contract?.active) {
    signals.push(
      `Practice week: ${counts.committed} committed · ${counts.started} started · ${counts.skipped} skipped · ${counts.missed} missed · ${counts.overridden} overrides.`,
    );
  }
  if (candidates[0]) {
    signals.push(
      `Pattern candidate: “${candidates[0].keyword}” — ${candidates[0].entryIds.length} entries across ${candidates[0].days.length} local days. It needs your confirmation in Ask NorthStar.`,
    );
  }
  if (candidates.length === 0 && findPatterns(core.entries).length === 0) {
    signals.push("No claimable pattern yet. A pattern needs 3+ entries across 2+ local days.");
  }
  signals.push(
    ui.aiEndpointNote.trim()
      ? mentorLocal
        ? "Mentor connection: localhost. Briefings stay on this machine."
        : "Mentor connection: remote. Anything sent leaves this device — manual sends only."
      : "Mentor connection: none. All guidance here is deterministic and local.",
  );
  signals.push("Override is always one tap and is written down as a fact, not a penalty.");

  const telemetry = [
    { label: "entries today", value: String(today.length), tone: "var(--ns-lit)" },
    { label: "linked today", value: String(linkedToday), tone: "var(--ns-linked)" },
    {
      label: "next block",
      value: nextBlock ? timeOf(nextBlock.toISOString()) : "—",
      tone: "var(--ns-north)",
    },
    {
      label: "mentor",
      value: ui.aiEndpointNote.trim() ? (mentorLocal ? "local" : "remote") : "off",
      tone: ui.aiEndpointNote.trim() ? "var(--ns-ok)" : "var(--ns-faint)",
    },
  ];

  return {
    mood,
    status: MOOD_STATUS[mood],
    headline: MOOD_HEADLINE[mood],
    line,
    directive,
    telemetry,
    signals,
    boot: "VIGIL // overseeing local data only",
  };
}

export const MOOD_COLOR: Record<Mood, string> = {
  observing: "var(--ns-linked)",
  focused: "var(--ns-lit)",
  scanning: "var(--ns-north)",
  dormant: "var(--ns-faint)",
  alert: "var(--ns-warn)",
};
