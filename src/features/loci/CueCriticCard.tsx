import { useState, type FC } from "react";
import { PenTool } from "lucide-react";
import type { LociSettings } from "../../lib/loci-types";
import { CRITIC_AXES, type CritiqueResult } from "../../lib/curator-core";
import { critiqueCue, suggestRewrite } from "../../lib/curator-llm";

interface Props {
  cue: string;
  landmark: string;
  spot: string;
  sense?: string;
  itemText: string;
  siblingCues: string[];
  settings: LociSettings;
  /** Receives a drafted sentence. The caller must keep it unapproved. */
  onDraft: (text: string) => void;
}

/* Module 2 — the Critic interrogates the cue. It never writes it.
   The rewrite path exists, is visually secondary, needs two clicks, and its
   output lands as an unapproved draft. */
export const CueCriticCard: FC<Props> = ({ cue, landmark, spot, sense, itemText, siblingCues, settings, onDraft }) => {
  const [result, setResult] = useState<CritiqueResult | null>(null);
  const [critiqued, setCritiqued] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rewriteStage, setRewriteStage] = useState<0 | 1 | 2>(0);

  const run = async () => {
    if (!cue.trim() || loading) return;
    setLoading(true);
    setNotice(null);
    const out = await critiqueCue({ cue, landmark, spot, sense, siblingCues, aphantasia: settings.verbalMode }, settings);
    setResult(out.value);
    setNotice(out.notice ?? null);
    setCritiqued(cue);
    setLoading(false);
  };

  const draft = async () => {
    setRewriteStage(2);
    const out = await suggestRewrite({ item: itemText, spot, landmark, sense, verbal: settings.verbalMode }, settings);
    onDraft(out.value);
    setRewriteStage(0);
  };

  const label = (axis: (typeof CRITIC_AXES)[number]) =>
    axis === "salience" ? result?.salienceLabel ?? "Salience" : axis[0].toUpperCase() + axis.slice(1);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="loci-btn text-xs min-h-[34px] px-3"
          onClick={run}
          disabled={!cue.trim() || loading}
          title="Score this cue on four axes and get one question"
        >
          <PenTool size={14} aria-hidden="true" />
          <span>{loading ? "Critiquing…" : result ? "Critique again" : "Critique cue"}</span>
        </button>
        {result && critiqued !== cue && (
          <span className="text-[11px] text-[var(--loci-text-muted)]">The cue changed since this critique.</span>
        )}
      </div>

      {result && (
        <div
          className="rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-3 space-y-2 text-xs"
          role="region"
          aria-live="polite"
          aria-label="Cue critique"
        >
          <ul className="space-y-1.5">
            {CRITIC_AXES.map((axis) => (
              <li key={axis} className="grid grid-cols-[96px_auto_1fr] items-center gap-2">
                <span className="font-semibold text-[var(--loci-text)]">{label(axis)}</span>
                <span className="flex items-center gap-1.5">
                  <span className="curator-meter" aria-hidden="true">
                    {[1, 2, 3].map((n) => (
                      <span key={n} data-on={result.scores[axis] >= n} />
                    ))}
                  </span>
                  <span className="font-mono text-[var(--loci-text-muted)]">{result.scores[axis]}/3</span>
                </span>
                <span className="text-[var(--loci-text-muted)]">{result.notes[axis]}</span>
              </li>
            ))}
          </ul>

          <p className="rounded border border-[var(--loci-border)] bg-[var(--loci-surface)] p-2 text-[var(--loci-text)]">
            <span className="font-semibold">One question: </span>
            {result.question}
          </p>

          <p className="text-[10px] font-mono text-[var(--loci-text-muted)]">
            {result.source === "ai" ? "Critique by your local model" : "Built-in checklist"}
            {notice ? ` · ${notice}` : ""}
          </p>

          {rewriteStage === 0 && (
            <button type="button" className="curator-link-muted" onClick={() => setRewriteStage(1)}>
              Suggest rewrite
            </button>
          )}
          {rewriteStage === 1 && (
            <div className="space-y-1.5 border-t border-[var(--loci-border)] pt-2">
              <p className="text-[var(--loci-text-muted)]">
                A drafted sentence (max 30 words) replaces the text in the cue field as an editable draft. It stays
                unapproved until you approve it — answering the question above is usually the stronger fix.
              </p>
              <div className="flex gap-2">
                <button type="button" className="loci-btn loci-btn-ghost text-xs min-h-[32px] px-2" onClick={draft}>
                  Draft one sentence
                </button>
                <button type="button" className="loci-btn loci-btn-ghost text-xs min-h-[32px] px-2" onClick={() => setRewriteStage(0)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {rewriteStage === 2 && <p className="text-[var(--loci-text-muted)]">Drafting…</p>}
        </div>
      )}
    </div>
  );
};
