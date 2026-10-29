import { createContext, useContext } from "react";
import type {
  CoreState,
  Domain,
  Entry,
  GuideState,
  MemoryState,
  PracticeState,
  UIState,
} from "./types";

export type Route =
  | "today"
  | "goals"
  | "memory"
  | "loci"
  | "review"
  | "insights"
  | "history"
  | "settings";

export interface AppApi {
  prefill: string;
  core: CoreState;
  updateCore: (fn: (prev: CoreState) => CoreState) => void;
  ui: UIState;
  updateUi: (fn: (prev: UIState) => UIState) => void;
  guide: GuideState;
  updateGuide: (fn: (prev: GuideState) => GuideState) => void;
  memory: MemoryState;
  updateMemory: (fn: (prev: MemoryState) => MemoryState) => void;
  practice: PracticeState;
  updatePractice: (fn: (prev: PracticeState) => PracticeState) => void;
  route: Route;
  go: (r: Route) => void;
  toast: (text: string, tone?: "lit" | "plain") => void;
  saveEntry: (input: { text: string; domain?: Domain; goalId?: string; at?: Date }) => Entry;
  linkEntry: (id: string, goalId: string | undefined) => void;
  openGuide: () => void;
  openMentor: () => void;
  openOverseer: () => void;
  setPrefill: (s: string, goalId?: string) => void;
  prefillGoal?: string;
  ignite: { hour: number; at: number } | null;
  captureFocus: number;
  requestCapture: () => void;
  openPractice: () => void;
  pendingSlot: { dateKey: string; hour: number } | null;
  setPendingSlot: (s: { dateKey: string; hour: number } | null) => void;
}

export const AppCtx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppCtx.Provider");
  return ctx;
}
