import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/ctx";
import { Modal, Eyebrow } from "./ui";
import { MOOD_COLOR, buildOverseer, type Mood, type OverseerSnapshot } from "../lib/overseer";
import {
  PERSONAS,
  askMentor,
  buildRoutineDigest,
  isLocalEndpoint,
  type MentorResult,
} from "../lib/mentor";
import { remoteReady } from "../lib/remote-ai";
import { useRemoteConfig } from "../lib/use-remote-ai";

/* ---------------- the instrument itself ---------------- */

export function Vigil({
  mood = "observing",
  size = 44,
  label,
}: {
  mood?: Mood;
  size?: number;
  label?: string;
}) {
  const uid = useMemo(() => "vg" + Math.random().toString(36).slice(2, 7), []);
  return (
    <span
      className="vigil"
      data-mood={mood}
      style={{ width: size, height: size, color: MOOD_COLOR[mood] }}
      role="img"
      aria-label={label ?? `VIGIL, the NorthStar overseer, currently ${mood}`}
    >
      <svg width={size} height={size} viewBox="0 0 64 64">
        <defs>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="46%" r="52%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}-head`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#191922" />
            <stop offset="100%" stopColor="#0d0d13" />
          </linearGradient>
        </defs>

        <circle cx="32" cy="32" r="31" fill={`url(#${uid}-glow)`} />

        <g className="v-orbit" fill="none" stroke="var(--ns-line-bright)" strokeWidth="0.9">
          <circle cx="32" cy="32" r="27.5" strokeDasharray="1.5 7" />
          <circle cx="32" cy="32" r="22.5" strokeDasharray="0.5 12" opacity="0.6" />
          <circle cx="32" cy="4.5" r="1.5" fill="currentColor" stroke="none" />
        </g>

        <g className="v-float">
          {/* shoulders */}
          <path
            d="M17 56 Q32 47.5 47 56"
            fill="none"
            stroke="var(--ns-line-bright)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M24 53.5 Q32 49.5 40 53.5" fill="none" stroke="var(--ns-line)" strokeWidth="1" />
          {/* neck */}
          <rect x="29.4" y="43.6" width="5.2" height="4.4" rx="1.6" fill="#0b0b10" stroke="var(--ns-line-bright)" strokeWidth="1" />
          {/* antenna */}
          <line x1="32" y1="14.4" x2="32" y2="8.6" stroke="var(--ns-line-bright)" strokeWidth="1.1" />
          <circle className="v-beacon" cx="32" cy="7" r="2.1" fill="currentColor" />

          {/* head */}
          <rect
            x="12.5"
            y="14.5"
            width="39"
            height="31"
            rx="10.5"
            fill={`url(#${uid}-head)`}
            stroke="var(--ns-line-bright)"
            strokeWidth="1.25"
          />
          <rect x="15" y="17" width="34" height="8" rx="4" fill="currentColor" opacity="0.045" />

          {/* visor */}
          <rect x="17.6" y="23.4" width="28.8" height="12.2" rx="6.1" fill="#06060a" stroke="var(--ns-line)" strokeWidth="1" />
          <rect x="19.6" y="25.2" width="24.8" height="8.6" rx="4.3" fill="currentColor" opacity="0.06" />

          {/* eyes */}
          <g className="v-eyes" fill={MOOD_COLOR[mood]}>
            <rect x="22" y="27.2" width="6.6" height="4.6" rx="2.3" />
            <rect x="35.4" y="27.2" width="6.6" height="4.6" rx="2.3" />
          </g>
          <rect className="v-scan" x="20" y="25.2" width="1.6" height="8.6" rx="0.8" fill="var(--ns-lit)" opacity="0.5" />

          {/* status core + signal bars */}
          <circle className="v-core" cx="32" cy="40" r="1.8" fill="currentColor" />
          <g className="v-bars" fill="var(--ns-line-bright)">
            <rect x="44.5" y="38.4" width="1.2" height="3.8" rx="0.6" />
            <rect x="47" y="36.8" width="1.2" height="5.4" rx="0.6" />
            <rect x="49.5" y="38.8" width="1.2" height="3.4" rx="0.6" />
          </g>
          <g className="v-bars" fill="var(--ns-line-bright)">
            <rect x="14.4" y="38.4" width="1.2" height="3.8" rx="0.6" />
            <rect x="16.9" y="36.8" width="1.2" height="5.4" rx="0.6" />
            <rect x="19.4" y="38.8" width="1.2" height="3.4" rx="0.6" />
          </g>
        </g>
      </svg>
    </span>
  );
}

