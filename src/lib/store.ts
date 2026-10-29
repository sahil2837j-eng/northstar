import type {
  Contract,
  CoreState,
  CurriculumProgress,
  GuideState,
  LedgerEvent,
  MemoryItem,
  MemoryKind,
  MemoryState,
  PracticePrefs,
  Session,
  UIState,
} from "./types";
import { MAX_ACTIVE_MEMORY } from "./types";
import { LOCI_STORAGE_KEY, loadLociState, saveLociState, clearAllLociData } from "./loci-store";

export const KEYS = {
  core: "northstar.core.v1",
  ui: "northstar.ui.v1",
  guide: "northstar.guide.v1",
  memory: "northstar.memory.v1",
  contract: "northstar.practice.contract.v1",
  schedule: "northstar.practice.schedule.v1",
  sessions: "northstar.practice.sessions.v1",
  ledger: "northstar.practice.ledger.v1",
  curriculum: "northstar.practice.curriculum.v1",
  prefs: "northstar.practice.prefs.v1",
  extSchedule: "northstar_practice_schedule_v1",
};

export function readKey<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

export function readRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Set while Delete Everything runs, so React effects do not immediately rewrite cleared keys. */
let suppressWrites = false;

export function writeKey(key: string, value: unknown) {
  if (suppressWrites) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — reported honestly in Settings */
  }
}

export const DEFAULT_UI: UIState = {
  version: 1,
  wakeStart: 6,
  wakeEnd: 23,
  aiMentorEnabled: true,
  aiEndpointNote: "/ollama",
  motion: undefined, // resolved at runtime: OS reduced-motion → off, low power → calm
  overseer: true,
  skyTint: true,
  atmosphere: false,
  twinkle: false,
  haptics: false,
  mentorModel: "qwen2.5:7b-instruct",
  mentorPersona: "strategist",
  mentorAutoBrief: false,
  aiSetupVersion: 2,
};

export const DEFAULT_GUIDE: GuideState = {
  version: 1,
  profile: {},
  skippedQuestions: [],
  neverQuestions: [],
  answers: [],
  patterns: [],
  dismissed: [],
};

export const DEFAULT_MEMORY: MemoryState = { version: 1, items: [] };

const MEMORY_KINDS: MemoryKind[] = ["principle", "decision", "lesson", "question"];

/**
 * Strategic Memory is user-authored context, never journal evidence. It keeps
 * archived items, but active memory is capped at 8: if an old import has more,
 * the oldest active items are archived rather than deleted.
 */
export function sanitizeMemory(raw: unknown): MemoryState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const items: MemoryItem[] = Array.isArray(o.items)
    ? o.items
        .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
        .filter(
          (i) =>
            typeof i.id === "string" &&
            typeof i.text === "string" &&
            typeof i.createdAt === "string" &&
            typeof i.updatedAt === "string" &&
            (i.active === undefined ||
              typeof i.active === "boolean" ||
              i.active === 0 ||
              i.active === 1) &&
            MEMORY_KINDS.includes(i.kind as MemoryKind),
        )
        .map((i) => ({
          id: i.id as string,
          kind: i.kind as MemoryKind,
          text: (i.text as string).slice(0, 240),
          createdAt: i.createdAt as string,
          updatedAt: i.updatedAt as string,
          /* Old builds used booleans; tolerate 0/1 and a missing flag. */
          active: !(i.active === false || i.active === 0),
        }))
    : [];

  const active = items
    .filter((i) => i.active)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const keep = new Set(active.slice(0, MAX_ACTIVE_MEMORY).map((i) => i.id));
  return {
    version: 1,
    items: items.map((i) => (i.active && !keep.has(i.id) ? { ...i, active: false } : i)),
  };
}

export const DEFAULT_CURRICULUM: CurriculumProgress = {
  version: 1,
  placementDone: false,
  topics: {},
};

export const DEFAULT_PREFS: PracticePrefs = {
  version: 1,
  aiFeedbackEnabled: false,
  openStartCard: true,
};

export function emptyCore(): CoreState {
  return { version: 1, entries: [], goals: [], reviews: [] };
}

/* ---------------- extension bridge (honest, no fake blocking) ---------------- */

export interface ExtensionStatus {
  present: boolean;
  id?: string;
  detail: string;
}

declare global {
  interface Window {
    __NORTHSTAR_EXT__?: { id?: string; version?: string };
  }
}

export function extensionStatus(): ExtensionStatus {
  const ext = typeof window !== "undefined" ? window.__NORTHSTAR_EXT__ : undefined;
  if (ext) {
    return {
      present: true,
      id: ext.id,
      detail: `Focus Tracker ${ext.version ?? ""} detected. Alarms and site rules live in the extension.`.trim(),
    };
  }
  return {
    present: false,
    detail:
      "Focus Tracker not detected. NorthStar cannot wake itself, cannot show browser alarms while closed, and cannot block sites. Everything below works only while this tab is open.",
  };
}

export function extensionClear(): boolean {
  const ext = extensionStatus();
  if (!ext.present) return false;
  try {
    window.postMessage(
      { type: "NORTHSTAR_SCHEDULE_CLEAR", version: 1, requestId: rid() },
      "*",
    );
    return true;
  } catch {
    return false;
  }
}

