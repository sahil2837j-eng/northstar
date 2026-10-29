export interface Locus {
  id: string;
  order: number; // 1-indexed order along the route
  spot: string; // e.g. "Front door threshold"
  landmark: string; // e.g. "Heavy brass knocker"
  sense?: string; // optional sensory detail (cold metal, scent of pine)
  photoId?: string; // ID in IndexedDB
  photoAlt?: string; // alt description or "decorative"
}

export type ReviewGrade = "again" | "hard" | "good" | "easy";

/** 0 = answered cold … 4 = full cue shown, 5 = answer revealed. */
export type HintDepth = 0 | 1 | 2 | 3 | 4 | 5;

export interface EaseSample {
  date: string;
  ease: number;
}

export interface ReviewState {
  ease: number; // clamped 1.3 to 3.0, starts at 2.5
  intervalDays: number; // starts at 0
  dueAt: string; // ISO date string
  reps: number; // review count
  lapses: number; // count of Agains
  lastReviewedAt?: string;
  lastGrade?: ReviewGrade;
  /* Recorded so the Explain panel can show the exact arithmetic. */
  easeHistory?: EaseSample[];
  prevIntervalDays?: number;
  prevEase?: number;
  prevReps?: number;
}

export interface PalaceItem {
  id: string;
  locusId: string;
  text: string; // item to remember
  imageCue: string; // user-authored vivid mental cue
  cueImageId?: string; // optional image stored in IndexedDB
  cueImageAlt?: string;
  imageSource: "user" | "ai-edited";
  review: ReviewState;
  needsReencode?: boolean;
  /** false = a template or AI draft that the user has not approved yet. */
  cueApproved?: boolean;
}

export interface PalaceLoad {
  cycles: number; // how many distinct item sets this route has held
  lastClearedAt?: string;
  residual?: Record<string, number>; // locusId -> lapses carried from the previous set
}

export interface Palace {
  id: string;
  name: string;
  location: string;
  locationConfirmed: boolean; // required confirmation that user can walk it in mind
  coverImageId?: string;
  route: Locus[];
  items: PalaceItem[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  load?: PalaceLoad;
}

export interface ReviewResult {
  itemId: string;
  grade: ReviewGrade;
  recalled: boolean;
  typed?: string;
  hintUsed: boolean;
  hintDepth?: HintDepth;
  ms?: number;
}

export interface ReviewSession {
  id: string;
  palaceId: string;
  startedAt: string;
  endedAt?: string;
  mode: "first-walk" | "recall" | "reverse" | "random";
  results: ReviewResult[];
}

export type CuratorModule =
  | "routeDoctor"
  | "cueCritic"
  | "hintLadder"
  | "interferenceGuard"
  | "sessionPlanner"
  | "commandBar"
  | "loadAdvisor";

export interface CuratorSettings {
  timeoutMs: number;
  maxTokens: number;
  temperature: number; // cue critique; diagnostics always use 0.2
  dataScope: "minimal" | "palace";
  modules: Record<CuratorModule, boolean>;
}

export interface LociSettings {
  theme: "system" | "light" | "dark";
  reducedMotion: boolean;
  minimalMode: boolean; // hide section illustrations
  textSize: "standard" | "large";
  verbalMode: boolean; // aphantasia-friendly verbal/story prompts
  aiEnabled: boolean; // master switch for the local model (on by default; calls are user-initiated)
  aiEndpoint: string; // default /ollama (loopback proxy) or a localhost OpenAI-compatible URL
  aiModel: string; // default qwen2.5:7b-instruct
  aiSetupVersion?: number; // one-time migration marker for the loopback defaults
  curator?: CuratorSettings;
}

export interface LociState {
  version: 1;
  palaces: Palace[];
  sessions: ReviewSession[];
  settings: LociSettings;
}
