import { useMemo, useState } from "react";
import { Archive, Brain, Pencil, RotateCcw } from "lucide-react";
import { Bay, Eyebrow } from "../components/ui";
import { useApp } from "../lib/ctx";
import { rid } from "../lib/store";
import {
  MAX_ACTIVE_MEMORY,
  MEMORY_META,
  type MemoryItem,
  type MemoryKind,
} from "../lib/types";

const KINDS = Object.keys(MEMORY_META) as MemoryKind[];
const ORDER: Record<MemoryKind, number> = {
  principle: 0,
  decision: 1,
  lesson: 2,
  question: 3,
};

function fmtDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "unknown";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function sortItems(items: MemoryItem[]) {
  return [...items].sort(
    (a, b) =>
      ORDER[a.kind] - ORDER[b.kind] ||
      +new Date(b.updatedAt) - +new Date(a.updatedAt),
  );
}

/**
 * Strategic Memory is user-authored context only.
 * It is never counted as journal evidence, never turned into a pattern, and
 * never mixed with Loci palaces. Active memory is capped at 8.
 */
export default function MemoryPanel() {
  const { memory, updateMemory, toast, go } = useApp();
  const [kind, setKind] = useState<MemoryKind>("principle");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const active = useMemo(() => sortItems(memory.items.filter((i) => i.active)), [memory.items]);
  const archived = useMemo(() => sortItems(memory.items.filter((i) => !i.active)), [memory.items]);

  const cancel = () => {
    setEditing(null);
    setText("");
    setKind("principle");
  };

  const save = () => {
    const clean = text.trim();
    if (!clean) {
      toast("Write the thing you want to keep.", "plain");
      return;
    }
    if (!editing && active.length >= MAX_ACTIVE_MEMORY) {
      toast(
        `Active memory is capped at ${MAX_ACTIVE_MEMORY}. Archive one first; nothing was lost.`,
        "plain",
      );
      return;
    }
    const now = new Date().toISOString();
    if (editing) {
      updateMemory((m) => ({
        ...m,
        items: m.items.map((i) =>
          i.id === editing ? { ...i, kind, text: clean, updatedAt: now } : i,
        ),
      }));
      toast("Memory updated.", "lit");
    } else {
      const item: MemoryItem = {
        id: rid(),
        kind,
        text: clean,
        createdAt: now,
        updatedAt: now,
        active: true,
      };
      updateMemory((m) => ({ ...m, items: [item, ...m.items] }));
      toast("Kept in Strategic Memory.", "lit");
    }
    cancel();
  };

  const startEdit = (item: MemoryItem) => {
    setEditing(item.id);
    setKind(item.kind);
    setText(item.text);
  };

  const toggle = (item: MemoryItem) => {
    if (!item.active && active.length >= MAX_ACTIVE_MEMORY) {
      toast(
        `Active memory is capped at ${MAX_ACTIVE_MEMORY}. Archive one first, then restore this one.`,
        "plain",
      );
      return;
    }
    updateMemory((m) => ({
      ...m,
      items: m.items.map((i) =>
        i.id === item.id
          ? { ...i, active: !i.active, updatedAt: new Date().toISOString() }
          : i,
      ),
    }));
    toast(
      item.active
        ? "Archived. The mentor will not see it as context."
        : "Restored to active memory.",
      "plain",
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Context, not evidence</div>
          <h1 className="plate text-[34px]">Strategic Memory</h1>
          <p className="max-w-[76ch] pt-2 text-[14px] muted">
            Your own principles, decisions and lessons — the few things a strategist should keep in
            view when the day gets loud. These are your words, not the model&apos;s. Active memories
            are context for the Strategist; they are never counted as journal evidence, never
            quoted as something you said today, and never treated as patterns.
          </p>
          <p className="pt-2 text-[12px] faint">
            This is not the spatial trainer. Loci is a separate place for routes, images, and review
            schedules; the two never mix.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => go("loci")}>
          Open Loci trainer
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bay className="p-4">
          <Eyebrow right={editing ? "editing" : `${active.length}/${MAX_ACTIVE_MEMORY} active`}>
            {editing ? "Edit memory" : "Keep something"}
          </Eyebrow>
          <div className="flex flex-wrap gap-1.5 pb-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="chip"
                data-on={kind === k}
                onClick={() => setKind(k)}
              >
                {MEMORY_META[k].label}
              </button>
            ))}
          </div>
          <p className="pb-2 text-[12px] faint">{MEMORY_META[kind].hint}</p>
          <textarea
            rows={4}
            maxLength={240}
            placeholder={
              kind === "principle"
                ? "e.g. Protect the first two hours before anyone else gets a vote."
                : kind === "decision"
                  ? "e.g. I chose depth over another course. I will not relitigate it this month."
                  : kind === "lesson"
                    ? "e.g. Planning is where I hide when the work gets specific."
                    : "e.g. What would make this year feel sufficient, not just busy?"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2 pt-3">
            <span className="mono text-[11px] faint">{text.trim().length}/240</span>
            <div className="flex gap-2">
              {editing && (
                <button className="btn btn-ghost btn-sm" type="button" onClick={cancel}>
                  Cancel
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={save}
                disabled={!text.trim() || (!editing && active.length >= MAX_ACTIVE_MEMORY)}
              >
                {editing ? "Save changes" : "Keep it"}
              </button>
            </div>
          </div>
          {!editing && active.length >= MAX_ACTIVE_MEMORY && (
            <p className="pt-2 text-[12px] faint">
              Active memory is full ({MAX_ACTIVE_MEMORY}). Archive one below to keep another.
            </p>
          )}
        </Bay>

        <Bay className="p-4">
          <Eyebrow right={`${active.length}/${MAX_ACTIVE_MEMORY} active`}>Active memory</Eyebrow>
          {active.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-[var(--ns-line)] px-4 py-8 text-center">
              <Brain size={26} strokeWidth={1.4} className="faint" aria-hidden="true" />
              <p className="pt-3 text-[14px]">Nothing kept yet.</p>
              <p className="max-w-[38ch] pt-1 text-[12px] faint">
                Add the principle you keep relearning, or the decision you do not want to
                relitigate. Keep it short enough to remember.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {active.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3"
                >
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <span
                      className="mono text-[10px] uppercase tracking-[0.12em]"
                      style={{ color: "var(--ns-linked)" }}
                    >
                      {MEMORY_META[item.kind].label}
                    </span>
                    <span className="mono text-[10px] faint">{fmtDay(item.updatedAt)}</span>
                  </div>
                  <p className="text-[14px] leading-relaxed">{item.text}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => startEdit(item)}
                    >
                      <Pencil size={12} aria-hidden="true" /> Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => toggle(item)}
                    >
                      <Archive size={12} aria-hidden="true" /> Archive
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Bay>

        <Bay className="p-4">
          <Eyebrow right="how it is used">Strategy, not memory theater</Eyebrow>
          <ul className="space-y-2 text-[13px] muted">
            <li className="flex gap-2">
              <span className="mono faint">—</span>
              <span>
                The Strategist reads active memories as context for the trade it names: what the
                day bought, what it deferred, and the smallest reversible next move.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mono faint">—</span>
              <span>
                The Mentalist still quotes only journal entries. A memory is never presented as
                something you said today, and it is never used to invent a pattern.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mono faint">—</span>
              <span>
                Archived memories stay on this device but leave the mentor digest. Nothing here is
                trained into a model, embedded, or sent anywhere except the endpoint you explicitly
                choose when you press a send button.
              </span>
            </li>
          </ul>
        </Bay>

        <Bay className="p-4">
          <Eyebrow right={`${archived.length}`}>Archived</Eyebrow>
          {archived.length === 0 ? (
            <p className="text-[13px] faint">
              Nothing archived. Archive a memory when it stops being true; you can restore it later
              without retyping it.
            </p>
          ) : (
            <details>
              <summary className="cursor-pointer text-[13px] muted">
                Show archived memories ({archived.length})
              </summary>
              <div className="space-y-2 pt-3">
                {archived.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-[var(--ns-line)] bg-[var(--ns-bg-1)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2 pb-1">
                      <span className="mono text-[10px] uppercase tracking-[0.12em] faint">
                        {MEMORY_META[item.kind].label}
                      </span>
                      <span className="mono text-[10px] faint">{fmtDay(item.updatedAt)}</span>
                    </div>
                    <p className="text-[13px] muted">{item.text}</p>
                    <button
                      className="btn btn-ghost btn-sm mt-2"
                      type="button"
                      onClick={() => toggle(item)}
                      disabled={active.length >= MAX_ACTIVE_MEMORY}
                    >
                      <RotateCcw size={12} aria-hidden="true" /> Restore
                    </button>
                  </article>
                ))}
              </div>
            </details>
          )}
        </Bay>
      </div>
    </div>
  );
}
