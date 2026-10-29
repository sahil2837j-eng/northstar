import { useEffect, useRef, useState, type FC } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Gauge,
  HelpCircle,
  Landmark,
  Lightbulb,
  ListChecks,
  MapPin,
  RotateCcw,
  Sparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { HintDepth, LociSettings, Palace, ReviewGrade, ReviewResult, ReviewSession } from "../../lib/loci-types";
import { calculateNextDue, evaluateRecall, formatIntervalPreview, type RecallEvidence } from "../../lib/loci-algorithms";
import { useLociImage } from "./useLociImage";
import {
  curatorSettings,
  deterministicHint,
  fmtDayTime,
  hintAdvisory,
  planSession,
  reverseHint,
  shouldOfferStop,
  type StopOffer,
} from "../../lib/curator-core";
import { llmHint } from "../../lib/curator-llm";
import { ExplainPopover } from "./ExplainPopover";

interface Props {
  palace: Palace;
  settings: LociSettings;
  mode?: "first-walk" | "recall" | "reverse" | "random";
  onComplete: (session: ReviewSession, updatedPalace: Palace) => void;
  onExit: () => void;
}

const GRADES: { grade: ReviewGrade; key: string; label: string; cls: string; Icon: LucideIcon }[] = [
  { grade: "again", key: "1", label: "Again", cls: "loci-grade-again", Icon: RotateCcw },
  { grade: "hard", key: "2", label: "Hard", cls: "loci-grade-hard", Icon: Gauge },
  { grade: "good", key: "3", label: "Good", cls: "loci-grade-good", Icon: Check },
  { grade: "easy", key: "4", label: "Easy", cls: "loci-grade-easy", Icon: Zap },
];

const MODE_TITLE: Record<string, string> = {
  "first-walk": "Verification pass",
  recall: "Spatial recall",
  reverse: "Reverse recall — item to spot",
  random: "Random-order recall",
};

