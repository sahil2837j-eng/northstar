import type { CoreState, Entry, Goal, Review } from "./types";

const iso = (daysAgo: number, h: number, m: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const day = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

const goals: Goal[] = [
  {
    id: "g_practice",
    title: "Ship the practice engine",
    direction:
      "Become someone who finishes the hard part first — tests, timers, ledger — instead of starting it twice.",
    nextAction: "Wire the sandbox worker to the hidden test runner, 25 min",
    domain: "craft",
    createdAt: iso(12, 9, 0),
    active: true,
  },
  {
    id: "g_deen",
    title: "A morning that starts before the noise",
    direction: "Keep the first hour of the day for prayer and quiet, most days of the week.",
    nextAction: "Lay the mat out tonight so tomorrow has no friction",
    domain: "deen",
    createdAt: iso(20, 6, 0),
    active: true,
  },
  {
    id: "g_run",
    title: "Run 5K under 27:00",
    direction: "Train four weeks, race once, and let the splits speak for themselves.",
    nextAction: "Easy 4 km Tuesday at conversational pace",
    domain: "health",
    createdAt: iso(9, 7, 30),
    active: true,
  },
];

const e = (
  id: string,
  daysAgo: number,
  h: number,
  m: number,
  text: string,
  domain: Entry["domain"],
  goalId?: string,
  minutes?: number,
): Entry => ({ id, ts: iso(daysAgo, h, m), text, domain, goalId, minutes, source: "manual" });

const entries: Entry[] = [
  e("e01", 6, 8, 10, "Woke late, so the morning block was gone before it started. Picked the day up at 10 instead.", "focus"),
  e("e02", 6, 11, 15, "Went through the strictness rules again. Firm needs 12 meaningful characters, so 'asdf' cannot count as a reason.", "craft", "g_practice", 40),
  e("e03", 6, 17, 20, "Called my brother on the way home, we talked for 40 minutes.", "family", undefined, 40),

  e("e04", 5, 6, 30, "Morning pages, three lines on what I actually want from the next 90 days.", "focus", undefined, 25),
  e("e05", 5, 10, 30, "Wrote the four Loops exercises with reference solutions and anti-solutions. Loops finally reads like a curriculum.", "craft", "g_practice", 90),
  e("e06", 5, 15, 10, "Ninety minutes on the ledger model with the notifications off. Committed, started, completed — all three, for once.", "focus", "g_practice", 90),
  e("e07", 5, 20, 30, "Gym: bench and rows, 45 minutes, kept the rest periods honest.", "health", "g_run", 45),

  e("e08", 4, 7, 45, "First hour went to email instead of the exercise bank, and the rest of the day kept that shape.", "admin"),
  e("e09", 4, 12, 20, "Placement check drafted: six questions running from variables up to closures.", "craft", "g_practice", 50),
  e("e10", 4, 18, 40, "Evening run skipped — family dinner ran long. Just how the day went.", "family"),

  e("e11", 3, 6, 10, "Fajr at the masjid. The quiet hour after it is the clearest thinking I get all day.", "deen", "g_deen", 40),
  e("e12", 3, 9, 50, "Cardio 5.2 km in 31:14. Slower than I wanted, breathing was fine the whole way.", "health", "g_run", 32),
  e("e13", 3, 11, 40, "The iframe sandbox kept leaking console.log into the test results, so I blocked it inside the worker.", "craft", "g_practice", 75),
  e("e14", 3, 16, 0, "Inbox cleared, invoices sent. Boring and done.", "admin", undefined, 30),
  e("e15", 3, 22, 5, "Read twelve pages of the star atlas chapter, then stopped instead of pushing through.", "leisure", undefined, 35),

  e("e16", 2, 7, 20, "Woke at 6:40 without the alarm. Coffee and no phone for the first 40 minutes.", "focus", undefined, 40),
  e("e17", 2, 10, 5, "Rewrote the timer so elapsed time is derived from timestamps, not counted intervals. The session survives a reload now.", "craft", "g_practice", 80),
  e("e18", 2, 13, 30, "Dhuhr, then a 20 minute walk before the afternoon block.", "deen", "g_deen", 20),
  e("e19", 2, 19, 15, "Helped with the grocery list and the ride.", "family", undefined, 45),

  e("e20", 1, 6, 45, "Same hour again — prayer, then the notebook before anything with a screen.", "deen", "g_deen", 35),
  e("e21", 1, 9, 30, "Hidden tests now run in a worker inside a sandboxed iframe; the parent owns the five second timeout.", "craft", "g_practice", 100),
  e("e22", 1, 14, 0, "Second easy run this week, 4.4 km. Legs felt fresh after the first kilometre.", "health", "g_run", 28),
  e("e23", 1, 21, 30, "Twenty five minutes of practice, one exercise, no hints. Smaller than planned and it still counts.", "craft", "g_practice", 25),
];

const todayEntries: Entry[] = [
  e("e30", 0, 6, 55, "Up before the alarm again. The mat was already out, which is the whole trick.", "deen", "g_deen", 30),
  e("e31", 0, 9, 40, "Finished the starfield component — hour ticks, dashed rings for empty past hours, gold for logged.", "craft", "g_practice", 70),
  e("e32", 0, 12, 35, "Walked instead of eating at the desk. Twenty minutes, no phone.", "health", undefined, 20),
];

const reviews: Review[] = [
  {
    date: day(1),
    text: "The day worked because the first block was decided the night before. Tomorrow: one exercise, hidden tests, nothing else before it.",
    entryIds: ["e21", "e23"],
    createdAt: iso(1, 22, 30),
  },
  {
    date: day(3),
    text: "Two useful hours before noon, then a long flat afternoon. The flat part was admin, not failure.",
    entryIds: ["e13", "e14"],
    createdAt: iso(3, 22, 10),
  },
];

export function seedCore(): CoreState {
  return { version: 1, entries: [...todayEntries, ...entries], goals, reviews };
}

export function hasSeeded(): boolean {
  try {
    return localStorage.getItem("northstar.seeded.v1") === "1";
  } catch {
    return true;
  }
}

export function markSeeded() {
  try {
    localStorage.setItem("northstar.seeded.v1", "1");
  } catch {
    /* ignore */
  }
}
