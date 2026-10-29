/* NorthStar motion module — tokens + helpers.
   Animation never changes meaning. Timers always read timestamps, never animation progress.
   All components import these tokens; no hardcoded durations in components. */

export type MotionLevel = "off" | "calm" | "full";

export const DUR = {
  micro: 120,
  standard: 200,
  panel: 240,
  flow: 420,
  reward: 600,
} as const;

export const EASE = {
  out: "cubic-bezier(.2,.8,.2,1)",
  inOut: "cubic-bezier(.65,0,.35,1)",
  springLite: "cubic-bezier(.34,1.4,.64,1)",
} as const;

export const STAGGER_MS = 40;
export const STAGGER_CAP = 8;

/* ---------------- level resolution ---------------- */

export function osReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function lowPowerHint(): boolean {
  try {
    return (navigator.hardwareConcurrency ?? 8) <= 4 || window.innerWidth < 768;
  } catch {
    return false;
  }
}

/** User setting overrides OS; OS reduced-motion defaults to Off; small/low-power defaults to Calm, never auto-Full. */
export function resolveMotionLevel(
  userSetting: MotionLevel | undefined,
  reduced: boolean = osReducedMotion(),
  lowPower: boolean = lowPowerHint(),
): MotionLevel {
  if (userSetting) return userSetting;
  if (reduced) return "off";
  if (lowPower) return "calm";
  return "calm";
}

export function applyMotionLevel(level: MotionLevel) {
  try {
    document.documentElement.setAttribute("data-motion", level);
  } catch {
    /* SSR / tests */
  }
}

/** Pause ambient animation when the tab is hidden. Returns a cleanup fn. */
export function installHiddenPause(): () => void {
  const update = () => {
    try {
      document.documentElement.setAttribute("data-hidden", document.hidden ? "true" : "false");
    } catch {
      /* ignore */
    }
  };
  update();
  document.addEventListener("visibilitychange", update);
  return () => document.removeEventListener("visibilitychange", update);
}

/** Re-resolve when the OS reduced-motion preference changes mid-session. */
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  try {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => onChange(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  } catch {
    return () => {};
  }
}

function level(): MotionLevel {
  try {
    return (document.documentElement.getAttribute("data-motion") as MotionLevel) || "calm";
  } catch {
    return "off";
  }
}

const canAnimate = () => level() !== "off" && typeof Element !== "undefined" && "animate" in Element.prototype;

/* ---------------- helpers (transform/opacity only) ---------------- */

export function reveal(el: Element | null, delayMs = 0) {
  if (!el) return;
  if (!canAnimate()) return;
  el.animate(
    [
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: DUR.standard, easing: EASE.out, delay: delayMs, fill: "backwards" },
  );
}

export function staggerIn(list: Iterable<Element>) {
  const arr = [...list];
  arr.forEach((el, i) => reveal(el, Math.min(i, STAGGER_CAP) * STAGGER_MS));
}

export function drawPath(path: SVGPathElement | SVGCircleElement | null, ms = DUR.reward) {
  if (!path) return;
  let len = 0;
  try {
    len = (path as SVGPathElement).getTotalLength?.() ?? 0;
  } catch {
    len = 0;
  }
  if (!len || !canAnimate()) return;
  path.style.strokeDasharray = String(len);
  path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
    duration: ms,
    easing: EASE.inOut,
    fill: "forwards",
  });
}

/** Ring progress from a real fraction (timestamps upstream). Never derives time from animation. */
export function ringProgress(circle: SVGCircleElement | null, fraction: number) {
  if (!circle) return;
  const r = circle.r.baseVal.value;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  circle.style.strokeDasharray = String(c);
  circle.style.strokeDashoffset = String(c * (1 - f));
}

/** Tween a number display; always lands exactly on `to`. Off level = instant. */
export function tweenNumber(
  el: { textContent: string | null } | null,
  from: number,
  to: number,
  ms = 300,
  format: (n: number) => string = (n) => String(Math.round(n)),
  raf: (cb: (t: number) => void) => number = typeof requestAnimationFrame !== "undefined"
    ? requestAnimationFrame
    : (cb) => (setTimeout(() => cb(Date.now()), 16) as unknown as number),
  nowFn: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
): Promise<void> {
  if (!el) return Promise.resolve();
  if (level() === "off" || from === to) {
    el.textContent = format(to);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = nowFn();
    const step = () => {
      const t = Math.min(1, (nowFn() - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(from + (to - from) * eased);
      if (t < 1) raf(step);
      else {
        el.textContent = format(to); // exact landing, guaranteed
        resolve();
      }
    };
    raf(step);
  });
}

/** FLIP: capture position, mutate, invert, play. Transform-only. */
export function flip(el: HTMLElement | null, mutate: () => void) {
  if (!el || !canAnimate()) {
    mutate();
    return;
  }
  const first = el.getBoundingClientRect();
  mutate();
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  if (!dx && !dy) return;
  el.animate(
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
    { duration: DUR.standard, easing: EASE.out },
  );
}

/** Fly a small element from source to target along a slight arc. Skips when either is off-screen or motion is off. */
export function flyTo(sourceEl: Element | null, targetEl: Element | null, ms = 500): boolean {
  if (!sourceEl || !targetEl || !canAnimate()) return false;
  const s = sourceEl.getBoundingClientRect();
  const t = targetEl.getBoundingClientRect();
  const inView = (r: DOMRect) =>
    r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  if (!inView(s) || !inView(t)) return false;

  const dot = document.createElement("div");
  dot.setAttribute("aria-hidden", "true");
  dot.style.cssText = `position:fixed;left:${s.left + s.width / 2 - 5}px;top:${s.top + s.height / 2 - 5}px;width:10px;height:10px;border-radius:99px;background:var(--ns-lit);box-shadow:0 0 10px var(--ns-lit);z-index:90;pointer-events:none;will-change:transform,opacity`;
  document.body.appendChild(dot);
  const dx = t.left + t.width / 2 - (s.left + s.width / 2);
  const dy = t.top + t.height / 2 - (s.top + s.height / 2);
  const anim = dot.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.15)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.7)`, opacity: 0.9 },
    ],
    { duration: ms, easing: EASE.inOut },
  );
  anim.onfinish = () => dot.remove();
  anim.oncancel = () => dot.remove();
  return true;
}

/** Optional haptic. Off by default; no-op when unsupported. */
export function haptic(enabled: boolean, pattern: number | number[] = 12) {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