/* ---------------- snapshot hook ---------------- */

export function useOverseer(): OverseerSnapshot {
  const { core, guide, practice, ui } = useApp();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(
    () => buildOverseer(core, guide, practice, ui),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [core, guide, practice, ui, tick],
  );
}

/* ---------------- rail presence ---------------- */

export function OverseerRail({ onOpen }: { onOpen: () => void }) {
  const s = useOverseer();
  const { ui } = useApp();
  if (ui.overseer === false) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bay bay-hover w-full p-3 text-left"
      aria-label="Open VIGIL overseer console"
    >
      <div className="flex items-center gap-2.5">
        <Vigil mood={s.mood} size={38} />
        <div className="min-w-0">
          <div className="wordmark text-[12px] tracking-[0.08em]">VIGIL</div>
          <div className="mono text-[10px] faint">{s.status}</div>
        </div>
        <span className="live-dot ml-auto" aria-hidden="true" />
      </div>
      <p key={s.line} className="speak line-clamp-2 pt-2 text-[12px] leading-relaxed muted">
        {s.line}
      </p>
      <span className="mono block pt-1.5 text-[10px]" style={{ color: MOOD_COLOR[s.mood] }}>
        open console ↗
      </span>
    </button>
  );
}

/* ---------------- Today hero presence ---------------- */

