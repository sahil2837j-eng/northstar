import { useState, type FC } from "react";
import { Info } from "lucide-react";
import type { ReviewState } from "../../lib/loci-types";
import { explainSchedule, gradePreviews } from "../../lib/curator-core";

/* Module 8 — schedule transparency. Pure arithmetic; available with AI off. */
export const ExplainPopover: FC<{ review: ReviewState; showGrades?: boolean; label?: string }> = ({
  review,
  showGrades = false,
  label = "Explain this schedule",
}) => {
  const [open, setOpen] = useState(false);
  const lines = open ? explainSchedule(review) : [];
  const previews = open && showGrades ? gradePreviews(review) : [];

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        className="curator-explain-btn"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <Info size={13} aria-hidden="true" />
      </button>
      {open && (
        <span className="curator-explain-panel" role="note">
          {lines.map((l) => (
            <span key={l} className="block pb-1">
              {l}
            </span>
          ))}
          {previews.length > 0 && (
            <>
              <span className="block pt-1 font-semibold">What each grade does next:</span>
              {previews.map((p) => (
                <span key={p} className="block font-mono text-[11px]">
                  {p}
                </span>
              ))}
            </>
          )}
        </span>
      )}
    </span>
  );
};
