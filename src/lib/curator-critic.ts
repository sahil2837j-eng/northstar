/* Curator — Cue Critic.

   Scores the user's cue on four axes and asks exactly one question. It never
   writes the cue: the rewrite path lives in curator-llm.ts, is secondary in the
   UI, and its output lands as an unapproved draft. */

import { normalizeText } from "./loci-algorithms";
import {
  SALIENCE_WORDS,
  STOP,
  contentTokens,
  findAction,
  isActionWord,
  isSenseWord,
  stem,
  words,
} from "./curator-text";

/* ============================================================
   MODULE 2 — CUE CRITIC (checklist; asks one question, never rewrites)
   ============================================================ */

export type CriticAxis = "interaction" | "sensory" | "salience" | "distinctness";
export const CRITIC_AXES: CriticAxis[] = ["interaction", "sensory", "salience", "distinctness"];

export interface CritiqueInput {
  cue: string;
  landmark: string;
  spot: string;
  sense?: string;
  siblingCues: string[];
  aphantasia?: boolean;
}

export interface CritiqueResult {
  scores: Record<CriticAxis, number>;
  notes: Record<CriticAxis, string>;
  question: string;
  salienceLabel: "Salience" | "Narrative";
  source: "ai" | "fallback";
}

export function critiqueCueLocal(input: CritiqueInput): CritiqueResult {
  const cue = input.cue || "";
  const norm = normalizeText(cue);
  const tokens = norm.split(" ").filter(Boolean);
  const landmarkToks = contentTokens(input.landmark);
  const noun = landmarkToks.length ? words(input.landmark).filter((w) => w.length >= 3 && !STOP.has(w)).slice(-1)[0] : "landmark";
  const touches = landmarkToks.some((t) => tokens.some((w) => stem(w) === t));
  const action = findAction(cue);
  const contact = /\b(into|onto|through|against|inside|over|around|across|under|wedged|wrapped|smeared|stuck)\b/.test(norm);

  let interaction = (touches ? 1 : 0) + (action ? 1 : 0) + (contact && touches ? 1 : 0);
  if (!touches) interaction = Math.min(interaction, 1);

  const senseHits = new Set(tokens.filter(isSenseWord).map(stem));
  const senseToks = contentTokens(input.sense || "");
  const matchesSpotSense = senseToks.some((t) => tokens.some((w) => stem(w) === t));
  let sensory = senseHits.size === 0 ? 0 : senseHits.size === 1 ? 2 : 3;
  if (matchesSpotSense) sensory = Math.min(3, Math.max(sensory, 1) + 1);

  let salience: number;
  let salienceNote: string;
  if (input.aphantasia) {
    const connector = /\b(because|so|then|until|causing|which|after|when|while|making|forcing)\b/.test(norm);
    salience = (connector ? 1 : 0) + (action ? 1 : 0) + (tokens.length >= 12 ? 1 : 0);
    salienceNote = connector ? "A causal link is present." : "No causal link (because, then, until) yet.";
  } else {
    const markers = tokens.filter((w) => SALIENCE_WORDS.has(w)).length + (cue.includes("!") ? 1 : 0) + (action ? 1 : 0);
    salience = Math.min(3, markers);
    if (tokens.length < 6) salience = Math.min(salience, 1);
    salienceNote = salience >= 2 ? "Exaggeration or motion is present." : "Ordinary scale and pace.";
  }

  const own = new Set(
    contentTokens(cue, new Set([...landmarkToks, ...contentTokens(input.spot)])).filter((t) => !isActionWord(t) && !isSenseWord(t)),
  );
  const siblingSets = input.siblingCues.filter(Boolean).map((c) => new Set(contentTokens(c)));
  const shared = [...own].filter((t) => siblingSets.some((s) => s.has(t)));
  const distinctness = shared.length === 0 ? 3 : shared.length === 1 ? 2 : shared.length === 2 ? 1 : 0;

  const scores: Record<CriticAxis, number> = { interaction, sensory, salience, distinctness };
  const notes: Record<CriticAxis, string> = {
    interaction: touches
      ? action
        ? "Acts on the landmark."
        : "Mentions the landmark, but nothing acts on it."
      : "Does not reference this landmark.",
    sensory: senseHits.size ? `Sense words: ${[...senseHits].slice(0, 3).join(", ")}.` : "No sound, smell, texture, or temperature.",
    salience: salienceNote,
    distinctness: shared.length ? `Shares “${shared.slice(0, 2).join("”, “")}” with another cue.` : "No overlap with sibling cues.",
  };

  const lowest = CRITIC_AXES.reduce((lo, ax) => (scores[ax] < scores[lo] ? ax : lo), CRITIC_AXES[0]);
  let question: string;
  if (scores[lowest] >= 3) question = "Which single detail here would you notice first on the walk?";
  else if (lowest === "interaction")
    question = touches
      ? `It mentions the ${noun}, but nothing moves. What does it do TO the ${noun}?`
      : `It sits near the ${noun} but does not touch it. What does it do TO the ${noun}?`;
  else if (lowest === "sensory") question = "Nothing here is heard, smelled, or felt. Which one fits this spot?";
  else if (lowest === "salience")
    question = input.aphantasia
      ? "Nothing here causes anything. What happens next because of it?"
      : "Everything here is ordinary in size and speed. What would make it impossible to ignore?";
  else question = `Another cue in this palace also uses “${shared[0]}”. What replaces it here?`;

  return {
    scores,
    notes,
    question,
    salienceLabel: input.aphantasia ? "Narrative" : "Salience",
    source: "fallback",
  };
}

