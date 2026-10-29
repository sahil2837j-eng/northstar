import { useState, type FC } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronRight,
  GripVertical,
  ImagePlus,
  Landmark,
  Plus,
  Route,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { Locus, Palace } from "../../lib/loci-types";
import { RouteBuilderIllustration } from "../../components/loci/LociIllustrations";
import {
  detectSpatialMappingChanges,
  resetItemsForReencoding,
  validateRoute,
} from "../../lib/loci-algorithms";
import { deleteLociImage, saveLociImage } from "../../lib/loci-db";

interface Props {
  palace: Palace;
  onSave: (updatedPalace: Palace, proceedToItems: boolean) => void;
  onCancel: () => void;
}

export const RouteBuilder: FC<Props> = ({ palace, onSave, onCancel }) => {
  const [name, setName] = useState(palace.name || "");
  const [location, setLocation] = useState(palace.location || "");
  const [locationConfirmed, setLocationConfirmed] = useState(palace.locationConfirmed || false);
  const [route, setRoute] = useState<Locus[]>(() => {
    if (palace.route.length > 0) return palace.route;
    // 5 default blank starter spots for a new palace
    return Array.from({ length: 5 }, (_, i) => ({
      id: "loc_" + Math.random().toString(36).slice(2, 9),
      order: i + 1,
      spot: "",
      landmark: "",
      sense: "",
    }));
  });
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [activePhotoLocusId, setActivePhotoLocusId] = useState<string | null>(null);
  const [reencodeWarning, setReencodeWarning] = useState<{
    reasons: string[];
    affectedItemIds: string[];
    pendingSave: () => void;
  } | null>(null);

  const validation = validateRoute(route, orderConfirmed);

  const updateLocus = (id: string, patch: Partial<Locus>) => {
    setRoute((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  const addLocusAt = (index: number) => {
    if (route.length >= 15) return;
    const newLocus: Locus = {
      id: "loc_" + Math.random().toString(36).slice(2, 9),
      order: index + 1,
      spot: "",
      landmark: "",
      sense: "",
    };
    const next = [...route];
    next.splice(index, 0, newLocus);
    // re-index order
    const reindexed = next.map((l, idx) => ({ ...l, order: idx + 1 }));
    setRoute(reindexed);
    setOrderConfirmed(false);
  };

  const removeLocus = async (id: string) => {
    const target = route.find((l) => l.id === id);
    if (target?.photoId) {
      await deleteLociImage(target.photoId);
    }
    const next = route.filter((l) => l.id !== id).map((l, idx) => ({ ...l, order: idx + 1 }));
    setRoute(next);
    setOrderConfirmed(false);
  };

  const moveLocus = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= route.length) return;
    const next = [...route];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const reindexed = next.map((l, idx) => ({ ...l, order: idx + 1 }));
    setRoute(reindexed);
    setOrderConfirmed(false);
  };

  const handlePhotoUpload = async (locusId: string, file: File, altText: string) => {
    try {
      const { id } = await saveLociImage(file);
      updateLocus(locusId, { photoId: id, photoAlt: altText || "Photo of locus" });
      setActivePhotoLocusId(null);
    } catch {
      // error handled
    }
  };

  const handleSaveAttempt = (proceedToItems: boolean) => {
    if (!validation.valid || !locationConfirmed) return;

    // Check spatial mapping changes if palace already had placed items
    if (palace.items.length > 0) {
      const diff = detectSpatialMappingChanges(palace.route, route, palace.items);
      if (diff.hasBreakingChanges && diff.affectedItemIds.length > 0) {
        setReencodeWarning({
          reasons: diff.reasons,
          affectedItemIds: diff.affectedItemIds,
          pendingSave: () => {
            const resetItems = resetItemsForReencoding(palace.items, diff.affectedItemIds);
            const updated: Palace = {
              ...palace,
              name: name.trim() || "Untitled palace",
              location: location.trim(),
              locationConfirmed: true,
              route,
              items: resetItems,
              updatedAt: new Date().toISOString(),
            };
            onSave(updated, proceedToItems);
          },
        });
        return;
      }
    }

    // No breaking changes or no existing items
    const updated: Palace = {
      ...palace,
      name: name.trim() || "Untitled palace",
      location: location.trim(),
      locationConfirmed: true,
      route,
      updatedAt: new Date().toISOString(),
    };
    onSave(updated, proceedToItems);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Step Header */}
      <div className="loci-card">
        <RouteBuilderIllustration />
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--loci-accent)] uppercase tracking-wider mb-2">
          <span>Step 1: Real Location</span>
          <ChevronRight size={14} />
          <span>Step 2: Ordered Loci</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">
          Build your spatial route
        </h1>
        <p className="text-sm text-[var(--loci-text-muted)]">
          The Method of Loci works because human evolution optimized memory for navigating real spaces.
          Choose a place you know intimately.
        </p>

        {/* Step 1: Location Definition */}
        <div className="mt-6 pt-6 border-t border-[var(--loci-border)] space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="palace-name" className="block text-xs font-semibold text-[var(--loci-text)] mb-1">
                Palace name
              </label>
              <input
                id="palace-name"
                type="text"
                className="w-full p-2.5 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] text-sm focus:outline-none focus:border-[var(--loci-focus)]"
                placeholder="e.g. My apartment route, Morning commute"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="palace-location" className="block text-xs font-semibold text-[var(--loci-text)] mb-1">
                Familiar real location
              </label>
              <input
                id="palace-location"
                type="text"
                className="w-full p-2.5 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] text-sm focus:outline-none focus:border-[var(--loci-focus)]"
                placeholder="e.g. 14 Elm St, childhood home, campus walk"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 accent-[var(--loci-accent)]"
              checked={locationConfirmed}
              onChange={(e) => setLocationConfirmed(e.target.checked)}
            />
            <span className="text-xs text-[var(--loci-text)] leading-relaxed">
              <strong>I can walk this route in my mind.</strong> I am choosing a familiar, real physical place with a fixed spatial layout,
              not an imaginary or generic template.
            </span>
          </label>
        </div>
      </div>

      {/* Step 2: Ordered Loci Path */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Route size={20} className="text-[var(--loci-accent)]" aria-hidden="true" />
              <span>Ordered loci path</span>
            </h2>
            <p className="text-xs text-[var(--loci-text-muted)]">
              Follow the natural direction of walking. Each spot must be physically distinct.
            </p>
          </div>
          <span
            className={`text-xs font-mono px-2.5 py-1 rounded font-semibold border ${
              route.length >= 5 && route.length <= 15
                ? "bg-[rgba(46,125,79,0.12)] border-[var(--loci-success)] text-[var(--loci-success)]"
                : "bg-[rgba(180,105,14,0.12)] border-[var(--loci-warn)] text-[var(--loci-warn)]"
            }`}
          >
            {route.length} of 5–15 spots
          </span>
        </div>

        {/* Validation Warnings */}
        {validation.warnings.length > 0 && (
          <div className="p-3 rounded-lg border border-[var(--loci-warn)] bg-[rgba(224,164,74,0.1)] text-xs text-[var(--loci-warn)] space-y-1">
            {validation.warnings.map((w, idx) => (
              <p key={idx} className="flex items-start gap-1.5">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>{w}</span>
              </p>
            ))}
          </div>
        )}

        {/* Vertical Connected Path */}
        <div className="loci-path-container space-y-6 pt-2">
          <div className="loci-path-line" aria-hidden="true" />

          {route.map((locus, idx) => (
            <div key={locus.id} className="relative loci-card p-4 space-y-3">
              {/* Node index circle */}
              <div className="loci-node-indicator" aria-hidden="true">
                {idx + 1}
              </div>

              {/* Spot Header & Reorder controls */}
              <div className="flex items-center justify-between gap-2 border-b border-[var(--loci-border)] pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--loci-text-muted)] cursor-grab" title="Reorder spot" aria-hidden="true">
                    <GripVertical size={16} />
                  </span>
                  <span className="text-xs font-bold font-mono text-[var(--loci-accent)]">
                    Locus #{idx + 1}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="p-1 rounded text-[var(--loci-text-muted)] hover:text-[var(--loci-text)] disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={() => moveLocus(idx, idx - 1)}
                    title="Move spot up"
                    aria-label={`Move spot #${idx + 1} up`}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded text-[var(--loci-text-muted)] hover:text-[var(--loci-text)] disabled:opacity-30"
                    disabled={idx === route.length - 1}
                    onClick={() => moveLocus(idx, idx + 1)}
                    title="Move spot down"
                    aria-label={`Move spot #${idx + 1} down`}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded text-[var(--loci-danger)] hover:bg-[rgba(240,113,103,0.12)] disabled:opacity-30 ml-2"
                    disabled={route.length <= 5}
                    onClick={() => removeLocus(locus.id)}
                    title="Delete spot"
                    aria-label={`Delete spot #${idx + 1}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Locus details form. Ids are per-locus so each label is
                  programmatically associated with its own field. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label htmlFor={`spot-${locus.id}`} className="block font-medium text-[var(--loci-text)] mb-1">
                    Spot name *
                  </label>
                  <input
                    id={`spot-${locus.id}`}
                    type="text"
                    className="w-full p-2 rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] focus:outline-none focus:border-[var(--loci-focus)]"
                    placeholder="e.g. Front door, Kitchen stove"
                    value={locus.spot}
                    onChange={(e) => updateLocus(locus.id, { spot: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor={`landmark-${locus.id}`} className="font-medium text-[var(--loci-text)] mb-1 flex items-center gap-1">
                    <Landmark size={12} className="text-[var(--loci-accent)]" aria-hidden="true" />
                    <span>Distinct landmark *</span>
                  </label>
                  <input
                    id={`landmark-${locus.id}`}
                    type="text"
                    className="w-full p-2 rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] focus:outline-none focus:border-[var(--loci-focus)]"
                    placeholder="e.g. Brass knocker, Cast-iron burner"
                    value={locus.landmark}
                    onChange={(e) => updateLocus(locus.id, { landmark: e.target.value })}
                  />
                </div>
              </div>

              <div className="text-xs">
                <label htmlFor={`sense-${locus.id}`} className="font-medium text-[var(--loci-text)] mb-1 flex items-center gap-1">
                  <Sparkles size={12} className="text-[var(--loci-warn)]" aria-hidden="true" />
                  <span>Sensory detail (touch, sound, smell) — optional</span>
                </label>
                <input
                  id={`sense-${locus.id}`}
                  type="text"
                  className="w-full p-2 rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] focus:outline-none focus:border-[var(--loci-focus)]"
                  placeholder="e.g. Chilly polished metal, aroma of burnt coffee"
                  value={locus.sense || ""}
                  onChange={(e) => updateLocus(locus.id, { sense: e.target.value })}
                />
              </div>

              {/* Photo attachment (optional, stored in IndexedDB) */}
              <div className="pt-2 flex items-center justify-between text-xs text-[var(--loci-text-muted)]">
                {locus.photoId ? (
                  <span className="flex items-center gap-1.5 text-[var(--loci-accent)]">
                    <Camera size={14} aria-hidden="true" />
                    <span>Photo attached (stored locally)</span>
                    <button
                      type="button"
                      className="ml-2 text-[var(--loci-danger)] underline"
                      onClick={async () => {
                        if (locus.photoId) await deleteLociImage(locus.photoId);
                        updateLocus(locus.id, { photoId: undefined, photoAlt: undefined });
                      }}
                    >
                      Remove
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[var(--loci-text-muted)] hover:text-[var(--loci-text)]"
                    onClick={() => setActivePhotoLocusId(locus.id)}
                  >
                    <ImagePlus size={14} aria-hidden="true" />
                    <span>Attach photo of spot</span>
                  </button>
                )}

                {/* Add spot button between nodes */}
                {route.length < 15 && (
                  <button
                    type="button"
                    className="hover:text-[var(--loci-accent)] flex items-center gap-1"
                    onClick={() => addLocusAt(idx + 1)}
                  >
                    <Plus size={13} aria-hidden="true" />
                    <span>Insert spot here</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add spot to end */}
        {route.length < 15 && (
          <div className="text-center pt-3">
            <button
              type="button"
              className="loci-btn loci-btn-ghost text-xs"
              onClick={() => addLocusAt(route.length)}
            >
              <Plus size={16} aria-hidden="true" />
              <span>Add another spot (currently {route.length}/15)</span>
            </button>
          </div>
        )}
      </div>

      {/* Confirmation of route order */}
      <div className="loci-card p-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 accent-[var(--loci-accent)]"
            checked={orderConfirmed}
            onChange={(e) => setOrderConfirmed(e.target.checked)}
          />
          <span className="text-xs text-[var(--loci-text)] leading-relaxed">
            <strong>Confirm route order:</strong> I confirm this list matches the physical sequence I walk in reality,
            with no teleporting or crisscrossing.
          </span>
        </label>
      </div>

      {/* Footer controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--loci-border)]">
        <button
          type="button"
          className="loci-btn loci-btn-ghost"
          onClick={onCancel}
        >
          Cancel
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="loci-btn loci-btn-primary"
            disabled={!validation.valid || !locationConfirmed}
            onClick={() => handleSaveAttempt(true)}
          >
            <span>Confirm route & place items</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Photo upload modal with alt-text prompt */}
      {activePhotoLocusId && (
        <PhotoUploadModal
          locus={route.find((l) => l.id === activePhotoLocusId)!}
          onClose={() => setActivePhotoLocusId(null)}
          onUpload={(file, alt) => handlePhotoUpload(activePhotoLocusId, file, alt)}
        />
      )}

      {/* Re-encoding Warning Modal (Section 7) */}
      {reencodeWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reencode-modal-title">
          <div className="loci-card max-w-lg w-full space-y-4 border-[var(--loci-warn)]">
            <h3 id="reencode-modal-title" className="text-lg font-bold text-[var(--loci-warn)] flex items-center gap-2">
              <AlertTriangle size={20} aria-hidden="true" />
              <span>Spatial mapping changed</span>
            </h3>
            <p className="text-sm text-[var(--loci-text-muted)]">
              Changing the spatial order or loci breaks the brain's spatial anchor:
            </p>

            <ul className="text-xs space-y-1 list-disc pl-5 text-[var(--loci-text)]">
              {reencodeWarning.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>

            <div className="p-3 rounded bg-[var(--loci-surface-2)] border border-[var(--loci-border)] text-xs text-[var(--loci-text)]">
              <strong>{reencodeWarning.affectedItemIds.length} item{reencodeWarning.affectedItemIds.length === 1 ? "" : "s"}</strong> on affected spots
              will be reset to new review status (interval 0) and marked for re-encoding.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="loci-btn loci-btn-ghost text-xs"
                onClick={() => setReencodeWarning(null)}
              >
                Go back and cancel changes
              </button>
              <button
                type="button"
                className="loci-btn loci-btn-primary text-xs"
                onClick={() => {
                  const save = reencodeWarning.pendingSave;
                  setReencodeWarning(null);
                  save();
                }}
              >
                Confirm and reset affected items
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface PhotoUploadModalProps {
  locus: Locus;
  onClose: () => void;
  onUpload: (file: File, alt: string) => void;
}

const PhotoUploadModal: FC<PhotoUploadModalProps> = ({ locus, onClose, onUpload }) => {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [isDecorative, setIsDecorative] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    onUpload(file, isDecorative ? "decorative" : alt.trim() || `Photo of ${locus.spot}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="photo-modal-title">
      <div className="loci-card max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h3 id="photo-modal-title" className="text-md font-bold">Attach photo for "{locus.spot}"</h3>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label htmlFor="locus-photo-file" className="block font-medium mb-1">
              Select photo from device
            </label>
            <input
              id="locus-photo-file"
              type="file"
              accept="image/*"
              className="w-full text-xs"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
            <p className="text-[11px] text-[var(--loci-text-muted)] mt-1">
              Images are compressed and stored in IndexedDB on this device. Never uploaded.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--loci-border)]">
            <label htmlFor="locus-photo-alt" className="block font-medium">
              Image description (alt text)
            </label>
            <input
              id="locus-photo-alt"
              type="text"
              className="w-full p-2 rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)]"
              placeholder="Describe the landmark for screen readers"
              value={alt}
              disabled={isDecorative}
              onChange={(e) => setAlt(e.target.value)}
            />
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isDecorative}
                onChange={(e) => setIsDecorative(e.target.checked)}
              />
              <span>Mark as purely decorative</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button type="button" className="loci-btn loci-btn-ghost text-xs" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="loci-btn loci-btn-primary text-xs"
              disabled={!file || (!isDecorative && !alt.trim())}
            >
              Attach photo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
