import { useEffect, useMemo, useRef, useState, type FC, type MouseEvent } from "react";
import { Terminal, X } from "lucide-react";
import type { LociState, Palace } from "../../lib/loci-types";
import {
  buildCommandResult,
  curatorSettings,
  nearestCommands,
  paletteMatches,
  parseIntentLocal,
  type AiProposal,
  type CommandResult,
} from "../../lib/curator-core";
import { commitProposal, userIntentFromEvent } from "../../lib/curator-proposals";
import { parseCommandAI } from "../../lib/curator-llm";

interface Props {
  open: boolean;
  onClose: () => void;
  state: LociState;
  onStartReview: (palace: Palace, mode: "recall" | "reverse" | "random") => void;
  onOpenEditor: (palace: Palace, view: "edit-route") => void;
  onExport: () => void;
}

const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v));

/* Module 6 — read-only queries answer immediately; anything that changes state
   renders a diff and waits for Confirm. It never guesses at a mutation. */
export const CommandBar: FC<Props> = ({ open, onClose, state, onStartReview, onOpenEditor, onExport }) => {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CommandResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiParse = state.settings.aiEnabled && curatorSettings(state.settings).modules.commandBar;

  useEffect(() => {
    if (!open) return;
    setText("");
    setResult(null);
    setError(null);
    setNotice(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const palette = useMemo(() => paletteMatches(text, state.palaces), [text, state.palaces]);

  if (!open) return null;

  const run = async (q: string) => {
    if (!q.trim()) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    let intent = parseIntentLocal(q, state.palaces);
    if ((!intent || intent.confidence < 0.7) && aiParse) {
      const ai = await parseCommandAI(q, state.palaces, state.settings);
      if (ai.value) intent = ai.value;
      if (ai.notice) setNotice(ai.notice);
    }
    setResult(intent && intent.confidence >= 0.7 ? buildCommandResult(intent, state) : { kind: "unknown", suggestions: nearestCommands(q) });
    setBusy(false);
  };

  const apply = (p: AiProposal) => {
    const palace = state.palaces.find((x) => x.id === p.targetIds[0]);
    if (p.type === "start_session" && palace) {
      onStartReview(palace, (p.params?.mode as "recall" | "reverse" | "random") ?? "recall");
    } else if (p.type === "add_loci" && palace) {
      const n = Number(p.params?.count ?? 1);
      const blank = Array.from({ length: n }, (_, k) => ({
        id: `loc_${Math.random().toString(36).slice(2, 9)}`,
        order: palace.route.length + k + 1,
        spot: "",
        landmark: "",
        sense: "",
      }));
      onOpenEditor({ ...palace, route: [...palace.route, ...blank] }, "edit-route");
    } else if (p.type === "export") {
      onExport();
    }
  };

  const confirm = (e: MouseEvent) => {
    if (result?.kind !== "proposal") return;
    try {
      apply(commitProposal(result.proposal, userIntentFromEvent(e.nativeEvent)));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="curator-command" role="dialog" aria-modal="true" aria-labelledby="command-title" onClick={onClose}>
      <div className="curator-command-panel space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="command-title" className="flex items-center gap-2 text-sm font-bold">
            <Terminal size={16} aria-hidden="true" />
            <span>Command bar</span>
            <span className="font-mono text-[10px] font-normal text-[var(--loci-text-muted)]">
              {aiParse ? "local model + built-in parser" : "built-in parser"}
            </span>
          </h2>
          <button type="button" className="loci-btn loci-btn-ghost min-h-[34px] px-2" onClick={onClose} aria-label="Close command bar">
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(text);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="w-full rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2.5 text-sm text-[var(--loci-text)] focus:border-[var(--loci-focus)] focus:outline-none"
            placeholder="e.g. which spots have lapsed twice"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
              setError(null);
            }}
            aria-label="Command"
          />
        </form>

        {!result && (
          <ul className="space-y-1" aria-label="Suggestions">
            {palette.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-[var(--loci-text-muted)] hover:bg-[var(--loci-surface-2)] hover:text-[var(--loci-text)]"
                  onClick={() => {
                    setText(c);
                    void run(c);
                  }}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        )}

        {busy && <p className="text-xs text-[var(--loci-text-muted)]">Parsing…</p>}
        {notice && <p className="text-[11px] text-[var(--loci-rust)]">{notice}</p>}

        <div aria-live="polite">
          {result?.kind === "answer" && (
            <ul className="space-y-1 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-3 text-xs">
              {result.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}

          {result?.kind === "refuse" && (
            <p className="rounded-lg border border-[var(--loci-border)] p-3 text-xs text-[var(--loci-text)]">{result.message}</p>
          )}

          {result?.kind === "unknown" && (
            <div className="space-y-1 text-xs">
              <p className="font-semibold">Not understood. Closest supported commands:</p>
              <ul className="space-y-1">
                {result.suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1 text-left text-[var(--loci-text-muted)] hover:bg-[var(--loci-surface-2)]"
                      onClick={() => {
                        setText(s);
                        setResult(null);
                        inputRef.current?.focus();
                      }}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result?.kind === "proposal" && (
            <div className="curator-finding space-y-2" data-status="proposed">
              <span className="sr-only">Proposal, not yet applied.</span>
              <p>
                <span className="curator-badge">Proposed — not applied</span>
              </p>
              <p className="text-sm font-bold text-[var(--loci-text)]">{result.summary}</p>
              <div className="curator-diff">
                <div>
                  <p className="mb-1 font-semibold">Before</p>
                  {Object.entries(result.proposal.diff.before).map(([k, v]) => (
                    <p key={k} className="font-mono text-[11px]">
                      {k}: {show(v)}
                    </p>
                  ))}
                </div>
                <div>
                  <p className="mb-1 font-semibold">After</p>
                  {Object.entries(result.proposal.diff.after).map(([k, v]) => (
                    <p key={k} className="font-mono text-[11px]">
                      {k}: {show(v)}
                    </p>
                  ))}
                </div>
              </div>
              <p className="text-[var(--loci-text-muted)]">{result.proposal.rationale}</p>
              <p className="font-mono text-[10px] text-[var(--loci-text-muted)]">
                Expires {new Date(result.proposal.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}; an expired
                diff cannot be applied.
              </p>
              {error && <p className="text-[var(--loci-rust)]">{error}</p>}
              <div className="flex gap-2">
                <button type="button" className="loci-btn loci-btn-primary text-xs" onClick={confirm}>
                  Confirm
                </button>
                <button type="button" className="loci-btn loci-btn-ghost text-xs" onClick={() => setResult(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
