export type Domain =
  | "focus"
  | "craft"
  | "deen"
  | "health"
  | "family"
  | "admin"
  | "leisure";

export const DOMAIN_META: Record<Domain, { label: string; color: string }> = {
  focus: { label: "Focus", color: "var(--ns-focus)" },
  craft: { label: "Craft", color: "var(--ns-craft)" },
  deen: { label: "Deen", color: "var(--ns-deen)" },
  health: { label: "Health", color: "var(--ns-health)" },
  family: { label: "Family", color: "var(--ns-family)" },
  admin: { label: "Admin", color: "var(--ns-admin)" },
  leisure: { label: "Leisure", color: "var(--ns-leisure)" },
};

export interface Entry {
  id: string;
  ts: string;
  text: string;
  domain?: Domain;
  goalId?: string;
  minutes?: number;
  source?: "manual" | "practice";
}

export interface Goal {
  id: string;
  title: string;
  direction: string;
  nextAction: string;
  domain: Domain;
  createdAt: string;
  active: boolean;
}

export interface Review {
  date: string;
  text: string;
  entryIds: string[];
  createdAt: string;
}

export interface CoreState {
  version: 1;
  entries: Entry[];
  goals: Goal[];
  reviews: Review[];
  deletedAt?: string;
}

export interface UIState {
  version: 1;
  wakeStart: number;
  wakeEnd: number;
  aiMentorEnabled: boolean;
  aiEndpointNote: string;
  hideLimits?: boolean;
  /* motion layer — visual only, never changes meaning */
  motion?: "off" | "calm" | "full";
  overseer?: boolean;
  skyTint?: boolean;
  atmosphere?: boolean;
  twinkle?: boolean;
  haptics?: boolean;
  /* local AI mentor */
  mentorModel?: string;
  mentorPersona?: "strategist" | "mentalist" | "calm";
  mentorAutoBrief?: boolean;
  /* one-time migration marker for the loopback /ollama defaults */
  aiSetupVersion?: number;
}

/* ---------------- strategic memory ---------------- */

export type MemoryKind = "principle" | "decision" | "lesson" | "question";

export const MAX_ACTIVE_MEMORY = 8;

export const MEMORY_META: Record<MemoryKind, { label: string; hint: string }> = {
  principle: { label: "Principle", hint: "A rule you want to keep." },
  decision: { label: "Decision", hint: "A choice you made, and why." },
  lesson: { label: "Lesson", hint: "Something experience taught you." },
  question: { label: "Open question", hint: "A question worth carrying." },
};

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  text: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

export interface MemoryState {
  version: 1;
  items: MemoryItem[];
}

/* ---------------- guide ---------------- */

export interface Pattern {
  id: string;
  keyword: string;
  entryIds: string[];
  days: string[];
  confirmedAt?: string;
}

export interface GuideState {
  version: 1;
  profile: Record<string, string>;
  skippedQuestions: string[];
  neverQuestions: string[];
  answers: { ts: string; question: string; answer: string; goalId?: string }[];
  patterns: Pattern[];
  dismissed: string[];
}

/* ---------------- practice ---------------- */

export type Strictness = "gentle" | "firm" | "strict";
export type PracticeMode = "coding" | "recall" | "reading" | "user";
export type MasteryState =
  | "untested"
  | "weak"
  | "learning"
  | "solid_candidate"
  | "solid"
  | "review_due";

export type TimerStatus =
  | "ready"
  | "active"
  | "paused"
  | "interrupted"
  | "elapsed"
  | "awaiting_evidence"
  | "submitted_pass"
  | "submitted_fail"
  | "submitted_unverified"
  | "partial_no_artifact"
  | "skipped"
  | "rescheduled"
  | "missed"
  | "overridden"
  | "corrected"
  | "completed";

export interface Contract {
  goalId?: string;
  title: string;
  days: number[];
  time: string;
  duration: 10 | 20 | 25;
  mode: PracticeMode;
  modeLabel?: string;
  strictness: Strictness;
  grace: number;
  notify: boolean;
  chime: boolean;
  fullscreen: boolean;
  extension: boolean;
  restricted: string[];
  commitment: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  date: string;
  scheduledAt: string;
  startedAt?: string;
  endedAt?: string;
  status: TimerStatus;
  lastKnownElapsedMs: number;
  exerciseId?: string;
  snoozes: number;
  snoozedUntil?: string;
  hintsUsed: number;
  testsPassed?: boolean;
  evidence?: string;
  userTest?: string;
  reason?: string;
  correctedFrom?: string;
}

export type LedgerType =
  | "contract_created"
  | "contract_updated"
  | "scheduled"
  | "invited"
  | "snoozed"
  | "started"
  | "paused"
  | "resumed"
  | "interrupted"
  | "elapsed"
  | "evidence_submitted"
  | "tests_passed"
  | "tests_failed"
  | "completed"
  | "partial"
  | "rescheduled"
  | "skipped"
  | "missed"
  | "overridden"
  | "corrected"
  | "journal_prefill_created";

export interface LedgerEvent {
  id: string;
  ts: string;
  type: LedgerType;
  sessionId?: string;
  note?: string;
}

export interface TopicState {
  state: MasteryState;
  attempts: { date: string; pass: boolean; hints: number }[];
  nextRecall?: string;
}

export interface CurriculumProgress {
  version: 1;
  placementDone: boolean;
  placedAt?: string;
  topics: Record<string, TopicState>;
}

export interface PracticePrefs {
  version: 1;
  lastExerciseId?: string;
  aiFeedbackEnabled: boolean;
  openStartCard: boolean;
}

export interface PracticeState {
  contract: Contract | null;
  schedule: { scheduledAt: string; sessionId?: string } | null;
  sessions: Session[];
  ledger: LedgerEvent[];
  curriculum: CurriculumProgress;
  prefs: PracticePrefs;
}
