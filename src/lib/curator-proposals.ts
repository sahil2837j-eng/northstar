/* The commit layer.
   This is the ONLY module that can move a Curator proposal to "applied" or
   change a finding's status — and only with a UserIntent minted from a trusted
   DOM event (event.isTrusted === true). Analysis code in curator-core.ts and
   curator-llm.ts never imports this file; a static test enforces that. */

import type { AiFinding, AiProposal } from "./curator-core";

const INTENT: unique symbol = Symbol("loci.userIntent");

export interface UserIntent {
  readonly [INTENT]: true;
  readonly at: number;
  readonly via: string;
}

const ALLOWED_EVENTS = new Set(["click", "keydown", "submit", "pointerup"]);

export function userIntentFromEvent(event: { isTrusted?: boolean; type?: string } | null | undefined): UserIntent {
  if (!event || event.isTrusted !== true) {
    throw new Error("Rejected: proposals can only be applied from a real user action.");
  }
  if (!ALLOWED_EVENTS.has(event.type ?? "")) {
    throw new Error(`Rejected: “${event.type}” is not an explicit user action.`);
  }
  return Object.freeze({ [INTENT]: true as const, at: Date.now(), via: event.type as string });
}

export function isUserIntent(x: unknown): x is UserIntent {
  return !!x && typeof x === "object" && (x as Record<symbol, unknown>)[INTENT] === true;
}

export function commitProposal(p: AiProposal, intent: UserIntent, now: Date = new Date()): AiProposal {
  if (!isUserIntent(intent)) throw new Error("Rejected: no explicit user action accompanied this proposal.");
  if (p.status !== "proposed") throw new Error(`Rejected: this proposal is already ${p.status}.`);
  if (new Date(p.expiresAt).getTime() <= now.getTime()) {
    throw new Error("Rejected: this proposal expired. Run the command again for a fresh diff.");
  }
  return { ...p, status: "applied" };
}

export function cancelProposal(p: AiProposal): AiProposal {
  return { ...p, status: "cancelled" };
}

/* ---------------- findings cache (written only from UI handlers) ---------------- */

export const CURATOR_CACHE_KEY = "loci:curator:v1";

export interface FindingsCache {
  findings: Record<string, AiFinding[]>;
  lastRun: Record<string, string>;
}

export function loadFindingsCache(): FindingsCache {
  try {
    const raw = localStorage.getItem(CURATOR_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { findings: parsed.findings ?? {}, lastRun: parsed.lastRun ?? {} };
      }
    }
  } catch {
    /* corrupt cache: start empty */
  }
  return { findings: {}, lastRun: {} };
}

export function saveFindingsCache(cache: FindingsCache): void {
  try {
    localStorage.setItem(CURATOR_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota: findings simply are not cached */
  }
}

/** Keep the user's earlier decision (accepted / dismissed) for findings that are detected again. */
export function mergeFindings(previous: AiFinding[], fresh: AiFinding[]): AiFinding[] {
  const prev = new Map(previous.map((f) => [f.id, f]));
  return fresh.map((f) => {
    const p = prev.get(f.id);
    return p && p.status !== "proposed" ? { ...f, status: p.status, dismissedAt: p.dismissedAt } : f;
  });
}

export function setFindingStatus(
  cache: FindingsCache,
  palaceId: string,
  findingId: string,
  status: AiFinding["status"],
  intent: UserIntent,
  now: Date = new Date(),
): FindingsCache {
  if (!isUserIntent(intent)) throw new Error("Rejected: finding status changes need an explicit user action.");
  const list = cache.findings[palaceId] ?? [];
  return {
    ...cache,
    findings: {
      ...cache.findings,
      [palaceId]: list.map((f) =>
        f.id === findingId ? { ...f, status, dismissedAt: status === "dismissed" ? now.toISOString() : undefined } : f,
      ),
    },
  };
}
