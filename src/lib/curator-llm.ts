/* Curator — model adapter.
   Rules enforced here:
   - Local by default. Any non-loopback endpoint is rejected before a request
     is made unless the user has explicitly enabled the remote cloud API.
   - Every call is user-initiated by the caller; nothing here polls or prefetches.
   - 20s timeout, one retry, then the deterministic fallback.
   - Every response is schema-validated and language-linted. Malformed output is
     discarded and never shown raw.
   - Minimal data scope by default: only the field under discussion, its
     landmark and sibling keywords leave the app.
   - Returns values only. No storage access, no state writes. */

import { isLocalEndpoint } from "./ai-endpoints";
import { aiChat, parseJsonLoose } from "./remote-ai";
import type { LociSettings, Palace } from "./loci-types";
import {
  COMMAND_INTENTS,
  contentTokens,
  critiqueCueLocal,
  curatorSettings,
  hasVisualLanguage,
  hintLeaksAnswer,
  lintCuratorText,
  type AiFinding,
  type CommandIntentName,
  type CritiqueInput,
  type CritiqueResult,
  type ParsedIntent,
} from "./curator-core";
import { generateFallbackCue, suggestImageCue } from "./loci-algorithms";

export const AI_UNAVAILABLE = "AI unavailable — using built-in checks";
export { isLocalEndpoint };

export class NonLocalEndpointError extends Error {
  constructor(url: string) {
    super(`Rejected endpoint “${url}”: the Curator only connects to localhost.`);
    this.name = "NonLocalEndpointError";
  }
}

export function assertLocalEndpoint(url: string): void {
  if (!isLocalEndpoint(url)) throw new NonLocalEndpointError(url);
}

export interface AiOutcome<T> {
  value: T;
  source: "ai" | "fallback";
  notice?: string;
}

export function baseEndpoint(raw: string): string {
  return (raw || "http://localhost:11434")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/(generate|chat)$/, "");
}

async function callJSON(settings: LociSettings, system: string, user: string, temperature: number): Promise<unknown | null> {
  const endpoint = baseEndpoint(settings.aiEndpoint);
  const cs = curatorSettings(settings);
  const model = settings.aiModel || "qwen2.5:7b-instruct";
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await aiChat({
      messages,
      localEndpoint: endpoint,
      localModel: model,
      temperature,
      maxTokens: cs.maxTokens,
      json: true,
      timeoutMs: cs.timeoutMs,
    });
    if (!result.ok || !result.text) continue;
    const parsed = parseJsonLoose(result.text);
    if (parsed !== null) return parsed;
  }
  return null;
}

