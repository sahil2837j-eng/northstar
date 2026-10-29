import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/ctx";
import { Field, Segmented } from "../components/ui";
import {
  PERSONAS,
  askMentor,
  autoBriefAllowed,
  buildRoutineDigest,
  isLocalEndpoint,
  type MentorPersona,
  type MentorResult,
} from "../lib/mentor";
import { DUR, staggerIn } from "../lib/motion";
import { dayKey } from "../lib/data";
import { Vigil, useOverseer } from "../components/Overseer";
import { remoteReady } from "../lib/remote-ai";
import { useRemoteConfig } from "../lib/use-remote-ai";

const AUTO_KEY = "northstar.mentor.lastbrief.v1";

export function MentorPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { core, guide, memory, practice, ui, updateUi, updateGuide, toast } = useApp();
  const vigil = useOverseer();
  const [note, setNote] = useState("");
  const [showDigest, setShowDigest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MentorResult | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const persona: MentorPersona = ui.mentorPersona ?? "strategist";
  const digest = useMemo(
    () => buildRoutineDigest(core, guide, practice, ui, memory),
    [core, guide, practice, ui, memory],
  );
  const local = isLocalEndpoint(ui.aiEndpointNote);
  const remote = useRemoteConfig();
  const remoteActive = remote.enabled;
  const remoteUsable = remoteReady(remote);
  const gate = autoBriefAllowed(ui);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      if (bodyRef.current) staggerIn(bodyRef.current.querySelectorAll(":scope > *"));
    }, 10);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  const send = async () => {
    if (!ui.aiEndpointNote.trim() && !remoteUsable) {
      toast("Configure a local endpoint or enable the remote API first — Settings → AI.", "plain");
      return;
    }
    setBusy(true);
    setResult(null);
    const r = await askMentor({
      endpoint: ui.aiEndpointNote,
      model: ui.mentorModel || "llama3.1",
      persona,
      digest,
      userNote: note,
    });
    setResult(r);
    setBusy(false);
    if (r.ok) {
      try {
        localStorage.setItem(AUTO_KEY, dayKey(new Date()));
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[66]" role="dialog" aria-modal="true" aria-label="Mentor">
      <div className="fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="sheet-in scroll-thin safe-bottom absolute bottom-0 right-0 max-h-[92vh] w-full overflow-y-auto border-t border-[var(--ns-line-bright)] sm:top-0 sm:max-h-none sm:w-[460px] sm:border-l sm:border-t-0"
        style={{ background: "var(--ns-bg-0)" }}
      >
        {/* grab handle for mobile */}
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--ns-line-bright)] sm:hidden" aria-hidden="true" />
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--ns-line)] bg-[var(--ns-bg-0)] px-5 py-4">
          <div className="flex items-center gap-3">
            <Vigil mood={vigil.mood} size={34} />
            <div>
              <div className="eyebrow" style={{ color: "var(--ns-lit)" }}>
                Mentor · {PERSONAS[persona].label}
              </div>
              <p className="pt-1 text-[13px] muted">
                Reads your routine digest. Persona is a tone, not a mind-reader.
              </p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose} aria-label="Close">
            ✕ Esc
          </button>
        </div>

        <div ref={bodyRef} className="space-y-4 px-5 py-5">
          <div>
            <span className="eyebrow block pb-1.5">Voice</span>
            <Segmented
              label="Mentor persona"
              value={persona}
              onChange={(v) => updateUi((u) => ({ ...u, mentorPersona: v }))}
              options={(Object.keys(PERSONAS) as MentorPersona[]).map((p) => ({
                value: p,
                label: PERSONAS[p].label,
              }))}
            />
            <p className="pt-2 text-[12px] faint">{PERSONAS[persona].blurb}</p>
          </div>

          <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-card)] p-3">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Routine digest — exactly what the model sees</span>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowDigest(!showDigest)}>
                {showDigest ? "Hide" : "Show"}
              </button>
            </div>
            <div className="rows" data-open={showDigest}>
              <div>
                <pre className="mono scroll-thin mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-2 text-[11px]">
                  {digest.text}
                </pre>
              </div>
            </div>
            <p className="mono pt-2 text-[11px] faint">
              {digest.chars} chars · {digest.itemCount} entries · aliased ids · no full journal
            </p>
          </div>

          <Field label="Anything you want it to weigh? (optional)">
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. I keep opening the editor and then switching tabs."
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={send}>
              {busy ? "Thinking…" : `Ask ${PERSONAS[persona].label}`}
            </button>
            <span className="mono text-[11px]" style={{ color: remoteActive || !local ? "var(--ns-warn)" : "var(--ns-ok)" }}>
              {remoteActive
                ? remoteUsable
                  ? "remote API — opt-in, this leaves your device"
                  : "remote enabled — key missing"
                : ui.aiEndpointNote.trim()
                  ? local
                    ? "localhost — stays on this machine"
                    : "remote endpoint — this will leave your device"
                  : "no endpoint configured"}
            </span>
          </div>

          {result && (
            <div
              className="panel-in rounded-xl border p-4"
              style={{
                borderColor: result.ok ? "var(--ns-line-bright)" : "var(--ns-warn)",
                background: "var(--ns-card)",
              }}
            >
              {result.ok ? (
                <>
                  <div className="eyebrow pb-2" style={{ color: "var(--ns-lit)" }}>
                    {PERSONAS[persona].label} · {(result.ms / 1000).toFixed(1)}s · validated
                  </div>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{result.reply}</p>
                  <div className="flex flex-wrap gap-2 pt-3">
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => {
                        updateGuide((g) => ({
                          ...g,
                          answers: [
                            ...g.answers,
                            {
                              ts: new Date().toISOString(),
                              question: `[${PERSONAS[persona].label}] mentor briefing`,
                              answer: (result.reply ?? "").slice(0, 800),
                            },
                          ],
                        }));
                        toast("Saved to your guide history.", "lit");
                      }}
                    >
                      Keep this
                    </button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setResult(null)}>
                      Discard
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="eyebrow pb-2" style={{ color: "var(--ns-warn)" }}>
                    {result.issues ? "Reply rejected by the validator" : "Could not get a reply"}
                  </div>
                  {result.issues?.map((i) => (
                    <p key={i} className="text-[13px] muted">
                      — {i}
                    </p>
                  ))}
                  {result.error && <p className="text-[13px] muted">{result.error}</p>}
                  {result.reply && result.issues && (
                    <details className="pt-2">
                      <summary className="eyebrow">Show the rejected text anyway</summary>
                      <p className="pt-2 text-[13px] faint whitespace-pre-wrap">{result.reply}</p>
                    </details>
                  )}
                  <p className="pt-2 text-[12px] faint">
                    Rejected replies are never saved. The persona cannot override the no-shame rules.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="rounded-xl border border-[var(--ns-line)] p-3">
            <label className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-[14px]">Daily auto-briefing</span>
                <span className="block pt-1 text-[12px] muted">
                  Once per local day, when you open NorthStar, the digest is sent automatically and
                  the briefing waits here. <strong>Localhost endpoints only</strong> — a remote URL
                  disables this no matter what.
                </span>
              </span>
              <input
                type="checkbox"
                style={{ width: 16, marginTop: 4 }}
                checked={!!ui.mentorAutoBrief}
                onChange={(e) => updateUi((u) => ({ ...u, mentorAutoBrief: e.target.checked }))}
              />
            </label>
            <p className="mono pt-2 text-[11px]" style={{ color: gate.allowed ? "var(--ns-ok)" : "var(--ns-faint)" }}>
              {gate.reason}
            </p>
          </div>

          <p className="text-[12px] faint" style={{ animationDuration: `${DUR.standard}ms` }}>
            Limits that remain: the model only sees the digest above; it cannot see unlogged hours,
            cannot verify effort, and quality depends on the model you run. A briefing is a prompt,
            not a verdict.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Auto-brief hook: fires at most once per local day, localhost-only, displays a toast when ready. */
export function useAutoBrief(onReady: (reply: string) => void) {
  const { core, guide, memory, practice, ui } = useApp();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    const gate = autoBriefAllowed(ui);
    if (!gate.allowed) return;
    let last = "";
    try {
      last = localStorage.getItem(AUTO_KEY) ?? "";
    } catch {
      return;
    }
    if (last === dayKey(new Date())) return;
    fired.current = true;
    const digest = buildRoutineDigest(core, guide, practice, ui, memory);
    askMentor({
      endpoint: ui.aiEndpointNote,
      model: ui.mentorModel || "llama3.1",
      persona: ui.mentorPersona ?? "strategist",
      digest,
      localOnly: true,
    }).then((r) => {
      if (r.ok && r.reply) {
        try {
          localStorage.setItem(AUTO_KEY, dayKey(new Date()));
        } catch {
          /* ignore */
        }
        onReady(r.reply);
      }
      /* failures stay silent — an auto-brief must never nag */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.mentorAutoBrief, ui.aiEndpointNote]);
}
