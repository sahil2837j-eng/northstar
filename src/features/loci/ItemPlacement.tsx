import { useMemo, useRef, useState, type FC } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ImagePlus,
  Info,
  Landmark,
  Lightbulb,
  MapPin,
  Package,
  ShieldAlert,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type { LociSettings, Palace, PalaceItem } from "../../lib/loci-types";
import { ItemPlacementIllustration } from "../../components/loci/LociIllustrations";
import { createInitialReviewState } from "../../lib/loci-algorithms";
import { deleteLociImage, saveLociImage } from "../../lib/loci-db";
import { curatorSettings, interferenceGuard, type GuardWarning } from "../../lib/curator-core";
import { CueCriticCard } from "./CueCriticCard";

interface Props {
  palace: Palace;
  settings: LociSettings;
  onSaveAndWalk: (updatedPalace: Palace) => void;
  onAddLoci: () => void;
  onSplitPalace: (overflowItems: string[]) => void;
  onBack: () => void;
}

interface ItemDraft {
  id: string;
  locusId: string;
  text: string;
  imageCue: string;
  cueImageId?: string;
  cueImageAlt?: string;
  isAiDraft: boolean;
  isApproved: boolean;
  imageSource: "user" | "ai-edited";
}

export const ItemPlacement: FC<Props> = ({ palace, settings, onSaveAndWalk, onAddLoci, onSplitPalace, onBack }) => {
  const cs = curatorSettings(settings);
  const route = useMemo(() => [...palace.route].sort((a, b) => a.order - b.order), [palace.route]);
  const [pasteText, setPasteText] = useState("");
  const [showTips, setShowTips] = useState(false);
  const [activeCuePhotoId, setActiveCuePhotoId] = useState<string | null>(null);
  const [dismissedGuard, setDismissedGuard] = useState<Set<string>>(new Set());
  const textRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cueRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const [items, setItems] = useState<ItemDraft[]>(() =>
    route.map((locus) => {
      const existing = palace.items.find((it) => it.locusId === locus.id);
      if (existing) {
        return {
          id: existing.id,
          locusId: locus.id,
          text: existing.text,
          imageCue: existing.imageCue,
          cueImageId: existing.cueImageId,
          cueImageAlt: existing.cueImageAlt,
          // Template or AI drafts arrive unapproved (rule 4).
          isAiDraft: existing.cueApproved === false,
          isApproved: existing.cueApproved !== false,
          imageSource: existing.imageSource,
        };
      }
      return {
        id: `item_${Math.random().toString(36).slice(2, 9)}`,
        locusId: locus.id,
        text: "",
        imageCue: "",
        isAiDraft: false,
        isApproved: false,
        imageSource: "user",
      };
    }),
  );

  const parsedLines = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
  const overflowCount = Math.max(0, parsedLines.length - route.length);

  const updateItem = (id: string, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const handleApplyPaste = () => {
    if (!parsedLines.length) return;
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx >= parsedLines.length) return it;
        const text = parsedLines[idx];
        return it.text === text ? it : { ...it, text, isApproved: false, isAiDraft: false };
      }),
    );
  };

  const guard: GuardWarning[] = useMemo(
    () =>
      cs.modules.interferenceGuard
        ? interferenceGuard(route, items.map(({ id, locusId, text, imageCue }) => ({ id, locusId, text, imageCue }))).filter(
            (w) => !dismissedGuard.has(w.id),
          )
        : [],
    [cs.modules.interferenceGuard, route, items, dismissedGuard],
  );

  const warningsFor = (d: ItemDraft) =>
    guard.filter((w) => w.itemIds.includes(d.id) || (w.itemIds.length === 0 && w.locusIds.includes(d.locusId)));

  const fix = (w: GuardWarning, d: ItemDraft) => {
    if (w.kind === "SPOT_NEAR_DUPLICATE") onBack();
    else if (w.kind === "CUE_DUPLICATE") cueRefs.current[d.id]?.focus();
    else textRefs.current[d.id]?.focus();
  };

  const handleCuePhotoUpload = async (itemId: string, file: File, alt: string) => {
    try {
      const { id } = await saveLociImage(file);
      updateItem(itemId, { cueImageId: id, cueImageAlt: alt || "Cue image" });
      setActiveCuePhotoId(null);
    } catch {
      /* upload errors leave the item unchanged */
    }
  };

  const allFilled = items.every((it) => it.text.trim() && it.imageCue.trim());
  const allApproved = items.every((it) => it.isApproved && it.imageCue.trim());
  const canContinue = allFilled && allApproved;

  const handleFinish = () => {
    if (!canContinue) return;
    const now = new Date();
    let changedText = 0;
    const finalItems: PalaceItem[] = items.map((d) => {
      const existing = palace.items.find((it) => it.id === d.id);
      const textChanged = !!existing && existing.text.trim() !== d.text.trim();
      const cueChanged = !!existing && existing.imageCue.trim() !== d.imageCue.trim();
      if (textChanged) changedText++;
      // Rule 7: changing an item's text or replacing its cue resets that item.
      const reset = !existing || textChanged || cueChanged;
      return {
        id: d.id,
        locusId: d.locusId,
        text: d.text.trim(),
        imageCue: d.imageCue.trim(),
        cueImageId: d.cueImageId,
        cueImageAlt: d.cueImageAlt,
        imageSource: d.imageSource,
        cueApproved: true,
        review: reset ? createInitialReviewState(now) : existing!.review,
        needsReencode: existing ? textChanged || cueChanged || (existing.needsReencode ?? false) : false,
      };
    });

    const prevCount = palace.items.length;
    const newSet = prevCount > 0 && changedText / prevCount >= 0.5;
    const load = newSet
      ? {
          cycles: (palace.load?.cycles ?? 1) + 1,
          lastClearedAt: now.toISOString(),
          residual: Object.fromEntries(palace.items.filter((it) => it.review.lapses > 0).map((it) => [it.locusId, it.review.lapses])),
        }
      : palace.load ?? { cycles: 1 };

    onSaveAndWalk({ ...palace, items: finalItems, load, updatedAt: now.toISOString() });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="loci-card">
        <ItemPlacementIllustration />
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--loci-accent)]">Step 3: Place items &amp; author cues</div>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Anchor items to “{palace.name}”</h1>
        <p className="text-sm text-[var(--loci-text-muted)]">
          One item per spot. Write a cue in which the item physically acts on that spot's landmark — the effort of
          writing it is part of how the method works.
        </p>

        <div className="mt-6 space-y-3 border-t border-[var(--loci-border)] pt-6">
          <label htmlFor="paste-items" className="block text-xs font-semibold">
            Quick paste: one item per line
          </label>
          <textarea
            id="paste-items"
            rows={3}
            className="w-full rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2.5 text-sm text-[var(--loci-text)] focus:border-[var(--loci-focus)] focus:outline-none"
            placeholder="Paste your items separated by new lines..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className={`font-mono ${overflowCount > 0 ? "font-bold text-[var(--loci-danger)]" : "text-[var(--loci-text-muted)]"}`}>
              {parsedLines.length} items / {route.length} spots
            </span>
            <button type="button" className="loci-btn loci-btn-ghost min-h-[36px] text-xs" disabled={!parsedLines.length} onClick={handleApplyPaste}>
              Assign to route spots
            </button>
          </div>

          {overflowCount > 0 && (
            <div className="space-y-3 rounded-lg border border-[var(--loci-danger)] p-4 text-xs" role="alert">
              <p className="flex items-start gap-2 font-bold text-[var(--loci-danger)]">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  The list is longer than the route ({parsedLines.length} items for {route.length} spots).
                </span>
              </p>
              <p className="text-[var(--loci-text-muted)]">One item per spot keeps each cue separate. Choose how to make room:</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="loci-btn loci-btn-primary min-h-[36px] text-xs" onClick={onAddLoci} disabled={route.length >= 15}>
                  <MapPin size={14} aria-hidden="true" />
                  <span>Add loci (max 15)</span>
                </button>
                <button type="button" className="loci-btn min-h-[36px] text-xs" onClick={() => onSplitPalace(parsedLines.slice(route.length))}>
                  <Package size={14} aria-hidden="true" />
                  <span>Split {overflowCount} into another palace</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="loci-card p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-xs font-semibold text-[var(--loci-accent)]"
          onClick={() => setShowTips(!showTips)}
          aria-expanded={showTips}
        >
          <span className="flex items-center gap-2">
            <Info size={16} aria-hidden="true" />
            <span>How to write a cue that holds</span>
          </span>
          {showTips ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {showTips && (
          <div className="mt-3 space-y-2 border-t border-[var(--loci-border)] pt-3 text-xs leading-relaxed text-[var(--loci-text-muted)]">
            <p>
              <strong>Interaction:</strong> the item does something <em>to</em> the landmark — crushes it, soaks it, wraps it.
            </p>
            <p>
              <strong>Sensory:</strong> add a sound, smell, texture, weight or temperature — ideally the spot's own.
            </p>
            <p>
              <strong>{settings.verbalMode ? "Narrative" : "Salience"}:</strong>{" "}
              {settings.verbalMode ? "give it a cause and effect: this happens, so that happens." : "exaggerate size, speed or strangeness."}
            </p>
            <p>
              <strong>Distinctness:</strong> avoid reusing the same actor or action in two cues.
            </p>
            <p>
              Changing an item's text or cue after it has been reviewed resets that item's schedule, because the
              spatial association has to be built again.
            </p>
          </div>
        )}
      </div>

      {guard.length > 0 && (
        <div className="curator-guard flex items-start gap-2" role="status" aria-live="polite">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>Interference Guard:</strong> {guard.length} note{guard.length === 1 ? "" : "s"} below. Nothing is
            blocked — fix them or place anyway.
          </span>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="flex items-center justify-between text-lg font-bold">
          <span className="flex items-center gap-2">
            <Package size={20} className="text-[var(--loci-accent)]" aria-hidden="true" />
            <span>Spots &amp; cues</span>
          </span>
          <span className="font-mono text-xs text-[var(--loci-text-muted)]">
            {items.filter((it) => it.isApproved).length} of {items.length} cues approved
          </span>
        </h2>

        {items.map((d, idx) => {
          const locus = route.find((l) => l.id === d.locusId);
          if (!locus) return null;
          const notes = warningsFor(d);
          return (
            <div key={d.id} className={`loci-card grid grid-cols-1 items-start gap-5 p-4 md:grid-cols-12 ${d.isApproved ? "border-[var(--loci-accent)]" : ""}`}>
              <div className="space-y-2 border-b border-[var(--loci-border)] pb-3 md:col-span-5 md:border-b-0 md:border-r md:pb-0 md:pr-4">
                <div className="flex items-center gap-2">
                  <span className="rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--loci-accent)]">
                    Spot #{idx + 1}
                  </span>
                  <strong className="text-sm">{locus.spot}</strong>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-[var(--loci-text-muted)]">
                  <Landmark size={14} className="mt-0.5 shrink-0 text-[var(--loci-accent)]" aria-hidden="true" />
                  <span>
                    <strong>Landmark:</strong> {locus.landmark}
                  </span>
                </p>
                {locus.sense && (
                  <p className="flex items-start gap-1.5 text-xs text-[var(--loci-text-muted)]">
                    <Sparkles size={14} className="mt-0.5 shrink-0 text-[var(--loci-warn)]" aria-hidden="true" />
                    <span>
                      <strong>Sense:</strong> {locus.sense}
                    </span>
                  </p>
                )}
              </div>

              <div className="space-y-3 md:col-span-7">
                <div>
                  <label htmlFor={`item-${d.id}`} className="mb-1 block text-xs font-semibold">
                    Item to remember *
                  </label>
                  <input
                    id={`item-${d.id}`}
                    ref={(el) => {
                      textRefs.current[d.id] = el;
                    }}
                    type="text"
                    className="w-full rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2 text-sm text-[var(--loci-text)] focus:border-[var(--loci-focus)] focus:outline-none"
                    placeholder="e.g. Magnesium, a date, a key term"
                    value={d.text}
                    onChange={(e) => updateItem(d.id, { text: e.target.value, isApproved: false })}
                  />
                </div>

                <div>
                  <label htmlFor={`cue-${d.id}`} className="mb-1 flex items-center gap-1 text-xs font-semibold">
                    <Lightbulb size={13} className="text-[var(--loci-warn)]" aria-hidden="true" />
                    <span>Your cue *</span>
                  </label>
                  <textarea
                    id={`cue-${d.id}`}
                    ref={(el) => {
                      cueRefs.current[d.id] = el;
                    }}
                    rows={2}
                    className="w-full rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2 text-xs leading-relaxed text-[var(--loci-text)] focus:border-[var(--loci-focus)] focus:outline-none"
                    placeholder={settings.verbalMode ? "What happens at this landmark, and what does it cause?" : "What does the item do to this landmark?"}
                    value={d.imageCue}
                    onChange={(e) => updateItem(d.id, { imageCue: e.target.value, isApproved: false, isAiDraft: false, imageSource: "user" })}
                  />
                  {d.isAiDraft && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--loci-rust)]">
                      <Wand2 size={11} aria-hidden="true" />
                      <span>Draft — not yours yet. Edit it into your own words, then approve.</span>
                    </p>
                  )}
                </div>

                {notes.map((w) => (
                  <div key={w.id} className="curator-guard space-y-1">
                    <p className="flex items-start gap-1.5">
                      <ShieldAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>
                        {w.message} {w.advice}
                      </span>
                    </p>
                    <div className="flex gap-3">
                      <button type="button" className="curator-link-muted" onClick={() => fix(w, d)}>
                        {w.kind === "SPOT_NEAR_DUPLICATE" ? "Fix in route editor" : "Fix"}
                      </button>
                      <button
                        type="button"
                        className="curator-link-muted"
                        onClick={() => setDismissedGuard((s) => new Set([...s, w.id]))}
                      >
                        Place anyway
                      </button>
                    </div>
                  </div>
                ))}

                {cs.modules.cueCritic && d.imageCue.trim() && (
                  <CueCriticCard
                    cue={d.imageCue}
                    landmark={locus.landmark}
                    spot={locus.spot}
                    sense={locus.sense}
                    itemText={d.text}
                    siblingCues={items.filter((o) => o.id !== d.id).map((o) => o.imageCue)}
                    settings={settings}
                    onDraft={(text) => updateItem(d.id, { imageCue: text, isAiDraft: true, isApproved: false, imageSource: "ai-edited" })}
                  />
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--loci-border)] pt-2 text-xs">
                  {d.cueImageId ? (
                    <span className="flex items-center gap-1.5 text-[var(--loci-accent)]">
                      <Camera size={13} aria-hidden="true" />
                      <span>Cue image attached</span>
                      <button
                        type="button"
                        className="ml-2 text-[var(--loci-danger)] underline"
                        onClick={async () => {
                          if (d.cueImageId) await deleteLociImage(d.cueImageId);
                          updateItem(d.id, { cueImageId: undefined, cueImageAlt: undefined });
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="flex items-center gap-1 text-[var(--loci-text-muted)] hover:text-[var(--loci-text)]" onClick={() => setActiveCuePhotoId(d.id)}>
                      <ImagePlus size={13} aria-hidden="true" />
                      <span>{settings.verbalMode ? "Attach an image (optional)" : "Attach sketch / cue image (optional)"}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className={`loci-btn min-h-[34px] px-3 text-xs ${d.isApproved ? "loci-btn-primary" : ""}`}
                    disabled={!d.text.trim() || !d.imageCue.trim()}
                    onClick={() => updateItem(d.id, { isApproved: !d.isApproved, isAiDraft: d.isApproved ? d.isAiDraft : false })}
                    aria-pressed={d.isApproved}
                  >
                    <Check size={14} aria-hidden="true" />
                    <span>{d.isApproved ? "Cue approved" : "Approve cue"}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--loci-border)] pt-6">
        <button type="button" className="loci-btn loci-btn-ghost" onClick={onBack}>
          Back to route
        </button>
        <div className="flex items-center gap-3">
          {allFilled && !allApproved && <span className="text-xs text-[var(--loci-warn)]">Approve each cue before the first walk.</span>}
          <button type="button" className="loci-btn loci-btn-primary" disabled={!canContinue} onClick={handleFinish}>
            <span>Begin first walk</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {activeCuePhotoId && (
        <CuePhotoUploadModal
          itemText={items.find((it) => it.id === activeCuePhotoId)?.text ?? ""}
          onClose={() => setActiveCuePhotoId(null)}
          onUpload={(file, alt) => handleCuePhotoUpload(activeCuePhotoId, file, alt)}
        />
      )}
    </div>
  );
};

const CuePhotoUploadModal: FC<{ itemText: string; onClose: () => void; onUpload: (file: File, alt: string) => void }> = ({
  itemText,
  onClose,
  onUpload,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="cue-photo-title">
      <div className="loci-card w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 id="cue-photo-title" className="font-bold">
            Cue image for “{itemText}”
          </h3>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form
          className="space-y-4 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            if (file) onUpload(file, alt.trim() || `Cue image for ${itemText}`);
          }}
        >
          <div>
            <label htmlFor="cue-file" className="mb-1 block font-medium">
              Select an image
            </label>
            <input id="cue-file" type="file" accept="image/*" className="w-full" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            <p className="mt-1 text-[11px] text-[var(--loci-text-muted)]">
              This image is part of the answer: it stays hidden during recall until hint level 4 or reveal. Stored on this device only.
            </p>
          </div>
          <div>
            <label htmlFor="cue-alt" className="mb-1 block font-medium">
              Description (alt text)
            </label>
            <input
              id="cue-alt"
              type="text"
              className="w-full rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] p-2 text-[var(--loci-text)]"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="loci-btn loci-btn-ghost text-xs" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="loci-btn loci-btn-primary text-xs" disabled={!file || !alt.trim()}>
              Attach
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
