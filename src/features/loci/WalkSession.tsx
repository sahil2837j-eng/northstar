import { useEffect, useState, type FC } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  Footprints,
  Landmark,
  Lightbulb,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";
import type { LociSettings, Palace } from "../../lib/loci-types";
import { useLociImage } from "./useLociImage";

interface Props {
  palace: Palace;
  settings: LociSettings;
  onFinishWalk: (startVerificationPass: boolean) => void;
  onExit: () => void;
}

export const WalkSession: FC<Props> = ({
  palace,
  settings,
  onFinishWalk,
  onExit,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const total = palace.route.length;
  const currentLocus = palace.route[currentIndex];
  const currentItem = palace.items.find((it) => it.locusId === currentLocus?.id);

  // Both photos are visible during the first walk; the hook revokes each object
  // URL when the step changes so a long walk does not accumulate blobs.
  const locusPhotoUrl = useLociImage(currentLocus?.photoId);
  const cuePhotoUrl = useLociImage(currentItem?.cueImageId);

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (currentIndex < total - 1) {
          setCurrentIndex((prev) => prev + 1);
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1);
        }
      } else if (e.key === "Escape") {
        onExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, total, onExit]);

  if (!currentLocus) {
    return null;
  }

  const isLast = currentIndex === total - 1;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4">
      {/* Top bar with focus exit */}
      <div className="flex items-center justify-between border-b border-[var(--loci-border)] pb-4">
        <div>
          <span className="text-xs font-semibold text-[var(--loci-accent)] uppercase tracking-wider flex items-center gap-1.5">
            <Footprints size={14} aria-hidden="true" />
            <span>First Walk — Memory Encoding</span>
          </span>
          <h1 className="text-lg font-bold">{palace.name}</h1>
        </div>

        <button
          type="button"
          className="loci-btn loci-btn-ghost text-xs"
          onClick={onExit}
          title="Save and exit walk"
          aria-label="Exit walk session"
        >
          <X size={16} aria-hidden="true" />
          <span>Exit walk</span>
        </button>
      </div>

      {/* Progress Path Indicator */}
      <div className="space-y-1.5" aria-label={`Progress: Spot ${currentIndex + 1} of ${total}`}>
        <div className="flex items-center justify-between text-xs text-[var(--loci-text-muted)]">
          <span>Spot {currentIndex + 1} of {total}</span>
          <span>{Math.round(((currentIndex + 1) / total) * 100)}%</span>
        </div>
        <div className="w-full bg-[var(--loci-surface-2)] h-2 rounded-full overflow-hidden border border-[var(--loci-border)]">
          <div
            className="bg-[var(--loci-accent)] h-full transition-all duration-200"
            style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Locus & Item Card */}
      <div className="loci-card space-y-6">
        {/* Locus identity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[var(--loci-surface-2)] text-[var(--loci-accent)] border border-[var(--loci-border)]">
              Spot #{currentIndex + 1} along route
            </span>
            <span className="text-xs text-[var(--loci-text-muted)] flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" />
              <span>{palace.location}</span>
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-[var(--loci-text)]">
            {currentLocus.spot}
          </h2>

          <p className="text-sm text-[var(--loci-text-muted)] flex items-center gap-2">
            <Landmark size={16} className="text-[var(--loci-accent)]" aria-hidden="true" />
            <span><strong>Landmark:</strong> {currentLocus.landmark}</span>
          </p>

          {currentLocus.sense && (
            <p className="text-sm text-[var(--loci-text-muted)] flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--loci-warn)]" aria-hidden="true" />
              <span><strong>Sensory detail:</strong> {currentLocus.sense}</span>
            </p>
          )}

          {/* Locus photo if available */}
          {locusPhotoUrl && (
            <div className="mt-3 rounded-lg overflow-hidden border border-[var(--loci-border)] max-h-60 bg-black/20">
              <img
                src={locusPhotoUrl}
                alt={currentLocus.photoAlt || `Photo of ${currentLocus.spot}`}
                className="w-full h-full object-cover max-h-60"
              />
            </div>
          )}
        </div>

        {/* Assigned item to picture */}
        <div className="p-4 rounded-xl border-2 border-[var(--loci-accent)] bg-[var(--loci-surface-2)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--loci-accent)] flex items-center gap-1.5">
              <Lightbulb size={15} aria-hidden="true" />
              <span>Assigned Item</span>
            </span>
            <span className="text-xs text-[var(--loci-text-muted)]">
              {settings.verbalMode ? "Story prompt" : "Mental image cue"}
            </span>
          </div>

          <p className="text-xl font-bold text-[var(--loci-text)]">
            {currentItem?.text || "No item placed"}
          </p>

          <div className="text-sm text-[var(--loci-text)] leading-relaxed italic border-l-2 border-[var(--loci-accent)] pl-3 py-1">
            "{currentItem?.imageCue}"
          </div>

          {/* Cue sketch image if attached */}
          {cuePhotoUrl && (
            <div className="mt-2 rounded-lg overflow-hidden border border-[var(--loci-border)] max-h-48 bg-black/20">
              <img
                src={cuePhotoUrl}
                alt={currentItem?.cueImageAlt || `Visual cue for ${currentItem?.text}`}
                className="w-full h-full object-cover max-h-48"
              />
            </div>
          )}
        </div>

        {/* Guidance Prompt */}
        <div className="text-center py-2 text-xs text-[var(--loci-text-muted)]">
          {settings.verbalMode ? (
            <p>Trace the story in this spot. Hear the sounds, feel the physical interactions.</p>
          ) : (
            <p>Picture the scene right here at the {currentLocus.landmark}. Take a moment to see it vividly.</p>
          )}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          className="loci-btn loci-btn-ghost text-xs"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((prev) => prev - 1)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Previous spot (←)</span>
        </button>

        {!isLast ? (
          <button
            type="button"
            className="loci-btn loci-btn-primary"
            onClick={() => setCurrentIndex((prev) => prev + 1)}
          >
            <span>Next spot (→)</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="loci-btn loci-btn-ghost text-xs"
              onClick={() => onFinishWalk(false)}
            >
              <Check size={16} aria-hidden="true" />
              <span>Finish walk</span>
            </button>
            <button
              type="button"
              className="loci-btn loci-btn-primary"
              onClick={() => onFinishWalk(true)}
              title="Test your spatial recall right now"
            >
              <Brain size={16} aria-hidden="true" />
              <span>Take first recall pass</span>
            </button>
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-[var(--loci-text-muted)]">
        Use Arrow keys (← / →) to step through your route.
      </div>
    </div>
  );
};
