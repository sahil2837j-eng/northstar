/* Curator — deterministic analysis core (internal codename ULTRON).

   PRIME DIRECTIVE: the Curator proposes, the user commits.
   Nothing re-exported here mutates its inputs or touches storage. These are
   pure functions over palace data that return findings, critiques, plans and
   text. The only place a proposal or finding status can change is
   curator-proposals.ts, and only with a UserIntent minted from a trusted user
   event. The local model (curator-llm.ts) may rephrase or critique; detection,
   planning, hints and schedule maths all live in these modules, so every
   feature still works with AI switched off.

   This file is the public surface. The implementation is split by concern:

     curator-text.ts      settings, language guard, lexicons, formatting
     curator-findings.ts  Interference Guard, Route Doctor, Load Advisor
     curator-session.ts   Session Planner, graded hint ladder
     curator-explain.ts   schedule arithmetic for the Explain panel
     curator-critic.ts    Cue Critic four-axis scoring
     curator-commands.ts  command bar parsing and proposals

   Import from here (or from a specific module when you only need one). */

export * from "./curator-text";
export * from "./curator-findings";
export * from "./curator-session";
export * from "./curator-explain";
export * from "./curator-critic";
export * from "./curator-commands";
