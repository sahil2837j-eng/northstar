import { useState, type FC } from "react";
import {
  Archive,
  Brain,
  CalendarClock,
  Castle,
  Download,
  Footprints,
  MapPin,
  Package,
  Plus,
  RotateCcw,
  Route,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import type { LociState, Palace } from "../../lib/loci-types";
import { PalaceLibraryIllustration } from "../../components/loci/LociIllustrations";
import { isItemDue } from "../../lib/loci-algorithms";
import { exportLociData } from "../../lib/loci-store";

interface Props {
  state: LociState;
  onSelectPalace: (palace: Palace, view: "walk" | "recall" | "edit-route" | "place-items") => void;
  onNewPalace: () => void;
  onUpdatePalace: (palace: Palace) => void;
  onDeletePalace: (palaceId: string) => void;
  onOpenImport: () => void;
  onOpenPrecisionPresets: () => void;
  onEvolvePalace: (palace: Palace) => void;
}

export const PalaceLibrary: FC<Props> = ({
  state,
  onSelectPalace,
  onNewPalace,
  onUpdatePalace,
  onDeletePalace,
  onOpenImport,
  onOpenPrecisionPresets,
  onEvolvePalace,
}) => {
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirmPalace, setDeleteConfirmPalace] = useState<Palace | null>(null);
  const [deleteTypedName, setDeleteTypedName] = useState("");
  const [renamingPalace, setRenamingPalace] = useState<Palace | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const activePalaces = state.palaces.filter((p) => !p.archived);
  const archivedPalaces = state.palaces.filter((p) => p.archived);

  const handleExportSingle = async (palace: Palace) => {
    const singleState: LociState = {
      version: 1,
      palaces: [palace],
      sessions: state.sessions.filter((s) => s.palaceId === palace.id),
      settings: state.settings,
    };
    const jsonStr = await exportLociData(singleState, true);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loci-palace-${palace.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmPalace) return;
    if (deleteTypedName.trim().toLowerCase() === deleteConfirmPalace.name.trim().toLowerCase()) {
      onDeletePalace(deleteConfirmPalace.id);
      setDeleteConfirmPalace(null);
      setDeleteTypedName("");
    }
  };

  const handleSaveRename = () => {
    if (!renamingPalace || !renameValue.trim()) return;
    onUpdatePalace({
      ...renamingPalace,
      name: renameValue.trim(),
      updatedAt: new Date().toISOString(),
    });
    setRenamingPalace(null);
    setRenameValue("");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header section with illustration */}
      <div className="loci-card text-center py-8 relative overflow-hidden">
        <PalaceLibraryIllustration />
        <h1 className="text-2xl font-bold tracking-tight text-[var(--loci-text)] mb-2">
          Method of Loci Spatial Palaces
        </h1>
        <p className="text-sm text-[var(--loci-text-muted)] max-w-xl mx-auto mb-6">
          The route is your memory index. Place what you want to remember at familiar spots along a real path,
          then walk the path in your mind to retrieve it.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="loci-btn loci-btn-primary"
            onClick={onNewPalace}
          >
            <Plus size={18} aria-hidden="true" />
            <span>New memory palace</span>
          </button>
          <button
            type="button"
            className="loci-btn loci-btn-primary bg-[var(--loci-warn)] border-[var(--loci-warn)] text-black"
            onClick={onOpenPrecisionPresets}
            title="Deploy championship-grade calibrated palaces or custom topic synthesizer"
          >
            <Zap size={18} aria-hidden="true" />
            <span>Championship templates</span>
          </button>
          <button
            type="button"
            className="loci-btn loci-btn-ghost"
            onClick={onOpenImport}
          >
            <Upload size={18} aria-hidden="true" />
            <span>Import palace</span>
          </button>
        </div>
      </div>

      {/* Active Palaces List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Castle size={20} className="text-[var(--loci-accent)]" aria-hidden="true" />
            <span>Your palaces ({activePalaces.length})</span>
          </h2>
        </div>

        {activePalaces.length === 0 ? (
          <div className="loci-card text-center py-12">
            <p className="text-[var(--loci-text-muted)] mb-4">
              You haven't created any memory palaces yet. The Method of Loci starts with a physical route you know well.
            </p>
            <button
              type="button"
              className="loci-btn loci-btn-primary"
              onClick={onNewPalace}
            >
              <Plus size={18} aria-hidden="true" />
              <span>Create your first palace</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {activePalaces.map((palace) => {
              const dueItems = palace.items.filter((it) => isItemDue(it));
              const hasItems = palace.items.length > 0;
              const hasRoute = palace.route.length >= 5;
              const needsReencode = palace.items.some((it) => it.needsReencode);

              return (
                <div key={palace.id} className="loci-card flex flex-col justify-between hover:border-[var(--loci-accent)] transition-all">
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <h3 className="text-lg font-bold text-[var(--loci-text)]">
                          {palace.name}
                        </h3>
                        <p className="text-xs text-[var(--loci-text-muted)] flex items-center gap-1 mt-0.5">
                          <MapPin size={13} className="text-[var(--loci-accent)]" aria-hidden="true" />
                          <span>{palace.location}</span>
                        </p>
                      </div>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--loci-surface-2)] text-[var(--loci-text-muted)] border border-[var(--loci-border)]">
                        {palace.route.length} spots
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-4 text-xs text-[var(--loci-text-muted)] my-4 pt-3 border-t border-[var(--loci-border)]">
                      <span className="flex items-center gap-1.5">
                        <Package size={14} aria-hidden="true" />
                        <span>{palace.items.length} items placed</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <CalendarClock size={14} className={dueItems.length > 0 ? "text-[var(--loci-warn)] font-medium" : ""} aria-hidden="true" />
                        <span>{dueItems.length} due for recall</span>
                      </span>
                    </div>

                    {needsReencode && (
                      <div className="mb-4 p-2.5 rounded text-xs bg-[rgba(224,164,74,0.12)] border border-[var(--loci-warn)] text-[var(--loci-warn)]">
                        Spatial route changed. Re-walk the palace to re-encode items.
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-[var(--loci-border)] space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {hasItems && (
                        <button
                          type="button"
                          className="loci-btn loci-btn-primary text-xs flex-1 min-h-[38px]"
                          onClick={() => onSelectPalace(palace, "recall")}
                        >
                          <Brain size={15} aria-hidden="true" />
                          <span>Recall ({dueItems.length} due)</span>
                        </button>
                      )}

                      {hasItems && (
                        <button
                          type="button"
                          className="loci-btn text-xs min-h-[38px]"
                          onClick={() => onSelectPalace(palace, "walk")}
                          title="Walk the route in order"
                        >
                          <Footprints size={15} aria-hidden="true" />
                          <span>Walk route</span>
                        </button>
                      )}

                      {!hasItems && hasRoute && (
                        <button
                          type="button"
                          className="loci-btn loci-btn-primary text-xs flex-1 min-h-[38px]"
                          onClick={() => onSelectPalace(palace, "place-items")}
                        >
                          <Package size={15} aria-hidden="true" />
                          <span>Place items ({palace.route.length} spots ready)</span>
                        </button>
                      )}

                      {!hasRoute && (
                        <button
                          type="button"
                          className="loci-btn loci-btn-primary text-xs flex-1 min-h-[38px]"
                          onClick={() => onSelectPalace(palace, "edit-route")}
                        >
                          <Route size={15} aria-hidden="true" />
                          <span>Build route ({palace.route.length}/5 spots)</span>
                        </button>
                      )}
                    </div>

                    {/* Secondary Palace Menu */}
                    <div className="flex items-center justify-between text-xs text-[var(--loci-text-muted)] pt-1">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="hover:text-[var(--loci-accent)] underline"
                          onClick={() => onSelectPalace(palace, "edit-route")}
                        >
                          Edit route
                        </button>
                        <button
                          type="button"
                          className="hover:text-[var(--loci-accent)] underline"
                          onClick={() => onSelectPalace(palace, "place-items")}
                        >
                          Edit items
                        </button>
                        <button
                          type="button"
                          className="hover:text-[var(--loci-accent)] underline"
                          onClick={() => {
                            setRenamingPalace(palace);
                            setRenameValue(palace.name);
                          }}
                        >
                          Rename
                        </button>
                        {palace.items.length > 0 && (
                          <button
                            type="button"
                            className="text-[var(--loci-accent)] hover:underline flex items-center gap-1 font-semibold"
                            onClick={() => onEvolvePalace(palace)}
                            title="Open the Curator: Route Doctor and Cue Critic. It proposes; you commit."
                          >
                            <Sparkles size={13} aria-hidden="true" />
                            <span>Curator</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="hover:text-[var(--loci-text)] p-1 rounded"
                          onClick={() => handleExportSingle(palace)}
                          title="Export palace JSON"
                          aria-label={`Export ${palace.name}`}
                        >
                          <Download size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="hover:text-[var(--loci-text)] p-1 rounded"
                          onClick={() => onUpdatePalace({ ...palace, archived: true })}
                          title="Archive palace"
                          aria-label={`Archive ${palace.name}`}
                        >
                          <Archive size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="hover:text-[var(--loci-danger)] p-1 rounded text-[var(--loci-danger)]"
                          onClick={() => setDeleteConfirmPalace(palace)}
                          title="Delete palace"
                          aria-label={`Delete ${palace.name}`}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Archived Palaces Collapsible */}
      {archivedPalaces.length > 0 && (
        <div className="pt-6 border-t border-[var(--loci-border)]">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-semibold text-[var(--loci-text-muted)] hover:text-[var(--loci-text)] mb-3"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive size={16} aria-hidden="true" />
            <span>Archived palaces ({archivedPalaces.length})</span>
            <span className="text-xs">[{showArchived ? "Hide" : "Show"}]</span>
          </button>

          {showArchived && (
            <div className="space-y-3">
              {archivedPalaces.map((palace) => (
                <div key={palace.id} className="loci-card flex items-center justify-between p-4 text-sm opacity-80">
                  <div>
                    <strong className="block text-[var(--loci-text)]">{palace.name}</strong>
                    <span className="text-xs text-[var(--loci-text-muted)]">{palace.location} — {palace.route.length} loci</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="loci-btn text-xs min-h-[36px]"
                      onClick={() => onUpdatePalace({ ...palace, archived: false })}
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      <span>Unarchive</span>
                    </button>
                    <button
                      type="button"
                      className="loci-btn loci-btn-danger text-xs min-h-[36px]"
                      onClick={() => setDeleteConfirmPalace(palace)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rename Dialog */}
      {renamingPalace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="rename-modal-title">
          <div className="loci-card max-w-md w-full space-y-4">
            <h3 id="rename-modal-title" className="text-lg font-bold">Rename palace</h3>
            <input
              type="text"
              className="w-full p-2.5 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] focus:outline-none focus:border-[var(--loci-focus)]"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Palace name"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="loci-btn loci-btn-ghost text-xs"
                onClick={() => setRenamingPalace(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="loci-btn loci-btn-primary text-xs"
                onClick={handleSaveRename}
                disabled={!renameValue.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal with Export offer (Section 4.1) */}
      {deleteConfirmPalace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className="loci-card max-w-md w-full space-y-4 border-[var(--loci-danger)]">
            <h3 id="delete-modal-title" className="text-lg font-bold text-[var(--loci-danger)] flex items-center gap-2">
              <Trash2 size={20} aria-hidden="true" />
              <span>Delete palace</span>
            </h3>
            <p className="text-sm text-[var(--loci-text-muted)]">
              This will permanently delete <strong>"{deleteConfirmPalace.name}"</strong>, including all {deleteConfirmPalace.route.length} loci,
              placed items, and review records stored on this device.
            </p>

            <div className="p-3 rounded bg-[var(--loci-surface-2)] border border-[var(--loci-border)] text-xs space-y-2">
              <p className="font-semibold text-[var(--loci-text)]">Recommended: Download backup first</p>
              <button
                type="button"
                className="loci-btn text-xs w-full justify-center"
                onClick={() => handleExportSingle(deleteConfirmPalace)}
              >
                <Download size={14} aria-hidden="true" />
                <span>Export "{deleteConfirmPalace.name}" JSON</span>
              </button>
            </div>

            <div className="space-y-1.5 pt-2">
              <label htmlFor="delete-palace-confirm" className="text-xs text-[var(--loci-text)] block font-medium">
                Type <strong>{deleteConfirmPalace.name}</strong> to confirm deletion:
              </label>
              <input
                id="delete-palace-confirm"
                type="text"
                className="w-full p-2.5 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] text-sm focus:outline-none focus:border-[var(--loci-danger)]"
                value={deleteTypedName}
                onChange={(e) => setDeleteTypedName(e.target.value)}
                placeholder={deleteConfirmPalace.name}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="loci-btn loci-btn-ghost text-xs"
                onClick={() => {
                  setDeleteConfirmPalace(null);
                  setDeleteTypedName("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="loci-btn loci-btn-danger text-xs"
                onClick={handleConfirmDelete}
                disabled={deleteTypedName.trim().toLowerCase() !== deleteConfirmPalace.name.trim().toLowerCase()}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
