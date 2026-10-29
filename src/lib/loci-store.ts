import type {
  LociSettings,
  LociState,
  Locus,
  Palace,
  PalaceItem,
  ReviewResult,
  ReviewSession,
} from "./loci-types";
import {
  clearAllLociImages,
  getLociImage,
  imageBlobToBase64,
  importLociImageFromBase64,
} from "./loci-db";
import { createInitialReviewState, sanitizeReviewState } from "./loci-algorithms";
import { describeRepairs, sanitizePalaces, sanitizeSessions } from "./loci-schema";
import { DEFAULT_CURATOR } from "./curator-core";

/** Merge stored settings over defaults, including the nested Curator block. */
export function mergeSettings(raw: unknown): LociSettings {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const c = s.curator && typeof s.curator === "object" ? (s.curator as Record<string, unknown>) : {};
  const merged = {
    ...DEFAULT_LOCI_SETTINGS,
    ...s,
    curator: {
      ...DEFAULT_CURATOR,
      ...c,
      modules: { ...DEFAULT_CURATOR.modules, ...((c.modules as object) ?? {}) },
    },
  } as LociSettings;

  /* One-time upgrade from the old direct-Ollama defaults. The AI switch only
     exposes user-initiated actions; it never sends anything by itself. */
  if (s.aiSetupVersion !== 2) {
    if (!s.aiEndpoint || s.aiEndpoint === "http://localhost:11434") merged.aiEndpoint = "/ollama";
    if (!s.aiModel || s.aiModel === "llama3.1") merged.aiModel = "qwen2.5:7b-instruct";
    merged.aiEnabled = true;
    merged.aiSetupVersion = 2;
  }
  return merged;
}

export const LOCI_STORAGE_KEY = "loci:v1";

export const DEFAULT_LOCI_SETTINGS: LociSettings = {
  theme: "system",
  reducedMotion: false,
  minimalMode: false,
  textSize: "standard",
  verbalMode: false,
  aiEnabled: true,
  aiEndpoint: "/ollama",
  aiModel: "qwen2.5:7b-instruct",
  aiSetupVersion: 2,
};