async function safeCall(settings: LociSettings, system: string, user: string, temperature: number): Promise<unknown | null> {
  try {
    return await callJSON(settings, system, user, temperature);
  } catch (e) {
    if (e instanceof NonLocalEndpointError) console.warn(e.message);
    return null;
  }
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const isInt03 = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3;
const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/* ---------------- Cue Critic ---------------- */

function validateCritique(raw: unknown, aphantasia: boolean) {
  const o = asRecord(raw);
  if (!o) return null;
  const fourth = aphantasia ? (o.narrative ?? o.salience) : o.salience;
  if (![o.interaction, o.sensory, fourth, o.distinctness].every(isInt03)) return null;
  if (typeof o.question !== "string") return null;
  const q = o.question.trim();
  if (!q || wordCount(q) > 20 || (q.match(/\?/g) ?? []).length !== 1 || !q.endsWith("?")) return null;
  if (lintCuratorText(q).length || (aphantasia && hasVisualLanguage(q))) return null;

  const notesIn = asRecord(o.notes) ?? {};
  const notes: Partial<Record<"interaction" | "sensory" | "salience" | "distinctness", string>> = {};
  (["interaction", "sensory", "salience", "distinctness"] as const).forEach((k) => {
    const v = k === "salience" && aphantasia ? (notesIn.narrative ?? notesIn.salience) : notesIn[k];
    if (typeof v === "string" && v.length <= 160 && !lintCuratorText(v).length && !(aphantasia && hasVisualLanguage(v))) notes[k] = v.trim();
  });

  return {
    scores: {
      interaction: o.interaction as number,
      sensory: o.sensory as number,
      salience: fourth as number,
      distinctness: o.distinctness as number,
    },
    notes,
    question: q,
  };
}

export async function critiqueCue(input: CritiqueInput, settings: LociSettings): Promise<AiOutcome<CritiqueResult>> {
  const local = critiqueCueLocal(input);
  const cs = curatorSettings(settings);
  if (!settings.aiEnabled || !cs.modules.cueCritic) return { value: local, source: "fallback" };

  const aph = input.aphantasia === true;
  const axis4 = aph ? "narrative" : "salience";
  const keywords = [...new Set(input.siblingCues.flatMap((c) => contentTokens(c)))].slice(0, 24);
  const system = [
    "You are the Cue Critic inside a memory-palace trainer. You critique; you never write the cue.",
    `Score the user's cue 0-3 on: interaction (does it physically act on THIS landmark?), sensory (a concrete sound, texture, smell, weight or temperature?), ${
      aph ? "narrative (is there a causal story: something happens because of something else?)" : "salience (exaggeration, motion, absurdity or emotional charge?)"
    }, distinctness (does it avoid the sibling keywords?).`,
    "Then ask exactly ONE short question (max 20 words) targeting the weakest axis. Never offer a replacement sentence.",
    aph ? "Never use visual words such as see, picture, imagine, look, image or vivid." : "",
    "No praise, no blame, no claims about memory or the user.",
    `Respond with JSON only: {"interaction":0-3,"sensory":0-3,"${axis4}":0-3,"distinctness":0-3,"question":"...","notes":{"interaction":"...","sensory":"...","${axis4}":"...","distinctness":"..."}}`,
  ]
    .filter(Boolean)
    .join("\n");
  const user = JSON.stringify({ cue: input.cue, landmark: input.landmark, spot: input.spot, siblingCueKeywords: keywords });

  const parsed = validateCritique(await safeCall(settings, system, user, cs.temperature), aph);
  if (!parsed) return { value: local, source: "fallback", notice: AI_UNAVAILABLE };
  return {
    value: { ...local, scores: parsed.scores, notes: { ...local.notes, ...parsed.notes }, question: parsed.question, source: "ai" },
    source: "ai",
  };
}

/* ---------------- Secondary rewrite (lands as an unapproved draft) ---------------- */

function clampSentence(t: string, maxWords: number): string {
  const first = t.trim().split(/(?<=[.!?])\s+/)[0] ?? t.trim();
  const ws = first.split(/\s+/);
  return ws.length > maxWords ? `${ws.slice(0, maxWords).join(" ").replace(/[,;:]$/, "")}.` : first;
}

export async function suggestRewrite(
  input: { item: string; spot: string; landmark: string; sense?: string; verbal?: boolean },
  settings: LociSettings,
): Promise<AiOutcome<string>> {
  const opts = { item: input.item, spot: input.spot, landmark: input.landmark, sense: input.sense, verbalMode: input.verbal };
  const endpoint = baseEndpoint(settings.aiEndpoint);
  let source: "ai" | "fallback" = "fallback";
  let text: string;
  if (settings.aiEnabled && isLocalEndpoint(endpoint)) {
    text = await suggestImageCue({ ...opts, aiEndpoint: endpoint, aiModel: settings.aiModel });
    source = "ai";
  } else {
    text = generateFallbackCue(opts);
  }
  text = clampSentence(text, 30);
  if (lintCuratorText(text).length || (input.verbal && hasVisualLanguage(text))) {
    text = clampSentence(generateFallbackCue(opts), 30);
    source = "fallback";
  }
  return { value: text, source };
}

/* ---------------- Route Doctor phrasing (detection stays local) ---------------- */

export async function phraseFinding(f: AiFinding, settings: LociSettings): Promise<AiOutcome<AiFinding>> {
  const cs = curatorSettings(settings);
  if (!settings.aiEnabled || !cs.modules.routeDoctor) return { value: f, source: "fallback" };
  if (cs.dataScope === "minimal" && f.locusIds.length > 1) return { value: f, source: "fallback" };

  const system =
    'You rephrase one diagnostic suggestion for a memory-palace route. Max 2 sentences. Suggest; never state that a change was made. No praise, no blame, no claims about memory or the user. JSON only: {"suggestion":"..."}';
  const user = JSON.stringify({ kind: f.kind, evidence: f.evidence, currentSuggestion: f.suggestion });
  const o = asRecord(await safeCall(settings, system, user, 0.2));
  const s = typeof o?.suggestion === "string" ? o.suggestion.trim() : "";
  const sentences = (s.match(/[.!?](\s|$)/g) ?? []).length;
  if (!s || s.length > 320 || sentences > 2 || lintCuratorText(s).length) {
    return { value: f, source: "fallback", notice: AI_UNAVAILABLE };
  }
  return { value: { ...f, suggestion: s }, source: "ai" };
}

/* ---------------- Hint ladder L1–L3 ---------------- */

export async function llmHint(level: 1 | 2 | 3, cue: string, answer: string, settings: LociSettings): Promise<string | null> {
  const cs = curatorSettings(settings);
  if (!settings.aiEnabled || !cs.modules.hintLadder) return null;
  const system =
    'You give one graded recall hint from a memory-palace cue. Level 1: a sensory fragment. Level 2: an action fragment. Level 3: a category and first letter, inferred from the cue. Never name the remembered item. Max 12 words. JSON only: {"hint":"..."}';
  // The answer itself never leaves the app; it is only used below to reject leaks.
  const o = asRecord(await safeCall(settings, system, JSON.stringify({ cue, level }), 0.2));
  const hint = typeof o?.hint === "string" ? o.hint.trim() : "";
  if (!hint || wordCount(hint) > 16 || lintCuratorText(hint).length || hintLeaksAnswer(hint, answer)) return null;
  return hint;
}

/* ---------------- Command bar parsing ---------------- */

export async function parseCommandAI(text: string, palaces: Palace[], settings: LociSettings): Promise<AiOutcome<ParsedIntent | null>> {
  if (!settings.aiEnabled || !curatorSettings(settings).modules.commandBar) return { value: null, source: "fallback" };
  const list = palaces.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name }));
  const system = `Map the request to one intent for a memory-palace app. Intents: ${COMMAND_INTENTS.join(", ")}. Use only palace ids from the list. params may include mode (recall|reverse|random), count (1-15) or min (1-10). JSON only: {"intent":"...","targetIds":["..."],"params":{},"confidence":0-1}. If unsure, set confidence below 0.5.`;
  const o = asRecord(await safeCall(settings, system, JSON.stringify({ request: text, palaces: list }), 0.2));
  if (!o) return { value: null, source: "fallback", notice: AI_UNAVAILABLE };

  const ids = new Set(list.map((p) => p.id));
  const intent = o.intent as CommandIntentName;
  const confidence = typeof o.confidence === "number" ? o.confidence : 0;
  const targetIds = Array.isArray(o.targetIds) ? o.targetIds.filter((x): x is string => typeof x === "string") : [];
  if (!COMMAND_INTENTS.includes(intent) || targetIds.some((t) => !ids.has(t))) {
    return { value: null, source: "fallback", notice: AI_UNAVAILABLE };
  }
  if (confidence < 0.7) return { value: null, source: "ai" };

  const p = asRecord(o.params) ?? {};
  const params: Record<string, unknown> = {};
  if (["recall", "reverse", "random"].includes(String(p.mode))) params.mode = p.mode;
  if (Number.isInteger(p.count) && (p.count as number) >= 1 && (p.count as number) <= 15) params.count = p.count;
  if (Number.isInteger(p.min) && (p.min as number) >= 1 && (p.min as number) <= 10) params.min = p.min;
  return { value: { intent, palaceId: targetIds[0], params, confidence }, source: "ai" };
}
