/* Canonical shape enforcement for Loci data.

   Everything that enters the app from outside — localStorage written by an older
   build, a hand-edited backup, a truncated export — passes through here first.
   The UI then trusts that `palace.route` and `palace.items` are arrays, that
   every item has a usable ReviewState, and that no locusId dangles.

   These functions never throw and never drop a palace: unusable fields are
   repaired to safe defaults so a single corrupt record cannot brick the app. */

import type { Locus, Palace, PalaceItem, ReviewSession, ReviewResult, HintDepth } from "./loci-types";
import { sanitizeReviewState } from "./loci-algorithms";

export interface RepairReport {
  repairs: string[];
  dropped: number;
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const rid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const iso = (v: unknown, fallback: string): string => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
};

/** Repair one locus. Returns null only when the record is not an object at all. */
function sanitizeLocus(raw: unknown, index: number, seen: Set<string>): Locus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let id = str(r.id);
  if (!id || seen.has(id)) id = rid("loc");
  seen.add(id);
  return {
    id,
    order: Math.max(1, Math.round(num(r.order, index + 1))),
    spot: str(r.spot),
    landmark: str(r.landmark),
    ...(typeof r.sense === "string" ? { sense: r.sense } : {}),
    ...(typeof r.photoId === "string" ? { photoId: r.photoId } : {}),
    ...(typeof r.photoAlt === "string" ? { photoAlt: r.photoAlt } : {}),
  };
}

function sanitizeItem(
  raw: unknown,
  validLocusIds: Set<string>,
  seen: Set<string>,
  now: Date,
): PalaceItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let id = str(r.id);
  if (!id || seen.has(id)) id = rid("item");
  seen.add(id);
  const locusId = str(r.locusId);
  return {
    id,
    // An item pointing at a missing spot keeps its text but is parked (""),
    // so the editor can re-place it instead of the app crashing on lookup.
    locusId: validLocusIds.has(locusId) ? locusId : "",
    text: str(r.text),
    imageCue: str(r.imageCue),
    ...(typeof r.cueImageId === "string" ? { cueImageId: r.cueImageId } : {}),
    ...(typeof r.cueImageAlt === "string" ? { cueImageAlt: r.cueImageAlt } : {}),
    imageSource: r.imageSource === "ai-edited" ? "ai-edited" : "user",
    review: sanitizeReviewState(r.review as PalaceItem["review"], now),
    ...(typeof r.needsReencode === "boolean" ? { needsReencode: r.needsReencode } : {}),
    // Absent flag means an older record the user already worked with: treat as approved.
    cueApproved: r.cueApproved === undefined ? true : r.cueApproved === true,
  };
}

