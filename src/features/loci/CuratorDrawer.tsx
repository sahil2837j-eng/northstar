import { useEffect, useState, type FC, type MouseEvent } from "react";
import { Cpu, PenTool, Stethoscope, X } from "lucide-react";
import type { LociState, Palace } from "../../lib/loci-types";
import {
  FINDING_LABELS,
  curatorSettings,
  loadAdvice,
  routeDoctor,
  type AiFinding,
  type FindingKind,
} from "../../lib/curator-core";
import {
  loadFindingsCache,
  mergeFindings,
  saveFindingsCache,
  setFindingStatus,
  userIntentFromEvent,
  type FindingsCache,
} from "../../lib/curator-proposals";
import { AI_UNAVAILABLE, phraseFinding } from "../../lib/curator-llm";
import { CueCriticCard } from "./CueCriticCard";

interface Props {
  open: boolean;
  onClose: () => void;
  state: LociState;
  initialPalaceId?: string;
  focusItemId?: string;
  onOpenEditor: (palace: Palace, view: "edit-route" | "place-items") => void;
  onStartReview: (palace: Palace) => void;
}

type FindingAction = { label: string; view?: "edit-route" | "place-items"; review?: boolean };
const ACTIONS: Record<FindingKind, FindingAction> = {
  CONFUSABLE_SPOTS: { label: "Open route editor", view: "edit-route" },
  LAPSE_CLUSTER: { label: "Open route editor", view: "edit-route" },
  SEMANTIC_INTERFERENCE: { label: "Open cue editor", view: "place-items" },
  CUE_COLLISION: { label: "Open cue editor", view: "place-items" },
  EASE_DECAY: { label: "Open cue editor", view: "place-items" },
  SERIAL_POSITION_SAG: { label: "Open cue editor", view: "place-items" },
  STALE_PALACE: { label: "Start review", review: true },
  PALACE_OVERLOAD: { label: "Acknowledge" },
};

const BADGE: Record<AiFinding["status"], string> = {
  proposed: "Proposed — not applied",
  accepted: "Accepted — opened for your edit",
  dismissed: "Dismissed",
};

/* The Curator drawer. Collapsed by default, opened by the user, never runs
   diagnostics on its own. Findings are cached; Accept opens an editor
   pre-filled and saves nothing. */