export function extensionUpsert(contract: Contract | null) {
  if (!extensionStatus().present) return;
  const payload = contract
    ? {
        type: "NORTHSTAR_SCHEDULE_UPSERT",
        version: 1,
        requestId: rid(),
        payload: contractPayload(contract),
      }
    : { type: "NORTHSTAR_SCHEDULE_CLEAR", version: 1, requestId: rid() };
  try {
    window.postMessage(JSON.stringify(payload).length > 32 * 1024 ? null : payload, "*");
  } catch {
    /* ignored */
  }
}

function contractPayload(c: Contract) {
  return {
    days: c.days,
    time: c.time,
    duration: c.duration,
    grace: c.grace,
    restricted: c.restricted.slice(0, 40),
    active: c.active,
  };
}

export function rid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ---------------- export / import / delete ---------------- */

export interface Bundle {
  version: 1;
  exportedAt: string;
  core: CoreState;
  ui: UIState;
  guide: GuideState;
  memory?: MemoryState;
  practice?: {
    version: 1;
    contract: Contract | null;
    schedule: unknown;
    sessions: Session[];
    ledger: LedgerEvent[];
    curriculumProgress: CurriculumProgress;
    prefs: PracticePrefs;
  };
  loci?: unknown;
}

export function exportBundle(): Bundle {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    core: readRaw<CoreState>(KEYS.core, emptyCore()),
    ui: readRaw<UIState>(KEYS.ui, DEFAULT_UI),
    guide: readRaw<GuideState>(KEYS.guide, DEFAULT_GUIDE),
    memory: sanitizeMemory(readRaw<MemoryState>(KEYS.memory, DEFAULT_MEMORY)),
    practice: {
      version: 1,
      contract: readRaw<Contract | null>(KEYS.contract, null),
      schedule: readRaw<unknown>(KEYS.schedule, null),
      sessions: readRaw<Session[]>(KEYS.sessions, []),
      ledger: readRaw<LedgerEvent[]>(KEYS.ledger, []),
      curriculumProgress: readRaw<CurriculumProgress>(KEYS.curriculum, DEFAULT_CURRICULUM),
      prefs: readRaw<PracticePrefs>(KEYS.prefs, DEFAULT_PREFS),
    },
    loci: readRaw<unknown>(LOCI_STORAGE_KEY, loadLociState()),
  };
}

export type ImportResult = { ok: true; note: string } | { ok: false; note: string };

export function importBundle(raw: string): ImportResult {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, note: "That file is not valid JSON. Nothing was changed." };
  }
  if (!parsed || typeof parsed !== "object" || !parsed.core) {
    return { ok: false, note: "That file is not a NorthStar backup. Nothing was changed." };
  }
  const core: CoreState = {
    version: 1,
    entries: Array.isArray(parsed.core.entries) ? parsed.core.entries : [],
    goals: Array.isArray(parsed.core.goals) ? parsed.core.goals : [],
    reviews: Array.isArray(parsed.core.reviews) ? parsed.core.reviews : [],
  };
  writeKey(KEYS.core, core);
  if (parsed.ui) writeKey(KEYS.ui, { ...DEFAULT_UI, ...parsed.ui });
  writeKey(KEYS.guide, { ...DEFAULT_GUIDE, ...(parsed.guide ?? {}) });
  if (parsed.memory) writeKey(KEYS.memory, sanitizeMemory(parsed.memory));
  const p = parsed.practice;
  writeKey(KEYS.contract, p?.contract ?? null);
  writeKey(KEYS.schedule, p?.schedule ?? null);
  writeKey(KEYS.sessions, Array.isArray(p?.sessions) ? p.sessions : []);
  writeKey(KEYS.ledger, Array.isArray(p?.ledger) ? p.ledger : []);
  writeKey(KEYS.curriculum, { ...DEFAULT_CURRICULUM, ...(p?.curriculumProgress ?? {}) });
  writeKey(KEYS.prefs, { ...DEFAULT_PREFS, ...(p?.prefs ?? {}) });
  if (parsed.loci && parsed.loci.version === 1) {
    saveLociState(parsed.loci);
  }
  const legacy = !parsed.practice;
  return {
    ok: true,
    note: legacy
      ? `Imported an older backup: ${core.entries.length} entries, ${core.goals.length} goals. Practice and guide data start empty.`
      : `Imported ${core.entries.length} entries, ${core.goals.length} goals, plus practice and guide data.`,
  };
}

export function deleteEverything(): { cleared: boolean; extensionAcknowledged: boolean } {
  suppressWrites = true;
  Object.values(KEYS)
    .filter((k) => k !== KEYS.extSchedule)
    .forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem(KEYS.extSchedule);
  /* Delete Everything also clears legacy notebook keys and the remote AI
     config/key, which deliberately live outside the export bundle. Loci
     markers stay so a deleted legacy palace is not re-imported. */
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("northstar.") || key.startsWith("northstar_"))) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
  try {
    sessionStorage.removeItem("northstar.ai.key.openai");
    sessionStorage.removeItem("northstar.ai.key.anthropic");
  } catch {
    /* no session storage in this context */
  }
  clearAllLociData();
  const ack = extensionClear();
  return { cleared: true, extensionAcknowledged: ack };
}