export function sanitizePalace(raw: unknown, now: Date = new Date(), report?: RepairReport): Palace | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name) || "Untitled palace";
  const note = (msg: string) => report?.repairs.push(`${name}: ${msg}`);

  if (!Array.isArray(r.route)) note("route was missing or not a list; treated as empty");
  if (!Array.isArray(r.items)) note("items were missing or not a list; treated as empty");

  const locusIds = new Set<string>();
  const route = arr(r.route)
    .map((l, i) => sanitizeLocus(l, i, locusIds))
    .filter((l): l is Locus => l !== null)
    .sort((a, b) => a.order - b.order)
    .map((l, i) => ({ ...l, order: i + 1 })); // re-index so order is always 1..n

  const validIds = new Set(route.map((l) => l.id));
  const itemIds = new Set<string>();
  const items = arr(r.items)
    .map((it) => sanitizeItem(it, validIds, itemIds, now))
    .filter((it): it is PalaceItem => it !== null);

  const orphans = items.filter((it) => !it.locusId).length;
  if (orphans) note(`${orphans} item(s) pointed at a missing spot and were unassigned`);

  // One item per spot is the core invariant; keep the first and unassign the rest.
  const takenSpots = new Set<string>();
  for (const it of items) {
    if (!it.locusId) continue;
    if (takenSpots.has(it.locusId)) {
      it.locusId = "";
      note("two items shared one spot; the later one was unassigned");
    } else {
      takenSpots.add(it.locusId);
    }
  }

  const createdAt = iso(r.createdAt, now.toISOString());
  const load = r.load && typeof r.load === "object" ? (r.load as Record<string, unknown>) : null;

  return {
    id: str(r.id) || rid("palace"),
    name,
    location: str(r.location),
    locationConfirmed: r.locationConfirmed === true,
    ...(typeof r.coverImageId === "string" ? { coverImageId: r.coverImageId } : {}),
    route,
    items,
    createdAt,
    updatedAt: iso(r.updatedAt, createdAt),
    ...(r.archived === true ? { archived: true as const } : {}),
    ...(load
      ? {
          load: {
            cycles: Math.max(1, Math.round(num(load.cycles, 1))),
            ...(typeof load.lastClearedAt === "string" ? { lastClearedAt: iso(load.lastClearedAt, createdAt) } : {}),
            ...(load.residual && typeof load.residual === "object"
              ? {
                  residual: Object.fromEntries(
                    Object.entries(load.residual as Record<string, unknown>)
                      .filter(([k]) => validIds.has(k))
                      .map(([k, v]) => [k, Math.max(0, Math.round(num(v, 0)))]),
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

export function sanitizePalaces(raw: unknown, now: Date = new Date()): { palaces: Palace[]; report: RepairReport } {
  const report: RepairReport = { repairs: [], dropped: 0 };
  const list = arr(raw);
  const palaces: Palace[] = [];
  const ids = new Set<string>();
  for (const entry of list) {
    const p = sanitizePalace(entry, now, report);
    if (!p) {
      report.dropped++;
      continue;
    }
    if (ids.has(p.id)) p.id = rid("palace");
    ids.add(p.id);
    palaces.push(p);
  }
  return { palaces, report };
}

const GRADES = ["again", "hard", "good", "easy"] as const;

export function sanitizeSessions(raw: unknown, now: Date = new Date()): ReviewSession[] {
  return arr<Record<string, unknown>>(raw)
    .filter((s) => s && typeof s === "object")
    .map((s) => {
      const startedAt = iso(s.startedAt, now.toISOString());
      const results: ReviewResult[] = arr<Record<string, unknown>>(s.results)
        .filter((r) => r && typeof r === "object" && typeof r.itemId === "string")
        .map((r) => {
          const depth = Math.round(num(r.hintDepth, 0));
          return {
            itemId: r.itemId as string,
            grade: GRADES.includes(r.grade as (typeof GRADES)[number]) ? (r.grade as ReviewResult["grade"]) : "again",
            recalled: r.recalled === true,
            ...(typeof r.typed === "string" ? { typed: r.typed } : {}),
            hintUsed: r.hintUsed === true,
            ...(depth >= 0 && depth <= 5 ? { hintDepth: depth as HintDepth } : {}),
            ...(Number.isFinite(num(r.ms, NaN)) ? { ms: Math.max(0, Math.round(num(r.ms, 0))) } : {}),
          };
        });
      return {
        id: str(s.id) || rid("sess"),
        palaceId: str(s.palaceId),
        startedAt,
        ...(s.endedAt !== undefined ? { endedAt: iso(s.endedAt, startedAt) } : {}),
        mode: (["first-walk", "recall", "reverse", "random"] as const).includes(s.mode as ReviewSession["mode"])
          ? (s.mode as ReviewSession["mode"])
          : "recall",
        results,
      };
    });
}

export function describeRepairs(report: RepairReport): string | null {
  if (!report.repairs.length && !report.dropped) return null;
  const parts: string[] = [];
  if (report.dropped) parts.push(`${report.dropped} unreadable record(s) skipped`);
  if (report.repairs.length) parts.push(report.repairs.slice(0, 4).join("; "));
  if (report.repairs.length > 4) parts.push(`and ${report.repairs.length - 4} more`);
  return parts.join(". ");
}
