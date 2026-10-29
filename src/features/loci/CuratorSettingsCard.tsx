import type { FC } from "react";
import { Cpu } from "lucide-react";
import type { CuratorModule, LociSettings } from "../../lib/loci-types";
import { curatorSettings } from "../../lib/curator-core";
import { isLocalEndpoint } from "../../lib/mentor";

const MODULES: { key: CuratorModule; label: string; note: string }[] = [
  { key: "interferenceGuard", label: "Interference Guard", note: "At item placement: similar neighbours, duplicate cue elements, circular cues. Pure logic, blocks nothing." },
  { key: "routeDoctor", label: "Route Doctor", note: "Manual diagnostics from review history. Pure logic; the model only rephrases." },
  { key: "hintLadder", label: "Graded hint ladder", note: "Five hint levels instead of one reveal. Built-in levels 1–3; model optional." },
  { key: "sessionPlanner", label: "Session planner", note: "States the plan before each review and offers early stops." },
  { key: "cueCritic", label: "Cue Critic", note: "Scores a cue on four axes and asks one question. Runs only when you click." },
  { key: "commandBar", label: "Command bar (Ctrl/⌘ K)", note: "Changes always render a diff and wait for Confirm." },
  { key: "loadAdvisor", label: "Palace load advisor", note: "Notes when a route has held several item sets." },
];

interface Props {
  settings: LociSettings;
  testStatus: string | null;
  onChange: (patch: Partial<LociSettings>) => void;
}

export const CuratorSettingsCard: FC<Props> = ({ settings, testStatus, onChange }) => {
  const cs = curatorSettings(settings);
  const local = isLocalEndpoint(settings.aiEndpoint || "http://localhost:11434");
  const status = !settings.aiEnabled
    ? { dot: "stone", text: "Off — every module runs on built-in checks." }
    : !local
      ? { dot: "rust", text: "Endpoint rejected — the Curator only connects to loopback or the built-in /ollama proxy." }
      : testStatus?.startsWith("Connected")
        ? { dot: "sage", text: "Connected (verified by your last test)." }
        : testStatus
          ? { dot: "rust", text: "Last connection test failed — using built-in checks." }
          : { dot: "stone", text: "On — not tested yet. Use “Test local AI connection” above." };

  const setModule = (key: CuratorModule, value: boolean) =>
    onChange({ curator: { ...cs, modules: { ...cs.modules, [key]: value } } });

  return (
    <div className="loci-card space-y-4">
      <h2 className="flex items-center gap-2 border-b border-[var(--loci-border)] pb-3 text-base font-bold">
        <Cpu size={18} aria-hidden="true" />
        <span>Curator (advisory layer)</span>
      </h2>
      <p className="text-xs leading-relaxed text-[var(--loci-text-muted)]">
        The Curator proposes; you commit. It has no write access to palaces, spots, cues or schedules — every change
        passes through an explicit click. Each module has a built-in fallback, so turning the local model off loses
        phrasing, not function.
      </p>

      <p className="flex items-center gap-2 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2.5 text-xs">
        <span className="curator-dot" data-state={status.dot} aria-hidden="true" />
        <span>
          <strong>Local model status:</strong> {status.text}
        </span>
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold">Modules</legend>
        {MODULES.map((m) => (
          <label
            key={m.key}
            className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2.5 text-xs"
          >
            <span>
              <strong className="block text-[var(--loci-text)]">{m.label}</strong>
              <span className="text-[var(--loci-text-muted)]">{m.note}</span>
            </span>
            <input
              type="checkbox"
              className="mt-0.5 scale-125 accent-[var(--loci-accent)]"
              checked={cs.modules[m.key]}
              onChange={(e) => setModule(m.key, e.target.checked)}
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2 text-xs">
        <legend className="mb-1 font-semibold">Data scope sent to the local model</legend>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name="curator-scope"
            className="mt-0.5 accent-[var(--loci-accent)]"
            checked={cs.dataScope === "minimal"}
            onChange={() => onChange({ curator: { ...cs, dataScope: "minimal" } })}
          />
          <span>
            <strong>Minimal (default)</strong> — only the cue under discussion, its landmark and sibling keywords. Never
            the item list or review history.
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name="curator-scope"
            className="mt-0.5 accent-[var(--loci-accent)]"
            checked={cs.dataScope === "palace"}
            onChange={() => onChange({ curator: { ...cs, dataScope: "palace" } })}
          />
          <span>
            <strong>Palace</strong> — lets Route Doctor send multi-spot evidence (spot names, counts, dates) for phrasing.
          </span>
        </label>
        {cs.dataScope === "palace" && (
          <p className="rounded border border-[var(--loci-border)] p-2 text-[var(--loci-rust)]">
            Palace scope sends more of your route text to the model. It still goes only to localhost.
          </p>
        )}
      </fieldset>

      <p className="font-mono text-[11px] text-[var(--loci-text-muted)]">
        Timeout {cs.timeoutMs / 1000}s, one retry, max {cs.maxTokens} tokens. Temperature {cs.temperature} for critique, 0.2 for diagnostics.
        Malformed replies are discarded and the built-in result is shown.
      </p>
    </div>
  );
};
