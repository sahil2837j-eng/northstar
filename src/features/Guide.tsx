import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/ctx";
import { Eyebrow, Field, Segmented } from "../components/ui";
import {
  FIRST_PROFILE_QUESTION,
  buildCheckin,
  buildPayload,
  forgetPattern,
  goalForCheckin,
  nextProfileQuestion,
  proposePattern,
  validateGuideReply,
  type Window as EvidenceWindow,
} from "../lib/guide";
import { dayKey, entriesInWindow, findPatterns, relDay } from "../lib/data";
import { askGuide } from "../lib/mentor";
import { remoteReady } from "../lib/remote-ai";
import { useRemoteConfig } from "../lib/use-remote-ai";
import { Vigil, useOverseer } from "../components/Overseer";

export function GuidePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { core, guide, updateGuide, updateCore, ui, toast, linkEntry, go, requestCapture } = useApp();
  const vigil = useOverseer();
  const remote = useRemoteConfig();
  const [evidenceWin, setEvidenceWin] = useState<EvidenceWindow>("7");
  const [answer, setAnswer] = useState("");
  const [profileText, setProfileText] = useState("");
  const [payload, setPayload] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [linkPick, setLinkPick] = useState(false);

  const profileQ = nextProfileQuestion(guide);
  const goal = goalForCheckin(core.goals, core.entries);
  const today = dayKey(new Date());

  const checkin = useMemo(
    () => buildCheckin({ goal, entries: core.entries, window: evidenceWin, guide, goals: core.goals }),
    [goal, core.entries, evidenceWin, guide, core.goals],
  );

  const candidates = useMemo(
    () => findPatterns(core.entries).filter((p) => !guide.patterns.some((g) => g.keyword === p.keyword)),
    [core.entries, guide.patterns],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const recentUnlinked = entriesInWindow(core.entries, evidenceWin).filter((e) => !e.goalId).slice(0, 6);
  const dismissed = guide.dismissed.includes(today);

  const sendToAI = async () => {
    const p = buildPayload(checkin, core.entries);
    const endpoint = ui.aiEndpointNote.trim();
    if (!endpoint && !remoteReady(remote)) {
      toast("No local endpoint and no ready remote API — nothing leaves this device. Copy the payload instead.", "plain");
      return;
    }
    setSending(true);
    try {
      const res = await askGuide({
        endpoint,
        model: ui.mentorModel || "qwen2.5:7b-instruct",
        payload: p.text,
      });
      if (!res.ok || !res.reply) {
        toast(res.error ?? "The model returned no reply. Keeping the local check-in.", "plain");
      } else {
        const verdict = validateGuideReply(res.reply);
        if (!verdict.ok) {
          toast("AI reply rejected: " + verdict.issues[0], "plain");
        } else {
          toast("AI reply accepted. Nothing was written to your data.", "lit");
          updateGuide((g) => ({
            ...g,
            answers: [
              ...g.answers,
              { ts: new Date().toISOString(), question: checkin.question.text, answer: res.reply!.slice(0, 600), goalId: goal?.id },
            ],
          }));
        }
      }
    } catch {
      toast("Could not reach that endpoint. Keeping the local check-in.", "plain");
    }
    setSending(false);
    setPayload(null);
  };

  return (
    <div className="fixed inset-0 z-[65]" role="dialog" aria-modal="true" aria-label="Ask NorthStar">
      <div className="fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="sheet-in scroll-thin absolute bottom-0 right-0 max-h-[92vh] w-full overflow-y-auto border-t border-[var(--ns-line-bright)] sm:top-0 sm:max-h-none sm:w-[440px] sm:border-l sm:border-t-0"
        style={{
          background: "var(--ns-bg-0)",
          borderRadius: window.innerWidth < 640 ? "18px 18px 0 0" : undefined,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--ns-line-bright)] sm:hidden" aria-hidden="true" />
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--ns-line)] bg-[var(--ns-bg-0)] px-5 py-4">
          <div className="flex items-center gap-3">
            <Vigil mood={vigil.mood} size={34} />
            <div>
              <div className="eyebrow" style={{ color: "var(--ns-north)" }}>
                Ask NorthStar
              </div>
              <p className="pt-1 text-[13px] muted">One private question for your direction.</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose} aria-label="Close">
            ✕ Esc
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {profileQ ? (
            <section className="space-y-3">
              <Eyebrow right="profile · optional">First, one question</Eyebrow>
              <p className="plate text-[26px] leading-tight">{FIRST_PROFILE_QUESTION.text}</p>
              <p className="text-[13px] faint">
                {profileQ.id === FIRST_PROFILE_QUESTION.id
                  ? "Answering this shapes which check-ins you get. You can skip it."
                  : `One at a time — ${profileQ.text}`}
              </p>
              <Field label="Your answer" hint="Stored locally. Never sent anywhere without your action.">
                <textarea
                  rows={4}
                  value={profileText}
                  onChange={(e) => setProfileText(e.target.value)}
                  placeholder="Plain words are fine."
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => {
                    if (!profileText.trim()) {
                      toast("Write something, or skip this one.", "plain");
                      return;
                    }
                    updateGuide((g) => ({
                      ...g,
                      profile: { ...g.profile, [profileQ.id]: profileText.trim() },
                    }));
                    setProfileText("");
                    toast("Saved to your profile.", "lit");
                  }}
                >
                  Save answer
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    updateGuide((g) => ({
                      ...g,
                      skippedQuestions: [...g.skippedQuestions, profileQ.id],
                    }));
                    setProfileText("");
                  }}
                >
                  Skip
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    setProfileText("");
                    toast("Left for later — it will come back next time.", "plain");
                    onClose();
                  }}
                >
                  Answer later
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() =>
                    updateGuide((g) => ({
                      ...g,
                      neverQuestions: [...g.neverQuestions, profileQ.id],
                    }))
                  }
                >
                  Never ask this
                </button>
              </div>
              <div className="rule" />
            </section>
          ) : null}

          {/* check-in */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Evidence window</Eyebrow>
              <Segmented
                label="Evidence window"
                value={evidenceWin}
                onChange={setEvidenceWin}
                options={[
                  { value: "today", label: "Today" },
                  { value: "7", label: "7 days" },
                  { value: "14", label: "14 days" },
                ]}
              />
            </div>

            <div className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-card)] p-4">
              <div className="eyebrow pb-1">Goal</div>
              <p className="text-[15px]" style={{ fontWeight: 500 }}>
                {checkin.goal ? checkin.goal.title : "No active goal yet"}
              </p>

              <div className="eyebrow pt-4 pb-1">What I noticed</div>
              <p className="text-[14px] muted">{checkin.noticed}</p>

              <div className="eyebrow pt-4 pb-1">Based on</div>
              <ul className="space-y-1.5">
                {checkin.sources.map((s) => (
                  <li key={s.label} className="text-[13px] muted">
                    <span className="mono pr-2" style={{ color: "var(--ns-linked)" }}>
                      {s.label}
                    </span>
                    {s.detail}
                  </li>
                ))}
              </ul>

              <div className="rule my-4" />
              <div className="eyebrow pb-2" style={{ color: "var(--ns-north)" }}>
                One question · {checkin.question.category}
              </div>
              <p className="plate text-[24px] leading-snug">{checkin.question.text}</p>

              <textarea
                rows={3}
                className="mt-3"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Answer honestly — this stays on this device."
                aria-label="Your answer"
              />
              <div className="flex flex-wrap gap-2 pt-3">
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => {
                    if (!answer.trim()) {
                      toast("Write an answer first, or skip today.", "plain");
                      return;
                    }
                    updateGuide((g) => ({
                      ...g,
                      answers: [
                        ...g.answers,
                        {
                          ts: new Date().toISOString(),
                          question: checkin.question.text,
                          answer: answer.trim(),
                          goalId: goal?.id,
                        },
                      ],
                    }));
                    setAnswer("");
                    toast("Answer saved locally.", "lit");
                  }}
                >
                  Save answer
                </button>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    if (!goal) {
                      toast("No active goal to attach the next step to.", "plain");
                      return;
                    }
                    updateCore((p) => ({
                      ...p,
                      goals: p.goals.map((g) =>
                        g.id === goal.id ? { ...g, nextAction: `${checkin.action.text} (20 min)` } : g,
                      ),
                    }));
                    toast(`Next step set on ${goal.title}. Nothing else was edited.`, "lit");
                  }}
                >
                  Create 20 min next step
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    updateGuide((g) => ({
                      ...g,
                      dismissed: g.dismissed.includes(today) ? g.dismissed : [...g.dismissed, today],
                    }));
                    toast("Skipped today. Nothing is held against you.", "plain");
                  }}
                >
                  Skip today
                </button>
                {ui.aiMentorEnabled && (
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => setPayload(buildPayload(checkin, core.entries).text)}
                  >
                    Sharpen with AI mentor
                  </button>
                )}
              </div>
              {dismissed && (
                <p className="pt-2 text-[12px]" style={{ color: "var(--ns-warn)" }}>
                  You skipped today's check-in. Asking again is allowed — nothing is lost.
                </p>
              )}
            </div>

            {/* link an entry */}
            <div className="rounded-xl border border-[var(--ns-line)] p-4">
              <div className="flex items-center justify-between pb-2">
                <div className="eyebrow">Link an entry as evidence</div>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setLinkPick(!linkPick)}>
                  {linkPick ? "Close" : "Choose"}
                </button>
              </div>
              {linkPick ? (
                recentUnlinked.length ? (
                  <ul className="space-y-2">
                    {recentUnlinked.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3">
                        <span className="text-[13px] muted">
                          <span className="mono pr-2" style={{ color: "var(--ns-lit)" }}>
                            {relDay(e.ts)}
                          </span>
                          {e.text.slice(0, 80)}
                        </span>
                        <button
                          className="btn btn-sm"
                          type="button"
                          disabled={!goal}
                          onClick={() => {
                            if (!goal) return;
                            linkEntry(e.id, goal.id);
                            setLinkPick(false);
                            toast(`Linked to ${goal.title}`, "lit");
                          }}
                        >
                          Link
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] faint">No unlinked entries in this window.</p>
                )
              ) : (
                <p className="text-[13px] faint">
                  Linking never happens on its own — you pick the entry.
                </p>
              )}
            </div>

            {/* memory skill */}
            {candidates.length > 0 && (
              <div className="rounded-xl border border-[var(--ns-line)] p-4">
                <div className="eyebrow pb-2">Remember a pattern? — needs 3+ entries across 2+ days</div>
                <ul className="space-y-2">
                  {candidates.slice(0, 3).map((p) => (
                    <li key={p.keyword} className="flex items-center justify-between gap-3">
                      <span className="text-[13px] muted">
                        “{p.keyword}” · {p.entryIds.length} entries · {p.days.length} days
                      </span>
                      <span className="flex gap-2">
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() => {
                            updateGuide((g) => proposePattern(g, p));
                            toast(`Pattern “${p.keyword}” saved.`, "lit");
                          }}
                        >
                          Confirm
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {guide.patterns.length > 0 && (
              <div className="rounded-xl border border-[var(--ns-line)] p-4">
                <div className="eyebrow pb-2">Confirmed patterns</div>
                <ul className="space-y-2">
                  {guide.patterns.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <span className="text-[13px] muted">
                        “{p.keyword}” · {p.entryIds.length} entries · {p.days.length} days
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => updateGuide((g) => forgetPattern(g, p.keyword))}
                      >
                        Forget
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {guide.answers.length > 0 && (
              <details className="rounded-xl border border-[var(--ns-line)] p-4">
                <summary className="eyebrow flex items-center justify-between">
                  <span>Earlier answers ({guide.answers.length})</span>
                  <span className="faint">open</span>
                </summary>
                <ul className="space-y-3 pt-3">
                  {[...guide.answers].reverse().map((a, i) => (
                    <li key={i}>
                      <p className="text-[13px]" style={{ color: "var(--ns-north)" }}>
                        {a.question}
                      </p>
                      <p className="text-[13px] muted">{a.answer}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      </div>

      {/* payload preview */}
      {payload && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="AI payload preview">
          <div className="fade-in absolute inset-0 bg-black/80" onClick={() => setPayload(null)} />
          <div
            className="panel-in relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border p-5"
            style={{ borderColor: "var(--ns-line-bright)", background: "var(--ns-card)" }}
          >
            <div className="eyebrow pb-2">Payload preview — exactly what would leave this device</div>
            <p className="pb-3 text-[13px] muted">
              Entry ids are aliased, maximum 8 evidence items, maximum 2,000 characters, no journal,
              no extension secrets, no API keys.
            </p>
            <pre className="mono scroll-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3 text-[12px]">
              {payload}
            </pre>
            <div className="flex flex-wrap justify-end gap-2 pt-4">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(payload);
                  toast("Payload copied.", "plain");
                }}
              >
                Copy payload
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPayload(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" type="button" disabled={sending} onClick={sendToAI}>
                {sending ? "Sending…" : "Send to configured endpoint"}
              </button>
            </div>
            <p className="pt-2 text-[12px] faint">
              A local CPU model can take up to two minutes; a remote model depends on the provider.
              Nothing is written to your data until you accept the reply.
            </p>
            {!ui.aiEndpointNote.trim() && !remoteReady(remote) && (
              <p className="pt-3 text-[12px] faint">
                No local endpoint and no ready remote API are configured, so sending is disabled.
                Nothing left this device while you were reading this.
              </p>
            )}
            <div className="pt-4">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => {
                  requestCapture();
                  go("today");
                  setPayload(null);
                  onClose();
                }}
              >
                Back to Today
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
