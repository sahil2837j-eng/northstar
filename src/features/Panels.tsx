import { useMemo, useState } from "react";
import { useApp } from "../lib/ctx";
import { Bay, Bar, Eyebrow, MiniHeatmap, MiniHistogram, Star, Stat } from "../components/ui";
import {
  dayKey,
  evidenceFor,
  findPatterns,
  histogram24,
  heatmap31,
  linkedRatio,
  relDay,
} from "../lib/data";
import { DOMAIN_META, type Domain, type Goal } from "../lib/types";
import {
  KEYS,
  deleteEverything,
  exportBundle,
  extensionClear,
  extensionStatus,
  importBundle,
} from "../lib/store";
import { detectProvider, isLocalEndpoint, modelNames, modelsUrl } from "../lib/mentor";
import { GoalEvidenceStars } from "./Today";
import { Vigil, useOverseer } from "../components/Overseer";
import RemoteAISettings from "./RemoteAISettings";

const DOMAINS = Object.keys(DOMAIN_META) as Domain[];

/* ============================================================
   GOALS
   ============================================================ */

export function GoalsPanel() {
  const { core, updateCore, toast, requestCapture, go } = useApp();
  const [draft, setDraft] = useState<Omit<Goal, "id" | "createdAt" | "active"> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const startNew = () => {
    setDraft({ title: "", direction: "", nextAction: "", domain: "focus" });
    setEditingId(null);
  };

  const save = () => {
    if (!draft?.title.trim()) {
      toast("A goal needs a name.", "plain");
      return;
    }
    if (editingId) {
      updateCore((p) => ({
        ...p,
        goals: p.goals.map((g) => (g.id === editingId ? { ...g, ...draft } : g)),
      }));
      toast("Goal updated.", "lit");
    } else {
      const g: Goal = {
        ...draft,
        id: "g_" + Math.random().toString(36).slice(2, 8),
        createdAt: new Date().toISOString(),
        active: true,
      };
      updateCore((p) => ({ ...p, goals: [...p.goals, g] }));
      toast("Goal created.", "lit");
    }
    setDraft(null);
    setEditingId(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Direction</div>
          <h1 className="plate text-[34px]">Goals</h1>
        </div>
        <button className="btn" type="button" onClick={startNew}>
          + New goal
        </button>
      </div>

      {draft && (
        <Bay className="space-y-3 p-4">
          <Eyebrow right={editingId ? "editing" : "new"}>{editingId ? "Edit goal" : "New goal"}</Eyebrow>
          <input
            placeholder="Title, e.g. Ship the practice engine"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <textarea
            rows={2}
            placeholder="Direction — who this makes you, in one sentence."
            value={draft.direction}
            onChange={(e) => setDraft({ ...draft, direction: e.target.value })}
          />
          <input
            placeholder="Next action — small enough to start today"
            value={draft.nextAction}
            onChange={(e) => setDraft({ ...draft, nextAction: e.target.value })}
          />
          <div className="flex flex-wrap gap-1.5">
            {DOMAINS.map((d) => (
              <button
                key={d}
                type="button"
                className="chip"
                data-on={draft.domain === d}
                onClick={() => setDraft({ ...draft, domain: d })}
              >
                {DOMAIN_META[d].label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" type="button" onClick={save}>
              {editingId ? "Save changes" : "Create goal"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </Bay>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {core.goals.map((g) => {
          const evidence = evidenceFor(g, core.entries);
          return (
            <Bay key={g.id} className="flex flex-col p-4" hover>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="eyebrow" style={{ color: DOMAIN_META[g.domain].color }}>
                    {DOMAIN_META[g.domain].label} · {g.active ? "active" : "paused"}
                  </div>
                  <h2 className="plate pt-1 text-2xl">{g.title}</h2>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    setDraft({
                      title: g.title,
                      direction: g.direction,
                      nextAction: g.nextAction,
                      domain: g.domain,
                    });
                    setEditingId(g.id);
                  }}
                >
                  Edit
                </button>
              </div>
              <p className="pt-2 text-[14px] muted">{g.direction}</p>

              <div className="rule my-3" />
              <div className="eyebrow pb-2">Evidence</div>
              <GoalEvidenceStars goal={g} />

              <div className="mt-3 rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3">
                <div className="eyebrow pb-1" style={{ color: "var(--ns-lit)" }}>
                  Start
                </div>
                <p className="text-[14px]">{g.nextAction || "No next action yet."}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 pt-1">
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    requestCapture();
                    go("today");
                  }}
                >
                  Log evidence
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() =>
                    updateCore((p) => ({
                      ...p,
                      goals: p.goals.map((x) => (x.id === g.id ? { ...x, active: !x.active } : x)),
                    }))
                  }
                >
                  {g.active ? "Pause goal" : "Activate goal"}
                </button>
                <span className="mono self-center text-[11px] faint">{evidence.length} linked entries</span>
              </div>
            </Bay>
          );
        })}
        {!core.goals.length && (
          <Bay className="p-6 text-center muted lg:col-span-2">
            No goals yet. A goal gives the day a direction — it does not grade you.
          </Bay>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   REVIEW
   ============================================================ */

export function ReviewPanel() {
  const { core, updateCore, toast } = useApp();
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sealed, setSealed] = useState(false);

  const existing = core.reviews.find((r) => r.date === date);
  const dayEntries = core.entries.filter((e) => dayKey(e.ts) === date);
  const shown = drafts[date] ?? existing?.text ?? "";

  const save = () => {
    if (!shown.trim()) {
      toast("Write a line before sealing the day.", "plain");
      return;
    }
    updateCore((p) => ({
      ...p,
      reviews: [
        ...p.reviews.filter((r) => r.date !== date),
        { date, text: shown.trim(), entryIds: dayEntries.map((e) => e.id), createdAt: new Date().toISOString() },
      ],
    }));
    setDrafts((d) => ({ ...d, [date]: "" }));
    setSealed(true);
    window.setTimeout(() => setSealed(false), 1400);
    toast("Day sealed. No score, no verdict.", "lit");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Close the day</div>
          <h1 className="plate text-[34px]">Review</h1>
        </div>
        <label className="flex items-center gap-2">
          <span className="eyebrow">Day</span>
          <input
            type="date"
            value={date}
            max={dayKey(new Date())}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: 170 }}
          />
        </label>
      </div>

      <Bay className="p-4">
        <Eyebrow right={`${dayEntries.length} entries`}>Day strip · read only</Eyebrow>
        <div className="-mx-1">
          <StarInteractiveStatic dateKey={date} />
        </div>
      </Bay>

      <Bay className="p-4">
        <Eyebrow right={existing ? "saved" : "not written yet"}>Reflection</Eyebrow>
        <textarea
          rows={5}
          placeholder="What moved, what did not, what tomorrow needs. Plain writing, no scoring."
          value={shown}
          onChange={(e) => setDrafts((d) => ({ ...d, [date]: e.target.value }))}
        />
        <div className="mt-3 flex items-center gap-3">
          <button className="btn btn-primary" type="button" onClick={save}>
            Seal the day
          </button>
          {sealed && (
            <span
              className="seal inline-grid h-9 w-9 place-items-center rounded-full"
              style={{ border: "1px solid var(--ns-north)", color: "var(--ns-north)" }}
              aria-label="Sealed"
            >
              ✦
            </span>
          )}
        </div>
      </Bay>

      <Bay className="p-4">
        <Eyebrow right={`${dayEntries.length} referenced`}>Entries this day</Eyebrow>
        <ul className="space-y-2">
          {dayEntries.map((e) => (
            <li key={e.id} className="flex gap-3 border-b border-[var(--ns-line)] pb-2 last:border-0">
              <span className="mono text-[12px]" style={{ color: "var(--ns-lit)" }}>
                {new Date(e.ts).toTimeString().slice(0, 5)}
              </span>
              <span className="text-[14px] muted">{e.text}</span>
              {e.goalId && <span className="mono ml-auto text-[11px]">✦</span>}
            </li>
          ))}
          {!dayEntries.length && <li className="text-[13px] faint">No entries on this day.</li>}
        </ul>
      </Bay>
    </div>
  );
}

function StarInteractiveStatic({ dateKey }: { dateKey: string }) {
  const { core, ui } = useApp();
  const d = new Date(dateKey + "T12:00:00");
  const stars = useMemo(
    () => core.entries.filter((e) => dayKey(e.ts) === dateKey),
    [core.entries, dateKey],
  );
  const hours = Array.from({ length: 24 }, (_, h) => {
    const mine = stars.filter((e) => new Date(e.ts).getHours() === h);
    const inWake = h >= ui.wakeStart && h < ui.wakeEnd;
    const isToday = dateKey === dayKey(new Date());
    const state = !inWake
      ? ("outside" as const)
      : mine.length
        ? ("logged" as const)
        : isToday && h === new Date().getHours()
          ? ("current" as const)
          : isToday && h > new Date().getHours()
            ? ("future" as const)
            : ("empty_past" as const);
    return { h, state, count: mine.length, linked: mine.filter((e) => e.goalId).length };
  });
  void d;
  return (
    <div className="flex items-end justify-between gap-0.5 overflow-x-auto scroll-thin pb-1">
      {hours.map((s) => (
        <div key={s.h} className="flex flex-col items-center gap-1">
          <Star
            state={s.state}
            count={s.count}
            linked={s.linked}
            size={22}
            label={`${String(s.h).padStart(2, "0")}:00 ${s.count ? "logged" : "empty"}`}
          />
          <span className="mono text-[9px] faint">{s.h % 3 === 0 ? String(s.h).padStart(2, "0") : ""}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   INSIGHTS
   ============================================================ */

type Feedback = "helpful" | "not" | "dismissed";

export function InsightsPanel() {
  const { core, guide, ui, toast, openGuide, go } = useApp();
  const [fb, setFb] = useState<Record<string, Feedback>>({});
  const days = useMemo(() => heatmap31(core.entries), [core.entries]);
  const hist = useMemo(() => histogram24(core.entries), [core.entries]);
  const ratio = useMemo(() => linkedRatio(core.entries), [core.entries]);
  const patterns = useMemo(() => findPatterns(core.entries), [core.entries]);
  const litDays = days.filter((d) => d.count > 0).length;

  const rate = (id: string, value: Feedback) => {
    setFb((f) => ({ ...f, [id]: value }));
    if (value === "helpful") toast("Noted — helpful.", "plain");
    if (value === "not") toast("Noted — not helpful. It will be phrased differently next time.", "plain");
  };

  const block = (id: string, title: string, body: React.ReactNode, visual?: React.ReactNode) => {
    if (fb[id] === "dismissed") return null;
    return (
      <Bay className="p-4" hover>
        <Eyebrow right={fb[id] === "helpful" ? "helpful" : fb[id] === "not" ? "not helpful" : undefined}>
          {title}
        </Eyebrow>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="text-[14px] muted">{body}</div>
          {visual && <div className="min-w-0 sm:w-[300px]">{visual}</div>}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => rate(id, "helpful")}>
            Helpful
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => rate(id, "not")}>
            Not helpful
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => rate(id, "dismissed")}>
            Dismiss
          </button>
        </div>
      </Bay>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow">What the data says — nothing more</div>
        <h1 className="plate text-[34px]">Insights</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="entries stored" value={String(core.entries.length)} />
        <Stat label="days with entries" value={`${litDays}/31`} tone="var(--ns-north)" />
        <Stat label="linked to goals" value={`${ratio.linked}`} tone="var(--ns-linked)" />
        <Stat label="reviews written" value={String(core.reviews.length)} tone="var(--ns-lit)" />
      </div>

      {block(
        "coverage",
        "Coverage",
        <>
          {litDays} of the last 31 local days hold at least one entry. Dark squares are unlogged days
          — the app does not know what happened there, so it calls them unknown, not wasted.
        </>,
        <MiniHeatmap days={days} />,
      )}

      {block(
        "rhythm",
        "Rhythm",
        <>
          Entries by hour across all stored days. Peaks show when you tend to write; a quiet stretch
          is a fact about logging, not about effort.
        </>,
        <div>
          <MiniHistogram data={hist} height={54} />
          <div className="mono flex justify-between pt-1 text-[9px] faint">
            <span>00</span>
            <span>12</span>
            <span>23</span>
          </div>
        </div>,
      )}

      {block(
        "linking",
        "Linking",
        <>
          {ratio.linked} of {ratio.total} entries are linked to a goal. Linking is what turns a log
          into evidence — but only when the link is true.
        </>,
        <div className="space-y-2">
          <Bar a={ratio.linked} b={ratio.unlinked} />
          <div className="mono flex justify-between text-[11px]">
            <span style={{ color: "var(--ns-linked)" }}>{ratio.linked} linked</span>
            <span className="faint">{ratio.unlinked} unlinked</span>
          </div>
        </div>,
      )}

      <Bay className="p-4">
        <Eyebrow right="3+ entries across 2+ days required">Patterns</Eyebrow>
        {patterns.length ? (
          <ul className="space-y-2">
            {patterns.map((p) => {
              const confirmed = guide.patterns.some((g) => g.keyword === p.keyword);
              return (
                <li key={p.keyword}>
                  <details className="rounded-xl border border-[var(--ns-line)] p-3">
                    <summary className="flex items-center justify-between gap-3">
                      <span className="text-[14px]">
                        “{p.keyword}” · {p.entryIds.length} entries · {p.days.length} local days
                      </span>
                      <span className="mono text-[11px]" style={{ color: confirmed ? "var(--ns-linked)" : "var(--ns-faint)" }}>
                        {confirmed ? "confirmed" : "candidate"}
                      </span>
                    </summary>
                    <ul className="space-y-1 pt-3">
                      {p.entryIds.slice(0, 6).map((id) => {
                        const e = core.entries.find((x) => x.id === id);
                        return e ? (
                          <li key={id} className="text-[13px] muted">
                            <span className="mono pr-2" style={{ color: "var(--ns-lit)" }}>
                              {relDay(e.ts)}
                            </span>
                            {e.text.slice(0, 110)}
                          </li>
                        ) : null;
                      })}
                    </ul>
                    <p className="pt-2 text-[12px] faint">
                      Keyword frequency only — the app cannot read motives. Confirm or drop it from
                      Ask NorthStar.
                    </p>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] faint">
            No pattern qualifies yet. A claim needs at least 3 entries across 2 different local days.
          </p>
        )}
      </Bay>

      <Bay className="p-4">
        <Eyebrow right={ui.aiMentorEnabled ? "configured" : "off"}>Mentor</Eyebrow>
        <p className="text-[14px] muted">
          AI is never called in the background. When you want it, open Ask NorthStar and press the
          mentor action — the payload is shown first and you decide.
        </p>
        <button className="btn mt-3" type="button" onClick={() => { openGuide(); go("today"); }}>
          Open Ask NorthStar
        </button>
      </Bay>
    </div>
  );
}

/* ============================================================
   HISTORY
   ============================================================ */

export function HistoryPanel() {
  const { core, toast } = useApp();
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [q, setQ] = useState("");
  const days = useMemo(() => heatmap31(core.entries), [core.entries]);

  const filtered = core.entries
    .filter((e) => (!from || dayKey(e.ts) >= from) && (!to || dayKey(e.ts) <= to))
    .filter((e) => (q ? e.text.toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => +new Date(b.ts) - +new Date(a.ts));

  const clearAll = () => {
    setFrom("");
    setTo("");
    setQ("");
    toast("Filters cleared.", "plain");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Everything you wrote</div>
          <h1 className="plate text-[34px]">History</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="eyebrow">Search</span>
          <input
            placeholder="Literal search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 220 }}
            aria-label="Search entries"
          />
        </div>
      </div>

      <Bay className="p-4">
        <Eyebrow right="click a day to filter">Last 31 days</Eyebrow>
        <MiniHeatmap days={days} onPick={(k) => { setFrom(k); setTo(k); }} activeKey={from || undefined} />
        <p className="pt-2 text-[12px] faint">
          Intensity = entries that day. Clicking a square sets From/To to that local day.
        </p>
      </Bay>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="eyebrow">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} />
        </label>
        <label className="flex items-center gap-2">
          <span className="eyebrow">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160 }} />
        </label>
        {from && <button className="chip" type="button" onClick={() => setFrom("")}>From {from} ✕</button>}
        {to && <button className="chip" type="button" onClick={() => setTo("")}>To {to} ✕</button>}
        {q && <button className="chip" type="button" onClick={() => setQ("")}>“{q}” ✕</button>}
        <span className="mono ml-auto text-[11px] faint">{filtered.length} results</span>
        {(from || to || q) && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={clearAll}>
            Clear
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {filtered.map((e) => (
          <Bay key={e.id} className="p-4" hover>
            <div className="flex flex-wrap items-center gap-2 pb-1.5">
              <span className="mono text-[12px]" style={{ color: "var(--ns-lit)" }}>
                {new Date(e.ts).toTimeString().slice(0, 5)}
              </span>
              <span className="eyebrow">{relDay(e.ts)}</span>
              {e.domain && <span className="chip" style={{ pointerEvents: "none" }}>{DOMAIN_META[e.domain].label}</span>}
              {e.goalId && (
                <span className="mono text-[11px]" style={{ color: "var(--ns-linked)" }}>
                  ✦ {core.goals.find((g) => g.id === e.goalId)?.title ?? "linked"}
                </span>
              )}
            </div>
            <p className="text-[15px]">{e.text}</p>
          </Bay>
        ))}
        {!filtered.length && (
          <Bay className="p-8 text-center muted">Nothing matches those filters yet.</Bay>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SETTINGS
   ============================================================ */

const LIMITS: { group: string; items: string[] }[] = [
  {
    group: "Platform",
    items: [
      "A web page cannot start itself, wake itself, or notify reliably when the tab or browser is closed.",
      "Only an extension, a PWA with push, or a desktop app can give stronger background attention.",
      "This app cannot block YouTube or any other site. Only Focus Tracker can, only with your permission, only for patterns you allowed.",
      "Notifications can be denied, muted, silenced by Do Not Disturb, or blocked by policy — and most OS suppression cannot be detected.",
      "Anyone who controls their browser can disable the extension, clear storage, or use another browser. All force is self-imposed.",
      "Background timers are throttled, so elapsed time here is always computed from timestamps, never from interval counts.",
      "Local storage is unencrypted. Clearing browser data, changing browsers, or changing devices loses it unless you export.",
    ],
  },
  {
    group: "Verification",
    items: [
      "Nothing here can prove you wrote the code yourself.",
      "Passing tests show the code works for those cases; they do not prove authorship or learning.",
      "Pasted code and explanations can be copied or faked.",
      "A timer shows elapsed time, not attention or effort.",
      "Unlogged hours are unknown, not wasted.",
      "Hidden tests ship to the browser and are inspectable in DevTools.",
    ],
  },
  {
    group: "Teaching",
    items: [
      "Without AI, the teacher is a fixed exercise bank plus what you typed.",
      "With AI, quality depends on the model; validators check format and banned phrases, not teaching correctness.",
      "Misconceptions you never type cannot be detected.",
      "Placement is an estimate until real attempts arrive.",
    ],
  },
  {
    group: "Behaviour",
    items: [
      "Any emergency override is a way out, and it stays available.",
      "Reminders can be ignored and strong pressure gets tuned out.",
      "Ledger numbers can become performative if overemphasised.",
      "The app cannot see tiredness, prayer, family duties, illness, mood, or emergencies. A good plan can still be wrong for the day.",
    ],
  },
  {
    group: "Security",
    items: [
      "Running pasted code is risky without a real sandbox. The runner here is best-effort: a sandboxed iframe with a strict CSP and a worker, with the page owning the timeout.",
      "Anything sent to an AI provider leaves this device — you always see the payload first.",
      "Storage is plain localStorage. No encryption in this build, by request.",
    ],
  },
];

export function SettingsPanel() {
  const { ui, updateUi, core, toast } = useApp();
  const vigil = useOverseer();
  const ext = extensionStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ack, setAck] = useState(false);
  const [aiTest, setAiTest] = useState<string | null>(null);
  const [testingAi, setTestingAi] = useState(false);

  const testAi = async () => {
    const endpoint = ui.aiEndpointNote.trim();
    if (!endpoint) {
      setAiTest("No endpoint configured.");
      return;
    }
    if (!isLocalEndpoint(endpoint)) {
      setAiTest("Rejected: only loopback endpoints or the built-in /ollama proxy are allowed.");
      return;
    }
    setTestingAi(true);
    setAiTest(null);
    const kind = detectProvider(endpoint);
    try {
      const res = await fetch(modelsUrl(endpoint, kind), { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        setAiTest(`Endpoint answered ${res.status}.`);
        return;
      }
      const data = await res.json();
      const models = modelNames(data, kind);
      const wanted = (ui.mentorModel ?? "").trim();
      const has = models.some((m) => m === wanted || m.startsWith(`${wanted}:`));
      const server = kind === "ollama" ? "Ollama" : "OpenAI-compatible server";
      setAiTest(
        has
          ? `Connected to ${server}. ${wanted} is ready.`
          : `Connected to ${server}. Models: ${models.join(", ") || "none"}.`,
      );
    } catch {
      setAiTest(
        "Could not connect. Start Ollama (default 11434) and open the app through `npm start` so /ollama is proxied, or use a local OpenAI-compatible server such as LM Studio on http://127.0.0.1:1234/v1.",
      );
    } finally {
      setTestingAi(false);
    }
  };

  const doExport = () => {
    const bundle = exportBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `northstar-backup-${dayKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup downloaded. Keep it somewhere safe.", "lit");
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const res = importBundle(text);
    toast(res.note, res.ok ? "lit" : "plain");
    if (res.ok) window.setTimeout(() => window.location.reload(), 700);
  };

  const doDelete = () => {
    const cleared = deleteEverything();
    toast(
      cleared.extensionAcknowledged
        ? "NorthStar data cleared, extension acknowledged."
        : "NorthStar data was cleared here. Open Focus Tracker to clear its schedule copy.",
      "plain",
    );
    window.setTimeout(() => window.location.reload(), 900);
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow">Trust, storage, attention</div>
        <h1 className="plate text-[34px]">Settings</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bay className="p-4">
          <Eyebrow right={`${ui.wakeStart}:00–${ui.wakeEnd}:00`}>Waking hours</Eyebrow>
          <p className="pb-3 text-[13px] muted">
            Hours outside this window render as faint points in the day strip and are never counted
            as gaps.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="eyebrow block pb-1">Wake</span>
              <input
                type="number"
                min={0}
                max={23}
                value={ui.wakeStart}
                onChange={(e) => updateUi((u) => ({ ...u, wakeStart: Number(e.target.value) }))}
              />
            </label>
            <label>
              <span className="eyebrow block pb-1">Sleep</span>
              <input
                type="number"
                min={1}
                max={24}
                value={ui.wakeEnd}
                onChange={(e) => updateUi((u) => ({ ...u, wakeEnd: Number(e.target.value) }))}
              />
            </label>
          </div>
        </Bay>

        <Bay className="p-4">
          <Eyebrow right="persistent">VIGIL overseer</Eyebrow>
          <div className="flex items-center gap-4 pb-3">
            <div className="overseer-stage grid shrink-0 place-items-center p-2">
              <Vigil mood={vigil.mood} size={72} />
            </div>
            <div className="min-w-0">
              <div className="wordmark text-[15px] tracking-[0.1em]">VIGIL</div>
              <div className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--ns-linked)" }}>
                {vigil.status}
              </div>
              <p className="clamp3 pt-1 text-[12px] muted">{vigil.line}</p>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] px-3 py-2.5">
            <span>
              <span className="block text-[14px]">Show VIGIL everywhere</span>
              <span className="block pt-0.5 text-[12px] faint">
                Rail card on desktop, floating dock on mobile. Off removes the presence, not your data.
              </span>
            </span>
            <input
              type="checkbox"
              style={{ width: 16 }}
              checked={ui.overseer !== false}
              onChange={(e) => updateUi((u) => ({ ...u, overseer: e.target.checked }))}
            />
          </label>
          <p className="pt-2 text-[12px] faint">
            VIGIL is deterministic — its lines come from your stored entries, schedule and settings.
            Its motion follows the Motion setting above.
          </p>
        </Bay>

        <Bay className="p-4">
          <Eyebrow right={ui.motion ?? "auto"}>Motion</Eyebrow>
          <p className="pb-3 text-[13px] muted">
            Visual only — animation never changes what the data means. OS reduced-motion always
            wins, even over Full.
          </p>
          <div className="flex flex-wrap gap-1.5 pb-3">
            {(["off", "calm", "full"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className="chip"
                data-on={(ui.motion ?? "calm") === m}
                onClick={() => {
                  updateUi((u) => ({ ...u, motion: m }));
                  toast(m === "off" ? "Motion off — instant states." : m === "calm" ? "Calm — one-time transitions only." : "Full — ambient layers available.", "plain");
                }}
              >
                {m === "off" ? "Off" : m === "calm" ? "Calm" : "Full"}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {(
              [
                ["skyTint", "Sky tint by time of day", "Calm and Full. Background shifts dawn/day/dusk/night, 2s crossfade, hourly."],
                ["atmosphere", "Atmosphere drift", "Full only. Two very slow gradient layers, 60s cycle, pauses when hidden."],
                ["twinkle", "Twinkle", "Full only. At most 40 faint CSS stars, no JavaScript per frame."],
                ["haptics", "Haptic tap on save (mobile)", "Off by default. Does nothing when unsupported."],
              ] as const
            ).map(([key, label, hint]) => (
              <label
                key={key}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] px-3 py-2.5"
              >
                <span>
                  <span className="block text-[14px]">{label}</span>
                  <span className="block pt-0.5 text-[12px] faint">{hint}</span>
                </span>
                <input
                  type="checkbox"
                  style={{ width: 16, marginTop: 3 }}
                  checked={Boolean(ui[key])}
                  onChange={(e) => updateUi((u) => ({ ...u, [key]: e.target.checked }))}
                />
              </label>
            ))}
          </div>
        </Bay>

        <Bay className="p-4">
          <Eyebrow right={ui.aiMentorEnabled ? "on" : "off"}>Optional AI mentor</Eyebrow>
          <p className="pb-3 text-[13px] muted">
            No background calls. Every send shows the payload first. Entry ids are aliased, at most
            8 evidence items, at most 2,000 characters, never your full journal. The default{" "}
            <code className="mono">/ollama</code> endpoint is proxied by the loopback app server, so
            Ollama needs no CORS setup.
          </p>
          <label className="flex items-center gap-2 pb-3 text-[14px]">
            <input
              type="checkbox"
              style={{ width: 16 }}
              checked={ui.aiMentorEnabled}
              onChange={(e) => updateUi((u) => ({ ...u, aiMentorEnabled: e.target.checked }))}
            />
            Enable the mentor action
          </label>
          <label className="block">
            <span className="eyebrow block pb-1">Endpoint (optional)</span>
            <input
              placeholder="/ollama  ·  http://localhost:11434  ·  http://localhost:1234/v1"
              value={ui.aiEndpointNote}
              onChange={(e) => updateUi((u) => ({ ...u, aiEndpointNote: e.target.value }))}
            />
            <span className="mt-1 block text-[12px] faint">
              A loopback endpoint keeps everything on this machine. Ollama and OpenAI-compatible
              servers are both detected automatically. <code className="mono">/ollama</code> is the
              built-in proxy to Ollama on port 11434; use{" "}
              <code className="mono">http://localhost:1234/v1</code> for LM Studio.
            </span>
          </label>
          <label className="mt-3 block">
            <span className="eyebrow block pb-1">Model name</span>
            <input
              placeholder="qwen2.5:7b-instruct · llama3.1 · mistral …"
              value={ui.mentorModel ?? ""}
              onChange={(e) => updateUi((u) => ({ ...u, mentorModel: e.target.value }))}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost btn-sm" type="button" disabled={testingAi} onClick={testAi}>
              {testingAi ? "Testing…" : "Test connection"}
            </button>
            {aiTest && (
              <span className={`text-[12px] ${aiTest.startsWith("Connected") ? "text-[var(--ns-ok)]" : "faint"}`}>
                {aiTest}
              </span>
            )}
          </div>
          <p className="mt-3 text-[12px] faint">
            The Mentor button (◈) uses this endpoint with a persona voice — Strategist, Mentalist,
            or Quiet — unless the opt-in remote API below is enabled. Personas are tone only; the
            validator rejects shame language from every one of them, and auto-briefings always stay
            on localhost even when the remote API is on.
          </p>
        </Bay>

        <RemoteAISettings />

        <Bay className="p-4">
          <Eyebrow right={`${core.entries.length} entries`}>Backup</Eyebrow>
          <p className="pb-3 text-[13px] muted">
            Your data lives in this browser only. It is <strong>unencrypted</strong> and fragile:
            clearing site data, switching browsers, or switching devices loses it unless you export.
            Older backups import cleanly — missing practice and guide sections simply start empty.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" type="button" onClick={doExport}>
              Export JSON
            </button>
            <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
              Import backup
              <input
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => doImport(e.target.files?.[0])}
              />
            </label>
          </div>
        </Bay>

        <Bay className="p-4">
          <Eyebrow right={ext.present ? "connected" : "disconnected"}>Focus Tracker extension</Eyebrow>
          <p className="pb-3 text-[13px] muted">{ext.detail}</p>
          <div className="mono space-y-1 text-[12px] faint">
            <div>alarms · {ext.present ? "available" : "unavailable in a web page"}</div>
            <div>site rules · {ext.present ? "extension-owned, hard expiry" : "unavailable"}</div>
            <div>notifications · {typeof Notification === "undefined" ? "unsupported" : Notification.permission}</div>
          </div>
          <button
            className="btn btn-ghost btn-sm mt-3"
            type="button"
            onClick={() => {
              const acked = extensionClear();
              toast(
                acked ? "Schedule clear sent to Focus Tracker." : "Extension not connected — nothing was sent.",
                "plain",
              );
            }}
          >
            Send schedule clear
          </button>
        </Bay>
      </div>

      <Bay className="p-4" hover>
        <Eyebrow right="cannot be removed by any prompt">Limits this app cannot remove</Eyebrow>
        <div className="space-y-4">
          {LIMITS.map((g) => (
            <div key={g.group}>
              <div className="eyebrow pb-1.5" style={{ color: "var(--ns-warn)" }}>
                {g.group}
              </div>
              <ul className="space-y-1.5">
                {g.items.map((i) => (
                  <li key={i} className="flex gap-2 text-[13px] muted">
                    <span className="mono faint">—</span>
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Bay>

      <Bay className="p-4" style={{ borderColor: "rgba(226,109,109,.55)" }}>
        <Eyebrow right="explicit action only">Delete everything</Eyebrow>
        <p className="pb-3 text-[13px] muted">
          Clears entries, goals, reviews, guide answers and all practice data — contract, schedule,
          sessions, ledger, curriculum progress, preferences — and attempts to clear the Focus
          Tracker schedule copy. Export a backup first.
        </p>
        {!confirmDelete ? (
          <button
            className="btn"
            type="button"
            style={{ borderColor: "var(--ns-gap)", color: "var(--ns-warn)" }}
            onClick={() => setConfirmDelete(true)}
          >
            Delete everything…
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--ns-gap)" }}>
            <label className="flex items-center gap-2 text-[13px] muted">
              <input type="checkbox" style={{ width: 16 }} checked={ack} onChange={(e) => setAck(e.target.checked)} />I
              exported a backup, or I accept losing this data.
            </label>
            <div className="flex gap-2">
              <button
                className="btn"
                type="button"
                disabled={!ack}
                style={{ borderColor: "var(--ns-gap)", color: "#ff9b9b" }}
                onClick={doDelete}
              >
                Delete now
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setConfirmDelete(false)}>
                Keep my data
              </button>
            </div>
          </div>
        )}
      </Bay>

      <p className="text-[12px] faint">
        Storage keys in use: {Object.values(KEYS).join(" · ")}
      </p>
    </div>
  );
}