export const RecallSession: FC<Props> = ({ palace, settings, mode = "recall", onComplete, onExit }) => {
  const cs = curatorSettings(settings);
  const [plan] = useState(() => planSession(palace, mode, new Date(), cs.modules.sessionPlanner));
  const queue = plan.queue;
  const total = queue.length;
  const isReverse = mode === "reverse";
  const sortedRoute = [...palace.route].sort((a, b) => a.order - b.order);

  const [started, setStarted] = useState(mode === "first-walk" || !cs.modules.sessionPlanner);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [hintLevel, setHintLevel] = useState<HintDepth>(0);
  const [hints, setHints] = useState<string[]>([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [evidence, setEvidence] = useState<RecallEvidence | null>(null);
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [itemStart, setItemStart] = useState(Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [finished, setFinished] = useState(false);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [stopOffer, setStopOffer] = useState<StopOffer | null>(null);
  const [stopState, setStopState] = useState({ sinceIndex: 0, timeOffered: false });

  const inputRef = useRef<HTMLInputElement>(null);
  const firstGradeRef = useRef<HTMLButtonElement>(null);

  const item = queue[index];
  const locus = palace.route.find((l) => l.id === item?.locusId);
  const routePos = locus ? sortedRoute.findIndex((l) => l.id === locus.id) : 0;
  const target = isReverse ? locus?.spot ?? "" : item?.text ?? "";
  const cueVisible = hintLevel >= 4 || answered;
  const depth: HintDepth = revealed ? 5 : hintLevel;

  // Photos: the spot photo is a prompt in normal recall, but part of the answer
  // in reverse recall. The cue image is always part of the answer.
  const locusPhoto = useLociImage(locus?.photoId, !isReverse || answered);
  const cuePhoto = useLociImage(item?.cueImageId, cueVisible && !isReverse);

  useEffect(() => {
    setTyped("");
    setHintLevel(0);
    setHints([]);
    setAnswered(false);
    setRevealed(false);
    setEvidence(null);
    setItemStart(Date.now());
    if (started) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [index, started]);

  useEffect(() => {
    if (answered) window.setTimeout(() => firstGradeRef.current?.focus(), 30);
  }, [answered]);

  const begin = () => {
    setStarted(true);
    setStartedAt(new Date().toISOString());
  };

  const nextHint = async () => {
    if (!item || !locus || answered || hintBusy || hintLevel >= 4) return;
    // With the ladder switched off, a hint goes straight to the full cue (classic behaviour).
    const level = (cs.modules.hintLadder ? hintLevel + 1 : 4) as HintDepth;
    let text: string;
    if (level === 4) {
      text = isReverse ? `Landmark at that spot: ${locus.landmark}.` : `Your cue: “${item.imageCue}”`;
    } else if (isReverse) {
      text = reverseHint(level as 1 | 2 | 3, locus, routePos, sortedRoute.length);
    } else {
      text = deterministicHint(level as 1 | 2 | 3, item);
      if (settings.aiEnabled) {
        setHintBusy(true);
        const ai = await llmHint(level as 1 | 2 | 3, item.imageCue, item.text, settings);
        setHintBusy(false);
        if (ai) text = ai;
      }
    }
    setHints((h) => [...h, text]);
    setHintLevel(level);
    setAnnouncement(`Hint level ${level} of 5. ${text}`);
  };

  const check = () => {
    if (!item || !typed.trim() || answered) return;
    const ev = evaluateRecall(typed, target);
    setEvidence(ev);
    setAnswered(true);
    setAnnouncement(`Answer: ${target}. ${ev.note}. Choose a grade with keys 1 to 4.`);
  };

  const reveal = () => {
    if (!item || answered) return;
    setRevealed(true);
    setHintLevel(5);
    setAnswered(true);
    setEvidence(typed.trim() ? evaluateRecall(typed, target) : null);
    setAnnouncement(`Hint level 5 of 5. Answer revealed: ${target}. Choose a grade.`);
  };

  const dontKnow = () => {
    if (hintLevel < 4) void nextHint();
    else reveal();
  };

  const finish = (list: ReviewResult[]) => {
    const now = new Date();
    const byId = new Map(list.map((r) => [r.itemId, r]));
    const items = palace.items.map((it) => {
      const r = byId.get(it.id);
      return r ? { ...it, review: calculateNextDue(it.review, r.grade, now), needsReencode: false } : it;
    });
    const graded = items.filter((it) => byId.has(it.id)).map((it) => it.review.dueAt).sort();
    setNextDue(graded[0] ?? null);
    setFinished(true);
    onComplete(
      {
        id: `sess_${Math.random().toString(36).slice(2, 9)}`,
        palaceId: palace.id,
        startedAt,
        endedAt: now.toISOString(),
        mode,
        results: list,
      },
      { ...palace, items, updatedAt: now.toISOString() },
    );
  };

  const advance = (list: ReviewResult[]) => {
    if (index < total - 1) setIndex((i) => i + 1);
    else finish(list);
  };

  const grade = (g: ReviewGrade) => {
    if (!item || !answered) return;
    const result: ReviewResult = {
      itemId: item.id,
      grade: g,
      recalled: g !== "again",
      typed: typed.trim() || undefined,
      hintUsed: depth > 0,
      hintDepth: depth,
      ms: Date.now() - itemStart,
    };
    const next = [...results, result];
    setResults(next);
    setAnnouncement(`Graded ${g}.`);
    if (index < total - 1 && cs.modules.sessionPlanner) {
      const offer = shouldOfferStop(next, startedAt, new Date(), stopState);
      if (offer) {
        setStopOffer(offer);
        return;
      }
    }
    advance(next);
  };

  const exitSave = () => {
    if (results.length > 0 && !finished) finish(results);
    else onExit();
  };

  // Keys: Enter submits (form), H hint, R reveal, 1–4 grade. Letters are ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started || finished || stopOffer) return;
      if (e.key === "Escape") {
        e.preventDefault();
        exitSave();
        return;
      }
      if (answered) {
        const g = GRADES.find((x) => x.key === e.key);
        if (g) {
          e.preventDefault();
          grade(g.grade);
        }
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        void nextHint();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        reveal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const counts = (g: ReviewGrade) => results.filter((r) => r.grade === g).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div className="flex items-center justify-between border-b border-[var(--loci-border)] pb-4">
        <div>
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--loci-accent)]">
            <Brain size={14} aria-hidden="true" />
            <span>{MODE_TITLE[mode]}</span>
          </span>
          <h1 className="text-lg font-bold">{palace.name}</h1>
        </div>
        <button type="button" className="loci-btn loci-btn-ghost text-xs" onClick={exitSave} aria-label="Save and exit recall session">
          <X size={16} aria-hidden="true" />
          <span>Save &amp; Exit</span>
        </button>
      </div>

      {!started ? (
        <div className="loci-card space-y-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <ListChecks size={18} className="text-[var(--loci-accent)]" aria-hidden="true" />
            <span>Session plan</span>
            <span className="font-mono text-[10px] font-normal text-[var(--loci-text-muted)]">built-in planner</span>
          </h2>
          <p className="text-sm leading-relaxed text-[var(--loci-text)]">{plan.narration}</p>
          {total === 0 && <p className="text-xs text-[var(--loci-text-muted)]">There are no placed items to test in this palace.</p>}
          <div className="flex gap-2">
            <button type="button" className="loci-btn loci-btn-primary" onClick={begin} disabled={total === 0}>
              Begin
            </button>
            <button type="button" className="loci-btn loci-btn-ghost" onClick={onExit}>
              Cancel
            </button>
          </div>
        </div>
      ) : finished ? (
        <div className="loci-card space-y-5 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--loci-border)] text-[var(--loci-accent)]">
            <CheckCircle2 size={24} aria-hidden="true" />
          </div>
          <div>
            <h2 className="mb-1 text-2xl font-bold">Session saved</h2>
            <p className="text-xs text-[var(--loci-text-muted)]">
              Tested {results.length} of {total} planned item{total === 1 ? "" : "s"} in “{palace.name}”.
            </p>
          </div>
          <ul className="mx-auto grid max-w-md grid-cols-2 gap-2 border-y border-[var(--loci-border)] py-4 text-xs sm:grid-cols-4">
            {GRADES.map(({ grade: g, label, Icon }) => (
              <li key={g} className="flex flex-col items-center gap-1 rounded bg-[var(--loci-surface-2)] p-2">
                <Icon size={15} aria-hidden="true" />
                <strong className="font-mono text-lg">{counts(g)}</strong>
                <span className="text-[var(--loci-text-muted)]">{label}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--loci-text-muted)]">
            Answered cold: {results.filter((r) => (r.hintDepth ?? 0) === 0).length} · after hints:{" "}
            {results.filter((r) => (r.hintDepth ?? 0) > 0 && (r.hintDepth ?? 0) < 5).length} · revealed:{" "}
            {results.filter((r) => r.hintDepth === 5).length}
          </p>
          <p className="text-xs text-[var(--loci-text-muted)]">
            {nextDue ? `Next test of these items: ${fmtDayTime(nextDue)}.` : ""} Your grades set the next test dates.
          </p>
          <button type="button" className="loci-btn loci-btn-primary mx-auto" onClick={onExit}>
            Return to Palaces
          </button>
        </div>
      ) : item && locus ? (
        <>
          <div className="space-y-1.5" aria-label={`Progress: item ${index + 1} of ${total}`}>
            <div className="flex items-center justify-between text-xs text-[var(--loci-text-muted)]">
              <span>
                Item {index + 1} of {total}
              </span>
              <span>{Math.round(((index + 1) / total) * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full border border-[var(--loci-border)] bg-[var(--loci-surface-2)]">
              <div className="h-full bg-[var(--loci-accent)] transition-all duration-200" style={{ width: `${((index + 1) / total) * 100}%` }} />
            </div>
          </div>

          <div className="loci-card space-y-6">
            {isReverse ? (
              <div className="space-y-2">
                <span className="rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--loci-accent)]">
                  Item
                </span>
                <h2 className="text-2xl font-bold tracking-tight">{item.text}</h2>
                <p className="text-sm text-[var(--loci-text-muted)]">Which spot along the route holds this item?</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--loci-accent)]">
                    Spot #{routePos + 1}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[var(--loci-text-muted)]">
                    <MapPin size={12} aria-hidden="true" />
                    <span>{palace.location}</span>
                  </span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">{locus.spot}</h2>
                <p className="flex items-center gap-2 text-sm text-[var(--loci-text-muted)]">
                  <Landmark size={16} className="text-[var(--loci-accent)]" aria-hidden="true" />
                  <span>
                    <strong>Landmark:</strong> {locus.landmark}
                  </span>
                </p>
                {locus.sense && (
                  <p className="flex items-center gap-2 text-sm text-[var(--loci-text-muted)]">
                    <Sparkles size={16} className="text-[var(--loci-warn)]" aria-hidden="true" />
                    <span>
                      <strong>Sensory detail:</strong> {locus.sense}
                    </span>
                  </p>
                )}
                {locusPhoto && (
                  <div className="mt-3 max-h-56 overflow-hidden rounded-lg border border-[var(--loci-border)]">
                    <img src={locusPhoto} alt={locus.photoAlt === "decorative" ? "" : locus.photoAlt || `Photo of ${locus.spot}`} className="max-h-56 w-full object-cover" />
                  </div>
                )}
              </div>
            )}

            {!answered ? (
              <div className="space-y-4 border-t border-[var(--loci-border)] pt-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    check();
                  }}
                >
                  <label htmlFor="recall-answer" className="mb-1 block text-xs font-semibold">
                    {isReverse ? "Name the spot" : "What item was placed here?"}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="recall-answer"
                      ref={inputRef}
                      type="text"
                      className="flex-1 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2.5 text-sm text-[var(--loci-text)] focus:border-[var(--loci-focus)] focus:outline-none"
                      placeholder="Type what you recall..."
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      autoComplete="off"
                    />
                    <button type="submit" className="loci-btn loci-btn-primary text-xs" disabled={!typed.trim()}>
                      Check
                    </button>
                  </div>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button type="button" className="loci-btn loci-btn-ghost text-xs" onClick={dontKnow}>
                    <HelpCircle size={14} aria-hidden="true" />
                    <span>I don't know</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="loci-btn loci-btn-ghost text-xs" onClick={() => void nextHint()} disabled={hintLevel >= 4 || hintBusy}>
                      <Eye size={14} aria-hidden="true" />
                      <span>{hintBusy ? "Hint…" : `Hint (H) — level ${Math.min(hintLevel + 1, 4)} of 5`}</span>
                    </button>
                    <button type="button" className="loci-btn text-xs" onClick={reveal}>
                      <EyeOff size={14} aria-hidden="true" />
                      <span>Reveal answer (R)</span>
                    </button>
                  </div>
                </div>

                {hints.length > 0 && (
                  <ol className="space-y-1.5 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-3 text-xs" aria-label="Hints so far">
                    {hints.map((h, i) => (
                      <li key={i} className="flex gap-2">
                        <Lightbulb size={13} className="mt-0.5 shrink-0 text-[var(--loci-warn)]" aria-hidden="true" />
                        <span>
                          <span className="font-mono text-[var(--loci-text-muted)]">L{cs.modules.hintLadder ? i + 1 : 4}</span> {h}
                        </span>
                      </li>
                    ))}
                    {cuePhoto && (
                      <li>
                        <img src={cuePhoto} alt={item.cueImageAlt || "Cue image"} className="mt-1 max-h-40 rounded border border-[var(--loci-border)] object-cover" />
                      </li>
                    )}
                  </ol>
                )}
              </div>
            ) : (
              <div className="space-y-4 border-t border-[var(--loci-border)] pt-4">
                <div className="space-y-3 rounded-xl border-2 border-[var(--loci-accent)] bg-[var(--loci-surface-2)] p-4">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold uppercase tracking-wider text-[var(--loci-accent)]">{isReverse ? "Target spot" : "Target Item"}</span>
                    {evidence && (
                      <span className="rounded border border-[var(--loci-border)] bg-[var(--loci-surface)] px-2 py-0.5 font-mono text-xs">{evidence.note}</span>
                    )}
                  </div>
                  <p className="text-xl font-bold">{target}</p>
                  {isReverse && (
                    <p className="text-xs text-[var(--loci-text-muted)]">
                      Spot {routePos + 1} · landmark: {locus.landmark}
                    </p>
                  )}
                  {typed.trim() && (
                    <p className="text-xs text-[var(--loci-text-muted)]">
                      You typed: <strong className="text-[var(--loci-text)]">“{typed}”</strong> — shown as evidence; your grade decides.
                    </p>
                  )}
                  {!isReverse && (
                    <div className="border-t border-[var(--loci-border)] pt-2 text-xs text-[var(--loci-text-muted)]">
                      <span className="mb-0.5 block font-semibold text-[var(--loci-text)]">Your cue:</span>
                      <span className="italic leading-relaxed">“{item.imageCue}”</span>
                    </div>
                  )}
                  {cuePhoto && <img src={cuePhoto} alt={item.cueImageAlt || "Cue image"} className="max-h-48 w-full rounded-lg border border-[var(--loci-border)] object-cover" />}
                  {locusPhoto && isReverse && (
                    <img src={locusPhoto} alt={locus.photoAlt === "decorative" ? "" : locus.photoAlt || `Photo of ${locus.spot}`} className="max-h-48 w-full rounded-lg border border-[var(--loci-border)] object-cover" />
                  )}
                </div>

                <p className="flex items-start gap-1.5 rounded-lg border border-[var(--loci-border)] p-2.5 text-xs text-[var(--loci-text-muted)]">
                  <Lightbulb size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{hintAdvisory(depth)} You choose the grade.</span>
                </p>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--loci-text-muted)]">
                    <span>Self-grade (keys 1–4):</span>
                    <span className="flex items-center gap-1.5">
                      <span>What each grade does</span>
                      <ExplainPopover review={item.review} showGrades label="Explain what each grade does to this schedule" />
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {GRADES.map(({ grade: g, key, label, cls, Icon }, i) => {
                      const preview = formatIntervalPreview(g, item.review);
                      return (
                        <button
                          key={g}
                          ref={i === 0 ? firstGradeRef : undefined}
                          type="button"
                          className={`loci-btn ${cls} h-auto flex-col py-2.5`}
                          onClick={() => grade(g)}
                          aria-label={`${label}: next test in ${preview}`}
                        >
                          <span className="flex items-center gap-1.5 font-bold">
                            <Icon size={15} aria-hidden="true" />
                            <span>
                              {key}: {label}
                            </span>
                          </span>
                          <span className="font-mono text-[11px] opacity-80">{preview}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}

      {stopOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="stop-title">
          <div className="loci-card w-full max-w-md space-y-4">
            <h3 id="stop-title" className="flex items-center gap-2 text-base font-bold">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{stopOffer.reason === "time" ? "Time check" : "Accuracy check"}</span>
            </h3>
            <p className="text-xs leading-relaxed text-[var(--loci-text-muted)]">{stopOffer.text} Stopping or continuing is your call.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="loci-btn loci-btn-primary text-xs"
                onClick={() => {
                  setStopOffer(null);
                  finish(results);
                }}
              >
                Finish now
              </button>
              <button
                type="button"
                className="loci-btn loci-btn-ghost text-xs"
                onClick={() => {
                  setStopState({
                    sinceIndex: results.length,
                    timeOffered: stopState.timeOffered || stopOffer.reason === "time",
                  });
                  setStopOffer(null);
                  advance(results);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