export function createSamplePalace(): Palace {
  const now = new Date();
  const pastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const route = [
    {
      id: "loc_1",
      order: 1,
      spot: "Front porch threshold",
      landmark: "Heavy iron boot scraper",
      sense: "Cold rusty iron and wet autumn leaves",
    },
    {
      id: "loc_2",
      order: 2,
      spot: "Oak entryway coat rack",
      landmark: "Antler-shaped brass coat hooks",
      sense: "Damp wool coats and cedar wood",
    },
    {
      id: "loc_3",
      order: 3,
      spot: "Living room brick fireplace",
      landmark: "Cast-iron crackling hearth grate",
      sense: "Hissing wood smoke and dry ash",
    },
    {
      id: "loc_4",
      order: 4,
      spot: "Kitchen corner pantry",
      landmark: "Tall frosted glass pantry door",
      sense: "Roasted coffee beans and cinnamon",
    },
    {
      id: "loc_5",
      order: 5,
      spot: "Bay window breakfast nook",
      landmark: "Worn circular butcher-block table",
      sense: "Warm morning sunbeam and polished wax",
    },
    {
      id: "loc_6",
      order: 6,
      spot: "Back garden patio door",
      landmark: "Heavy sliding bronze latch",
      sense: "Chilly breeze and damp garden herbs",
    },
    {
      id: "loc_7",
      order: 7,
      spot: "Stone garden birdbath",
      landmark: "Carved pedestal filled with clear rainwater",
      sense: "Rippling water drops and mossy stone",
    },
  ];

  const items: PalaceItem[] = [
    {
      id: "item_1",
      locusId: "loc_1",
      text: "Hydrogen",
      imageCue: "A massive, squealing fire hose spraying liquid hydrogen freezes the iron boot scraper into brittle blue glass!",
      imageSource: "user",
      review: {
        ...createInitialReviewState(pastDay),
        reps: 2,
        intervalDays: 3,
        dueAt: now.toISOString(), // due now for test/demo
      },
    },
    {
      id: "item_2",
      locusId: "loc_2",
      text: "Helium",
      imageCue: "A swarm of silver helium balloons ties itself around the brass antler hooks, lifting the entire coat rack to the ceiling!",
      imageSource: "user",
      review: {
        ...createInitialReviewState(pastDay),
        reps: 1,
        intervalDays: 1,
        dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      },
    },
    {
      id: "item_3",
      locusId: "loc_3",
      text: "Lithium",
      imageCue: "A battery-powered lithium sword glows neon purple and cuts sizzling sparks directly into the cast-iron hearth grate!",
      imageSource: "user",
      review: {
        ...createInitialReviewState(pastDay),
        reps: 1,
        intervalDays: 1,
        dueAt: now.toISOString(), // due now
      },
    },
    {
      id: "item_4",
      locusId: "loc_4",
      text: "Beryllium",
      imageCue: "A gleaming green emerald studded with beryllium shatters the frosted glass door, showering the floor in fragrant crystals!",
      imageSource: "user",
      review: {
        ...createInitialReviewState(pastDay),
        reps: 0,
        intervalDays: 0,
        dueAt: now.toISOString(),
      },
    },
    {
      id: "item_5",
      locusId: "loc_5",
      text: "Boron",
      imageCue: "A glowing borax crystal pyramid sits spinning on the butcher-block table, scorching hot geometric rings into the wood!",
      imageSource: "user",
      review: {
        ...createInitialReviewState(pastDay),
        reps: 2,
        intervalDays: 3,
        dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      },
    },
    {
      id: "item_6",
      locusId: "loc_6",
      text: "Carbon",
      imageCue: "A roaring steam locomotive made of solid graphite carbon bursts through the bronze sliding latch, exhaling black coal smoke!",
      imageSource: "user",
      review: {
        ...createInitialReviewState(pastDay),
        reps: 1,
        intervalDays: 1,
        dueAt: now.toISOString(), // due now
      },
    },
    {
      id: "item_7",
      locusId: "loc_7",
      text: "Nitrogen",
      imageCue: "A roaring cauldron of liquid nitrogen bubbles over the stone birdbath, instantly turning the splashing rainwater into solid frozen fog!",
      imageSource: "user",
      review: {
        ...createInitialReviewState(pastDay),
        reps: 0,
        intervalDays: 0,
        dueAt: now.toISOString(),
      },
    },
  ];

  return {
    id: "palace_sample_1",
    name: "Childhood Home Route",
    location: "My Family House in the Country",
    locationConfirmed: true,
    route,
    items,
    createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** The user's own 13-spot home route. Empty of items by design: they place
    their own material. The route is only a scaffold, never a preset answer. */
export function createHomeRoutePalace(): Palace {
  const now = new Date().toISOString();
  const spots: { spot: string; landmark: string; sense: string }[] = [
    { spot: "Main gate", landmark: "Iron gate with the loud latch", sense: "Metal clang" },
    { spot: "Courtyard", landmark: "Hand pump or water tap by the wall", sense: "Dripping water" },
    { spot: "Entrance (dahliz)", landmark: "Pair of chappals on the mat", sense: "Smell of rubber" },
    { spot: "Room 1 doorway", landmark: "Door with the cloth curtain (parda)", sense: "Curtain brushing" },
    { spot: "Room 1 charpai", landmark: "Rope cot with folded quilt (rilai)", sense: "Rope creaks" },
    { spot: "Room 1 window", landmark: "Grilled window with a plant pot", sense: "Sunlight, warm" },
    { spot: "Room 1 sandooq", landmark: "Metal trunk with the padlock", sense: "Heavy clunk" },
    { spot: "Room 2 doorway", landmark: "Door with the chipped paint", sense: "Hinge squeak" },
    { spot: "Room 2 wall niche", landmark: "Small shelf with the wall clock", sense: "Ticking" },
    { spot: "Kitchen doorway", landmark: "Gas cylinder with the red regulator", sense: "Gas hiss" },
    { spot: "Kitchen matka", landmark: "Clay pot on its stand", sense: "Cold water smell" },
    { spot: "Kitchen shelf", landmark: "Steel utensil rack", sense: "Clinking steel" },
    { spot: "Bathroom", landmark: "Marble wall with the copper lota", sense: "Echoing, cold marble" },
  ];

  return {
    id: "palace_home_route_1",
    name: "My Home Route",
    location: "Home",
    locationConfirmed: true,
    route: spots.map((s, i) => ({ id: `loc_home_${i + 1}`, order: i + 1, ...s })),
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

const HOME_ROUTE_SEEDED_KEY = "loci:homeRouteSeeded";
const LEGACY_LOCI_KEY = "northstar.loci.v1";
const LEGACY_LOCI_MIGRATED_KEY = "loci:legacyMigrated";

export interface LegacyLociMigration {
  palaces: Palace[];
  sessions: ReviewSession[];
  settings: Partial<LociSettings>;
  palaceCount: number;
  itemCount: number;
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const asString = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const asNumber = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

function legacyId(prefix: string, raw: unknown): string {
  const id = asString(raw).trim() || "unknown";
  return `legacy_${prefix}_${id}`;
}

/**
 * Convert the old Northern v2 Loci shape (`loci` + `items`) into the current
 * palace shape (`route` + `items.review`). Pure; no storage or network.
 * Preserves cue approval, scheduling, archives, and session history.
 */
export function migrateOldLoci(raw: unknown, now: Date = new Date()): LegacyLociMigration | null {
  const o = asRecord(raw);
  if (!o || o.version !== 1 || !Array.isArray(o.palaces)) return null;

  const palaces: Palace[] = [];
  const sessions: ReviewSession[] = [];
  let itemCount = 0;

  for (const rawPalace of o.palaces) {
    const p = asRecord(rawPalace);
    if (!p || !Array.isArray(p.loci) || !Array.isArray(p.items)) continue;
    if (p.loci.length < 5 || p.loci.length > 15) continue;

    const palaceId = legacyId("palace", p.id);
    const locusMap = new Map<string, string>();
    const route: Locus[] = p.loci.map((rawLocus, index) => {
      const l = asRecord(rawLocus) ?? {};
      const oldId = asString(l.id, `loc_${index + 1}`);
      const newId = legacyId("loc", oldId);
      locusMap.set(oldId, newId);
      return {
        id: newId,
        order: index + 1,
        spot: asString(l.name, `Spot ${index + 1}`).slice(0, 160),
        landmark: asString(l.landmark).slice(0, 240),
        sense: asString(l.sensory).slice(0, 240) || undefined,
      };
    });

    const items: PalaceItem[] = [];
    for (const rawItem of p.items) {
      const i = asRecord(rawItem);
      if (!i) continue;
      const oldLocusId = asString(i.locusId);
      const locusId = locusMap.get(oldLocusId);
      if (!locusId) continue;
      const text = asString(i.text).trim();
      if (!text) continue;
      const grade = ["again", "hard", "good", "easy"].includes(asString(i.lastGrade))
        ? (asString(i.lastGrade) as PalaceItem["review"]["lastGrade"])
        : undefined;
      const review = sanitizeReviewState(
        {
          ease: asNumber(i.ease, 2.5),
          intervalDays: asNumber(i.intervalDays, 0),
          dueAt: asString(i.dueAt) || undefined,
          reps: asNumber(i.reps, 0),
          lapses: asNumber(i.lapses, 0),
          lastReviewedAt: asString(i.lastReviewedAt) || undefined,
          lastGrade: grade,
        },
        now,
      );
      items.push({
        id: legacyId("item", i.id),
        locusId,
        text: text.slice(0, 240),
        imageCue: asString(i.cue).slice(0, 600),
        imageSource: asString(i.cueSource) === "user" ? "user" : "ai-edited",
        cueApproved: i.cueApproved !== false,
        review,
      });
      itemCount += 1;
    }

    palaces.push({
      id: palaceId,
      name: asString(p.name, "Imported palace").slice(0, 120),
      location: asString(p.location, "Imported location").slice(0, 160),
      locationConfirmed: true,
      route,
      items,
      createdAt: asString(p.createdAt) || now.toISOString(),
      updatedAt: asString(p.updatedAt) || now.toISOString(),
      archived: Boolean(p.archivedAt),
      load: {
        cycles: 1,
        lastClearedAt: asString(p.lastReviewAt) || undefined,
      },
    });
  }

  const itemIds = new Set(palaces.flatMap((p) => p.items.map((i) => i.id)));

  if (Array.isArray(o.sessions)) {
    const palaceIds = new Set(palaces.map((p) => p.id));
    for (const rawSession of o.sessions) {
      const s = asRecord(rawSession);
      if (!s) continue;
      const palaceId = legacyId("palace", s.palaceId);
      if (!palaceIds.has(palaceId)) continue;
      const mode = asString(s.mode);
      const mappedMode: ReviewSession["mode"] =
        mode === "first" ? "first-walk" : mode === "weak" ? "random" : "recall";
      const results: ReviewResult[] = Array.isArray(s.results)
        ? s.results
            .map((rawResult): ReviewResult | null => {
              const r = asRecord(rawResult);
              if (!r) return null;
              const g = asString(r.grade);
              if (!["again", "hard", "good", "easy"].includes(g)) return null;
              return {
                itemId: legacyId("item", r.itemId),
                grade: g as ReviewResult["grade"],
                recalled: r.recalled === true,
                typed: asString(r.typed) || undefined,
                hintUsed: false,
                hintDepth: 0,
              };
            })
            .filter((r): r is ReviewResult => r !== null && itemIds.has(r.itemId))
        : [];
      sessions.push({
        id: legacyId("session", s.id),
        palaceId,
        startedAt: asString(s.startedAt) || now.toISOString(),
        endedAt: asString(s.endedAt) || undefined,
        mode: mappedMode,
        results,
      });
    }
  }

  const settings: Partial<LociSettings> = {};
  const oldSettings = asRecord(o.settings);
  if (oldSettings && typeof oldSettings.verbalMode === "boolean") {
    settings.verbalMode = oldSettings.verbalMode;
  }

  return {
    palaces,
    sessions,
    settings,
    palaceCount: palaces.length,
    itemCount,
  };
}

/** Merge the old key once. A marker means a later deletion is respected. */
function mergeLegacyLoci(state: LociState): LociState {
  try {
    if (localStorage.getItem(LEGACY_LOCI_MIGRATED_KEY) === "1") return state;
    const raw = localStorage.getItem(LEGACY_LOCI_KEY);
    if (!raw) return state;
    const migration = migrateOldLoci(JSON.parse(raw));
    if (!migration || migration.palaceCount === 0) return state;

    const palaceIds = new Set(state.palaces.map((p) => p.id));
    const sessionIds = new Set(state.sessions.map((s) => s.id));
    const palaces = [
      ...state.palaces,
      ...migration.palaces.filter((p) => !palaceIds.has(p.id)),
    ];
    const sessions = [
      ...state.sessions,
      ...migration.sessions.filter((s) => !sessionIds.has(s.id)),
    ];
    const merged: LociState = {
      ...state,
      palaces,
      sessions,
      settings: { ...state.settings, ...migration.settings },
    };
    saveLociState(merged);
    localStorage.setItem(LEGACY_LOCI_MIGRATED_KEY, "1");
    return merged;
  } catch {
    return state;
  }
}

export function loadLociState(): LociState {
  try {
    const raw = localStorage.getItem(LOCI_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.palaces)) {
        // Stored data may predate the current shape or have been hand-edited;
        // repair it here so the UI can rely on route/items being arrays.
        const { palaces } = sanitizePalaces(parsed.palaces);
        /* Add the user's home route once. A separate marker means deleting it
           later is respected and it is never silently re-added. The marker is
           only set after the migrated state is saved, so a failed write is
           retried on the next load instead of losing the route. */
        const seeded = localStorage.getItem(HOME_ROUTE_SEEDED_KEY) === "1";
        let appended = false;
        if (!seeded && !palaces.some((p) => p.id === "palace_home_route_1")) {
          palaces.push(createHomeRoutePalace());
          appended = true;
        }
        const state: LociState = {
          version: 1,
          palaces,
          sessions: sanitizeSessions(parsed.sessions),
          settings: mergeSettings(parsed.settings),
        };
        if (!seeded) {
          try {
            if (appended) saveLociState(state);
            localStorage.setItem(HOME_ROUTE_SEEDED_KEY, "1");
          } catch {
            /* private mode or quota — the palace still loads for this session */
          }
        }
        return mergeLegacyLoci(state);
      }
    }
  } catch {
    // Unparseable storage falls through to a fresh starter state below.
  }

  // Initial starter state: one sample palace plus the user's own home route.
  const state: LociState = {
    version: 1,
    palaces: [createSamplePalace(), createHomeRoutePalace()],
    sessions: [],
    settings: DEFAULT_LOCI_SETTINGS,
  };
  saveLociState(state);
  try {
    localStorage.setItem(HOME_ROUTE_SEEDED_KEY, "1");
  } catch {
    /* private mode */
  }
  return mergeLegacyLoci(state);
}

export function saveLociState(state: LociState): void {
  try {
    localStorage.setItem(LOCI_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage quota handling
  }
}

/* ============================================================
   EXPORT / IMPORT ENGINE
   ============================================================ */

export interface ExportedLociBackup {
  format: "loci:v1";
  exportedAt: string;
  data: {
    palaces: Palace[];
    sessions: ReviewSession[];
    settings: LociSettings;
  };
  images?: Record<string, string>; // id -> base64
}

export async function exportLociData(state: LociState, includeImages: boolean): Promise<string> {
  const images: Record<string, string> = {};

  if (includeImages) {
    const imageIds = new Set<string>();
    for (const p of state.palaces) {
      if (p.coverImageId) imageIds.add(p.coverImageId);
      for (const loc of p.route) {
        if (loc.photoId) imageIds.add(loc.photoId);
      }
      for (const it of p.items) {
        if (it.cueImageId) imageIds.add(it.cueImageId);
      }
    }

    for (const id of imageIds) {
      const record = await getLociImage(id);
      if (record && record.blob) {
        try {
          const b64 = await imageBlobToBase64(record.blob);
          images[id] = b64;
        } catch {
          // ignore failed conversion
        }
      }
    }
  }

  const backup: ExportedLociBackup = {
    format: "loci:v1",
    exportedAt: new Date().toISOString(),
    data: {
      palaces: state.palaces,
      sessions: state.sessions,
      settings: state.settings,
    },
    ...(includeImages ? { images } : {}),
  };

  return JSON.stringify(backup, null, 2);
}

export interface ImportPreview {
  valid: boolean;
  error?: string;
  palaceCount: number;
  palaceNames: string[];
  totalSpots: number;
  totalItems: number;
  hasImages: boolean;
  imageCount: number;
  /** Set when the backup needed repairs; shown in the preview before committing. */
  repairNote?: string;
  parsedData?: ExportedLociBackup;
}

export function previewLociImport(rawJson: string): ImportPreview {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || parsed.format !== "loci:v1" || !parsed.data || !Array.isArray(parsed.data.palaces)) {
      return {
        valid: false,
        error: "Not a valid Loci backup. Missing 'loci:v1' format header.",
        palaceCount: 0,
        palaceNames: [],
        totalSpots: 0,
        totalItems: 0,
        hasImages: false,
        imageCount: 0,
      };
    }

    // Repair before preview so the counts shown are the counts actually imported,
    // and a malformed record cannot reach the UI.
    const { palaces, report } = sanitizePalaces(parsed.data.palaces);
    const sessions = sanitizeSessions(parsed.data.sessions);
    const imageCount = parsed.images && typeof parsed.images === "object" ? Object.keys(parsed.images).length : 0;

    if (palaces.length === 0) {
      return {
        valid: false,
        error: "That backup contains no readable palaces. Nothing was changed.",
        palaceCount: 0,
        palaceNames: [],
        totalSpots: 0,
        totalItems: 0,
        hasImages: imageCount > 0,
        imageCount,
      };
    }

    return {
      valid: true,
      palaceCount: palaces.length,
      palaceNames: palaces.map((p) => p.name),
      totalSpots: palaces.reduce((acc, p) => acc + p.route.length, 0),
      totalItems: palaces.reduce((acc, p) => acc + p.items.length, 0),
      hasImages: imageCount > 0,
      imageCount,
      ...(describeRepairs(report) ? { repairNote: describeRepairs(report) as string } : {}),
      parsedData: {
        ...parsed,
        data: { palaces, sessions, settings: mergeSettings(parsed.data.settings) },
      },
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Failed to parse JSON: ${err?.message || "Syntax error"}`,
      palaceCount: 0,
      palaceNames: [],
      totalSpots: 0,
      totalItems: 0,
      hasImages: false,
      imageCount: 0,
    };
  }
}

export async function executeLociImport(
  preview: ImportPreview,
  mode: "merge" | "replace",
  currentState: LociState,
): Promise<LociState> {
  if (!preview.valid || !preview.parsedData) {
    throw new Error(preview.error || "Invalid import data");
  }

  const incoming = preview.parsedData.data;

  // Import images into IndexedDB if present
  if (preview.parsedData.images) {
    for (const [id, b64] of Object.entries(preview.parsedData.images)) {
      try {
        await importLociImageFromBase64(b64, id);
      } catch {
        // ignore individual failed image import
      }
    }
  }

  let nextPalaces: Palace[];
  let nextSessions: ReviewSession[];

  if (mode === "replace") {
    nextPalaces = incoming.palaces;
    nextSessions = incoming.sessions ?? [];
  } else {
    // Merge mode: keep existing palaces and add the incoming ones. When an id
    // collides the palace is re-identified, and its sessions must follow it or
    // the imported history would attach to the wrong palace.
    const existingIds = new Set(currentState.palaces.map((p) => p.id));
    const remapped = new Map<string, string>();
    const mergedIncoming = incoming.palaces.map((p) => {
      if (!existingIds.has(p.id)) return p;
      const newId = "palace_" + Math.random().toString(36).slice(2, 9);
      remapped.set(p.id, newId);
      return { ...p, id: newId, name: `${p.name} (Imported)` };
    });

    const incomingSessions = (incoming.sessions ?? []).map((s) =>
      remapped.has(s.palaceId) ? { ...s, palaceId: remapped.get(s.palaceId) as string } : s,
    );

    nextPalaces = [...currentState.palaces, ...mergedIncoming];
    nextSessions = [...currentState.sessions, ...incomingSessions];
  }

  // Sessions that reference no surviving palace are dropped: they can never be
  // displayed and would grow the store forever.
  const liveIds = new Set(nextPalaces.map((p) => p.id));
  nextSessions = nextSessions.filter((s) => liveIds.has(s.palaceId));

  const newState: LociState = {
    version: 1,
    palaces: nextPalaces,
    sessions: nextSessions,
    settings: mergeSettings({ ...currentState.settings, ...(incoming.settings ?? {}) }),
  };

  saveLociState(newState);
  return newState;
}

export async function clearAllLociData(): Promise<void> {
  try {
    localStorage.removeItem(LOCI_STORAGE_KEY);
    await clearAllLociImages();
  } catch {
    // ignore
  }
}