export const CuratorDrawer: FC<Props> = ({ open, onClose, state, initialPalaceId, focusItemId, onOpenEditor, onStartReview }) => {
  const active = state.palaces.filter((p) => !p.archived);
  const cs = curatorSettings(state.settings);
  const [palaceId, setPalaceId] = useState(initialPalaceId ?? active[0]?.id ?? "");
  const [tab, setTab] = useState<"doctor" | "critic">(focusItemId ? "critic" : "doctor");
  const [itemId, setItemId] = useState(focusItemId ?? "");
  const [cache, setCache] = useState<FindingsCache>(loadFindingsCache);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiOk, setAiOk] = useState<boolean | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialPalaceId) setPalaceId(initialPalaceId);
    setItemId(focusItemId ?? "");
    setTab(focusItemId ? "critic" : cs.modules.routeDoctor || cs.modules.loadAdvisor ? "doctor" : "critic");
    setCache(loadFindingsCache());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPalaceId, focusItemId]);

  if (!open) return null;

  const palace = active.find((p) => p.id === palaceId) ?? active[0];
  const findings = palace ? cache.findings[palace.id] ?? [] : [];
  const lastRun = palace ? cache.lastRun[palace.id] : undefined;
  const live = findings.filter((f) => f.status !== "dismissed");
  const dismissed = findings.filter((f) => f.status === "dismissed");
  const doctorOn = cs.modules.routeDoctor || cs.modules.loadAdvisor;

  const status = !state.settings.aiEnabled
    ? { dot: "stone", text: "AI off — built-in checks" }
    : aiOk === true
      ? { dot: "sage", text: `Local model responded (${state.settings.aiModel})` }
      : aiOk === false
        ? { dot: "rust", text: AI_UNAVAILABLE }
        : { dot: "stone", text: "Local model on — not used yet this visit" };

  const runDoctor = async () => {
    if (!palace || running) return;
    setRunning(true);
    setNotice(null);
    let fresh: AiFinding[] = cs.modules.routeDoctor ? routeDoctor(palace, state.sessions) : [];
    if (cs.modules.loadAdvisor) {
      const load = loadAdvice(palace);
      if (load) fresh = [...fresh, load];
    }
    if (state.settings.aiEnabled && fresh.length) {
      let failed = false;
      let usedAi = false;
      const phrased: AiFinding[] = [];
      for (const f of fresh.slice(0, 8)) {
        const out = await phraseFinding(f, state.settings);
        phrased.push(out.value);
        if (out.notice) failed = true;
        if (out.source === "ai") usedAi = true;
      }
      fresh = [...phrased, ...fresh.slice(8)];
      if (failed) {
        setAiOk(false);
        setNotice(AI_UNAVAILABLE);
      } else if (usedAi) setAiOk(true);
    }
    const next: FindingsCache = {
      findings: { ...cache.findings, [palace.id]: mergeFindings(cache.findings[palace.id] ?? [], fresh) },
      lastRun: { ...cache.lastRun, [palace.id]: new Date().toISOString() },
    };
    saveFindingsCache(next);
    setCache(next);
    setRunning(false);
    setAnnouncement(
      fresh.length
        ? `${fresh.length} finding${fresh.length === 1 ? "" : "s"}. Proposals, not yet applied.`
        : "No findings for this palace.",
    );
  };

  const changeStatus = (e: MouseEvent, f: AiFinding, s: AiFinding["status"]): boolean => {
    if (!palace) return false;
    try {
      const next = setFindingStatus(cache, palace.id, f.id, s, userIntentFromEvent(e.nativeEvent));
      saveFindingsCache(next);
      setCache(next);
      return true;
    } catch {
      return false;
    }
  };

  const accept = (e: MouseEvent, f: AiFinding) => {
    if (!palace || !changeStatus(e, f, "accepted")) return;
    const a = ACTIONS[f.kind];
    if (a.view) onOpenEditor(palace, a.view);
    else if (a.review) onStartReview(palace);
  };

  const items = palace ? [...palace.items].sort((a, b) => {
    const pa = palace.route.find((l) => l.id === a.locusId)?.order ?? 0;
    const pb = palace.route.find((l) => l.id === b.locusId)?.order ?? 0;
    return pa - pb;
  }) : [];
  const critItem = items.find((it) => it.id === itemId) ?? items[0];
  const critLocus = palace?.route.find((l) => l.id === critItem?.locusId);

  return (
    <>
      <div className="curator-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="curator-drawer" role="dialog" aria-modal="true" aria-labelledby="curator-title">
        <div className="sr-only" aria-live="polite">
          {announcement}
        </div>

        <header className="flex items-start justify-between gap-3 border-b border-[var(--loci-border)] pb-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)]">
              <Cpu size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 id="curator-title" className="text-base font-bold">
                Curator
              </h2>
              <p className="text-xs text-[var(--loci-text-muted)]">Proposes. You commit. Nothing changes without your click.</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--loci-text-muted)]">
                <span className="curator-dot" data-state={status.dot} aria-hidden="true" />
                <span>{status.text}</span>
              </p>
            </div>
          </div>
          <button type="button" className="loci-btn loci-btn-ghost min-h-[36px] px-2" onClick={onClose} aria-label="Close Curator">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {active.length === 0 ? (
          <p className="text-sm text-[var(--loci-text-muted)]">Create a palace first — the Curator works on palaces you have built.</p>
        ) : (
          <>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold">Palace</span>
              <select
                className="w-full rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2 text-[var(--loci-text)]"
                value={palace?.id}
                onChange={(e) => {
                  setPalaceId(e.target.value);
                  setItemId("");
                  setNotice(null);
                }}
              >
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2" role="tablist" aria-label="Curator tools">
              {doctorOn && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "doctor"}
                  className={`loci-btn text-xs min-h-[36px] ${tab === "doctor" ? "loci-btn-primary" : "loci-btn-ghost"}`}
                  onClick={() => setTab("doctor")}
                >
                  <Stethoscope size={14} aria-hidden="true" />
                  <span>Route Doctor</span>
                </button>
              )}
              {cs.modules.cueCritic && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "critic"}
                  className={`loci-btn text-xs min-h-[36px] ${tab === "critic" ? "loci-btn-primary" : "loci-btn-ghost"}`}
                  onClick={() => setTab("critic")}
                >
                  <PenTool size={14} aria-hidden="true" />
                  <span>Cue Critic</span>
                </button>
              )}
            </div>

            {tab === "doctor" && doctorOn && palace && (
              <section className="space-y-3" aria-label="Route Doctor">
                <p className="text-xs text-[var(--loci-text-muted)]">
                  Checks review history for confusable spots, similar neighbours, cue collisions, middle-of-route sag,
                  falling ease, lapse clusters, staleness and route load. Every finding cites dates or counts.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="loci-btn loci-btn-primary text-xs" onClick={runDoctor} disabled={running}>
                    <Stethoscope size={14} aria-hidden="true" />
                    <span>{running ? "Running…" : "Run Route Doctor"}</span>
                  </button>
                  <span className="text-[11px] text-[var(--loci-text-muted)]">
                    {lastRun
                      ? `Last run ${new Date(lastRun).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}. Results are cached; nothing re-runs on its own.`
                      : "Not run for this palace yet."}
                  </span>
                </div>
                {notice && <p className="text-[11px] text-[var(--loci-rust)]">{notice}</p>}

                {lastRun && live.length === 0 && (
                  <p className="text-xs text-[var(--loci-text-muted)]">No open findings for this palace.</p>
                )}

                <div className="space-y-2.5">
                  {live.map((f) => (
                    <FindingCard
                      key={f.id}
                      f={f}
                      onAccept={(e) => accept(e, f)}
                      onEdit={() => {
                        const a = ACTIONS[f.kind];
                        if (palace && a.view) onOpenEditor(palace, a.view);
                      }}
                      onDismiss={(e) => changeStatus(e, f, "dismissed")}
                    />
                  ))}
                </div>

                {dismissed.length > 0 && (
                  <div>
                    <button type="button" className="curator-link-muted" onClick={() => setShowDismissed((s) => !s)} aria-expanded={showDismissed}>
                      {showDismissed ? "Hide" : "Show"} dismissed ({dismissed.length})
                    </button>
                    {showDismissed && (
                      <div className="space-y-2 pt-1">
                        {dismissed.map((f) => (
                          <FindingCard key={f.id} f={f} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {tab === "critic" && cs.modules.cueCritic && palace && (
              <section className="space-y-3" aria-label="Cue Critic">
                <p className="text-xs text-[var(--loci-text-muted)]">
                  Scores one cue on four axes and asks a single question. It does not rewrite your cue.
                </p>
                {items.length === 0 ? (
                  <p className="text-xs text-[var(--loci-text-muted)]">This palace has no placed items yet.</p>
                ) : (
                  <>
                    <label className="block text-xs">
                      <span className="mb-1 block font-semibold">Item</span>
                      <select
                        className="w-full rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2 text-[var(--loci-text)]"
                        value={critItem?.id}
                        onChange={(e) => setItemId(e.target.value)}
                      >
                        {items.map((it) => {
                          const l = palace.route.find((x) => x.id === it.locusId);
                          return (
                            <option key={it.id} value={it.id}>
                              Spot {l?.order}: {l?.spot}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    {critItem && critLocus && (
                      <>
                        <p className="rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2 text-xs italic text-[var(--loci-text-muted)]">
                          “{critItem.imageCue}”
                        </p>
                        <CueCriticCard
                          key={critItem.id}
                          cue={critItem.imageCue}
                          landmark={critLocus.landmark}
                          spot={critLocus.spot}
                          sense={critLocus.sense}
                          itemText={critItem.text}
                          siblingCues={palace.items.filter((x) => x.id !== critItem.id).map((x) => x.imageCue)}
                          settings={state.settings}
                          onDraft={(text) =>
                            onOpenEditor(
                              {
                                ...palace,
                                items: palace.items.map((x) =>
                                  x.id === critItem.id ? { ...x, imageCue: text, imageSource: "ai-edited", cueApproved: false } : x,
                                ),
                              },
                              "place-items",
                            )
                          }
                        />
                      </>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}

        <footer className="mt-auto border-t border-[var(--loci-border)] pt-3 text-[11px] leading-relaxed text-[var(--loci-text-muted)]">
          Data scope: {cs.dataScope === "minimal"
            ? "minimal — only the cue under discussion, its landmark and sibling keywords are sent, and only to localhost unless you opt in to the remote API in Settings."
            : "palace — multi-spot findings may send spot names and evidence text, only to localhost unless you opt in to the remote API in Settings."}{" "}
          The Curator cannot measure what you remember; it reports what was tested and when.
        </footer>
      </aside>
    </>
  );
};

const FindingCard: FC<{
  f: AiFinding;
  onAccept?: (e: MouseEvent) => void;
  onEdit?: () => void;
  onDismiss?: (e: MouseEvent) => void;
}> = ({ f, onAccept, onEdit, onDismiss }) => {
  const action = ACTIONS[f.kind];
  return (
    <article className="curator-finding" data-status={f.status} aria-label={`${BADGE[f.status]}: ${FINDING_LABELS[f.kind]}`}>
      <p className="mb-1.5">
        <span className="curator-badge">{BADGE[f.status]}</span>
      </p>
      <h3 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-[var(--loci-text)]">
        <span>{FINDING_LABELS[f.kind]}</span>
        <span className="font-mono text-[10px] font-normal text-[var(--loci-text-muted)]">Severity: {f.severity}</span>
      </h3>
      <p className="mt-1">
        <span className="font-semibold">Evidence: </span>
        {f.evidence}
      </p>
      <p className="mt-1">
        <span className="font-semibold">Suggestion: </span>
        {f.suggestion}
      </p>
      {f.status === "proposed" && onAccept && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="loci-btn text-xs min-h-[34px] px-2.5" onClick={onAccept}>
            {action.label}
          </button>
          {action.view && onEdit && (
            <button type="button" className="loci-btn loci-btn-ghost text-xs min-h-[34px] px-2.5" onClick={onEdit}>
              Edit without accepting
            </button>
          )}
          {onDismiss && (
            <button type="button" className="loci-btn loci-btn-ghost text-xs min-h-[34px] px-2.5" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </article>
  );
};
