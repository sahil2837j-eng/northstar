import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/ctx";
import { Bay, Eyebrow, Field, Modal, Segmented, Stat } from "../components/ui";
import {
  CURRICULUM,
  PLACEMENT_IDS,
  TOPICS,
  exerciseById,
  exercisesInTopic,
  type CurriculumExercise,
} from "../lib/curriculum";
import * as P from "../lib/practice";
import { SANDBOX_NOTE, runHarness, selfCheck, type RunOutcome, type SelfCheckRow } from "../lib/sandbox";
import { dayKey, fmtHM, fmtMin } from "../lib/data";
import { extensionStatus, rid, writeKey, KEYS } from "../lib/store";
import { flyTo } from "../lib/motion";

const consolePlate = "images/console.jpg";
import type { Contract, PracticeMode, Session, Strictness } from "../lib/types";

const MODES: { value: PracticeMode; label: string }[] = [
  { value: "coding", label: "Coding" },
  { value: "recall", label: "Recall" },
  { value: "reading", label: "Reading" },
  { value: "user", label: "User-defined" },
];

const STRICT: { value: Strictness; label: string; note: string }[] = [
  { value: "gentle", label: "Gentle", note: "Skip takes one tap." },
  { value: "firm", label: "Firm", note: "Skip needs a reason of 12 meaningful characters." },
  {
    value: "strict",
    label: "Strict",
    note: "Skip needs a 60 second wait, or a sentence of 40 meaningful characters.",
  },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function scheduleLabel(c: Contract) {
  const days = c.days.map((d) => DAY_NAMES[d]).join(" ") || "no days";
  return `${days} · ${c.time} · ${c.duration} min`;
}

function nextTask(c: Contract | null, progress: ReturnType<typeof progressOf>) {
  if (!c) return null;
  if (c.mode === "coding") return P.nextExercise(progress);
  return null;
}

function progressOf(practice: { curriculum: any }) {
  return practice.curriculum as import("../lib/types").CurriculumProgress;
}

/* ============================================================
   Compass card
   ============================================================ */

export function PracticeCard() {
  const { practice, openPractice } = useApp();
  const c = practice.contract;
  const task = c?.mode === "coding" ? P.nextExercise(practice.curriculum) : null;
  const ext = extensionStatus();

  return (
    <Bay className="p-4">
      <Eyebrow right={c ? (c.active ? "active" : "paused") : "not set"}>Practice contract</Eyebrow>
      {c ? (
        <>
          <p className="text-[15px]" style={{ fontWeight: 500 }}>
            {c.title}
          </p>
          <p className="mono pt-1 text-[12px]" style={{ color: "var(--ns-craft)" }}>
            {scheduleLabel(c)}
          </p>
          <p className="pt-1 text-[13px] muted">
            {MODES.find((m) => m.value === c.mode)?.label}
            {task ? ` · next: ${task.ex.title}` : ""} · {STRICT.find((s) => s.value === c.strictness)?.label}
          </p>
        </>
      ) : (
        <p className="text-[13px] muted">
          Pre-chosen friction, one exact task, a timer and a factual ledger. It cannot force
          anything — all force is self-imposed.
        </p>
      )}
      <button className="btn mt-3 w-full" type="button" onClick={openPractice}>
        {c ? "Open contract & ledger" : "Set up a practice contract"}
      </button>
      <p className="pt-2 text-[12px] faint">
        {ext.present
          ? ext.detail
          : "Focus Tracker not detected — no alarms and no site blocking while this tab is closed."}
      </p>
    </Bay>
  );
}

/* ============================================================
   Contract setup + weekly ledger
   ============================================================ */

export function PracticeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { practice, updatePractice, toast } = useApp();
  const [tab, setTab] = useState<"setup" | "ledger" | "curriculum">("setup");
  const [draft, setDraft] = useState<Contract>(
    () =>
      practice.contract ?? {
        title: "Daily coding practice",
        days: [1, 3, 5],
        time: "07:00",
        duration: 20,
        mode: "coding",
        strictness: "firm",
        grace: 15,
        notify: true,
        chime: true,
        fullscreen: true,
        extension: false,
        restricted: [],
        commitment: "",
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
  );
  const [confirmRaise, setConfirmRaise] = useState(false);
  const [check, setCheck] = useState<SelfCheckRow[]>([]);
  const [checking, setChecking] = useState(false);
  const ext = extensionStatus();

  useEffect(() => {
    if (open && practice.contract) setDraft(practice.contract);
  }, [open, practice.contract]);

  const current = practice.contract;
  const nextAt = current ? P.nextScheduled(current).toISOString() : undefined;
  const lowering = current
    ? P.loweringTakesEffectNextDay(current.strictness, draft.strictness, nextAt)
    : false;
  const raising =
    current && STRICT.findIndex((s) => s.value === draft.strictness) > STRICT.findIndex((s) => s.value === current.strictness);

  const save = () => {
    if (!draft.days.length) {
      toast("Pick at least one day of week.", "plain");
      return;
    }
    if (raising && !confirmRaise) {
      toast("Raising strictness needs an explicit confirmation.", "plain");
      return;
    }
    const next: Contract = { ...draft, updatedAt: new Date().toISOString() };
    updatePractice((p) => ({
      ...p,
      contract: next,
      ledger: [
        ...p.ledger,
        P.ledgerEvent(current ? "contract_updated" : "contract_created", {
          note: `${scheduleLabel(next)} · ${next.strictness} · ${next.mode}`,
        }),
      ],
    }));
    writeKey(KEYS.contract, next);
    if (next.notify) P.requestNotificationPermission();
    toast("Contract saved. Effective from the next local day for any lowering.", "lit");
    setConfirmRaise(false);
    onClose();
  };

  const runCheck = async () => {
    setChecking(true);
    setCheck([]);
    const sample = TOPICS.map((t) => exercisesInTopic(t.id)[0]).filter(Boolean) as CurriculumExercise[];
    const rows = await selfCheck(sample, (r) => setCheck((prev) => [...prev, r]));
    const ok = rows.every((r) => r.ok);
    toast(
      ok
        ? `Harness check: ${rows.length}/${rows.length} exercises verified.`
        : `Harness check: ${rows.filter((r) => r.ok).length}/${rows.length} verified — see rows below.`,
      ok ? "lit" : "plain",
    );
    setChecking(false);
  };

  const week = P.weekCounts(practice.ledger);

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Compass · practice"
      title="Practice contract"
      wide
      footer={
        tab === "setup" ? (
          <>
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="button" onClick={save}>
              Save contract
            </button>
          </>
        ) : (
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      <Segmented
        label="Practice sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: "setup", label: "Setup" },
          { value: "ledger", label: "Weekly ledger" },
          { value: "curriculum", label: "Curriculum & placement" },
        ]}
      />

      {tab === "setup" ? (
        <div className="space-y-5 pt-4">
          <Field label="Practice goal" hint="Shown on the start card.">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="eyebrow block pb-1.5">Days of week</span>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((n, i) => (
                  <button
                    key={n}
                    type="button"
                    className="chip"
                    data-on={draft.days.includes(i)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        days: draft.days.includes(i)
                          ? draft.days.filter((d) => d !== i)
                          : [...draft.days, i].sort(),
                      })
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Local start time">
                <input
                  type="time"
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                />
              </Field>
              <Field label="Grace (min)">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={draft.grace}
                  onChange={(e) => setDraft({ ...draft, grace: Number(e.target.value) || 0 })}
                />
              </Field>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="eyebrow block pb-1.5">Duration</span>
              <Segmented
                label="Duration"
                value={String(draft.duration)}
                onChange={(v) => setDraft({ ...draft, duration: Number(v) as 10 | 20 | 25 })}
                options={[
                  { value: "10", label: "10 min" },
                  { value: "20", label: "20 min" },
                  { value: "25", label: "25 min" },
                ]}
              />
            </div>
            <div>
              <span className="eyebrow block pb-1.5">Practice mode</span>
              <Segmented
                label="Practice mode"
                value={draft.mode}
                onChange={(v) => setDraft({ ...draft, mode: v })}
                options={MODES}
              />
              {draft.mode === "user" && (
                <input
                  className="mt-2"
                  placeholder="Name your own mode, e.g. Arabic reading"
                  value={draft.modeLabel ?? ""}
                  onChange={(e) => setDraft({ ...draft, modeLabel: e.target.value })}
                />
              )}
            </div>
          </div>

          <div>
            <span className="eyebrow block pb-1.5">Strictness — chosen in advance</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRICT.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="bay bay-hover p-3 text-left"
                  data-on={draft.strictness === s.value}
                  style={{
                    borderColor:
                      draft.strictness === s.value ? "var(--ns-north)" : "var(--ns-line)",
                  }}
                  onClick={() => setDraft({ ...draft, strictness: s.value })}
                >
                  <div className="text-[14px]" style={{ fontWeight: 600 }}>
                    {s.label}
                  </div>
                  <div className="pt-1 text-[12px] muted">{s.note}</div>
                </button>
              ))}
            </div>
            {lowering && (
              <p className="pt-2 text-[12px]" style={{ color: "var(--ns-warn)" }}>
                Lowering strictness takes effect the next local day, not now.
              </p>
            )}
            {raising && (
              <label className="mt-2 flex items-center gap-2 text-[12px] muted">
                <input
                  type="checkbox"
                  style={{ width: 16 }}
                  checked={confirmRaise}
                  onChange={(e) => setConfirmRaise(e.target.checked)}
                />
                I understand raising strictness applies immediately.
              </label>
            )}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] px-3 py-2.5">
            <span className="text-[14px]">
              Contract enabled
              <span className="block text-[12px] muted">
                A normal change of state takes effect the next local day. Emergency pause below is
                immediate and logged.
              </span>
            </span>
            <input
              type="checkbox"
              style={{ width: 16 }}
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["notify", "Browser notification"],
                ["chime", "Soft chime at start time"],
                ["fullscreen", "Full-screen start card"],
                ["extension", "Focus Tracker integration"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] px-3 py-2.5"
              >
                <span className="text-[14px]">{label}</span>
                <input
                  type="checkbox"
                  style={{ width: 16 }}
                  checked={Boolean(draft[key])}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                />
              </label>
            ))}
          </div>

          <Field
            label="Optional restricted sites (Focus Tracker)"
            hint="Comma separated. Only applied by the extension, only with your permission, and always lifted at the expiry time."
          >
            <input
              value={draft.restricted.join(", ")}
              placeholder="youtube.com, anime.example"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  restricted: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>

          <Field label="Commitment sentence" hint="Edited freely on the start card.">
            <input
              value={draft.commitment}
              placeholder={`I will ${draft.title.toLowerCase()} in ${draft.duration} minutes.`}
              onChange={(e) => setDraft({ ...draft, commitment: e.target.value })}
            />
          </Field>

          <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3">
            <div className="eyebrow pb-2">Extension status — honest</div>
            <p className="text-[13px] muted">{ext.detail}</p>
            <p className="pt-2 text-[12px] faint">
              {ext.present
                ? "Schedule is mirrored to the extension so alarms survive this tab closing."
                : "NorthStar cannot wake itself, cannot schedule alarms while closed, and cannot block sites."}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3">
            <div className="flex items-center justify-between gap-3 pb-2">
              <div className="eyebrow">Sandbox harness self-check</div>
              <button className="btn btn-sm" type="button" onClick={runCheck} disabled={checking}>
                {checking ? "Checking…" : "Run on one exercise per topic"}
              </button>
            </div>
            <p className="pb-2 text-[12px] faint">{SANDBOX_NOTE}</p>
            {check.length > 0 && (
              <ul className="mono space-y-1 text-[12px]">
                {check.map((r) => (
                  <li key={r.id} style={{ color: r.ok ? "var(--ns-ok)" : "var(--ns-gap)" }}>
                    {r.ok ? "✓" : "✗"} {r.title} — reference {r.refPassed}/{r.refTotal}, anti-solutions
                    stopped {r.antiStopped}/{r.antiTotal}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ns-line)] p-3">
            <span className="text-[13px] muted">
              Emergency pause stops blocks now and is logged as a plain fact.
            </span>
            <button
              className="btn btn-sm"
              type="button"
              style={{ borderColor: "var(--ns-gap)", color: "var(--ns-warn)" }}
              onClick={() => {
                updatePractice((p) => ({
                  ...p,
                  contract: p.contract ? { ...p.contract, active: false } : null,
                  ledger: [...p.ledger, P.ledgerEvent("overridden", { note: "Emergency pause" })],
                }));
                toast("Emergency pause logged. Normal disable applies next local day.", "plain");
              }}
            >
              Emergency pause
            </button>
          </div>
        </div>
      ) : tab === "ledger" ? (
        <div className="space-y-5 pt-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              ["Committed", week.committed, "var(--ns-text)"],
              ["Started", week.started, "var(--ns-north)"],
              ["Passing", week.completedPass, "var(--ns-ok)"],
              ["Tests failed", week.testsFailed, "var(--ns-warn)"],
              ["Partial", week.partial, "var(--ns-lit)"],
              ["Rescheduled", week.rescheduled, "var(--ns-muted)"],
              ["Skipped", week.skipped, "var(--ns-muted)"],
              ["Missed", week.missed, "var(--ns-muted)"],
              ["Overrides", week.overridden, "var(--ns-gap)"],
              ["Unverified", week.completedUnverified, "var(--ns-linked)"],
            ].map(([label, value, tone]) => (
              <div key={label as string}>
                <div className="mono text-[20px]" style={{ color: tone as string }}>
                  {String(value)}
                </div>
                <div className="eyebrow pt-1">{label}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="eyebrow pb-2">Skip reasons this week — facts only</div>
            {week.skipReasons.length ? (
              <ul className="flex flex-wrap gap-2">
                {week.skipReasons.map((r) => (
                  <li key={r.reason} className="chip" style={{ pointerEvents: "none" }}>
                    {r.count}× {r.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] faint">No skips recorded in the last 7 days.</p>
            )}
          </div>

          <div>
            <div className="eyebrow pb-2">Ledger — append only ({practice.ledger.length})</div>
            <div className="scroll-thin max-h-72 space-y-1 overflow-y-auto pr-1">
              {[...practice.ledger]
                .reverse()
                .slice(0, 60)
                .map((e) => (
                  <div
                    key={e.id}
                    className="mono flex items-baseline gap-3 border-b border-[var(--ns-line)] py-1.5 text-[12px]"
                  >
                    <span className="faint">{new Date(e.ts).toLocaleString()}</span>
                    <span style={{ color: "var(--ns-north)" }}>{P.LEDGER_LABELS[e.type]}</span>
                    {e.note ? <span className="muted truncate">{e.note}</span> : null}
                  </div>
                ))}
              {!practice.ledger.length && (
                <p className="text-[13px] faint">Nothing recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <CurriculumPanel />
      )}
    </Modal>
  );
}

/* ---------------- curriculum & placement ---------------- */

function CurriculumPanel() {
  const { practice, updatePractice, toast } = useApp();
  const [step, setStep] = useState<"idle" | "run" | "done">("idle");
  const [idx, setIdx] = useState(0);
  const [code, setCode] = useState("");
  const [run, setRun] = useState<RunOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const ex = exerciseById(PLACEMENT_IDS[idx]);
  const progress = practice.curriculum;
  const placed = progress.placementDone;
  const next = P.nextExercise(progress);

  const start = () => {
    const first = exerciseById(PLACEMENT_IDS[0])!;
    setStep("run");
    setIdx(0);
    setCode(first.starter);
    setRun(null);
  };

  const submit = async () => {
    if (!ex) return;
    setBusy(true);
    const out = await runHarness(ex, code);
    setRun(out);
    setBusy(false);
    const pass = !out.timedOut && out.cases.length > 0 && out.cases.every((c) => c.pass);
    updatePractice((p) => ({
      ...p,
      curriculum: { ...P.applyAttempt(p.curriculum, ex.topic, { pass, hints: 0 }), placedAt: new Date().toISOString() },
    }));
    if (idx + 1 >= PLACEMENT_IDS.length) {
      updatePractice((p) => ({ ...p, curriculum: { ...p.curriculum, placementDone: true } }));
      setStep("done");
      toast("Placement recorded. Weak topics are seeded for the next block.", "lit");
    } else {
      const nextEx = exerciseById(PLACEMENT_IDS[idx + 1])!;
      setIdx(idx + 1);
      setCode(nextEx.starter);
      setRun(null);
    }
  };

  const weak = TOPICS.filter((t) => progress.topics[t.id]?.state === "weak").map((t) => t.name);

  return (
    <div className="space-y-5 pt-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="exercises in bank" value={String(CURRICULUM.length)} />
        <Stat label="topics" value={String(TOPICS.length)} tone="var(--ns-north)" />
        <Stat label="placement" value={placed ? "done" : "not taken"} tone={placed ? "var(--ns-ok)" : "var(--ns-muted)"} />
      </div>

      {!placed && step === "idle" && (
        <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-4">
          <div className="eyebrow pb-2">Placement check — {PLACEMENT_IDS.length} questions</div>
          <p className="text-[14px] muted">
            Spans early to later topics with arrays and closures weighted, as coding goals need. Misses
            seed weak topics. It is an estimate until real attempts arrive — hidden tests ship to this
            browser and can be inspected in DevTools.
          </p>
          <button className="btn btn-primary mt-3" type="button" onClick={start}>
            Start placement
          </button>
        </div>
      )}

      {step === "run" && ex && (
        <div className="space-y-3 rounded-xl border border-[var(--ns-line-bright)] p-4">
          <div className="flex items-center justify-between">
            <div className="eyebrow">
              Question {idx + 1} / {PLACEMENT_IDS.length} · {P.topicLabel(ex.topic)}
            </div>
            <span className="mono text-[11px] faint">hidden tests</span>
          </div>
          <p className="text-[15px]" style={{ fontWeight: 500 }}>
            {ex.title}
          </p>
          <p className="text-[14px] muted">{ex.prompt}</p>
          <p className="mono text-[12px]" style={{ color: "var(--ns-linked)" }}>
            {ex.example}
          </p>
          <textarea
            rows={9}
            spellCheck={false}
            className="mono"
            style={{ fontSize: 13, lineHeight: 1.5 }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label={`Solution for ${ex.title}`}
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn" type="button" disabled={busy} onClick={submit}>
              {busy ? "Running…" : idx + 1 >= PLACEMENT_IDS.length ? "Run & finish" : "Run & next"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setStep("idle");
                setRun(null);
              }}
            >
              Stop placement
            </button>
          </div>
          {run && (
            <ul className="mono space-y-1 text-[12px]">
              {run.cases.map((c) => (
                <li key={c.name}>
                  <span style={{ color: c.pass ? "var(--ns-ok)" : "var(--ns-gap)" }}>{c.pass ? "✓" : "✗"}</span>{" "}
                  <span className="muted">{c.name}</span>
                </li>
              ))}
              {run.timedOut && <li style={{ color: "var(--ns-warn)" }}>Timed out after 5 seconds.</li>}
            </ul>
          )}
          <p className="text-[12px] faint">
            Tests show whether this function passed these cases. They do not prove authorship or
            learning.
          </p>
        </div>
      )}

      {step === "done" && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--ns-linked)" }}>
          <div className="eyebrow pb-2" style={{ color: "var(--ns-linked)" }}>
            Placement complete
          </div>
          <p className="text-[14px] muted">
            {weak.length
              ? `Seeded weak topics: ${weak.join(", ")}.`
              : "No weak topic seeded — every placement answer passed. States still change as real attempts arrive."}
          </p>
          <button className="btn btn-ghost btn-sm mt-3" type="button" onClick={() => setStep("idle")}>
            Re-read the panel
          </button>
        </div>
      )}

      <div>
        <div className="eyebrow pb-2">Mastery by topic — 1 / 3 / 7 day spaced recall</div>
        <div className="space-y-1.5">
          {TOPICS.map((t) => {
            const s = progress.topics[t.id];
            const state = s?.state ?? "untested";
            const tone =
              state === "solid"
                ? "var(--ns-ok)"
                : state === "weak"
                  ? "var(--ns-gap)"
                  : state === "review_due"
                    ? "var(--ns-warn)"
                    : state === "untested"
                      ? "var(--ns-faint)"
                      : "var(--ns-north)";
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 border-b border-[var(--ns-line)] py-2 last:border-0"
              >
                <span className="mono w-5 text-[11px] faint">{t.order}</span>
                <span className="text-[14px]" style={{ minWidth: 180 }}>
                  {t.name}
                </span>
                <span className="mono text-[12px]" style={{ color: tone }}>
                  {state.replace(/_/g, " ")}
                </span>
                <span className="mono text-[11px] faint">
                  {s?.attempts.length ?? 0} attempts
                </span>
                <span className="mono ml-auto text-[11px] faint">
                  {P.nextRecallLabel(progress, t.id) ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-4">
        <div className="eyebrow pb-2">Next scheduled task — resolver</div>
        <p className="text-[15px]" style={{ fontWeight: 500 }}>
          {next.ex.title} <span className="mono text-[12px] faint">({P.topicLabel(next.ex.topic)})</span>
        </p>
        <p className="pt-1 text-[13px] muted">{next.reason}</p>
        <p className="pt-2 text-[14px]">{next.ex.prompt}</p>
        <p className="mono pt-1.5 text-[12px]" style={{ color: "var(--ns-linked)" }}>
          {next.ex.example}
        </p>
        <p className="pt-2 text-[12px] faint">
          Adaptation: 0 hints and a pass moves on, 1–2 hints stay in topic, 3–4 hints or a fail go
          easier within the topic. Hint count is logged with every attempt.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   Runtime: due check, start card, session
   ============================================================ */

export function PracticeRuntime() {
  const app = useApp();
  const { practice, updatePractice } = app;
  const [invite, setInvite] = useState<{ session: Session; missed: boolean } | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const flashed = useRef<Set<string>>(new Set());
  const stopFlash = useRef<null | (() => void)>(null);

  useEffect(() => {
    const check = () => {
      const c = practice.contract;
      if (!c || !c.active) return;
      const at = P.scheduledToday(c, new Date());
      if (!at) return;
      const iso = at.toISOString();
      const existing = practice.sessions.find((s) => s.scheduledAt === iso);
      const now = Date.now();

      if (existing) {
        if (existing.snoozedUntil && +new Date(existing.snoozedUntil) > now) return;
        if (existing.status === "ready" || existing.status === "missed") {
          setInvite({ session: existing, missed: existing.status === "missed" });
        }
        return;
      }

      const graceEnd = at.getTime() + c.grace * 60000;
      if (now > graceEnd) {
        const session: Session = {
          id: rid(),
          date: dayKey(at),
          scheduledAt: iso,
          status: "missed",
          lastKnownElapsedMs: 0,
          snoozes: 0,
          hintsUsed: 0,
          exerciseId: P.nextExercise(practice.curriculum).ex.id,
        };
        updatePractice((p) => ({
          ...p,
          sessions: [...p.sessions, session],
          ledger: [...p.ledger, P.ledgerEvent("missed", { sessionId: session.id, note: at.toLocaleTimeString() })],
        }));
        setInvite({ session, missed: true });
        return;
      }
      if (now >= at.getTime()) {
        const session: Session = {
          id: rid(),
          date: dayKey(at),
          scheduledAt: iso,
          status: "ready",
          lastKnownElapsedMs: 0,
          snoozes: 0,
          hintsUsed: 0,
          exerciseId: P.nextExercise(practice.curriculum).ex.id,
        };
        updatePractice((p) => ({
          ...p,
          sessions: [...p.sessions, session],
          ledger: [...p.ledger, P.ledgerEvent("invited", { sessionId: session.id, note: at.toLocaleTimeString() })],
        }));
        if (!flashed.current.has(iso)) {
          flashed.current.add(iso);
          P.playChime(c.chime);
          stopFlash.current?.();
          stopFlash.current = P.flashTabTitle(30000);
          P.showBrowserNotification("NorthStar", `Practice block due now: ${c.title}`);
        }
        setInvite({ session, missed: false });
      }
    };
    check();
    const id = window.setInterval(check, 15000);
    return () => window.clearInterval(id);
  }, [practice.contract, practice.sessions, updatePractice]);

  useEffect(() => () => stopFlash.current?.(), []);

  const patchSession = (id: string, fn: (s: Session) => Session) =>
    updatePractice((p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === id ? fn(s) : s)) }));

  const log = (type: Parameters<typeof P.ledgerEvent>[0], sessionId?: string, note?: string) =>
    updatePractice((p) => ({ ...p, ledger: [...p.ledger, P.ledgerEvent(type, { sessionId, note })] }));

  const openSession = practice.sessions.find((s) => s.id === openSessionId) ?? null;
  const liveSession =
    practice.sessions.find((s) =>
      ["active", "paused", "awaiting_evidence"].includes(s.status),
    ) ?? null;

  return (
    <>
      {liveSession && !openSession && !invite && (
        <button
          type="button"
          className="btn fixed bottom-5 left-5 z-[55] shadow-lg"
          style={{ borderColor: "var(--ns-craft)", background: "rgba(11,11,16,.95)" }}
          onClick={() => setOpenSessionId(liveSession.id)}
        >
          ◷ Practice session open — return
        </button>
      )}
      {invite && !openSession && (
        <StartCard
          invite={invite}
          onClose={() => setInvite(null)}
          onStart={(sessionId) => {
            setInvite(null);
            setOpenSessionId(sessionId);
          }}
          patchSession={patchSession}
          log={log}
        />
      )}
      {openSession && (
        <SessionView
          session={openSession}
          onClose={() => setOpenSessionId(null)}
          patchSession={patchSession}
          log={log}
        />
      )}
    </>
  );
}

/* ---------------- start card ---------------- */

function StartCard({
  invite,
  onClose,
  onStart,
  patchSession,
  log,
}: {
  invite: { session: Session; missed: boolean };
  onClose: () => void;
  onStart: (id: string) => void;
  patchSession: (id: string, fn: (s: Session) => Session) => void;
  log: (t: any, id?: string, note?: string) => void;
}) {
  const { practice, updatePractice, toast } = useApp();
  const c = practice.contract;
  useEffect(() => {
    if (!c) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);
  if (!c) return null;
  const ex = exerciseById(invite.session.exerciseId) ?? CURRICULUM[0];
  const [commitment, setCommitment] = useState(
    c.commitment || `I will ${ex.title} in ${c.duration} minutes.`,
  );
  const [skipOpen, setSkipOpen] = useState(false);
  const scheduled = new Date(invite.session.scheduledAt);

  /* border-glow companion to the tab-title flash — capped at 30 seconds, then static */
  const [glowing, setGlowing] = useState(!invite.missed);
  useEffect(() => {
    if (!glowing) return;
    const t = window.setTimeout(() => setGlowing(false), 30000);
    return () => window.clearTimeout(t);
  }, [glowing]);

  const reschedule = () => {
    const next = P.nextScheduled(c, new Date());
    patchSession(invite.session.id, (s) => ({
      ...s,
      status: "rescheduled",
      scheduledAt: next.toISOString(),
      date: dayKey(next),
    }));
    log("rescheduled", invite.session.id, `moved to ${next.toLocaleString()}`);
    toast(`Rescheduled to ${next.toLocaleString()}`, "plain");
    onClose();
  };

  const snooze = () => {
    if (invite.session.snoozes >= 2) {
      toast("Two snoozes already used for this block.", "plain");
      return;
    }
    const n = invite.session.snoozes + 1;
    patchSession(invite.session.id, (s) => ({
      ...s,
      snoozes: n,
      snoozedUntil: new Date(Date.now() + 10 * 60000).toISOString(),
      status: "ready",
    }));
    log("snoozed", invite.session.id, `snooze ${n} of 2`);
    toast(`Snoozed 10 minutes — ${2 - n} left.`, "plain");
    onClose();
  };

  const emergency = () => {
    log("overridden", invite.session.id, "Emergency override from start card");
    patchSession(invite.session.id, (s) => ({ ...s, status: "overridden" }));
    toast("Emergency override logged as a plain fact. Nothing is punished.", "plain");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Practice block">
      <div className="fade-in absolute inset-0 bg-black/85" />
      <div
        className={`panel-in relative w-full max-w-lg overflow-hidden rounded-2xl border ${glowing ? "invite-glow" : ""}`}
        style={{ borderColor: "var(--ns-line-bright)", background: "var(--ns-card)" }}
      >
        <div className="relative h-36 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(120deg, #14141B, #0B0B10 60%)" }}
          />
          <img
            src={consolePlate}
            alt=""
            aria-hidden="true"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="relative h-full w-full object-cover"
            style={{ opacity: 0.75 }}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(7,7,10,.35), rgba(24,24,32,.98))" }}
          />
          <div className="absolute bottom-3 left-5">
            <div className="eyebrow" style={{ color: "var(--ns-lit)" }}>
              {invite.missed ? "Welcome back" : "Practice now"} · due {scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <h2 className="plate text-2xl">{c.title}</h2>
            <p className="mono pt-1 text-[12px]" style={{ color: "var(--ns-craft)" }}>
              {c.duration} min · {MODES.find((m) => m.value === c.mode)?.label} ·{" "}
              {STRICT.find((s) => s.value === c.strictness)?.label}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3">
            <div className="eyebrow pb-1">Exact exercise</div>
            <p className="text-[15px]" style={{ fontWeight: 500 }}>
              {ex.title}
            </p>
            <p className="pt-1 text-[13px] muted">{ex.prompt}</p>
            <p className="mono pt-1.5 text-[12px]" style={{ color: "var(--ns-linked)" }}>
              {ex.example}
            </p>
          </div>

          <Field label="Commitment" hint="Editable. It is your sentence, not ours.">
            <input value={commitment} onChange={(e) => setCommitment(e.target.value)} />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                updatePractice((p) => ({
                  ...p,
                  contract: { ...c, commitment },
                }));
                patchSession(invite.session.id, (s) => ({
                  ...s,
                  status: "active",
                  startedAt: new Date().toISOString(),
                }));
                log("started", invite.session.id, commitment);
                onStart(invite.session.id);
              }}
            >
              Start {c.duration} min
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                updatePractice((p) => ({
                  ...p,
                  contract: { ...c, commitment, duration: 10 },
                }));
                patchSession(invite.session.id, (s) => ({
                  ...s,
                  status: "active",
                  startedAt: new Date().toISOString(),
                }));
                log("started", invite.session.id, "smaller block: 10 min");
                onStart(invite.session.id);
              }}
            >
              Smaller block (10 min)
            </button>
            <button className="btn btn-ghost" type="button" onClick={reschedule}>
              Reschedule
            </button>
            <button className="btn btn-ghost" type="button" onClick={snooze} disabled={invite.session.snoozes >= 2}>
              Snooze 10 min ({2 - invite.session.snoozes} left)
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setSkipOpen(true)}>
              Skip
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              style={{ borderColor: "var(--ns-gap)", color: "var(--ns-warn)" }}
              onClick={emergency}
            >
              Emergency override
            </button>
          </div>

          {skipOpen && (
            <SkipFlow
              strictness={c.strictness}
              onSkip={(reason) => {
                patchSession(invite.session.id, (s) => ({ ...s, status: "skipped", reason }));
                log("skipped", invite.session.id, reason || "no reason given");
                toast("Skip recorded as a plain fact.", "plain");
                onClose();
              }}
              onCancel={() => setSkipOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function SkipFlow({
  strictness,
  onSkip,
  onCancel,
}: {
  strictness: Strictness;
  onSkip: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [waited, setWaited] = useState(0);
  const [emergency, setEmergency] = useState(false);

  useEffect(() => {
    if (strictness !== "strict") return;
    const id = window.setInterval(() => setWaited((w) => Math.min(60000, w + 500)), 500);
    return () => window.clearInterval(id);
  }, [strictness]);

  const gate = P.skipGate(strictness, { reason, waitedMs: waited });
  const pct = Math.min(100, (waited / 60000) * 100);

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--ns-line-bright)" }}>
      <div className="eyebrow pb-2">Skip — {strictness}</div>
      {gate.required !== "none" && (
        <>
          <textarea
            rows={2}
            value={reason}
            placeholder={
              gate.required === "reason"
                ? "One line: why are you skipping? (12 meaningful characters)"
                : "Or write a real sentence (40 meaningful characters)"
            }
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mono pt-1 text-[11px] faint">
            {gate.count ?? 0}
            {gate.need ? ` / ${gate.need}` : ""} meaningful characters
          </div>
        </>
      )}
      {strictness === "strict" && (
        <div className="pt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ns-bg-2)]">
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--ns-north)" }} />
          </div>
          <div className="mono pt-1 text-[11px] faint">
            {pct < 100 ? `waiting ${(60000 - waited) / 1000}s — or write the sentence` : "60 second wait complete"}
          </div>
        </div>
      )}
      {gate.message && (
        <p className="pt-2 text-[12px]" style={{ color: "var(--ns-warn)" }}>
          {gate.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-3">
        <button className="btn btn-sm" type="button" disabled={!gate.allowed} onClick={() => onSkip(reason.trim())}>
          Skip block
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          Keep it
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          style={{ borderColor: "var(--ns-gap)", color: "var(--ns-warn)" }}
          onClick={() => setEmergency(!emergency)}
        >
          Emergency override
        </button>
        {emergency && (
          <span className="mono self-center text-[11px]" style={{ color: "var(--ns-lit)" }}>
            available any time —{" "}
            <button type="button" className="underline" onClick={() => onSkip("emergency override")}>
              use it
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- session: timer + evidence ---------------- */

function SessionView({
  session,
  onClose,
  patchSession,
  log,
}: {
  session: Session;
  onClose: () => void;
  patchSession: (id: string, fn: (s: Session) => Session) => void;
  log: (t: any, id?: string, note?: string) => void;
}) {
  const { practice, updatePractice, toast, setPrefill, go } = useApp();
  const c = practice.contract;
  const ex = exerciseById(session.exerciseId) ?? CURRICULUM[0];
  const [now, setNow] = useState(() => new Date());
  const [hintsOpen, setHintsOpen] = useState(0);
  const [code, setCode] = useState(ex.starter);
  const [userTest, setUserTest] = useState("");
  const [run, setRun] = useState<RunOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [journal, setJournal] = useState<string | null>(null);
  const [linkGoal, setLinkGoal] = useState(true);
  const commitRef = useRef(0);

  const status = session.status;
  const awaiting = status === "awaiting_evidence";
  const done = [
    "submitted_pass",
    "submitted_fail",
    "submitted_unverified",
    "partial_no_artifact",
    "completed",
  ].includes(status);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
      commitRef.current++;
      if (commitRef.current % 5 === 0) {
        const elapsed = P.computeElapsed(session, new Date());
        /* commit the anchor as well as the total, otherwise the stretch would be counted twice */
        patchSession(session.id, (s) => ({
          ...s,
          lastKnownElapsedMs: elapsed,
          startedAt: s.status === "active" ? new Date().toISOString() : s.startedAt,
        }));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [session, patchSession]);

  /* reload / interruption recovery — elapsed always comes from timestamps */
  const durationMs = (c?.duration ?? 20) * 60000;
  useEffect(() => {
    if (status !== "active" && status !== "paused") return;
    const e = P.computeElapsed(session, new Date());
    if (e >= durationMs) {
      patchSession(session.id, (s) => ({
        ...s,
        status: "awaiting_evidence",
        lastKnownElapsedMs: e,
        endedAt: new Date().toISOString(),
      }));
      log("elapsed", session.id, `${Math.round(durationMs / 60000)} min elapsed`);
      toast("Time is up. Elapsed time is not completion — submit evidence.", "plain");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const elapsed = P.computeElapsed(session, now);
  if (!c) return null;
  const remaining = Math.max(0, durationMs - elapsed);
  const active = status === "active";
  const paused = status === "paused";

  const finishBlock = () => {
    const el = P.computeElapsed(session, new Date());
    patchSession(session.id, (s) => ({
      ...s,
      status: "awaiting_evidence",
      lastKnownElapsedMs: el,
      endedAt: new Date().toISOString(),
    }));
    log("elapsed", session.id, fmtMin(el));
  };

  const runTests = async () => {
    setBusy(true);
    const out = await runHarness(ex, code);
    setRun(out);
    setBusy(false);
    if (out.timedOut) toast("Timed out after 5 seconds. The parent page stayed responsive.", "plain");
  };

  const submitCoding = () => {
    const allPass = !!run && !run.timedOut && run.cases.length > 0 && run.cases.every((x) => x.pass);
    patchSession(session.id, (s) => ({
      ...s,
      status: allPass ? "submitted_pass" : "submitted_fail",
      testsPassed: allPass,
      evidence: code,
      userTest,
      hintsUsed,
    }));
    log("evidence_submitted", session.id, `${run?.cases.filter((x) => x.pass).length ?? 0}/${run?.cases.length ?? 0} cases`);
    log(allPass ? "tests_passed" : "tests_failed", session.id, ex.title);
    if (allPass) applyMastery(true);
    else applyMastery(false);
    setJournal(
      P.journalPrefill(ex.title, Math.max(1, Math.round(elapsed / 60000)), allPass ? "passed" : "needs work"),
    );
  };

  const hintsUsed = hintsOpen;
  const applyMastery = (pass: boolean) => {
    updatePractice((p) => ({
      ...p,
      curriculum: P.applyAttempt(p.curriculum, ex.topic, { pass, hints: hintsUsed }),
      prefs: { ...p.prefs, lastExerciseId: ex.id },
    }));
  };

  const submitAnswer = (kind: "unverified" | "partial") => {
    patchSession(session.id, (s) => ({
      ...s,
      status: kind === "partial" ? "partial_no_artifact" : "submitted_unverified",
      evidence: answer,
      hintsUsed,
    }));
    log(kind === "partial" ? "partial" : "evidence_submitted", session.id, answer.slice(0, 60));
    if (c.mode === "recall") applyMastery(answer.trim().length > 0);
    setJournal(
      P.journalPrefill(
        ex.title,
        Math.max(1, Math.round(elapsed / 60000)),
        kind === "partial" ? "partial" : "recorded",
      ),
    );
  };

  const complete = () => {
    patchSession(session.id, (s) => ({ ...s, status: "completed" as any }));
    log("completed", session.id, ex.title);
    toast("Block completed and recorded as a fact.", "lit");
  };

  const activeGoal = practice.contract?.goalId;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Practice session">
      <div className="fade-in absolute inset-0 bg-black/85" onClick={onClose} />
      <div
        className="panel-in scroll-thin relative max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border"
        style={{ borderColor: "var(--ns-line-bright)", background: "var(--ns-card)" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--ns-line)] bg-[var(--ns-card)] px-5 py-3">
          <div>
            <div className="eyebrow">Session · {P.topicLabel(ex.topic)}</div>
            <div className="plate text-xl">{ex.title}</div>
          </div>
          <div className="flex items-center gap-3">
            {/* progress ring — fraction from timestamps, redrawn at most once per second */}
            <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--ns-line)" strokeWidth="3" />
              <circle
                className="ring-fg"
                cx="26"
                cy="26"
                r="22"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                transform="rotate(-90 26 26)"
                stroke={remaining <= 60000 && !awaiting && !done ? "var(--ns-lit)" : "var(--ns-north)"}
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={
                  2 * Math.PI * 22 * (1 - Math.min(1, durationMs ? elapsed / durationMs : 0))
                }
              />
            </svg>
            <div className="text-right">
              <div
                className="mono text-[30px] leading-none"
                style={{ color: active ? "var(--ns-lit)" : paused ? "var(--ns-warn)" : "var(--ns-muted)" }}
              >
                {awaiting || done ? fmtHM(elapsed) : fmtHM(remaining)}
              </div>
              <div className="eyebrow pt-1">{awaiting || done ? "elapsed" : "remaining"}</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3">
            <div className="eyebrow pb-1">Exact task</div>
            <p className="text-[14px]">{ex.prompt}</p>
            <p className="mono pt-1.5 text-[12px]" style={{ color: "var(--ns-linked)" }}>
              {ex.example}
            </p>
          </div>

          {(active || paused || awaiting || done) && (
            <div className="flex flex-wrap gap-2">
              {active && (
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    const el = P.computeElapsed(session, new Date());
                    patchSession(session.id, (s) => ({
                      ...s,
                      status: "paused",
                      startedAt: undefined,
                      lastKnownElapsedMs: el,
                    }));
                    log("paused", session.id, fmtHM(el));
                  }}
                >
                  Pause
                </button>
              )}
              {paused && (
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    patchSession(session.id, (s) => ({ ...s, status: "active", startedAt: new Date().toISOString() }));
                    log("resumed", session.id);
                  }}
                >
                  Resume
                </button>
              )}
              {(active || paused) && (
                <>
                  <button className="btn btn-sm btn-primary" type="button" onClick={finishBlock}>
                    I am done — submit evidence
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    style={{ borderColor: "var(--ns-gap)", color: "var(--ns-warn)" }}
                    onClick={() => {
                      log("overridden", session.id, "Emergency override mid-session");
                      patchSession(session.id, (s) => ({ ...s, status: "overridden" }));
                      onClose();
                    }}
                  >
                    Emergency override
                  </button>
                </>
              )}
            </div>
          )}

          {/* hints */}
          {c.mode === "coding" && !done && (
            <div className="rounded-xl border border-[var(--ns-line)] p-3">
              <div className="flex items-center justify-between gap-3 pb-2">
                <div className="eyebrow">Hint ladder — {hintsUsed} used</div>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={hintsOpen >= 4}
                  onClick={() => setHintsOpen(Math.min(4, hintsOpen + 1))}
                >
                  Reveal hint {Math.min(4, hintsOpen + 1)}
                </button>
              </div>
              <ol className="space-y-1.5">
                {ex.hints.slice(0, hintsOpen).map((h, i) => (
                  <li key={i} className="text-[13px] muted">
                    <span className="mono pr-2" style={{ color: "var(--ns-north)" }}>
                      H{i + 1}
                    </span>
                    {h}
                  </li>
                ))}
                {!hintsOpen && <li className="text-[13px] faint">No hints revealed yet.</li>}
              </ol>
            </div>
          )}

          {/* evidence */}
          {!awaiting && !done && (
            <p className="text-[13px] faint">
              Timer runs from timestamps, so a reload keeps your session. Elapsed time alone is not
              completion — evidence decides that.
            </p>
          )}

          {awaiting && c.mode === "coding" && (
            <div className="space-y-3">
              <Field label="Your code" hint="Runs in a sandboxed worker. Network is blocked by CSP.">
                <textarea
                  rows={10}
                  spellCheck={false}
                  className="mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  style={{ fontSize: 13, lineHeight: 1.5 }}
                />
              </Field>
              <Field label="Your own test case (shown, not treated as proof)">
                <textarea
                  rows={2}
                  spellCheck={false}
                  className="mono"
                  placeholder={`assert ${ex.fn}(${ex.params.split(",")[0]?.trim() || "x"} /* … */)`}
                  value={userTest}
                  onChange={(e) => setUserTest(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button className="btn" type="button" onClick={runTests} disabled={busy}>
                  {busy ? "Running…" : "Run hidden tests"}
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!run}
                  onClick={submitCoding}
                >
                  Submit evidence
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => submitAnswer("partial")}>
                  Mark partial — no artifact
                </button>
              </div>
              {run && (
                <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3">
                  <div className="flex items-center justify-between pb-2">
                    <span className="eyebrow">Verdict</span>
                    <span className="mono text-[12px]" style={{ color: run.timedOut ? "var(--ns-warn)" : run.cases.every((x) => x.pass) ? "var(--ns-ok)" : "var(--ns-warn)" }}>
                      {run.timedOut ? "timeout" : `${run.cases.filter((x) => x.pass).length}/${run.cases.length} passed`}
                      {run.durationMs ? ` · ${run.durationMs} ms` : ""}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {run.cases.map((cs) => (
                      <li key={cs.name} className="mono flex gap-2 text-[12px]">
                        <span style={{ color: cs.pass ? "var(--ns-ok)" : "var(--ns-gap)" }}>
                          {cs.pass ? "✓" : "✗"}
                        </span>
                        <span className="muted">{cs.name}</span>
                        {cs.detail ? <span className="faint truncate">{cs.detail}</span> : null}
                      </li>
                    ))}
                    {run.error && <li className="mono text-[12px]" style={{ color: "var(--ns-warn)" }}>{run.error}</li>}
                  </ul>
                  <p className="pt-2 text-[12px] faint">
                    Tests show whether this function passed these cases. They do not prove authorship
                    or learning. Hidden tests ship to the browser and can be inspected in DevTools.
                  </p>
                </div>
              )}
            </div>
          )}

          {awaiting && c.mode !== "coding" && (
            <div className="space-y-3">
              <Field
                label={c.mode === "recall" ? "Recall answer — write it from memory" : "Evidence / artifact note"}
                hint="Stored locally. No correctness claim unless a deterministic check exists."
              >
                <textarea rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" type="button" onClick={() => submitAnswer("unverified")}>
                  Submit evidence
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => submitAnswer("partial")}>
                  Mark partial — no artifact
                </button>
              </div>
            </div>
          )}

          {/* submitted summary */}
          {done && (
            <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--ns-line-bright)" }}>
              <div className="flex items-center justify-between">
                <span className="eyebrow">Ledger status</span>
                <span className="mono text-[12px]" style={{ color: status === "submitted_fail" ? "var(--ns-warn)" : "var(--ns-ok)" }}>
                  {status.replace(/_/g, " ")}
                </span>
              </div>
              {c.mode === "coding" && run && (
                <ul className="mono space-y-1 text-[12px]">
                  {run.cases.map((cs) => (
                    <li key={cs.name}>
                      <span style={{ color: cs.pass ? "var(--ns-ok)" : "var(--ns-gap)" }}>
                        {cs.pass ? "✓" : "✗"}
                      </span>{" "}
                      <span className="muted">{cs.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[13px] faint">
                Tests show whether this function passed these cases. They do not prove authorship or
                learning.
              </p>
              <div className="flex flex-wrap gap-2">
                {status !== "completed" && (
                  <button className="btn btn-sm btn-primary" type="button" onClick={complete}>
                    Complete this block
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    patchSession(session.id, (s) => ({ ...s, status: "partial_no_artifact" }));
                    log("partial", session.id, "user marked partial");
                  }}
                >
                  Mark partial
                </button>
              </div>
            </div>
          )}

          {/* journal bridge */}
          {journal && (
            <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3">
              <div className="eyebrow pb-2">Log this session?</div>
              <p className="mono text-[13px] muted">{journal}</p>
              <p className="pt-2 text-[12px] faint">
                Nothing is saved until you press Save entry in Today. Nothing is auto-linked.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <label className="flex items-center gap-2 text-[12px] muted">
                  <input
                    type="checkbox"
                    style={{ width: 15 }}
                    checked={linkGoal}
                    onChange={(e) => setLinkGoal(e.target.checked)}
                  />
                  Link to active goal after saving
                </label>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={(e) => {
                    setPrefill(journal, linkGoal ? (activeGoal ?? practice.contract?.goalId) : undefined);
                    log("journal_prefill_created", session.id, ex.title);
                    const source = e.currentTarget;
                    onClose();
                    go("today");
                    /* star flight: result card → current hour on the day strip.
                       flyTo returns false (and we skip silently) when the strip is off-screen. */
                    window.setTimeout(() => {
                      const target = document.querySelector(`[data-hour="${new Date().getHours()}"]`);
                      flyTo(source, target, 500);
                    }, 350);
                    toast("Prefilled. Press Save entry when it is true.", "plain");
                  }}
                >
                  Fill Today capture
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setJournal(null)}>
                  Skip
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { nextTask, PLACEMENT_IDS };
