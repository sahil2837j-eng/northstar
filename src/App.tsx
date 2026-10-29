import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Brain,
  Castle,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  Compass,
  History,
  House,
  LockKeyhole,
  Menu,
  NotebookPen,
  Plus,
  Settings,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import { LociView } from "./features/loci/LociView";
import { AppCtx, type AppApi, type Route } from "./lib/ctx";
import {
  DEFAULT_CURRICULUM,
  DEFAULT_GUIDE,
  DEFAULT_MEMORY,
  DEFAULT_PREFS,
  DEFAULT_UI,
  KEYS,
  readRaw,
  sanitizeMemory,
  writeKey,
} from "./lib/store";
import { markSeeded, seedCore } from "./lib/seed";
import type {
  Contract,
  CoreState,
  CurriculumProgress,
  Domain,
  Entry,
  GuideState,
  LedgerEvent,
  MemoryState,
  PracticePrefs,
  PracticeState,
  Session,
  UIState,
} from "./lib/types";
import { rid } from "./lib/store";
import { Toasts, type ToastMsg } from "./components/ui";
import Today from "./features/Today";
import { GoalsPanel, HistoryPanel, InsightsPanel, ReviewPanel, SettingsPanel } from "./features/Panels";
import MemoryPanel from "./features/Memory";
import { GuidePanel } from "./features/Guide";
import { MentorPanel, useAutoBrief } from "./features/Mentor";
import { OverseerDock, OverseerConsole, Vigil, useOverseer } from "./components/Overseer";
import { PracticeDialog, PracticeRuntime } from "./features/Practice";
import { dayKey } from "./lib/data";
import {
  applyMotionLevel,
  installHiddenPause,
  osReducedMotion,
  resolveMotionLevel,
  watchReducedMotion,
  haptic,
} from "./lib/motion";
import "./workspace.css";

/* ---------------- loading ---------------- */

function loadCore(): CoreState {
  try {
    const raw = localStorage.getItem(KEYS.core);
    if (raw) return JSON.parse(raw) as CoreState;
  } catch {
    /* fall through to seed */
  }
  const seeded = seedCore();
  writeKey(KEYS.core, seeded);
  markSeeded();
  return seeded;
}

const loadPractice = (): PracticeState => ({
  contract: readRaw<Contract | null>(KEYS.contract, null),
  schedule: readRaw<PracticeState["schedule"]>(KEYS.schedule, null),
  sessions: readRaw<Session[]>(KEYS.sessions, []),
  ledger: readRaw<LedgerEvent[]>(KEYS.ledger, []),
  curriculum: { ...DEFAULT_CURRICULUM, ...readRaw<CurriculumProgress>(KEYS.curriculum, DEFAULT_CURRICULUM) },
  prefs: { ...DEFAULT_PREFS, ...readRaw<PracticePrefs>(KEYS.prefs, DEFAULT_PREFS) },
});

/** Merge stored UI state, then upgrade the old llama3.1/localhost defaults once. */
function loadUi(): UIState {
  const stored = readRaw<UIState>(KEYS.ui, DEFAULT_UI);
  const next: UIState = { ...DEFAULT_UI, ...stored };
  if (stored.aiSetupVersion !== 2) {
    if (!stored.aiEndpointNote?.trim() || stored.aiEndpointNote === "http://localhost:11434") {
      next.aiEndpointNote = "/ollama";
    }
    if (!stored.mentorModel?.trim() || stored.mentorModel === "llama3.1") {
      next.mentorModel = "qwen2.5:7b-instruct";
    }
    /* The mentor action is user-initiated; enabling it never sends data by itself. */
    next.aiMentorEnabled = true;
    next.aiSetupVersion = 2;
  }
  next.motion = stored.motion ?? resolveMotionLevel(undefined);
  return next;
}

const NAV: { id: Route; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: House },
  { id: "goals", label: "Goals", icon: Target },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "loci", label: "Loci", icon: Castle },
  { id: "review", label: "Review", icon: NotebookPen },
  { id: "insights", label: "Insights", icon: ChartNoAxesColumnIncreasing },
  { id: "history", label: "History", icon: History },
];

