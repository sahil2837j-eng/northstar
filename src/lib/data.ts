import type { Entry, Goal, UIState } from "./types";

export const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function fmtClock(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtHM(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}

export function fmtMin(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function relDay(ts: string): string {
  const d = dayKey(ts);
  const today = dayKey(new Date());
  const y = dayKey(addDays(new Date(), -1));
  if (d === today) return "Today";
  if (d === y) return "Yesterday";
  const dt = new Date(ts);
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/* ---------------- starfield ---------------- */

export type StarState =
  | "outside"
  | "future"
  | "empty_past"
  | "current"
  | "logged"
  | "logged_current";

export interface Star {
  hour: number;
  state: StarState;
  count: number;
  linked: number;
  entries: Entry[];
  label: string;
}

export function buildDay(
  date: Date,
  entries: Entry[],
  ui: UIState,
  now: Date = new Date(),
): Star[] {
  const key = dayKey(date);
  const sameDay = dayKey(now) === key;
  const currentHour = now.getHours();
  const out: Star[] = [];
  for (let h = 0; h < 24; h++) {
    const inWake = h >= ui.wakeStart && h < ui.wakeEnd;
    const mine = entries.filter(
      (e) => dayKey(e.ts) === key && new Date(e.ts).getHours() === h,
    );
    const linked = mine.filter((e) => e.goalId).length;
    let state: StarState;
    // A recorded moment still lights up even if it happened outside waking hours.
    if (mine.length) state = sameDay && h === currentHour ? "logged_current" : "logged";
    else if (!inWake) state = "outside";
    else if (sameDay && h === currentHour) state = "current";
    else if (sameDay && h > currentHour) state = "future";
    else state = "empty_past";

    const label =
      state === "outside"
        ? `${pad(h)}:00 outside waking hours`
        : mine.length
          ? `${pad(h)}:00 logged`
          : state === "current"
            ? `${pad(h)}:00 current hour`
            : `${pad(h)}:00 empty`;

    out.push({ hour: h, state, count: mine.length, linked, entries: mine, label });
  }
  return out;
}

/* ---------------- patterns: 3+ entries across 2+ local days ---------------- */

const STOP = new Set(
  "about after again already another because before being between both during every first from have into just like more than that their them then there these this those through today tomorrow under until what when where which while will with without would your you're them's just really very actually maybe still thing things".split(
    " ",
  ),
);

export interface FoundPattern {
  keyword: string;
  entryIds: string[];
  days: string[];
}

export function findPatterns(entries: Entry[], windowDays = 30): FoundPattern[] {
  const cutoff = startOfDay(addDays(new Date(), -windowDays)).getTime();
  const recent = entries.filter((e) => new Date(e.ts).getTime() >= cutoff);
  const byWord = new Map<string, Map<string, string[]>>();
  for (const e of recent) {
    const words = e.text
      .toLowerCase()
      .replace(/[^a-z0-9'\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOP.has(w));
    const seen = new Set<string>();
    for (const w of words) {
      if (seen.has(w)) continue;
      seen.add(w);
      const days = byWord.get(w) ?? new Map<string, string[]>();
      const k = dayKey(e.ts);
      const arr = days.get(k) ?? [];
      arr.push(e.id);
      days.set(k, arr);
      byWord.set(w, days);
    }
  }
  const out: FoundPattern[] = [];
  byWord.forEach((days, keyword) => {
    const dayList = [...days.keys()];
    const ids = [...days.values()].flat();
    if (ids.length >= 3 && dayList.length >= 2) {
      out.push({ keyword, entryIds: ids, days: dayList.sort() });
    }
  });
  return out.sort((a, b) => b.entryIds.length - a.entryIds.length).slice(0, 8);
}

/* ---------------- visual data ---------------- */

export function heatmap31(entries: Entry[], ref: Date = new Date()) {
  const days: { key: string; count: number; hours: number }[] = [];
  for (let i = 30; i >= 0; i--) {
    const d = addDays(ref, -i);
    const key = dayKey(d);
    const mine = entries.filter((e) => dayKey(e.ts) === key);
    const hours = new Set(mine.map((e) => new Date(e.ts).getHours())).size;
    days.push({ key, count: mine.length, hours });
  }
  return days;
}

export function histogram24(entries: Entry[], ref: Date = new Date()) {
  const key = dayKey(ref);
  void key;
  const arr = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  entries.forEach((e) => {
    arr[new Date(e.ts).getHours()].count++;
  });
  return arr;
}

export function linkedRatio(entries: Entry[]) {
  const linked = entries.filter((e) => e.goalId).length;
  return { linked, unlinked: entries.length - linked, total: entries.length };
}

export function evidenceFor(goal: Goal, entries: Entry[]) {
  return entries
    .filter((e) => e.goalId === goal.id)
    .sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
}

export function entriesInWindow(entries: Entry[], window: "today" | "7" | "14") {
  const now = new Date();
  if (window === "today") {
    const k = dayKey(now);
    return entries.filter((e) => dayKey(e.ts) === k);
  }
  const days = Number(window);
  const from = startOfDay(addDays(now, -(days - 1))).getTime();
  return entries.filter((e) => +new Date(e.ts) >= from);
}

export function goalById(goals: Goal[], id?: string) {
  return goals.find((g) => g.id === id);
}
