/* Curator — shared text analysis, lexicons and formatting.

   Pure helpers with no state, no storage and no network. Every other Curator
   module builds on these, which keeps one definition of "is this an action
   word", "what category is this item" and "how do we phrase a date". */

import type { CuratorSettings, LociSettings, Locus } from "./loci-types";
import { normalizeText } from "./loci-algorithms";

/* ============================================================
   SETTINGS
   ============================================================ */

export const DEFAULT_CURATOR: CuratorSettings = {
  timeoutMs: 20000,
  maxTokens: 160,
  temperature: 0.7,
  dataScope: "minimal",
  modules: {
    routeDoctor: true,
    cueCritic: true,
    hintLadder: true,
    interferenceGuard: true,
    sessionPlanner: true,
    commandBar: true,
    loadAdvisor: true,
  },
};

export function curatorSettings(settings: Pick<LociSettings, "curator">): CuratorSettings {
  const c = settings.curator;
  return {
    ...DEFAULT_CURATOR,
    ...(c ?? {}),
    modules: { ...DEFAULT_CURATOR.modules, ...(c?.modules ?? {}) },
  };
}

/* ============================================================
   LANGUAGE GUARD — no memory claims, no praise, no blame, no labels
   ============================================================ */

const BANNED_PHRASES = [
  "mastered",
  "mastery",
  "memorized",
  "memorised",
  "locked in",
  "long-term memory",
  "permanently stored",
  "burned into",
  "amazing",
  "awesome",
  "great job",
  "well done",
  "you failed",
  "failure",
  "lazy",
  "visual learner",
  "auditory learner",
  "kinesthetic learner",
  "learner type",
  "you are a",
  "you're a",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function lintCuratorText(text: string): string[] {
  const lower = (text || "").toLowerCase();
  return BANNED_PHRASES.filter((p) => new RegExp(`\\b${escapeRe(p)}\\b`).test(lower));
}

const VISUAL_WORDS = /\b(see|seeing|picture|imagine|visuali[sz]e|look|looks|image|vivid|visual)\b/i;
export const hasVisualLanguage = (t: string) => VISUAL_WORDS.test(t || "");

/* ============================================================
   TOKENS & LEXICONS
   ============================================================ */

export const STOP = new Set(
  (
    "a an the of to in on at by for with into onto over under from and or but is are was were be been it its " +
    "this that these those as up down out off your you my his her their our through against inside around near " +
    "then than so very just all each who what where when how there here has have had will would can could does " +
    "did not no"
  ).split(" "),
);

export const GENERIC = new Set(
  (
    "giant gigantic massive huge colossal enormous oversized tiny little big glowing blinding bright violently " +
    "suddenly directly comically whole entire hundreds thousands single pure solid long short tall wide right left"
  ).split(" "),
);

const ACTION_STEMS = [
  "crash", "crush", "explod", "shatter", "ignit", "spray", "melt", "drill", "slic", "smash", "erupt", "freez",
  "burn", "pound", "blast", "burst", "slam", "wrap", "screech", "spark", "hiss", "snap", "whirl", "roar", "clang",
  "chok", "sizzl", "punch", "strik", "pour", "fall", "drop", "spin", "bounc", "drip", "leak", "flood", "stab",
  "kick", "throw", "fling", "swallow", "chew", "tear", "rip", "shoot", "splash", "squeez", "stomp", "grab",
  "climb", "swing", "danc", "scream", "bark", "flash", "crack", "cuts", "cutting", "bites", "biting", "rolls",
  "rolling", "flies", "flying", "sings", "singing", "hangs", "hanging", "jump", "eats", "eating", "spew", "drag",
  "pull", "push", "grows", "growing", "devour", "gnaw", "stamp", "hurl", "smear", "soak", "drench",
];

const SENSE_STEMS = [
  "cold", "freez", "burn", "boil", "icy", "iced", "icicle", "metal", "iron", "brass", "steel", "copper", "scent",
  "aroma", "smell", "stink", "stench", "fragran", "pungent", "smok", "hiss", "deafen", "screech", "chim",
  "ringing", "buzz", "humm", "crunch", "shatter", "wet", "sticky", "slimy", "slime", "rough", "gritty", "smooth",
  "soft", "sharp", "prickl", "electric", "steam", "brittle", "heavy", "sting", "sour", "sweet", "bitter", "salty",
  "taste", "loud", "whisper", "echo", "sizzl", "roar", "bang", "thud", "creak", "squeak", "squeal", "warm",
  "heat", "damp", "fuzzy", "velvet", "rancid", "perfum", "sweat", "cinnamon", "coffee", "pepper", "pine", "ash",
  "sooty", "frost", "chill", "scald", "scorch", "clatter", "clang", "rattl", "tick",
];
export const SENSE_EXACT = new Set(["hot", "ice", "cool"]);

export const SALIENCE_WORDS = new Set(
  (
    "giant gigantic massive colossal enormous huge tiny microscopic exploding explodes explosion impossible " +
    "violently thousands millions roaring molten flaming screaming laughing dancing singing upside absurd neon " +
    "blazing furious stampede avalanche tidal swarm army gargantuan towering"
  ).split(" "),
);

export const words = (t: string) => normalizeText(t).split(" ").filter(Boolean);

export function stem(w: string): string {
  return w.length > 5 ? w.replace(/(ings|ing|es|ed|s)$/, "") : w.replace(/s$/, "");
}

export function contentTokens(text: string, exclude: Set<string> = new Set()): string[] {
  return words(text)
    .filter((w) => w.length >= 4 && !STOP.has(w) && !GENERIC.has(w))
    .map(stem)
    .filter((s) => !exclude.has(s));
}

export const isActionWord = (w: string) =>
  w.length >= 3 && ACTION_STEMS.some((s) => w.toLowerCase().startsWith(s));

export const isSenseWord = (w: string) =>
  SENSE_EXACT.has(w.toLowerCase()) || (w.length >= 3 && SENSE_STEMS.some((s) => w.toLowerCase().startsWith(s)));

export function findAction(text: string): string | null {
  const w = words(text).find(isActionWord);
  return w ? stem(w) : null;
}

const CATEGORIES: Record<string, string[]> = {
  food: [
    "milk", "cheese", "bread", "egg", "eggs", "apple", "banana", "butter", "rice", "coffee", "tea", "sugar", "salt",
    "pepper", "meat", "fish", "chicken", "flour", "pasta", "juice", "yogurt", "honey", "carrot", "potato", "onion",
    "tomato", "lettuce", "lemon", "grape", "beef", "pork", "bacon", "cereal", "oil", "vinegar", "garlic", "beans",
    "soup", "cake", "cookie", "chocolate", "wine", "beer",
  ],
  animal: [
    "dog", "cat", "horse", "bird", "elephant", "lion", "tiger", "cow", "pig", "sheep", "goat", "mouse", "rat",
    "snake", "frog", "bear", "wolf", "fox", "rabbit", "duck", "owl", "eagle", "shark", "whale", "monkey", "giraffe",
    "zebra", "camel", "ant", "bee", "spider",
  ],
  "chemical element": [
    "hydrogen", "helium", "lithium", "beryllium", "boron", "carbon", "nitrogen", "oxygen", "fluorine", "neon",
    "sodium", "magnesium", "aluminium", "aluminum", "silicon", "phosphorus", "sulfur", "chlorine", "argon",
    "potassium", "calcium", "iron", "copper", "zinc", "silver", "gold", "lead",
  ],
  tool: ["hammer", "screwdriver", "wrench", "saw", "drill", "nail", "pliers", "chisel", "shovel", "rake", "axe", "knife", "scissors", "ladder"],
  colour: ["red", "blue", "green", "yellow", "purple", "black", "white", "pink", "brown", "gray", "grey", "violet", "indigo"],
  "body part": ["hand", "foot", "head", "eye", "ear", "nose", "mouth", "arm", "leg", "heart", "lung", "liver", "kidney", "brain", "knee", "elbow", "finger", "tooth", "skin", "bone"],
  planet: ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"],
  country: ["france", "germany", "spain", "italy", "japan", "china", "india", "brazil", "canada", "mexico", "egypt", "russia", "england", "greece", "peru", "kenya", "nigeria"],
};

export function categoryOf(text: string): string | null {
  const ws = new Set(words(text));
  for (const [cat, list] of Object.entries(CATEGORIES)) {
    if (list.some((w) => ws.has(w))) return cat;
  }
  return null;
}

export const article = (c: string) => (/^[aeiou]/i.test(c) ? `an ${c}` : `a ${c}`);
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** A category shared by >= 60% of the list is the list's theme, not interference. */
export function themeCategory(texts: string[]): string | null {
  if (texts.length < 3) return null;
  const counts = new Map<string, number>();
  texts.forEach((t) => {
    const c = categoryOf(t);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  });
  for (const [c, n] of counts) if (n / texts.length >= 0.6) return c;
  return null;
}

export function themeTokens(texts: string[]): Set<string> {
  const out = new Set<string>();
  if (texts.length < 3) return out;
  const counts = new Map<string, number>();
  texts.forEach((t) => new Set(contentTokens(t)).forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1)));
  counts.forEach((n, w) => {
    if (n / texts.length >= 0.6) out.add(w);
  });
  return out;
}

export const sortRoute = (route: Locus[]) => [...route].sort((a, b) => a.order - b.order);

export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const fmtDayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const daysBetween = (fromIso: string, now: Date) =>
  Math.floor((now.getTime() - new Date(fromIso).getTime()) / 86400000);

