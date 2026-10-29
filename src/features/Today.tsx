import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass as CompassIcon,
  Feather,
  Link2,
  Plus,
  Sparkles,
  Target,
  Timer,
  X,
} from "lucide-react";
import { useApp } from "../lib/ctx";
import { Star } from "../components/ui";
import { Vigil, useOverseer } from "../components/Overseer";
import { addDays, buildDay, dayKey, evidenceFor, fmtClock, relDay } from "../lib/data";
import { DOMAIN_META, type Domain, type Entry, type Goal } from "../lib/types";
import { seedCore } from "../lib/seed";

const DOMAINS = Object.keys(DOMAIN_META) as Domain[];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const heroImage = `${import.meta.env.BASE_URL}images/northstar-sky.jpg`;
const examples = seedCore();
const exampleEntries = new Map(examples.entries.map((entry) => [entry.id, entry.text]));
const exampleGoals = new Map(examples.goals.map((goal) => [goal.id, goal.title]));
const isExampleEntry = (entry: Entry) => exampleEntries.get(entry.id) === entry.text;

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/* The hour strip is still driven entirely by the existing entry and waking-hour data. */
export function Starfield({
  date,
  onPickHour,
  interactive = true,
}: {
  date: Date;
  onPickHour?: (hour: number) => void;
  interactive?: boolean;
}) {
  const { core, ui, ignite } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stars = useMemo(() => buildDay(date, core.entries, ui), [date, core.entries, ui]);
  const isToday = dayKey(date) === dayKey(new Date());

  useEffect(() => {
    if (window.innerWidth > 520 || !window.matchMedia("(pointer: coarse)").matches) return;
    // Start near waking hours while keeping the whole day available to scroll.
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, ui.wakeStart - 1) * 44;
  }, [date, ui.wakeStart]);

  return (
    <div ref={scrollRef} className="ns-star-scroll scroll-thin" aria-label="Day timeline">
      <div className="ns-star-track strip-in">
        <div className="ns-star-rail" aria-hidden="true" />
        {stars.map((star) => {
          const lit = isToday && ignite && ignite.hour === star.hour && Date.now() - ignite.at < 3000;
          const canPick = interactive && !!onPickHour && star.state === "empty_past";
          return (
            <div
              key={`${star.hour}-${lit ? ignite?.at : "star"}`}
              data-hour={isToday ? star.hour : undefined}
              className={`ns-star-slot ${lit ? "ripple" : ""}`}
              style={{ ["--i" as string]: star.hour }}
            >
              <Star
                state={star.state}
                count={star.count}
                linked={star.linked}
                ignite={!!lit}
                label={star.label}
                size={25}
                onClick={canPick ? () => onPickHour?.(star.hour) : undefined}
              />
              <span className="ns-star-hour">{star.hour % 3 === 0 ? String(star.hour).padStart(2, "0") : "\u00a0"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayStrip({ date, onDateChange }: { date: Date; onDateChange: (date: Date) => void }) {
  const { core, setPendingSlot, requestCapture } = useApp();
  const selectedKey = dayKey(date);
  const todayKey = dayKey(new Date());
  const dayEntries = core.entries.filter((entry) => dayKey(entry.ts) === selectedKey);
  const litHours = new Set(dayEntries.map((entry) => new Date(entry.ts).getHours())).size;
  const includesExamples = dayEntries.some(isExampleEntry);
  const dateLabel = selectedKey === todayKey ? "Today" : relDay(date.toISOString());

  return (
    <section className="ns-panel ns-day-panel" aria-labelledby="day-strip-title">
      <div className="ns-section-heading">
        <div className="ns-section-title-group">
          <span className="ns-section-icon ns-icon-gold"><Sparkles size={17} strokeWidth={1.7} /></span>
          <div>
            <h2 id="day-strip-title">Your day in stars</h2>
            <p>Every entry lights up a little part of your day.</p>
          </div>
        </div>
        <div className="ns-date-control" aria-label="Choose day">
          <button type="button" aria-label="Previous day" onClick={() => onDateChange(addDays(date, -1))}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="ns-date-label" onClick={() => onDateChange(new Date())} title="Return to today">
            {dateLabel}
          </button>
          <button type="button" aria-label="Next day" disabled={selectedKey >= todayKey} onClick={() => onDateChange(addDays(date, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <Starfield
        date={date}
        onPickHour={(hour) => {
          setPendingSlot({ dateKey: selectedKey, hour });
          requestCapture();
        }}
      />

      <div className="ns-star-footer">
        <div className="ns-star-legend" aria-label="Star legend">
          <span><i className="ns-legend-lit" /> Logged</span>
          <span><i className="ns-legend-linked" /> Linked</span>
          <span><i className="ns-legend-empty" /> Unlogged</span>
        </div>
        <span className="ns-star-count">{litHours} {litHours === 1 ? "hour" : "hours"} lit{includesExamples ? " - includes examples" : ""}</span>
        <span className="ns-star-mobile-hint">Scroll for hours <ArrowRight size={12} /></span>
      </div>
    </section>
  );
}

function Capture() {
  const {
    core,
    saveEntry,
    toast,
    pendingSlot,
    setPendingSlot,
    captureFocus,
    prefill,
    prefillGoal,
    setPrefill,
  } = useApp();
  const [text, setText] = useState("");
  const [domain, setDomain] = useState<Domain | undefined>();
  const [goalId, setGoalId] = useState<string | undefined>();
  const ref = useRef<HTMLTextAreaElement>(null);
  const activeGoals = core.goals.filter((goal) => goal.active);

  useEffect(() => {
    if (!captureFocus) return;
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [captureFocus]);

  useEffect(() => {
    if (!prefill) return;
    setText(prefill);
    setGoalId(prefillGoal);
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "center", behavior: "auto" });
    setPrefill("");
  }, [prefill, prefillGoal, setPrefill]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast("One sentence is enough when you're ready.", "plain");
      ref.current?.focus();
      return;
    }
    let at: Date | undefined;
    if (pendingSlot) {
      const [year, month, day] = pendingSlot.dateKey.split("-").map(Number);
      at = new Date(year, month - 1, day, pendingSlot.hour, new Date().getMinutes(), 0, 0);
    }
    const entry = saveEntry({ text: trimmed, domain, goalId, at });
    const entryDay = dayKey(entry.ts);
    const count = core.entries.filter((item) => dayKey(item.ts) === entryDay).length + 1;
    setText("");
    setDomain(undefined);
    setGoalId(undefined);
    setPendingSlot(null);
    toast(`${fmtClock(entry.ts)} lit - ${count} ${entryDay === dayKey(new Date()) ? "today" : "that day"}`, "lit");
  };

  return (
    <section className="ns-panel ns-capture-panel" aria-labelledby="capture-title">
      <div className="ns-section-heading">
        <div className="ns-section-title-group">
          <span className="ns-section-icon ns-icon-violet"><Feather size={17} strokeWidth={1.7} /></span>
          <div>
            <h2 id="capture-title">Capture a moment</h2>
            <p>Big or small, it is worth noticing.</p>
          </div>
        </div>
        <span className="ns-optional-label">YOUR JOURNAL</span>
      </div>

      {pendingSlot && (
        <div className="ns-backfill-notice">
          <span>Adding to {relDay(`${pendingSlot.dateKey}T12:00:00`)} at {String(pendingSlot.hour).padStart(2, "0")}:00</span>
          <button type="button" aria-label="Cancel backfill" onClick={() => setPendingSlot(null)}><X size={15} /></button>
        </div>
      )}

      <div className="ns-capture-input">
        <textarea
          ref={ref}
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
          }}
          placeholder="What happened today? A sentence is a lovely place to start."
          aria-label="Write a journal entry"
        />
        <div className="ns-capture-bottom">
          <div className="ns-capture-selects">
            <label className="ns-select-wrap">
              <span className="ns-select-dot" style={{ background: domain ? DOMAIN_META[domain].color : undefined }} />
              <select value={domain ?? ""} aria-label="Choose a category" onChange={(event) => setDomain((event.target.value || undefined) as Domain | undefined)}>
                <option value="">Category</option>
                {DOMAINS.map((item) => <option key={item} value={item}>{DOMAIN_META[item].label}</option>)}
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </label>
            <label className="ns-select-wrap ns-goal-select">
              <Link2 size={14} aria-hidden="true" />
              <select value={goalId ?? ""} aria-label="Link to a goal" onChange={(event) => setGoalId(event.target.value || undefined)}>
                <option value="">Link a goal</option>
                {activeGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </label>
          </div>
          <button className="ns-button ns-button-primary ns-save-button" type="button" onClick={submit}>
            Save entry <ArrowRight size={16} />
          </button>
        </div>
      </div>
      <p className="ns-capture-hint">Only you decide what to record. <span>Ctrl + Enter to save</span></p>
    </section>
  );
}

export function TimelineCard({ entry }: { entry: Entry }) {
  const { core, linkEntry } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState(false);
  const goal = core.goals.find((item) => item.id === entry.goalId);
  const domain = entry.domain;
  const long = entry.text.length > 190;

  return (
    <article className="ns-entry-row">
      <span className="ns-entry-dot" style={{ background: domain ? DOMAIN_META[domain].color : "var(--ns-lit)" }} aria-hidden="true" />
      <div className="ns-entry-body">
        <div className="ns-entry-meta">
          <span>{relDay(entry.ts)}</span><span className="ns-meta-separator" />
          <span className="mono">{fmtClock(entry.ts)}</span>
          {domain && <span className="ns-entry-category">{DOMAIN_META[domain].label}</span>}
          {isExampleEntry(entry) && <span className="ns-entry-example">Example</span>}
        </div>
        <p className={!expanded && long ? "clamp3" : ""}>{entry.text}</p>
        {long && <button type="button" className="ns-text-link" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Read more"}</button>}
        <button type="button" className="ns-entry-link" onClick={() => setPicking(!picking)} aria-expanded={picking}>
          <Link2 size={13} /> {goal ? goal.title : "Link to a goal"}
        </button>
        {picking && (
          <div className="ns-link-picker">
            {core.goals.length ? core.goals.map((item) => (
              <button
                key={item.id}
                type="button"
                className="chip"
                data-on={item.id === entry.goalId}
                onClick={() => { linkEntry(entry.id, item.id === entry.goalId ? undefined : item.id); setPicking(false); }}
              >
                {item.title}
              </button>
            )) : <span>No goals yet. Create one in Goals.</span>}
            <button type="button" className="ns-text-link" onClick={() => setPicking(false)}>Done</button>
          </div>
        )}
      </div>
    </article>
  );
}

export function GoalEvidenceStars({ goal }: { goal: Goal }) {
  const { core } = useApp();
  const evidence = evidenceFor(goal, core.entries);
  if (!evidence.length) return <p className="text-[13px] faint">No stars yet. Log or link an entry as evidence.</p>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {evidence.slice(0, 10).map((entry) => (
        <span key={entry.id} title={`${relDay(entry.ts)} - ${entry.text.slice(0, 90)}`}>
          <Star state="logged" count={1} linked={1} size={16} label={`${relDay(entry.ts)} logged`} />
        </span>
      ))}
      {evidence.length > 10 && <span className="mono text-[11px] faint">+{evidence.length - 10}</span>}
      <span className="mono pl-1 text-[11px] faint">{evidence.length} linked</span>
    </div>
  );
}

function CompassPanel() {
  const { core, go } = useApp();
  const goal = core.goals.find((item) => item.active);
  const evidence = goal ? evidenceFor(goal, core.entries).length : 0;
  return (
    <section className="ns-panel ns-direction-panel" aria-labelledby="compass-title">
      <div className="ns-side-heading">
        <div><span className="ns-side-kicker">A LITTLE DIRECTION</span><h2 id="compass-title">Your compass</h2></div>
        <span className="ns-compass-icon"><CompassIcon size={20} strokeWidth={1.55} /></span>
      </div>
      <p className="ns-side-intro">Keep the things that matter in view.</p>
      {goal ? (
        <>
          <div className="ns-direction-goal">
            <span className="ns-direction-goal-icon"><Target size={17} strokeWidth={1.7} /></span>
            <div><span>{exampleGoals.get(goal.id) === goal.title ? "EXAMPLE GOAL" : "YOUR ACTIVE GOAL"}</span><h3>{goal.title}</h3></div>
          </div>
          <div className="ns-direction-next">
            <span>NEXT SMALL STEP</span>
            <p>{goal.nextAction || "Add a small next step to your goal."}</p>
          </div>
          <div className="ns-evidence-count"><span className="ns-evidence-star">&#10022;</span> {evidence} linked {evidence === 1 ? "moment" : "moments"}</div>
        </>
      ) : (
        <div className="ns-direction-empty"><Target size={18} /><p>No active goal yet. Give your day a little direction when you are ready.</p></div>
      )}
      <button type="button" className="ns-side-link" onClick={() => go("goals")}>
        {goal ? "View your goals" : "Create a goal"} <ArrowUpRight size={15} />
      </button>
    </section>
  );
}

function CompanionPanel() {
  const { ui, openGuide, openOverseer } = useApp();
  const overseer = useOverseer();
  return (
    <section className="ns-panel ns-companion-panel" aria-labelledby="companion-title">
      <div className="ns-companion-top">
        <div className="ns-companion-orb">
          {ui.overseer !== false ? <Vigil mood={overseer.mood} size={58} /> : <Sparkles size={23} />}
        </div>
        <div><span className="ns-side-kicker">HERE FOR YOU</span><h2 id="companion-title">A little perspective</h2></div>
      </div>
      <p>When you need to find your way, start with one thoughtful question.</p>
      <button type="button" className="ns-companion-button" onClick={openGuide}>
        <Sparkles size={15} /> Ask NorthStar <ArrowRight size={15} />
      </button>
      {ui.overseer !== false && <button type="button" className="ns-companion-subtle" onClick={openOverseer}>Meet VIGIL <ArrowUpRight size={13} /></button>}
    </section>
  );
}

function PracticePanel() {
  const { practice, openPractice } = useApp();
  const contract = practice.contract;
  const days = contract?.days.map((day) => DAY_NAMES[day]).join(", ");
  return (
    <section className="ns-panel ns-practice-panel" aria-labelledby="practice-title">
      <div className="ns-practice-icon"><Timer size={19} strokeWidth={1.6} /></div>
      <div className="ns-practice-copy">
        <span className="ns-side-kicker">TIME FOR WHAT MATTERS</span>
        <h2 id="practice-title">Your practice</h2>
        <p>{contract ? `${contract.active ? days || "No days selected" : "Paused"}${contract.active ? ` at ${contract.time} - ${contract.duration} min` : ""}` : "Make a little room for the work you care about."}</p>
        <button type="button" className="ns-side-link" onClick={openPractice}>{contract ? "Open practice" : "Set up practice"} <ArrowUpRight size={14} /></button>
      </div>
    </section>
  );
}

export default function Today() {
  const { core, go, requestCapture } = useApp();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const now = new Date();
  // Entries are prepended on save, so recently recorded backfills stay visible too.
  const recent = useMemo(
    () => core.entries.slice(0, 3),
    [core.entries],
  );

  return (
    <div className="ns-today">
      <div className="ns-welcome">
        <div>
          <div className="ns-welcome-kicker"><span /> YOUR PERSONAL SPACE</div>
          <h1>{greeting(now)}<span>.</span></h1>
          <p>A little space to reflect, refocus, and move forward.</p>
        </div>
        <div className="ns-welcome-date"><CalendarDays size={17} /><span>{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></div>
      </div>

      <section className="ns-hero" aria-label="A little space to reconnect">
        <img src={heroImage} alt="" className="ns-hero-image" />
        <div className="ns-hero-shade" />
        <div className="ns-hero-content">
          <div className="ns-hero-kicker"><Sparkles size={14} /> A LITTLE SPACE TO RECONNECT</div>
          <h2>Find your way,<br /><span>one day at a time.</span></h2>
          <p>Small moments can lead to meaningful things.</p>
          <button type="button" className="ns-button ns-button-hero" onClick={requestCapture}>
            <Plus size={17} /> Capture a moment <ArrowRight size={16} />
          </button>
        </div>
        <div className="ns-hero-signature" aria-hidden="true"><span /> YOUR NORTH STAR</div>
      </section>

      <div className="ns-today-grid">
        <div className="ns-today-main">
          <DayStrip date={selectedDate} onDateChange={setSelectedDate} />
          <Capture />
          <section className="ns-panel ns-recent-panel" aria-labelledby="recent-title">
            <div className="ns-section-heading">
              <div className="ns-section-title-group">
                <span className="ns-section-icon ns-icon-blue"><Feather size={17} strokeWidth={1.7} /></span>
                <div><h2 id="recent-title">Recent moments</h2><p>A little look back at what you have recorded.</p></div>
              </div>
              <button type="button" className="ns-text-link ns-history-link" onClick={() => go("history")}>View history <ArrowUpRight size={14} /></button>
            </div>
            <div className="ns-entry-list">
              {recent.length ? recent.map((entry) => <TimelineCard key={entry.id} entry={entry} />) : (
                <div className="ns-empty-recent"><Sparkles size={18} /><p>Your first moment will appear here when you are ready.</p></div>
              )}
            </div>
          </section>
        </div>
        <aside className="ns-today-aside" aria-label="Your compass and companion">
          <CompassPanel />
          <CompanionPanel />
          <PracticePanel />
        </aside>
      </div>
    </div>
  );
}