const ROUTE_LABELS: Record<Route, string> = {
  today: "Today",
  goals: "Goals",
  memory: "Strategic Memory",
  loci: "Loci Spatial Palaces",
  review: "Review",
  insights: "Insights",
  history: "History",
  settings: "Settings",
};

/** Mounts the once-per-day localhost auto-brief hook inside the provider tree. */
function AutoBriefRunner({ onReady }: { onReady: (reply: string) => void }) {
  useAutoBrief(onReady);
  return null;
}

/** Max 40 faint CSS-only stars; CSS hides them unless Full + toggle. No per-frame JS. */
function TwinkleField() {
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: `${(i * 37 + 11) % 100}%`,
        top: `${(i * 53 + 7) % 100}%`,
        delay: `${(i % 10) * 0.4}s`,
      })),
    [],
  );
  return (
    <>
      {stars.map((s, i) => (
        <span
          key={i}
          className="twinkle-star"
          aria-hidden="true"
          style={{ left: s.left, top: s.top, ["--td" as string]: s.delay }}
        />
      ))}
    </>
  );
}

function Mark({ size = 35 }: { size?: number }) {
  return (
    <span className="ns-brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
        <path d="M12 1.8 14.15 9.85 22.2 12l-8.05 2.15L12 22.2l-2.15-8.05L1.8 12l8.05-2.15L12 1.8Z" fill="currentColor" />
        <path d="M18.8 2.4v3.8M16.9 4.3h3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function SidebarCompanion({ onOpen }: { onOpen: () => void }) {
  const snapshot = useOverseer();
  return (
    <button type="button" className="ns-sidebar-companion" onClick={onOpen}>
      <span className="ns-sidebar-vigil"><Vigil mood={snapshot.mood} size={40} /></span>
      <span className="ns-sidebar-companion-copy">
        <strong>Meet VIGIL</strong>
        <span>Your thoughtful companion</span>
      </span>
      <ArrowUpRight size={15} aria-hidden="true" />
    </button>
  );
}

export default function App() {
  const [core, setCore] = useState<CoreState>(loadCore);
  const [ui, setUi] = useState<UIState>(loadUi);
  const [guide, setGuide] = useState<GuideState>(() => ({
    ...DEFAULT_GUIDE,
    ...readRaw<GuideState>(KEYS.guide, DEFAULT_GUIDE),
  }));
  const [memory, setMemory] = useState<MemoryState>(() =>
    sanitizeMemory(readRaw<MemoryState>(KEYS.memory, DEFAULT_MEMORY)),
  );
  const [practice, setPractice] = useState<PracticeState>(loadPractice);

  const [route, setRoute] = useState<Route>("today");
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [mentorOpen, setMentorOpen] = useState(false);
  const [overseerOpen, setOverseerOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [inLociFocus, setInLociFocus] = useState(false);
  const [autoBrief, setAutoBrief] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [prefill, setPrefillState] = useState("");
  const [prefillGoal, setPrefillGoal] = useState<string | undefined>(undefined);
  const [ignite, setIgnite] = useState<{ hour: number; at: number } | null>(null);
  const [captureFocus, setCaptureFocus] = useState(0);
  const [pendingSlot, setPendingSlot] = useState<{ dateKey: string; hour: number } | null>(null);
  const suppressWrites = useRef(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);

  /* persistence */
  useEffect(() => {
    if (suppressWrites.current) return;
    writeKey(KEYS.core, core);
  }, [core]);
  useEffect(() => {
    if (suppressWrites.current) return;
    writeKey(KEYS.ui, ui);
  }, [ui]);
  useEffect(() => {
    if (suppressWrites.current) return;
    writeKey(KEYS.guide, guide);
  }, [guide]);
  useEffect(() => {
    if (suppressWrites.current) return;
    writeKey(KEYS.memory, memory);
  }, [memory]);
  useEffect(() => {
    if (suppressWrites.current) return;
    writeKey(KEYS.contract, practice.contract);
    writeKey(KEYS.schedule, practice.schedule);
    writeKey(KEYS.sessions, practice.sessions);
    writeKey(KEYS.ledger, practice.ledger);
    writeKey(KEYS.curriculum, practice.curriculum);
    writeKey(KEYS.prefs, practice.prefs);
  }, [practice]);

  /* ---------- motion layer: resolve level, pause when hidden, track OS change ---------- */
  useEffect(() => {
    applyMotionLevel(resolveMotionLevel(ui.motion));
    document.documentElement.setAttribute("data-atmo", ui.atmosphere ? "true" : "false");
    document.documentElement.setAttribute("data-twinkle", ui.twinkle ? "true" : "false");
  }, [ui.motion, ui.atmosphere, ui.twinkle]);

  useEffect(() => {
    const stopPause = installHiddenPause();
    const stopWatch = watchReducedMotion(() => applyMotionLevel(resolveMotionLevel(ui.motion, osReducedMotion())));
    return () => {
      stopPause();
      stopWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A quiet instrument clock — data, not animation. */
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
      if (event.key === "Tab" && sidebarRef.current) {
        const buttons = sidebarRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (desktop.matches) setNavOpen(false);
    };
    const focusTimer = window.setTimeout(() => menuCloseRef.current?.focus(), 20);
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onResize);
      window.clearTimeout(focusTimer);
      if (!desktop.matches) menuTriggerRef.current?.focus();
    };
  }, [navOpen]);

  /* Sky tint by time of day — hourly, 2s crossfade via CSS transition */
  useEffect(() => {
    const tint = () => {
      if (!ui.skyTint) {
        document.body.style.backgroundColor = "";
        return;
      }
      const h = new Date().getHours();
      const c =
        h >= 5 && h < 8
          ? "#0a0912" // dawn — faint violet
          : h >= 8 && h < 17
            ? "#07070a" // day — void
            : h >= 17 && h < 20
              ? "#0b0810" // dusk — warm shadow
              : "#060609"; // night — deepest
      document.body.style.backgroundColor = c;
    };
    tint();
    const id = window.setInterval(tint, 3600000);
    return () => window.clearInterval(id);
  }, [ui.skyTint]);

  const toast = useCallback((text: string, tone: "lit" | "plain" = "plain") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const updateCore = useCallback((fn: (p: CoreState) => CoreState) => setCore((p) => fn(p)), []);
  const updateUi = useCallback((fn: (p: UIState) => UIState) => setUi((p) => fn(p)), []);
  const updateGuide = useCallback((fn: (p: GuideState) => GuideState) => setGuide((p) => fn(p)), []);
  const updateMemory = useCallback(
    (fn: (p: MemoryState) => MemoryState) => setMemory((p) => sanitizeMemory(fn(p))),
    [],
  );
  const updatePractice = useCallback(
    (fn: (p: PracticeState) => PracticeState) => setPractice((p) => fn(p)),
    [],
  );

  const saveEntry = useCallback(
    ({ text, domain, goalId, at }: { text: string; domain?: Domain; goalId?: string; at?: Date }) => {
      const ts = (at ?? new Date()).toISOString();
      const entry: Entry = {
        id: rid(),
        ts,
        text,
        domain,
        goalId,
        source: "manual",
      };
      setCore((p) => ({ ...p, entries: [entry, ...p.entries] }));
      haptic(!!ui.haptics);
      const when = new Date(ts);
      if (dayKey(when) === dayKey(new Date())) {
        setIgnite({ hour: when.getHours(), at: Date.now() });
        window.setTimeout(() => setIgnite((i) => (i && Date.now() - i.at > 2400 ? null : i)), 3000);
      }
      return entry;
    },
    [ui.haptics],
  );

  const linkEntry = useCallback((id: string, goalId: string | undefined) => {
    setCore((p) => ({
      ...p,
      entries: p.entries.map((e) => (e.id === id ? { ...e, goalId } : e)),
    }));
  }, []);

  const setPrefill = useCallback((s: string, goalId?: string) => {
    setPrefillState(s);
    setPrefillGoal(goalId);
  }, []);

  /* clear prefill goal once consumed */
  useEffect(() => {
    if (prefill === "" && prefillGoal) setPrefillGoal(undefined);
  }, [prefill, prefillGoal]);

  const api: AppApi = useMemo(
    () => ({
      prefill,
      prefillGoal,
      core,
      updateCore,
      ui,
      updateUi,
      guide,
      updateGuide,
      memory,
      updateMemory,
      practice,
      updatePractice,
      route,
      go: setRoute,
      toast,
      saveEntry,
      linkEntry,
      openGuide: () => setGuideOpen(true),
      openMentor: () => setMentorOpen(true),
      openOverseer: () => setOverseerOpen(true),
      openPractice: () => setPracticeOpen(true),
      setPrefill,
      ignite,
      captureFocus,
      requestCapture: () => setCaptureFocus(Date.now()),
      pendingSlot,
      setPendingSlot,
    }),
    [
      prefill,
      prefillGoal,
      core,
      updateCore,
      ui,
      updateUi,
      guide,
      updateGuide,
      memory,
      updateMemory,
      practice,
      updatePractice,
      route,
      toast,
      saveEntry,
      linkEntry,
      setPrefill,
      ignite,
      captureFocus,
      pendingSlot,
    ],
  );

  return (
    <AppCtx.Provider value={api}>
      <div className="atmo ns-app-shell">
        <div className="ns-workspace">
          {navOpen && !inLociFocus && (
            <button
              type="button"
              className="ns-drawer-backdrop"
              aria-label="Close navigation"
              onClick={() => setNavOpen(false)}
            />
          )}
          {!inLociFocus && (
            <aside ref={sidebarRef} className={`ns-sidebar ${navOpen ? "is-open" : ""}`} id="primary-navigation">
            <div className="ns-sidebar-brand">
              <button type="button" className="ns-brand" onClick={() => { setRoute("today"); setNavOpen(false); }} aria-label="NorthStar, go to Today">
                <Mark />
                <span><strong>northstar</strong><small>YOUR SPACE TO GROW</small></span>
              </button>
              <button ref={menuCloseRef} type="button" className="ns-icon-button ns-drawer-close" aria-label="Close navigation" onClick={() => setNavOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <nav className="ns-nav" aria-label="Primary navigation">
              <p className="ns-nav-label">YOUR WORKSPACE</p>
              <ul className="ns-nav-list">
                {NAV.map(({ id, label, icon: Icon }) => (
                  <li key={id}>
                    <button
                      type="button"
                      className={`ns-nav-item ${route === id ? "is-active" : ""}`}
                      aria-current={route === id ? "page" : undefined}
                      onClick={() => { setRoute(id); setNavOpen(false); }}
                    >
                      <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                      <span>{label}</span>
                      {route === id && <span className="ns-nav-active-dot" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="ns-nav-label ns-nav-label-secondary">PREFERENCES</p>
              <button
                type="button"
                className={`ns-nav-item ${route === "settings" ? "is-active" : ""}`}
                aria-current={route === "settings" ? "page" : undefined}
                onClick={() => { setRoute("settings"); setNavOpen(false); }}
              >
                <Settings size={18} strokeWidth={1.7} aria-hidden="true" />
                <span>Settings</span>
                {route === "settings" && <span className="ns-nav-active-dot" aria-hidden="true" />}
              </button>
            </nav>

            <div className="ns-sidebar-bottom">
              {ui.overseer !== false && (
                <SidebarCompanion onOpen={() => { setNavOpen(false); setOverseerOpen(true); }} />
              )}
              <button type="button" className="ns-private-note" onClick={() => { setRoute("settings"); setNavOpen(false); }}>
                <LockKeyhole size={15} aria-hidden="true" />
                <span><strong>Stored on this device</strong><small>Local data is unencrypted</small></span>
              </button>
            </div>
          </aside>
          )}

          <div className="ns-main">
            {!inLociFocus && (
              <header className="ns-topbar">
                <div className="ns-topbar-left">
                  <button
                    ref={menuTriggerRef}
                    type="button"
                    className="ns-icon-button ns-menu-trigger"
                    aria-label="Open navigation"
                    aria-controls="primary-navigation"
                    aria-expanded={navOpen}
                    onClick={() => setNavOpen(true)}
                  >
                    <Menu size={21} />
                  </button>
                  <span className="ns-mobile-brand"><Mark size={32} /><strong>northstar</strong></span>
                  <div className="ns-breadcrumb" aria-label={`Workspace, ${ROUTE_LABELS[route]}`}>
                    <span>My workspace</span><ChevronRight size={14} aria-hidden="true" /><strong>{ROUTE_LABELS[route]}</strong>
                  </div>
                </div>
                <div className="ns-topbar-actions">
                  <span className="ns-local-time"><span className="ns-status-dot" /> {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} <span>local</span></span>
                  <button type="button" className="ns-topbar-ask" aria-label="Ask NorthStar" onClick={() => setGuideOpen(true)}>
                    <Compass size={16} strokeWidth={1.7} /> <span>Ask NorthStar</span>
                  </button>
                  <button type="button" className="ns-topbar-new" onClick={() => { setRoute("today"); setCaptureFocus(Date.now()); }}>
                    <Plus size={17} /> <span>New entry</span>
                  </button>
                </div>
              </header>
            )}

            <main className={`ns-main-content ${inLociFocus ? "!max-w-none !p-4" : ""}`}>

            {autoBrief && (
              <div
                className="panel-in mb-5 rounded-2xl border p-4"
                style={{ borderColor: "var(--ns-lit)", background: "var(--ns-card)" }}
                role="status"
              >
                <div className="eyebrow pb-2" style={{ color: "var(--ns-lit)" }}>
                  Morning briefing · localhost · validated
                </div>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{autoBrief}</p>
                <div className="flex gap-2 pt-3">
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => {
                      updateGuide((g) => ({
                        ...g,
                        answers: [
                          ...g.answers,
                          { ts: new Date().toISOString(), question: "[auto] morning briefing", answer: autoBrief.slice(0, 800) },
                        ],
                      }));
                      setAutoBrief(null);
                      toast("Kept in guide history.", "lit");
                    }}
                  >
                    Keep
                  </button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setAutoBrief(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div key={route} className="page-in">
              {route === "today" && <Today />}
              {route === "goals" && <GoalsPanel />}
              {route === "memory" && <MemoryPanel />}
              {route === "loci" && <LociView onFocusChange={setInLociFocus} />}
              {route === "review" && <ReviewPanel />}
              {route === "insights" && <InsightsPanel />}
              {route === "history" && <HistoryPanel />}
              {route === "settings" && <SettingsPanel />}
            </div>

            {!inLociFocus && (
              <footer className="ns-footer">
                <span><LockKeyhole size={14} aria-hidden="true" /> Your space, stored on this device.</span>
                <button type="button" onClick={() => setRoute("settings")}>Privacy and backups <ArrowUpRight size={13} /></button>
              </footer>
            )}
          </main>
          </div>
        </div>

        <OverseerDock onOpen={() => setOverseerOpen(true)} />
        <OverseerConsole open={overseerOpen} onClose={() => setOverseerOpen(false)} />
        <GuidePanel open={guideOpen} onClose={() => setGuideOpen(false)} />
        <MentorPanel open={mentorOpen} onClose={() => setMentorOpen(false)} />
        <AutoBriefRunner onReady={setAutoBrief} />
        <PracticeDialog open={practiceOpen} onClose={() => setPracticeOpen(false)} />
        <PracticeRuntime />
        <Toasts toasts={toasts} />
        <TwinkleField />
      </div>
    </AppCtx.Provider>
  );
}