export function OverseerStrip() {
  const s = useOverseer();
  const { ui, openOverseer, requestCapture, go, openPractice, openGuide, openMentor, toast } = useApp();
  if (ui.overseer === false) return null;

  const act = () => {
    switch (s.directive.action) {
      case "capture":
        requestCapture();
        go("today");
        toast("Capture focused. One sentence is enough.", "plain");
        break;
      case "practice":
        openPractice();
        break;
      case "guide":
        openGuide();
        break;
      case "mentor":
        openMentor();
        break;
      default:
        break;
    }
  };

  return (
    <section
      className="panel-in relative overflow-hidden rounded-2xl border p-4"
      style={{
        borderColor: "var(--ns-line-bright)",
        background:
          "radial-gradient(70% 160% at 0% 0%, rgba(79,209,197,.08), transparent 60%), var(--ns-card)",
      }}
      aria-label="VIGIL overseer readout"
    >
      <div className="flex flex-wrap items-center gap-4">
        <Vigil mood={s.mood} size={54} />
        <div className="min-w-[180px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="wordmark text-[12px] tracking-[0.12em]">VIGIL</span>
            <span
              className="mono text-[9px] uppercase tracking-[0.14em]"
              style={{ color: MOOD_COLOR[s.mood] }}
            >
              {s.status}
            </span>
          </div>
          <p key={s.line} className="speak pt-1 text-[13px] leading-relaxed muted">
            {s.line}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-sm" type="button" onClick={act}>
            {s.directive.label}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={openOverseer}>
            Console
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- mobile dock ---------------- */

export function OverseerDock({ onOpen }: { onOpen: () => void }) {
  const s = useOverseer();
  const { ui } = useApp();
  if (ui.overseer === false) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="ns-vigil-dock"
      aria-label={`VIGIL overseer, ${s.status}. Open console.`}
    >
      <Vigil mood={s.mood} size={42} />
      <span className="ns-vigil-dock-dot" aria-hidden="true" />
    </button>
  );
}

/* ---------------- console ---------------- */

export function OverseerConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useOverseer();
  const { core, guide, memory, practice, ui, updateGuide, requestCapture, go, openPractice, openGuide, openMentor, toast } = useApp();
  const [ai, setAi] = useState<MentorResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const persona = ui.mentorPersona ?? "strategist";
  const digest = useMemo(
    () => buildRoutineDigest(core, guide, practice, ui, memory),
    [core, guide, practice, ui, memory],
  );
  const mentorLocal = ui.aiEndpointNote.trim() ? isLocalEndpoint(ui.aiEndpointNote) : false;
  const remote = useRemoteConfig();
  const remoteActive = remote.enabled;
  const remoteUsable = remoteReady(remote);

  const consult = async () => {
    if (!ui.aiEndpointNote.trim() && !remoteUsable) {
      toast("Connect a local model or enable the remote API in Settings first — nothing was sent.", "plain");
      return;
    }
    setAiBusy(true);
    setAi(null);
    const r = await askMentor({
      endpoint: ui.aiEndpointNote,
      model: ui.mentorModel || "llama3.1",
      persona,
      digest,
    });
    setAi(r);
    setAiBusy(false);
    if (r.ok) toast(`${PERSONAS[persona].label} wrote a directive.`, "lit");
    else toast(r.issues ? `Reply rejected: ${r.issues[0]}` : r.error ?? "No reply.", "plain");
  };

  const run = () => {
    switch (s.directive.action) {
      case "capture":
        requestCapture();
        go("today");
        break;
      case "practice":
        openPractice();
        break;
      case "guide":
        openGuide();
        break;
      case "mentor":
        openMentor();
        break;
      default:
        break;
    }
    onClose();
  };

  let storageOk = true;
  try {
    localStorage.setItem("northstar.vigil.probe", "1");
    localStorage.removeItem("northstar.vigil.probe");
  } catch {
    storageOk = false;
  }

  const diagnostics = [
    { label: "local record", value: `${core.entries.length} entries · ${core.goals.length} goals · ${core.reviews.length} reviews`, ok: true },
    { label: "storage", value: storageOk ? "localStorage readable" : "blocked — data may not persist", ok: storageOk },
    {
      label: "practice contract",
      value: ui.aiEndpointNote ? "" : "",
      ok: true,
    },
  ];
  diagnostics[2] = {
    label: "practice contract",
    value: "See Practice panel for alarms & extension",
    ok: true,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="VIGIL // overseer"
      title="Overseer console"
      wide
      footer={
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              openMentor();
              onClose();
            }}
          >
            ◈ Ask the mentor
          </button>
          <button className="btn btn-primary" type="button" onClick={run}>
            {s.directive.label}
          </button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[230px_minmax(0,1fr)]">
        <div>
          <div className="overseer-stage flex flex-col items-center px-4 pb-4 pt-6">
            <Vigil mood={aiBusy ? "scanning" : s.mood} size={132} />
            <div className="wordmark pt-3 text-[16px] tracking-[0.14em]">VIGIL</div>
            <div className="eyebrow pt-1">oversight unit</div>
            <div
              className="mono mt-3 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em]"
              style={{ borderColor: MOOD_COLOR[s.mood], color: MOOD_COLOR[s.mood] }}
            >
              <span className="live-dot" aria-hidden="true" />
              {s.status}
            </div>
            <p className="mono pt-3 text-center text-[9px] leading-relaxed faint">{s.boot}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {s.telemetry.map((t) => (
              <div key={t.label} className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] px-2.5 py-2">
                <div className="mono text-[17px] leading-none" style={{ color: t.tone }}>
                  {t.value}
                </div>
                <div className="eyebrow pt-1.5 text-[9px]">{t.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Eyebrow right={`mood: ${s.mood}`}>Live readout</Eyebrow>
            <h3 className="plate text-[26px] leading-tight">{s.headline}</h3>
            <p className="pt-1.5 text-[14px] muted">{s.line}</p>
          </div>

          <div
            className="rounded-xl border p-3"
            style={{ borderColor: "var(--ns-line-bright)", background: "rgba(139,124,246,.06)" }}
          >
            <div className="eyebrow pb-1.5" style={{ color: "var(--ns-lit)" }}>
              Directive · proposal, not a command
            </div>
            <p className="text-[14px]">{s.directive.text}</p>
            <p className="pt-2 text-[11px] faint">
              Nothing is written until you act. Overrides stay available and are never punished.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--ns-line)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow">Mentor-written directive · optional</span>
              <span
                className="mono text-[10px]"
                style={{
                  color: remoteActive
                    ? remoteUsable
                      ? "var(--ns-warn)"
                      : "var(--ns-faint)"
                    : mentorLocal
                      ? "var(--ns-ok)"
                      : ui.aiEndpointNote
                        ? "var(--ns-warn)"
                        : "var(--ns-faint)",
                }}
              >
                {remoteActive
                  ? remoteUsable
                    ? "remote — leaves device"
                    : "remote — key missing"
                  : ui.aiEndpointNote.trim()
                    ? mentorLocal
                      ? "localhost"
                      : "remote — leaves device"
                    : "no endpoint"}
              </span>
            </div>
            <p className="pt-1 text-[12px] muted">
              {ui.aiEndpointNote.trim() || remoteUsable
                ? `${PERSONAS[persona].label} reads the same routine digest and returns exactly one observation, one question and one action. Validated before it appears.`
                : "Deterministic oversight is fully local. To let a model write the readout, connect Ollama or an OpenAI-compatible localhost server in Settings → AI mentor, or opt in to the remote API."}
            </p>
            <details className="pt-2">
              <summary className="mono text-[10px]" style={{ color: "var(--ns-north)" }}>
                view exact digest ({digest.chars} chars)
              </summary>
              <pre className="mono scroll-thin mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-2 text-[10px]">
                {digest.text}
              </pre>
            </details>
            <div className="flex flex-wrap gap-2 pt-2">
              <button className="btn btn-sm" type="button" disabled={aiBusy} onClick={consult}>
                {aiBusy ? "Reading routine…" : "Send digest & generate"}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => {
                  openMentor();
                  onClose();
                }}
              >
                Full mentor panel
              </button>
            </div>
            {ai && (
              <div className="mt-2 rounded-lg border border-[var(--ns-line-bright)] bg-[var(--ns-bg-1)] p-2.5">
                {ai.ok ? (
                  <>
                    <div className="eyebrow pb-1" style={{ color: "var(--ns-lit)" }}>
                      {PERSONAS[persona].label} · {(ai.ms / 1000).toFixed(1)}s · validated
                    </div>
                    <p className="whitespace-pre-wrap text-[13px]">{ai.reply}</p>
                    <div className="flex gap-2 pt-2">
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
                                question: `[${PERSONAS[persona].label}] overseer directive`,
                                answer: (ai.reply ?? "").slice(0, 800),
                              },
                            ],
                          }));
                          toast("Saved to guide history.", "lit");
                          setAi(null);
                        }}
                      >
                        Keep
                      </button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAi(null)}>
                        Discard
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mono text-[11px]" style={{ color: "var(--ns-warn)" }}>
                      {ai.issues ? "Rejected by the no-shame / one-question validator" : ai.error}
                    </p>
                    {ai.issues?.map((i) => (
                      <p key={i} className="text-[12px] muted">
                        — {i}
                      </p>
                    ))}
                    <p className="pt-1 text-[11px] faint">
                      Rejected text is never saved. Your deterministic directive above stays active.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <Eyebrow right="facts the app can see">Signals</Eyebrow>
            <ul className="space-y-1.5">
              {s.signals.map((sig) => (
                <li key={sig} className="flex gap-2 text-[13px] muted">
                  <span className="mono" style={{ color: "var(--ns-linked)" }}>
                    ›
                  </span>
                  <span>{sig}</span>
                </li>
              ))}
            </ul>
          </div>

          <details className="rounded-xl border border-[var(--ns-line)] p-3">
            <summary className="eyebrow flex items-center justify-between">
              <span>System check</span>
              <span className="faint">open</span>
            </summary>
            <ul className="space-y-1.5 pt-2">
              {diagnostics.map((d) => (
                <li key={d.label} className="mono flex items-baseline gap-2 text-[11px]">
                  <span style={{ color: d.ok ? "var(--ns-ok)" : "var(--ns-warn)" }}>{d.ok ? "✓" : "—"}</span>
                  <span className="faint">{d.label}</span>
                  <span className="muted">{d.value}</span>
                </li>
              ))}
              <li className="mono flex items-baseline gap-2 text-[11px]">
                <span style={{ color: "var(--ns-ok)" }}>✓</span>
                <span className="faint">extension</span>
                <span className="muted">
                  {typeof window !== "undefined" &&
                  (window as unknown as { __NORTHSTAR_EXT__?: unknown }).__NORTHSTAR_EXT__
                    ? "Focus Tracker detected by page"
                    : "not detected — no background alarms or site blocking from this page"}
                </span>
              </li>
              <li className="mono flex items-baseline gap-2 text-[11px]">
                <span style={{ color: "var(--ns-ok)" }}>✓</span>
                <span className="faint">mentor</span>
                <span className="muted">
                  {ui.aiEndpointNote.trim()
                    ? ui.aiEndpointNote.trim()
                    : "no endpoint configured — deterministic guidance only"}
                </span>
              </li>
              <li className="mono flex items-baseline gap-2 text-[11px]">
                <span style={{ color: "var(--ns-ok)" }}>✓</span>
                <span className="faint">motion</span>
                <span className="muted">{ui.motion ?? "auto (OS-aware)"}</span>
              </li>
            </ul>
          </details>

          <p className="text-[11px] leading-relaxed faint">
            VIGIL reads only what is stored in this browser. It cannot see unlogged hours, cannot
            verify effort, and has no independent access to your machine. Persona is a writing tone
            chosen by you — never a claim that the app knows your mind.
          </p>

          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => {
              requestCapture();
              go("today");
              toast("Capture focused. One sentence is enough.", "plain");
            }}
          >
            Quick log a line
          </button>
        </div>
      </div>
    </Modal>
  );
}
