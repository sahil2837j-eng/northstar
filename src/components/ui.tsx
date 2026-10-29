import { useEffect, useRef, type ReactNode } from "react";
import type { StarState } from "../lib/data";
import { DOMAIN_META, type Domain } from "../lib/types";

export function Eyebrow({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-2">
      <span className="eyebrow">{children}</span>
      {right ? <span className="mono text-[11px] faint">{right}</span> : null}
    </div>
  );
}

export function Bay({
  children,
  className = "",
  hover = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`bay ${hover ? "bay-hover" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-on={value === o.value}
          className="chip"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- star ---------------- */

export function Star({
  state,
  count = 0,
  linked = 0,
  size = 22,
  ignite = false,
  onClick,
  label,
}: {
  state: StarState;
  count?: number;
  linked?: number;
  size?: number;
  ignite?: boolean;
  onClick?: () => void;
  label: string;
}) {
  const logged = state === "logged" || state === "logged_current";
  const current = state === "current" || state === "logged_current";
  const r = logged ? 4 + Math.min(count - 1, 2) * 1.4 : current ? 4.4 : 3.1;
  const body = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={ignite ? "star-ignite" : undefined}
      style={{ display: "block", overflow: "visible" }}
    >
      {state === "outside" && <circle cx="12" cy="12" r="1.1" fill="var(--ns-faint)" opacity="0.25" />}
      {state === "future" && <circle cx="12" cy="12" r="2" fill="var(--ns-faint)" opacity="0.55" />}
      {state === "empty_past" && (
        <circle
          cx="12"
          cy="12"
          r="4.4"
          fill="none"
          stroke="var(--ns-faint)"
          strokeWidth="1.2"
          strokeDasharray="2.4 2.4"
          opacity="0.7"
        />
      )}
      {current && (
        <circle
          cx="12"
          cy="12"
          r="7.6"
          fill="none"
          stroke="var(--ns-north)"
          strokeWidth="1.2"
          className="pulse-ring"
        />
      )}
      {logged && (
        <>
          <circle cx="12" cy="12" r={r + 4} fill="var(--ns-lit)" opacity="0.13" />
          <circle cx="12" cy="12" r={r} fill="var(--ns-lit)" />
        </>
      )}
      {logged && linked > 0 && <circle cx="12" cy="12" r="1.7" fill="var(--ns-linked)" />}
      {current && !logged && <circle cx="12" cy="12" r="1.6" fill="var(--ns-north)" />}
    </svg>
  );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="grid place-items-center rounded-md transition-transform duration-150 hover:scale-125"
        style={{ padding: 2 }}
      >
        {body}
      </button>
    );
  return (
    <span role="img" aria-label={label} title={label} style={{ padding: 2, display: "inline-grid" }}>
      {body}
    </span>
  );
}

export function DomainDot({ domain }: { domain?: Domain }) {
  if (!domain) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 7,
        height: 7,
        borderRadius: 99,
        background: DOMAIN_META[domain].color,
        display: "inline-block",
      }}
    />
  );
}

/* ---------------- mini visuals ---------------- */

export function MiniHeatmap({
  days,
  onPick,
  activeKey,
  metric = "count",
}: {
  days: { key: string; count: number; hours: number }[];
  onPick?: (key: string) => void;
  activeKey?: string;
  metric?: "count" | "hours";
}) {
  const max = Math.max(1, ...days.map((d) => (metric === "count" ? d.count : d.hours)));
  return (
    <div className="wave flex flex-wrap gap-[3px]" role="list" aria-label="Last 31 days">
      {days.map((d) => {
        const v = metric === "count" ? d.count : d.hours;
        const alpha = v === 0 ? 0 : 0.18 + (v / max) * 0.82;
        const active = activeKey === d.key;
        const cell = (
          <span
            style={{
              width: 13,
              height: 13,
              borderRadius: 3,
              background: v === 0 ? "var(--ns-bg-2)" : `rgba(139,124,246,${alpha})`,
              boxShadow: active ? "0 0 0 1px var(--ns-lit)" : undefined,
              border: v === 0 ? "1px solid var(--ns-line)" : undefined,
            }}
          />
        );
        const waveIdx = days.indexOf(d) % 14;
        return onPick ? (
          <button
            key={d.key}
            type="button"
            role="listitem"
            className="rounded transition-transform duration-150 hover:scale-125"
            style={{
              padding: 0,
              background: "none",
              border: 0,
              width: "auto",
              height: "auto",
              ["--w" as string]: waveIdx,
            }}
            aria-label={`${d.key}: ${d.count} entries, ${d.hours} lit hours`}
            title={`${d.key} — ${d.count} entries`}
            onClick={() => onPick(d.key)}
          >
            {cell}
          </button>
        ) : (
          <span
            key={d.key}
            role="listitem"
            aria-label={`${d.key}: ${v}`}
            style={{ display: "inline-flex", ["--w" as string]: waveIdx }}
          >
            {cell}
          </span>
        );
      })}
    </div>
  );
}

export function MiniHistogram({ data, height = 44 }: { data: { hour: number; count: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="grow-y flex items-end gap-[2px]" style={{ height }} aria-hidden="true">
      {data.map((d) => (
        <div
          key={d.hour}
          title={`${String(d.hour).padStart(2, "0")}:00 — ${d.count}`}
          style={{
            flex: 1,
            height: Math.max(2, (d.count / max) * height),
            background: d.count ? "var(--ns-linked)" : "var(--ns-line)",
            opacity: d.count ? 0.35 + (d.count / max) * 0.65 : 0.5,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

export function Bar({ a, b }: { a: number; b: number }) {
  const total = Math.max(1, a + b);
  return (
    <div className="grow-x flex h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
      <div style={{ width: `${(a / total) * 100}%`, background: "var(--ns-linked)" }} />
      <div style={{ width: `${(b / total) * 100}%`, background: "var(--ns-line-bright)" }} />
    </div>
  );
}

/* ---------------- modal / sheet ---------------- */

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastActive = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    lastActive.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const nodes = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      (lastActive.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fade-in absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        className={`panel-in scroll-thin relative max-h-[92vh] w-full overflow-y-auto border border-[var(--ns-line-bright)] bg-[var(--ns-card)] sm:rounded-2xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-xl"
        }`}
        style={{ borderRadius: window.innerWidth < 640 ? "18px 18px 0 0" : undefined }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--ns-line)] bg-[var(--ns-card)] px-5 py-4">
          <div>
            {eyebrow ? <div className="eyebrow pb-1">{eyebrow}</div> : null}
            <h2 className="plate text-2xl">{title}</h2>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕ Esc
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[var(--ns-line)] bg-[var(--ns-card)] px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- toast ---------------- */

export interface ToastMsg {
  id: number;
  text: string;
  tone?: "lit" | "plain";
}

export function Toasts({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2 lg:bottom-5"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="panel-in mono rounded-full border px-4 py-2 text-[13px]"
          style={{
            borderColor: t.tone === "plain" ? "var(--ns-line-bright)" : "var(--ns-lit)",
            background: "rgba(11,11,16,.94)",
            color: t.tone === "plain" ? "var(--ns-text)" : "var(--ns-lit)",
            boxShadow: "0 8px 30px rgba(0,0,0,.5)",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow block pb-1.5">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] faint">{hint}</span> : null}
    </label>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div
        className="plate text-[26px] leading-none"
        style={{ color: tone ?? "var(--ns-text)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div className="eyebrow pt-1.5">{label}</div>
    </div>
  );
}
